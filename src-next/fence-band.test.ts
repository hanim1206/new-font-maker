import { describe, expect, it } from 'vitest'
import { DEFAULT_LAYOUT_SCHEMAS } from '../src/data/layoutConfigs'
import { resolveGlyphInkPrimitives } from '../src/services/glyphInkResolver'
import { getBaseJamo } from '../src/stores/jamoStore'
import type { BoxConfig, JamoData, Part } from '../src/types'
import { decomposeSyllable } from '../src/utils/hangulUtils'
import { allowedRects, fittedBoxes, OUTER_SLACK, partRects, clearanceRatio, correctGlyph, expectedGap, partClearances, type FenceCorrection, finalBottomTolerance, GOTHIC_FENCE, measureGlyph, movedBoxes, shakenBoxes, summarize, type GlyphMeasure, type ShakeLevel } from './fenceBand'

const CHOSEONG = 'ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎ', JUNGSEONG = 'ㅏㅓㅗㅜㅡㅣ'
const map = (type: JamoData['type'], chars: string) => Object.fromEntries([...chars].map((char) => [char, getBaseJamo(type, char)]).filter(([, jamo]) => jamo)) as Record<string, JamoData>
const cho = map('choseong', CHOSEONG), jung = map('jungseong', JUNGSEONG), jong = map('jongseong', CHOSEONG)
const BODY = GOTHIC_FENCE.engine.body

/** 글자를 풀어 잰다. 상자를 주면 그 상자로, 아니면 기본 짜임으로. */
function measured(char: string, boxes?: Partial<Record<Part, BoxConfig>>) {
  const syllable = decomposeSyllable(char, cho, jung, jong)
  const result = resolveGlyphInkPrimitives({
    syllable,
    placement: boxes ? { kind: 'boxes', boxes } : { kind: 'schema', schema: DEFAULT_LAYOUT_SCHEMAS[syllable.layoutType] },
    weightMultiplier: 1,
    horizontalInkBounds: { min: 0, max: 1 },
  })
  const measure = measureGlyph(result.primitives.map((primitive) => ({ part: primitive.source.part, box: primitive.box, points: primitive.stroke.points, closed: primitive.stroke.closed })))!
  return { layout: syllable.layoutType, boxes: result.boxes, measure }
}

/** 흔들고 → 당기고 → 다시 잰다. */
function shakenThenCorrected(char: string, level: ShakeLevel, index = 0) {
  const base = measured(char)
  const shaken = shakenBoxes(base.boxes, base.layout, index, level)
  const now = measured(char, shaken).measure
  const correction = correctGlyph({ layout: base.layout, now, reference: base.measure })
  const after = measured(char, movedBoxes(shaken, correction.moves)).measure
  return { base, now, after, correction }
}
const pullOf = (correction: FenceCorrection, value: string) => correction.pulls.find((item) => item.value === value)

describe('울타리 자동 보정', () => {
  it('글자를 재면 윗선 · 무게중심 · 틈 · 받침 덩이가 나온다', () => {
    const { measure } = measured('간')
    expect(measure.final).toBeDefined()
    expect(measure.gapCol).toBeGreaterThan(0)
    expect(measure.cy).toBeGreaterThan(measure.top)
    expect(measured('가').measure.final).toBeUndefined()
  })

  it('받침 밑선: 울타리 안 흔들림은 그대로, 밖이면 울타리 끝까지 당긴다', () => {
    const tolerance = finalBottomTolerance(GOTHIC_FENCE, 'safe')!
    expect(tolerance).toBeCloseTo(Math.sqrt(0.013 ** 2 - 0.008 ** 2), 9)
    const small = shakenThenCorrected('간', 0)
    expect(pullOf(small.correction, 'finalBottom')!.pulled).toBe(0)
    const big = shakenThenCorrected('간', 2)
    // 많이 흔들면 받침이 0.036em 내려간다 → 울타리 끝(±tolerance)까지 올린다.
    const off = (measure: GlyphMeasure) => (measure.final!.maxY - big.base.measure.final!.maxY) / BODY
    expect(off(big.now)).toBeCloseTo(0.036 / BODY, 6)
    expect(pullOf(big.correction, 'finalBottom')!.pulled).toBeLessThan(0)
    expect(off(big.after)).toBeCloseTo(tolerance, 4)
  })

  it('한계선은 안전선보다 좁지 않다 — 안전선이 당기는 흔들림도 한계선 안이면 그대로 둔다', () => {
    expect(finalBottomTolerance(GOTHIC_FENCE, 'limit')!).toBeGreaterThanOrEqual(finalBottomTolerance(GOTHIC_FENCE, 'safe')!)
    const { safe, limit } = GOTHIC_FENCE.lines
    expect(limit.topLine!.lo).toBeLessThan(safe.topLine!.lo)
    expect(expectedGap(GOTHIC_FENCE, 'col') * limit.gapColFloor!).toBeLessThan(expectedGap(GOTHIC_FENCE, 'col') + safe.gapCol!.lo)
    // 조금 흔든 세로 틈(첫닿 0.02em)은 안전선 밖, 한계선 안.
    const base = measured('나')
    const now = measured('나', shakenBoxes(base.boxes, base.layout, 0, 1)).measure
    expect(pullOf(correctGlyph({ layout: base.layout, now, reference: base.measure }), 'gap')!.pulled).toBeGreaterThan(0)
    expect(pullOf(correctGlyph({ layout: base.layout, now, reference: base.measure, line: 'limit' }), 'gap')!.pulled).toBe(0)
    // 엔진 기준 무게중심(세로 + 받침 0.522)은 안전선 밖이지만 한계선 안이다.
    const final = measured('간')
    expect(pullOf(correctGlyph({ layout: final.layout, now: final.measure, reference: final.measure, line: 'limit' }), 'centroid')).toMatchObject({ pulled: 0, left: 0 })
  })

  it('세로 틈: 첫닿이 홀자 쪽으로 밀리면 울타리 아래 끝까지 되벌린다', () => {
    const { base, now, after, correction } = shakenThenCorrected('나', 2)
    const lo = expectedGap(GOTHIC_FENCE, 'col') + GOTHIC_FENCE.lines.safe.gapCol!.lo
    const value = (measure: GlyphMeasure) => GOTHIC_FENCE.engine.gapCol + (measure.gapCol! - base.measure.gapCol!) / BODY
    expect(value(now)).toBeLessThan(lo)
    expect(pullOf(correction, 'gap')!.pulled).toBeGreaterThan(0)
    expect(correction.moves.initialDx).toBeLessThan(0)
    expect(value(after)).toBeCloseTo(lo, 3)
  })

  it('가로 틈: 엔진 기준값이 이미 울타리 밖이라 긋기 전에도 조금 벌린다', () => {
    const base = measured('그')
    const correction = correctGlyph({ layout: base.layout, now: base.measure, reference: base.measure })
    const lo = expectedGap(GOTHIC_FENCE, 'row') + GOTHIC_FENCE.lines.safe.gapRow!.lo
    expect(pullOf(correction, 'gap')!.pulled).toBeCloseTo(lo - GOTHIC_FENCE.engine.gapRow, 9)
    expect(correction.moves.initialDy).toBeLessThan(0)
  })

  it('윗선 차: 가로 + 받침 글자의 윗부분이 내려가면 울타리 끝까지 올린다', () => {
    const { base, after, correction } = shakenThenCorrected('곤', 2)
    expect(pullOf(correction, 'topLine')!.pulled).toBeGreaterThan(0)
    expect(correction.moves.upperDy).toBeLessThan(0)
    const value = GOTHIC_FENCE.engine.topLine - (after.top - base.measure.top) / BODY
    expect(value).toBeGreaterThanOrEqual(GOTHIC_FENCE.lines.safe.topLine!.lo - 1e-3)
  })

  it('무게중심: 윗선이 허락하는 만큼만 당기고, 못 당긴 만큼은 남았다고 알린다', () => {
    // 세로 + 받침: 엔진 기준값 0.522는 울타리 위 끝 0.508보다 아래인데, 윗선이 몸 위 끝이라 위로 못 올린다.
    const stuck = measured('간')
    const kept = correctGlyph({ layout: stuck.layout, now: stuck.measure, reference: stuck.measure })
    expect(pullOf(kept, 'centroid')).toMatchObject({ pulled: 0 })
    expect(pullOf(kept, 'centroid')!.left).toBeCloseTo(0.522 - 0.508, 6)
    expect(kept.moves.upperDy).toBe(0)
    // 가로 + 받침: 윗부분이 아래로 밀리면 윗선 차를 먼저 맞추고, 남은 여유 안에서 무게중심을 올린다. 윗선 차는 울타리를 안 벗어난다.
    const { base, after, correction } = shakenThenCorrected('곤', 2)
    const top = GOTHIC_FENCE.engine.topLine - (after.top - base.measure.top) / BODY
    expect(top).toBeGreaterThanOrEqual(GOTHIC_FENCE.lines.safe.topLine!.lo - 1e-3)
    expect(top).toBeLessThanOrEqual(GOTHIC_FENCE.lines.safe.topLine!.hi + 1e-3)
    const centroid = pullOf(correction, 'centroid')!
    expect(centroid.after).toBeLessThanOrEqual(centroid.before)
  })

  it('당긴 기록을 값마다 한 줄로 모은다', () => {
    const rows = summarize(['간', '나', '그', '곤'].map((char, index) => shakenThenCorrected(char, 2, index).correction.pulls))
    expect(rows.map((row) => row.value)).toEqual(['clearance', 'finalBottom', 'gap', 'topLine', 'centroid'])
    expect(rows.find((row) => row.value === 'finalBottom')).toMatchObject({ checked: 2, count: 2 })
    expect(rows.find((row) => row.value === 'gap')).toMatchObject({ checked: 2, count: 2, word: '벌림' })
  })

  it('자소 사이 틈: 다른 자소의 획끼리 가까워지면 비율이 줄고, 겹치면 0 아래다', () => {
    const box = { x: 0, y: 0, width: 1, height: 1 }
    const line = (part: 'CH' | 'JU', x: number) => ({ part, box, points: [{ x, y: 0.1 }, { x, y: 0.9 }], closed: false, thickness: 0.06 })
    const reference = partClearances([line('CH', 0.3), line('JU', 0.6)])
    expect(reference['CH-JU']).toBeCloseTo(0.3 - 0.06, 9)
    expect(clearanceRatio(partClearances([line('CH', 0.3), line('JU', 0.48)]), reference)).toBeCloseTo(0.5, 9)
    // 엇갈린 선은 중심선 거리가 0 — 굵기만큼 겹친 것으로 센다.
    const crossing = partClearances([line('CH', 0.3), { part: 'JU', box, points: [{ x: 0.1, y: 0.5 }, { x: 0.6, y: 0.5 }], closed: false, thickness: 0.06 }])
    expect(clearanceRatio(crossing, reference)).toBeLessThan(0)
    // 같은 자소 안의 획은 보지 않는다.
    expect(partClearances([line('CH', 0.3), line('CH', 0.31)])).toEqual({})
  })

  it('칸: 옆 자소 쪽은 틈의 몫만큼, 빈 쪽은 여백만큼 넓다', () => {
    const reference = { CH: { minX: 0.1, maxX: 0.4, minY: 0.1, maxY: 0.9 }, JU: { minX: 0.7, maxX: 0.7, minY: 0.1, maxY: 0.9 } }
    const allowed = allowedRects(reference, 0.06, 0.7)
    // 둘 사이 잉크 틈 0.3 − 0.06 = 0.24, 써도 되는 몫은 30%를 반씩 = 0.036.
    expect(allowed.CH!.maxX).toBeCloseTo(0.436, 9)
    expect(allowed.JU!.minX).toBeCloseTo(0.664, 9)
    expect(allowed.JU!.maxX).toBeCloseTo(0.7 + OUTER_SLACK, 9)
    expect(allowed.CH!.minX).toBeCloseTo(0.1 - OUTER_SLACK, 9)
  })

  it('휜 획 넣기: 칸보다 작으면 빈 쪽으로 옮기기만, 크면 넘친 방향으로만 줄인다', () => {
    const allowed = { JU: { minX: 0.664, maxX: 0.74, minY: 0.1, maxY: 0.9 } }
    const boxes = { JU: { x: 0.6, y: 0.05, width: 0.2, height: 0.9 } }
    // 안이면 그대로.
    expect(fittedBoxes(boxes, { JU: { minX: 0.68, maxX: 0.72, minY: 0.1, maxY: 0.9 } }, allowed)).toMatchObject({ boxes, overflow: 0 })
    // 왼쪽(첫닿 쪽)으로 0.024 불룩 — 폭 0.06은 칸(0.076)보다 작다 → 오른쪽으로 옮기기만 한다.
    const moved = fittedBoxes(boxes, { JU: { minX: 0.64, maxX: 0.7, minY: 0.1, maxY: 0.9 } }, allowed)
    expect(moved.overflow).toBeCloseTo(0.024, 9)
    expect(moved.boxes.JU).toMatchObject({ width: 0.2, height: 0.9 })
    expect(moved.boxes.JU!.x).toBeCloseTo(0.624, 9)
    // 폭 0.152로 크게 휘면 가로로만 반으로 줄인다. 세로(길이)는 그대로.
    const squeezed = fittedBoxes(boxes, { JU: { minX: 0.6, maxX: 0.752, minY: 0.1, maxY: 0.9 } }, allowed)
    expect(squeezed.boxes.JU!.width).toBeCloseTo(0.1, 9)
    expect(squeezed.boxes.JU!.height).toBe(0.9)
    expect(squeezed.boxes.JU!.x).toBeCloseTo(0.664, 9)
  })

  it('부위 네모는 휜 선의 불룩한 데까지 잰다', () => {
    const box = { x: 0, y: 0, width: 1, height: 1 }
    const bowed = { part: 'JU' as const, box, points: [{ x: 0.7, y: 0.1, handleOut: { x: 0.9, y: 0.3 } }, { x: 0.7, y: 0.9, handleIn: { x: 0.9, y: 0.7 } }], closed: false }
    const rect = partRects([bowed]).JU!
    expect(rect.minX).toBeCloseTo(0.7, 9)
    expect(rect.maxX).toBeCloseTo(0.85, 2)
  })
})
