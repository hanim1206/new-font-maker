import { describe, expect, it } from 'vitest'
import { createJamoRoleMasterId } from './jamoConstruction'
import { createStarterShapeSystemV2 } from './defaultShapeSystemV2'
import { parseShapeSystemSourceV2 } from './shapeSystemSourceV2'

describe('추천 Shape System v2 시작 구조', () => {
  it('7개 역할 grid와 CH/STANDALONE ㄱ 원형만 결정적으로 만든다', () => {
    const first = createStarterShapeSystemV2()
    const second = createStarterShapeSystemV2()
    expect(second).toEqual(first)
    expect(parseShapeSystemSourceV2(JSON.parse(JSON.stringify(first)))).toEqual({ ok: true, source: first })
    expect(first.layoutGridSystem).toBeNull()
    expect(first.contextPresetCatalog).toEqual(expect.objectContaining({ roleDefaults: [], contextPresets: [] }))
    expect(first.roleSources.CH.masters.map(({ id }) => id)).toEqual([createJamoRoleMasterId('ㄱ', 'CH')])
    expect(first.roleSources.STANDALONE.masters.map(({ id }) => id)).toEqual([createJamoRoleMasterId('ㄱ', 'STANDALONE')])
    for (const role of ['JU_VERTICAL', 'JU_HORIZONTAL', 'JU_H', 'JU_V', 'JO'] as const) {
      expect(first.roleSources[role].masters).toEqual([])
    }
  })
})
