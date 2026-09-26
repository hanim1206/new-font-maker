import { afterEach, describe, expect, it } from 'vitest'
import baseJamos from '../data/baseJamos.json'
import type { JamoData, StrokeDataV2 } from '../types'
import { validateFontDataPayload } from './fontDataPayloadValidation'
import { DEFAULT_STEM_BEAK, normalizeStemBeak, STEM_BEAK_SHAPES, stemBeakInkGroups, type StemBeakSource, type StemBeakStyle } from './stemBeak'

type JamoType = JamoData['type']
const presets = baseJamos as unknown as Record<JamoType, Record<string, JamoData>>
const UNIT_BOX = { x: 0, y: 0, width: 1, height: 1 }
const ON: StemBeakStyle = { enabled: true, shape: 'angled', size: 1, angle: 25 }
const CHANNELS = ['strokes', 'horizontalStrokes', 'verticalStrokes'] as const

function sourcesOf(jamo: JamoData): StemBeakSource[] {
  return CHANNELS.flatMap((channel) => ((jamo[channel] ?? []) as StrokeDataV2[]).map((stroke) => ({ stroke, box: UNIT_BOX, weightMultiplier: 1, group: channel })))
}

/** 획 id → 부리 수(0인 획은 뺀다). */
function beaksOf(type: JamoType, char: string, style: StemBeakStyle = ON, extra: StrokeDataV2[] = []): Record<string, number> {
  const jamo = structuredClone(presets[type][char])
  jamo.strokes = [...((jamo.strokes ?? []) as StrokeDataV2[]), ...extra]
  const sources = sourcesOf(jamo)
  const groups = stemBeakInkGroups(sources, style)
  return Object.fromEntries(sources.map((source, index) => [source.stroke.id, groups[index].length] as const).filter(([, count]) => count > 0))
}

describe('세로줄기 부리 G0 대표', () => {
  it('ㅣ · ㅏ — 기둥 머리에 하나, 곁줄기에는 없다', () => {
    expect(beaksOf('jungseong', 'ㅣ')).toEqual({ 'ㅣ-1': 1 })
    expect(beaksOf('jungseong', 'ㅏ')).toEqual({ 'ㅏ-1': 1 })
  })

  it('ㄴ — 세로 마디의 머리가 획의 끝이라 붙는다', () => {
    expect(beaksOf('choseong', 'ㄴ')).toEqual({ 'ㄴ-1': 1 })
  })

  it('ㅂ — 획 하나 안의 두 세로 마디에 다 붙고 걸침에는 없다', () => {
    expect(beaksOf('choseong', 'ㅂ')).toEqual({ 'ㅂ-1': 2 })
  })

  it('꺼져 있으면 아무것도 안 나온다', () => {
    expect(beaksOf('jungseong', 'ㅣ', DEFAULT_STEM_BEAK)).toEqual({})
    expect(stemBeakInkGroups(sourcesOf(presets.jungseong['ㅣ']), undefined)).toEqual([[]])
  })
})

describe('세로줄기 부리 G1 홀드아웃', () => {
  it('안 붙는 곳 — 머리가 꺾임이거나 닫힌 획이거나 다른 획에 닿은 머리', () => {
    for (const char of ['ㄱ', 'ㄷ', 'ㄹ', 'ㅌ', 'ㅁ', 'ㅍ', 'ㅇ']) expect(beaksOf('choseong', char), char).toEqual({})
    expect(beaksOf('jungseong', 'ㅜ')).toEqual({})
    expect(beaksOf('jungseong', 'ㅡ')).toEqual({})
  })

  it('붙는 곳 — ㅗ 짧은기둥, ㅐ 두 기둥, 섞임홀자의 가로부 짧은기둥과 세로부 기둥', () => {
    expect(beaksOf('jungseong', 'ㅗ')).toEqual({ 'ㅗ-1': 1 })
    expect(beaksOf('jungseong', 'ㅐ')).toEqual({ 'ㅐ-1': 1, 'ㅐ-3': 1 })
    expect(beaksOf('jungseong', 'ㅘ')).toEqual({ 'ㅘ-1': 1, 'ㅘ-3': 1 })
  })

  it('받침에도 붙는다', () => {
    expect(beaksOf('jongseong', 'ㄴ')).toEqual({ 'ㄴ종-1': 1 })
    expect(beaksOf('jongseong', 'ㅂ')).toEqual({ 'ㅂ종-1': 2 })
  })

  it('꼭지도 세로줄기라 붙는다(다 붙이는 전제)', () => {
    expect(beaksOf('choseong', 'ㅊ')).toEqual({ 'ㅊ-dot': 1 })
    expect(beaksOf('choseong', 'ㅎ')).toEqual({ 'ㅎ-1': 1 })
  })

  it('새로 그린 세로 자유 획에도 붙고, 빗금에는 안 붙는다', () => {
    const vertical: StrokeDataV2 = { id: 'stroke-1', points: [{ x: 0.6, y: 0.1 }, { x: 0.6, y: 0.9 }], closed: false, thickness: 0.07 }
    const diagonal: StrokeDataV2 = { id: 'stroke-2', points: [{ x: 0.9, y: 0.1 }, { x: 0.5, y: 0.9 }], closed: false, thickness: 0.07 }
    expect(beaksOf('jungseong', 'ㅡ', ON, [vertical, diagonal])).toEqual({ 'stroke-1': 1 })
  })

  it('부리는 머리의 왼쪽 위로 나가고 줄기 머리를 덮는다', () => {
    const stroke: StrokeDataV2 = { id: 's', points: [{ x: 0.5, y: 0.2 }, { x: 0.5, y: 0.8 }], closed: false, thickness: 0.1 }
    const box = { x: 0.1, y: 0, width: 0.5, height: 1 }
    const [[[contour]]] = stemBeakInkGroups([{ stroke, box, weightMultiplier: 2, group: 'g' }], ON)
    const headX = 0.1 + 0.5 * 0.5
    const width = 0.2
    const [rightTop, tip, leftLow, rightLow] = contour
    expect(rightTop).toEqual({ x: headX + width / 2, y: 0.2 })
    expect(tip.x).toBeCloseTo(headX - width / 2 - 0.6 * width, 6)
    expect(tip.y).toBeLessThan(0.2)
    expect(leftLow.x).toBeCloseTo(headX - width / 2, 6)
    expect(leftLow.y).toBeCloseTo(0.2 + 0.9 * width, 6)
    expect(rightLow.x).toBeCloseTo(headX + width / 2, 6)
  })

  it('모양 다섯 가지 — 어느 것이든 줄기 머리의 두 모서리를 덮고, 양쪽 모양만 오른쪽으로도 나간다', () => {
    const stroke: StrokeDataV2 = { id: 's', points: [{ x: 0.5, y: 0.2 }, { x: 0.5, y: 0.8 }], closed: false, thickness: 0.1 }
    const inside = (point: { x: number; y: number }, ring: Array<{ x: number; y: number }>) => ring.reduce((hit, a, index) => {
      const b = ring[(index + 1) % ring.length]
      return (a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x ? !hit : hit
    }, false)
    for (const { id } of STEM_BEAK_SHAPES) {
      const [[[contour]]] = stemBeakInkGroups([{ stroke, box: UNIT_BOX, weightMultiplier: 1, group: 'g' }], { ...ON, shape: id })
      expect(inside({ x: 0.5 - 0.045, y: 0.205 }, contour), `${id} 왼쪽 모서리`).toBe(true)
      expect(inside({ x: 0.5 + 0.045, y: 0.205 }, contour), `${id} 오른쪽 모서리`).toBe(true)
      expect(Math.min(...contour.map(({ x }) => x)), `${id} 왼쪽으로 나감`).toBeLessThan(0.45 - 1e-6)
      const right = Math.max(...contour.map(({ x }) => x))
      if (id === 'bar' || id === 'flare') expect(right, id).toBeGreaterThan(0.55 + 1e-6)
      else if (id !== 'round') expect(right, id).toBeCloseTo(0.55, 6)
    }
  })

  it('납작 붓촉이면 부리 폭을 붓촉이 실제로 남기는 줄기 폭에 맞춘다', () => {
    const stroke: StrokeDataV2 = { id: 's', points: [{ x: 0.5, y: 0.2 }, { x: 0.5, y: 0.8 }], closed: false, thickness: 0.1 }
    const source = [{ stroke, box: UNIT_BOX, weightMultiplier: 1, group: 'g' }]
    const rightEdge = (renderStyle?: Parameters<typeof stemBeakInkGroups>[2]) => stemBeakInkGroups(source, ON, renderStyle)[0][0][0][0].x
    expect(rightEdge()).toBeCloseTo(0.55, 6)
    expect(rightEdge({ mode: 'brush', brush: { tip: 'round', aspectRatio: 0.5, angle: 0 } })).toBeCloseTo(0.55, 6)
    // 긴 축이 세로로 선 납작 붓촉(각도 90°)은 세로줄기를 짧은 축 폭으로 남긴다: 0.1 × 0.4.
    expect(rightEdge({ mode: 'brush', brush: { tip: 'ellipse', aspectRatio: 0.4, angle: 90 } })).toBeCloseTo(0.5 + 0.02, 3)
    expect(rightEdge({ mode: 'brush', brush: { tip: 'ellipse', aspectRatio: 0.4, angle: 0 } })).toBeCloseTo(0.55, 3)
  })

  it('짧은 줄기에서는 부리 깊이가 줄기 길이를 넘지 않는다', () => {
    const stroke: StrokeDataV2 = { id: 's', points: [{ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.52 }], closed: false, thickness: 0.1 }
    const [[[contour]]] = stemBeakInkGroups([{ stroke, box: UNIT_BOX, weightMultiplier: 1, group: 'g' }], { ...ON, size: 2 })
    expect(Math.max(...contour.map(({ y }) => y))).toBeCloseTo(0.52, 6)
  })

  it('값은 범위 안으로 다듬는다', () => {
    expect(normalizeStemBeak(undefined)).toEqual(DEFAULT_STEM_BEAK)
    expect(normalizeStemBeak({ enabled: true, shape: 'nope', size: 9, angle: -200 })).toEqual({ enabled: true, shape: 'angled', size: 2, angle: -60 })
    expect(normalizeStemBeak({ shape: 'round' }).shape).toBe('round')
  })
})

describe('세로줄기 부리 — 저장과 추출', () => {
  afterEach(async () => {
    const { useGlobalStyleStore } = await import('../stores/globalStyleStore')
    useGlobalStyleStore.getState().resetStyle()
  })

  it('켜면 OTF 컨투어가 기둥 왼쪽으로 넓어지고, 끄면 그대로다', async () => {
    const [{ collectGlyphDataForChar }, { glyphDataToFontContours }, { useGlobalStyleStore }] = await Promise.all([
      import('./fontExportUtils'),
      import('./fontGenerator'),
      import('../stores/globalStyleStore'),
    ])
    const minX = () => Math.min(...glyphDataToFontContours(collectGlyphDataForChar('ㅣ')!).flat().map(({ x }) => x))
    const before = minX()
    useGlobalStyleStore.getState().setStemBeak({ enabled: true, size: 1, angle: 25 })
    const glyph = collectGlyphDataForChar('ㅣ')!
    expect(glyph.stemBeak).toEqual({ enabled: true, shape: 'angled', size: 1, angle: 25 })
    const reach = Math.round(0.6 * glyph.strokes[0].stroke.thickness * glyph.weightMultiplier * 1000)
    expect(before - minX()).toBeGreaterThanOrEqual(reach - 2)
    expect(before - minX()).toBeLessThanOrEqual(reach + 2)
    for (const char of ['이', '밥', '각', '화', '뷁']) expect(() => glyphDataToFontContours(collectGlyphDataForChar(char)!), char).not.toThrow()
    useGlobalStyleStore.getState().setStemBeak({ enabled: false })
    expect(minX()).toBe(before)
  })

  it('클라우드 저장 검증이 부리 값을 받아들이고, 없는 옛 저장분도 통과한다', async () => {
    const { useGlobalStyleStore, DEFAULT_STYLE } = await import('../stores/globalStyleStore')
    expect(DEFAULT_STYLE.stemBeak).toEqual(DEFAULT_STEM_BEAK)
    useGlobalStyleStore.getState().setStemBeak({ enabled: true })
    const style = useGlobalStyleStore.getState().style
    expect(style.stemBeak).toEqual({ enabled: true, shape: 'angled', size: 1, angle: 25 })

    const styleIssues = (candidate: Record<string, unknown>) => validateFontDataPayload({ globalStyle: { style: candidate, exclusions: [] } }, false)
      .filter(({ path }) => path.startsWith('$.globalStyle'))
    const legacy: Record<string, unknown> = { ...style }
    delete legacy.stemBeak
    expect(styleIssues({ ...style })).toEqual([])
    expect(styleIssues(legacy)).toEqual([])
    expect(styleIssues({ ...style, stemBeak: { enabled: 'yes', shape: 'angled', size: 1 } }).map(({ path }) => path)).toEqual(expect.arrayContaining(['$.globalStyle.style.stemBeak.enabled']))
  })
})

describe('획마다 부리 값(사용자 묶음)', () => {
  it('전역이 꺼져 있어도 획 값이 켜져 있으면 그 획만 부리가 붙는다', () => {
    const sources = sourcesOf(structuredClone(presets.jungseong['ㅣ']))
    const groups = stemBeakInkGroups(sources.map((source) => ({ ...source, style: ON })), DEFAULT_STEM_BEAK)
    expect(groups.flat().length).toBe(1)
  })

  it('전역이 켜져 있어도 획 값이 꺼져 있으면 붙지 않는다', () => {
    const sources = sourcesOf(structuredClone(presets.jungseong['ㅣ']))
    const groups = stemBeakInkGroups(sources.map((source) => ({ ...source, style: DEFAULT_STEM_BEAK })), ON)
    expect(groups.flat().length).toBe(0)
  })
})
