import { describe, expect, it } from 'vitest'
import approved from '../../reference-data/preset-candidates/noto-approved-guide-inputs.v1.json'
import type { StrokeRenderStyle } from '../types'
import { finalGlyphInkToSvgPath, materializeFinalGlyphInk } from './finalGlyphInk'
import { NOTO_OUTLINE_ASCENDER, notoOutlineToInkPrimitives, notoOutlineToInkRegions } from './notoOutlineInk'
import type { NotoOutline } from './notoOutlineInk'

const STYLE = { kind: 'brush', weightMultiplier: 1 } as unknown as StrokeRenderStyle
const MATERIALIZE = { unitsPerEm: 1000, maxCurveErrorFontUnits: 0.5 }

function approvedOutline(character: string): NotoOutline {
  const found = (approved as { cases: { identity: { character: string }; stages: { outline: { observation: NotoOutline } } }[] }).cases
    .find((entry) => entry.identity.character === character)
  if (!found) throw new Error(`승인 입력에 ${character} 없음`)
  return found.stages.outline.observation
}

function bounds(points: { x: number; y: number }[]) {
  return {
    minX: Math.min(...points.map((point) => point.x)), maxX: Math.max(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)), maxY: Math.max(...points.map((point) => point.y)),
  }
}

function expectBounds(points: { x: number; y: number }[], expected: ReturnType<typeof bounds>) {
  const actual = bounds(points)
  for (const key of ['minX', 'maxX', 'minY', 'maxY'] as const) expect(actual[key]).toBeCloseTo(expected[key], 9)
}

// 폰트 단위 시계 방향 사각형(바깥) + 반시계 사각형(구멍). TrueType 규약.
const SQUARE_WITH_HOLE: NotoOutline = {
  unitsPerEm: 1000,
  operations: [
    { operation: 'moveTo', arguments: [[100, 100]] }, { operation: 'lineTo', arguments: [[100, 700]] },
    { operation: 'lineTo', arguments: [[700, 700]] }, { operation: 'lineTo', arguments: [[700, 100]] }, { operation: 'closePath', arguments: [] },
    { operation: 'moveTo', arguments: [[300, 300]] }, { operation: 'lineTo', arguments: [[500, 300]] },
    { operation: 'lineTo', arguments: [[500, 500]] }, { operation: 'lineTo', arguments: [[300, 500]] }, { operation: 'closePath', arguments: [] },
  ],
}

describe('notoOutlineToInkRegions', () => {
  it('폰트 단위를 x/upm, ascender − y/upm 화면 좌표로 옮기고 구멍을 outer 안에 넣는다', () => {
    const result = notoOutlineToInkRegions(SQUARE_WITH_HOLE)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.regions).toHaveLength(1)
    const [region] = result.regions
    expect(region.holes).toHaveLength(1)
    expectBounds(region.outer, { minX: 0.1, maxX: 0.7, minY: NOTO_OUTLINE_ASCENDER - 0.7, maxY: NOTO_OUTLINE_ASCENDER - 0.1 })
    expectBounds(region.holes[0], { minX: 0.3, maxX: 0.5, minY: NOTO_OUTLINE_ASCENDER - 0.5, maxY: NOTO_OUTLINE_ASCENDER - 0.3 })
  })

  it('fontToGlyphNormalized 아핀이 있으면 그 값을 우선 쓴다', () => {
    const shifted = { ...SQUARE_WITH_HOLE, fontToGlyphNormalized: [0.001, 0, 0, -0.001, 0.05, 0.9] }
    const result = notoOutlineToInkRegions(shifted)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expectBounds(result.regions[0].outer, { minX: 0.15, maxX: 0.75, minY: 0.2, maxY: 0.8 })
  })

  it('이차 곡선을 허용 오차 안에서 직선으로 펴고 암시적 on-curve 점을 복원한다', () => {
    // 반지름 200의 원을 컨트롤 4개로만 적은 닫힌 qCurveTo(마지막 null).
    const circle: NotoOutline = {
      unitsPerEm: 1000,
      operations: [
        { operation: 'qCurveTo', arguments: [[500, 700], [700, 700], [700, 300], [500, 300], null] },
        { operation: 'closePath', arguments: [] },
      ],
    }
    const coarse = notoOutlineToInkRegions(circle, { maxCurveErrorFontUnits: 50 })
    const fine = notoOutlineToInkRegions(circle, { maxCurveErrorFontUnits: 0.5 })
    expect(coarse.ok && fine.ok).toBe(true)
    if (!coarse.ok || !fine.ok) return
    expect(fine.regions[0].outer.length).toBeGreaterThan(coarse.regions[0].outer.length)
    expect(coarse.regions[0].outer.length).toBeGreaterThanOrEqual(4)
    // 모든 점이 컨트롤 사각형(0.3~0.7) 안에 있어야 한다.
    for (const point of fine.regions[0].outer) {
      expect(point.x).toBeGreaterThanOrEqual(0.3 - 1e-9)
      expect(point.x).toBeLessThanOrEqual(0.7 + 1e-9)
    }
  })

  it('이미 0~1로 정규화된 operations를 항등 아핀으로 넣어도 폰트 단위 오차 기준으로 같은 촘촘함을 낸다', () => {
    const outline = approvedOutline('아')
    const normalized: NotoOutline = {
      unitsPerEm: outline.unitsPerEm,
      fontToGlyphNormalized: [1, 0, 0, 1, 0, 0],
      operations: outline.operations.map((op) => ({ operation: op.operation, arguments: op.arguments.map((point) => point === null ? null : [point[0] / outline.unitsPerEm, NOTO_OUTLINE_ASCENDER - point[1] / outline.unitsPerEm] as [number, number]) })),
    }
    const fromFont = notoOutlineToInkRegions(outline)
    const fromNormalized = notoOutlineToInkRegions(normalized)
    expect(fromFont.ok && fromNormalized.ok).toBe(true)
    if (!fromFont.ok || !fromNormalized.ok) return
    const count = (regions: { outer: unknown[]; holes: unknown[][] }[]) => regions.reduce((sum, region) => sum + region.outer.length + region.holes.reduce((inner, hole) => inner + hole.length, 0), 0)
    expect(count(fromNormalized.regions)).toBe(count(fromFont.regions))
    expect(count(fromFont.regions)).toBeGreaterThan(outline.operations.length * 2)
  })

  it('미지원 명령·잘못된 좌표는 ok:false로 돌려준다', () => {
    expect(notoOutlineToInkRegions({ unitsPerEm: 1000, operations: [{ operation: 'arcTo', arguments: [] }] }).ok).toBe(false)
    expect(notoOutlineToInkRegions({ unitsPerEm: 1000, operations: [{ operation: 'lineTo', arguments: [[1, 2]] }] }).ok).toBe(false)
    expect(notoOutlineToInkRegions({ unitsPerEm: 0, operations: [] }).ok).toBe(false)
    expect(notoOutlineToInkRegions(SQUARE_WITH_HOLE, { maxCurveErrorFontUnits: 0 }).ok).toBe(false)
  })
})

describe('승인 Noto 윤곽 → 공통 잉크 파이프라인', () => {
  it('가는 구멍 없는 면들로, 아는 ㅇ 구멍이 있는 면으로 해석된다', () => {
    const ga = notoOutlineToInkRegions(approvedOutline('가'))
    const a = notoOutlineToInkRegions(approvedOutline('아'))
    expect(ga.ok && a.ok).toBe(true)
    if (!ga.ok || !a.ok) return
    expect(ga.regions.length).toBeGreaterThanOrEqual(2)
    expect(ga.regions.every((region) => region.holes.length === 0)).toBe(true)
    expect(a.regions.some((region) => region.holes.length === 1)).toBe(true)
    // 잉크는 0~1 글리프 상자 근처에 있어야 한다(바탕선 0.88 아래 내림 허용).
    for (const region of [...ga.regions, ...a.regions]) {
      const box = bounds(region.outer)
      expect(box.minX).toBeGreaterThan(-0.1)
      expect(box.maxX).toBeLessThan(1.1)
      expect(box.minY).toBeGreaterThan(-0.1)
      expect(box.maxY).toBeLessThan(1.1)
    }
  })

  it('primitive로 감싸면 materializeFinalGlyphInk가 union해 SVG 경로를 만든다', () => {
    const primitives = notoOutlineToInkPrimitives({ glyphId: 'glyph:아', codepoint: 0xc544, outline: approvedOutline('아') })
    expect(primitives.ok).toBe(true)
    if (!primitives.ok) return
    expect(primitives.primitives.every((primitive) => primitive.source.kind === 'noto-outline' && primitive.coordinateSpace === 'glyph-normalized')).toBe(true)
    expect(new Set(primitives.primitives.map((primitive) => primitive.id)).size).toBe(primitives.primitives.length)
    const ink = materializeFinalGlyphInk(primitives.primitives, STYLE, MATERIALIZE)
    expect(ink.ok).toBe(true)
    if (!ink.ok) return
    expect(ink.ink.regions.some((region) => region.holes.length === 1)).toBe(true)
    expect(finalGlyphInkToSvgPath(ink.ink)).toMatch(/^M .* Z$/)
  })
})
