import { readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import type { CorpusFont, CorpusStage } from '../../src-next/notoCorpus'
import { NOTO_PRESET_SCHEMA } from '../../src-next/notoPreset'
import type { NotoPresetGlyph, NotoPresetManifest } from '../../src-next/notoPreset'

/**
 * `export_noto_preset.py`가 만든 글자별 윤곽+기준선(58MB)을 글자 단위로 잘라 주는 읽기 전용 dev API.
 * 파일 전체는 서버 메모리에 한 번만 올리고, 클라이언트는 필요한 글자만 받아 IndexedDB에 둔다.
 */

export { NOTO_PRESET_SCHEMA }
const API = '/api/noto-preset'
const FILE = `${NOTO_PRESET_SCHEMA}.json`

interface ExportFile {
  schema: string
  font: CorpusFont
  stageKeys: Record<CorpusStage, string>
  coordinateFrame: string
  glyphCount: number
  glyphs: NotoPresetGlyph[]
}

interface Loaded { manifest: NotoPresetManifest; glyphs: Map<number, NotoPresetGlyph> }

export function createNotoPresetReader(directory: string) {
  let memo: { fingerprint: string; loaded: Loaded } | undefined

  async function locate(): Promise<{ file: string; runId: string; time: number }> {
    const entries = (await readdir(directory, { withFileTypes: true })).filter((entry) => entry.isDirectory() && /^[a-f0-9]{24}$/.test(entry.name))
    const candidates = await Promise.all(entries.map(async (entry) => {
      const file = path.join(directory, entry.name, 'analysis', FILE)
      try { return { file, runId: entry.name, time: (await stat(file)).mtimeMs } } catch { return null }
    }))
    const newest = candidates.filter((value) => value !== null).sort((a, b) => b.time - a.time)[0]
    if (!newest) throw new Error('Noto 프리셋 export가 없습니다. python3 scripts/reference-lab/export_noto_preset.py 를 실행하세요.')
    return newest
  }

  async function load(): Promise<Loaded> {
    const source = await locate()
    const fingerprint = `${source.file}:${source.time}`
    if (memo?.fingerprint === fingerprint) return memo.loaded
    const parsed = JSON.parse(await readFile(source.file, 'utf8')) as ExportFile
    if (parsed.schema !== NOTO_PRESET_SCHEMA || !Array.isArray(parsed.glyphs)) throw new Error('Noto 프리셋 export 형식이 다릅니다.')
    const glyphs = new Map<number, NotoPresetGlyph>()
    for (const glyph of parsed.glyphs) {
      const codepoint = glyph?.identity?.codepoint
      if (!Number.isInteger(codepoint) || !glyph.outline || typeof glyph.baselines !== 'object') throw new Error('Noto 프리셋 글자 항목이 손상되었습니다.')
      glyphs.set(codepoint, glyph)
    }
    const manifest: NotoPresetManifest = {
      schema: NOTO_PRESET_SCHEMA, font: parsed.font, stageKeys: parsed.stageKeys, coordinateFrame: parsed.coordinateFrame,
      glyphCount: glyphs.size, runId: source.runId, updatedAt: new Date(source.time).toISOString(),
    }
    const loaded = { manifest, glyphs }
    memo = { fingerprint, loaded }
    return loaded
  }

  return {
    manifest: async () => (await load()).manifest,
    glyph: async (codepoint: number): Promise<NotoPresetGlyph | null> => (await load()).glyphs.get(codepoint) ?? null,
  }
}

export function notoPresetApiPlugin(directory: string): Plugin {
  const reader = createNotoPresetReader(directory)
  const middleware = (request: IncomingMessage, response: ServerResponse, next: () => void) => {
    const url = new URL(request.url ?? '/', 'http://localhost')
    if (url.pathname !== API && !url.pathname.startsWith(API + '/')) return next()
    response.setHeader('Content-Type', 'application/json; charset=utf-8')
    const send = (status: number, value: unknown) => { response.statusCode = status; response.end(JSON.stringify(value)) }
    if (request.method !== 'GET') return send(405, { error: '읽기 전용 API입니다.' })
    const match = /^\/api\/noto-preset\/glyph\/(\d+)$/.exec(url.pathname)
    if (url.pathname !== API && !match) return send(404, { error: '없는 프리셋 경로입니다.' })
    void (async () => {
      try {
        if (!match) {
          response.setHeader('Cache-Control', 'no-store')
          return send(200, await reader.manifest())
        }
        const glyph = await reader.glyph(Number(match[1]))
        if (!glyph) return send(404, { error: '이 글자의 Noto 윤곽이 없습니다.' })
        // 글자 응답은 stageKeys가 바뀌면 URL이 아니라 클라이언트 캐시 키가 바뀌므로 짧게만 캐시한다.
        response.setHeader('Cache-Control', 'private, max-age=60')
        send(200, glyph)
      } catch (error) { send(503, { error: error instanceof Error ? error.message : '프리셋 읽기 실패' }) }
    })()
  }
  return { name: 'noto-preset-read-only-api', configureServer(server) { server.middlewares.use(middleware) }, configurePreviewServer(server) { server.middlewares.use(middleware) } }
}
