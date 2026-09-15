import { readFile, readdir, realpath, stat } from 'node:fs/promises'
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import { CORPUS_STAGES, corpusIdentity, emptyCorpusRow } from '../../src-next/notoCorpus'
import type { CorpusDetail, CorpusFont, CorpusIdentity, CorpusModelPrediction, CorpusPayload, CorpusRow, CorpusSnapshot, CorpusStage } from '../../src-next/notoCorpus'

interface Manifest { schema: string; font: CorpusFont; stageKeys: Record<CorpusStage, string> }
interface ReportRow extends CorpusRow { stages: Record<CorpusStage, CorpusRow['stages'][CorpusStage] & { artifact: string }> }
interface Report { stageKeys: Record<CorpusStage, string>; font: CorpusFont; cases: ReportRow[]; medialVariationFromGiyeok?: { character: string; baselineCharacter: string; roleId: string }[] }
interface VariationLayer { representative: number; effects: Record<'initial' | 'medial' | 'final', Record<string, number>>; defaultThreshold: number; confidence: 'low' | 'normal' }
interface VariationModel { schema: string; stageKeys: Record<CorpusStage, string>; targets: Record<string, { layers: Record<string, VariationLayer> }> }
interface Loaded { root: string; manifest: Manifest; snapshot: CorpusSnapshot; rows: Map<number, ReportRow> }
const API = '/api/noto-corpus'
const HEX = /^[a-f0-9]{64}$/
const NOTO_SHA = '194018e6b2b293a7964f037b25c0249ce1418bc9ab3c971060a03aa57861e252'
const APPROVED_INPUTS_FILE = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../reference-data/preset-candidates/noto-approved-guide-inputs.v1.json')
// 변화량 모델 v1이 예측하는 역할면 타깃. 값 소스는 각 타깃이 어느 단계 측정에서 실측을 읽는지 알려준다.
const MODEL_NO_FINAL = '∅'
const MODELED_TARGETS: { target: string; stage: CorpusStage; read: (measurements: Record<string, unknown>) => number | null }[] = [
  { target: 'initial.roleFaces.bottom', stage: 'initial', read: (m) => {
    const bottom = (m.roleFaces as Record<string, number> | undefined)?.bottom
    return typeof bottom === 'number' && Number.isFinite(bottom) ? bottom : null
  } },
]

function predictTarget(model: VariationModel, identity: CorpusIdentity, stages: CorpusDetail['stages']): CorpusModelPrediction[] {
  const predictions: CorpusModelPrediction[] = []
  for (const { target, stage, read } of MODELED_TARGETS) {
    const layer = model.targets[target]?.layers[identity.contextId]
    const payload = stages[stage]
    if (!layer || !payload || payload.status !== 'candidate') continue
    const actualNormalized = read(payload.measurements)
    if (actualNormalized === null) continue
    const effects = {
      initial: layer.effects.initial[identity.initialJamo] ?? 0,
      medial: layer.effects.medial[identity.medialJamo] ?? 0,
      final: layer.effects.final[identity.finalJamo ?? MODEL_NO_FINAL] ?? 0,
    }
    const predicted = layer.representative + effects.initial + effects.medial + effects.final
    const actual = actualNormalized * 1000
    const residual = actual - predicted
    predictions.push({
      target, layer: identity.contextId, representative: layer.representative,
      predicted, actual, residual, threshold: layer.defaultThreshold,
      exception: Math.abs(residual) > layer.defaultThreshold, confidence: layer.confidence, effects,
    })
  }
  return predictions
}

async function readApprovedInputCount(): Promise<number | null> {
  try {
    const artifact = JSON.parse(await readFile(APPROVED_INPUTS_FILE, 'utf8')) as { inputApproved?: boolean; caseCount?: number; cases?: unknown[] }
    if (artifact.inputApproved !== true || !Array.isArray(artifact.cases) || artifact.caseCount !== artifact.cases.length) return null
    return artifact.cases.length
  } catch { return null }
}

export function createNotoCorpusReader(directory: string) {
  let memo: { fingerprint: string; loaded: Loaded } | undefined
  async function json<T>(file: string): Promise<T> { return JSON.parse(await readFile(file, 'utf8')) as T }
  async function load(): Promise<Loaded> {
    const directories = (await readdir(directory, { withFileTypes: true })).filter((entry) => entry.isDirectory() && /^[a-f0-9]{24}$/.test(entry.name))
    const sources = await Promise.all(directories.map(async (entry) => {
      const root = path.join(directory, entry.name)
      try {
        const manifest = await json<Manifest>(path.join(root, 'manifest.json'))
        if (manifest.schema !== 'noto-guide-corpus-v1' || manifest.font?.fileSha256 !== NOTO_SHA || !CORPUS_STAGES.every((stage) => HEX.test(manifest.stageKeys?.[stage] ?? ''))) return null
        return { root, manifest, time: (await stat(path.join(root, 'manifest.json'))).mtimeMs }
      } catch { return null }
    }))
    const source = sources.filter((value) => value !== null).sort((a, b) => b.time - a.time)[0]
    if (!source) throw new Error('Noto corpus가 없습니다. yarn reference:noto --scope no-final 을 실행하세요.')
    const reportDirectory = path.join(source.root, 'reports')
    const names = (await readdir(reportDirectory)).filter((name) => /^[a-z0-9-]+\.json$/.test(name))
    const files = await Promise.all(names.map(async (name) => ({ file: path.join(reportDirectory, name), time: (await stat(path.join(reportDirectory, name))).mtimeMs })))
    files.sort((a, b) => a.time - b.time)
    const fingerprint = JSON.stringify([source.root, source.time, files])
    if (memo?.fingerprint === fingerprint) return memo.loaded
    const rows = new Map<number, ReportRow>()
    const warnings: string[] = []
    const deltas = new Set<string>()
    for (const file of files) {
      try {
        const report = await json<Report>(file.file)
        if (report.font.fileSha256 !== source.manifest.font.fileSha256 || !CORPUS_STAGES.every((stage) => report.stageKeys[stage] === source.manifest.stageKeys[stage])) {
          warnings.push(`${path.basename(file.file)}: 이전 추출 버전, 집계에서 제외`)
          continue
        }
        for (const row of report.cases) {
          const identity = corpusIdentity(row.identity.codepoint)
          if (identity.character !== row.identity.character || identity.initialJamo !== row.identity.initialJamo || identity.medialJamo !== row.identity.medialJamo || identity.finalJamo !== row.identity.finalJamo) throw new Error('보고서 글자 identity 불일치')
          rows.set(identity.codepoint, row)
        }
        for (const item of report.medialVariationFromGiyeok ?? []) deltas.add(`${item.character}:${item.baselineCharacter}:${item.roleId}`)
      } catch { warnings.push(`${path.basename(file.file)}: 보고서 읽기 실패`) }
    }
    const snapshot: CorpusSnapshot = {
      schema: 'noto-corpus-dashboard-v1', runId: path.basename(source.root), font: source.manifest.font,
      updatedAt: new Date(Math.max(source.time, ...files.map((file) => file.time))).toISOString(), warnings, deltaCount: deltas.size,
      approvedInputCount: await readApprovedInputCount(),
      rows: [...rows.values()].map((row) => ({ identity: row.identity, stages: Object.fromEntries(CORPUS_STAGES.map((stage) => {
        const value = row.stages[stage]
        const hash = value.payloadSha256
        return [stage, { status: value.status, reasonCodes: value.reasonCodes, payloadSha256: hash, reviewKey: hash && HEX.test(hash) ? `${stage}:${source.manifest.stageKeys[stage]}:${row.identity.codepoint}:${hash}` : undefined }]
      })) as CorpusRow['stages'] })),
    }
    const loaded = { root: source.root, manifest: source.manifest, snapshot, rows }
    memo = { fingerprint, loaded }
    return loaded
  }

  // 3MB 모델은 스냅샷 hot path에서 빼고 글자 상세에서만 지연 로드·메모이즈한다.
  let modelMemo: { key: string; model: VariationModel | null } | undefined
  async function loadModel(loaded: Loaded): Promise<VariationModel | null> {
    const file = path.join(loaded.root, 'analysis', 'variation-model-v1.json')
    const key = `${loaded.root}:${await stat(file).then((info) => info.mtimeMs).catch(() => 0)}`
    if (modelMemo?.key === key) return modelMemo.model
    let model: VariationModel | null = null
    try {
      const candidate = await json<VariationModel>(file)
      // 추출 단계 키가 다르면 모델이 이전 관측 기준이므로 예측을 붙이지 않는다.
      if (candidate.schema === 'noto-variation-model-v1' && CORPUS_STAGES.every((stage) => candidate.stageKeys[stage] === loaded.manifest.stageKeys[stage])) model = candidate
    } catch { /* 모델 파일이 없으면 예측 없이 검수만 한다. */ }
    modelMemo = { key, model }
    return model
  }

  async function detail(codepoint: number): Promise<CorpusDetail> {
    const identity = corpusIdentity(codepoint)
    const loaded = await load()
    const row = loaded.snapshot.rows.find((value) => value.identity.codepoint === codepoint) ?? emptyCorpusRow(codepoint)
    const original = loaded.rows.get(codepoint)
    const stages = Object.fromEntries(CORPUS_STAGES.map((stage) => [stage, null])) as CorpusDetail['stages']
    if (original) {
      const realRoot = await realpath(loaded.root)
      await Promise.all(CORPUS_STAGES.map(async (stage) => {
        const artifact = original.stages[stage].artifact
        const expected = `cache/${stage}/${loaded.manifest.stageKeys[stage]}/${codepoint.toString(16).toUpperCase()}.json`
        if (artifact !== expected) throw new Error('허용되지 않은 관측 경로입니다.')
        const file = await realpath(path.join(loaded.root, artifact))
        if (!file.startsWith(realRoot + path.sep)) throw new Error('corpus 바깥 파일은 읽을 수 없습니다.')
        const record = await json<{ schema: string; stage: string; stageKey: string; identity: { codepoint: number; character: string }; payloadSha256: string; payload: CorpusPayload }>(file)
        if (record.schema !== 'noto-guide-stage-v1' || record.stage !== stage || record.stageKey !== loaded.manifest.stageKeys[stage] || record.identity.codepoint !== codepoint || record.identity.character !== identity.character || (original.stages[stage].payloadSha256 && record.payloadSha256 !== original.stages[stage].payloadSha256)) throw new Error('관측과 집계 버전이 다릅니다. 배치 종료 후 다시 읽으세요.')
        stages[stage] = record.payload
      }))
    }
    const variationModel = await loadModel(loaded)
    const model = variationModel ? predictTarget(variationModel, identity, stages) : []
    return { schema: 'noto-corpus-detail-v1', identity, font: loaded.manifest.font, row, stages, model }
  }
  return { snapshot: async () => (await load()).snapshot, detail }
}

export function notoCorpusApiPlugin(directory: string): Plugin {
  const reader = createNotoCorpusReader(directory)
  const middleware = (request: IncomingMessage, response: ServerResponse, next: () => void) => {
    const url = new URL(request.url ?? '/', 'http://localhost')
    if (url.pathname !== API && !url.pathname.startsWith(API + '/')) return next()
    response.setHeader('Cache-Control', 'no-store')
    response.setHeader('Content-Type', 'application/json; charset=utf-8')
    const send = (status: number, value: unknown) => { response.statusCode = status; response.end(JSON.stringify(value)) }
    if (request.method !== 'GET') return send(405, { error: '읽기 전용 API입니다.' })
    const match = /^\/api\/noto-corpus\/glyph\/(\d+)$/.exec(url.pathname)
    if (url.pathname !== API && !match) return send(404, { error: '없는 corpus 경로입니다.' })
    void (async () => {
      try { send(200, match ? await reader.detail(Number(match[1])) : await reader.snapshot()) }
      catch (error) { send(503, { error: error instanceof Error ? error.message : 'corpus 읽기 실패' }) }
    })()
  }
  return { name: 'noto-corpus-read-only-api', configureServer(server) { server.middlewares.use(middleware) }, configurePreviewServer(server) { server.middlewares.use(middleware) } }
}
