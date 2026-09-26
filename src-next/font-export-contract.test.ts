import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { StrokeDataV2 } from '../src/types'
import { decomposeSyllable } from '../src/utils/hangulUtils'
import { strokeToContours } from '../src/services/strokeToOutline'
import { hangulOriginX } from '../src/services/fontMetrics'
import type { FontGeneratorOptions } from '../src/services/fontGenerator'
import baseJamos from '../src/data/baseJamos.json'

const UPM = 1000
const ASCENDER = 880
const storageValues = new Map<string, string>()

beforeAll(() => {
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storageValues.get(key) ?? null,
    setItem: (key: string, value: string) => storageValues.set(key, value),
    removeItem: (key: string) => storageValues.delete(key),
  })
})

afterAll(() => vi.unstubAllGlobals())

const jamos = baseJamos as unknown as {
  choseong: Parameters<typeof decomposeSyllable>[1]
  jungseong: Parameters<typeof decomposeSyllable>[2]
  jongseong: Parameters<typeof decomposeSyllable>[3]
}

const cornerStroke: StrokeDataV2 = {
  id: 'corner',
  closed: false,
  thickness: 0.1,
  points: [
    { x: 0.2, y: 0.2 },
    { x: 0.8, y: 0.2 },
    { x: 0.8, y: 0.8 },
  ],
}

function contours(linejoin: 'round' | 'miter' | 'bevel') {
  return strokeToContours(
    cornerStroke,
    { x: 0, y: 0, width: 1, height: 1 },
    UPM,
    {
      weightMultiplier: 1,
      slant: 0,
      globalLinecap: 'butt',
      globalLinejoin: linejoin,
      ascender: ASCENDER,
    },
  )
}

describe('OTF 출력 계약', () => {
  it('폰트 좌표의 중심선을 880 ascender 기준으로 배치한다', () => {
    const horizontal: StrokeDataV2 = {
      id: 'top',
      closed: false,
      thickness: 0.1,
      points: [{ x: 0.2, y: 0 }, { x: 0.8, y: 0 }],
    }
    const [outline] = strokeToContours(
      horizontal,
      { x: 0, y: 0, width: 1, height: 1 },
      UPM,
      {
        weightMultiplier: 1,
        slant: 0,
        globalLinecap: 'butt',
        globalLinejoin: 'round',
        ascender: ASCENDER,
      },
    )
    const minY = Math.min(...outline.map((point) => point.y))
    const maxY = Math.max(...outline.map((point) => point.y))
    expect((minY + maxY) / 2).toBe(ASCENDER)
  })

  it('round, miter, bevel 꺾임을 서로 다른 윤곽으로 만든다', () => {
    const round = contours('round')[0]
    const miter = contours('miter')[0]
    const bevel = contours('bevel')[0]
    expect(round.length).toBeGreaterThan(bevel.length)
    expect(miter).not.toEqual(bevel)
  })

  it('대각선 round cap이 예약한 반경 밖으로 튀어나오지 않는다', () => {
    const diagonal: StrokeDataV2 = {
      id: 'diagonal',
      closed: false,
      thickness: 0.07,
      points: [{ x: 0, y: 0 }, { x: 0.5, y: 0.5 }],
    }
    const [outline] = strokeToContours(
      diagonal,
      { x: 0.035, y: 0.1, width: 0.5, height: 0.5 },
      UPM,
      {
        weightMultiplier: 1,
        slant: 0,
        globalLinecap: 'round',
        globalLinejoin: 'round',
        ascender: ASCENDER,
      },
    )
    expect(Math.min(...outline.map((point) => point.x))).toBeGreaterThanOrEqual(0)
  })

  it('겹받침 호환 자모는 종성 마스터로 독립 글리프를 만든다', () => {
    const decomposed = decomposeSyllable('ㄳ', jamos.choseong, jamos.jungseong, jamos.jongseong)
    expect(decomposed.choseong?.char).toBe('ㄳ')
    expect(decomposed.choseong?.type).toBe('choseong')
    expect(decomposed.choseong?.strokes?.length).toBeGreaterThan(0)
  })

  it('OS/2 범위는 실제 제공하는 한글 영역만 표시한다', async () => {
    const {
      OS2_CODE_PAGE_RANGE_1,
      OS2_UNICODE_RANGE_1,
      OS2_UNICODE_RANGE_2,
    } = await import('../src/services/fontExportUtils')
    expect(OS2_UNICODE_RANGE_1).toBe(0x00000001)
    expect(OS2_UNICODE_RANGE_2).toBe((1 << 20) | (1 << 24))
    expect(OS2_CODE_PAGE_RANGE_1).toBe(1 << 19)
  })

  it('글자 폭 · 원점은 노토 비율(왼 50 : 몸통 840 : 오른 30)이고 몸통 폭에 비례한다', async () => {
    const metrics = await import('../src/services/fontMetrics')
    const { REFERENCE_BODY_PADDING } = await import('../src/services/designBodyPlacement')
    // 기본 몸통(840)이면 노토와 같은 920, 원점은 몸통 왼쪽에서 왼 여백만큼 앞(캔버스 0).
    expect(metrics.hangulAdvance(REFERENCE_BODY_PADDING)).toBe(metrics.NOTO_HANGUL_ADVANCE)
    expect(metrics.hangulOriginX(REFERENCE_BODY_PADDING)).toBeCloseTo(0, 9)
    // 몸통을 반으로 줄이면 폭도 반. 전역 자간은 폭에 더한다.
    const half = { top: .05, bottom: .04, left: .05, right: 1 - .05 - metrics.NOTO_BODY_WIDTH / metrics.UPM / 2 }
    expect(metrics.hangulAdvance(half)).toBe(metrics.NOTO_HANGUL_ADVANCE / 2)
    expect(metrics.hangulOriginX(half)).toBeCloseTo(.05 - metrics.NOTO_LEFT_BEARING / metrics.UPM / 2, 9)
    expect(metrics.hangulAdvance(half, .1)).toBe(metrics.NOTO_HANGUL_ADVANCE / 2 + 100)
    // 공백은 몸통을 따르지 않는다.
    expect(metrics.SPACE_ADVANCE).toBe(220)
  })

  it('한글 폰트 이름마다 고유한 PostScript 이름을 만든다', async () => {
    const { createFontIdentity } = await import('../src/services/fontGenerator')
    const first = createFontIdentity('감사 폰트', 'Regular')
    const second = createFontIdentity('예쁜 폰트', 'Regular')
    expect(first.postScriptName).not.toBe(second.postScriptName)
    expect(first.postScriptName).toMatch(/^[a-zA-Z0-9-]+$/)
    expect(createFontIdentity('Font Maker', 'Regular').asciiFamilyName).toBe('Font Maker')
  })

  it('OTF는 public override 없이 최신 canonical layoutStore revision만 읽는다', async () => {
    vi.useFakeTimers()
    const [{ collectGlyphDataForChar }, { useLayoutStore }] = await Promise.all([
      import('../src/services/fontExportUtils'),
      import('../src/stores/layoutStore'),
    ])
    const layoutType = 'choseong-jungseong-vertical'
    const storedOverrides = structuredClone(useLayoutStore.getState().layoutSchemas[layoutType].userPartOverrides)
    const revisionA = { CH: { top: 0, bottom: 0, left: 0.02, right: -0.02 } }
    const revisionB = { CH: { top: 0, bottom: 0, left: 0.08, right: -0.08 } }
    const hasOnePublicArgument: Parameters<typeof collectGlyphDataForChar>['length'] extends 1 ? true : false = true
    const hasLayoutProfileOption: 'layoutProfile' extends keyof FontGeneratorOptions ? true : false = false

    try {
      useLayoutStore.getState().setUserPartOverrides(layoutType, revisionA)
      const glyphA = collectGlyphDataForChar('가')
      useLayoutStore.getState().setUserPartOverrides(layoutType, revisionB)
      const glyphB = collectGlyphDataForChar('가')
      const choseongA = glyphA?.strokes.find((item) => item.stroke.id.startsWith('ㄱ'))
      const choseongB = glyphB?.strokes.find((item) => item.stroke.id.startsWith('ㄱ'))

      expect(hasOnePublicArgument).toBe(true)
      expect(hasLayoutProfileOption).toBe(false)
      expect(useLayoutStore.getState().layoutSchemas[layoutType].userPartOverrides).toEqual(revisionB)
      expect(choseongB?.box.x).toBeGreaterThan(choseongA!.box.x)
    } finally {
      useLayoutStore.getState().setUserPartOverrides(layoutType, storedOverrides)
      vi.runAllTimers()
      vi.useRealTimers()
    }
  })

  it('실제 곽의 공통 resolver 중심선을 x 원점만 이동해 OTF facade로 투영한다', async () => {
    const [
      { collectGlyphDataForChar },
      { resolveGlyphInkPrimitives },
      { useLayoutStore },
      { useJamoStore },
      { useGlobalStyleStore, weightToMultiplier },
      { decomposeSyllableWithOverrides },
    ] = await Promise.all([
      import('../src/services/fontExportUtils'),
      import('../src/services/glyphInkResolver'),
      import('../src/stores/layoutStore'),
      import('../src/stores/jamoStore'),
      import('../src/stores/globalStyleStore'),
      import('../src/utils/hangulUtils'),
    ])
    const layoutState = useLayoutStore.getState()
    const jamoState = useJamoStore.getState()
    const styleState = useGlobalStyleStore.getState()
    const syllable = decomposeSyllableWithOverrides(
      '곽',
      jamoState.choseong,
      jamoState.jungseong,
      jamoState.jongseong,
    )
    const layoutType = syllable.layoutType
    const effectivePadding = layoutState.getEffectivePadding(layoutType)
    const effectiveStyle = styleState.getEffectiveStyle(layoutType)
    const schemaWithPadding = {
      ...layoutState.layoutSchemas[layoutType],
      padding: effectivePadding,
      designBodyPadding: effectivePadding,
    }
    const resolverInput = {
      syllable,
      placement: { kind: 'schema' as const, schema: schemaWithPadding },
      weightMultiplier: weightToMultiplier(effectiveStyle.weight),
      globalLinecap: effectiveStyle.linecap,
      globalLinejoin: effectiveStyle.linejoin,
      horizontalInkBounds: { min: 0, max: 1 },
    }
    const inputBefore = JSON.stringify(resolverInput)
    const storeBefore = JSON.stringify({
      schema: layoutState.layoutSchemas[layoutType],
      globalPadding: layoutState.globalPadding,
      paddingOverrides: layoutState.paddingOverrides,
      choseong: jamoState.choseong['ㄱ'],
      jungseong: jamoState.jungseong['ㅘ'],
      jongseong: jamoState.jongseong['ㄱ'],
      style: styleState.style,
      exclusions: styleState.exclusions,
    })
    const resolved = resolveGlyphInkPrimitives(resolverInput)
    const resolvedBefore = JSON.stringify(resolved)
    const glyph = collectGlyphDataForChar('곽')
    const centerlines = resolved.primitives.filter((primitive) => primitive.kind === 'centerline')
    const hasOnePublicArgument: Parameters<typeof collectGlyphDataForChar>['length'] extends 1 ? true : false = true

    if (!glyph) throw new Error('곽 OTF facade를 만들 수 없습니다.')
    expect(centerlines.map(({ source }) => [source.part, source.channel, source.strokeId])).toEqual([
      ['CH', 'strokes', 'ㄱ-1'],
      ['JU_H', 'horizontalStrokes', 'ㅘ-1'],
      ['JU_H', 'horizontalStrokes', 'ㅘ-2'],
      ['JO', 'strokes', 'ㄱ종-1'],
      ['JU_V', 'verticalStrokes', 'ㅘ-3'],
      ['JU_V', 'verticalStrokes', 'ㅘ-4'],
    ])
    expect(glyph.strokes.map(({ stroke }) => stroke.id)).toEqual(
      centerlines.map(({ source }) => source.strokeId),
    )
    expect(glyph.weightMultiplier).toBe(resolverInput.weightMultiplier)
    expect(hasOnePublicArgument).toBe(true)

    centerlines.forEach((primitive, index) => {
      const output = glyph.strokes[index]
      expect(output.stroke).toBe(primitive.stroke)
      expect(output.effectiveLinecap).toBe(primitive.effectiveLinecap)
      expect(output.effectiveLinejoin).toBe(primitive.effectiveLinejoin)
      expect(primitive.weightMultiplier).toBe(glyph.weightMultiplier)
      expect(output.box).not.toBe(primitive.box)
      expect(output.box.x).toBeCloseTo(primitive.box.x - hangulOriginX(effectivePadding))
      expect(output.box.y).toBe(primitive.box.y)
      expect(output.box.width).toBe(primitive.box.width)
      expect(output.box.height).toBe(primitive.box.height)
    })

    expect(JSON.stringify(resolverInput)).toBe(inputBefore)
    expect(JSON.stringify(resolved)).toBe(resolvedBefore)
    expect(JSON.stringify({
      schema: useLayoutStore.getState().layoutSchemas[layoutType],
      globalPadding: useLayoutStore.getState().globalPadding,
      paddingOverrides: useLayoutStore.getState().paddingOverrides,
      choseong: useJamoStore.getState().choseong['ㄱ'],
      jungseong: useJamoStore.getState().jungseong['ㅘ'],
      jongseong: useJamoStore.getState().jongseong['ㄱ'],
      style: useGlobalStyleStore.getState().style,
      exclusions: useGlobalStyleStore.getState().exclusions,
    })).toBe(storeBefore)
  })

  it('전역 붓촉을 글리프 출력 데이터와 저장 데이터에 함께 전달한다', async () => {
    const [{ collectGlyphDataForChar }, { collectFontData }, { useGlobalStyleStore }] = await Promise.all([
      import('../src/services/fontExportUtils'),
      import('../src/services/fontDataBridge'),
      import('../src/stores/globalStyleStore'),
    ])
    const before = structuredClone(useGlobalStyleStore.getState().style.brush)
    const brush = { tip: 'rectangle' as const, aspectRatio: 0.3, angle: -27 }
    const storageWarning = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    try {
      useGlobalStyleStore.getState().setBrushStyle(brush)
      expect(collectGlyphDataForChar('한')?.brush).toEqual(brush)
      expect(collectFontData().globalStyle.style.brush).toEqual(brush)
    } finally {
      useGlobalStyleStore.getState().setBrushStyle(before)
      storageWarning.mockRestore()
    }
  })

  it('구형·범위 밖 붓촉 값을 안전한 기본 범위로 정규화한다', async () => {
    const { normalizeBrushStyle } = await import('../src/stores/globalStyleStore')
    expect(normalizeBrushStyle(undefined)).toEqual({ tip: 'round', aspectRatio: 0.5, angle: 0 })
    expect(normalizeBrushStyle({ tip: 'rectangle', aspectRatio: 4, angle: -130 })).toEqual({
      tip: 'rectangle',
      aspectRatio: 1,
      angle: -90,
    })
  })

  it('면적형과 점 반복 규칙을 저장·출력 데이터에 같은 값으로 전달한다', async () => {
    const [{ collectGlyphDataForChar }, { collectFontData }, { useGlobalStyleStore }] = await Promise.all([
      import('../src/services/fontExportUtils'), import('../src/services/fontDataBridge'), import('../src/stores/globalStyleStore'),
    ])
    const before = structuredClone(useGlobalStyleStore.getState().style.strokeStyle)
    const storageWarning = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      const area = { mode: 'angled-area' as const, cutAngle: 35, cornerRadius: 0.2 }
      useGlobalStyleStore.getState().setStrokeRenderStyle(area)
      expect(collectGlyphDataForChar('한')?.strokeStyle).toEqual(area)
      expect(collectFontData().globalStyle.style.strokeStyle).toEqual(area)

      const dots = { mode: 'dot-pattern' as const, dotSize: 1.1, gap: 0.4, rows: 2, stagger: true, omitEvery: 4 }
      useGlobalStyleStore.getState().setStrokeRenderStyle(dots)
      expect(collectGlyphDataForChar('공')?.strokeStyle).toEqual(dots)
      expect(collectFontData().globalStyle.style.strokeStyle).toEqual(dots)
    } finally {
      useGlobalStyleStore.getState().setStrokeRenderStyle(before)
      storageWarning.mockRestore()
    }
  })

  it('구형 brush 데이터와 범위 밖 신규 규칙을 안전하게 정규화한다', async () => {
    const { normalizeStrokeRenderStyle } = await import('../src/stores/globalStyleStore')
    expect(normalizeStrokeRenderStyle(undefined, { tip: 'rectangle', aspectRatio: 0.4, angle: 12 })).toEqual({
      mode: 'brush', brush: { tip: 'rectangle', aspectRatio: 0.4, angle: 12 },
    })
    expect(normalizeStrokeRenderStyle({ mode: 'angled-area', cutAngle: 100, cornerRadius: -2 })).toEqual({
      mode: 'angled-area', cutAngle: 60, cornerRadius: 0,
    })
    expect(normalizeStrokeRenderStyle({ mode: 'angled-area', cutAngle: 0, cornerRadius: 0.5 })).toEqual({
      mode: 'angled-area', cutAngle: 15, cornerRadius: 0.5,
    })
    expect(normalizeStrokeRenderStyle({ mode: 'dot-pattern', dotSize: 9, gap: -1, rows: 8, stagger: true, omitEvery: 1 })).toEqual({
      mode: 'dot-pattern', dotSize: 1.5, gap: 0, rows: 3, stagger: true, omitEvery: 2,
    })
    expect(normalizeStrokeRenderStyle({ mode: 'grid-system-2' })).toEqual({ mode: 'legacy-snapped-centerline' })
    expect(normalizeStrokeRenderStyle({ mode: 'legacy-snapped-centerline' })).toEqual({ mode: 'legacy-snapped-centerline' })
  })
})
