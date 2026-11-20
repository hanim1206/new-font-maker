import { describe, expect, it } from 'vitest'
import { DEFAULT_LAYOUT_SCHEMAS } from '../src/data/layoutConfigs'
import { resolveGlyphInkPrimitives } from '../src/services/glyphInkResolver'
import { getBaseJamo } from '../src/stores/jamoStore'
import type { BoxConfig, JamoData, Part } from '../src/types'
import { decomposeSyllable } from '../src/utils/hangulUtils'
import { correctGlyph, expectedGap, type FenceCorrection, finalBottomTolerance, GOTHIC_FENCE, measureGlyph, movedBoxes, shakenBoxes, summarize, type GlyphMeasure, type ShakeLevel } from './fenceBand'

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

  it('한계선은 받침 밑선만 정해져 있다 — 안전선보다 넓고, 나머지 값은 당기지 않는다', () => {
    expect(finalBottomTolerance(GOTHIC_FENCE, 'limit')!).toBeGreaterThan(finalBottomTolerance(GOTHIC_FENCE, 'safe')!)
    const base = measured('곤')
    const now = measured('곤', shakenBoxes(base.boxes, base.layout, 0, 2)).measure
    const limit = correctGlyph({ layout: base.layout, now, reference: base.measure, line: 'limit' })
    expect(limit.pulls.map((item) => item.value)).toEqual(['finalBottom'])
    expect(limit.moves.upperDy).toBe(0)
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
    expect(rows.map((row) => row.value)).toEqual(['finalBottom', 'gap', 'topLine', 'centroid'])
    expect(rows.find((row) => row.value === 'finalBottom')).toMatchObject({ checked: 2, count: 2 })
    expect(rows.find((row) => row.value === 'gap')).toMatchObject({ checked: 2, count: 2, word: '벌림' })
  })
})
