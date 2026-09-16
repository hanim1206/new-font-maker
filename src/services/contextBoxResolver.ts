import type { BoxConfig, DecomposedSyllable, DeepReadonly, JamoData, Part, StrokeLinecap, StrokeLinejoin } from '../types'
import { fitNotoComponent } from './notoComponentFit'
import type { ComponentFaces } from './notoComponentFit'
import { medialInputFromPrediction } from './notoFitReport'
import { fitNotoMedialMaster, splitMixedMedialRoles } from './notoMedialMasterFit'
import type { MedialFitInput, MedialFitResult } from './notoMedialMasterFit'
import { MEDIAL_ROLE_SETS, modelIdentityOf, predictNotoTarget } from './notoVariationModel'
import type { ModelIdentity, VariationModel } from './notoVariationModel'

/**
 * 칸 해석 함수. 문맥 칸(초성×중성×종성) 하나를 부품 상자로 푼다.
 * 렌더러(`SvgRenderer` boxes), 검수 글자 화면, 격자 xor 리포트가 전부 이 함수를 거친다.
 *
 * 상자는 저장하지 않는다 — 변화량 모델 예측 + Δ(사용자 편집)의 파생값이다.
 * - 첫닿자·받침: 모델이 예측한 네 변(roleFaces) + Δ.
 * - 홀자: 모델 rail로 fit한 획 마스터의 잉크 박스(slot) + Δ. 혼합 홀자는 가로부·세로부 둘.
 * 네 변은 잉크 바깥면이다. 앱 획을 놓을 중심선 상자는 획 두께를 알아야 하므로,
 * syllable(앱 획)이 있으면 `fitNotoComponent`로 잉크가 네 변에 닿는 상자를 낸다.
 */

export type ContextFaces = ComponentFaces

/** 글자 Δ. 부품별 네 변 오프셋(em). 저장 단위는 Δ뿐이다. */
export type ContextBoxDelta = Partial<Record<Part, Partial<ContextFaces>>>

/** 모델 묶음에서 칸 해석에 필요한 부분. `NotoPresetModelBundle`이 이 모양을 만족한다. */
export interface ContextModel {
  model: VariationModel
  /** 홀자 → 역할 → 대표 두께(em). */
  thickness: Readonly<Record<string, Readonly<Record<string, number>>>>
}

export interface ContextMedialPart {
  part: Extract<Part, 'JU' | 'JU_H' | 'JU_V'>
  role: MedialFitInput['role']
  roleIds: readonly string[]
  /** 모델 rail 그대로의 fit. 검수 화면 rail 편집의 출발점. */
  fit?: MedialFitResult
  message?: string
}

export interface ContextPartBox {
  part: Part
  /** 잉크 바깥면(em). Δ 적용 뒤. */
  faces: ContextFaces
  /** 앱 획을 놓을 중심선 상자. 획이 없으면 faces 그대로. */
  box: BoxConfig
  /** 상자를 앱 획 두께에 맞춰 안쪽으로 다듬었는지. */
  fitted: boolean
}

export interface ContextBoxResolution {
  identity: ModelIdentity
  parts: ContextPartBox[]
  medial: ContextMedialPart[]
  /** 부품별 실패 이유. 하나라도 있으면 `complete`가 아니다. */
  issues: { part: Part; message: string }[]
  /** 글자에 필요한 부품이 전부 풀렸는지. 렌더러는 이때만 상자를 쓴다. */
  complete: boolean
  /** 풀린 부품의 중심선 상자. `SvgRenderer` boxes 자리에 그대로 들어간다. */
  boxes: Partial<Record<Part, BoxConfig>>
}

const SIDES = ['left', 'right', 'top', 'bottom'] as const
const MIXED = 'ㅘㅙㅚㅝㅞㅟㅢ'
const BOTTOM = 'ㅗㅛㅜㅠㅡ'

export function facesToBox(faces: ContextFaces): BoxConfig {
  return { x: faces.left, y: faces.top, width: faces.right - faces.left, height: faces.bottom - faces.top }
}

export function boxToFaces(box: BoxConfig): ContextFaces {
  return { left: box.x, right: box.x + box.width, top: box.y, bottom: box.y + box.height }
}

function withDelta(faces: ContextFaces, delta?: Partial<ContextFaces>): ContextFaces {
  if (!delta) return { ...faces }
  return { left: faces.left + (delta.left ?? 0), right: faces.right + (delta.right ?? 0), top: faces.top + (delta.top ?? 0), bottom: faces.bottom + (delta.bottom ?? 0) }
}

/** 앱 음절에서 모델 신원을 만든다. 자모 하나짜리(초성만·중성만)는 문맥 칸이 없어 null. */
export function identityOfSyllable(syllable: Pick<DecomposedSyllable, 'choseong' | 'jungseong' | 'jongseong'>): ModelIdentity | null {
  const initial = syllable.choseong?.char
  const medial = syllable.jungseong?.char
  if (!initial || !medial) return null
  return modelIdentityOf(initial, medial, syllable.jongseong?.char ?? null)
}

/** 홀자 역할 구성을 part별로 가른다. 혼합 홀자는 가로부(JU_H)·세로부(JU_V). */
export function medialPartGroups(medialJamo: string): { part: ContextMedialPart['part']; role: MedialFitInput['role']; roleIds: readonly string[] }[] | null {
  const roleIds = MEDIAL_ROLE_SETS[medialJamo]
  if (!roleIds) return null
  if (MIXED.includes(medialJamo)) {
    const split = splitMixedMedialRoles(Object.fromEntries(roleIds.map((id) => [id, true])), medialJamo)
    return [
      { part: 'JU_H', role: 'JU_H', roleIds: Object.keys(split.horizontal) },
      { part: 'JU_V', role: 'JU_V', roleIds: Object.keys(split.vertical) },
    ]
  }
  return [{ part: 'JU', role: BOTTOM.includes(medialJamo) ? 'JU_HORIZONTAL' : 'JU_VERTICAL', roleIds }]
}

/** 모델 rail로 홀자 획 마스터를 fit한다. 검수 화면과 칸 해석이 같은 fit을 쓴다. */
export function fitContextMedial(identity: ModelIdentity, model: ContextModel): ContextMedialPart[] {
  const groups = medialPartGroups(identity.medialJamo)
  if (!groups) return [{ part: 'JU', role: 'JU_VERTICAL', roleIds: [], message: `${identity.medialJamo}의 역할 구성이 없습니다.` }]
  const thickness = model.thickness[identity.medialJamo]
  if (!thickness) return groups.map((group) => ({ ...group, message: `${identity.medialJamo}의 대표 두께가 없습니다.` }))
  const predicted = (target: string) => predictNotoTarget(model.model, target, identity)?.predicted ?? null
  return groups.map((group) => {
    const made = medialInputFromPrediction({ jamoId: identity.medialJamo, role: group.role, roleIds: group.roleIds, predicted, thickness })
    if (!made.ok) return { ...group, message: made.message }
    const fit = fitNotoMedialMaster(made.input)
    return fit.ok ? { ...group, fit: fit.fit } : { ...group, message: fit.message }
  })
}

/** 모델이 예측한 닿자 네 변(em). 이 문맥에 예측이 없으면 null. */
export function predictComponentFaces(identity: ModelIdentity, model: ContextModel, part: 'CH' | 'JO'): ContextFaces | null {
  const stage = part === 'CH' ? 'initial' : 'final'
  const side = (name: string) => (predictNotoTarget(model.model, `${stage}.roleFaces.${name}`, identity)?.predicted ?? Number.NaN) / 1000
  const faces: ContextFaces = { left: side('left'), right: side('right'), top: side('top'), bottom: side('bottom') }
  return SIDES.every((name) => Number.isFinite(faces[name])) ? faces : null
}

const CHANNEL_OF: Partial<Record<Part, 'horizontalStrokes' | 'verticalStrokes'>> = { JU_H: 'horizontalStrokes', JU_V: 'verticalStrokes' }

function jamoForPart(syllable: DeepReadonly<DecomposedSyllable> | undefined, part: Part): DeepReadonly<JamoData> | null {
  if (!syllable) return null
  if (part === 'CH') return syllable.choseong
  if (part === 'JO') return syllable.jongseong
  return syllable.jungseong
}

/** 네 변 → 앱 획을 놓을 상자. 획이 있으면 잉크가 네 변에 닿도록 두께만큼 안쪽으로 다듬는다. */
function placePart(part: Part, faces: ContextFaces, syllable: DeepReadonly<DecomposedSyllable> | undefined, glyphId: string, ends?: StrokeEnds): ContextPartBox | string {
  const jamo = jamoForPart(syllable, part)
  if (!jamo) return { part, faces, box: facesToBox(faces), fitted: false }
  const fit = fitNotoComponent({ part, jamo, channel: CHANNEL_OF[part], faces, glyphId: `${glyphId}:${part}`, globalLinecap: ends?.linecap, globalLinejoin: ends?.linejoin })
  if (!fit.ok) return fit.message
  return { part, faces, box: fit.fit.box, fitted: true }
}

/** 렌더러가 쓸 전역 캡·조인. 둥근 끝이면 잉크가 끝에서 두께/2 더 나가므로 상자 다듬기에 반영한다. */
export interface StrokeEnds { linecap?: StrokeLinecap; linejoin?: StrokeLinejoin }

export function resolveContextBoxes(input: {
  identity: ModelIdentity
  model: ContextModel
  /** 앱 획. 있으면 상자를 획 두께에 맞춰 다듬고, 없으면 네 변 그대로 상자다. */
  syllable?: DeepReadonly<DecomposedSyllable>
  ends?: StrokeEnds
  delta?: ContextBoxDelta
}): ContextBoxResolution {
  const { identity, model, syllable, delta } = input
  const glyphId = syllable?.char ?? `${identity.initialJamo}${identity.medialJamo}${identity.finalJamo ?? ''}`
  const parts: ContextPartBox[] = []
  const issues: ContextBoxResolution['issues'] = []
  const place = (part: Part, faces: ContextFaces) => {
    const placed = placePart(part, withDelta(faces, delta?.[part]), syllable, glyphId, input.ends)
    if (typeof placed === 'string') issues.push({ part, message: placed })
    else parts.push(placed)
  }

  const initial = predictComponentFaces(identity, model, 'CH')
  if (initial) place('CH', initial)
  else issues.push({ part: 'CH', message: '이 문맥의 첫닿자 박스 예측이 없습니다.' })

  const medial = fitContextMedial(identity, model)
  for (const group of medial) {
    if (group.fit) place(group.part, boxToFaces(group.fit.slot))
    else issues.push({ part: group.part, message: group.message ?? '홀자 fit 실패' })
  }

  if (identity.finalJamo) {
    const final = predictComponentFaces(identity, model, 'JO')
    if (final) place('JO', final)
    else issues.push({ part: 'JO', message: '이 문맥의 받침 박스 예측이 없습니다.' })
  }

  const boxes: Partial<Record<Part, BoxConfig>> = {}
  for (const part of parts) boxes[part.part] = { ...part.box }
  return { identity, parts, medial, issues, complete: issues.length === 0, boxes }
}
