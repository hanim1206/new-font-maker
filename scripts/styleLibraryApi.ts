import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import type { ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import { rejectReasonOf } from './betaInviteApi'

/**
 * 스타일가이드 라이브러리(`/style-guide`)가 부품이 어디서 쓰이는지 묻는 곳. 읽기만 한다. 개발 서버에만 붙는다(`apply: 'serve'`).
 * 공용 단추가 강조 · 크기별로 앱 화면의 어느 파일 몇째 줄에서 쓰이는지 코드에서 센다(관리자 화면은 뺀다). 화면은 파일을 화면 주소로 바꿔 보여 준다.
 * 문지기는 관리자 API와 같다(`rejectReasonOf` — 이 맥 · 전용 헤더 · 같은 출처).
 */

export const STYLE_LIBRARY_API = '/api/style-library'

function send(response: ServerResponse, status: number, body: unknown): void {
  response.statusCode = status
  response.setHeader('content-type', 'application/json; charset=utf-8')
  response.setHeader('cache-control', 'no-store')
  response.end(JSON.stringify(body))
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
    // 공용 부품 폴더와 관리자 화면은 뺀다 — 쓰는 곳은 앱 화면만 본다(10-03 사용자).
    if (entry.isDirectory()) return entry.name === 'ui' || entry.name === 'admin' ? [] : walk(full)
    return /\.tsx$/.test(entry.name) && !/\.test\.tsx$/.test(entry.name) && !['StyleGuideLabPage.tsx', 'styleLibrary.tsx'].includes(entry.name) ? [full] : []
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

export function styleLibraryApiPlugin(root: string): Plugin {
  return {
    name: 'style-library-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(STYLE_LIBRARY_API, async (request, response) => {
        const rejected = rejectReasonOf(request)
        if (rejected) return send(response, 403, { error: rejected })
        if (request.method !== 'GET') return send(response, 405, { error: 'GET만 받습니다.' })
        try {
          return send(response, 200, { button: await scanButtonUsage(root) })
        } catch (error) {
          return send(response, 500, { error: error instanceof Error ? error.message : String(error) })
        }
      })
    },
  }
}
