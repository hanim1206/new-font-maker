import type { BoxConfig, DecomposedSyllable, DeepReadonly, JamoData, Part, StrokeLinecap, StrokeLinejoin } from '../types'
import { fitNotoComponent } from './notoComponentFit'
import type { ComponentFaces } from './notoComponentFit'
import { medialInputFromPrediction } from './notoFitReport'
import { applyMedialDelta } from './medialRailDelta'
import type { SemanticDelta } from './medialRailDelta'
import { applyRailEdits, applySlotFacesDelta, fitNotoMedialMaster, splitMixedMedialRoles } from './notoMedialMasterFit'
import type { MedialFitInput, MedialFitResult } from './notoMedialMasterFit'
import { MEDIAL_ROLE_SETS, modelIdentityOf, predictNotoTarget } from './notoVariationModel'
import { medialFamilyOf } from '../utils/jamoContextStrokes'
import type { ModelIdentity, VariationModel } from './notoVariationModel'

/**
 * 칸 해석 함수. 문맥 칸(초성×중성×종성) 하나를 부품 상자로 푼다.
 * 렌더러(`SvgRenderer` boxes), 검수 글자 화면, 격자 xor 리포트가 전부 이 함수를 거친다.
 *
 * 상자는 저장하지 않는다 — 변화량 모델 예측 + Δ(사용자 편집, `ContextBoxDelta`)의 파생값이다.
 * - 첫닿자·받침: 모델이 예측한 네 변(roleFaces) + 네 변 Δ.
 * - 홀자: 모델 rail + 획 역할 rail Δ로 fit한 획 마스터의 잉크 박스(slot). 혼합 홀자는 가로부·세로부 둘.
 * 네 변은 잉크 바깥면이다. 앱 획을 놓을 중심선 상자는 획 두께를 알아야 하므로,
 * syllable(앱 획)이 있으면 `fitNotoComponent`로 잉크가 네 변에 닿는 상자를 낸다.
 */

export type ContextFaces = ComponentFaces

export type MedialPart = Extract<Part, 'JU' | 'JU_H' | 'JU_V'>

/**
 * 배치 Δ. 저장 단위는 이것뿐이다(상자는 저장하지 않는다).
 * - `faces`: 네 변 오프셋(em). 닿자(CH·JO)는 상자에 그대로 얹고, 홀자(JU·JU_H·JU_V)는 잉크 상자 변이라 rail을 축별 아핀으로 다시 놓는다(두께 고정, `applySlotFacesDelta`).
 * - `medial`: 홀자 part별 획 역할 중심 rail 오프셋(em, `primaryBeam.center` 같은 키). 모델 rail에 얹어 fit을 다시 놓으므로 slot이 따라온다.
 * 홀자는 상자 변 Δ를 먼저, 중심 rail Δ를 그 위에 얹는다.
 * 순서·간격 위반으로 다시 놓지 못하는 글자는 Δ를 받지 않고 모델 rail 그대로다(클램프 = 자동 예외).
 */
export interface ContextBoxDelta {
  faces?: Partial<Record<Part, Partial<ContextFaces>>>
  medial?: Partial<Record<MedialPart, SemanticDelta>>
}

const EMPTY_DELTA: ContextBoxDelta = {}

/** 두 Δ를 더한다. `전체` Δ 위에 `이 레이아웃` Δ를 얹을 때. */
export function addContextBoxDelta(base: ContextBoxDelta | undefined, extra: ContextBoxDelta | undefined): ContextBoxDelta {
  if (!base) return extra ?? EMPTY_DELTA
  if (!extra) return base
  const faces: NonNullable<ContextBoxDelta['faces']> = {}
  for (const source of [base.faces, extra.faces]) for (const [part, offsets] of Object.entries(source ?? {}) as [Part, Partial<ContextFaces>][]) {
    const target = (faces[part] ??= {})
    for (const side of SIDES) if (offsets[side] !== undefined) target[side] = (target[side] ?? 0) + offsets[side]!
  }
  const medial: NonNullable<ContextBoxDelta['medial']> = {}
  for (const source of [base.medial, extra.medial]) for (const [part, rails] of Object.entries(source ?? {}) as [MedialPart, SemanticDelta][]) {
    const target = (medial[part] ??= {})
    for (const [key, value] of Object.entries(rails) as [keyof SemanticDelta, number | undefined][]) if (value !== undefined) target[key] = (target[key] ?? 0) + value
  }
  return { faces, medial }
}

/** Δ에 0이 아닌 값이 하나라도 있는지. */
export function hasContextBoxDelta(delta: ContextBoxDelta | undefined): boolean {
  if (!delta) return false
  const nonZero = (values: object) => Object.values(values).some((value) => typeof value === 'number' && Math.abs(value) > 1e-12)
  return Object.values(delta.faces ?? {}).some((offsets) => offsets && nonZero(offsets)) || Object.values(delta.medial ?? {}).some((rails) => rails && nonZero(rails))
}

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

/**
 * 모델 rail로 홀자 획 마스터를 fit한다. 검수 화면과 칸 해석이 같은 fit을 쓴다.
 * 홀자 Δ가 있으면 획 역할 키로 rail에 얹어 다시 놓는다. 못 놓으면(순서·간격 위반) 모델 rail 그대로.
 */
export function fitContextMedial(identity: ModelIdentity, model: ContextModel, medialDelta?: ContextBoxDelta['medial'], facesDelta?: ContextBoxDelta['faces']): ContextMedialPart[] {
  const groups = medialPartGroups(identity.medialJamo)
  if (!groups) return [{ part: 'JU', role: 'JU_VERTICAL', roleIds: [], message: `${identity.medialJamo}의 역할 구성이 없습니다.` }]
  const thickness = model.thickness[identity.medialJamo]
  if (!thickness) return groups.map((group) => ({ ...group, message: `${identity.medialJamo}의 대표 두께가 없습니다.` }))
  const predicted = (target: string) => predictNotoTarget(model.model, target, identity)?.predicted ?? null
  return groups.map((group) => {
    const made = medialInputFromPrediction({ jamoId: identity.medialJamo, role: group.role, roleIds: group.roleIds, predicted, thickness })
    if (!made.ok) return { ...group, message: made.message }
    const fit = fitNotoMedialMaster(made.input)
    if (!fit.ok) return { ...group, message: fit.message }
    return { ...group, fit: withMedialDelta(withSlotFacesDelta(fit.fit, facesDelta?.[group.part]), medialDelta?.[group.part]) }
  })
}

/** 홀자 상자 변 Δ. 닿자와 달리 상자만 미는 게 아니라 rail을 다시 놓아 fit의 slot이 따라오게 한다. 못 놓으면 그대로. */
function withSlotFacesDelta(fit: MedialFitResult, delta?: Partial<ContextFaces>): MedialFitResult {
  if (!delta || !SIDES.some((side) => Math.abs(delta[side] ?? 0) > 1e-12)) return fit
  const moved = applySlotFacesDelta(fit, delta)
  return moved.ok ? moved.fit : fit
}

function withMedialDelta(fit: MedialFitResult, delta?: SemanticDelta): MedialFitResult {
  if (!delta) return fit
  const applied = applyMedialDelta(fit, delta)
  if (applied.applied === 0) return fit
  const moved = applyRailEdits(fit, applied.rails)
  return moved.ok ? moved.fit : fit
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
function placePart(part: Part, faces: ContextFaces, syllable: DeepReadonly<DecomposedSyllable> | undefined, glyphId: string, medialJamo: string, ends?: StrokeEnds): ContextPartBox | string {
  const jamo = jamoForPart(syllable, part)
  if (!jamo) return { part, faces, box: facesToBox(faces), fitted: false }
  const fit = fitNotoComponent({ part, jamo, channel: CHANNEL_OF[part], family: medialFamilyOf(medialJamo), faces, glyphId: `${glyphId}:${part}`, globalLinecap: ends?.linecap, globalLinejoin: ends?.linejoin })
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
  // 닿자 변 Δ는 여기서 상자에 얹는다. 홀자 변 Δ는 fit 단계에서 이미 slot에 들어가 있어 다시 얹지 않는다.
  const place = (part: Part, faces: ContextFaces, facesDelta?: Partial<ContextFaces>) => {
    const placed = placePart(part, withDelta(faces, facesDelta), syllable, glyphId, identity.medialJamo, input.ends)
    if (typeof placed === 'string') issues.push({ part, message: placed })
    else parts.push(placed)
  }

  const initial = predictComponentFaces(identity, model, 'CH')
  if (initial) place('CH', initial, delta?.faces?.CH)
  else issues.push({ part: 'CH', message: '이 문맥의 첫닿자 박스 예측이 없습니다.' })

  const medial = fitContextMedial(identity, model, delta?.medial, delta?.faces)
  for (const group of medial) {
    if (group.fit) place(group.part, boxToFaces(group.fit.slot))
    else issues.push({ part: group.part, message: group.message ?? '홀자 fit 실패' })
  }

  if (identity.finalJamo) {
    const final = predictComponentFaces(identity, model, 'JO')
    if (final) place('JO', final, delta?.faces?.JO)
    else issues.push({ part: 'JO', message: '이 문맥의 받침 박스 예측이 없습니다.' })
  }

  const boxes: Partial<Record<Part, BoxConfig>> = {}
  for (const part of parts) boxes[part.part] = { ...part.box }
  return { identity, parts, medial, issues, complete: issues.length === 0, boxes }
}
