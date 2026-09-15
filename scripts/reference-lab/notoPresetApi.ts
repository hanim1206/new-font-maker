import { readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import type { CorpusFont, CorpusStage } from '../../src-next/notoCorpus'
import { NOTO_PRESET_MODEL_SCHEMA, NOTO_PRESET_SCHEMA } from '../../src-next/notoPreset'
import type { NotoPresetGlyph, NotoPresetManifest, NotoPresetModelBundle } from '../../src-next/notoPreset'
import { CORPUS_MEDIALS } from '../../src-next/notoCorpus'

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
      modelKey: await modelKeyOf(path.dirname(path.dirname(source.file))),
    }
    const loaded = { manifest, glyphs }
    memo = { fingerprint, loaded }
    return loaded
  }

  // 모델 묶음: 변화량 모델(v2 우선)에서 예측 필드만 추리고, 두께 파일에서 홀자·역할별 중앙값을 낸다.
  let modelMemo: { key: string; bundle: NotoPresetModelBundle } | undefined
  async function model(): Promise<NotoPresetModelBundle> {
    const source = await locate()
    const root = path.dirname(path.dirname(source.file))
    const files = ['variation-model-v2.json', 'variation-model-v1.json'].map((name) => path.join(root, 'analysis', name))
    const thicknessFile = path.join(root, 'attributes', 'role-thickness-v1.json')
    const mtimes = await Promise.all([...files, thicknessFile].map((file) => stat(file).then((info) => info.mtimeMs).catch(() => 0)))
    const key = `${root}:${mtimes.join(':')}`
    if (modelMemo?.key === key) return modelMemo.bundle
    let raw: { schema: string; stageKeys: Record<string, string>; targets: Record<string, { layers: Record<string, Record<string, unknown>> }> } | null = null
    for (const file of files) {
      try { raw = JSON.parse(await readFile(file, 'utf8')); break } catch { /* 다음 버전 */ }
    }
    if (!raw) throw new Error('변화량 모델이 없습니다. python3 scripts/reference-lab/build_variation_model.py --model-version v2 를 실행하세요.')
    const { manifest } = await load()
    if (!CORPUS_STAGES_MATCH(raw.stageKeys, manifest.stageKeys)) throw new Error('변화량 모델과 프리셋 export의 추출 버전이 다릅니다.')
    const targets: NotoPresetModelBundle['model']['targets'] = {}
    for (const [target, value] of Object.entries(raw.targets)) {
      targets[target] = { layers: Object.fromEntries(Object.entries(value.layers).map(([layer, entry]) => [layer, {
        representative: entry.representative as number,
        effects: entry.effects as NotoPresetModelBundle['model']['targets'][string]['layers'][string]['effects'],
        defaultThreshold: entry.defaultThreshold as number,
        confidence: entry.confidence as 'low' | 'normal',
        ...(entry.interaction ? { interaction: entry.interaction as NonNullable<NotoPresetModelBundle['model']['targets'][string]['layers'][string]['interaction']> } : {}),
      }])) }
    }
    const thickness: Record<string, Record<string, number>> = {}
    try {
      const file = JSON.parse(await readFile(thicknessFile, 'utf8')) as { characters: Record<string, { medialRoles?: Record<string, { thickness: number | null }> }> }
      const samples: Record<string, Record<string, number[]>> = {}
      for (const [character, entry] of Object.entries(file.characters)) {
        const offset = (character.codePointAt(0) ?? 0) - 0xac00
        if (offset < 0 || offset >= 11172) continue
        const medial = CORPUS_MEDIALS[Math.floor((offset % 588) / 28)]
        for (const [roleId, role] of Object.entries(entry.medialRoles ?? {})) if (role.thickness !== null) ((samples[medial] ??= {})[roleId] ??= []).push(role.thickness)
      }
      for (const [medial, roles] of Object.entries(samples)) thickness[medial] = Object.fromEntries(Object.entries(roles).map(([roleId, values]) => { const sorted = [...values].sort((a, b) => a - b); return [roleId, sorted[Math.floor(sorted.length / 2)] / 1000] }))
    } catch { throw new Error('역할 두께 파일이 없습니다. python3 scripts/reference-lab/measure_role_attributes.py 를 실행하세요.') }
    const bundle: NotoPresetModelBundle = { schema: NOTO_PRESET_MODEL_SCHEMA, stageKeys: manifest.stageKeys, model: { schema: raw.schema, stageKeys: raw.stageKeys, targets }, thickness }
    modelMemo = { key, bundle }
    return bundle
  }

  return {
    manifest: async () => (await load()).manifest,
    glyph: async (codepoint: number): Promise<NotoPresetGlyph | null> => (await load()).glyphs.get(codepoint) ?? null,
    model,
  }
}

/** 모델·두께 파일의 mtime 묶음. 모델을 다시 빌드하면 바뀌어 클라이언트 캐시 키가 달라진다. */
async function modelKeyOf(root: string): Promise<string> {
  const files = ['analysis/variation-model-v2.json', 'analysis/variation-model-v1.json', 'attributes/role-thickness-v1.json'].map((name) => path.join(root, name))
  const mtimes = await Promise.all(files.map((file) => stat(file).then((info) => Math.round(info.mtimeMs)).catch(() => 0)))
  return mtimes.join('-')
}

function CORPUS_STAGES_MATCH(a: Record<string, string>, b: Record<string, string>): boolean {
  return ['outline', 'initial', 'medial', 'final'].every((stage) => a[stage] === b[stage])
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
    const wantsModel = url.pathname === `${API}/model`
    if (url.pathname !== API && !match && !wantsModel) return send(404, { error: '없는 프리셋 경로입니다.' })
    void (async () => {
      try {
        if (wantsModel) {
          response.setHeader('Cache-Control', 'private, max-age=60')
          return send(200, await reader.model())
        }
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
