import { describe, expect, it } from 'vitest'
import type { LayoutSchema, LayoutType } from '../types'
import { BASE_PRESETS_SCHEMAS } from '../utils/layoutCalculator'
import { createStarterShapeSystemV2 } from './defaultShapeSystemV2'
import { connectLayoutGridFromSchemasV1 } from './layoutGridConnectionV1'
import { setLayoutGridRailV1 } from './layoutGridRailCommandsV1'
import { parseLayoutGridSystemSourceV1 } from './layoutGridSystemSourceV1'
import { resolveAllGridBoundSchemas } from './layoutGridProjection'

function connectedSource() {
  const result = connectLayoutGridFromSchemasV1({
    source: createStarterShapeSystemV2(),
    transactionId: 'tx:connect',
    schemas: structuredClone(BASE_PRESETS_SCHEMAS) as Record<LayoutType, LayoutSchema>,
  })
  if (!result.ok) throw new Error(result.error.message)
  return result.source
}

describe('공통 layout Rail direct command', () => {
  it('stable Rail ID 하나를 한 transaction으로 이동하고 bound 7종 schema를 다시 투영한다', () => {
    const source = connectedSource()
    const before = structuredClone(source)
    const parsed = parseLayoutGridSystemSourceV1(source.layoutGridSystem)
    if (!parsed.ok) throw new Error('fixture grid가 유효하지 않습니다.')
    const railId = parsed.source.bindings['choseong-jungseong-vertical'].splitRailIds['choseong-jungseong-vertical:x:ch-ju']
    const rail = parsed.resolvedGrid.xRails.find((candidate) => candidate.id === railId)!
    const result = setLayoutGridRailV1(source, {
      transactionId: 'tx:move', railId: rail.id,
      position: { kind: 'absolute', value: rail.value + 0.005 },
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(source).toEqual(before)
    expect(result.transaction).toMatchObject({ id: 'tx:move', command: 'set-layout-grid-rail', before })
    const afterGrid = parseLayoutGridSystemSourceV1(result.source.layoutGridSystem)
    if (!afterGrid.ok) throw new Error('변경 결과 grid가 유효하지 않습니다.')
    expect(afterGrid.resolvedGrid.xRails.find((candidate) => candidate.id === rail.id)?.value).toBe(rail.value + 0.005)
    const projection = resolveAllGridBoundSchemas({
      schemas: BASE_PRESETS_SCHEMAS,
      grid: afterGrid.resolvedGrid,
      bindings: afterGrid.source.bindings,
    })
    expect(projection.ok).toBe(true)
    if (projection.ok) expect(projection.schemas['choseong-jungseong-vertical'].splits).not.toEqual(BASE_PRESETS_SCHEMAS['choseong-jungseong-vertical'].splits)
  })

  it('stale Rail, no-op, 파생 Rail 또는 이웃 간격 침범은 source를 바꾸지 않는다', () => {
    const source = connectedSource()
    const before = structuredClone(source)
    const parsed = parseLayoutGridSystemSourceV1(source.layoutGridSystem)
    if (!parsed.ok) throw new Error('fixture grid가 유효하지 않습니다.')
    const rail = parsed.resolvedGrid.xRails[1]
    const attempts = [
      { railId: 'layout-grid:stale', value: rail.value },
      { railId: rail.id, value: rail.value },
      { railId: rail.id, value: parsed.resolvedGrid.xRails[2].value },
    ]
    for (const attempt of attempts) {
      expect(setLayoutGridRailV1(source, {
        transactionId: `tx:reject:${attempt.railId}`,
        railId: attempt.railId,
        position: { kind: 'absolute', value: attempt.value },
      })).toMatchObject({ ok: false })
      expect(source).toEqual(before)
    }
  })
})
