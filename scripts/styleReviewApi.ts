import { readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import { rejectReasonOf } from './betaInviteApi'
import { EMPTY_REVIEW, applyReview, isReviewFile, serializeReview, type ReviewFile, type ReviewMark } from '../src-next/styleReview'

/**
 * 스타일가이드 검토판(`/style-guide`)의 기록 읽기 · 쓰기. 개발 서버에만 붙는다(`apply: 'serve'`).
 * 기록은 `src-next/style-review.json` — 커밋한다. AI는 같은 파일을 읽고 요청을 처리한다.
 * GET은 기록과 함께 공용 단추가 어디서 쓰이는지(강조 · 크기별 파일:줄)를 코드에서 세어 돌려준다.
 * 문지기는 관리자 API와 같다(`rejectReasonOf` — 이 맥 · 전용 헤더 · 같은 출처).
 */

export const STYLE_REVIEW_API = '/api/style-review'
export const STYLE_REVIEW_FILE = 'src-next/style-review.json'
const BODY_LIMIT = 20_000

function send(response: ServerResponse, status: number, body: unknown): void {
  response.statusCode = status
  response.setHeader('content-type', 'application/json; charset=utf-8')
  response.setHeader('cache-control', 'no-store')
  response.end(JSON.stringify(body))
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  let raw = ''
  for await (const chunk of request) {
    raw += chunk
    if (raw.length > BODY_LIMIT) throw new Error('요청이 너무 큽니다.')
  }
  return JSON.parse(raw || '{}')
}

async function readReview(root: string): Promise<ReviewFile> {
  try {
    const value = JSON.parse(await readFile(path.join(root, STYLE_REVIEW_FILE), 'utf8')) as unknown
    return isReviewFile(value) ? value : EMPTY_REVIEW
  } catch { return EMPTY_REVIEW }
}

export interface ButtonUse { file: string; line: number }
export interface ButtonUsage { variant: Record<string, ButtonUse[]>; size: Record<string, ButtonUse[]> }

/** `<Button …>` 여는 태그 하나를 잘라 낸다. 속성 안 `{…}` · 따옴표 속 `>`는 건너뛴다. */
function openingTagAt(text: string, start: number): string {
  let depth = 0
  let quote: string | null = null
  for (let index = start; index < text.length; index++) {
    const char = text[index]
    if (quote) { if (char === quote) quote = null; continue }
    if (char === '"' || char === "'" || char === '`') quote = char
    else if (char === '{') depth++
    else if (char === '}') depth--
    else if (char === '>' && depth === 0) return text.slice(start, index + 1)
  }
  return text.slice(start)
}

/** 속성 값: `name="x"`면 x, `name={…}`면 안의 문자열들, 없으면 'default'. */
function propValues(tag: string, name: string): string[] {
  const literal = new RegExp(`\\b${name}="([^"]+)"`).exec(tag)
  if (literal) return [literal[1]]
  const expression = new RegExp(`\\b${name}=\\{`).exec(tag)
  if (!expression) return ['default']
  const inner = openingTagAt(`<${tag.slice(expression.index + name.length + 1)}`, 0)
  const strings = [...inner.matchAll(/'([\w-]+)'/g)].map((match) => match[1])
  return strings.length ? [...new Set(strings)] : ['default']
}

/** 제품 · 실험실 코드에서 `<Button`을 찾아 강조 · 크기별로 센다. 공용 부품 폴더와 스타일가이드 자신은 뺀다. */
export async function scanButtonUsage(root: string): Promise<ButtonUsage> {
  const usage: ButtonUsage = { variant: {}, size: {} }
  const walk = async (dir: string): Promise<string[]> => (await Promise.all((await readdir(dir, { withFileTypes: true })).map((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === 'ui' ? [] : walk(full)
    return /\.tsx$/.test(entry.name) && !/\.test\.tsx$/.test(entry.name) && !['StyleGuideLabPage.tsx', 'StyleReviewBoard.tsx'].includes(entry.name) ? [full] : []
  }))).flat()
  for (const file of await walk(path.join(root, 'src-next'))) {
    const text = await readFile(file, 'utf8')
    for (const match of text.matchAll(/<Button\b/g)) {
      const tag = openingTagAt(text, match.index)
      const use = { file: path.relative(root, file), line: text.slice(0, match.index).split('\n').length }
      for (const variant of propValues(tag, 'variant')) (usage.variant[variant] ??= []).push(use)
      for (const size of propValues(tag, 'size')) (usage.size[size] ??= []).push(use)
    }
  }
  return usage
}

export function styleReviewApiPlugin(root: string): Plugin {
  return {
    name: 'style-review-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(STYLE_REVIEW_API, async (request, response) => {
        const rejected = rejectReasonOf(request)
        if (rejected) return send(response, 403, { error: rejected })
        try {
          if (request.method === 'GET') return send(response, 200, { review: await readReview(root), usage: { button: await scanButtonUsage(root) } })
          if (request.method !== 'POST') return send(response, 405, { error: 'GET · POST만 받습니다.' })
          const { id, mark, fingerprint, note } = await readJson(request) as { id?: string; mark?: ReviewMark | null; fingerprint?: string; note?: string }
          if (!id || !/^[\w.-]+$/.test(id)) return send(response, 400, { error: '항목 번호가 없습니다.' })
          if (mark !== null && mark !== 'ok' && mark !== 'request') return send(response, 400, { error: 'mark는 ok · request · null' })
          if (mark && !fingerprint) return send(response, 400, { error: '지문이 없습니다.' })
          const next = applyReview(await readReview(root), id, mark ? { mark, fingerprint: fingerprint!, note, at: new Date().toISOString().slice(0, 10) } : null)
          await writeFile(path.join(root, STYLE_REVIEW_FILE), serializeReview(next))
          return send(response, 200, { review: next })
        } catch (error) {
          return send(response, 500, { error: error instanceof Error ? error.message : String(error) })
        }
      })
    },
  }
}
