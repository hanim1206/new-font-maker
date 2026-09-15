import { finalGlyphInkToSvgPath } from '../src/services/finalGlyphInk'
import { fitNotoComponent, inkOfComponentFit, reportComponentFit } from '../src/services/notoComponentFit'
import type { ComponentFaces, FaceError } from '../src/services/notoComponentFit'
import { selectNotoOutlineContours } from '../src/services/notoOutlineInk'
import type { NotoOutline } from '../src/services/notoOutlineInk'
import { predictNotoTarget } from '../src/services/notoVariationModel'
import { useJamoStore } from '../src/stores/jamoStore'
import type { JamoData, Part } from '../src/types'
import type { ApprovedNotoInput } from './notoBoundMaster'
import type { CorpusIdentity } from './notoCorpus'
import type { NotoPresetModelBundle } from './notoPreset'

/**
 * 검수 화면용 닿자(첫닿자·받침) 박스 fit. 앱의 현재 획을 변화량 모델이 예측한 네 변 박스에 놓는다.
 * 승인 측정이 있는 글자는 Noto 닿자 고스트와의 xor·네 변 오차도 낸다.
 */

export interface ComponentFitPart {
  part: Extract<Part, 'CH' | 'JO'>
  jamoId: string
  path?: string
  xorRatio?: number
  inkRatio?: number
  faceErrors: FaceError[]
  message?: string
}

const STAGE_OF: Record<'CH' | 'JO', 'initial' | 'final'> = { CH: 'initial', JO: 'final' }

function approvedFacesOf(input: ApprovedNotoInput | null, part: 'CH' | 'JO'): { faces: ComponentFaces; contourIds: number[] } | null {
  if (!input) return null
  const stages = input.stages as Record<string, { observation?: { componentGroup?: { value?: { contourIds?: number[] } } }; measurements?: { roleFaces?: Partial<ComponentFaces> } } | undefined>
  const stage = stages[STAGE_OF[part]]
  const faces = stage?.measurements?.roleFaces
  const contourIds = stage?.observation?.componentGroup?.value?.contourIds
  if (!faces || !contourIds || ![faces.left, faces.right, faces.top, faces.bottom].every((v) => typeof v === 'number')) return null
  return { faces: faces as ComponentFaces, contourIds }
}

export function fitComponentsForGlyph(input: {
  identity: CorpusIdentity
  bundle: NotoPresetModelBundle
  outline: NotoOutline
  approved: ApprovedNotoInput | null
}): ComponentFitPart[] {
  const store = useJamoStore.getState()
  const parts: ComponentFitPart[] = []
  const jobs: { part: 'CH' | 'JO'; jamo: JamoData | undefined; jamoId: string }[] = [
    { part: 'CH', jamo: store.choseong[input.identity.initialJamo], jamoId: input.identity.initialJamo },
    ...(input.identity.finalJamo ? [{ part: 'JO' as const, jamo: store.jongseong[input.identity.finalJamo], jamoId: input.identity.finalJamo }] : []),
  ]
  for (const job of jobs) {
    if (!job.jamo) { parts.push({ part: job.part, jamoId: job.jamoId, faceErrors: [], message: `${job.jamoId}: 앱 획이 없습니다.` }); continue }
    const predictedSide = (side: keyof ComponentFaces) => (predictNotoTarget(input.bundle.model, `${STAGE_OF[job.part]}.roleFaces.${side}`, input.identity)?.predicted ?? NaN) / 1000
    const faces: ComponentFaces = { left: predictedSide('left'), right: predictedSide('right'), top: predictedSide('top'), bottom: predictedSide('bottom') }
    const fit = fitNotoComponent({ part: job.part, jamo: job.jamo, faces, glyphId: `review:${input.identity.codepoint}` })
    if (!fit.ok) { parts.push({ part: job.part, jamoId: job.jamoId, faceErrors: [], message: fit.message }); continue }
    const ink = inkOfComponentFit(fit.fit)
    if (!ink.ok) { parts.push({ part: job.part, jamoId: job.jamoId, faceErrors: [], message: ink.message }); continue }
    const out: ComponentFitPart = { part: job.part, jamoId: job.jamoId, path: finalGlyphInkToSvgPath({ regions: ink.regions }, 1), faceErrors: [] }
    const reference = approvedFacesOf(input.approved, job.part)
    if (reference) {
      const report = reportComponentFit({ fit: fit.fit, ghostOutline: selectNotoOutlineContours(input.outline, reference.contourIds), referenceFaces: reference.faces })
      out.faceErrors = report.faceErrors
      if (report.ok) { out.xorRatio = report.xorRatio; out.inkRatio = report.inkRatio } else out.message = report.message
    }
    parts.push(out)
  }
  return parts
}
