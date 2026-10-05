import { describe, expect, it } from 'vitest'
import type { JamoData, StrokeDataV2 } from '../types'
import { applyPenToJamo, penResetCount, presetChannelOf, recognizePenJamo, viewBoxToJamoBox } from './penJamo'

const stroke = (id: string, points: [number, number][]): StrokeDataV2 => ({
  id, closed: false, thickness: .07, points: points.map(([x, y]) => ({ x, y })),
})
const ㄱ: JamoData = { char: 'ㄱ', type: 'choseong', strokes: [stroke('ㄱ-1', [[0, 0], [.98, 0], [.98, 1]])] }
const ㅏ: JamoData = { char: 'ㅏ', type: 'jungseong', strokes: [stroke('ㅏ-1', [[0, 0], [0, 1]]), stroke('ㅏ-2', [[0, .5], [1, .5]])] }

describe('펜 자모', () => {
  it('viewBox 좌표를 자모 상자 0–1로 옮긴다', () => {
    const box = { x: .2, y: .1, width: .5, height: .6 }
    const [a, b] = viewBoxToJamoBox([{ x: 20, y: 10 }, { x: 70, y: 70 }], box)
    expect(a.x).toBeCloseTo(0)
    expect(a.y).toBeCloseTo(0)
    expect(b.x).toBeCloseTo(1)
    expect(b.y).toBeCloseTo(1)
    // 상자 밖은 잘라 내지 않는다
    expect(viewBoxToJamoBox([{ x: 10, y: 10 }], box)[0].x).toBeLessThan(0)
  })

  it('프리셋 채널: 기본 획 → 세로부 → 가로부', () => {
    expect(presetChannelOf(ㄱ)).toBe('strokes')
    expect(presetChannelOf({ verticalStrokes: ㅏ.strokes })).toBe('verticalStrokes')
    expect(presetChannelOf({ horizontalStrokes: ㅏ.strokes })).toBe('horizontalStrokes')
    expect(presetChannelOf({ strokes: [], verticalStrokes: ㅏ.strokes })).toBe('verticalStrokes')
  })

  it('ㄱ을 한 획으로 그으면 인식되고 ㄱ-1이 된다', () => {
    const raw = [{ x: .05, y: .08 }, { x: .5, y: .06 }, { x: .9, y: .05 }, { x: .92, y: .5 }, { x: .92, y: .95 }]
    const result = recognizePenJamo({ strokes: [raw] }, ㄱ)
    expect(result.state).toBe('recognized')
    expect(result.byChannel.strokes?.strokes.map((item) => item.id)).toEqual(['ㄱ-1'])
    expect(result.byChannel.strokes?.missing).toEqual([])
  })

  it('ㅏ의 기둥만 그으면 일부 자유가 되고 안 그린 획을 알린다', () => {
    const raw = [{ x: .5, y: .05 }, { x: .5, y: .5 }, { x: .5, y: .95 }]
    const result = recognizePenJamo({ strokes: [raw] }, ㅏ, { fill: false })
    expect(result.state).not.toBe('recognized')
    expect(result.byChannel.strokes?.missing.length).toBeGreaterThan(0)
  })

  it('applyPenToJamo는 그린 채널만 바꾸고 overrides · contextStrokes를 지운다', () => {
    const before: JamoData = {
      ...ㅏ,
      verticalStrokes: [stroke('v', [[0, 0], [0, 1]])],
      overrides: [{ id: 'o', conditionGroups: [], strokes: [] } as never],
      contextStrokes: { A: [stroke('x', [[0, 0], [1, 1]])] } as never,
    }
    const drawn = [stroke('ㅏ-1', [[.1, 0], [.1, 1]])]
    const after = applyPenToJamo(before, { strokes: drawn })
    expect(after.strokes).toEqual(drawn)
    expect(after.verticalStrokes).toEqual(before.verticalStrokes)
    expect(after.overrides).toBeUndefined()
    expect(after.contextStrokes).toBeUndefined()
    // 원본은 건드리지 않는다
    expect(before.overrides).toHaveLength(1)
    expect(applyPenToJamo(before, { strokes: [] }).strokes).toEqual(before.strokes)
  })

  it('penResetCount가 사라질 것을 센다', () => {
    expect(penResetCount(undefined)).toBe(0)
    expect(penResetCount(ㄱ)).toBe(0)
    expect(penResetCount({ overrides: [{} as never, {} as never], contextStrokes: { A: [] } as never, contextualInkSafety: {} as never })).toBe(4)
  })
})
