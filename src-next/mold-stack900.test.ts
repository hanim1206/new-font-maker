import { describe, expect, it } from 'vitest'
import { BLACK_CONTRAST, BLACK_STEM_GAIN, evenGapOf, inkGap, inkHeightOf, jamoOf, solveStack900, type StackStroke } from './moldStack900'

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
})
