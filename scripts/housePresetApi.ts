import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import { rejectReasonOf } from './betaInviteApi'
import { houseLayoutFile, isHouseLayoutModel, serializeHouseLayout } from '../src/services/houseLayoutModel'
import { FONT_PRESET_IDS, NOTO_FONT_PRESET } from '../src/types/database'

/**
 * 관리자 `프리셋` 메뉴가 하우스 레이아웃 파일을 저장한다. 개발 서버에만 붙는다(`apply: 'serve'`) — 배포본에는 쓰기가 없다.
 * 읽기는 `public/` 정적 파일 그대로다. 파일을 커밋해야 배포되고, 새 폰트가 그 버전을 받는 건 `DEFAULT_FONT_PRESET`을 바꾼 뒤다.
 * 문지기는 발급 API와 같다 — 이 맥 · 전용 헤더 · 같은 출처(`rejectReasonOf`).
 */

export const HOUSE_PRESET_API = '/api/house-preset'
const BODY_LIMIT = 200_000

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

/** 저장해도 되는 파일이면 null, 아니면 까닭. v1(노토)은 동결이라 받지 않는다. */
export function houseSaveProblemOf(value: unknown): string | null {
  if (!isHouseLayoutModel(value)) return '하우스 레이아웃 파일 형식이 아닙니다.'
  if (!(FONT_PRESET_IDS as readonly string[]).includes(value.preset)) return `모르는 프리셋입니다: ${value.preset}`
  if (value.preset === NOTO_FONT_PRESET) return 'v1(노토)은 동결이라 고치지 않습니다.'
  return null
}

export function housePresetApiPlugin(root: string): Plugin {
  return {
    name: 'house-preset-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(HOUSE_PRESET_API, async (request, response) => {
        const rejected = rejectReasonOf(request)
        if (rejected) return send(response, 403, { error: rejected })
        if (request.method !== 'POST') return send(response, 405, { error: 'POST만 받습니다.' })
        try {
          const { house } = await readJson(request) as { house?: unknown }
          const problem = houseSaveProblemOf(house)
          if (problem || !isHouseLayoutModel(house)) return send(response, 400, { error: problem ?? '형식이 다릅니다.' })
          await writeFile(path.join(root, 'public', houseLayoutFile(house.preset)), serializeHouseLayout(house))
          return send(response, 200, { preset: house.preset, updatedAt: house.updatedAt, authored: house.authored.length })
        } catch (error) {
          return send(response, 500, { error: error instanceof Error ? error.message : String(error) })
        }
      })
    },
  }
}
