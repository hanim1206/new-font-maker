import { describe, expect, it } from 'vitest'
import { BLACK_CONTRAST, BLACK_STEM_GAIN, evenGapOf, evenGapOfBar, inkGap, inkHeightOf, jamoOf, solveStack900, type StackStroke } from './moldStack900'

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
  it('고른 틈을 그린 가로획에서: 고딕 비율 그대로면 옛 식, 같은 기둥에 가로획만 얇게(0.55) 하면 틈이 넓어지고, 끄면 옛 식', () => {
    expect(evenGapOfBar(0.8, 0.1 * 0.85, 0.85)).toBeCloseTo(evenGapOf(0.8, 0.1), 9)
    const st = reul(), height = inkHeightOf(st), gothic = [0.88, 0.807] as const
    const at = (barScale: number, gapFromBar?: boolean) => solveStack900({ char: '를', strokes: st, height, reach: 0.5, inward: 1.1, contrastRange: gothic, gothicRange: gothic, barScale, gapFromBar }).gap
    const old = evenGapOf(height, 0.1)
    expect(at(1)).toBeCloseTo(old, 9)
    const thin = 0.55 / ((gothic[0] + gothic[1]) / 2)
    expect(at(thin)).toBeGreaterThan(old + 0.01)
    expect(at(thin, false)).toBeCloseTo(old, 9)
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
})
