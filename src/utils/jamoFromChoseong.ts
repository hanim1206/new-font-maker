import type { JamoData, StrokeDataV2 } from '../types'

/**
 * 받침을 초성 모양으로. 초성의 기본 카드(`strokes`)를 누른 순간 한 번 복사한다 — 이후 초성을 고쳐도 받침은 따라가지 않는다.
 * 초성의 문맥 변형(`contextStrokes`)은 가져오지 않는다. 받침의 변형 카드(`overrides`)는 그대로 둔다.
 * 획 id는 받침 꼴(`ㄱ종-1`)로 새로 붙인다 — 한 글자 안에 초성 ㄱ과 받침 ㄱ이 같이 놓이면(각) 같은 id가 겹친다.
 * 틀(`frame`)은 초성 것을 따른다. 틀은 그 획의 좌표 공간이라 획과 같이 옮겨야 상자 맞춤이 초성과 같다.
 */
export function jongseongFromChoseong(choseong: JamoData, jongseong: JamoData): JamoData {
  const renamed = (strokes: StrokeDataV2[]) => strokes.map((stroke, index) => ({ ...structuredClone(stroke), id: `${jongseong.char}종-${index + 1}` }))
  const next: JamoData = { ...jongseong, strokes: renamed(choseong.strokes ?? []) }
  delete next.contextStrokes
  delete next.horizontalStrokes
  delete next.verticalStrokes
  delete next.contextualInkSafety
  delete next.frame
  delete next.geometryMode
  if (choseong.frame?.strokes) next.frame = { strokes: renamed(choseong.frame.strokes) }
  if (choseong.geometryMode) next.geometryMode = choseong.geometryMode
  return next
}

/** 받침이 이미 초성 모양인가. 한 번 더 복사해도 그대로면 같다고 본다(키 순서는 따지지 않는다). */
export function matchesChoseong(choseong: JamoData, jongseong: JamoData): boolean {
  return canonical(jongseongFromChoseong(choseong, jongseong)) === canonical(jongseong)
}

function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => (item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item as Record<string, unknown>).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)))
    : item))
}
