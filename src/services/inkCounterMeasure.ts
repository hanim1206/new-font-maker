import { areaPathsD, differenceD, EndType, FillRule, inflatePathsD, intersectD, isPositiveD, JoinType, unionD } from 'clipper2-ts'
import type { PathsD } from 'clipper2-ts'
import { betweenKeepScales, counterKeepScale, scaleStrokeThickness, strokeGrowthOf, strokeVerticalness } from './counterKeep'
import type { CounterFloor } from './counterKeep'
import type { GlyphData } from './fontExportUtils'
import { glyphDataToFontContours } from './fontGenerator'
import { stemScaleOf } from './strokeRenderGeometry'

/**
 * 속공간 지키기 — 진짜 잉크로 재기. 플랜 `docs/plans/2026-10-01_속공간-지키기.md` 1단계.
 * 추출과 같은 윤곽(`glyphDataToFontContours`)을 자소마다 · 획마다 따로 만들어 Clipper로 잰다. 단위는 u(1000 = 1em).
 * 전수 테스트(`src-next/ink-counter-census.test.ts`)와 네모꼴 실험실의 진행 지도가 같이 쓴다.
 * - 자소 사이 닿음: 기준(기본 가로 · 굵기 400)에서 안 닿던 자소 쌍의 잉크 틈이 틈 기준보다 좁아짐. 원래 닿게 그린 쌍(`딱 붙음`)은 안 센다.
 * - 자소 안 닿음: 같은 자소 안에서 기준에 안 닿던 획 둘의 틈이 틈 기준보다 좁아짐(한의 ㅎ 꼭지 ↔ 보, ㅝ의 ㅜ ↔ ㅓ, ㄳ의 ㄱ ↔ ㅅ).
 * - 속공간 막힘: 속공간 = 그 자소 잉크의 볼록 껍질 − 잉크의 흰 덩어리(닫힌 ㅁ · ㅇ, 열린 ㄹ 홈 · ㅃ 기둥 사이 · ㅅ 다리 사이).
 *   기준에서 `REF_OPENING` 넘게 열린 속공간마다 한가운데를 지금 잉크 자리로 옮겨, 거기 틈 기준 넘게 열린 흰 곳이 하나도 안 걸리면 막힘.
 *   개수로 견주지 않는다 — 가로를 좁히면 ㅆ 두 ㅅ 다리 밑이 하나로 이어져 수가 줄기도 한다(막힌 게 아님).
 */

/**
 * 틈이 획 두께의 이만큼보다 좁으면 막힘 · 닿음으로 본다(굵기 400 = 17.5u, 900 = 34u).
 * 굵을수록 같은 틈도 좁아 보인다 — 밭 · 굵기 900의 ㅌ 받침은 틈 13 · 17u인데 붙어 보인다(2026-10-01 사용자 확인, 고정 10u에서 바꿈).
 */
export const OPENING_RATIO = 0.25
/** 기준에서 이보다 넓게 열린 속공간만 막힘을 센다(u). 원래 좁던 홈(ㅀ 안 11u 틈 등)이 조금 줄어든 것은 안 센다. */
export const REF_OPENING = 24
/** 이보다 작게 겹치면 닿음으로 안 센다(u²). 윤곽 반올림 잡음. */
const TOUCH_AREA = 1

type Vec = { x: number; y: number }
type Bounds = { left: number; right: number; top: number; bottom: number }
/** `open`: 흰 곳을 틈 기준의 반만큼 깎고 남은 조각들. */
export type PartInk = { part: string; ink: PathsD; area: number; bounds: Bounds; white: PathsD[]; open: PathsD[] }
export type GlyphInk = { parts: PartInk[]; touching: string[]; inner: string[]; area: number }
/** 기준에서 잰 글자 하나. 자소별 속공간과, 원래 닿아 있는 자소 쌍 · 획 쌍. */
export type GlyphReference = { parts: Map<string, PartReference>; touching: Set<string>; inner: Set<string> }
/** 기준에서 잰 자소 하나. `cores`: 넉넉히 열린 속공간의 한가운데. */
type PartReference = { bounds: Bounds; cores: PathsD[] }
/** 기준에 견준 결과. `touch`: 자소 사이 닿음(자소 쌍), `closed`: 속공간 막힌 자소, `split`: 자소 안 닿음(획 쌍). */
export type InkVerdict = { touch: string[]; closed: string[]; split: string[] }
/** 획 하나의 잉크. `key` = 자소/획 id. */
type StrokeInk = { part: string; key: string; ink: PathsD }

/** 섞임홀자의 가로부 · 세로부(`JU_H` · `JU_V`)는 한 자소로 본다. */
export const jamoOf = (part: string) => part.startsWith('JU') ? 'JU' : part
const jamoOfStroke = (item: GlyphData['strokes'][number]) => jamoOf((item.beakGroup ?? '').split(':')[0])

/**
 * 자소마다 `counterKeepScale`만큼 획 두께를 줄인 글리프 데이터와, 자소별 배율. 섞임홀자는 한 자소로 묶는다.
 * `horizontalShare`를 주면 가로줄기를 덜 굵게 한 뒤에 배율을 얹는다 — 지킬 틈은 늘 원래(굵기 400) 모양에서 고른다.
 * `minScale`: 자소 배율 바닥(0이면 없음).
 * `betweenOpening`: 4단계 임시판 — 이웃 자소를 마주 본 획만 추가로 덜 굵게(측정의 닿음 기준과 같은 0.25 권장, 0이면 끔).
 */
export function withCounterKeep(data: GlyphData, floor: CounterFloor, horizontalShare = 1, minScale = 0, betweenOpening = 0): { data: GlyphData; scales: Map<string, number> } {
  const scales = new Map<string, number>()
  for (const part of new Set(data.strokes.map(jamoOfStroke))) {
    // `minScale`: 자소 배율 바닥 — 한 글자 안 자소 굵기가 너무 갈리지 않게(뷁의 ㅂ 1.0 · ㅞ 0.72, 빼의 ㅃ 0.65).
    scales.set(part, Math.max(minScale, counterKeepScale(data.strokes.filter((item) => jamoOfStroke(item) === part), data.weightMultiplier, floor, stemScaleOf(data.strokeStyle), horizontalShare)))
  }
  const shaped = withHorizontalShare(data, horizontalShare)
  let strokes = shaped.strokes.map((item) => scaleStrokeThickness(item, scales.get(jamoOfStroke(item)) ?? 1))
  if (betweenOpening > 0) {
    const parts = [...new Set(data.strokes.map(jamoOfStroke))]
    const between = betweenKeepScales(data.strokes, data.strokes.map((item) => parts.indexOf(jamoOfStroke(item))), data.weightMultiplier, stemScaleOf(data.strokeStyle), horizontalShare, betweenOpening)
    strokes = strokes.map((item, index) => scaleStrokeThickness(item, between[index]))
  }
  return { data: { ...shaped, strokes }, scales }
}

/**
 * 가로줄기를 세로줄기보다 덜 굵게(속공간 지키기 3단계 후보). `share` = 400 대비 늘어난 두께 가운데 가로줄기가 받는 몫(1 = 지금).
 * 획마다 누운 만큼(`strokeVerticalness`) 두께를 줄인다 — 붓 모양과 상관없이 먹는다(10-01: 세로줄기 배율로 싣던 첫 판은 둥근 붓에서만 먹어 네모붓 폰트에서 후보가 똑같았다).
 * 굵기 400 이하는 그대로.
 */
export function withHorizontalShare(data: GlyphData, share: number): GlyphData {
  const k = data.weightMultiplier
  if (!(k > 1) || share === 1) return data
  return {
    ...data,
    strokes: data.strokes.map((item) => scaleStrokeThickness(item, strokeGrowthOf(strokeVerticalness(item.stroke, item.box), k, share) / k)),
  }
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

export const shrinkPaths = (paths: PathsD, by: number): PathsD => inflatePathsD(paths, -by / 2, JoinType.Miter, EndType.Polygon).filter((path) => path.length >= 3)
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

/** 글자 하나를 자소 · 획마다 잰다. 틈 기준은 획 두께(가운데값) × `OPENING_RATIO`. */
export function measureGlyphInk(data: GlyphData): GlyphInk {
  const parts = [...new Set(data.strokes.map(jamoOfStroke))]
  const strokes = data.strokes.map((item): StrokeInk => ({ part: jamoOfStroke(item), key: `${jamoOfStroke(item)}/${item.stroke.id}`, ink: unionD(glyphDataToFontContours({ ...data, strokes: [item] }), FillRule.NonZero) }))
  const thickness = data.strokes.map((item) => item.stroke.thickness).sort((a, b) => a - b)[Math.floor(data.strokes.length / 2)]
  const opening = thickness * data.weightMultiplier * 1000 * OPENING_RATIO
  const measured = parts.map((part): PartInk => {
    const ink = unionD(glyphDataToFontContours({ ...data, strokes: data.strokes.filter((item) => jamoOfStroke(item) === part) }), FillRule.NonZero)
    if (ink.length === 0) return { part, ink, area: 0, bounds: { left: 0, right: 0, top: 0, bottom: 0 }, white: [], open: [] }
    const white = piecesOf(differenceD([hullOf(ink)], ink, FillRule.NonZero))
    return { part, ink, area: areaPathsD(ink), bounds: boundsOf(ink), white, open: white.flatMap((piece) => piecesOf(shrinkPaths(piece, opening))) }
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

/** 기준 조건에서 잰 글자를 견줄 기준으로 바꾼다. */
export function referenceOfGlyph(ink: GlyphInk): GlyphReference {
  return {
    parts: new Map(ink.parts.map((item) => [item.part, { bounds: item.bounds, cores: item.white.map((piece) => shrinkPaths(piece, REF_OPENING)).filter((core) => core.length > 0) }])),
    touching: new Set(ink.touching),
    inner: new Set(ink.inner),
  }
}

/** 기준 속공간 가운데 지금 막힌 것이 있나. */
function isClosed(item: PartInk, reference: PartReference): boolean {
  return reference.cores.some((core) => {
    const moved = mapInto(core, reference.bounds, item.bounds)
    return !item.open.some((piece) => overlaps(moved, piece))
  })
}

/** 기준에 견줘 새로 생긴 닿음 · 막힘. */
export function judgeGlyphInk(ink: GlyphInk, reference: GlyphReference | undefined): InkVerdict {
  return {
    touch: ink.touching.filter((pair) => !reference?.touching.has(pair)),
    closed: ink.parts.filter((item) => { const partReference = reference?.parts.get(item.part); return partReference ? isClosed(item, partReference) : false }).map((item) => item.part),
    split: [...new Set(ink.inner.filter((pair) => !reference?.inner.has(pair)))],
  }
}
