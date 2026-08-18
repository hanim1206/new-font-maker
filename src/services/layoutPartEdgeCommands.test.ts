import { describe, expect, it } from 'vitest'
import type { LayoutSchema } from '../types'
import { BASE_PRESETS_SCHEMAS, calculateBoxes } from '../utils/layoutCalculator'
import { resizeLayoutPartEdge } from './layoutPartEdgeCommands'

const schema: LayoutSchema = {
  id: 'choseong-jungseong-vertical',
  slots: ['CH', 'JU'],
  splits: [{ axis: 'x', value: 0.6 }],
  padding: { top: 0, bottom: 0, left: 0, right: 0 },
}

describe('레이아웃 박스 변 조절', () => {
  it('위쪽 변만 아래로 옮긴다', () => {
    const box = calculateBoxes(schema).CH!
    const next = resizeLayoutPartEdge(schema, 'CH', box, 'top', 0.1)
    expect(calculateBoxes(next).CH).toEqual({ x: 0, y: 0.1, width: 0.6, height: 0.9 })
  })

  it('오른쪽 변을 바깥으로 늘리고 최소 크기를 지킨다', () => {
    const box = calculateBoxes(schema).CH!
    const expanded = resizeLayoutPartEdge(schema, 'CH', box, 'right', -0.1)
    expect(calculateBoxes(expanded).CH?.width).toBeCloseTo(0.7)
    const collapsed = resizeLayoutPartEdge(schema, 'CH', box, 'right', 1)
    expect(calculateBoxes(collapsed).CH?.width).toBeCloseTo(0.1)
  })

  it('혼합중성 자모별 기본 보정보다 사용자 박스 변경을 우선한다', () => {
    const mixed = structuredClone(BASE_PRESETS_SCHEMAS['choseong-jungseong-mixed-jongseong'])
    const context = { cho: 'ㄸ', jung: 'ㅟ', jong: 'ㅁ' }
    const before = calculateBoxes(mixed, context).JU_V!
    const next = resizeLayoutPartEdge(mixed, 'JU_V', before, 'bottom', -0.08)
    const after = calculateBoxes(next, context).JU_V!
    expect(after.y + after.height).toBeGreaterThan(before.y + before.height)
  })
})
