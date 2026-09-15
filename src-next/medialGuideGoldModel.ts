import rawGold from '../reference-data/font-guide-calibrations/noto-sans-kr.medial-g0.gold.v1.json' with { type: 'json' }
import type {
  MedialFaceElementCandidate,
  MedialFaceElementId,
  MedialFaceOrientation,
  MedialFaceReasonCode,
  MedialFaceReferenceMode,
  MedialFaceSide,
  MedialFaceSpan,
} from './medialGuideCandidateModel'

export const MEDIAL_G0_GOLD_TOLERANCE = 2

interface GoldCandidateFace {
  status: 'candidate'
  value: number
  referenceMode: MedialFaceReferenceMode
  referenceSide?: 'left' | 'right'
  anchor?: { x: number; y: number }
  maximumDeviation?: number
}

interface GoldAbstainedFace {
  status: 'abstained'
  reasonCode: MedialFaceReasonCode
  referenceMode: MedialFaceReferenceMode
}

interface GoldCandidateSpans {
  status: 'candidate'
  value: readonly MedialFaceSpan[]
}

interface GoldAbstainedSpans {
  status: 'abstained'
  reasonCode: MedialFaceReasonCode
}

export interface MedialGuideG0GoldElement {
  elementId: MedialFaceElementId
  orientation: MedialFaceOrientation
  faceSide: MedialFaceSide
  face: GoldCandidateFace | GoldAbstainedFace
  visibleSpans: GoldCandidateSpans | GoldAbstainedSpans
  componentSpans?: readonly MedialFaceSpan[]
  derived?: {
    extent: number
    visibleLength: number
  }
}

export interface MedialGuideG0GoldCase {
  character: string
  elements: readonly MedialGuideG0GoldElement[]
}

interface MedialGuideG0GoldFixture {
  schema: 'medial-guide-g0-analysis-gold-v1'
  version: 1
  status: 'approved-analysis-gold'
  approvedAt: string
  productionEligible: false
  font: {
    id: string
    fileSha256: string
    axes: Readonly<Record<string, number>>
  }
  coordinateFrame: {
    id: 'shared-baseline'
    unitsPerEm: 1000
    baselineY: 880
  }
  roleDefinitionVersion: 'medial-guide-role-v3'
  extractorVersionAtApproval: 'annotated-contour-finite-face-v2'
  scope: {
    characterCount: 14
    elementCount: 28
  }
  cases: readonly MedialGuideG0GoldCase[]
}

export interface MedialGuideGoldComparison {
  status: 'match' | 'mismatch'
  faceDelta: number | null
  spanDelta: number | null
  maximumCoordinateDelta: number | null
  issues: readonly string[]
}

export const MEDIAL_GUIDE_G0_GOLD = rawGold as unknown as MedialGuideG0GoldFixture

const GOLD_CASE_BY_CHARACTER = new Map(
  MEDIAL_GUIDE_G0_GOLD.cases.map((goldCase) => [goldCase.character, goldCase]),
)

export function medialGuideG0GoldCase(character: string): MedialGuideG0GoldCase | null {
  return GOLD_CASE_BY_CHARACTER.get(character) ?? null
}

function maximumSpanDelta(actual: readonly MedialFaceSpan[], gold: readonly MedialFaceSpan[]): number | null {
  if (actual.length !== gold.length) return null
  return actual.reduce((maximum, span, index) => {
    const goldSpan = gold[index]
    return Math.max(maximum, Math.abs(span.from - goldSpan.from), Math.abs(span.to - goldSpan.to))
  }, 0)
}

export function compareMedialElementToGold(
  actual: MedialFaceElementCandidate | undefined,
  gold: MedialGuideG0GoldElement,
  tolerance = MEDIAL_G0_GOLD_TOLERANCE,
): MedialGuideGoldComparison {
  if (!actual) return { status: 'mismatch', faceDelta: null, spanDelta: null, maximumCoordinateDelta: null, issues: ['요소 누락'] }

  const issues: string[] = []
  if (actual.elementId !== gold.elementId) issues.push('역할 오선택')
  if (actual.orientation !== gold.orientation || actual.faceSide !== gold.faceSide) issues.push('면 방향 불일치')
  if (actual.face.status !== gold.face.status) issues.push('면 상태 불일치')
  if (actual.visibleSpans.status !== gold.visibleSpans.status) issues.push('가시 구간 상태 불일치')

  let faceDelta: number | null = null
  let spanDelta: number | null = null
  if (actual.face.status === 'candidate' && gold.face.status === 'candidate') {
    faceDelta = Math.abs(actual.face.value - gold.face.value)
    if (faceDelta > tolerance) issues.push(`면 좌표 오차 ${faceDelta.toFixed(3)}`)
    if (actual.face.evidence.referenceMode !== gold.face.referenceMode) issues.push('기준 방식 불일치')
    if (gold.face.referenceMode === 'start-side-local-tangent' && actual.face.evidence.referenceSide !== gold.face.referenceSide) issues.push('시작 방향 불일치')
  } else if (actual.face.status === 'abstained' && gold.face.status === 'abstained') {
    if (actual.face.reasonCode !== gold.face.reasonCode) issues.push('자동 포기 사유 불일치')
    if (actual.face.evidence.referenceMode !== gold.face.referenceMode) issues.push('기준 방식 불일치')
  }

  if (actual.visibleSpans.status === 'candidate' && gold.visibleSpans.status === 'candidate') {
    spanDelta = maximumSpanDelta(actual.visibleSpans.value, gold.visibleSpans.value)
    if (spanDelta === null) issues.push('가시 구간 개수 불일치')
    else if (spanDelta > tolerance) issues.push(`가시 구간 오차 ${spanDelta.toFixed(3)}`)
  } else if (actual.visibleSpans.status === 'abstained' && gold.visibleSpans.status === 'abstained') {
    if (actual.visibleSpans.reasonCode !== gold.visibleSpans.reasonCode) issues.push('구간 포기 사유 불일치')
  }

  const coordinateDeltas = [faceDelta, spanDelta].filter((value): value is number => value !== null)
  return {
    status: issues.length === 0 ? 'match' : 'mismatch',
    faceDelta,
    spanDelta,
    maximumCoordinateDelta: coordinateDeltas.length > 0 ? Math.max(...coordinateDeltas) : null,
    issues,
  }
}
