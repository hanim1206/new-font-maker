import { describe, expect, it } from 'vitest'
import type { JamoPartRole, JamoVariantContext, LayoutType } from '../types'
import { BASE_PRESETS_SCHEMAS, calculateBoxes } from '../utils/layoutCalculator'
import { resolveContextualPartGrid } from './contextPartGridResolver'
import { createStarterShapeSystemV2 } from './defaultShapeSystemV2'
import { materializeFinalGlyphInk } from './finalGlyphInk'
import { createJamoRoleMasterId } from './jamoConstruction'
import { partForJamoRole } from './jamoContextRoles'
import { projectPartGridToSlot } from './partGridSlotProjection'
import { resolveProjectedShapeGlyphInkPrimitives } from './shapeGlyphInkResolver'

/**
 * 아직 layoutGridSystem을 소비하지 않는 Shape 출력 연결 전 계약이다.
 * 기존 schema가 계산한 CH slot을 명시적으로 전달해 대표 문맥의 선택 경계를 고정한다.
 */
const REPRESENTATIVE_OUTPUTS = [
  {
    glyphId: 'ㄱ', role: 'STANDALONE', layoutType: 'choseong-only',
    context: { baseContext: 'choseong-only' }, jamo: { cho: 'ㄱ', jung: '', jong: '' },
  },
  {
    glyphId: '가', role: 'CH', layoutType: 'choseong-jungseong-vertical',
    context: { baseContext: 'vertical' }, jamo: { cho: 'ㄱ', jung: 'ㅏ', jong: '' },
  },
  {
    glyphId: '고', role: 'CH', layoutType: 'choseong-jungseong-horizontal',
    context: { baseContext: 'horizontal' }, jamo: { cho: 'ㄱ', jung: 'ㅗ', jong: '' },
  },
  {
    glyphId: '과', role: 'CH', layoutType: 'choseong-jungseong-mixed',
    context: { baseContext: 'mixed' }, jamo: { cho: 'ㄱ', jung: 'ㅘ', jong: '' },
  },
  {
    glyphId: '각', role: 'CH', layoutType: 'choseong-jungseong-vertical-jongseong',
    context: { baseContext: 'vertical-with-jongseong' }, jamo: { cho: 'ㄱ', jung: 'ㅏ', jong: 'ㄱ' },
  },
  {
    glyphId: '곡', role: 'CH', layoutType: 'choseong-jungseong-horizontal-jongseong',
    context: { baseContext: 'horizontal-with-jongseong' }, jamo: { cho: 'ㄱ', jung: 'ㅗ', jong: 'ㄱ' },
  },
  {
    glyphId: '곽', role: 'CH', layoutType: 'choseong-jungseong-mixed-jongseong',
    context: { baseContext: 'mixed-with-jongseong' }, jamo: { cho: 'ㄱ', jung: 'ㅘ', jong: 'ㄱ' },
  },
] as const satisfies readonly {
  glyphId: string
  role: Extract<JamoPartRole, 'STANDALONE' | 'CH'>
  layoutType: LayoutType
  context: JamoVariantContext
  jamo: { cho: string; jung: string; jong: string }
}[]

const ROUND_STROKE_STYLE = {
  mode: 'brush' as const,
  brush: { tip: 'round' as const, aspectRatio: 1, angle: 0 },
}

describe('Shape 출력 seam의 대표 ㄱ 역할·문맥·slot 선택', () => {
  it.each(REPRESENTATIVE_OUTPUTS)(
    '$glyphId는 $role master와 legacy $layoutType CH slot을 사용한다',
    ({ glyphId, role, layoutType, context, jamo }) => {
      const source = createStarterShapeSystemV2()
      const scope = source.roleSources[role]
      const masterId = createJamoRoleMasterId('ㄱ', role)
      const expectedSlot = calculateBoxes(BASE_PRESETS_SCHEMAS[layoutType], jamo).CH

      // 이 계약은 layout grid 도입 전 legacy schema slot만 입력으로 삼는다.
      expect(source.layoutGridSystem).toBeNull()
      expect(expectedSlot).toBeDefined()
      if (!expectedSlot) throw new Error('대표 글자의 CH slot이 필요합니다.')

      const contextual = resolveContextualPartGrid({
        source: scope,
        catalog: source.contextPresetCatalog,
        masterId,
        requestedContext: context,
      })
      expect(contextual.ok).toBe(true)
      if (!contextual.ok) throw new Error(contextual.issues[0]?.message)
      expect(contextual.master).toMatchObject({ id: masterId, jamoId: 'ㄱ', role })
      expect(contextual.provenance.requestedContext).toEqual(context)

      const projection = projectPartGridToSlot({
        contextual,
        part: partForJamoRole(role),
        slot: expectedSlot,
      })
      expect(projection.ok).toBe(true)
      if (!projection.ok) throw new Error(projection.issues[0]?.message)
      expect(projection.resolvedPartGrid).toMatchObject({
        sourceGridId: scope.grid.id,
        role,
        part: 'CH',
        slot: expectedSlot,
      })

      const resolved = resolveProjectedShapeGlyphInkPrimitives({
        projection,
        glyphId,
        weightMultiplier: 1,
      })
      expect(resolved.ok).toBe(true)
      if (!resolved.ok) throw new Error(resolved.issues[0]?.message)
      expect(resolved.master).toMatchObject({ id: masterId, jamoId: 'ㄱ', role })
      expect(resolved.grid.slot).toEqual(expectedSlot)
      expect(resolved.primitives).toHaveLength(1)
      expect(resolved.primitives[0].source).toMatchObject({
        kind: 'part-grid', glyphId, part: 'CH', jamoId: 'ㄱ',
      })
      const finalInk = materializeFinalGlyphInk(resolved.primitives, ROUND_STROKE_STYLE, {
        unitsPerEm: 1000,
        maxCurveErrorFontUnits: 0.5,
      })
      expect(finalInk.ok).toBe(true)
      if (finalInk.ok) expect(finalInk.ink.regions.length).toBeGreaterThan(0)
    },
  )
})
