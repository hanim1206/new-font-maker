/* eslint-disable */
/**
 * 배치 규칙 표를 공식으로 — 가늠 측정. 자모 표 값(layoutRuleTargets.ts)이 자모 생김새 특징 몇 개로 설명되는지, 자모 하나를 빼고 나머지로 맞혀 본다(LOO).
 * 특징은 baseJamos 획을 64칸 격자에 그려서 띠(위 · 아래 · 왼 · 오른 16%)마다 잉크가 있는 줄 비율 등으로 뽑는다.
 *
 *   npx esbuild scripts/layout-rules/measure-shape-fit.ts --bundle --platform=node --format=esm --loader:.json=json \
 *     --define:import.meta.env.DEV=false --define:import.meta.env.BASE_URL='"/"' --outfile=/tmp/sf.mjs && node /tmp/sf.mjs
 */
import baseJamos from '../../src/data/baseJamos.json'
import { CHO_TARGET, JONG_TARGET, CHO_GAP, JONG_GAP_OFFSET, BRANCH_INSET_BY_CHO, JONG_TOP_BY_CHO, CHO_TOP_BY_JONG } from '../../src/services/layoutRuleTargets'
const maps = baseJamos as any
const N = 64
type Pt = { x: number; y: number; handleIn?: Pt; handleOut?: Pt }
function raster(strokes: any[]): Uint8Array {
  const g = new Uint8Array(N * N)
  const paint = (x: number, y: number, r: number) => { const R = Math.ceil(r * N); const cx = Math.round(x * N), cy = Math.round(y * N); for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) { const px = cx + i, py = cy + j; if (px < 0 || py < 0 || px >= N || py >= N) continue; if ((i * i + j * j) <= R * R) g[py * N + px] = 1 } }
  for (const s of strokes) { const pts: Pt[] = s.points; const r = (s.thickness ?? 0.07) / 2; const n = pts.length
    for (let k = 0; k < (s.closed ? n : n - 1); k++) { const a = pts[k], b = pts[(k + 1) % n]; const c1 = a.handleOut ?? a, c2 = b.handleIn ?? b
      for (let t = 0; t <= 1; t += 0.02) { const u = 1 - t; const x = u*u*u*a.x + 3*u*u*t*c1.x + 3*u*t*t*c2.x + t*t*t*b.x; const y = u*u*u*a.y + 3*u*u*t*c1.y + 3*u*t*t*c2.y + t*t*t*b.y; paint(x, y, r) } } }
  return g
}
const DOUBLE = new Set(['ㄲ', 'ㄸ', 'ㅃ', 'ㅆ', 'ㅉ'])
function features(char: string, strokes: any[]) {
  const g = raster(strokes); const at = (x: number, y: number) => g[Math.min(N - 1, Math.floor(y * N)) * N + Math.min(N - 1, Math.floor(x * N))]
  const band = 0.16
  const rowsWith = (x0: number, x1: number) => { let c = 0; for (let y = 0; y < 1; y += 1 / N) { let hit = 0; for (let x = x0; x < x1; x += 1 / N) hit |= at(x, y); c += hit } return c / N }
  const colsWith = (y0: number, y1: number) => { let c = 0; for (let x = 0; x < 1; x += 1 / N) { let hit = 0; for (let y = y0; y < y1; y += 1 / N) hit |= at(x, y); c += hit } return c / N }
  let area = 0, cy = 0, cx = 0; for (let i = 0; i < N * N; i++) if (g[i]) { area++; cy += Math.floor(i / N); cx += i % N }
  // 윗띠 잉크 폭: 꼭지(ㅊ ㅎ)면 좁다
  const topWidth = colsWith(0, band)
  const secondWidth = colsWith(band, band * 2)
  // 오른띠 잉크가 아래 1/3에만 있나(ㄴ처럼 바닥 가로줄기만 기둥 쪽으로 닿는 꼴)
  const rightRows = (y0: number, y1: number) => { let c = 0, n = 0; for (let y = y0; y < y1; y += 1 / N) { let hit = 0; for (let x = 1 - band; x < 1; x += 1 / N) hit |= at(x, y); c += hit; n++ } return c / n }
  const rightLow = rightRows(0.66, 1), rightHigh = rightRows(0, 0.66)
  // 아래띠 가운데가 비었나(ㅅ ㅈ ㅊ 다리)
  let midBottom = 0; for (let x = 0.4; x < 0.6; x += 1 / N) { let hit = 0; for (let y = 1 - band; y < 1; y += 1 / N) hit |= at(x, y); midBottom += hit } midBottom /= (0.2 * N)
  return {
    double: DOUBLE.has(char) ? 1 : 0,
    topDot: topWidth < 0.35 && secondWidth > 0.7 ? 1 : 0,
    rightLowOnly: rightLow > 0.3 && rightHigh < 0.15 ? 1 : 0,
    rightOpen: 1 - rightHigh,
    topFlat: topWidth,
    bottomFlat: colsWith(1 - band, 1),
    rightClosed: rowsWith(1 - band, 1),
    leftClosed: rowsWith(0, band),
    ring: strokes.some((s: any) => s.closed) ? 1 : 0,
    legs: 1 - midBottom,
    area: area / (N * N),
    centerY: cy / area / N,
    centerX: cx / area / N,
  }
}
type F = ReturnType<typeof features>
const KEYS = Object.keys(features('ㄱ', maps.choseong['ㄱ'].strokes)) as (keyof F)[]
// 최소제곱(릿지 아주 약하게). X: n×p (상수항 포함)
function solve(X: number[][], y: number[], lambda = 1e-4): number[] {
  const p = X[0].length; const A = Array.from({ length: p }, () => new Array(p).fill(0)); const b = new Array(p).fill(0)
  for (let i = 0; i < X.length; i++) for (let a = 0; a < p; a++) { b[a] += X[i][a] * y[i]; for (let c = 0; c < p; c++) A[a][c] += X[i][a] * X[i][c] }
  for (let a = 1; a < p; a++) A[a][a] += lambda
  // 가우스 소거
  for (let c = 0; c < p; c++) { let piv = c; for (let r = c + 1; r < p; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r; [A[c], A[piv]] = [A[piv], A[c]]; [b[c], b[piv]] = [b[piv], b[c]]; if (Math.abs(A[c][c]) < 1e-12) continue
    for (let r = 0; r < p; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let k = c; k < p; k++) A[r][k] -= f * A[c][k]; b[r] -= f * b[c] } }
  return b.map((v, i) => Math.abs(A[i][i]) < 1e-12 ? 0 : v / A[i][i])
}
function loo(rows: { f: F; y: number }[], keys: (keyof F)[]) {
  const errs: number[] = []
  for (let i = 0; i < rows.length; i++) { const train = rows.filter((_, j) => j !== i); const X = train.map((r) => [1, ...keys.map((k) => r.f[k])]); const w = solve(X, train.map((r) => r.y)); const x = [1, ...keys.map((k) => rows[i].f[k])]; errs.push(Math.abs(x.reduce((s, v, j) => s + v * w[j], 0) - rows[i].y)) }
  errs.sort((a, b) => a - b); return { med: errs[errs.length >> 1], max: errs[errs.length - 1], mean: errs.reduce((a, b) => a + b, 0) / errs.length }
}
function greedy(rows: { f: F; y: number }[], max = 3) {
  const chosen: (keyof F)[] = []; const out: { keys: (keyof F)[]; err: ReturnType<typeof loo> }[] = [{ keys: [], err: loo(rows, []) }]
  for (let step = 0; step < max; step++) { let best: { k: keyof F; err: ReturnType<typeof loo> } | null = null
    for (const k of KEYS) if (!chosen.includes(k)) { const err = loo(rows, [...chosen, k]); if (!best || err.mean < best.err.mean) best = { k, err } }
    if (!best) break; chosen.push(best.k); out.push({ keys: [...chosen], err: best.err }) }
  return out
}
const report = (name: string, table: Record<string, number>, part: 'choseong' | 'jongseong', tol: number) => {
  const rows = Object.entries(table).filter(([k]) => maps[part][k]).map(([k, y]) => ({ k, f: features(k, maps[part][k].strokes), y }))
  const ys = rows.map((r) => r.y); const mean = ys.reduce((a, b) => a + b, 0) / ys.length; const sd = Math.sqrt(ys.reduce((a, b) => a + (b - mean) ** 2, 0) / ys.length)
  const steps = greedy(rows)
  const within = (keys: (keyof F)[]) => { let c = 0; for (let i = 0; i < rows.length; i++) { const train = rows.filter((_, j) => j !== i); const w = solve(train.map((r) => [1, ...keys.map((k) => r.f[k])]), train.map((r) => r.y)); const x = [1, ...keys.map((k) => rows[i].f[k])]; if (Math.abs(x.reduce((s, v, j) => s + v * w[j], 0) - rows[i].y) <= tol) c++ } return c }
  console.log(`\n${name} (${rows.length}자, 퍼짐 sd ${sd.toFixed(3)}, 범위 ${Math.min(...ys).toFixed(3)}~${Math.max(...ys).toFixed(3)}, 허용 ±${tol})`)
  for (const s of steps) console.log(`  ${s.keys.length ? s.keys.join('+') : '상수만'}`.padEnd(40), `LOO 가운데 ${s.err.med.toFixed(3)} 최대 ${s.err.max.toFixed(3)}`, `허용 안 ${within(s.keys)}/${rows.length}`)
}
const col = (t: Record<string, any>, c: string) => Object.fromEntries(Object.entries(t).map(([k, v]) => [k, v[c]]))
const T = 0.07 * 0.84 // 두께 배수 표의 허용: 0.02 em ≈ 0.34 두께(두께 ≈ 0.059 em)
report('첫닿자 오른면', col(CHO_TARGET, 'right'), 'choseong', 0.02)
report('첫닿자 왼면', col(CHO_TARGET, 'left'), 'choseong', 0.02)
report('첫닿자 윗면', col(CHO_TARGET, 'top'), 'choseong', 0.02)
report('첫닿자 두 기둥 옆 폭 비율', col(CHO_TARGET, 'twoStemScale'), 'choseong', 0.03)
report('첫닿자 아래(받침 없음)', col(CHO_TARGET, 'bottomNoFinal'), 'choseong', 0.02)
report('첫닿자 아래 틈(두께 배수)', CHO_GAP, 'choseong', 0.34)
report('왼가지 파고듦(첫닿자별)', BRANCH_INSET_BY_CHO, 'choseong', 0.02)
report('받침 윗면 치우침(첫닿자별)', JONG_TOP_BY_CHO, 'choseong', 0.01)
report('받침 왼면', col(JONG_TARGET, 'left'), 'jongseong', 0.02)
report('받침 오른면', col(JONG_TARGET, 'right'), 'jongseong', 0.02)
report('받침 윗면', col(JONG_TARGET, 'top'), 'jongseong', 0.02)
report('받침 아랫면', col(JONG_TARGET, 'bottom'), 'jongseong', 0.02)
report('받침 기둥 끝(pillarReach)', col(JONG_TARGET, 'pillarReach'), 'jongseong', 0.02)
report('받침 틈 잔차(두께 배수)', JONG_GAP_OFFSET, 'jongseong', 0.34)
report('첫닿자 윗면 치우침(받침별)', CHO_TOP_BY_JONG, 'jongseong', 0.01)
console.log('\n특징값 (첫닿자):'); for (const k of Object.keys(maps.choseong)) { const f = features(k, maps.choseong[k].strokes); console.log(k, KEYS.map((key) => `${key}=${(f[key] as number).toFixed(2)}`).join(' ')) }
