import { describe, expect, it } from 'vitest'
import type { LayoutSchema } from '../types'
import { moveLayoutParts } from './mobileLayoutCommands'

const schema: LayoutSchema = {
  id: 'choseong-jungseong-horizontal-jongseong',
  slots: ['CH', 'JU', 'JO'],
}

describe('moveLayoutParts', () => {
  it('파트 크기를 유지하면서 레이아웃 오프셋을 이동한다', () => {
    const result = moveLayoutParts(schema, ['CH'], { CH: { x: 0.1, y: 0.1, width: 0.35, height: 0.3 } }, { x: 0.05, y: -0.025 }, 0.025)
    expect(result.delta.x).toBeCloseTo(0.05)
    expect(result.schema.partOverrides?.CH?.left).toBeCloseTo(0.05)
    expect(result.schema.partOverrides?.CH?.right).toBeCloseTo(-0.05)
    expect(result.schema.partOverrides?.CH?.top).toBeCloseTo(-0.025)
    expect(result.schema.partOverrides?.CH?.bottom).toBeCloseTo(0.025)
    expect(schema.partOverrides).toBeUndefined()
  })

  it('혼합 중성의 두 파트를 같은 거리로 이동한다', () => {
    const result = moveLayoutParts(schema, ['JU_H', 'JU_V'], {
      JU_H: { x: 0.1, y: 0.4, width: 0.8, height: 0.2 },
      JU_V: { x: 0.6, y: 0.1, width: 0.2, height: 0.6 },
    }, { x: -0.05, y: 0 })
    expect(result.schema.partOverrides?.JU_H?.left).toBeCloseTo(-0.05)
    expect(result.schema.partOverrides?.JU_V?.left).toBeCloseTo(-0.05)
  })
})
