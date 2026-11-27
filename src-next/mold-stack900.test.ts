import { describe, expect, it } from 'vitest'
import { BLACK_CONTRAST, BLACK_STEM_GAIN, INNER_COUNTER, evenGapOf, inkGap, inkHeightOf, jamoOf, solveStack900, type StackStroke } from './moldStack900'

const line = (part: StackStroke['part'], pts: [number, number][], t = 0.1): StackStroke => ({ part, points: pts.map(([x, y]) => ({ x, y })), anchors: pts.map(([x, y]) => ({ x, y })), thickness: t })
// 「를」 꼴: ㄹ(가로 셋) · ㅡ · ㄹ(가로 셋). 굵기 끝이라 위아래가 붙어 있다.
const reul = (): StackStroke[] => [
  line('CH', [[0.2, 0.1], [0.8, 0.1], [0.8, 0.2], [0.2, 0.2], [0.2, 0.3], [0.8, 0.3]]),
  line('JU', [[0.1, 0.45], [0.9, 0.45]]),
  line('JO', [[0.2, 0.6], [0.8, 0.6], [0.8, 0.7], [0.2, 0.7], [0.2, 0.8], [0.8, 0.8]]),
]

describe('900 쌓임 규칙', () => {
  it('고른 틈은 키 × (0.151 − 0.693 × 기둥 ÷ 키)', () => {
    expect(evenGapOf(0.8, 0.1)).toBeCloseTo(0.8 * 0.151 - 0.693 * 0.1, 9)
    expect(evenGapOf(0.5, 1)).toBe(0)
  })
  it('글자를 초성 · 중성 · 종성으로 읽는다', () => {
    expect(jamoOf('를')).toEqual({ cho: 'ㄹ', jung: 'ㅡ', jong: 'ㄹ' })
    expect(jamoOf('가')).toEqual({ cho: 'ㄱ', jung: 'ㅏ', jong: '' })
    expect(jamoOf('A')).toBeNull()
  })
  it('쌓인 글자는 키 안에서 막대 사이 틈을 고르게 벌리고, 넘치는 만큼 가로획이 가늘어진다', () => {
    const st = reul(), height = inkHeightOf(st)
    const out = solveStack900({ char: '를', strokes: st, height, reach: 0, inward: 1 })
    expect(out.bars).toBe(7)
    // 키는 받침 없는 글자 키를 안 넘는다.
    expect(inkHeightOf(out.strokes, out.thick)).toBeLessThanOrEqual(height + 1e-6)
    // 가로획은 0.75배 아래로 안 간다(막대 다섯 줄 이상).
    expect(out.thick.h).toBeGreaterThanOrEqual(0.75 - 1e-9)
    expect(out.thick.h).toBeLessThan(1)
    // 자소 사이가 붙지 않는다.
    const g = inkGap(out.strokes, (p) => p === 'CH', (p) => p === 'JU', out.thick)
    expect(g).not.toBeNull()
    expect(g!).toBeGreaterThan(0)
  })
  it('굵기 끝에서는 세로를 안쪽으로 1.15배, 가로는 세로의 0.8배 아래', () => {
    const st = [line('CH', [[0.1, 0.2], [0.1, 0.8]]), line('JU', [[0.7, 0.1], [0.7, 0.9]])]
    const out = solveStack900({ char: '이', strokes: st, reach: 1, inward: BLACK_STEM_GAIN })
    expect(out.thick.v).toBe(BLACK_STEM_GAIN)
    expect(out.thick.h).toBeLessThanOrEqual(BLACK_CONTRAST * BLACK_STEM_GAIN + 1e-9)
    // 한 줄짜리 자소(폭 0)는 안 옮긴다 — 바깥 테두리는 그대로.
    expect(out.strokes[0].points[0].x).toBeCloseTo(0.1, 9)
  })
  it('굵기 처음(reach 0, 안 굵힘)이고 붙은 데가 없으면 받침 없는 글자는 그대로', () => {
    const st = [line('CH', [[0.1, 0.2], [0.1, 0.8]]), line('JU', [[0.7, 0.1], [0.7, 0.9]])]
    const out = solveStack900({ char: '이', strokes: st, reach: 0, inward: 1 })
    expect(out.strokes).toEqual(st)
    expect(out.thick).toEqual({ v: 1, h: 1 })
  })
  it('겹받침(ㅀ)은 두 자소의 막대가 엇갈려도 한 덩이로 옮긴다 — 받침 안 모양이 안 뭉개진다', () => {
    const ring = (cx: number, cy: number, r: number): StackStroke => ({ ...line('CH', Array.from({ length: 16 }, (_, i) => [cx + r * Math.cos(i * Math.PI / 8), cy + 0.6 * r * Math.sin(i * Math.PI / 8)] as [number, number])), closed: true })
    const st: StackStroke[] = [
      ring(0.5, 0.15, 0.2),
      line('JU', [[0.5, 0.3], [0.5, 0.42]]), line('JU', [[0.1, 0.42], [0.9, 0.42]]),
      line('JO', [[0.15, 0.55], [0.45, 0.55], [0.45, 0.7], [0.15, 0.7], [0.15, 0.85], [0.47, 0.85]]),
      line('JO', [[0.6, 0.55], [0.6, 0.6]]), line('JO', [[0.5, 0.6], [0.8, 0.6]]),
      { ...ring(0.65, 0.75, 0.1), part: 'JO' },
    ]
    const out = solveStack900({ char: '옳', strokes: st, height: inkHeightOf(st) * 0.95, reach: 0, inward: 1 })
    const ys = (s: StackStroke[]) => s.filter((x) => x.part === 'JO').flatMap((x) => x.points.map((p) => p.y))
    const a = ys(st), b = ys(out.strokes), k = (b[b.length - 1] - b[0]) / (a[a.length - 1] - a[0])
    // 받침 점들은 한 배율 · 한 이동으로만 옮겨진다.
    a.forEach((y, i) => expect(b[i]).toBeCloseTo(b[0] + (y - a[0]) * k, 6))
  })
  it('손으로 그은 듯 조금 기운 가로획도 막대로 센다', () => {
    const tilt = reul().map((s) => ({ ...s, points: s.points.map((p) => ({ x: p.x, y: p.y + 0.03 * (p.x - 0.5) })), anchors: s.anchors.map((p) => ({ x: p.x, y: p.y + 0.03 * (p.x - 0.5) })) }))
    const out = solveStack900({ char: '를', strokes: tilt, height: inkHeightOf(tilt), reach: 0, inward: 1 })
    expect(out.bars).toBe(7)
  })
  it('ㅐ 두 기둥은 안쪽으로 굵어져도 고른 틈을 지킨다 — 모자라면 오른쪽으로 넓힌다', () => {
    const st = [line('CH', [[0.1, 0.3], [0.3, 0.3], [0.3, 0.7]], 0.12), line('JU', [[0.6, 0.1], [0.6, 0.9]], 0.12), line('JU', [[0.6, 0.5], [0.72, 0.5]], 0.12), line('JU', [[0.74, 0.1], [0.74, 0.9]], 0.12)]
    const out = solveStack900({ char: '대', strokes: st, height: 0.8, reach: 1, inward: BLACK_STEM_GAIN })
    const xs = out.strokes.filter((s) => s.part === 'JU' && s.points[0].x === s.points[1].x).map((s) => s.points[0].x).sort((a, b) => a - b)
    const gap = xs[1] - xs[0] - 0.12 * BLACK_STEM_GAIN
    expect(gap).toBeGreaterThanOrEqual(out.gap - 1e-9)
    // 왼 기둥(첫닿자 쪽)은 안쪽으로 굵힌 자리 그대로.
    expect(out.strokes[1].points[0].x).toBeLessThan(0.6 + 0.05)
  })
  it('ㅃ 속은 굵기 끝에서 최소값까지 좁아지고, 그 몫으로 ㅂ과 ㅓ 사이 고른 틈을 지킨다 — 세로는 꼭 필요한 만큼만 가늘어진다', () => {
    // 「뻐」 꼴: ㅂ 둘(위가 열린 U + 가운데 가로) · ㅓ. 두 ㅂ 사이도 붙어 있다.
    const b = (x0: number, x1: number): StackStroke[] => [line('CH', [[x0, 0.14], [x0, 0.7], [x1, 0.7], [x1, 0.14]], 0.127), line('CH', [[x0, 0.4], [x1, 0.4]], 0.127)]
    const st = [...b(0.1, 0.29), ...b(0.4, 0.59), line('JU', [[0.78, 0.05], [0.78, 0.96]], 0.127), line('JU', [[0.62, 0.43], [0.78, 0.43]], 0.127)]
    const out = solveStack900({ char: '뻐', strokes: st, height: 0.9, reach: 1, inward: BLACK_STEM_GAIN })
    const v = (g: 'CH' | 'JU') => out.thick.v * (out.yieldV?.[g] ?? 1)
    const stems = out.strokes.flatMap((s) => s.points.slice(0, -1).map((p, i) => [p, s.points[i + 1], s.part] as const)).filter(([p, q]) => Math.abs(p.x - q.x) < 1e-9 && Math.abs(p.y - q.y) > 0.2)
      .map(([p, , part]) => ({ x: p.x, t: 0.127 * v(part === 'CH' ? 'CH' : 'JU') })).sort((a, c) => a.x - c.x)
    // ㅃ 안(ㅂ 속, 두 ㅂ 사이)은 고른 틈의 `INNER_COUNTER`배까지, ㅂ과 ㅓ 사이는 고른 틈 그대로.
    const want = [INNER_COUNTER, INNER_COUNTER, INNER_COUNTER, 1]
    for (let i = 0; i < stems.length - 1; i++) expect(stems[i + 1].x - stems[i].x - (stems[i].t + stems[i + 1].t) / 2).toBeGreaterThanOrEqual(out.gap * want[i] - 1e-3)
    // ㅃ 안 속은 최소값 그대로(하니무스 「그것도 최소값대로」).
    for (const i of [0, 1, 2]) expect(stems[i + 1].x - stems[i].x - (stems[i].t + stems[i + 1].t) / 2).toBeCloseTo(out.gap * INNER_COUNTER, 3)
    // 속을 거둔 몫으로 틈을 채워 ㅃ 세로는 조금만 가늘어진다(예전 0.69 바닥까지 갔던 꼴). ㅓ는 그대로.
    expect(out.yieldV?.CH ?? 1).toBeGreaterThan(0.9)
    expect(out.yieldV?.JU).toBeUndefined()
  })
  it('겹받침(ㄼ)은 ㄹ 아래 열린 속과 ㅂ 사이를 한 자소 속으로 보지 않는다 — 굵기 끝에서 ㄹ이 안 찌그러지고 ㅂ도 안 홀쭉해진다(「짧」)', () => {
    // 굵기 20 「짧」 받침(빚기 화면에서 뜬 값). 예전엔 ㄹ 폭이 0.26 → 0.10으로 눌려 획 하나보다 좁아졌다.
    const rieul = line('JO', [[0.119, 0.61], [0.376, 0.61], [0.376, 0.762], [0.158, 0.762], [0.158, 0.916], [0.436, 0.916]], 0.127)
    const bieup = line('JO', [[0.506, 0.573], [0.506, 0.918], [0.729, 0.918], [0.729, 0.573]], 0.127)
    const bar = line('JO', [[0.464, 0.728], [0.77, 0.728]], 0.127)
    const out = solveStack900({ char: '짧', strokes: [rieul, bieup, bar], height: 0.905, reach: 1, inward: BLACK_STEM_GAIN })
    const width = (s: StackStroke) => Math.max(...s.points.map((p) => p.x)) - Math.min(...s.points.map((p) => p.x))
    expect(width(out.strokes[0])).toBeGreaterThan(0.9 * width(rieul))
    expect(width(out.strokes[1])).toBeGreaterThan(0.9 * width(bieup))
  })
  it('받침 줄을 넓혀도 위 닿자 비스듬한 다리는 꺾이지 않는다 — 자른 자리는 그 자소에만, 비스듬한 획은 통째로(「짧」)', () => {
    // 예전엔 ㄼ 사이를 벌리려 자른 x가 글자 전체를 갈라 ㅉ 둘째 ㅈ 왼다리 한가운데가 꺾였다(하니무스 2026-11-27).
    const steps = Array.from({ length: 9 }, (_, k) => k / 8)
    const leg = line('CH', steps.map((t) => [0.46 - 0.14 * t, 0.14 + 0.35 * t] as [number, number]), 0.127)
    const top = line('CH', [[0.08, 0.14], [0.6, 0.14]], 0.127)
    const rieul = line('JO', [[0.119, 0.61], [0.376, 0.61], [0.376, 0.762], [0.158, 0.762], [0.158, 0.916], [0.436, 0.916]], 0.127)
    const bieup = line('JO', [[0.506, 0.573], [0.506, 0.918], [0.729, 0.918], [0.729, 0.573]], 0.127)
    const bar = line('JO', [[0.464, 0.728], [0.77, 0.728]], 0.127)
    const out = solveStack900({ char: '짧', strokes: [top, leg, rieul, bieup, bar], height: 0.905, reach: 1, inward: BLACK_STEM_GAIN })
    const P = out.strokes[1].points, a = P[0], b = P[P.length - 1]
    const off = Math.max(...P.map((p) => Math.abs((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / Math.hypot(b.x - a.x, b.y - a.y)))
    expect(off).toBeLessThan(1e-6)
  })
  it('ㅝ: ㅜ 보 오른쪽은 ㅓ 곁줄기 앞에서 끊고, 가로획을 바닥까지 깎지 않는다(「원」, 하니무스 고른 안)', () => {
    // 굵기 20 「원」(빚기 화면에서 뜬 값을 줄인 것). 예전엔 보와 곁줄기가 위아래로 겹쳐 가로가 0.69배까지 깎였다.
    const ring: StackStroke = { part: 'CH', closed: true, thickness: 0.127, points: Array.from({ length: 64 }, (_, k) => ({ x: 0.339 + 0.175 * Math.cos(k / 32 * Math.PI), y: 0.245 + 0.128 * Math.sin(k / 32 * Math.PI) })), anchors: [] }
    const bar = line('JU_H', [[0.045, 0.504], [0.631, 0.504]], 0.127), stem = line('JU_H', [[0.338, 0.504], [0.338, 0.667]], 0.127)
    const nieun = line('JO', [[0.218, 0.699], [0.218, 0.903], [0.815, 0.903]], 0.127)
    const pillar = line('JU_V', [[0.753, 0.054], [0.753, 0.76]], 0.127), side = line('JU_V', [[0.518, 0.596], [0.753, 0.596]], 0.127)
    const out = solveStack900({ char: '원', strokes: [ring, bar, stem, nieun, pillar, side], height: 0.905, reach: 1, inward: BLACK_STEM_GAIN })
    expect(out.yieldH?.JU ?? 1).toBe(1)
    const barRight = Math.max(...out.strokes[1].points.map((p) => p.x)), sideLeft = Math.min(...out.strokes[5].points.map((p) => p.x))
    expect(sideLeft - barRight).toBeGreaterThanOrEqual(out.gap - 1e-6)
  })
  it('가로 굵게 쪽 대비(hScale > 1)여도 쌓임이 준 배율을 넘지 않아 ㄹ · ㅡ가 안 뭉친다(굵기 끝 + 대비 0 「를」 · 「을」)', () => {
    const st = reul(), height = inkHeightOf(st)
    const plain = solveStack900({ char: '를', strokes: st, height, reach: 0, inward: 1 })
    const fat = solveStack900({ char: '를', strokes: reul(), height, reach: 0, inward: 1, hScale: 1.46 })
    expect(fat.thick.h).toBeLessThanOrEqual(plain.thick.h * 1.46 + 1e-9)
    expect(inkHeightOf(fat.strokes, fat.thick)).toBeLessThanOrEqual(height + 1e-6)
    const g = inkGap(fat.strokes, (p) => p === 'CH', (p) => p === 'JU', fat.thick)
    expect(g!).toBeGreaterThan(0)
  })
})
