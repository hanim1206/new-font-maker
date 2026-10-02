import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

/**
 * G0 측정 — 추출 워커 병렬 플랜(docs/plans/2026-10-02_추출-워커-병렬.md).
 *
 * 자식 프로세스(Worker 대역) N개가 글자 범위를 나눠 수집 → 변환 → CharString(운반형)까지 만들고,
 * 부모가 모아 조립한다. 직렬 추출과 시간 · 바이트(head 날짜 제외)를 비교한다. production은 안 건드린다.
 *
 *     npx vite-node scripts/font-check/parallelExportG0.ts -- --workers 1,2,4,6 [--font-data 폰트.json]
 *     (자식 모드는 부모가 띄운다: --child <시작> <끝> --out <파일>)
 */

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..', '..')

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag)
  return index >= 0 ? process.argv[index + 1] : undefined
}

const memory = new Map<string, string>()
;(globalThis as unknown as { localStorage: unknown }).localStorage = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => memory.set(key, value),
  removeItem: (key: string) => memory.delete(key),
}

const [generator, exportUtils, exportStore, deltaStore, simplify] = await Promise.all([
  import('../../src/services/fontGenerator'),
  import('../../src/services/fontExportUtils'),
  import('../../src-next/fontExportStore'),
  import('../../src-next/layoutDeltaStore'),
  import('../../src/services/contourSimplify'),
])
type PortableHangulGlyph = import('../../src/services/fontGenerator').PortableHangulGlyph

const fontDataPath = argValue('--font-data')
if (fontDataPath) {
  const raw = JSON.parse(readFileSync(path.resolve(fontDataPath), 'utf8'))
  const value = Array.isArray(raw) ? raw[0].font_data : raw.font_data ?? raw
  const { applyFontData } = await import('../../src/services/fontDataBridge')
  const applied = applyFontData(value)
  if (!applied.ok) throw new Error(`폰트 데이터 적용 실패: ${applied.error.message}`)
  deltaStore.useLayoutDeltaStore.getState().restore({ rules: applied.data.layoutDelta?.rules ?? {} })
}
const model = JSON.parse(readFileSync(path.join(ROOT, 'public', 'noto-preset', 'model.json'), 'utf8'))
const placementOf = exportStore.placementResolverOf(model, deltaStore.layoutDeltaSnapshot())
const EPS = simplify.EXPORT_SIMPLIFY_EPSILON

// ===== 자식: 범위 운반형 생산 =====

interface PortableJson {
  u: number
  c: string
  a: number
  cs: string
  ib: { y1: number; y2: number } | null
  st: { x1: number; y1: number; x2: number; y2: number } | null
  sk: boolean
  sf: boolean
}

if (process.argv.includes('--child')) {
  const childIndex = process.argv.indexOf('--child')
  const start = Number(process.argv[childIndex + 1])
  const end = Number(process.argv[childIndex + 2])
  const out = argValue('--out')
  if (!out || !Number.isFinite(start) || !Number.isFinite(end)) throw new Error('--child <시작> <끝> --out <파일>')
  const readyAt = performance.now()
  const chars = exportUtils.allExportChars().slice(start, end)
  const portables: PortableJson[] = []
  for (const char of chars) {
    const portable = generator.portableHangulGlyphOf(char, placementOf, EPS)
    if (!portable) continue
    portables.push({
      u: portable.unicode,
      c: portable.char,
      a: portable.advanceWidth,
      cs: Buffer.from(portable.charString).toString('base64'),
      ib: portable.inkBox,
      st: portable.stub,
      sk: portable.skipped,
      sf: portable.schemaFallback,
    })
  }
  await writeFile(out, JSON.stringify({ computeMs: Math.round(performance.now() - readyAt), portables }))
  process.exit(0)
}

// ===== 부모: 직렬 대조 + N분할 측정 =====

/** head의 checkSumAdjustment · created · modified(와 그 표의 디렉터리 체크섬)만 빼고 바이트 비교. */
function fontBytesEqualIgnoringDates(first: Uint8Array, second: Uint8Array): boolean {
  if (first.length !== second.length) { console.log(`길이 다름: ${first.length} vs ${second.length}`); return false }
  const view = new DataView(first.buffer, first.byteOffset)
  const numTables = view.getUint16(4)
  // head 표의 범위를 찾는다.
  let headOffset = -1
  let headLength = 0
  for (let i = 0; i < numTables; i++) {
    const entry = 12 + i * 16
    const tag = String.fromCharCode(first[entry], first[entry + 1], first[entry + 2], first[entry + 3])
    if (tag === 'head') {
      headOffset = view.getUint32(entry + 8)
      headLength = view.getUint32(entry + 12)
    }
  }
  const skip = (at: number): boolean => {
    if (headOffset < 0) return false
    // checkSumAdjustment(+8..12) · created/modified(+20..36)
    if (at >= headOffset + 8 && at < headOffset + 12) return true
    if (at >= headOffset + 20 && at < headOffset + 36) return true
    return false
  }
  // head 디렉터리 체크섬 바이트도 건너뛴다.
  const headEntryChecksum: Array<[number, number]> = []
  for (let i = 0; i < numTables; i++) {
    const entry = 12 + i * 16
    const tag = String.fromCharCode(first[entry], first[entry + 1], first[entry + 2], first[entry + 3])
    if (tag === 'head') headEntryChecksum.push([entry + 4, entry + 8])
  }
  for (let at = 0; at < first.length; at++) {
    if (skip(at)) continue
    if (headEntryChecksum.some(([from, to]) => at >= from && at < to)) continue
    if (first[at] !== second[at]) { console.log(`바이트 다름 @${at} (head ${headOffset}..${headOffset + headLength})`); return false }
  }
  return true
}

function spawnChild(start: number, end: number, out: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      path.join(ROOT, 'node_modules', 'vite-node', 'vite-node.mjs'),
      path.join(HERE, 'parallelExportG0.ts'),
      '--',
      '--child', String(start), String(end),
      '--out', out,
      ...(fontDataPath ? ['--font-data', fontDataPath] : []),
    ]
    const child = spawn(process.execPath, args, { cwd: ROOT, stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', (chunk) => { stderr += String(chunk) })
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`자식(${start}-${end}) 실패 code ${code}: ${stderr.slice(-500)}`))
    })
  })
}

const workerCounts = (argValue('--workers') ?? '1,2,4,6').split(',').map(Number)
const familyName = 'G0병렬'
const outDir = path.join(os.tmpdir(), `parallel-export-g0-${process.pid}`)
await mkdir(outDir, { recursive: true })

// 직렬 대조(지금 경로 그대로)
const serialStart = performance.now()
const serial = await generator.generateFontBuffer({ familyName, placementOf, simplifyEpsilon: EPS, revision: 1 })
if (!serial.success || !serial.bytes) throw new Error(serial.error ?? '직렬 추출 실패')
const serialSeconds = (performance.now() - serialStart) / 1000
console.log(`[직렬] ${serialSeconds.toFixed(1)}s · ${(serial.bytes.byteLength / 1_000_000).toFixed(2)} MB · 글리프 ${serial.glyphCount}`)

const totalChars = exportUtils.allExportChars().length
for (const workers of workerCounts) {
  const spawnStart = performance.now()
  const per = Math.ceil(totalChars / workers)
  const outs: string[] = []
  const jobs: Promise<void>[] = []
  for (let i = 0; i < workers; i++) {
    const start = i * per
    const end = Math.min(totalChars, start + per)
    if (start >= end) continue
    const out = path.join(outDir, `w${workers}-${i}.json`)
    outs.push(out)
    jobs.push(spawnChild(start, end, out))
  }
  await Promise.all(jobs)
  const childSeconds = (performance.now() - spawnStart) / 1000

  const assembleStart = performance.now()
  const portables: PortableHangulGlyph[] = []
  const computeMsList: number[] = []
  for (const out of outs) {
    const parsed = JSON.parse(await readFile(out, 'utf8')) as { computeMs: number; portables: PortableJson[] }
    computeMsList.push(parsed.computeMs)
    for (const p of parsed.portables) {
      portables.push({
        unicode: p.u,
        char: p.c,
        advanceWidth: p.a,
        charString: new Uint8Array(Buffer.from(p.cs, 'base64')),
        inkBox: p.ib,
        stub: p.st,
        skipped: p.sk,
        schemaFallback: p.sf,
      })
    }
  }
  const result = await generator.generateFontBuffer({ familyName, placementOf, revision: 1, hangulPortables: portables })
  if (!result.success || !result.bytes) throw new Error(result.error ?? '병렬 조립 실패')
  const assembleSeconds = (performance.now() - assembleStart) / 1000
  const total = childSeconds + assembleSeconds
  const same = fontBytesEqualIgnoringDates(new Uint8Array(serial.bytes), new Uint8Array(result.bytes))
  console.log(`[워커 ${workers}] 총 ${total.toFixed(1)}s (자식 ${childSeconds.toFixed(1)} · 조립 ${assembleSeconds.toFixed(1)}) · 자식 계산 ${computeMsList.map((ms) => (ms / 1000).toFixed(1)).join('/')}s · 바이트 ${same ? '동일' : '다름!'}`)
}
console.log(`직렬 ${serialSeconds.toFixed(1)}s 기준. 자식 띄우기 고정비 = 자식 총 − 자식 계산.`)
