import { describe, expect, it } from 'vitest'
import baseJamos from '../src/data/baseJamos.json'
import basePresets from '../src/data/basePresets.json'
import type { JamoData, LayoutSchema, LayoutType } from '../src/types'
import {
  DEFAULT_DESIGN_BODY,
  DEFAULT_FONT_GRID,
  DEFAULT_FONT_METRICS,
  DEFAULT_FONT_SPACE,
  type SampleGlyphEdit,
} from './calibrationProjectStore'
import { createCalibrationAnalysisSnapshot } from './calibrationAnalysisSnapshot'

describe('분석용 보정값 스냅샷', () => {
  it('문장에 사용된 자모와 유효 레이아웃만 포함한다', () => {
    const maps = baseJamos as unknown as {
      choseong: Record<string, JamoData>
      jungseong: Record<string, JamoData>
      jongseong: Record<string, JamoData>
    }
    const schemas = basePresets.schemas as unknown as Record<LayoutType, LayoutSchema>
    const snapshot = createCalibrationAnalysisSnapshot({
      sentenceLines: ['가 공'],
      fontSpace: DEFAULT_FONT_SPACE,
      grid: DEFAULT_FONT_GRID,
      designBody: DEFAULT_DESIGN_BODY,
      metrics: DEFAULT_FONT_METRICS,
      sampleGlyphEdits: [],
      maps,
      schemas,
      globalPadding: { top: .075, bottom: .075, left: .075, right: .075 },
      paddingOverrides: {},
    })

    expect(snapshot.kind).toBe('font-maker-calibration-analysis')
    expect(Object.keys(snapshot.jamoMasters.choseong)).toEqual(['ㄱ'])
    expect(Object.keys(snapshot.jamoMasters.jungseong)).toEqual(['ㅏ', 'ㅗ'])
    expect(Object.keys(snapshot.jamoMasters.jongseong)).toEqual(['ㅇ'])
    expect(snapshot.jamoGeometry.jungseong['ㅏ']).toMatchObject({
      mode: 'slot-normalized',
      intrinsicAspectRatio: null,
    })
    expect(Object.keys(snapshot.effectiveLayouts).sort()).toEqual([
      'choseong-jungseong-horizontal-jongseong',
      'choseong-jungseong-vertical',
    ])
    expect(snapshot.fontProject.layoutProfile).toEqual({
      'choseong-jungseong-horizontal-jongseong': {},
      'choseong-jungseong-vertical': {},
    })
    expect(snapshot.changeSummary).toEqual({
      editCount: 0,
      changedJamos: [],
      changedLayouts: [],
      lastEditedAt: null,
    })
  })

  it('현재 문장 밖에서 변경한 자모와 레이아웃의 최종값도 포함한다', () => {
    const maps = baseJamos as unknown as {
      choseong: Record<string, JamoData>
      jungseong: Record<string, JamoData>
      jongseong: Record<string, JamoData>
    }
    const schemas = basePresets.schemas as unknown as Record<LayoutType, LayoutSchema>
    const sampleGlyphEdits: SampleGlyphEdit[] = [
      {
        id: 'jamo-edit',
        createdAt: '2026-08-20T00:00:00.000Z',
        raw: {
          kind: 'stroke-move',
          glyph: '좋',
          component: { id: '좋:final:ㅎ', role: 'final', jamoId: 'ㅎ' },
          jamoType: 'jongseong',
          strokeId: 'ㅎ종-2',
          delta: { x: 0, y: -.05 },
        },
        inferredRule: { kind: 'jamo-master', jamoType: 'jongseong', jamoId: 'ㅎ', strokeId: 'ㅎ종-2' },
      },
      {
        id: 'layout-edit',
        createdAt: '2026-08-20T00:01:00.000Z',
        raw: {
          kind: 'component-move',
          glyph: '고',
          component: { id: '고:initial:ㄱ', role: 'initial', jamoId: 'ㄱ' },
          layoutType: 'choseong-jungseong-horizontal',
          parts: ['CH'],
          delta: { x: .05, y: 0 },
        },
        inferredRule: { kind: 'layout-profile', layoutType: 'choseong-jungseong-horizontal', parts: ['CH'] },
      },
    ]
    const snapshot = createCalibrationAnalysisSnapshot({
      sentenceLines: ['가'],
      fontSpace: DEFAULT_FONT_SPACE,
      grid: DEFAULT_FONT_GRID,
      designBody: DEFAULT_DESIGN_BODY,
      metrics: DEFAULT_FONT_METRICS,
      sampleGlyphEdits,
      maps,
      schemas,
      globalPadding: { top: .075, bottom: .075, left: .075, right: .075 },
      paddingOverrides: {},
    })

    expect(snapshot.version).toBe(4)
    expect(Object.keys(snapshot.jamoMasters.jongseong)).toEqual(['ㅎ'])
    expect(snapshot.jamoGeometry.jongseong['ㅎ']).toBeDefined()
    expect(Object.keys(snapshot.effectiveLayouts).sort()).toEqual([
      'choseong-jungseong-horizontal',
      'choseong-jungseong-vertical',
    ])
  })

  it('canonical schema 보정을 유효 레이아웃과 version 4 호환 profile에 exact 반영한다', () => {
    type SnapshotInput = Parameters<typeof createCalibrationAnalysisSnapshot>[0]
    type HasExternalLayoutProfile = 'layoutProfile' extends keyof SnapshotInput ? true : false
    const hasExternalLayoutProfile: HasExternalLayoutProfile = false
    expect(hasExternalLayoutProfile).toBe(false)

    const maps = baseJamos as unknown as {
      choseong: Record<string, JamoData>
      jungseong: Record<string, JamoData>
      jongseong: Record<string, JamoData>
    }
    const schemas = structuredClone(basePresets.schemas) as unknown as Record<LayoutType, LayoutSchema>
    const layoutType: LayoutType = 'choseong-jungseong-vertical'
    const overrides = {
      CH: { top: .045, bottom: .035, left: .105, right: .125 },
      JU: { top: -.01, bottom: .01, left: -.06, right: .06 },
    }
    schemas[layoutType].userPartOverrides = structuredClone(overrides)

    const snapshot = createCalibrationAnalysisSnapshot({
      sentenceLines: ['가 공'],
      fontSpace: DEFAULT_FONT_SPACE,
      grid: DEFAULT_FONT_GRID,
      designBody: DEFAULT_DESIGN_BODY,
      metrics: DEFAULT_FONT_METRICS,
      sampleGlyphEdits: [],
      maps,
      schemas,
      globalPadding: { top: .075, bottom: .075, left: .075, right: .075 },
      paddingOverrides: {},
    })

    expect(snapshot.effectiveLayouts[layoutType]?.userPartOverrides).toEqual(overrides)
    expect(snapshot.fontProject.layoutProfile).toEqual({
      'choseong-jungseong-horizontal-jongseong': {},
      [layoutType]: overrides,
    })

    schemas[layoutType].userPartOverrides!.CH!.top = .5
    expect(snapshot.effectiveLayouts[layoutType]?.userPartOverrides).toEqual(overrides)
    expect(snapshot.fontProject.layoutProfile[layoutType]).toEqual(overrides)
  })
})
