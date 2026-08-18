import { describe, expect, it } from 'vitest'
import type { LayoutSchema } from '../types'
import { calculateBoxes } from '../utils/layoutCalculator'
import { getChJungVerticalGap, setChJungVerticalGap } from './layoutGapCommands'

const schema: LayoutSchema = {
  id: 'choseong-jungseong-vertical-jongseong',
  slots: ['CH', 'JU', 'JO'],
  splits: [{ axis: 'x', value: 0.6 }, { axis: 'y', value: 0.55 }],
  padding: { top: 0, bottom: 0, left: 0, right: 0 },
}

describe('세로중성 초성-중성 갭', () => {
  it('잠금이 없으면 양쪽 파트를 같은 크기로 줄인다', () => {
    const next = setChJungVerticalGap(schema, { size: 0.1 })
    const boxes = calculateBoxes(next)
    expect(boxes.CH?.width).toBeCloseTo(0.55)
    expect(boxes.JU?.x).toBeCloseTo(0.65)
    expect(boxes.JO?.width).toBeCloseTo(1)
  })

  it('초성을 고정하면 중성만 줄인다', () => {
    const next = setChJungVerticalGap(schema, { size: 0.1, anchor: 'before' })
    const boxes = calculateBoxes(next)
    expect(boxes.CH?.width).toBeCloseTo(0.6)
    expect(boxes.JU?.x).toBeCloseTo(0.7)
    expect(getChJungVerticalGap(next).anchor).toBe('before')
  })

  it('중성을 고정하면 초성만 줄인다', () => {
    const next = setChJungVerticalGap(schema, { size: 0.1, anchor: 'after' })
    const boxes = calculateBoxes(next)
    expect(boxes.CH?.width).toBeCloseTo(0.5)
    expect(boxes.JU?.x).toBeCloseTo(0.6)
  })

  it('현재 경계를 유지한 채 잠금 방향만 바꾼다', () => {
    const spaced = setChJungVerticalGap(schema, { size: 0.1 })
    const before = calculateBoxes(spaced)
    const locked = setChJungVerticalGap(spaced, { anchor: 'before' })
    const after = calculateBoxes(locked)
    expect(after.CH).toEqual(before.CH)
    expect(after.JU).toEqual(before.JU)
  })

  it('음수 갭에서 두 파트가 겹친다', () => {
    const overlapped = setChJungVerticalGap(schema, { size: -0.1 })
    const boxes = calculateBoxes(overlapped)
    expect(boxes.CH!.x + boxes.CH!.width).toBeCloseTo(0.65)
    expect(boxes.JU?.x).toBeCloseTo(0.55)
    expect(getChJungVerticalGap(overlapped).size).toBeCloseTo(-0.1)
  })

  it('초성을 잠근 뒤 음수 갭으로 줄이면 중성 경계만 움직인다', () => {
    const locked = setChJungVerticalGap(schema, { anchor: 'before' })
    const overlapped = setChJungVerticalGap(locked, { size: -0.1 })
    const boxes = calculateBoxes(overlapped)
    expect(boxes.CH?.width).toBeCloseTo(0.6)
    expect(boxes.JU?.x).toBeCloseTo(0.5)
  })
})
