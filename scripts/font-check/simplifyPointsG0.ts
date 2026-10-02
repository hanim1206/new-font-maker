import { mkdir, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * G0 대표 측정 — 추출 윤곽 점 줄이기 플랜(docs/plans/2026-10-02_추출-윤곽-점-줄이기.md).
 *
 * 합친 뒤 윤곽에 Douglas-Peucker 허용오차 ε(1000단위)를 적용했을 때
 * 글자 약 20개에서 점 수 · 변환/단순화 ms · CharString 바이트 · 서브루틴 결과 · 최대 이탈 거리를 잰다.
 * production 코드는 건드리지 않는다. 겹쳐 그린 SVG를 출력 폴더에 남긴다.
 *
 *     npx vite-node scripts/font-check/simplifyPointsG0.ts [--font-data 폰트데이터.json] [--out 폴더]
 *     npx vite-node scripts/font-check/simplifyPointsG0.ts -- --full --eps 1 [--font-data …]   # 전수 추출 시간·파일 크기
 */

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..', '..')

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag)
  return index >= 0 ? process.argv[index + 1] : undefined
}

// 스토어가 브라우저 저장소를 기대한다. 메모리로 대신한다.
const memory = new Map<string, string>()
;(globalThis as unknown as { localStorage: unknown }).localStorage = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => memory.set(key, value),
  removeItem: (key: string) => memory.delete(key),
}

// 대표 글자: 플랜 G0 — 받침·기본(한 글 손 씨 체), 둥근 자모(응 홍 올 몸), 겹침 많은 글자(꿹 뷁 땅 좋 를), 섞임·세로·가로홀자(와 의 워 위 과 쉬)
const CHARS = ['한', '글', '손', '씨', '체', '응', '홍', '올', '몸', '를', '꿹', '뷁', '땅', '좋', '와', '의', '워', '위', '과', '쉬']
const EPSILONS = [0.5, 1, 2]

const [generator, exportUtils, exportStore, deltaStore, cff, subr, simplify, opentypeModule] = await Promise.all([
  import('../../src/services/fontGenerator'),
  import('../../src/services/fontExportUtils'),
  import('../../src-next/fontExportStore'),
  import('../../src-next/layoutDeltaStore'),
  import('../../src/services/cffCharStrings'),
  import('../../src/services/cffSubroutinizeRunner'),
  import('../../src/services/contourSimplify'),
  import('opentype.js'),
])
const opentype = opentypeModule.default ?? opentypeModule
type Contour = import('../../src/services/strokeToOutline').Contour

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
const outDir = path.resolve(argValue('--out') ?? path.join(ROOT, 'reference-data', 'font-check', 'simplify-g0'))

// ===== 닫힌 윤곽 Douglas-Peucker =====

interface Pt { x: number; y: number }

function perpendicularDistance(point: Pt, lineStart: Pt, lineEnd: Pt): number {
  const dx = lineEnd.x - lineStart.x
  const dy = lineEnd.y - lineStart.y
  const lineLenSq = dx * dx + dy * dy
  if (lineLenSq < 1e-10) return Math.hypot(point.x - lineStart.x, point.y - lineStart.y)
  const t = Math.max(0, Math.min(1, ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / lineLenSq))
  return Math.hypot(point.x - (lineStart.x + t * dx), point.y - (lineStart.y + t * dy))
}

// 단순화 본체는 추출 경로와 같은 모듈(contourSimplify.ts)을 쓴다 — 잰 것과 넣을 것이 같아야 한다.
const simplifyClosedContour = simplify.simplifyClosedContour

/** 원본 점들이 단순화한 다각형에서 얼마나 떨어졌는지(한 방향 최대 거리). */
function maxDeviation(original: Contour, simplified: Contour): number {
  let worst = 0
  for (const p of original) {
    let nearest = Infinity
    for (let i = 0; i < simplified.length; i++) {
      const d = perpendicularDistance(p, simplified[i], simplified[(i + 1) % simplified.length])
      if (d < nearest) nearest = d
    }
    if (nearest > worst) worst = nearest
  }
  return worst
}

// ===== 컨투어 → opentype Path (fontGenerator.contoursToPath와 같은 규칙, lineTo만 있는 윤곽 기준) =====

function contoursToPath(contours: Contour[]): InstanceType<typeof opentype.Path> {
  const pathObj = new opentype.Path()
  for (const contour of contours) {
    if (contour.length < 3) continue
    pathObj.moveTo(contour[0].x, contour[0].y)
    for (let i = 1; i < contour.length; i++) pathObj.lineTo(contour[i].x, contour[i].y)
    pathObj.close()
  }
  return pathObj
}

function charStringOf(contours: Contour[], unicode: number, advanceWidth: number): { bytes: Uint8Array; inkBox: { y1: number; y2: number } | null } {
  const glyph = new opentype.Glyph({
    name: `uni${unicode.toString(16).toUpperCase().padStart(4, '0')}`,
    unicode,
    advanceWidth,
    path: contoursToPath(contours),
  })
  const compacted = cff.compactGlyphForCff(glyph)
  return { bytes: compacted.charString, inkBox: compacted.inkBox }
}

function pointCount(contours: Contour[]): number {
  return contours.reduce((sum, c) => sum + c.length, 0)
}

function svgPathOf(contours: Contour[]): string {
  return contours
    .map((c) => `M ${c.map((p) => `${p.x.toFixed(1)} ${(-p.y).toFixed(1)}`).join(' L ')} Z`)
    .join(' ')
}

// ===== G1 홀드아웃 모드(--g1 --eps N): G0에서 안 본 글자 100자, 원본과의 최대 거리 =====

if (process.argv.includes('--g1')) {
  const eps = Number(argValue('--eps') ?? '1')
  // 시드 고정 선형 합동 난수 — 플랜 G1 "무작위, 시드 고정"
  let seed = 20261002
  const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 }
  const all = (await import('../../src/services/fontExportUtils')).allExportChars()
    .filter((c) => c.codePointAt(0)! >= 0xac00 && !CHARS.includes(c))
  const holdout: string[] = []
  const used = new Set<number>()
  while (holdout.length < 100) {
    const i = Math.floor(rand() * all.length)
    if (!used.has(i)) { used.add(i); holdout.push(all[i]) }
  }
  const signedArea = (c: Contour) => {
    let area = 0
    for (let i = 0; i < c.length; i++) { const a = c[i]; const b = c[(i + 1) % c.length]; area += a.x * b.y - b.x * a.y }
    return area / 2
  }
  // 글리프 단위 한 방향 최대 거리: from의 모든 점 → to의 모든 윤곽 선분 중 최솟값의 최댓값.
  const glyphDeviation = (from: Contour[], to: Contour[]): number => {
    let worstLocal = 0
    for (const contour of from) {
      for (const p of contour) {
        let nearest = Infinity
        for (const other of to) {
          for (let i = 0; i < other.length; i++) {
            const d = perpendicularDistance(p, other[i], other[(i + 1) % other.length])
            if (d < nearest) nearest = d
          }
        }
        if (nearest > worstLocal) worstLocal = nearest
      }
    }
    return worstLocal
  }
  let worst = 0
  let worstChar = ''
  let failures = 0
  for (const char of holdout) {
    const data = exportUtils.collectGlyphDataWithPlacement(char, placementOf)
    if (!data) { console.log(`글리프 없음: ${char}`); failures++; continue }
    // 실제 추출 경로 그대로: ε를 주면 합치기 전·후 반반으로 나눠 단순화한다.
    const original = generator.glyphDataToFontContours(data)
    const simplified = generator.glyphDataToFontContours(data, eps)
    if (simplified.length !== original.length) { console.log(`윤곽 개수 바뀜: ${char} ${original.length} → ${simplified.length}`); failures++; continue }
    const cwOf = (cs: Contour[]) => cs.filter((c) => signedArea(c) < 0).length
    if (cwOf(simplified) !== cwOf(original)) { console.log(`방향 구성 바뀜: ${char}`); failures++ }
    const d = Math.max(glyphDeviation(original, simplified), glyphDeviation(simplified, original))
    if (d > worst) { worst = d; worstChar = char }
  }
  console.log(`[G1 ε=${eps}] ${holdout.length}자 · 최대 거리 ${worst.toFixed(3)} (${worstChar}) · 방향/개수 위반 ${failures}`)
  console.log(worst <= eps && failures === 0 ? 'G1 통과 기준 충족' : 'G1 실패')
  process.exit(worst <= eps && failures === 0 ? 0 : 1)
}

// ===== 전수 추출 모드(--full --eps N): 진짜 시간과 파일 크기 =====

if (process.argv.includes('--full')) {
  const eps = Number(argValue('--eps') ?? '0')
  const started = performance.now()
  const result = await generator.generateFontBuffer({
    familyName: 'G0측정',
    placementOf,
    simplifyEpsilon: eps > 0 ? eps : undefined,
  })
  if (!result.success || !result.bytes) throw new Error(result.error ?? '추출 실패')
  console.log(`[전수 ε=${eps}] ${(result.bytes.byteLength / 1_000_000).toFixed(2)} MB · 글리프 ${result.glyphCount} · 빈 글자 ${result.skippedChars?.length ?? 0} · 총 ${((performance.now() - started) / 1000).toFixed(1)}s`)
  process.exit(0)
}

// ===== 측정 =====

interface Variant { label: string; eps: number }
const variants: Variant[] = [{ label: '원본', eps: 0 }, ...EPSILONS.map((eps) => ({ label: `ε${eps}`, eps }))]

interface Row {
  char: string
  convertMs: number
  perVariant: Array<{ label: string; points: number; simplifyMs: number; bytes: number; deviation: number; contours: number; inkBoxShift: number }>
}

await mkdir(outDir, { recursive: true })
const rows: Row[] = []
const charStringsByVariant = new Map<string, Uint8Array[]>(variants.map((v) => [v.label, []]))
const svgParts = new Map<string, string[]>()

for (const char of CHARS) {
  const data = exportUtils.collectGlyphDataWithPlacement(char, placementOf)
  if (!data) throw new Error(`글리프 데이터 없음: ${char}`)
  const t0 = performance.now()
  const original = generator.glyphDataToFontContours(data)
  const convertMs = performance.now() - t0

  const base = charStringOf(original, data.unicode, data.advanceWidth)
  const row: Row = { char, convertMs, perVariant: [] }
  for (const variant of variants) {
    let contours = original
    let simplifyMs = 0
    let deviation = 0
    if (variant.eps > 0) {
      const s0 = performance.now()
      contours = original.map((c) => simplifyClosedContour(c, variant.eps))
      simplifyMs = performance.now() - s0
      deviation = Math.max(...original.map((c, i) => maxDeviation(c, contours[i])))
    }
    const { bytes, inkBox } = variant.eps > 0 ? charStringOf(contours, data.unicode, data.advanceWidth) : base
    const inkBoxShift = base.inkBox && inkBox
      ? Math.max(Math.abs(base.inkBox.y1 - inkBox.y1), Math.abs(base.inkBox.y2 - inkBox.y2))
      : 0
    charStringsByVariant.get(variant.label)!.push(bytes)
    row.perVariant.push({ label: variant.label, points: pointCount(contours), simplifyMs, bytes: bytes.length, deviation, contours: contours.length, inkBoxShift })
    if (!svgParts.has(char)) svgParts.set(char, [])
    const colors: Record<string, string> = { 원본: '#000', 'ε0.5': '#2563eb', 'ε1': '#16a34a', 'ε2': '#dc2626' }
    svgParts.get(char)!.push(`<path d="${svgPathOf(contours)}" fill="none" stroke="${colors[variant.label]}" stroke-width="${variant.eps > 0 ? 0.8 : 1.6}" />`)
  }
  rows.push(row)
}

// 서브루틴: 변형마다 20글리프 묶음으로 전/후 바이트와 시간
const subroutineSummary: string[] = []
for (const variant of variants) {
  const list = charStringsByVariant.get(variant.label)!
  const before = list.reduce((sum, b) => sum + b.length, 0)
  const s0 = performance.now()
  const result = await subr.subroutinizeForExport(list)
  const ms = performance.now() - s0
  const after = result.charStrings.reduce((sum, b) => sum + b.length, 0) + result.globalSubrs.reduce((sum, b) => sum + b.length, 0)
  subroutineSummary.push(`${variant.label}: CharString ${before}B → 서브루틴 뒤 ${after}B · ${ms.toFixed(0)}ms`)
}

// SVG 겹쳐 그림(글자마다 하나, 원본 검정 굵게 · ε0.5 파랑 · ε1 초록 · ε2 빨강)
for (const [char, parts] of svgParts) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-50 -1000 1100 1300">\n<rect x="-50" y="-1000" width="1100" height="1300" fill="#fff"/>\n${parts.join('\n')}\n</svg>`
  await writeFile(path.join(outDir, `${char}.svg`), svg)
}

// ===== 표 출력 =====

const header = ['글자', '변환ms', ...variants.flatMap((v) => [`${v.label} 점`, `${v.label} B`, ...(v.eps > 0 ? [`${v.label} 이탈`, `${v.label} ms`] : [])])]
console.log(header.join('\t'))
for (const row of rows) {
  const cells = [row.char, row.convertMs.toFixed(0)]
  for (const v of row.perVariant) {
    cells.push(String(v.points), String(v.bytes))
    if (v.label !== '원본') cells.push(v.deviation.toFixed(2), v.simplifyMs.toFixed(1))
  }
  console.log(cells.join('\t'))
}

const totals = variants.map((variant) => {
  const points = rows.reduce((sum, r) => sum + r.perVariant.find((v) => v.label === variant.label)!.points, 0)
  const bytes = rows.reduce((sum, r) => sum + r.perVariant.find((v) => v.label === variant.label)!.bytes, 0)
  const ms = rows.reduce((sum, r) => sum + r.perVariant.find((v) => v.label === variant.label)!.simplifyMs, 0)
  const deviation = Math.max(...rows.map((r) => r.perVariant.find((v) => v.label === variant.label)!.deviation))
  const inkShift = Math.max(...rows.map((r) => r.perVariant.find((v) => v.label === variant.label)!.inkBoxShift))
  return `${variant.label}: 점 ${points} · CharString ${bytes}B · 단순화 ${ms.toFixed(1)}ms · 최대 이탈 ${deviation.toFixed(2)} · inkBox 이동 ${inkShift.toFixed(1)}`
})
console.log('\n[합계]')
for (const line of totals) console.log(line)
console.log('\n[서브루틴 20글리프]')
for (const line of subroutineSummary) console.log(line)
console.log(`\n윤곽 개수 변화 여부: ${rows.every((r) => r.perVariant.every((v) => v.contours === r.perVariant[0].contours)) ? '없음(전부 동일)' : '있음 — 확인 필요'}`)
console.log(`겹쳐 그림: ${outDir}`)
