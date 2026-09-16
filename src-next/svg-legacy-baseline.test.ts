import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import fixture from './fixtures/legacy-svg-centerlines-v1.json'
import legacyJamos from '../src/data/fixtures/baseJamosLegacy2026-02.json'
import { createUserPreset01 } from './userPreset01'
import type { JamoData } from '../src/types'
import { LEGACY_CALIBRATION_LAYOUT_PROFILE_V1 } from '../src/data/legacyCalibrationLayoutProfileV1'
import type { AnchorPoint, BoxConfig, DecomposedSyllable, LayoutSchema, Part } from '../src/types'
import { resolveGlyphInkPrimitives } from '../src/services/glyphInkResolver'
import { pointsToSvgD } from '../src/utils/pathUtils'
import { weightToMultiplier } from '../src/stores/globalStyleStore'

const VIEW_BOX_SIZE = 100
const CHARS = ['ㄱ', '가', '고', '과', '각', '곡', '곽', 'ㅇ', 'ㅁ', 'ㅂ', 'ㅎ', 'ㅙ'] as const
const memory = new Map<string, string>()

function rounded(value: number): number {
  return Number(value.toFixed(8))
}

function roundedBox(box: BoxConfig): BoxConfig {
  return {
    x: rounded(box.x),
    y: rounded(box.y),
    width: rounded(box.width),
    height: rounded(box.height),
  }
}

function stablePath(path: string): string {
  return path.replace(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi, (value) => String(rounded(Number(value))))
}

function cloneAnchorPoints(points: readonly AnchorPoint[]): AnchorPoint[] {
  return points.map((point) => ({
    ...point,
    ...(point.handleIn && { handleIn: { ...point.handleIn } }),
    ...(point.handleOut && { handleOut: { ...point.handleOut } }),
  }))
}

function collectGlyphSemantic(
  char: string,
  syllable: DecomposedSyllable,
  schema: LayoutSchema,
  style: {
    weight: number
    linecap: 'round' | 'butt' | 'square'
    linejoin: 'round' | 'miter' | 'bevel'
  },
) {
  const weightMultiplier = weightToMultiplier(style.weight)
  const resolved = resolveGlyphInkPrimitives({
    syllable,
    placement: { kind: 'schema', schema },
    weightMultiplier,
    globalLinecap: style.linecap,
    globalLinejoin: style.linejoin,
    horizontalInkBounds: { min: 0, max: 1 },
  })
  const strokes = resolved.primitives
    .filter((primitive) => primitive.kind === 'centerline')
    .map((primitive, order) => ({
      order,
      part: primitive.source.part,
      strokeId: primitive.source.strokeId,
      renderBox: roundedBox(primitive.box),
      d: stablePath(pointsToSvgD(
        cloneAnchorPoints(primitive.stroke.points),
        primitive.stroke.closed,
        primitive.box,
        VIEW_BOX_SIZE,
      )),
      strokeWidth: rounded(primitive.stroke.thickness * primitive.weightMultiplier * VIEW_BOX_SIZE),
      linecap: primitive.effectiveLinecap,
      linejoin: primitive.effectiveLinejoin,
    }))

  return {
    char,
    layoutType: syllable.layoutType,
    layoutBoxes: Object.fromEntries(
      (Object.entries(resolved.boxes) as Array<[Part, BoxConfig]>).map(([part, box]) => [part, roundedBox(box)]),
    ),
    strokes,
  }
}

beforeAll(() => {
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => memory.set(key, value),
    removeItem: (key: string) => memory.delete(key),
  })
})

afterAll(() => vi.unstubAllGlobals())

describe('기존 선 전용 SVG 의미 baseline', () => {
  it('base layoutStore와 Calibration overlay의 path·box·순서·획 속성을 보존한다', async () => {
    const [{ useLayoutStore }, { useJamoStore }, { useGlobalStyleStore }, { decomposeSyllable }] = await Promise.all([
      import('../src/stores/layoutStore'),
      import('../src/stores/jamoStore'),
      import('../src/stores/globalStyleStore'),
      import('../src/utils/hangulUtils'),
    ])
    const layout = useLayoutStore.getState()
    // 옛 기본 획(2026-02) + 사용자 프리셋 01. baseline fixture는 그때 획으로 만든 것이다.
    const legacy = legacyJamos as unknown as Record<'choseong' | 'jungseong' | 'jongseong', Record<string, JamoData>>
    const preset = createUserPreset01(legacy)
    useJamoStore.setState({ choseong: { ...legacy.choseong, ...preset.choseong }, jungseong: { ...legacy.jungseong, ...preset.jungseong }, jongseong: { ...legacy.jongseong, ...preset.jongseong } })
    const jamos = useJamoStore.getState()
    const style = useGlobalStyleStore.getState().style
    expect(style.strokeStyle).toMatchObject({ mode: 'brush', brush: { tip: 'round' } })

    const collectNamespace = (calibrationOverlay: boolean) => Object.fromEntries(CHARS.map((char) => {
      const syllable = decomposeSyllable(char, jamos.choseong, jamos.jungseong, jamos.jongseong)
      const baseSchema = layout.layoutSchemas[syllable.layoutType]
      const effectivePadding = layout.getEffectivePadding(syllable.layoutType)
      const schema = {
        ...baseSchema,
        padding: effectivePadding,
        ...(calibrationOverlay
          ? {
              designBodyPadding: effectivePadding,
              userPartOverrides: LEGACY_CALIBRATION_LAYOUT_PROFILE_V1[syllable.layoutType] ?? baseSchema.userPartOverrides,
            }
          : {}),
      }
      return [char, collectGlyphSemantic(char, syllable, schema, style)]
    }))

    const actual = {
      version: 1,
      viewBoxSize: VIEW_BOX_SIZE,
      baseLayoutStore: collectNamespace(false),
      calibrationOverlay: collectNamespace(true),
    }
    expect(actual).toEqual(fixture)
  })
})
