import { finalGlyphInkToSvgPath } from '../src/services/finalGlyphInk'
import { inkOfFit, medialInputFromPrediction, reportFitResult } from '../src/services/notoFitReport'
import type { RailError } from '../src/services/notoFitReport'
import { applyRailEdits, boundRailRoles, fitNotoMedialMaster, splitMixedMedialRoles } from '../src/services/notoMedialMasterFit'
import type { CoreRailRole, MedialFitInput, MedialFitResult, MedialRoleMeasurement } from '../src/services/notoMedialMasterFit'
import { selectNotoOutlineContours } from '../src/services/notoOutlineInk'
import type { NotoOutline } from '../src/services/notoOutlineInk'
import { MEDIAL_ROLE_SETS, predictNotoTarget } from '../src/services/notoVariationModel'
import { CORE_X_RAIL_ROLES } from '../src/services/railGridResolver'
import type { ApprovedNotoInput } from './notoBoundMaster'
import type { CorpusIdentity } from './notoCorpus'
import type { NotoPresetModelBundle } from './notoPreset'

/**
 * 검수 화면용 홀자 획 마스터 fit. 변화량 모델 rail로 fit해 잉크 경로를 만들고,
 * 승인 측정이 있는 글자면 Noto 홀자 고스트와의 xor·rail 오차도 같이 낸다.
 * rail 편집은 fit 결과 위에서 `renderMedialPart`로 다시 놓는다. 두께는 안 변한다.
 */

const MIXED = 'ㅘㅙㅚㅝㅞㅟㅢ'
const ROLE_LABEL: Record<string, string> = { outerPillar: '바깥기둥', innerPillar: '안기둥', baseStem: '줄기', leftStem: '왼줄기', rightStem: '오른줄기', primaryBeam: '보', upperBeam: '위보', lowerBeam: '아래보' }
export const roleLabel = (roleId: string) => ROLE_LABEL[roleId] ?? roleId

export interface MedialFitPart {
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
  xorRatio?: number
  inkRatio?: number
  railErrors: RailError[]
  message?: string
}

/** 편집 가능한 rail 하나. id는 part 순번을 붙여 혼합 홀자의 두 part를 구분한다. */
export interface EditableRail {
  id: string
  partIndex: number
  role: CoreRailRole
  axis: 'x' | 'y'
  label: string
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

export function fitMedialForGlyph(input: {
  identity: CorpusIdentity
  bundle: NotoPresetModelBundle
  outline: NotoOutline
  approved: ApprovedNotoInput | null
}): MedialFitView {
  const medial = input.identity.medialJamo
  const roleIds = MEDIAL_ROLE_SETS[medial]
  if (!roleIds) return { parts: [], message: `${medial}의 역할 구성이 없습니다.` }
  const thickness = input.bundle.thickness[medial]
  if (!thickness) return { parts: [], message: `${medial}의 대표 두께가 없습니다.` }
  const predicted = (target: string) => predictNotoTarget(input.bundle.model, target, input.identity)?.predicted ?? null
  const approved = approvedMedialOf(input.approved)

  const groups: { role: MedialFitInput['role']; roleIds: readonly string[] }[] = MIXED.includes(medial)
    ? (() => { const split = splitMixedMedialRoles(Object.fromEntries(roleIds.map((id) => [id, true]))); return [{ role: 'JU_H' as const, roleIds: Object.keys(split.horizontal) }, { role: 'JU_V' as const, roleIds: Object.keys(split.vertical) }] })()
    : [{ role: 'ㅗㅛㅜㅠㅡ'.includes(medial) ? 'JU_HORIZONTAL' : 'JU_VERTICAL', roleIds }]

  const parts: MedialFitPart[] = []
  for (const group of groups) {
    const base: MedialFitPart = { role: group.role, roleIds: group.roleIds }
    const made = medialInputFromPrediction({ jamoId: medial, role: group.role, roleIds: group.roleIds, predicted, thickness })
    if (!made.ok) { parts.push({ ...base, message: made.message }); continue }
    const fit = fitNotoMedialMaster(made.input)
    if (!fit.ok) { parts.push({ ...base, message: fit.message }); continue }
    const part: MedialFitPart = { ...base, fit: fit.fit }
    if (approved) {
      part.ghostOutline = selectNotoOutlineContours(input.outline, approved.contourIds(group.roleIds))
      part.reference = Object.fromEntries(Object.entries(approved.measurements).filter(([roleId]) => group.roleIds.includes(roleId)))
    }
    parts.push(part)
  }
  return { parts }
}

/** rail 값(em, 없으면 모델 값)으로 획을 놓고 잉크·비교 수치를 낸다. */
export function renderMedialPart(part: MedialFitPart, railsEm?: Readonly<Record<CoreRailRole, number>>): RenderedMedialPart {
  if (!part.fit) return { railErrors: [], message: part.message }
  const placed = railsEm ? applyRailEdits(part.fit, railsEm) : { ok: true as const, fit: part.fit }
  if (!placed.ok) return { railErrors: [], message: placed.message }
  const ink = inkOfFit(placed.fit)
  if (!ink.ok) return { railErrors: [], message: ink.message }
  const rendered: RenderedMedialPart = { path: finalGlyphInkToSvgPath({ regions: ink.regions }, 1), railErrors: [] }
  if (part.ghostOutline && part.reference) {
    const report = reportFitResult({ fit: placed.fit, ghostOutline: part.ghostOutline, referenceMeasurements: part.reference })
    rendered.railErrors = report.railErrors
    if (report.ok) { rendered.xorRatio = report.xorRatio; rendered.inkRatio = report.inkRatio } else rendered.message = report.message
  }
  return rendered
}

/** 편집 가능한 rail 목록. 획이 매인 core rail만, 사람이 읽을 이름으로. */
export function editableRailsOf(parts: readonly MedialFitPart[], railsByPart: readonly (Readonly<Record<CoreRailRole, number>> | undefined)[]): EditableRail[] {
  const rails: EditableRail[] = []
  parts.forEach((part, partIndex) => {
    const fit = part.fit
    if (!fit) return
    const current = railsByPart[partIndex] ?? fit.railsEm
    const partLabel = part.role === 'JU_H' ? '가로부 ' : part.role === 'JU_V' ? '세로부 ' : ''
    for (const role of boundRailRoles(fit)) {
      const binding = fit.bindings.find((b) => b.centerRail === role) ?? fit.bindings.find((b) => b.fromRail === role || b.toRail === role)!
      const kind = binding.centerRail === role ? '중심' : binding.fromRail === role ? '시작' : '끝'
      rails.push({
        id: `${partIndex}:${role}`, partIndex, role,
        axis: (CORE_X_RAIL_ROLES as readonly string[]).includes(role) ? 'x' : 'y',
        label: `${partLabel}${roleLabel(binding.roleId)} ${kind}`,
        value: current[role], original: fit.railsEm[role],
      })
    }
  })
  return rails
}
