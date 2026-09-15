import type {
  JamoData,
  LayoutSchema,
  LayoutType,
  Part,
  ResolvedCenterlinePrimitive,
  StrokeDataV2,
} from '../types'
import { decomposeSyllable } from '../utils/hangulUtils'
import { resolveGlyphInkPrimitives } from './glyphInkResolver'
import { strokeToContours } from './strokeToOutline'

export interface PresetJointJamoMaps {
  choseong: Record<string, JamoData>
  jungseong: Record<string, JamoData>
  jongseong: Record<string, JamoData>
}

export interface PresetInkBounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

export interface PresetJointInkMeasurement {
  character: string
  layoutType: LayoutType
  partBounds: Partial<Record<Part, PresetInkBounds>>
  collision: {
    safe: boolean
    gapAxis: 'x' | 'y'
    gap: number
    beforeParts: readonly Part[]
    afterParts: readonly Part[]
  }
}

const UPM = 1000
const ASCENDER = 880
const EPSILON = 1e-9

function include(bounds: PresetInkBounds, x: number, y: number): void {
  bounds.minX = Math.min(bounds.minX, x)
  bounds.maxX = Math.max(bounds.maxX, x)
  bounds.minY = Math.min(bounds.minY, y)
  bounds.maxY = Math.max(bounds.maxY, y)
}

export function measurePresetSquarePrimitiveBounds(primitive: ResolvedCenterlinePrimitive): PresetInkBounds {
  const contours = strokeToContours(
    // OTF 변환기는 읽기만 하지만 레거시 mutable 타입을 받는다.
    primitive.stroke as unknown as StrokeDataV2,
    primitive.box,
    UPM,
    {
      weightMultiplier: primitive.weightMultiplier,
      slant: 0,
      globalLinecap: 'square',
      globalLinejoin: 'round',
      ascender: ASCENDER,
    },
  )
  if (contours.length === 0) throw new Error(`${primitive.id}: square 잉크 윤곽이 비었습니다.`)
  const bounds = {
    minX: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  }
  for (const point of contours.flat()) {
    include(bounds, point.x / UPM, (ASCENDER - point.y) / UPM)
  }
  if (Object.values(bounds).some((value) => !Number.isFinite(value))) {
    throw new Error(`${primitive.id}: square 잉크 경계가 유한수가 아닙니다.`)
  }
  return bounds
}

function unionBounds(bounds: readonly PresetInkBounds[]): PresetInkBounds | null {
  if (bounds.length === 0) return null
  return bounds.reduce((result, current) => ({
    minX: Math.min(result.minX, current.minX),
    maxX: Math.max(result.maxX, current.maxX),
    minY: Math.min(result.minY, current.minY),
    maxY: Math.max(result.maxY, current.maxY),
  }))
}

function requireUnion(partBounds: Partial<Record<Part, PresetInkBounds>>, parts: readonly Part[], character: string): PresetInkBounds {
  const result = unionBounds(parts.flatMap((part) => partBounds[part] ? [partBounds[part]] : []))
  if (!result) throw new Error(`${character}: ${parts.join('+')} 잉크 경계가 없습니다.`)
  return result
}

function collisionFor(
  character: string,
  layoutType: LayoutType,
  partBounds: Partial<Record<Part, PresetInkBounds>>,
): PresetJointInkMeasurement['collision'] {
  const hasFinal = layoutType.endsWith('-jongseong')
  if (hasFinal) {
    const beforeParts = layoutType.includes('mixed') ? ['CH', 'JU_H', 'JU_V'] as const : ['CH', 'JU'] as const
    const before = requireUnion(partBounds, beforeParts, character)
    const after = requireUnion(partBounds, ['JO'], character)
    const gap = after.minY - before.maxY
    return { safe: gap >= -EPSILON, gapAxis: 'y', gap, beforeParts, afterParts: ['JO'] }
  }

  if (layoutType.endsWith('-horizontal')) {
    const before = requireUnion(partBounds, ['CH'], character)
    const after = requireUnion(partBounds, ['JU'], character)
    const gap = after.minY - before.maxY
    return { safe: gap >= -EPSILON, gapAxis: 'y', gap, beforeParts: ['CH'], afterParts: ['JU'] }
  }

  if (layoutType.endsWith('-mixed')) {
    const initial = requireUnion(partBounds, ['CH'], character)
    const horizontal = requireUnion(partBounds, ['JU_H'], character)
    const vertical = requireUnion(partBounds, ['JU_V'], character)
    const verticalGap = horizontal.minY - initial.maxY
    const horizontalGap = vertical.minX - initial.maxX
    if (verticalGap <= horizontalGap) {
      return { safe: verticalGap >= -EPSILON, gapAxis: 'y', gap: verticalGap, beforeParts: ['CH'], afterParts: ['JU_H'] }
    }
    return { safe: horizontalGap >= -EPSILON, gapAxis: 'x', gap: horizontalGap, beforeParts: ['CH'], afterParts: ['JU_V'] }
  }

  const before = requireUnion(partBounds, ['CH'], character)
  const after = requireUnion(partBounds, ['JU'], character)
  const gap = after.minX - before.maxX
  return { safe: gap >= -EPSILON, gapAxis: 'x', gap, beforeParts: ['CH'], afterParts: ['JU'] }
}

export function measurePresetJointSquareInk(input: {
  character: string
  schema: LayoutSchema
  jamos: PresetJointJamoMaps
}): PresetJointInkMeasurement {
  const syllable = decomposeSyllable(
    input.character,
    input.jamos.choseong,
    input.jamos.jungseong,
    input.jamos.jongseong,
  )
  if (syllable.layoutType !== input.schema.id) throw new Error(`${input.character}: 글자와 레이아웃 타입이 다릅니다.`)
  const resolved = resolveGlyphInkPrimitives({
    syllable,
    placement: { kind: 'schema', schema: input.schema },
    weightMultiplier: 1,
    globalLinecap: 'square',
    globalLinejoin: 'round',
  })
  const partBounds: Partial<Record<Part, PresetInkBounds>> = {}
  for (const part of resolved.renderOrder) {
    const bounds = unionBounds(resolved.primitives
      .filter((primitive) => primitive.source.part === part)
      .map(measurePresetSquarePrimitiveBounds))
    if (bounds) partBounds[part] = bounds
  }
  return {
    character: input.character,
    layoutType: syllable.layoutType,
    partBounds,
    collision: collisionFor(input.character, syllable.layoutType, partBounds),
  }
}
