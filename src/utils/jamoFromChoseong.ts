import type { AnchorPoint, JamoData, StrokeDataV2 } from '../types'
import { COMPOUND_JONGSEONG } from './jamoLinkUtils'

/** 초성 하나를 받침 상자의 어느 x 구간에 놓을지. `from`–`to`는 0–1. */
interface Placement { choseong: JamoData; from: number; to: number }

/**
 * 겹받침을 초성 둘로 만들 때 앞·뒤 자음이 차지하는 x 구간. 글자마다 다르지 않고 고정이다.
 * 프리셋 겹받침(ㄳ의 ㄱ 0–0.37 · ㅅ 0.48–1, ㅄ의 ㅂ 0.05–0.40 · ㅅ 0.50–1)의 평균에 가깝게 잡았다.
 */
export const CLUSTER_SPLIT = { front: { from: 0, to: 0.42 }, back: { from: 0.52, to: 1 } } as const

/**
 * 받침을 초성 모양으로. 초성의 기본 카드(`strokes`)를 누른 순간 한 번 복사한다 — 이후 초성을 고쳐도 받침은 따라가지 않는다.
 * 초성의 문맥 변형(`contextStrokes`)은 가져오지 않는다. 받침의 변형 카드(`overrides`)는 그대로 둔다.
 * 획 id는 받침 꼴(`ㄱ종-1`)로 새로 붙인다 — 한 글자 안에 초성 ㄱ과 받침 ㄱ이 같이 놓이면(각) 같은 id가 겹친다.
 * 틀(`frame`)은 초성 것을 따른다. 틀은 그 획의 좌표 공간이라 획과 같이 옮겨야 상자 맞춤이 초성과 같다.
 */
export function jongseongFromChoseong(choseong: JamoData, jongseong: JamoData): JamoData {
  return assemble(jongseong, [{ choseong, from: 0, to: 1 }], '종')
}

/**
 * 겹받침을 초성 둘로. 앞 초성을 왼쪽 구간, 뒤 초성을 오른쪽 구간에 x만 눌러 넣는다(`CLUSTER_SPLIT`).
 * 두께는 상자가 아니라 글자 기준이라 반으로 눌러도 획이 얇아지지 않는다.
 * 틀은 둘 중 하나라도 있으면 만든다 — 틀이 없는 쪽은 그 획이 곧 틀이므로 획을 같은 자리에 넣는다.
 */
export function clusterFromChoseong(front: JamoData, back: JamoData, jongseong: JamoData): JamoData {
  return assemble(jongseong, [{ choseong: front, ...CLUSTER_SPLIT.front }, { choseong: back, ...CLUSTER_SPLIT.back }], '종')
}

/**
 * 쌍자음 초성의 앞 · 뒤 홑자음이 차지하는 x 구간. 노토 프리셋 쌍자음에서 잰 값을 반올림했다(글자마다 다르다 — ㄸ은 좁게 붙고 ㄲ은 벌어진다).
 */
export const DOUBLE_SPLIT: Record<string, { single: string; front: { from: number; to: number }; back: { from: number; to: number } }> = {
  'ㄲ': { single: 'ㄱ', front: { from: 0, to: 0.37 }, back: { from: 0.6, to: 0.98 } },
  'ㄸ': { single: 'ㄷ', front: { from: 0.01, to: 0.56 }, back: { from: 0.59, to: 1 } },
  'ㅃ': { single: 'ㅂ', front: { from: 0, to: 0.42 }, back: { from: 0.61, to: 1 } },
  'ㅆ': { single: 'ㅅ', front: { from: 0, to: 0.52 }, back: { from: 0.5, to: 1 } },
  'ㅉ': { single: 'ㅈ', front: { from: 0.02, to: 0.47 }, back: { from: 0.48, to: 0.98 } },
}

/**
 * 쌍자음 초성을 홑자음 둘로(ㄱ → ㄲ). 누른 순간 한 번 복사한다 — 이후 홑자음을 고쳐도 따라가지 않는다(받침 `초성 모양`과 같다).
 * 홑자음은 부르는 쪽이 지금 모음 계열 변형으로 골라 넘긴다. x만 눌러 넣고 두께는 그대로.
 */
export function doubleFromSingle(single: JamoData, double: JamoData): JamoData | null {
  const split = DOUBLE_SPLIT[double.char]
  if (!split || single.char !== split.single) return null
  return assemble(double, [{ choseong: single, ...split.front }, { choseong: single, ...split.back }], '')
}

/** 이 받침을 초성에서 가져올 수 있는가. 홑 · 쌍받침은 같은 초성이, 겹받침은 앞 · 뒤 초성이 둘 다 있어야 한다. */
export function canBorrowFromChoseong(choseongJamos: Record<string, JamoData>, char: string): boolean {
  const parts = COMPOUND_JONGSEONG[char]
  return parts ? parts.every((part) => Boolean(choseongJamos[part])) : Boolean(choseongJamos[char])
}

/** 받침을 초성에서 가져온다. 홑 · 쌍받침은 그대로, 겹받침은 앞 · 뒤 초성을 반씩. 못 가져오면 null. */
export function borrowFromChoseong(choseongJamos: Record<string, JamoData>, jongseong: JamoData): JamoData | null {
  if (!canBorrowFromChoseong(choseongJamos, jongseong.char)) return null
  const parts = COMPOUND_JONGSEONG[jongseong.char]
  return parts
    ? clusterFromChoseong(choseongJamos[parts[0]], choseongJamos[parts[1]], jongseong)
    : jongseongFromChoseong(choseongJamos[jongseong.char], jongseong)
}

/** 받침이 이미 초성 모양인가. 한 번 더 복사해도 그대로면 같다고 본다(키 순서는 따지지 않는다). */
export function matchesChoseong(choseongJamos: Record<string, JamoData>, jongseong: JamoData): boolean {
  const copied = borrowFromChoseong(choseongJamos, jongseong)
  return copied !== null && canonical(copied) === canonical(jongseong)
}

/** `mark`는 획 id의 꼴 표시: 받침은 `종`(ㄱ종-1), 초성은 빈 값(ㄲ-1). */
function assemble(jongseong: JamoData, placements: Placement[], mark: string): JamoData {
  const strokes = placements.flatMap(({ choseong, from, to }) => placed(choseong.strokes ?? [], from, to))
  const next: JamoData = { ...jongseong, strokes: renamed(strokes, jongseong.char, mark) }
  delete next.contextStrokes
  delete next.horizontalStrokes
  delete next.verticalStrokes
  delete next.contextualInkSafety
  delete next.frame
  delete next.geometryMode
  if (placements.some(({ choseong }) => choseong.frame?.strokes)) {
    const frameStrokes = placements.flatMap(({ choseong, from, to }) => placed(choseong.frame?.strokes ?? choseong.strokes ?? [], from, to))
    next.frame = { strokes: renamed(frameStrokes, jongseong.char, mark) }
  }
  const geometryMode = placements.find(({ choseong }) => choseong.geometryMode)?.choseong.geometryMode
  if (geometryMode) next.geometryMode = geometryMode
  return next
}

function renamed(strokes: StrokeDataV2[], char: string, mark: string): StrokeDataV2[] {
  return strokes.map((stroke, index) => ({ ...stroke, id: `${char}${mark}-${index + 1}` }))
}

/** 획을 복사해 x를 `from`–`to` 구간으로 누른다. 0–1 전체면 그대로 복사다. */
function placed(strokes: StrokeDataV2[], from: number, to: number): StrokeDataV2[] {
  const scaleX = (x: number) => from + x * (to - from)
  const point = (p: AnchorPoint): AnchorPoint => ({
    ...p,
    x: scaleX(p.x),
    ...(p.handleIn ? { handleIn: { x: scaleX(p.handleIn.x), y: p.handleIn.y } } : {}),
    ...(p.handleOut ? { handleOut: { x: scaleX(p.handleOut.x), y: p.handleOut.y } } : {}),
  })
  return strokes.map((stroke) => ({ ...structuredClone(stroke), points: stroke.points.map(point) }))
}

function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => (item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item as Record<string, unknown>).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)))
    : item))
}
