import { finalGlyphInkToSvgPath, materializeFinalGlyphInk } from '../src/services/finalGlyphInk'
import { partForJamoRole } from '../src/services/jamoContextRoles'
import { medialInputFromPrediction, reportMedialFit } from '../src/services/notoFitReport'
import type { RailError } from '../src/services/notoFitReport'
import { fitNotoMedialMaster, splitMixedMedialRoles } from '../src/services/notoMedialMasterFit'
import type { MedialFitInput, MedialRoleMeasurement } from '../src/services/notoMedialMasterFit'
import { selectNotoOutlineContours } from '../src/services/notoOutlineInk'
import type { NotoOutline } from '../src/services/notoOutlineInk'
import { MEDIAL_ROLE_SETS, predictNotoTarget } from '../src/services/notoVariationModel'
import { resolveShapeGlyphInkPrimitives } from '../src/services/shapeGlyphInkResolver'
import type { StrokeRenderStyle } from '../src/types'
import type { ApprovedNotoInput } from './notoBoundMaster'
import type { CorpusIdentity } from './notoCorpus'
import type { NotoPresetModelBundle } from './notoPreset'

/**
 * 검수 화면용 홀자 획 마스터 fit. 변화량 모델 rail로 fit해 잉크 경로를 만들고,
 * 승인 측정이 있는 글자면 Noto 홀자 고스트와의 xor·rail 오차도 같이 낸다.
 */

const STYLE: StrokeRenderStyle = { mode: 'brush', brush: { tip: 'round', aspectRatio: 1, angle: 0 } }
const INK_OPTIONS = { unitsPerEm: 1000, maxCurveErrorFontUnits: 0.5 }
const MIXED = 'ㅘㅙㅚㅝㅞㅟㅢ'

export interface MedialFitPart {
  role: MedialFitInput['role']
  roleIds: readonly string[]
  path?: string
  /** 승인 측정이 있을 때만. */
  xorRatio?: number
  inkRatio?: number
  railErrors: RailError[]
  message?: string
}

export interface MedialFitView {
  parts: MedialFitPart[]
  /** 모델·역할 구성이 없어 fit 자체를 못 한 이유. */
  message?: string
}

interface ApprovedMedial {
  measurements: Record<string, MedialRoleMeasurement>
  contourIds: (roleIds: readonly string[]) => number[]
}

function approvedMedialOf(input: ApprovedNotoInput | null): ApprovedMedial | null {
  if (!input) return null
  const observation = input.stages.medial.observation as { elements?: { elementId: string; face: { evidence: { contourId: number } } }[] }
  const elements = observation.elements ?? []
  return {
    measurements: input.stages.medial.measurements as Record<string, MedialRoleMeasurement>,
    contourIds: (roleIds) => elements.filter((e) => roleIds.includes(e.elementId)).map((e) => e.face.evidence.contourId),
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
    const base: MedialFitPart = { role: group.role, roleIds: group.roleIds, railErrors: [] }
    const made = medialInputFromPrediction({ jamoId: medial, role: group.role, roleIds: group.roleIds, predicted, thickness })
    if (!made.ok) { parts.push({ ...base, message: made.message }); continue }
    const fit = fitNotoMedialMaster(made.input)
    if (!fit.ok) { parts.push({ ...base, message: fit.message }); continue }
    const primitives = resolveShapeGlyphInkPrimitives({ source: fit.fit.scope, masterId: fit.fit.master.id, glyphId: `review:${input.identity.codepoint}:${group.role}`, part: partForJamoRole(group.role), slot: fit.fit.slot, weightMultiplier: 1 })
    if (!primitives.ok) { parts.push({ ...base, message: primitives.issues[0]?.message }); continue }
    const ink = materializeFinalGlyphInk(primitives.primitives, STYLE, INK_OPTIONS)
    if (!ink.ok) { parts.push({ ...base, message: ink.message }); continue }
    const part: MedialFitPart = { ...base, path: finalGlyphInkToSvgPath(ink.ink, 1) }
    if (approved) {
      const reference = Object.fromEntries(Object.entries(approved.measurements).filter(([roleId]) => group.roleIds.includes(roleId)))
      const report = reportMedialFit({ ...made.input, ghostOutline: selectNotoOutlineContours(input.outline, approved.contourIds(group.roleIds)), referenceMeasurements: reference })
      if (report.ok) { part.xorRatio = report.xorRatio; part.inkRatio = report.inkRatio; part.railErrors = report.railErrors }
      else part.message = report.message
    }
    parts.push(part)
  }
  return { parts }
}
