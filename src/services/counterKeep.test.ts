import { describe, expect, it } from 'vitest'
import type { BoxConfig, StrokeDataV2 } from '../types'
import { betweenKeepScales, counterKeepScale, gapOpeningShifts } from './counterKeep'

const BOX: BoxConfig = { x: 0, y: 0, width: 1, height: 1 }
const line = (id: string, points: [number, number][], thickness = 0.07, closed = false): { stroke: StrokeDataV2; box: BoxConfig } => ({
  box: BOX,
  stroke: { id, points: points.map(([x, y]) => ({ x, y })), closed, thickness } as StrokeDataV2,
})
const circle = (cx: number, cy: number, r: number) => line('o', Array.from({ length: 48 }, (_, i): [number, number] => [cx + r * Math.cos(i / 48 * Math.PI * 2), cy + r * Math.sin(i / 48 * Math.PI * 2)]), 0.07, true)
/** 가로줄기 셋, 중심선 간격 0.154(밭 받침 ㅌ과 같은 간격). 굵기 400 틈 = 0.084. */
const tieut = [line('a', [[0.2, 0.6], [0.8, 0.6]]), line('b', [[0.2, 0.754], [0.8, 0.754]]), line('c', [[0.2, 0.908], [0.8, 0.908]])]

describe('속공간 지키기 — 자소 굵기 배율', () => {
  it('굵기 400 이하는 그대로', () => {
    expect(counterKeepScale(tieut, 1)).toBe(1)
    expect(counterKeepScale(tieut, 0.7)).toBe(1)
  })

  it('획 하나(ㅣ)는 굵기와 상관없이 그대로', () => {
    expect(counterKeepScale([line('i', [[0.5, 0.05], [0.5, 0.95]])], 1.95)).toBe(1)
  })

  it('빽빽한 가로줄기는 하한선이 남을 만큼만 굵어진다', () => {
    // 하한선 = max(0.024, 0.25 × 0.07 × 1.95) = 0.034. 한계 k = (0.154 − 0.034) / 0.07 = 1.71.
    const scale = counterKeepScale(tieut, 1.95, { fixed: 0.024, ratio: 0.25 })
    expect(0.154 - scale * 1.95 * 0.07).toBeCloseTo(0.25 * 0.07 * 1.95, 4)
  })

  it('고정 u가 비율보다 크면 고정 u를 지킨다', () => {
    const scale = counterKeepScale(tieut, 1.95, { fixed: 0.05, ratio: 0.25 })
    expect(0.154 - scale * 1.95 * 0.07).toBeCloseTo(0.05, 4)
  })

  it('넉넉하면 다 굵어진다', () => {
    expect(counterKeepScale(tieut, 1.3)).toBe(1)
  })

  it('가로줄기 사이 비율을 따로 주면 가로줄기 틈은 그 하한선을 쓴다', () => {
    const scale = counterKeepScale(tieut, 1.95, { fixed: 0.024, ratio: 0.5, horizontalRatio: 0.25 })
    expect(0.154 - scale * 1.95 * 0.07).toBeCloseTo(0.25 * 0.07 * 1.95, 4)
  })

  it('동그라미 윗부분과 보 사이(ㅎ)는 쌓인 가로줄기가 아니다', () => {
    // ㅎ: 보 아래 작은 ㅇ. 동그라미 토막은 짧아 가로줄기 비율을 안 쓴다 — 두 하한선이 같은 결과.
    const hieut = [line('beam', [[0.2, 0.3], [0.8, 0.3]]), circle(0.5, 0.55, 0.15)]
    expect(counterKeepScale(hieut, 1.95, { fixed: 0.024, ratio: 0.5, horizontalRatio: 0.25 })).toBeCloseTo(counterKeepScale(hieut, 1.95, { fixed: 0.024, ratio: 0.5 }), 6)
  })

  it('가로줄기를 덜 굵게 하면 하한선 때문에 덜 굵어질 몫이 준다', () => {
    const floor = { fixed: 0.024, ratio: 0.25 }
    // 가로 몫 0.6: 가로줄기 반 두께가 0.035 × 1.57로만 자라 틈이 넉넉하다.
    expect(counterKeepScale(tieut, 1.95, floor, 1, 0.6)).toBeGreaterThan(counterKeepScale(tieut, 1.95, floor))
  })

  it('가로 몫이 낮아도 굵기 400에서 놓아 준 좁은 틈은 그대로 놓아 준다', () => {
    const narrow = [line('a', [[0.2, 0.5], [0.8, 0.5]]), line('b', [[0.2, 0.6], [0.8, 0.6]])]
    expect(counterKeepScale(narrow, 1.95, { fixed: 0.024, ratio: 0.25 }, 1, 0.6)).toBe(1)
  })

  it('하한선을 올리면 덜 굵어진다', () => {
    expect(counterKeepScale(tieut, 1.95, { fixed: 0.024, ratio: 0.5 })).toBeLessThan(counterKeepScale(tieut, 1.95, { fixed: 0.024, ratio: 0.25 }))
  })

  it('굵기 400에서 이미 하한선보다 좁던 틈은 놓아 준다', () => {
    // 틈 0.03(30u) < 하한선 0.034 → 안 지킨다. 남길 몫 방식이면 자소 전체가 얇아졌다(ㅆ).
    const narrow = [line('a', [[0.2, 0.5], [0.8, 0.5]]), line('b', [[0.2, 0.6], [0.8, 0.6]])]
    expect(counterKeepScale(narrow, 1.95, { fixed: 0.024, ratio: 0.25 })).toBe(1)
  })

  it('한 획으로 그린 ㄹ도 가로줄기 사이를 지킨다', () => {
    const rieul = [line('r', [[0.2, 0.1], [0.8, 0.1], [0.8, 0.254], [0.2, 0.254], [0.2, 0.408], [0.8, 0.408]])]
    expect(counterKeepScale(rieul, 1.95)).toBeLessThan(1)
    expect(counterKeepScale(rieul, 1.95)).toBeCloseTo(counterKeepScale(tieut, 1.95), 4)
  })

  it('ㅇ 둘레의 이웃 토막은 틈으로 안 본다', () => {
    // 지름 0.3이면 속공간이 넉넉해 굵기 900도 다 굵어진다.
    expect(counterKeepScale([circle(0.5, 0.5, 0.15)], 1.95)).toBe(1)
    // 작은 ㅇ은 안쪽 지름을 지킨다.
    const small = counterKeepScale([circle(0.5, 0.5, 0.08)], 1.95)
    expect(small).toBeLessThan(1)
  })

  it('ㅅ 두 다리처럼 이음 자리에서 벌어지는 쐐기는 틈으로 안 본다', () => {
    // 꼭대기에서 만나 곡선으로 벌어지는 두 획. 틈이 0부터 연속이라 지키면 자소 전체가 굵기 400에 묶인다.
    const leg = (id: string, side: number) => line(id, Array.from({ length: 16 }, (_, i): [number, number] => [0.5 + side * 0.3 * Math.sin(i / 15 * Math.PI / 2), 0.2 + 0.6 * i / 15]))
    expect(counterKeepScale([leg('l', -1), leg('r', 1)], 1.95)).toBe(1)
  })

  it('엇갈린 두 다리(ㅆ 안쪽 X)는 틈으로 안 본다', () => {
    const left = line('l', [[0.4, 0.2], [0.6, 0.8]])
    const right = line('r', [[0.6, 0.2], [0.4, 0.8]])
    expect(counterKeepScale([left, right], 1.95)).toBe(1)
  })

  it('원래 붙여 그린 틈(두께의 1/4 아래)은 안 지킨다', () => {
    const tight = [line('a', [[0.2, 0.5], [0.8, 0.5]]), line('b', [[0.2, 0.585], [0.8, 0.585]])]
    expect(counterKeepScale(tight, 1.95)).toBe(1)
  })
})

describe('자소 사이 지키기 — 마주 본 획만 (4단계 임시판)', () => {
  it('이웃 자소의 나란한 기둥 둘은 틈의 1/4이 남을 만큼만 굵어진다', () => {
    // 중심선 간격 0.154, 굵기 400 틈 = 0.084 > minGap 0.0175. 지킬 틈 = 0.25 × 0.07 × 1.95 = 0.0341.
    const strokes = [line('a', [[0.3, 0.1], [0.3, 0.9]]), line('b', [[0.454, 0.1], [0.454, 0.9]])]
    const scales = betweenKeepScales(strokes, [0, 1], 1.95)
    expect(scales[0]).toBeCloseTo((0.154 - 0.0341) / (0.07 * 1.95), 3)
    expect(scales[0]).toBe(scales[1])
  })

  it('같은 자소 안이거나 원래 붙여 그린 쌍은 그대로', () => {
    const strokes = [line('a', [[0.3, 0.1], [0.3, 0.9]]), line('b', [[0.454, 0.1], [0.454, 0.9]])]
    expect(betweenKeepScales(strokes, [0, 0], 1.95)).toEqual([1, 1])
    const touching = [line('a', [[0.3, 0.1], [0.3, 0.9]]), line('b', [[0.385, 0.1], [0.385, 0.9]])]
    expect(betweenKeepScales(touching, [0, 1], 1.95)).toEqual([1, 1])
  })

  it('넉넉한 틈과 굵기 400 이하는 그대로, 400보다 얇게는 안 간다', () => {
    const wide = [line('a', [[0.2, 0.1], [0.2, 0.9]]), line('b', [[0.7, 0.1], [0.7, 0.9]])]
    expect(betweenKeepScales(wide, [0, 1], 1.95)).toEqual([1, 1])
    const strokes = [line('a', [[0.3, 0.1], [0.3, 0.9]]), line('b', [[0.454, 0.1], [0.454, 0.9]])]
    expect(betweenKeepScales(strokes, [0, 1], 1)).toEqual([1, 1])
    // 아주 굵어도(×3) 배율 × 굵기 배수가 1(= 굵기 400 두께) 아래로 내려가지 않는다.
    const extreme = betweenKeepScales(strokes, [0, 1], 3)
    expect(extreme[0] * 3).toBeGreaterThanOrEqual(1)
  })
})

describe('속공간 벌리기 — 좁은 틈만 획 중심 이동 (2026-10-02 플랜 2단계)', () => {
  const parted = (part: string, item: ReturnType<typeof line>) => ({ ...item, part })

  it('굵기 400 이하는 아무것도 안 움직인다', () => {
    const stems = [parted('CH', line('a', [[0.42, 0.1], [0.42, 0.9]])), parted('CH', line('b', [[0.58, 0.1], [0.58, 0.9]]))]
    expect(gapOpeningShifts(stems, 1).shifts).toEqual([{ x: 0, y: 0 }, { x: 0, y: 0 }])
    expect(gapOpeningShifts(stems, 0.7).shifts).toEqual([{ x: 0, y: 0 }, { x: 0, y: 0 }])
  })

  it('눌린 틈은 양쪽 획이 반반으로 멀어져 바닥(두께의 1/4)이 남는다', () => {
    // 중심 간격 0.16, 굵기 900 두께 합 0.1365 → 그냥 두면 틈 0.0235 < 바닥 0.0341. 모자람 0.0106을 반반.
    const stems = [parted('CH', line('a', [[0.42, 0.1], [0.42, 0.9]])), parted('CH', line('b', [[0.58, 0.1], [0.58, 0.9]]))]
    const { shifts, unresolved } = gapOpeningShifts(stems, 1.95)
    expect(shifts[0].x).toBeCloseTo(-0.0053, 3)
    expect(shifts[1].x).toBeCloseTo(0.0053, 3)
    expect(shifts[0].y).toBe(0)
    expect(0.16 + shifts[1].x - shifts[0].x - 0.1365).toBeCloseTo(0.25 * 0.1365, 3)
    expect(unresolved).toBe(0)
  })

  it('넉넉한 틈은 손 안 댄다', () => {
    const stems = [parted('CH', line('a', [[0.25, 0.1], [0.25, 0.9]])), parted('CH', line('b', [[0.75, 0.1], [0.75, 0.9]]))]
    expect(gapOpeningShifts(stems, 1.95).shifts).toEqual([{ x: 0, y: 0 }, { x: 0, y: 0 }])
  })

  it('쐐기(ㅅ 두 다리)는 안 벌린다', () => {
    const leg = (id: string, side: number) => line(id, Array.from({ length: 16 }, (_, i): [number, number] => [0.5 + side * 0.3 * Math.sin(i / 15 * Math.PI / 2), 0.2 + 0.6 * i / 15]))
    const { shifts } = gapOpeningShifts([parted('CH', leg('l', -1)), parted('CH', leg('r', 1))], 1.95)
    expect(shifts).toEqual([{ x: 0, y: 0 }, { x: 0, y: 0 }])
  })

  it('중심선이 자소 상자 밖으로 못 나가면 그 틈은 남는다(깎기의 몫)', () => {
    // 두 기둥의 중심선이 상자 양 끝에 딱 붙어 바깥 여유가 0 — 못 벌리고 unresolved로 센다.
    const box = { x: 0.4, y: 0, width: 0.2, height: 1 }
    const flush = (id: string, x: number) => ({ box, stroke: { id, points: [{ x, y: 0.1 }, { x, y: 0.9 }], closed: false, thickness: 0.1 } as StrokeDataV2, part: 'CH' })
    const { shifts, unresolved } = gapOpeningShifts([flush('a', 0), flush('b', 1)], 1.95)
    expect(shifts).toEqual([{ x: 0, y: 0 }, { x: 0, y: 0 }])
    expect(unresolved).toBe(1)
  })

  it('작은 자소 상자에서는 이동이 상자 비율(6%)로 묶인다 — 글자꼴 지키기', () => {
    // 받침 ㅂ 꼴: 높이 0.2 상자 → 축 상한 0.012. 모자람이 커도 그 이상 안 민다(뷁의 ㅂ이 ㅁ 되는 것 방지).
    const box = { x: 0.2, y: 0.7, width: 0.6, height: 0.2 }
    const bar = (id: string, y: number) => ({ box, stroke: { id, points: [{ x: 0.1, y }, { x: 0.9, y }], closed: false, thickness: 0.07 } as StrokeDataV2, part: 'JO' })
    const { shifts, unresolved } = gapOpeningShifts([bar('a', 0.25), bar('b', 0.75)], 1.95)
    expect(Math.abs(shifts[0].y)).toBeLessThanOrEqual(0.012 + 1e-9)
    expect(Math.abs(shifts[1].y)).toBeLessThanOrEqual(0.012 + 1e-9)
    expect(Math.abs(shifts[0].y)).toBeGreaterThan(0)
    expect(unresolved).toBe(1)
  })

  it('자소 사이 틈은 betweenParts를 켰을 때만 벌린다', () => {
    // 홀자 보 아래 받침 가로줄기 — 중심 간격 0.16, 굵기 900이면 바닥 0.0341이 안 남는다.
    const beams = [parted('JU', line('a', [[0.2, 0.5], [0.8, 0.5]])), parted('JO', line('b', [[0.2, 0.66], [0.8, 0.66]]))]
    expect(gapOpeningShifts(beams, 1.95).shifts).toEqual([{ x: 0, y: 0 }, { x: 0, y: 0 }])
    const { shifts } = gapOpeningShifts(beams, 1.95, 1, { betweenParts: true })
    expect(shifts[0].y).toBeCloseTo(-0.0053, 3)
    expect(shifts[1].y).toBeCloseTo(0.0053, 3)
  })
})
