import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { areaPathsD, differenceD, EndType, FillRule, inflatePathsD, intersectD, isPositiveD, JoinType, unionD } from 'clipper2-ts'
import type { PathsD } from 'clipper2-ts'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { counterKeepScale, scaleStrokeThickness } from '../src/services/counterKeep'
import type { GlyphData } from '../src/services/fontExportUtils'
import { stemScaleOf } from '../src/services/strokeRenderGeometry'
import type { NotoPresetModelBundle } from './notoPresetGlyphs'

/**
 * 속공간 지키기 1단계 — 진짜 잉크로 재는 조합표. 플랜 `docs/plans/2026-10-01_속공간-지키기.md`.
 * 추출과 같은 윤곽(`glyphDataToFontContours`)을 자소마다 따로 만들어 Clipper로 잰다. 단위는 u(1000 = 1em).
 * - 닿음: 기본 가로 · 굵기 400에서 안 닿던 자소 쌍의 잉크 틈이 틈 기준보다 좁아진 글자. 원래 닿게 그린 쌍(`딱 붙음`)은 안 센다.
 * - 막힘: 자소 안 속공간이 막힌 글자. 속공간 = 그 자소 잉크의 볼록 껍질 − 잉크의 흰 덩어리(닫힌 ㅁ · ㅇ, 열린 ㄹ 홈 · ㅃ 기둥 사이 · ㅅ 다리 사이).
 *   기준(기본 가로 · 굵기 400)에서 `REF_OPENING` 넘게 열린 속공간마다 한가운데를 지금 잉크 자리로 옮겨, 거기 틈 기준(`OPENING_RATIO` × 획 두께) 넘게 열린 흰 곳이 하나도 안 걸리면 막힘.
 *   개수로 견주지 않는다 — 가로를 좁히면 ㅆ 두 ㅅ 다리 밑이 하나로 이어져 수가 줄기도 한다(막힌 게 아님).
 * - 자소 안 닿음: 같은 자소 안에서 기준에 안 닿던 획 둘의 틈이 틈 기준보다 좁아진 글자(한의 ㅎ 꼭지 ↔ 보, ㅝ의 ㅜ ↔ ㅓ, ㄳ의 ㄱ ↔ ㅅ).
 * - 검기: 잉크 넓이 ÷ 네모꼴 넓이.
 * 오래 걸려서 환경 변수가 있을 때만 돈다:
 *   INK_COUNTER_CENSUS=1 CENSUS_OUT=/tmp/ink-counter.json npx vitest run src-next/ink-counter-census.test.ts
 * `CENSUS_STRIDE`(기본 3 = 3,724자) · `CENSUS_WIDTHS` · `CENSUS_WEIGHTS`(쉼표)로 줄인다.
 * 한 프로세스로 12조건이 2분 남짓이다. 조건을 나눠 여러 프로세스로 돌리고 JSON을 합치면 1분 안이다(조건마다 기준을 다시 잰다).
 * `CENSUS_SHEET=빼,를 CENSUS_SHEET_OUT=/tmp/sheet.html`: 그 글자들을 조건마다 자소별 색으로 그린 한 장.
 */

const MODEL = JSON.parse(readFileSync(fileURLToPath(new URL('../public/noto-preset/model.json', import.meta.url)), 'utf8')) as NotoPresetModelBundle
const FONT_SPACE = { width: 1000, height: 1000 }
const BODY_H = 910
/**
 * 틈이 획 두께의 이만큼보다 좁으면 막힘 · 닿음으로 본다(굵기 400 = 17.5u, 900 = 34u).
 * 굵을수록 같은 틈도 좁아 보인다 — 밭 · 굵기 900의 ㅌ 받침은 틈 13 · 17u인데 붙어 보인다(2026-10-01 사용자 확인, 고정 10u에서 바꿈).
 */
const OPENING_RATIO = 0.25
/** 기준에서 이보다 넓게 열린 속공간만 막힘을 센다(u). 원래 좁던 홈(ㅀ 안 11u 틈 등)이 조금 줄어든 것은 안 센다. */
const REF_OPENING = 24
/** 이보다 작게 겹치면 닿음으로 안 센다(u²). 윤곽 반올림 잡음. */
const TOUCH_AREA = 1
/** 사용자가 굵기 900에서 덩어리로 본 글자 + 대조군. 표본에 없어도 늘 잰다. */
const WATCH = ['빼', '를', '뷁', '이', '한', '웨', '쏟', '밭']

const listOf = (value: string | undefined, fallback: number[]) => value ? value.split(',').map(Number) : fallback
const WIDTHS = listOf(process.env.CENSUS_WIDTHS, [840, 720, 600])
const WEIGHTS = listOf(process.env.CENSUS_WEIGHTS, [400, 600, 700, 900])
const STRIDE = Number(process.env.CENSUS_STRIDE ?? 3)
/** `CENSUS_KEEP=0.5`: 속공간 지키기(2단계)를 이 남길 몫으로 미리 얹어 잰다. 없으면 지금 제품 그대로. */
const KEEP = process.env.CENSUS_KEEP ? Number(process.env.CENSUS_KEEP) : undefined

type Contour = { x: number; y: number }[]
type Vec = { x: number; y: number }
type Bounds = { left: number; right: number; top: number; bottom: number }
/** `open`: 흰 곳을 틈 기준의 반만큼 깎고 남은 조각들. */
type PartInk = { part: string; ink: PathsD; area: number; bounds: Bounds; white: PathsD[]; open: PathsD[] }
type GlyphInk = { parts: PartInk[]; touching: string[]; inner: string[]; area: number }
/** 기준에서 잰 자소 하나. `cores`: 넉넉히 열린 속공간의 한가운데. */
type PartReference = { bounds: Bounds; cores: PathsD[] }
/** 획 하나의 잉크. `key` = 자소/획 id. */
type StrokeInk = { part: string; key: string; ink: PathsD }

/** 섞임홀자의 가로부 · 세로부(`JU_H` · `JU_V`)는 한 자소로 본다. */
const jamoOf = (part: string) => part.startsWith('JU') ? 'JU' : part

/** 자소마다 `counterKeepScale`만큼 획 두께를 줄인 글리프 데이터. 섞임홀자는 한 자소로 묶는다. */
function withCounterKeep(data: GlyphData, keep: number): GlyphData {
  const partOf = (item: GlyphData['strokes'][number]) => jamoOf((item.beakGroup ?? '').split(':')[0])
  const scales = new Map<string, number>()
  for (const part of new Set(data.strokes.map(partOf))) {
    scales.set(part, counterKeepScale(data.strokes.filter((item) => partOf(item) === part), data.weightMultiplier, keep, stemScaleOf(data.strokeStyle)))
  }
  return { ...data, strokes: data.strokes.map((item) => scaleStrokeThickness(item, scales.get(partOf(item)) ?? 1)) }
}

/** 볼록 껍질(모노톤 체인). */
function hullOf(paths: PathsD): PathsD[number] {
  const points = paths.flat().map((p) => ({ x: p.x, y: p.y })).sort((a, b) => a.x - b.x || a.y - b.y)
  const cross = (o: Vec, a: Vec, b: Vec) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const half = (list: Vec[]) => {
    const out: Vec[] = []
    for (const p of list) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop()
      out.push(p)
    }
    out.pop()
    return out
  }
  return [...half(points), ...half([...points].reverse())]
}

const shrink = (paths: PathsD, by: number): PathsD => inflatePathsD(paths, -by / 2, JoinType.Miter, EndType.Polygon).filter((path) => path.length >= 3)
const piecesOf = (paths: PathsD): PathsD[] => paths.filter(isPositiveD).map((path) => [path])
const overlaps = (a: PathsD, b: PathsD) => areaPathsD(intersectD(a, b, FillRule.NonZero)) > TOUCH_AREA
/** 틈이 `opening`보다 좁으면 닿은 것으로 본다(굵기 900의 ㅝ: ㅓ 곁줄기 윗면이 ㅜ 보 아랫면에 0u로 맞붙어 겹친 넓이는 0이다). */
const grow = (paths: PathsD, opening: number): PathsD => inflatePathsD(paths, opening / 2, JoinType.Round, EndType.Polygon)

function boundsOf(paths: PathsD): Bounds {
  const xs = paths.flat().map((p) => p.x)
  const ys = paths.flat().map((p) => p.y)
  return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) }
}

/** 기준 자소의 자리를 지금 자소 잉크 상자로 옮긴다(가로 · 세로 따로 비례). */
function mapInto(paths: PathsD, from: Bounds, to: Bounds): PathsD {
  const sx = (to.right - to.left) / Math.max(1, from.right - from.left)
  const sy = (to.bottom - to.top) / Math.max(1, from.bottom - from.top)
  return paths.map((path) => path.map((p) => ({ x: to.left + (p.x - from.left) * sx, y: to.top + (p.y - from.top) * sy })))
}

function glyphInkOf(contoursOf: (part: string) => Contour[], parts: string[], strokes: StrokeInk[], opening: number): GlyphInk {
  const measured = parts.map((part): PartInk => {
    const ink = unionD(contoursOf(part), FillRule.NonZero)
    if (ink.length === 0) return { part, ink, area: 0, bounds: { left: 0, right: 0, top: 0, bottom: 0 }, white: [], open: [] }
    const white = piecesOf(differenceD([hullOf(ink)], ink, FillRule.NonZero))
    return { part, ink, area: areaPathsD(ink), bounds: boundsOf(ink), white, open: white.flatMap((piece) => piecesOf(shrink(piece, opening))) }
  })
  const touching: string[] = []
  for (let i = 0; i < measured.length; i += 1) for (let j = i + 1; j < measured.length; j += 1) {
    if (overlaps(grow(measured[i].ink, opening), grow(measured[j].ink, opening))) touching.push(`${measured[i].part}-${measured[j].part}`)
  }
  const near = strokes.map((stroke) => grow(stroke.ink, opening))
  const inner: string[] = []
  for (let i = 0; i < strokes.length; i += 1) for (let j = i + 1; j < strokes.length; j += 1) {
    if (strokes[i].part === strokes[j].part && overlaps(near[i], near[j])) inner.push(`${strokes[i].key}|${strokes[j].key}`)
  }
  const area = areaPathsD(unionD(measured.flatMap((item) => item.ink), FillRule.NonZero))
  return { parts: measured, touching, inner, area }
}

function referenceOf(item: PartInk): PartReference {
  return {
    bounds: item.bounds,
    cores: item.white.map((piece) => shrink(piece, REF_OPENING)).filter((core) => core.length > 0),
  }
}

/** 기준 속공간 가운데 지금 막힌 것이 있나. */
function isClosed(item: PartInk, reference: PartReference): boolean {
  return reference.cores.some((core) => {
    const moved = mapInto(core, reference.bounds, item.bounds)
    return !item.open.some((piece) => overlaps(moved, piece))
  })
}

describe.skipIf(!process.env.INK_COUNTER_CENSUS)('속공간 지키기 — 진짜 잉크 조합표', () => {
  beforeAll(() => {
    const memory = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => memory.set(key, value), removeItem: (key: string) => memory.delete(key) })
  })
  afterAll(() => { vi.unstubAllGlobals() })

  it('가로 × 굵기', async () => {
    const [exportUtils, generator, deltaStore, exportStore, layout, style, placement] = await Promise.all([
      import('../src/services/fontExportUtils'), import('../src/services/fontGenerator'), import('./layoutDeltaStore'), import('./fontExportStore'),
      import('../src/stores/layoutStore'), import('../src/stores/globalStyleStore'), import('../src/services/designBodyPlacement'),
    ])
    const placementOf = exportStore.placementResolverOf(MODEL, deltaStore.layoutDeltaSnapshot())
    const chars: string[] = []
    for (let code = 0xac00; code <= 0xd7a3; code += STRIDE) chars.push(String.fromCharCode(code))
    for (const char of [...WATCH, ...(process.env.CENSUS_SHEET?.split(',') ?? [])]) if (!chars.includes(char)) chars.push(char)

    const measure = (char: string): GlyphInk | null => {
      const collected = exportUtils.collectGlyphDataWithPlacement(char, placementOf)
      if (!collected) return null
      const data = KEEP === undefined ? collected : withCounterKeep(collected, KEEP)
      const jamo = (item: (typeof data.strokes)[number]) => jamoOf((item.beakGroup ?? '').split(':')[0])
      const parts = [...new Set(data.strokes.map(jamo))]
      const strokes = data.strokes.map((item): StrokeInk => ({ part: jamo(item), key: `${jamo(item)}/${item.stroke.id}`, ink: unionD(generator.glyphDataToFontContours({ ...data, strokes: [item] }), FillRule.NonZero) }))
      const thickness = data.strokes.map((item) => item.stroke.thickness).sort((a, b) => a - b)[Math.floor(data.strokes.length / 2)]
      const opening = thickness * data.weightMultiplier * 1000 * OPENING_RATIO
      return glyphInkOf((part) => generator.glyphDataToFontContours({ ...data, strokes: data.strokes.filter((item) => jamo(item) === part) }), parts, strokes, opening)
    }
    const setCondition = (width: number, weight: number) => {
      layout.useLayoutStore.getState().setGlobalPadding(placement.designBodyPaddingForSize(width, BODY_H, FONT_SPACE))
      style.useGlobalStyleStore.getState().updateStyle('weight', weight)
    }

    // 기준: 기본 가로 · 굵기 400. 자소별 속공간과, 원래 닿아 있는 자소 쌍(`딱 붙음` — 며의 ㅕ 곁줄기가 ㅁ 기둥에 박힌 것 등).
    setCondition(840, 400)
    const reference = new Map<string, { parts: Map<string, PartReference>; touching: Set<string>; inner: Set<string> }>()
    for (const char of chars) {
      const ink = measure(char)
      if (ink) reference.set(char, { parts: new Map(ink.parts.map((item) => [item.part, referenceOf(item)])), touching: new Set(ink.touching), inner: new Set(ink.inner) })
    }

    // `CENSUS_SHEET=갰,빼 CENSUS_SHEET_OUT=/tmp/sheet.html`: 그 글자들을 조건마다 자소별 색으로 그린 한 장(눈으로 맞춰 보기).
    const sheet: string[] = []
    const sheetChars = process.env.CENSUS_SHEET?.split(',') ?? []
    const COLOR: Record<string, string> = { CH: '#2e9d57', JU: '#2f6fd6', JO: '#8a4fd1' }
    const svgOf = (ink: GlyphInk, label: string) => {
      const d = ink.parts.map((item) => `<path fill="${COLOR[item.part] ?? '#000'}" fill-opacity="0.85" fill-rule="nonzero" d="${item.ink.map((path) => `M${path.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join('L')}Z`).join('')}"/>`).join('')
      return `<figure><svg viewBox="0 0 1000 1000" width="160" height="160" style="background:#fff"><g transform="matrix(1 0 0 -1 0 880)">${d}</g></svg><figcaption>${label}</figcaption></figure>`
    }

    // `CENSUS_SCALES=이,쏟`: 굵기 900 · 남길 몫 0.5에서 자소별 굵기 배율.
    for (const char of process.env.CENSUS_SCALES?.split(',') ?? []) {
      setCondition(840, 900)
      const data = exportUtils.collectGlyphDataWithPlacement(char, placementOf)!
      const kept = withCounterKeep(data, 0.5)
      const scaleOf = new Map<string, number>()
      data.strokes.forEach((item, index) => scaleOf.set(item.stroke.id, kept.strokes[index].stroke.thickness / item.stroke.thickness))
      console.info(`SCALES ${char} ${[...scaleOf].map(([id, value]) => `${id} ${value.toFixed(3)}`).join(' · ')}`)
    }
    setCondition(840, 400)

    // `CENSUS_OPENINGS=뭐`: 조건마다 자소별 흰 덩어리의 열린 폭(u)과 넓이(u²)를 찍는다.
    for (const char of process.env.CENSUS_OPENINGS?.split(',') ?? []) for (const width of WIDTHS) for (const weight of WEIGHTS) {
      setCondition(width, weight)
      for (const item of measure(char)?.parts ?? []) {
        const widths = item.white.map((piece) => {
          let lo = 0
          let hi = 400
          for (let step = 0; step < 12; step += 1) { const mid = (lo + hi) / 2; if (shrink(piece, mid).length) lo = mid; else hi = mid }
          return `${Math.round(lo)}u(${Math.round(areaPathsD(piece))})`
        })
        console.info(`OPENINGS ${char} ${width}x${weight} ${item.part}: ${widths.join(' ')}`)
      }
      console.info(`OPENINGS ${char} ${width}x${weight} 획 닿음: ${measure(char)?.inner.join(' ')}`)
      const data = exportUtils.collectGlyphDataWithPlacement(char, placementOf)
      for (const item of data?.strokes ?? []) console.info(`OPENINGS ${char} ${width}x${weight} ${item.stroke.id} 두께 ${Math.round(item.stroke.thickness * data!.weightMultiplier * 1000)} ${JSON.stringify(item.stroke.points.map((p) => [Math.round((item.box.x + p.x * item.box.width) * 1000), Math.round((item.box.y + p.y * item.box.height) * 1000)]))}`)
    }

    const table: Record<string, unknown>[] = []
    const watch: Record<string, Record<string, unknown>> = {}
    const perChar: Record<string, Record<string, { touch: string[]; closed: string[]; split: string[] }>> = {}
    for (const width of WIDTHS) for (const weight of WEIGHTS) {
      setCondition(width, weight)
      const started = Date.now()
      let touched = 0
      let closed = 0
      let both = 0
      let splitCount = 0
      let closedOrSplit = 0
      let inkArea = 0
      const closedByPart: Record<string, number> = {}
      const touchByPair: Record<string, number> = {}
      const key = `${width}x${weight}`
      perChar[key] = {}
      for (const char of chars) {
        const ink = measure(char)
        if (!ink) continue
        const before = reference.get(char)
        const lost = ink.parts.filter((item) => { const partReference = before?.parts.get(item.part); return partReference ? isClosed(item, partReference) : false }).map((item) => item.part)
        const split = [...new Set(ink.inner.filter((pair) => !before?.inner.has(pair)))]
        const touch = ink.touching.filter((pair) => !before?.touching.has(pair))
        if (touch.length) touched += 1
        if (lost.length) closed += 1
        if (split.length) splitCount += 1
        if (lost.length || split.length) closedOrSplit += 1
        if (touch.length && lost.length) both += 1
        for (const part of lost) closedByPart[part] = (closedByPart[part] ?? 0) + 1
        for (const pair of touch) touchByPair[pair] = (touchByPair[pair] ?? 0) + 1
        if (WATCH.includes(char)) {
          watch[char] = { ...watch[char], [key]: { touch, closed: lost, split } }
        }
        if (touch.length || lost.length || split.length) perChar[key][char] = { touch, closed: lost, split }
        if (sheetChars.includes(char)) sheet.push(svgOf(ink, `${char} ${key}${lost.length ? ` 막힘 ${lost.join(' ')}` : ''}${split.length ? ` 안닿음 ${split.join(' ')}` : ''}${touch.length ? ` 닿음 ${touch.join(' ')}` : ''}`))
        inkArea += ink.area
      }
      const bodyArea = width * BODY_H
      const row = { width, weight, touched, closed, split: splitCount, closedOrSplit, both, closedByPart, touchByPair, darkness: Math.round(inkArea / chars.length / bodyArea * 1000) / 10, seconds: Math.round((Date.now() - started) / 1000) }
      table.push(row)
      console.info(JSON.stringify(row))
    }
    if (sheet.length) writeFileSync(process.env.CENSUS_SHEET_OUT ?? '/tmp/ink-sheet.html', `<!doctype html><meta charset=utf-8><style>body{display:flex;flex-wrap:wrap;gap:6px;font:11px sans-serif;background:#eee}figure{margin:0;width:160px}</style>${sheet.join('')}`)
    writeFileSync(process.env.CENSUS_OUT ?? '/tmp/ink-counter.json', JSON.stringify({ chars: chars.length, keep: KEEP ?? null, openingRatio: OPENING_RATIO, refOpening: REF_OPENING, table, watch, perChar }))
    console.info(JSON.stringify(watch, null, 1))
    expect(table).toHaveLength(WIDTHS.length * WEIGHTS.length)
  }, 3_600_000)
})
