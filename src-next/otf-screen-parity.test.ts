import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import * as polygonClipping from '../src/services/polygonBoolean'
import type { MultiPolygon, Ring } from '../src/services/polygonBoolean'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Contour } from '../src/services/strokeToOutline'
import type { NotoPresetModelBundle } from './notoPresetGlyphs'

/**
 * 받은 OTF와 화면이 같은 글자인지 잰다.
 * OTF 쪽은 실제로 폰트에 들어가는 컨투어(`glyphDataToFontContours`)를 em 좌표로 되돌리고,
 * 화면 쪽은 `AppGlyph`와 같은 입력(분해 · 실효 패딩 스키마 · `contextPlacementOf`)으로 만든 잉크다.
 */

const MODEL = JSON.parse(readFileSync(fileURLToPath(new URL('../public/noto-preset/model.json', import.meta.url)), 'utf8')) as NotoPresetModelBundle
const SENTENCE = ['별', '을', '노', '래', '하', '는'] as const
const HOLDOUT = ['가', '고', '과', '각', '곡', '곽', '의', '왜', '뷁', '힣', '쌍', '흙'] as const
const CURVE_STEPS = 24

type Vec = { x: number; y: number }
const lerp = (a: Vec, b: Vec, t: number): Vec => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })

/** `contoursToPath`와 같은 규칙(off 1개 = 2차, 2개 = 3차)으로 곡선을 편다. */
function flatten(contour: Contour): Vec[] {
  const start = Math.max(0, contour.findIndex((point) => point.onCurve))
  const ordered = [...contour.slice(start), ...contour.slice(0, start), contour[start]]
  const out: Vec[] = [{ x: ordered[0].x, y: ordered[0].y }]
  let off: Vec[] = []
  for (const point of ordered.slice(1)) {
    if (!point.onCurve) { off.push(point); continue }
    const from = out[out.length - 1]
    if (off.length === 0) out.push({ x: point.x, y: point.y })
    else for (let step = 1; step <= CURVE_STEPS; step += 1) {
      const t = step / CURVE_STEPS
      if (off.length === 1) out.push(lerp(lerp(from, off[0], t), lerp(off[0], point, t), t))
      else {
        const ab = lerp(from, off[0], t), bc = lerp(off[0], off[1], t), cd = lerp(off[1], point, t)
        out.push(lerp(lerp(ab, bc, t), lerp(bc, cd, t), t))
      }
    }
    off = []
  }
  return out
}

/** 폰트 좌표 컨투어 → em(0–1, y 아래로) 다각형. 컨투어끼리는 even-odd라 xor로 합친다. */
function otfInk(contours: Contour[], upm: number, ascender: number, originX: number): MultiPolygon {
  const rings = contours.map((contour): Ring => flatten(contour).map((point) => [point.x / upm + originX, (ascender - point.y) / upm]))
  if (!rings.length) return []
  return rings.slice(1).reduce<MultiPolygon>((acc, ring) => polygonClipping.xor(acc, [[ring]]), [[rings[0]]])
}

const perimeterOf = (shape: MultiPolygon): number => shape.flat().reduce((total, ring) => total + ring.reduce((sum, point, index) => {
  const next = ring[(index + 1) % ring.length]
  return sum + Math.hypot(next[0] - point[0], next[1] - point[1])
}, 0), 0)

/** 세로선 x에서 y를 품은 잉크 구간의 길이. 획 폭을 잰다. */
function inkSpanAt(shape: MultiPolygon, x: number, y: number, axis: 'vertical' | 'horizontal'): [number, number] | null {
  const far = 5
  const probe: MultiPolygon = axis === 'vertical'
    ? [[[[x - 1e-4, -far], [x + 1e-4, -far], [x + 1e-4, far], [x - 1e-4, far]]]]
    : [[[[-far, y - 1e-4], [far, y - 1e-4], [far, y + 1e-4], [-far, y + 1e-4]]]]
  for (const polygon of polygonClipping.intersection(shape, probe)) {
    const values = polygon[0].map((point) => axis === 'vertical' ? point[1] : point[0])
    const span: [number, number] = [Math.min(...values), Math.max(...values)]
    const at = axis === 'vertical' ? y : x
    if (at >= span[0] - 1e-6 && at <= span[1] + 1e-6) return span
  }
  return null
}

describe('OTF와 화면이 같은 상자를 쓴다', () => {
  beforeAll(() => {
    const memory = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => memory.set(key, value),
      removeItem: (key: string) => memory.delete(key),
    })
  })
  afterAll(() => { vi.unstubAllGlobals() })

  async function setup() {
    const [exportUtils, generator, xor, fit, hangul, jamo, layout, style, deltaStore, exportStore, notoModel, resolver, inkResolver, rule] = await Promise.all([
      import('../src/services/fontExportUtils'), import('../src/services/fontGenerator'), import('../src/services/notoGlyphXor'),
      import('../src/services/notoFitReport'), import('../src/utils/hangulUtils'), import('../src/stores/jamoStore'),
      import('../src/stores/layoutStore'), import('../src/stores/globalStyleStore'), import('./layoutDeltaStore'),
      import('./fontExportStore'), import('./notoModel'), import('../src/services/contextBoxResolver'),
      import('../src/services/glyphInkResolver'), import('./scopeRule'),
    ])
    /** 한 글자의 (OTF 잉크, 화면 잉크, 스키마 OTF 잉크). */
    const measure = (char: string) => {
      const placementOf = exportStore.placementResolverOf(MODEL, deltaStore.layoutDeltaSnapshot())
      const data = exportUtils.collectGlyphDataWithPlacement(char, placementOf)
      const legacy = exportUtils.collectGlyphDataForChar(char)
      if (!data || !legacy) throw new Error(`${char} 출력 데이터 없음`)
      const jamos = jamo.useJamoStore.getState()
      const layouts = layout.useLayoutStore.getState()
      const globalStyle = style.useGlobalStyleStore.getState().style
      const syllable = hangul.decomposeSyllable(char, jamos.choseong, jamos.jungseong, jamos.jongseong)
      const padding = { ...layouts.globalPadding, ...layouts.paddingOverrides[syllable.layoutType] }
      const schema = { ...layouts.layoutSchemas[syllable.layoutType], padding, designBodyPadding: padding }
      const identity = resolver.identityOfSyllable(syllable)
      const screenPlacement = notoModel.contextPlacementOf({
        bundle: MODEL, identity, syllable, schema, ends: globalStyle,
        delta: deltaStore.effectiveLayoutDelta(deltaStore.useLayoutDeltaStore.getState(), identity),
      }).placement
      const screen = xor.appGlyphInkRegions(syllable, screenPlacement, globalStyle)
      if (!screen.ok) throw new Error(`${char} 화면 잉크 실패: ${screen.message}`)
      // 화면의 기울기는 SVG 변환이다(`SvgRenderer`: 글자 칸 세로 중심 기준 skewX(−기울기)). 같은 식을 잉크에 얹어 OTF와 견준다.
      const tangent = Math.tan(globalStyle.slant * Math.PI / 180)
      const upright = fit.unionOf(screen.regions)
      const mine: MultiPolygon = tangent === 0 ? upright : upright.map((polygon) => polygon.map((ring) => ring.map(([x, y]) => [x - tangent * (y - 0.5), y] as [number, number])))
      const toInk = (glyph: NonNullable<typeof data>) => otfInk(generator.glyphDataToFontContours(glyph), exportUtils.UPM, exportUtils.ASCENDER, padding.left)
      // 화면이 실제로 그리는 상자(칸 해석 → 공통 ink resolver)와 OTF 데이터의 상자. 원점 이동만 빼면 같은 수여야 한다.
      const screenBoxes = inkResolver.resolveGlyphInkPrimitives({
        syllable, placement: screenPlacement, weightMultiplier: data.weightMultiplier,
        globalLinecap: globalStyle.linecap, globalLinejoin: globalStyle.linejoin, horizontalInkBounds: { min: 0, max: 1 },
      }).primitives.map((primitive) => primitive.kind === 'centerline' ? { id: primitive.stroke.id, box: { ...primitive.box, x: primitive.box.x - padding.left } } : null)
      const otfBoxes = data.strokes.map((item) => ({ id: item.stroke.id, box: item.box }))
      // OTF 좌표는 정수 폰트 단위로 반올림된다. 가장자리가 평균 몇 유닛 어긋났는지 = xor 면적 / 잉크 둘레.
      const edgeDriftUnits = (shape: MultiPolygon) => fit.multiPolygonArea(polygonClipping.xor(mine, shape)) / perimeterOf(mine) * exportUtils.UPM
      const ratio = (shape: MultiPolygon) => fit.multiPolygonArea(polygonClipping.xor(mine, shape)) / fit.multiPolygonArea(mine)
      // 재는 방법 자체의 바닥: 같은 스키마 상자로 그린 화면 잉크와 옛 스키마 OTF. 상자가 같으니 남는 건 두 stroker의 차이뿐이다.
      const schemaScreen = xor.appGlyphInkRegions(syllable, { kind: 'schema', schema }, globalStyle)
      if (!schemaScreen.ok) throw new Error(`${char} 스키마 화면 잉크 실패`)
      const schemaMine = fit.unionOf(schemaScreen.regions)
      const floorXor = fit.multiPolygonArea(polygonClipping.xor(schemaMine, toInk(legacy))) / fit.multiPolygonArea(schemaMine)
      return { data, globalStyle, floorXor, screenBoxes, otfBoxes, edgeDrift: edgeDriftUnits(toInk(data)), screenKind: screenPlacement.kind, otf: toInk(data), modelXor: ratio(toInk(data)), schemaXor: ratio(toInk(legacy)) }
    }
    return { measure, deltaStore, resolver, hangul, jamo, rule }
  }

  it('G0 — 별을노래하는: 모델 상자 OTF는 화면과 상자가 같고 가장자리 어긋남이 1유닛 아래, 옛 스키마 OTF는 크게 다르다', async () => {
    const { measure } = await setup()
    const rows = SENTENCE.map((char) => ({ char, ...measure(char) }))
    console.info(rows.map((row) => `${row.char} 모델 ${(row.modelXor * 100).toFixed(3)}% · 스키마 ${(row.schemaXor * 100).toFixed(1)}% · 같은 상자 바닥 ${(row.floorXor * 100).toFixed(3)}% · 가장자리 ${row.edgeDrift.toFixed(2)}유닛`).join('\n'))
    for (const row of rows) {
      expect(row.data.placementKind, row.char).toBe('boxes')
      expect(row.screenKind, row.char).toBe('boxes')
      expect(row.otfBoxes, row.char).toEqual(row.screenBoxes)
      expect(row.edgeDrift, row.char).toBeLessThan(1)
      expect(row.modelXor, row.char).toBeLessThan(0.015)
    }
    expect(Math.max(...rows.map((row) => row.schemaXor))).toBeGreaterThan(0.05)
  })

  it('G0 — 굵기와 획 끝: OTF ㅡ 획 폭은 화면 stroke-width와 같고, 기본(butt)이면 끝점 밖으로 안 나간다', async () => {
    const { measure } = await setup()
    const { data, otf, globalStyle } = measure('을')
    const bar = data.strokes.find((item) => item.stroke.id.startsWith('ㅡ'))
    if (!bar) throw new Error('을의 ㅡ 획을 찾을 수 없습니다.')
    const xs = bar.stroke.points.map((point) => bar.box.x + point.x * bar.box.width)
    const ys = bar.stroke.points.map((point) => bar.box.y + point.y * bar.box.height)
    const shift = (await import('../src/stores/layoutStore')).useLayoutStore.getState().globalPadding.left
    const midX = (Math.min(...xs) + Math.max(...xs)) / 2 + shift
    const midY = (Math.min(...ys) + Math.max(...ys)) / 2
    const across = inkSpanAt(otf, midX, midY, 'vertical')
    const along = inkSpanAt(otf, midX, midY, 'horizontal')
    if (!across || !along) throw new Error('ㅡ 잉크 구간을 못 찾았습니다.')
    const expectedWidth = bar.stroke.thickness * data.weightMultiplier
    const overhang = { start: Math.min(...xs) + shift - along[0], end: along[1] - (Math.max(...xs) + shift) }
    console.info(`획 폭 OTF ${(across[1] - across[0]).toFixed(4)}em · 화면 ${expectedWidth.toFixed(4)}em · 굵기 ${globalStyle.weight} · 획 끝 ${bar.effectiveLinecap} · 끝점 밖 ${overhang.start.toFixed(4)} / ${overhang.end.toFixed(4)}em`)
    expect(across[1] - across[0]).toBeCloseTo(expectedWidth, 3)
    expect(bar.effectiveLinecap).toBe('butt')
    expect(Math.abs(overhang.start)).toBeLessThan(0.002)
    expect(Math.abs(overhang.end)).toBeLessThan(0.002)
  })

  it('G2 — 전역 굵기 700 · 기울기 12°: OTF가 화면과 같은 굵기 · 같은 기울기다', async () => {
    const { measure } = await setup()
    const { useGlobalStyleStore } = await import('../src/stores/globalStyleStore')
    const before = useGlobalStyleStore.getState().style
    useGlobalStyleStore.getState().updateStyle('weight', 700)
    useGlobalStyleStore.getState().updateStyle('slant', 12)
    try {
      const rows = ['한', '과', '의', '곽'].map((char) => ({ char, ...measure(char) }))
      console.info(rows.map((row) => `${row.char} 굵기 700 · 기울기 12° · 모델 ${(row.modelXor * 100).toFixed(3)}% · 가장자리 ${row.edgeDrift.toFixed(2)}유닛`).join('\n'))
      for (const row of rows) {
        expect(row.data.weightMultiplier, row.char).toBeCloseTo(1.72, 9)
        // 굵기는 중심선을 지킨다: 상자는 굵기와 무관하게 화면과 같다.
        expect(row.otfBoxes, row.char).toEqual(row.screenBoxes)
        expect(row.edgeDrift, row.char).toBeLessThan(1)
        expect(row.modelXor, row.char).toBeLessThan(0.015)
      }
    } finally {
      useGlobalStyleStore.getState().updateStyle('weight', before.weight)
      useGlobalStyleStore.getState().updateStyle('slant', before.slant)
    }
  })

  it('G2 — 전역 둥글기 0.5 · 1: OTF가 화면과 같은 윤곽이고, 잉크가 둥글기 0의 상자 밖으로 안 나간다', async () => {
    const { measure } = await setup()
    const { useGlobalStyleStore } = await import('../src/stores/globalStyleStore')
    const before = useGlobalStyleStore.getState().style.strokeStyle
    const chars = ['한', '과', '의', '곽', '을']
    const square = chars.map((char) => ({ char, ...measure(char) }))
    const extent = (shape: MultiPolygon) => {
      const xs = shape.flatMap((polygon) => polygon[0].map(([x]) => x)), ys = shape.flatMap((polygon) => polygon[0].map(([, y]) => y))
      return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) }
    }
    try {
      for (const roundness of [0.5, 1]) {
        useGlobalStyleStore.getState().setStrokeRenderStyle({ mode: 'brush', brush: { tip: 'round', aspectRatio: 0.5, angle: 0 }, roundness })
        const rows = chars.map((char) => ({ char, ...measure(char) }))
        console.info(rows.map((row) => `${row.char} 둥글기 ${roundness} · 모델 ${(row.modelXor * 100).toFixed(3)}% · 가장자리 ${row.edgeDrift.toFixed(2)}유닛`).join('\n'))
        rows.forEach((row, index) => {
          expect(row.data.strokeStyle, row.char).toMatchObject({ mode: 'brush', roundness })
          // 둥글기는 상자를 안 건드린다.
          expect(row.otfBoxes, row.char).toEqual(row.screenBoxes)
          expect(row.otfBoxes, row.char).toEqual(square[index].otfBoxes)
          expect(row.edgeDrift, row.char).toBeLessThan(1)
          expect(row.modelXor, row.char).toBeLessThan(0.015)
          // 잉크는 각진 끝 네모 안에서만 굴려진다 — 극점이 밖으로 안 나간다(정수 반올림 1유닛 허용).
          const now = extent(row.otf), was = extent(square[index].otf)
          expect(now.left, row.char).toBeGreaterThanOrEqual(was.left - 0.001)
          expect(now.top, row.char).toBeGreaterThanOrEqual(was.top - 0.001)
          expect(now.right, row.char).toBeLessThanOrEqual(was.right + 0.001)
          expect(now.bottom, row.char).toBeLessThanOrEqual(was.bottom + 0.001)
          // 그래도 모양은 바뀌었다(모서리가 깎인 만큼 면적이 준다).
          const area = (shape: MultiPolygon) => shape.reduce((sum, polygon) => sum + Math.abs(polygon[0].reduce((acc, [x, y], i, ring) => { const [nx, ny] = ring[(i + 1) % ring.length]; return acc + x * ny - nx * y }, 0)) / 2, 0)
          expect(area(row.otf), row.char).toBeLessThan(area(square[index].otf))
        })
      }
    } finally {
      useGlobalStyleStore.getState().setStrokeRenderStyle(before)
    }
  })

  it('G2 — 가로·세로 대비 ±0.6(둥글기 0 · 1): OTF가 화면과 같은 윤곽이고 상자는 그대로다', async () => {
    const { measure } = await setup()
    const { useGlobalStyleStore } = await import('../src/stores/globalStyleStore')
    const before = useGlobalStyleStore.getState().style.strokeStyle
    const chars = ['한', '과', '의', '곽', '을']
    const square = chars.map((char) => ({ char, ...measure(char) }))
    try {
      for (const [contrast, roundness] of [[0.6, 0], [-0.6, 0], [0.6, 1]] as const) {
        useGlobalStyleStore.getState().setStrokeRenderStyle({ mode: 'brush', brush: { tip: 'round', aspectRatio: 0.5, angle: 0 }, contrast, ...(roundness > 0 ? { roundness } : {}) })
        const rows = chars.map((char) => ({ char, ...measure(char) }))
        console.info(rows.map((row) => `${row.char} 대비 ${contrast} 둥글기 ${roundness} · 모델 ${(row.modelXor * 100).toFixed(3)}% · 가장자리 ${row.edgeDrift.toFixed(2)}유닛`).join('\n'))
        rows.forEach((row, index) => {
          expect(row.data.strokeStyle, row.char).toMatchObject({ mode: 'brush', contrast })
          expect(row.otfBoxes, row.char).toEqual(row.screenBoxes)
          expect(row.otfBoxes, row.char).toEqual(square[index].otfBoxes)
          expect(row.edgeDrift, row.char).toBeLessThan(1)
          expect(row.modelXor, row.char).toBeLessThan(0.015)
        })
      }
    } finally {
      useGlobalStyleStore.getState().setStrokeRenderStyle(before)
    }
  })

  it('네모꼴 가로 600: 글자가 틀을 따라 줄고, OTF 잉크가 글자 폭 안에 든다(화면과 같은 상자)', async () => {
    const { measure } = await setup()
    const { useLayoutStore } = await import('../src/stores/layoutStore')
    const before = useLayoutStore.getState().globalPadding
    const wide = ['한', '를', '뷁'].map((char) => ({ char, ...measure(char) }))
    useLayoutStore.getState().setGlobalPadding({ ...before, left: 0.2, right: 0.2 })
    try {
      const rows = ['한', '를', '뷁'].map((char) => ({ char, ...measure(char) }))
      console.info(rows.map((row) => `${row.char} 네모꼴 600 · 모델 ${(row.modelXor * 100).toFixed(3)}% · 가장자리 ${row.edgeDrift.toFixed(2)}유닛 · 글자 폭 ${row.data.advanceWidth}`).join('\n'))
      rows.forEach((row, index) => {
        expect(row.screenKind, row.char).toBe('boxes')
        expect(row.otfBoxes, row.char).toEqual(row.screenBoxes)
        expect(row.edgeDrift, row.char).toBeLessThan(1)
        expect(row.data.advanceWidth, row.char).toBe(600)
        // 잉크의 가로 범위가 글자 폭 안에 든다(전에는 1000 기준 자리에 그대로 남아 옆 글자와 겹쳤다).
        const xs = row.otf.flatMap((polygon) => polygon[0].map(([x]) => x))
        expect(Math.min(...xs) - 0.2, row.char).toBeGreaterThanOrEqual(-0.02)
        expect(Math.max(...xs) - 0.2, row.char).toBeLessThanOrEqual(0.62)
        // 기본 네모꼴일 때보다 상자가 좁아졌다.
        const width = (boxes: typeof row.screenBoxes) => Math.max(...boxes.flatMap((item) => item ? [item.box.x + item.box.width] : [])) - Math.min(...boxes.flatMap((item) => item ? [item.box.x] : []))
        expect(width(row.screenBoxes), row.char).toBeLessThan(width(wide[index].screenBoxes) * 0.75)
      })
    } finally {
      useLayoutStore.getState().setGlobalPadding(before)
    }
  })

  it('G1 — 레이아웃 대표 12자와 Δ 세 층(전체 · 이 레이아웃 · 이 자모)이 OTF에 그대로 들어간다', async () => {
    const { measure, deltaStore, resolver, hangul, jamo, rule } = await setup()
    const before = Object.fromEntries(HOLDOUT.map((char) => [char, measure(char)]))
    for (const char of HOLDOUT) {
      expect(before[char].otfBoxes, char).toEqual(before[char].screenBoxes)
      expect(before[char].edgeDrift, char).toBeLessThan(1)
    }

    const jamos = jamo.useJamoStore.getState()
    const identity = resolver.identityOfSyllable(hangul.decomposeSyllable('각', jamos.choseong, jamos.jungseong, jamos.jongseong))
    if (!identity?.contextId) throw new Error('각의 문맥을 못 찾았습니다.')
    const snapshot = deltaStore.layoutDeltaSnapshot()
    try {
      const store = deltaStore.useLayoutDeltaStore.getState()
      const context = rule.ruleOfContext(identity.contextId)
      store.apply({}, { faces: { CH: { left: 0.01 } } })
      store.apply(context, { faces: { JO: { bottom: -0.02 } } })
      store.apply(rule.withJamos(context, 'initial', ['ㄱ']), { faces: { CH: { top: 0.015 } } })
      const after = measure('각')
      const moved = (part: string) => {
        const a = before['각'].data.strokes.find((item) => item.stroke.id.startsWith(part))!.box
        const b = after.data.strokes.find((item) => item.stroke.id.startsWith(part))!.box
        return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.width - b.width) + Math.abs(a.height - b.height)
      }
      expect(after.data.placementKind).toBe('boxes')
      expect(moved('ㄱ')).toBeGreaterThan(0.005)
      expect(after.otfBoxes).toEqual(after.screenBoxes)
      expect(after.edgeDrift).toBeLessThan(1)
    } finally {
      deltaStore.useLayoutDeltaStore.getState().restore(snapshot)
    }
  })

  it('독립 자모는 모델 대상이 아니라 옛 스키마 출력과 같다', async () => {
    const { measure } = await setup()
    for (const char of ['ㄱ', 'ㅎ', 'ㅙ']) {
      const row = measure(char)
      expect(row.data.placementKind, char).toBe('schema')
      expect(row.schemaXor, char).toBe(row.modelXor)
    }
  })

  it('G2 — 11,223 글리프 전수: 음절은 전부 모델 상자, 컨투어 합치기 실패 없음', async () => {
    const [exportUtils, generator, deltaStore, exportStore] = await Promise.all([
      import('../src/services/fontExportUtils'), import('../src/services/fontGenerator'), import('./layoutDeltaStore'), import('./fontExportStore'),
    ])
    const timed = <T,>(run: () => T): [T, number] => { const at = performance.now(); const value = run(); return [value, performance.now() - at] }
    const [legacy, legacyMs] = timed(() => exportUtils.collectAllGlyphData())
    const [glyphs, modelMs] = timed(() => exportUtils.collectAllGlyphData(undefined, exportStore.placementResolverOf(MODEL, deltaStore.layoutDeltaSnapshot())))
    const [, contourMs] = timed(() => glyphs.forEach((glyph) => generator.glyphDataToFontContours(glyph)))
    const fallback = glyphs.filter((glyph) => glyph.unicode >= 0xAC00 && glyph.placementKind === 'schema')
    console.info(`글리프 ${glyphs.length} · 스키마 폴백 ${fallback.length} · 수집 ${Math.round(legacyMs)}ms → ${Math.round(modelMs)}ms · 컨투어 ${Math.round(contourMs)}ms`)
    expect(glyphs).toHaveLength(legacy.length)
    expect(exportUtils.allExportChars().map((char) => char.charCodeAt(0))).toEqual(legacy.map((glyph) => glyph.unicode))
    expect(glyphs).toHaveLength(11223)
    expect(fallback.map((glyph) => glyph.char)).toEqual([])
  }, 300_000)
})
