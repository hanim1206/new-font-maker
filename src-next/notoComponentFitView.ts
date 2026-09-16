import { finalGlyphInkToSvgPath } from '../src/services/finalGlyphInk'
import { fitNotoComponent, inkOfComponentFit, reportComponentFit } from '../src/services/notoComponentFit'
import type { ComponentFaces, FaceError } from '../src/services/notoComponentFit'
import { selectNotoOutlineContours } from '../src/services/notoOutlineInk'
import type { NotoOutline } from '../src/services/notoOutlineInk'
import { useJamoStore } from '../src/stores/jamoStore'
import type { JamoData, Part } from '../src/types'
import type { ApprovedNotoInput } from './notoBoundMaster'
import type { EditableRail } from './notoMedialFitView'
import type { ContextBoxResolution } from '../src/services/contextBoxResolver'

/**
 * 검수 화면용 닿자(첫닿자·받침) 박스 fit. 앱의 현재 획을 변화량 모델이 예측한 네 변 박스에 놓는다.
 * 승인 측정이 있는 글자는 Noto 닿자 고스트와의 xor·네 변 오차도 낸다.
 * 네 변은 rail처럼 옮길 수 있다 — 옮기면 획이 축별로 다시 맞춰지고 두께는 그대로다.
 */

export interface ComponentFitPart {
  part: Extract<Part, 'CH' | 'JO'>
  jamoId: string
  jamo?: JamoData
  /** 모델이 예측한 네 변(em). 편집의 출발점. */
  faces?: ComponentFaces
  ghostOutline?: NotoOutline
  reference?: ComponentFaces
  message?: string
}

export interface RenderedComponentPart {
  path?: string
  /** 획을 놓은 네 변(em). 화면에서 닿자 박스로 칠한다. */
  faces?: ComponentFaces
  xorRatio?: number
  inkRatio?: number
  faceErrors: FaceError[]
  message?: string
}

const STAGE_OF: Record<'CH' | 'JO', 'initial' | 'final'> = { CH: 'initial', JO: 'final' }
const SIDES = ['left', 'right', 'top', 'bottom'] as const
const SIDE_LABEL: Record<keyof ComponentFaces, string> = { left: '왼변', right: '오른변', top: '윗변', bottom: '아랫변' }

function approvedFacesOf(input: ApprovedNotoInput | null, part: 'CH' | 'JO'): { faces: ComponentFaces; contourIds: number[] } | null {
  if (!input) return null
  const stages = input.stages as Record<string, { observation?: { componentGroup?: { value?: { contourIds?: number[] } } }; measurements?: { roleFaces?: Partial<ComponentFaces> } } | undefined>
  const stage = stages[STAGE_OF[part]]
  const faces = stage?.measurements?.roleFaces
  const contourIds = stage?.observation?.componentGroup?.value?.contourIds
  if (!faces || !contourIds || !SIDES.every((side) => typeof faces[side] === 'number')) return null
  return { faces: faces as ComponentFaces, contourIds }
}

/**
 * 칸 해석 함수가 낸 닿자 네 변(모델 예측)에 앱 획과 승인 측정(고스트·실측 네 변)을 붙인다.
 * 네 변 자체는 `resolveContextBoxes`가 렌더러와 같은 규칙으로 만든다.
 */
export function fitComponentsForGlyph(input: {
  context: ContextBoxResolution
  outline: NotoOutline
  approved: ApprovedNotoInput | null
}): ComponentFitPart[] {
  const store = useJamoStore.getState()
  const { identity } = input.context
  const jobs: { part: 'CH' | 'JO'; jamo: JamoData | undefined; jamoId: string }[] = [
    { part: 'CH', jamo: store.choseong[identity.initialJamo], jamoId: identity.initialJamo },
    ...(identity.finalJamo ? [{ part: 'JO' as const, jamo: store.jongseong[identity.finalJamo], jamoId: identity.finalJamo }] : []),
  ]
  return jobs.map((job) => {
    if (!job.jamo) return { part: job.part, jamoId: job.jamoId, message: `${job.jamoId}: 앱 획이 없습니다.` }
    const resolved = input.context.parts.find((part) => part.part === job.part)
    if (!resolved) return { part: job.part, jamoId: job.jamoId, jamo: job.jamo, message: input.context.issues.find((issue) => issue.part === job.part)?.message ?? '이 문맥의 박스 예측이 없습니다.' }
    const part: ComponentFitPart = { part: job.part, jamoId: job.jamoId, jamo: job.jamo, faces: { ...resolved.faces } }
    const reference = approvedFacesOf(input.approved, job.part)
    if (reference) {
      part.reference = reference.faces
      part.ghostOutline = selectNotoOutlineContours(input.outline, reference.contourIds)
    }
    return part
  })
}

/** 네 변(없으면 모델 값)으로 획을 놓고 잉크·비교 수치를 낸다. */
export function renderComponentPart(part: ComponentFitPart, faces?: ComponentFaces): RenderedComponentPart {
  if (!part.jamo || !part.faces) return { faceErrors: [], message: part.message }
  const fit = fitNotoComponent({ part: part.part, jamo: part.jamo, faces: faces ?? part.faces, glyphId: `review:${part.part}:${part.jamoId}` })
  if (!fit.ok) return { faceErrors: [], message: fit.message }
  const ink = inkOfComponentFit(fit.fit)
  if (!ink.ok) return { faceErrors: [], message: ink.message }
  const rendered: RenderedComponentPart = { path: finalGlyphInkToSvgPath({ regions: ink.regions }, 1), faces: { ...fit.fit.faces }, faceErrors: [] }
  if (part.ghostOutline && part.reference) {
    const report = reportComponentFit({ fit: fit.fit, ghostOutline: part.ghostOutline, referenceFaces: part.reference })
    rendered.faceErrors = report.faceErrors
    if (report.ok) { rendered.xorRatio = report.xorRatio; rendered.inkRatio = report.inkRatio } else rendered.message = report.message
  }
  return rendered
}

/** 닿자 네 변을 편집 가능한 rail로. id는 `c<part순번>:<변>`. */
export function editableComponentRailsOf(parts: readonly ComponentFitPart[], facesByPart: readonly (ComponentFaces | undefined)[]): EditableRail[] {
  const rails: EditableRail[] = []
  parts.forEach((part, partIndex) => {
    if (!part.faces) return
    const current = facesByPart[partIndex] ?? part.faces
    const partLabel = part.part === 'CH' ? '첫닿자' : '받침'
    for (const side of SIDES) {
      rails.push({ id: `c${partIndex}:${side}`, partIndex, role: side, kind: 'face', axis: side === 'left' || side === 'right' ? 'x' : 'y', label: `${partLabel} ${SIDE_LABEL[side]}`, value: current[side], original: part.faces[side] })
    }
  })
  return rails
}
