import { describe, expect, it } from 'vitest'
import type { LayoutSchema, LayoutType, ShapeSystemSourceV2 } from '../types'
import { BASE_PRESETS_SCHEMAS, calculateRawBoxes } from '../utils/layoutCalculator'
import { createStarterShapeSystemV2 } from './defaultShapeSystemV2'
import { resolveAllGridBoundSchemas } from './layoutGridProjection'
import { connectLayoutGridFromSchemasV1, createLayoutGridSystemFromSchemas } from './layoutGridConnectionV1'
import { parseLayoutGridSystemSourceV1 } from './layoutGridSystemSourceV1'

const SHARED: readonly LayoutType[] = [
  'choseong-only',
  'choseong-jungseong-vertical',
  'choseong-jungseong-horizontal',
  'choseong-jungseong-mixed',
  'choseong-jungseong-vertical-jongseong',
  'choseong-jungseong-horizontal-jongseong',
  'choseong-jungseong-mixed-jongseong',
]

describe('legacy schema 공통 layout grid 연결', () => {
  it('기존 7개 schema를 stable Rail/binding 원본으로 올려도 계산된 slot은 exact 보존한다', () => {
    const schemas = structuredClone(BASE_PRESETS_SCHEMAS) as Record<LayoutType, LayoutSchema>
    const grid = createLayoutGridSystemFromSchemas(schemas)
    expect(grid.ok).toBe(true)
    if (!grid.ok) return
    const parsed = parseLayoutGridSystemSourceV1(grid.source)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const resolved = resolveAllGridBoundSchemas({ schemas, grid: parsed.resolvedGrid, bindings: parsed.source.bindings })
    expect(resolved.ok).toBe(true)
    if (!resolved.ok) return
    for (const layoutType of SHARED) {
      expect(calculateRawBoxes(resolved.schemas[layoutType])).toEqual(calculateRawBoxes(schemas[layoutType]))
    }
    expect(Object.keys(grid.source.bindings)).toHaveLength(7)
    expect(JSON.stringify(grid.source)).not.toContain('resolvedGrid')
  })

  it('명시적 연결은 한 Shape transaction만 만들며 이미 연결된 source는 fail-closed한다', () => {
    const starter = createStarterShapeSystemV2()
    const schemas = structuredClone(BASE_PRESETS_SCHEMAS) as Record<LayoutType, LayoutSchema>
    const before = JSON.stringify(starter)
    const connected = connectLayoutGridFromSchemasV1({ source: starter, transactionId: 'tx:connect-layout', schemas })
    expect(connected.ok).toBe(true)
    if (!connected.ok) return
    expect(JSON.stringify(starter)).toBe(before)
    expect(connected.transaction).toMatchObject({ id: 'tx:connect-layout', command: 'connect-layout-grid', before: starter })
    expect(connected.source.layoutGridSystem).not.toBeNull()
    const retry = connectLayoutGridFromSchemasV1({ source: connected.source, transactionId: 'tx:retry', schemas })
    expect(retry).toMatchObject({ ok: false, error: { code: 'already-connected' } })
    expect(JSON.stringify(connected.source)).toBe(JSON.stringify(connected.transaction.after as ShapeSystemSourceV2))
  })
})
