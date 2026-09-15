export type MedialFaceElementId = 'innerPillar' | 'outerPillar' | 'primaryBeam' | 'baseStem' | 'leftStem' | 'rightStem' | 'upperBeam' | 'lowerBeam'
export type MedialFaceOrientation = 'vertical' | 'horizontal'
export type MedialFaceSide = 'left' | 'right' | 'top' | 'bottom'
export type MedialFaceReasonCode = 'glyph-missing' | 'no-role-match' | 'ambiguous-role-match' | 'non-scalar-face' | 'occluded-by-neighbor-overlap'
export type MedialFaceReferenceMode = 'axis-aligned-face' | 'start-side-local-tangent'

export const MEDIAL_GUIDE_EXTRACTOR_VERSION = 'geometric-role-matcher-v9' as const
export const MEDIAL_GUIDE_ROLE_DEFINITION_VERSION = 'medial-guide-role-v4' as const

export interface MedialFaceSpan {
  from: number
  to: number
}

export interface MedialFaceEvidence {
  hypothesisId: string
  contourId: number
  segmentIds: readonly number[]
  method: 'geometric-role-matcher-v3' | 'geometric-role-matcher-v4' | 'geometric-role-matcher-v5' | 'geometric-role-matcher-v6' | 'geometric-role-matcher-v7' | 'geometric-role-matcher-v8' | 'geometric-role-matcher-v9'
  referenceMode: MedialFaceReferenceMode
  matchingUnit?: string
  roleStrategy?: string
  scanOrigin?: string
  scanDirection?: string
  referenceSide?: 'left' | 'right'
  anchor?: { x: number; y: number }
  maximumDeviation?: number
  minimumLocalSupport?: number
  startSlopeTolerance?: number
  flattenTolerance?: number
  outsideProbeOffset?: number
  roiCoverage?: number
  matchScore?: number
  matchMargin?: number
  attachedBeamElementId?: MedialFaceElementId
  attachedBeamContourId?: number
  attachedBeamWidth?: number
  beamInteriorInset?: number
  minimumBeamInteriorInset?: number
}

export type MedialFaceComponent<T> = {
  status: 'candidate'
  value: T
  evidence: MedialFaceEvidence
} | {
  status: 'abstained'
  reasonCode: MedialFaceReasonCode
  evidence: MedialFaceEvidence
}

export interface MedialFaceElementCandidate {
  elementId: MedialFaceElementId
  orientation: MedialFaceOrientation
  faceSide: MedialFaceSide
  legacyFaceRole: string
  legacyTipRole: string | null
  face: MedialFaceComponent<number>
  visibleSpans: MedialFaceComponent<readonly MedialFaceSpan[]>
  componentSpans?: readonly MedialFaceSpan[]
  derived?: {
    extent: number | null
    visibleLength: number
  }
  match: {
    status: 'matched' | 'abstained'
    score: number | null
    confidence: 'high' | 'medium' | 'abstained'
    margin: number | null
    alternatives: readonly { contourId: number; score: number }[]
  }
}

export interface MedialGuideCandidateCaseResult {
  character: string
  initialJamo: string
  medialJamo: string
  finalJamo: string | null
  status: 'candidate'
  glyphName: string
  pathSha256: string
  elements: readonly MedialFaceElementCandidate[]
}

export interface MedialGuideAbstainedCase {
  character: string
  initialJamo: string
  medialJamo: string
  finalJamo: string | null
  status: 'abstained'
  reasonCode: 'glyph-missing'
}

export type MedialGuideCandidateCase = MedialGuideCandidateCaseResult | MedialGuideAbstainedCase

export interface MedialGuideCandidateResponse {
  schema: 'reference-medial-guide-candidate-response-v1'
  apiVersion: 'reference.v1'
  extractorVersion: 'geometric-role-matcher-v9'
  roleDefinitionVersion: 'medial-guide-role-v4'
  coordinateFrame: 'shared-baseline'
  matching: 'geometry-role-search'
  font: {
    id: string
    fileSha256: string
    axes: Readonly<Record<string, number>>
  }
  cases: readonly MedialGuideCandidateCase[]
}

function record(value: unknown, location: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${location}: 객체가 필요합니다.`)
  return value as Record<string, unknown>
}

function stringValue(value: unknown, location: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${location}: 문자열이 필요합니다.`)
  return value
}

function numberValue(value: unknown, location: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${location}: 유한한 숫자가 필요합니다.`)
  return value
}

function literal<T extends string>(value: unknown, expected: T, location: string): T {
  if (value !== expected) throw new Error(`${location}: ${expected}가 필요합니다.`)
  return expected
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], location: string): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) throw new Error(`${location}: 지원하지 않는 값입니다.`)
  return value as T
}

function parseEvidence(value: unknown, location: string): MedialFaceEvidence {
  const source = record(value, location)
  if (!Array.isArray(source.segmentIds)) throw new Error(`${location}.segmentIds: 배열이 필요합니다.`)
  const referenceMode = enumValue(source.referenceMode, ['axis-aligned-face', 'start-side-local-tangent'] as const, `${location}.referenceMode`)
  const shared = {
    hypothesisId: stringValue(source.hypothesisId, `${location}.hypothesisId`),
    contourId: numberValue(source.contourId, `${location}.contourId`),
    segmentIds: source.segmentIds.map((item, index) => numberValue(item, `${location}.segmentIds[${index}]`)),
    method: enumValue(source.method, ['geometric-role-matcher-v3', 'geometric-role-matcher-v4', 'geometric-role-matcher-v5', 'geometric-role-matcher-v6', 'geometric-role-matcher-v7', 'geometric-role-matcher-v8', 'geometric-role-matcher-v9'] as const, `${location}.method`),
    referenceMode,
    ...(source.matchingUnit === undefined ? {} : { matchingUnit: stringValue(source.matchingUnit, `${location}.matchingUnit`) }),
    ...(source.roleStrategy === undefined ? {} : { roleStrategy: stringValue(source.roleStrategy, `${location}.roleStrategy`) }),
    ...(source.scanOrigin === undefined ? {} : { scanOrigin: stringValue(source.scanOrigin, `${location}.scanOrigin`) }),
    ...(source.scanDirection === undefined ? {} : { scanDirection: stringValue(source.scanDirection, `${location}.scanDirection`) }),
    ...(source.minimumLocalSupport === undefined ? {} : { minimumLocalSupport: numberValue(source.minimumLocalSupport, `${location}.minimumLocalSupport`) }),
    ...(source.startSlopeTolerance === undefined ? {} : { startSlopeTolerance: numberValue(source.startSlopeTolerance, `${location}.startSlopeTolerance`) }),
    ...(source.flattenTolerance === undefined ? {} : { flattenTolerance: numberValue(source.flattenTolerance, `${location}.flattenTolerance`) }),
    ...(source.outsideProbeOffset === undefined ? {} : { outsideProbeOffset: numberValue(source.outsideProbeOffset, `${location}.outsideProbeOffset`) }),
    ...(source.roiCoverage === undefined ? {} : { roiCoverage: numberValue(source.roiCoverage, `${location}.roiCoverage`) }),
    ...(source.matchScore === undefined ? {} : { matchScore: numberValue(source.matchScore, `${location}.matchScore`) }),
    ...(source.matchMargin === undefined ? {} : { matchMargin: numberValue(source.matchMargin, `${location}.matchMargin`) }),
    ...(source.attachedBeamElementId === undefined ? {} : { attachedBeamElementId: enumValue(source.attachedBeamElementId, ['innerPillar', 'outerPillar', 'primaryBeam', 'baseStem', 'leftStem', 'rightStem', 'upperBeam', 'lowerBeam'] as const, `${location}.attachedBeamElementId`) }),
    ...(source.attachedBeamContourId === undefined ? {} : { attachedBeamContourId: numberValue(source.attachedBeamContourId, `${location}.attachedBeamContourId`) }),
    ...(source.attachedBeamWidth === undefined ? {} : { attachedBeamWidth: numberValue(source.attachedBeamWidth, `${location}.attachedBeamWidth`) }),
    ...(source.beamInteriorInset === undefined ? {} : { beamInteriorInset: numberValue(source.beamInteriorInset, `${location}.beamInteriorInset`) }),
    ...(source.minimumBeamInteriorInset === undefined ? {} : { minimumBeamInteriorInset: numberValue(source.minimumBeamInteriorInset, `${location}.minimumBeamInteriorInset`) }),
  }
  if (referenceMode === 'axis-aligned-face') return shared
  const anchor = record(source.anchor, `${location}.anchor`)
  return {
    ...shared,
    referenceSide: enumValue(source.referenceSide, ['left', 'right'] as const, `${location}.referenceSide`),
    anchor: {
      x: numberValue(anchor.x, `${location}.anchor.x`),
      y: numberValue(anchor.y, `${location}.anchor.y`),
    },
    maximumDeviation: numberValue(source.maximumDeviation, `${location}.maximumDeviation`),
  }
}

function parseSpan(value: unknown, location: string): MedialFaceSpan {
  const source = record(value, location)
  const from = numberValue(source.from, `${location}.from`)
  const to = numberValue(source.to, `${location}.to`)
  if (from >= to) throw new Error(`${location}: from은 to보다 작아야 합니다.`)
  return { from, to }
}

function parseComponent<T>(
  value: unknown,
  location: string,
  parseCandidate: (candidate: unknown, candidateLocation: string) => T,
): MedialFaceComponent<T> {
  const source = record(value, location)
  const evidence = parseEvidence(source.evidence, `${location}.evidence`)
  if (source.status === 'candidate') {
    return { status: 'candidate', value: parseCandidate(source.value, `${location}.value`), evidence }
  }
  literal(source.status, 'abstained', `${location}.status`)
  return {
    status: 'abstained',
    reasonCode: enumValue(source.reasonCode, ['glyph-missing', 'no-role-match', 'ambiguous-role-match', 'non-scalar-face', 'occluded-by-neighbor-overlap'] as const, `${location}.reasonCode`),
    evidence,
  }
}

function parseElement(value: unknown, location: string): MedialFaceElementCandidate {
  const source = record(value, location)
  const elementId = enumValue(source.elementId, ['innerPillar', 'outerPillar', 'primaryBeam', 'baseStem', 'leftStem', 'rightStem', 'upperBeam', 'lowerBeam'] as const, `${location}.elementId`)
  const orientation = enumValue(source.orientation, ['vertical', 'horizontal'] as const, `${location}.orientation`)
  const faceSide = enumValue(source.faceSide, ['left', 'right', 'top', 'bottom'] as const, `${location}.faceSide`)
  if ((orientation === 'vertical') !== (faceSide === 'left' || faceSide === 'right')) {
    throw new Error(`${location}: orientation과 faceSide 축이 다릅니다.`)
  }
  const componentSpans = source.componentSpans === undefined
    ? undefined
    : Array.isArray(source.componentSpans)
      ? source.componentSpans.map((span, index) => parseSpan(span, `${location}.componentSpans[${index}]`))
      : (() => { throw new Error(`${location}.componentSpans: 배열이 필요합니다.`) })()
  const derivedSource = source.derived === undefined ? undefined : record(source.derived, `${location}.derived`)
  const derived = derivedSource === undefined ? undefined : {
    extent: derivedSource.extent === null ? null : numberValue(derivedSource.extent, `${location}.derived.extent`),
    visibleLength: numberValue(derivedSource.visibleLength, `${location}.derived.visibleLength`),
  }
  const matchSource = record(source.match, `${location}.match`)
  if (!Array.isArray(matchSource.alternatives)) throw new Error(`${location}.match.alternatives: 배열이 필요합니다.`)
  const matchStatus = enumValue(matchSource.status, ['matched', 'abstained'] as const, `${location}.match.status`)
  const matchScore = matchSource.score === null ? null : numberValue(matchSource.score, `${location}.match.score`)
  const matchMargin = matchSource.margin === null ? null : numberValue(matchSource.margin, `${location}.match.margin`)
  const matchConfidence = enumValue(matchSource.confidence, ['high', 'medium', 'abstained'] as const, `${location}.match.confidence`)
  if (matchStatus === 'matched' && (matchScore === null || matchMargin === null || matchConfidence === 'abstained')) throw new Error(`${location}.match: matched 점수·여백·신뢰도가 필요합니다.`)
  if (matchStatus === 'abstained' && matchConfidence !== 'abstained') throw new Error(`${location}.match: abstained 신뢰도가 필요합니다.`)
  const alternatives = matchSource.alternatives.map((alternative, index) => {
    const item = record(alternative, `${location}.match.alternatives[${index}]`)
    return {
      contourId: numberValue(item.contourId, `${location}.match.alternatives[${index}].contourId`),
      score: numberValue(item.score, `${location}.match.alternatives[${index}].score`),
    }
  })
  return {
    elementId,
    orientation,
    faceSide,
    legacyFaceRole: stringValue(source.legacyFaceRole, `${location}.legacyFaceRole`),
    legacyTipRole: source.legacyTipRole === null ? null : stringValue(source.legacyTipRole, `${location}.legacyTipRole`),
    face: parseComponent(source.face, `${location}.face`, numberValue),
    visibleSpans: parseComponent(source.visibleSpans, `${location}.visibleSpans`, (candidate, candidateLocation) => {
      if (!Array.isArray(candidate) || candidate.length === 0) throw new Error(`${candidateLocation}: 비어 있지 않은 배열이 필요합니다.`)
      return candidate.map((span, index) => parseSpan(span, `${candidateLocation}[${index}]`))
    }),
    ...(componentSpans ? { componentSpans } : {}),
    ...(derived ? { derived } : {}),
    match: {
      status: matchStatus,
      score: matchScore,
      confidence: matchConfidence,
      margin: matchMargin,
      alternatives,
    },
  }
}

export function parseMedialGuideCandidateCase(value: unknown, location = 'medial candidate case'): MedialGuideCandidateCase {
  const source = record(value, location)
  const shared = {
    character: stringValue(source.character, `${location}.character`),
    initialJamo: stringValue(source.initialJamo, `${location}.initialJamo`),
    medialJamo: stringValue(source.medialJamo, `${location}.medialJamo`),
    finalJamo: source.finalJamo === null ? null : stringValue(source.finalJamo, `${location}.finalJamo`),
  }
  if (source.status === 'abstained') {
    return {
      ...shared,
      status: 'abstained',
      reasonCode: literal(source.reasonCode, 'glyph-missing', `${location}.reasonCode`),
    }
  }
  literal(source.status, 'candidate', `${location}.status`)
  if (!Array.isArray(source.elements) || source.elements.length === 0) throw new Error(`${location}.elements: 비어 있지 않은 배열이 필요합니다.`)
  const elements = source.elements.map((element, index) => parseElement(element, `${location}.elements[${index}]`))
  if (new Set(elements.map(({ elementId }) => elementId)).size !== elements.length) throw new Error(`${location}.elements: elementId가 중복됐습니다.`)
  return {
    ...shared,
    status: 'candidate',
    glyphName: stringValue(source.glyphName, `${location}.glyphName`),
    pathSha256: stringValue(source.pathSha256, `${location}.pathSha256`),
    elements,
  }
}

export function parseMedialGuideCandidateResponse(value: unknown): MedialGuideCandidateResponse {
  const source = record(value, 'medial candidate response')
  const font = record(source.font, 'medial candidate response.font')
  const axesSource = record(font.axes, 'medial candidate response.font.axes')
  if (!Array.isArray(source.cases) || source.cases.length === 0) throw new Error('medial candidate response.cases: 비어 있지 않은 배열이 필요합니다.')
  const cases = source.cases.map((item, index) => parseMedialGuideCandidateCase(item, `medial candidate response.cases[${index}]`))
  if (new Set(cases.map(({ character }) => character)).size !== cases.length) throw new Error('medial candidate response.cases: character가 중복됐습니다.')
  const fileSha256 = stringValue(font.fileSha256, 'medial candidate response.font.fileSha256')
  if (!/^[0-9a-f]{64}$/u.test(fileSha256)) throw new Error('medial candidate response.font.fileSha256: SHA-256이 필요합니다.')
  return {
    schema: literal(source.schema, 'reference-medial-guide-candidate-response-v1', 'medial candidate response.schema'),
    apiVersion: literal(source.apiVersion, 'reference.v1', 'medial candidate response.apiVersion'),
    extractorVersion: literal(source.extractorVersion, MEDIAL_GUIDE_EXTRACTOR_VERSION, 'medial candidate response.extractorVersion'),
    roleDefinitionVersion: literal(source.roleDefinitionVersion, MEDIAL_GUIDE_ROLE_DEFINITION_VERSION, 'medial candidate response.roleDefinitionVersion'),
    coordinateFrame: literal(source.coordinateFrame, 'shared-baseline', 'medial candidate response.coordinateFrame'),
    matching: literal(source.matching, 'geometry-role-search', 'medial candidate response.matching'),
    font: {
      id: stringValue(font.id, 'medial candidate response.font.id'),
      fileSha256,
      axes: Object.fromEntries(Object.entries(axesSource).map(([tag, axisValue]) => [tag, numberValue(axisValue, `medial candidate response.font.axes.${tag}`)])),
    },
    cases,
  }
}
