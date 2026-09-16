import type { DecomposedSyllable, DeepReadonly, JamoData, MedialFamily, StrokeDataV2 } from '../types'

/**
 * 문맥별 획 변형. 같은 자모라도 홀자 계열(오른홀자 가·아래홀자 고·혼합 과)마다 Noto 골격이 다르다(ㄱ 다리 길이·굽이).
 * 기본 프리셋은 `contextStrokes`에 계열별 획을 두고, 렌더·잉크·편집 겨냥은 전부 여기서 고른다.
 * 사용자가 어느 문맥에서든 자모를 손대면 그 문맥의 획이 하나뿐인 골격이 되고 변형은 사라진다(획 우선: 자소 하나).
 */

export function medialFamilyOf(medialJamo: string | null | undefined): MedialFamily | null {
  if (!medialJamo) return null
  return 'ㅘㅙㅚㅝㅞㅟㅢ'.includes(medialJamo) ? 'mixed' : 'ㅗㅛㅜㅠㅡ'.includes(medialJamo) ? 'bottom' : 'right'
}

export function familyOfSyllable(syllable: Pick<DecomposedSyllable, 'jungseong'>): MedialFamily | null {
  return medialFamilyOf(syllable.jungseong?.char)
}

/** `strokes` 채널을 문맥 계열로 고른다. 변형이 없거나 계열을 모르면 기본 획. */
export function strokesForFamily<T extends DeepReadonly<JamoData> | JamoData>(jamo: T, family: MedialFamily | null | undefined): T['strokes'] {
  const variant = family ? jamo.contextStrokes?.[family] : undefined
  return (variant && variant.length ? variant : jamo.strokes) as T['strokes']
}

/** 편집용: 현재 문맥의 변형을 기본 획으로 올리고 변형 목록은 지운다. 변형이 없으면 그대로(복제). */
export function adoptFamilyStrokes(jamo: JamoData, family: MedialFamily | null | undefined): JamoData {
  const clone = structuredClone(jamo)
  if (!clone.contextStrokes) return clone
  const variant = family ? clone.contextStrokes[family] : undefined
  if (variant && variant.length) clone.strokes = structuredClone(variant) as StrokeDataV2[]
  delete clone.contextStrokes
  return clone
}
