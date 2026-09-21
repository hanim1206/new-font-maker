import { finalGlyphInkToSvgPath } from '../src/services/finalGlyphInk'
import { inkOfFit, reportFitResult } from '../src/services/notoFitReport'
import type { RailError } from '../src/services/notoFitReport'
import { inkOfComponentFit } from '../src/services/notoComponentFit'
import type { FitInkStyle } from '../src/services/notoComponentFit'
import { boxToFaces, fitPartStrokes } from '../src/services/contextBoxResolver'
import { useJamoStore } from '../src/stores/jamoStore'
import type { DeepReadonly, JamoData } from '../src/types'
import { applyRailEdits, applySlotFacesDelta, boundRailRoles, fitRailAxis } from '../src/services/notoMedialMasterFit'
import type { FitRailKey, MedialFitInput, MedialFitResult, MedialRoleMeasurement, SlotFacesDelta } from '../src/services/notoMedialMasterFit'
import { selectNotoOutlineContours } from '../src/services/notoOutlineInk'
import type { NotoOutline } from '../src/services/notoOutlineInk'
import type { BoxConfig } from '../src/types'
import type { ContextBoxResolution, ContextMedialPart } from '../src/services/contextBoxResolver'
import type { ApprovedNotoInput } from './notoBoundMaster'

/**
 * 레이아웃 편집기용 홀자. 획 마스터 fit은 **기하 엔진**이다: 변화량 모델 rail로 slot(홀자 잉크 상자)을 내고, rail·상자 변 편집의 순서·간격을 판정한다.
 * 화면 잉크는 fit이 아니라 **앱 획**(`useJamoStore`)을 그 slot 네 변에 맞춘 것 — 문장 줄·획 편집과 같은 호출(`fitPartStrokes`)이라 캔버스 = 글자다.
 * 그래서 획 편집에서 홀자를 고치면 레이아웃에도 보인다. 앱 획에 안 닿는 시작·끝 rail은 편집기가 안 내놓는다.
 * 승인 측정이 있는 글자면 Noto 홀자 고스트와의 xor·rail 오차도 같이 내는데, 그건 fit 잉크 기준(측정용)이다.
 */

const ROLE_LABEL: Record<string, string> = { outerPillar: '바깥기둥', innerPillar: '안기둥', baseStem: '줄기', leftStem: '왼줄기', rightStem: '오른줄기', primaryBeam: '보', upperBeam: '위보', lowerBeam: '아래보' }
export const roleLabel = (roleId: string) => ROLE_LABEL[roleId] ?? roleId
const KIND_LABEL = { center: '중심', start: '시작', end: '끝' } as const

export interface MedialFitPart {
  part: ContextMedialPart['part']
  role: MedialFitInput['role']
  roleIds: readonly string[]
  /** 모델 rail 그대로의 fit. 편집의 출발점. */
  fit?: MedialFitResult
  /** 앱 홀자 획과 그 홀자. 있으면 화면 잉크를 이 획으로 그린다(없으면 획 마스터 잉크 — 앱 밖 테스트용). */
  jamo?: DeepReadonly<JamoData>
  medialJamo?: string
  /** 승인 측정이 있을 때만: 비교 대상 고스트와 기준 측정. */
  ghostOutline?: NotoOutline
  reference?: Record<string, MedialRoleMeasurement>
  message?: string
}

export interface MedialFitView {
  parts: MedialFitPart[]
  /** 모델·역할 구성이 없어 fit 자체를 못 한 이유. */
  message?: string
}

export interface RenderedMedialPart {
  /** 화면 잉크. 앱 획이 slot에 안 맞으면 없다(`slot`은 있고 `message`에 이유). */
  path?: string
  /** rail을 놓은 뒤의 홀자 잉크 박스(em). 화면에서 기준선 상자로 칠한다. 있으면 rail 자리 자체는 유효하다. */
  slot?: BoxConfig
  /** 앱 획을 slot에 맞춰 다듬은 중심선 상자. 칸 해석의 `boxes[part]`와 같은 값. */
  inkBox?: BoxConfig
  xorRatio?: number
  inkRatio?: number
  railErrors: RailError[]
  message?: string
}

/** 편집 가능한 rail 하나. id는 part 순번을 붙여 혼합 홀자의 두 part를 구분한다. */
export interface EditableRail {
  id: string
  partIndex: number
  /** 홀자 마스터면 rail 키(core 역할 또는 보조 rail), 닿자 박스면 변 이름(left/right/top/bottom). */
  role: FitRailKey | 'left' | 'right' | 'top' | 'bottom'
  axis: 'x' | 'y'
  label: string
  /** 획의 중심선(center)·길이 시작(start)·길이 끝(end), 닿자 상자의 변(face). 중심·변 = 배치, 시작·끝 = 형태(길이). */
  kind: 'center' | 'start' | 'end' | 'face'
  value: number
  /** 모델 rail 값. 복원·Δ 표시용. */
  original: number
}

function approvedMedialOf(input: ApprovedNotoInput | null) {
  if (!input) return null
  const observation = input.stages.medial.observation as { elements?: { elementId: string; face: { evidence: { contourId: number } } }[] }
  const elements = observation.elements ?? []
  return {
    measurements: input.stages.medial.measurements as Record<string, MedialRoleMeasurement>,
    contourIds: (roleIds: readonly string[]) => elements.filter((e) => roleIds.includes(e.elementId)).map((e) => e.face.evidence.contourId),
  }
}

/**
 * 칸 해석 함수가 낸 홀자 fit(모델 rail)에 승인 측정의 고스트·기준값을 붙인다.
 * fit 자체는 `resolveContextBoxes`가 렌더러와 같은 규칙으로 만든다.
 */
export function fitMedialForGlyph(input: {
  context: ContextBoxResolution
  outline: NotoOutline
  approved: ApprovedNotoInput | null
}): MedialFitView {
  const approved = approvedMedialOf(input.approved)
  const medialJamo = input.context.identity.medialJamo
  const jamo = useJamoStore.getState().jungseong[medialJamo]
  const parts: MedialFitPart[] = input.context.medial.map((group) => {
    const part: MedialFitPart = { part: group.part, role: group.role, roleIds: group.roleIds, fit: group.fit, message: group.message, jamo, medialJamo }
    if (group.fit && approved) {
      part.ghostOutline = selectNotoOutlineContours(input.outline, approved.contourIds(group.roleIds))
      part.reference = Object.fromEntries(Object.entries(approved.measurements).filter(([roleId]) => group.roleIds.includes(roleId)))
    }
    return part
  })
  const unresolvable = parts.length > 0 && parts.every((part) => !part.fit && part.roleIds.length === 0)
  return unresolvable ? { parts: [], message: parts[0].message } : { parts }
}

/** rail 값(em, 없으면 모델 값)으로 획을 놓고 잉크·비교 수치를 낸다. */
/** rail 값으로 홀자 fit을 다시 놓고 잉크·슬롯·오차를 만든다. style은 화면용 끝 모양(글로벌 스타일). 측정은 style과 무관하게 일자 끝 기준. */
export function renderMedialPart(part: MedialFitPart, railsEm?: Readonly<Record<string, number>>, style?: FitInkStyle): RenderedMedialPart {
  if (!part.fit) return { railErrors: [], message: part.message }
  const placed = railsEm ? applyRailEdits(part.fit, railsEm) : { ok: true as const, fit: part.fit }
  if (!placed.ok) return { railErrors: [], message: placed.message }
  const rendered: RenderedMedialPart = { slot: { ...placed.fit.slot }, railErrors: [] }
  if (part.jamo && part.medialJamo) {
    // 앱 획을 slot 네 변에 맞춘다. 못 맞추면(고친 획이 칸보다 큼 등) 상자만 남기고 이유를 돌려준다 — rail 자리는 여전히 유효.
    const fitted = fitPartStrokes({ part: part.part, jamo: part.jamo, faces: boxToFaces(placed.fit.slot), glyphId: 'layout-editor', medialJamo: part.medialJamo, ends: style })
    const ink = fitted.ok ? inkOfComponentFit(fitted.fit, style) : fitted
    if (fitted.ok && ink.ok) { rendered.path = finalGlyphInkToSvgPath({ regions: ink.regions }, 1); rendered.inkBox = { ...fitted.fit.box } }
    else rendered.message = ink.ok ? undefined : ink.message
  } else {
    const ink = inkOfFit(placed.fit, style?.weightMultiplier ?? 1, style)
    if (!ink.ok) return { railErrors: [], message: ink.message }
    rendered.path = finalGlyphInkToSvgPath({ regions: ink.regions }, 1)
  }
  if (part.ghostOutline && part.reference) {
    const report = reportFitResult({ fit: placed.fit, ghostOutline: part.ghostOutline, referenceMeasurements: part.reference })
    rendered.railErrors = report.railErrors
    if (report.ok) { rendered.xorRatio = report.xorRatio; rendered.inkRatio = report.inkRatio } else rendered.message = report.message
  }
  return rendered
}

const SLOT_SIDES = ['left', 'right', 'top', 'bottom'] as const
const SLOT_SIDE_LABEL = { left: '왼변', right: '오른변', top: '윗변', bottom: '아랫변' } as const
const hasSlotDelta = (delta?: SlotFacesDelta) => !!delta && SLOT_SIDES.some((side) => Math.abs(delta[side] ?? 0) > 1e-12)

/**
 * 홀자 상자 변 Δ를 얹은 part. 칸 해석과 같은 순서(상자 변 → 중심 rail)라 이 fit이 rail 편집의 새 출발점이 된다.
 * 못 놓으면(상자가 획 두께보다 좁아짐, 순서·간격 위반) 이유를 돌려준다.
 */
export function withSlotFaces(part: MedialFitPart, delta?: SlotFacesDelta): { ok: true; part: MedialFitPart } | { ok: false; message: string } {
  if (!part.fit || !hasSlotDelta(delta)) return { ok: true, part }
  const moved = applySlotFacesDelta(part.fit, delta!)
  return moved.ok ? { ok: true, part: { ...part, fit: moved.fit } } : { ok: false, message: moved.message }
}

/**
 * 홀자 상자 네 변 rail. 중심 rail은 slot 가장자리를 만드는 획만 글자에 닿아서(ㅣ·ㅡ는 아예 안 닿음), 홀자 자리는 이 변으로 옮긴다.
 * 값은 지금 그려진 상자의 변, 기준값은 거기서 이 변의 세션 Δ를 뺀 자리. id는 `s<part 순번>:<변>`.
 */
export function editableSlotRailsOf(parts: readonly MedialFitPart[], slots: readonly (BoxConfig | undefined)[], deltaByPart: readonly (SlotFacesDelta | undefined)[]): EditableRail[] {
  const rails: EditableRail[] = []
  parts.forEach((part, partIndex) => {
    const slot = slots[partIndex]
    if (!part.fit || !slot) return
    const partLabel = part.role === 'JU_H' ? '가로부 ' : part.role === 'JU_V' ? '세로부 ' : '홀자 '
    const sides = { left: slot.x, right: slot.x + slot.width, top: slot.y, bottom: slot.y + slot.height }
    for (const side of SLOT_SIDES) {
      rails.push({ id: `s${partIndex}:${side}`, partIndex, role: side, kind: 'face', axis: side === 'left' || side === 'right' ? 'x' : 'y', label: `${partLabel}${SLOT_SIDE_LABEL[side]}`, value: sides[side], original: sides[side] - (deltaByPart[partIndex]?.[side] ?? 0) })
    }
  })
  return rails
}

/** 편집 가능한 rail 목록. 획이 매인 core rail만, 사람이 읽을 이름으로. */
export function editableRailsOf(parts: readonly MedialFitPart[], railsByPart: readonly (Readonly<Record<string, number>> | undefined)[]): EditableRail[] {
  const rails: EditableRail[] = []
  parts.forEach((part, partIndex) => {
    const fit = part.fit
    if (!fit) return
    const current = railsByPart[partIndex] ?? fit.railsEm
    const partLabel = part.role === 'JU_H' ? '가로부 ' : part.role === 'JU_V' ? '세로부 ' : ''
    for (const role of boundRailRoles(fit)) {
      const binding = fit.bindings.find((b) => b.centerRail === role) ?? fit.bindings.find((b) => b.fromRail === role || b.toRail === role)!
      const kind = binding.centerRail === role ? 'center' : binding.fromRail === role ? 'start' : 'end'
      rails.push({
        id: `${partIndex}:${role}`, partIndex, role, kind,
        axis: fitRailAxis(role),
        label: `${partLabel}${roleLabel(binding.roleId)} ${KIND_LABEL[kind]}`,
        value: current[role], original: fit.railsEm[role],
      })
    }
  })
  return rails
}
