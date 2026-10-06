import type { DecomposedSyllable, DeepReadonly, JamoData, JamoFrame, MedialFamily, StrokeDataV2 } from '../types'
import { frameOf } from './jamoFrame'

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

/**
 * 상자 하나에 통째로 놓이는 자소의 획. 기본 획(`strokes`)에 획이 있으면 그것, 비었으면 세로부 · 가로부 차례(그리기 `selectGeneralChannels`와 같다).
 * ㅒ · ㅖ는 섞임홀자가 아닌데 획을 `verticalStrokes`에만 둔다. 기본 획만 읽으면 그리기엔 보이는데 편집기 · 카드에선 빈 글자가 된다.
 */
export function wholeJamoStrokes(jamo: JamoData): StrokeDataV2[] {
  if (jamo.strokes && jamo.strokes.length > 0) return jamo.strokes
  return [...(jamo.verticalStrokes ?? []), ...(jamo.horizontalStrokes ?? [])]
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

/** 이 계열에 따로 그린 획(변형)이 있나. 비어 있는 변형은 없는 것으로 친다. */
export function hasFamilyStrokes(jamo: DeepReadonly<JamoData> | JamoData, family: MedialFamily | null | undefined): boolean {
  return !!family && !!jamo.contextStrokes?.[family]?.length
}

/** 가르기: 그 계열 변형을 기본 획 복제로 만든다(출발은 늘 기본). 이미 있으면 그대로 돌려준다. */
export function splitFamilyStrokes(jamo: JamoData, family: MedialFamily): JamoData {
  if (hasFamilyStrokes(jamo, family)) return jamo
  const next = structuredClone(jamo)
  next.contextStrokes = { ...(next.contextStrokes ?? {}), [family]: structuredClone(next.strokes ?? []) }
  return next
}

/** 합치기: 그 계열 변형을 지운다. 그 계열 글자는 다시 기본 획을 따른다. 틀의 변형 사본도 같이 지운다. */
export function mergeFamilyStrokes(jamo: JamoData, family: MedialFamily): JamoData {
  if (!hasFamilyStrokes(jamo, family)) return jamo
  const next = structuredClone(jamo)
  delete next.contextStrokes![family]
  if (Object.keys(next.contextStrokes!).length === 0) delete next.contextStrokes
  if (next.frame?.contextStrokes) {
    delete next.frame.contextStrokes[family]
    if (Object.keys(next.frame.contextStrokes).length === 0) delete next.frame.contextStrokes
  }
  return next
}

/**
 * 편집 결과를 저장 꼴로 되돌린다. 편집기는 `adoptFamilyStrokes`로 "그 계열 획만 든 자모"를 고치므로, 저장할 때는
 * - 그 계열에 변형이 있으면: 고친 획을 그 변형 자리에 쓰고 기본 획과 다른 변형은 그대로 둔다. 틀도 그 계열 사본만 바꾼다.
 * - 없으면(기본 편집 · 단독 칸): 기본 획에 쓰고 변형 목록(과 틀의 변형 사본)만 되살린다 — 가른 덩이는 기본을 안 따라온다.
 */
export function writeFamilyStrokes(stored: DeepReadonly<JamoData>, edited: JamoData, family: MedialFamily | null | undefined): JamoData {
  const variants = stored.contextStrokes as JamoData['contextStrokes'] | undefined
  const storedFrame = (stored.frame ? structuredClone(stored.frame) : null) as JamoFrame | null
  if (family && variants?.[family]?.length) {
    const next: JamoData = { ...edited, strokes: structuredClone(stored.strokes) as StrokeDataV2[] | undefined, contextStrokes: { ...structuredClone(variants), [family]: edited.strokes ?? [] } }
    if (edited.frame) {
      const base = storedFrame ?? frameOf(stored)
      next.frame = { ...base, contextStrokes: { ...(base.contextStrokes ?? {}), [family]: structuredClone(edited.frame.strokes ?? []) } }
    }
    return next
  }
  const next: JamoData = { ...edited }
  if (variants && Object.keys(variants).length > 0) next.contextStrokes = structuredClone(variants)
  else delete next.contextStrokes
  if (next.frame) {
    const variantFrames = storedFrame?.contextStrokes
    if (variantFrames && Object.keys(variantFrames).length > 0) next.frame = { ...next.frame, contextStrokes: structuredClone(variantFrames) }
  }
  return next
}
