import { finalGlyphInkToSvgPath } from '../src/services/finalGlyphInk'
import { inkOfFit, reportFitResult } from '../src/services/notoFitReport'
import type { RailError } from '../src/services/notoFitReport'
import type { FitInkStyle } from '../src/services/notoComponentFit'
import { applyRailEdits, boundRailRoles, fitRailAxis } from '../src/services/notoMedialMasterFit'
import type { FitRailKey, MedialFitInput, MedialFitResult, MedialRoleMeasurement } from '../src/services/notoMedialMasterFit'
import { selectNotoOutlineContours } from '../src/services/notoOutlineInk'
import type { NotoOutline } from '../src/services/notoOutlineInk'
import type { BoxConfig } from '../src/types'
import type { ContextBoxResolution, ContextMedialPart } from '../src/services/contextBoxResolver'
import type { ApprovedNotoInput } from './notoBoundMaster'

/**
 * 검수 화면용 홀자 획 마스터 fit. 변화량 모델 rail로 fit해 잉크 경로를 만들고,
 * 승인 측정이 있는 글자면 Noto 홀자 고스트와의 xor·rail 오차도 같이 낸다.
 * rail 편집은 fit 결과 위에서 `renderMedialPart`로 다시 놓는다. 두께는 안 변한다.
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
  path?: string
  /** 획을 놓은 뒤의 홀자 잉크 박스(em). 화면에서 기준선 상자로 칠한다. */
  slot?: BoxConfig
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
  const parts: MedialFitPart[] = input.context.medial.map((group) => {
    const part: MedialFitPart = { part: group.part, role: group.role, roleIds: group.roleIds, fit: group.fit, message: group.message }
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
  const ink = inkOfFit(placed.fit, 1, style)
  if (!ink.ok) return { railErrors: [], message: ink.message }
  const rendered: RenderedMedialPart = { path: finalGlyphInkToSvgPath({ regions: ink.regions }, 1), slot: { ...placed.fit.slot }, railErrors: [] }
  if (part.ghostOutline && part.reference) {
    const report = reportFitResult({ fit: placed.fit, ghostOutline: part.ghostOutline, referenceMeasurements: part.reference })
    rendered.railErrors = report.railErrors
    if (report.ok) { rendered.xorRatio = report.xorRatio; rendered.inkRatio = report.inkRatio } else rendered.message = report.message
  }
  return rendered
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
