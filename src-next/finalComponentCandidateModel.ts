import contractSource from '../reference-data/font-guide-calibrations/final-component-p0-contract.v1.json'
import { CHOSEONG_LIST, JUNGSEONG_LIST, JONGSEONG_LIST } from '../src/data/Hangul'

export type FinalComponentSide = 'top' | 'bottom' | 'left' | 'right'
export type FinalComponentOrientation = 'vertical' | 'horizontal'
export type FinalComponentContextId = 'right-final' | 'bottom-final' | 'mixed-final'
export type FinalComponentStructureKind = 'single' | 'doubled' | 'compound'
export type FinalComponentMemberRole = 'only' | 'left' | 'right'
export type FinalComponentContactRelation = 'disjoint' | 'touching' | 'overlapping' | 'merged-boundary'
export type FinalComponentReasonCode = 'glyph-missing' | 'medial-anchor-unavailable' | 'ambiguous-final-group' | 'foreign-role-contamination' | 'member-count-mismatch' | 'ambiguous-member-order' | 'merged-boundary-unresolved' | 'invalid-component-bounds' | 'provenance-missing' | 'no-axis-face' | 'role-face-unavailable'
export type FinalJamo = Exclude<(typeof JONGSEONG_LIST)[number], ''>

export const FINAL_COMPONENT_RESPONSE_SCHEMA = 'reference-final-component-candidate-response-v1' as const
export const FINAL_COMPONENT_VERIFICATION_SCHEMA = 'reference-final-component-verification-v1' as const
export const FINAL_COMPONENT_EXTRACTOR_VERSION = 'final-component-matcher-v2' as const
export const FINAL_COMPONENT_ROLE_DEFINITION_VERSION = 'final-component-role-v1' as const
export const FINAL_COMPONENT_MEDIAL_ANCHOR_VERSION = 'geometric-role-matcher-v9' as const

interface FinalComponentContext {
  id: FinalComponentContextId
  medialJamo: 'ㅏ' | 'ㅗ' | 'ㅘ'
  scanOrigin: 'medial-outer-pillar' | 'medial-primary-beam' | 'medial-base-beam-and-outer-pillar'
  scanDirection: 'anchor-to-lower-region'
}

export interface FinalComponentMemberSpec {
  finalJamo: FinalJamo
  structureKind: FinalComponentStructureKind
  members: readonly {
    id: FinalComponentMemberRole
    jamo: string
    role: FinalComponentMemberRole
  }[]
}

interface FinalComponentContract {
  schema: 'final-component-p0-contract-v1'
  version: 1
  responseSchema: typeof FINAL_COMPONENT_RESPONSE_SCHEMA
  verificationSchema: typeof FINAL_COMPONENT_VERIFICATION_SCHEMA
  extractorVersion: typeof FINAL_COMPONENT_EXTRACTOR_VERSION
  roleDefinitionVersion: typeof FINAL_COMPONENT_ROLE_DEFINITION_VERSION
  medialAnchorExtractorVersion: typeof FINAL_COMPONENT_MEDIAL_ANCHOR_VERSION
  coordinateFrame: 'shared-baseline'
  groupingMethod: 'medial-contact-closed-final-component-grouping-v2'
  memberPartitionMethod: 'unicode-member-boundary-partition-v1'
  boundMethod: 'bezier-ink-extremum-v1'
  axisFaceMethod: 'selected-final-axis-face-v1'
  memberRelationMethod: 'actual-final-member-relation-v1'
  roleFaceMethod: 'final-group-outer-role-face-v1'
  roleFaceSelectionRule: 'final-group-ink-extremum'
  selectionAreaMethod: 'derived-four-final-role-faces-v1'
  candidateLifecycle: 'candidate'
  verificationStates: readonly ('verified' | 'rejected')[]
  memberRoles: readonly FinalComponentMemberRole[]
  contactRelations: readonly FinalComponentContactRelation[]
  boundSides: readonly FinalComponentSide[]
  initialJamos: readonly (typeof CHOSEONG_LIST)[number][]
  finalJamos: readonly FinalJamo[]
  structureKinds: readonly {
    id: FinalComponentStructureKind
    label: string
    expectedMemberCount: 1 | 2
    finalJamos: readonly FinalJamo[]
  }[]
  memberSpecs: readonly FinalComponentMemberSpec[]
  contexts: readonly FinalComponentContext[]
  selectionRules: readonly ('context-directed-contour-islands' | 'context-directed-merged-boundary')[]
  reasonCodes: readonly FinalComponentReasonCode[]
  forbiddenCandidateKeys: readonly string[]
  invalidationScope: readonly ['role', 'structureKind', 'contextId', 'extractorVersion']
}

export const FINAL_COMPONENT_P0_CONTRACT = contractSource as unknown as FinalComponentContract

export interface FinalComponentCommonEvidence {
  source: 'actual-glyph-outline'
  medialAnchorExtractorVersion: typeof FINAL_COMPONENT_MEDIAL_ANCHOR_VERSION
}

export type FinalComponentObservation<T, Evidence extends FinalComponentCommonEvidence> = {
  status: 'candidate'
  value: T
  evidence: Evidence
} | {
  status: 'abstained'
  reasonCode: FinalComponentReasonCode
  evidence: FinalComponentCommonEvidence
}

export interface FinalComponentSpan {
  from: number
  to: number
}

export interface FinalBoundaryFragment {
  contourId: number
  segmentIds: readonly number[]
  ranges: readonly {
    segmentId: number
    from: number
    to: number
  }[]
}

export interface FinalBoundaryRef {
  memberId: FinalComponentMemberRole
  contourId: number
  segmentId: number
  from: number
  to: number
}

export interface FinalComponentBoundEvidence extends FinalComponentCommonEvidence {
  method: 'bezier-ink-extremum-v1'
  side: FinalComponentSide
  boundaryRefs: readonly FinalBoundaryRef[]
}

export interface FinalComponentAxisFace {
  orientation: FinalComponentOrientation
  side: FinalComponentSide
  value: number
  visibleSpans: readonly FinalComponentSpan[]
  boundaryRefs: readonly FinalBoundaryRef[]
}

export interface FinalComponentAxisFaceEvidence extends FinalComponentCommonEvidence {
  method: 'selected-final-axis-face-v1'
  side: FinalComponentSide
}

export interface FinalComponentMemberObservation {
  id: FinalComponentMemberRole
  jamo: string
  role: FinalComponentMemberRole
  partitionEvidence: FinalComponentCommonEvidence & {
    method: 'unicode-member-boundary-partition-v1'
    memberId: FinalComponentMemberRole
    logicalOrder: number
  }
  boundaryFragments: readonly FinalBoundaryFragment[]
  inkBounds: Record<FinalComponentSide, FinalComponentObservation<number, FinalComponentBoundEvidence>>
  axisFaces: Record<FinalComponentSide, FinalComponentObservation<readonly FinalComponentAxisFace[], FinalComponentAxisFaceEvidence>>
}

export interface FinalComponentGroupValue {
  contourIds: readonly number[]
  holeContourIds: readonly number[]
  memberIds: readonly FinalComponentMemberRole[]
  selectedPathSha256: string
}

export interface FinalComponentGroupEvidence extends FinalComponentCommonEvidence {
  method: 'medial-contact-closed-final-component-grouping-v2'
  scanOrigin: FinalComponentContext['scanOrigin']
  scanDirection: FinalComponentContext['scanDirection']
  selectionRule: 'context-directed-contour-islands' | 'context-directed-merged-boundary'
  score: number
  margin: number
}

export interface FinalMemberBoundaryPair {
  left: FinalBoundaryRef
  right: FinalBoundaryRef
  distance: number
  intersects: boolean
}

export interface FinalMemberRelation {
  method: 'actual-final-member-relation-v1'
  direction: 'left-to-right'
  relation: FinalComponentContactRelation
  leftMemberId: 'left'
  rightMemberId: 'right'
  leftAnchorX: number
  rightAnchorX: number
  boundaryPairs: readonly FinalMemberBoundaryPair[]
}

export interface FinalComponentRoleFaceEvidence extends FinalComponentCommonEvidence {
  method: 'final-group-outer-role-face-v1'
  side: FinalComponentSide
  selectionRule: 'final-group-ink-extremum'
  supportKind: 'axis-face' | 'bezier-extremum'
  boundaryRefs: readonly FinalBoundaryRef[]
}

export interface FinalComponentSelectionArea {
  x: number
  y: number
  width: number
  height: number
}

export interface FinalComponentSelectionAreaEvidence extends FinalComponentCommonEvidence {
  method: 'derived-four-final-role-faces-v1'
  derivedFrom: readonly ['top', 'bottom', 'left', 'right']
}

export interface FinalComponentIdentity {
  fontSha256: string
  axes: Readonly<Record<string, number>>
  character: string
  codepoint: number
  glyphName: string | null
  pathSha256: string | null
  initialJamo: (typeof CHOSEONG_LIST)[number]
  medialJamo: 'ㅏ' | 'ㅗ' | 'ㅘ'
  finalJamo: FinalJamo
  contextId: FinalComponentContextId
  schemaVersion: 'final-component-p0-contract-v1'
  extractorVersion: typeof FINAL_COMPONENT_EXTRACTOR_VERSION
  roleDefinitionVersion: typeof FINAL_COMPONENT_ROLE_DEFINITION_VERSION
}

export interface FinalComponentCandidateCase {
  identity: FinalComponentIdentity
  state: 'candidate'
  structureKind: FinalComponentStructureKind
  members: readonly FinalComponentMemberObservation[]
  componentGroup: FinalComponentObservation<FinalComponentGroupValue, FinalComponentGroupEvidence>
  memberRelation: FinalMemberRelation | null
  inkBounds: Record<FinalComponentSide, FinalComponentObservation<number, FinalComponentBoundEvidence>>
  axisFaces: Record<FinalComponentSide, FinalComponentObservation<readonly FinalComponentAxisFace[], FinalComponentAxisFaceEvidence>>
  roleFaces: Record<FinalComponentSide, FinalComponentObservation<number, FinalComponentRoleFaceEvidence>>
  selectionArea: FinalComponentObservation<FinalComponentSelectionArea, FinalComponentSelectionAreaEvidence>
}

export interface FinalComponentAbstainedCase {
  identity: FinalComponentIdentity
  state: 'abstained'
  reasonCode: FinalComponentReasonCode
}

export type FinalComponentCase = FinalComponentCandidateCase | FinalComponentAbstainedCase

export interface FinalComponentCandidateResponse {
  schema: typeof FINAL_COMPONENT_RESPONSE_SCHEMA
  apiVersion: 'reference.v1'
  lifecycle: 'candidate'
  extractorVersion: typeof FINAL_COMPONENT_EXTRACTOR_VERSION
  roleDefinitionVersion: typeof FINAL_COMPONENT_ROLE_DEFINITION_VERSION
  medialAnchorExtractorVersion: typeof FINAL_COMPONENT_MEDIAL_ANCHOR_VERSION
  coordinateFrame: 'shared-baseline'
  font: {
    id: string
    fileSha256: string
    axes: Readonly<Record<string, number>>
  }
  cases: readonly FinalComponentCase[]
}

export interface FinalComponentVerification {
  schema: typeof FINAL_COMPONENT_VERIFICATION_SCHEMA
  state: 'verified' | 'rejected'
  candidateArtifactSha256: string
  candidateIdentitySha256: string
  review: {
    method: 'user-visual-review'
    reviewedAt: string
    reviewedBy: string
    note: string
  }
}

function record(value: unknown, location: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${location}: 객체가 필요합니다.`)
  return value as Record<string, unknown>
}

function array(value: unknown, location: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${location}: 배열이 필요합니다.`)
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

function text(value: unknown, location: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${location}: 문자열이 필요합니다.`)
  return value
}

function finite(value: unknown, location: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${location}: 유한한 숫자가 필요합니다.`)
  return value
}

function integer(value: unknown, location: string): number {
  const parsed = finite(value, location)
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`${location}: 0 이상의 정수가 필요합니다.`)
  return parsed
}

function sha256(value: unknown, location: string): string {
  const parsed = text(value, location)
  if (!/^[0-9a-f]{64}$/u.test(parsed)) throw new Error(`${location}: SHA-256이 필요합니다.`)
  return parsed
}

function boolean(value: unknown, location: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${location}: boolean이 필요합니다.`)
  return value
}

function numberRecord(value: unknown, location: string): Record<string, number> {
  const source = record(value, location)
  return Object.fromEntries(Object.entries(source).map(([key, item]) => [key, finite(item, `${location}.${key}`)]))
}

function sameNumberRecord(left: Readonly<Record<string, number>>, right: Readonly<Record<string, number>>): boolean {
  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort()
  return keys.every((key) => left[key] === right[key])
}

function sameRoundedGeometry(left: number, right: number): boolean {
  return Math.abs(left - right) <= 0.002
}

function parseIdArray(value: unknown, location: string, allowEmpty = false): number[] {
  const values = array(value, location).map((item, index) => integer(item, `${location}[${index}]`))
  if (!allowEmpty && values.length === 0) throw new Error(`${location}: 비어 있지 않아야 합니다.`)
  if (new Set(values).size !== values.length) throw new Error(`${location}: 중복 ID가 있습니다.`)
  return values
}

function commonEvidence(value: unknown, location: string): FinalComponentCommonEvidence {
  const source = record(value, location)
  return {
    source: literal(source.source, 'actual-glyph-outline', `${location}.source`),
    medialAnchorExtractorVersion: literal(source.medialAnchorExtractorVersion, FINAL_COMPONENT_MEDIAL_ANCHOR_VERSION, `${location}.medialAnchorExtractorVersion`),
  }
}

function abstained<T>(source: Record<string, unknown>, location: string): FinalComponentObservation<T, never> {
  return {
    status: literal(source.status, 'abstained', `${location}.status`),
    reasonCode: enumValue(source.reasonCode, FINAL_COMPONENT_P0_CONTRACT.reasonCodes, `${location}.reasonCode`),
    evidence: commonEvidence(source.evidence, `${location}.evidence`),
  }
}

function parseSpan(value: unknown, location: string): FinalComponentSpan {
  const source = record(value, location)
  const from = finite(source.from, `${location}.from`)
  const to = finite(source.to, `${location}.to`)
  if (from >= to) throw new Error(`${location}: from은 to보다 작아야 합니다.`)
  return { from, to }
}

function parseBoundaryFragment(value: unknown, location: string): FinalBoundaryFragment {
  const source = record(value, location)
  const segmentIds = parseIdArray(source.segmentIds, `${location}.segmentIds`)
  const ranges = array(source.ranges, `${location}.ranges`).map((range, index) => {
    const item = record(range, `${location}.ranges[${index}]`)
    const segmentId = integer(item.segmentId, `${location}.ranges[${index}].segmentId`)
    const from = finite(item.from, `${location}.ranges[${index}].from`)
    const to = finite(item.to, `${location}.ranges[${index}].to`)
    if (!segmentIds.includes(segmentId) || from < 0 || to > 1 || from > to) throw new Error(`${location}.ranges[${index}]: segment와 0–1 구간이 맞아야 합니다.`)
    return { segmentId, from, to }
  })
  if (ranges.length === 0) throw new Error(`${location}.ranges: 비어 있지 않아야 합니다.`)
  return { contourId: integer(source.contourId, `${location}.contourId`), segmentIds, ranges }
}

function memberOwnsRef(member: FinalComponentMemberObservation, ref: FinalBoundaryRef): boolean {
  return member.boundaryFragments.some((fragment) => fragment.contourId === ref.contourId && fragment.segmentIds.includes(ref.segmentId))
}

function parseBoundaryRef(value: unknown, memberIds: readonly FinalComponentMemberRole[], location: string): FinalBoundaryRef {
  const source = record(value, location)
  const from = finite(source.from, `${location}.from`)
  const to = finite(source.to, `${location}.to`)
  if (from < 0 || to > 1 || from > to) throw new Error(`${location}: 0–1 구간이 필요합니다.`)
  return {
    memberId: enumValue(source.memberId, memberIds, `${location}.memberId`),
    contourId: integer(source.contourId, `${location}.contourId`),
    segmentId: integer(source.segmentId, `${location}.segmentId`),
    from,
    to,
  }
}

function parseBoundaryRefs(value: unknown, memberIds: readonly FinalComponentMemberRole[], location: string): FinalBoundaryRef[] {
  const refs = array(value, location).map((item, index) => parseBoundaryRef(item, memberIds, `${location}[${index}]`))
  if (refs.length === 0) throw new Error(`${location}: 실제 contour·segment 근거가 필요합니다.`)
  return refs
}

function parseBound(value: unknown, side: FinalComponentSide, memberIds: readonly FinalComponentMemberRole[], location: string): FinalComponentObservation<number, FinalComponentBoundEvidence> {
  const source = record(value, location)
  if (source.status !== 'candidate') return abstained(source, location)
  const evidenceSource = record(source.evidence, `${location}.evidence`)
  return {
    status: 'candidate',
    value: finite(source.value, `${location}.value`),
    evidence: {
      ...commonEvidence(evidenceSource, `${location}.evidence`),
      method: literal(evidenceSource.method, FINAL_COMPONENT_P0_CONTRACT.boundMethod, `${location}.evidence.method`),
      side: literal(evidenceSource.side, side, `${location}.evidence.side`),
      boundaryRefs: parseBoundaryRefs(evidenceSource.boundaryRefs, memberIds, `${location}.evidence.boundaryRefs`),
    },
  }
}

function parseAxisFaces(value: unknown, side: FinalComponentSide, memberIds: readonly FinalComponentMemberRole[], location: string): FinalComponentObservation<readonly FinalComponentAxisFace[], FinalComponentAxisFaceEvidence> {
  const source = record(value, location)
  if (source.status !== 'candidate') return abstained(source, location)
  const evidenceSource = record(source.evidence, `${location}.evidence`)
  const faces = array(source.value, `${location}.value`).map((face, index) => {
    const item = record(face, `${location}.value[${index}]`)
    const orientation = enumValue(item.orientation, ['vertical', 'horizontal'] as const, `${location}.value[${index}].orientation`)
    const parsedSide = literal(item.side, side, `${location}.value[${index}].side`)
    if ((orientation === 'vertical') !== (side === 'left' || side === 'right')) throw new Error(`${location}.value[${index}]: orientation과 side 축이 다릅니다.`)
    const visibleSpans = array(item.visibleSpans, `${location}.value[${index}].visibleSpans`).map((span, spanIndex) => parseSpan(span, `${location}.value[${index}].visibleSpans[${spanIndex}]`))
    if (visibleSpans.length === 0) throw new Error(`${location}.value[${index}].visibleSpans: 비어 있지 않아야 합니다.`)
    return {
      orientation,
      side: parsedSide,
      value: finite(item.value, `${location}.value[${index}].value`),
      visibleSpans,
      boundaryRefs: parseBoundaryRefs(item.boundaryRefs, memberIds, `${location}.value[${index}].boundaryRefs`),
    }
  })
  if (faces.length === 0) throw new Error(`${location}.value: 비어 있으면 no-axis-face로 포기해야 합니다.`)
  return {
    status: 'candidate',
    value: faces,
    evidence: {
      ...commonEvidence(evidenceSource, `${location}.evidence`),
      method: literal(evidenceSource.method, FINAL_COMPONENT_P0_CONTRACT.axisFaceMethod, `${location}.evidence.method`),
      side: literal(evidenceSource.side, side, `${location}.evidence.side`),
    },
  }
}

function parseMember(value: unknown, spec: FinalComponentMemberSpec['members'][number], logicalOrder: number, location: string): FinalComponentMemberObservation {
  const source = record(value, location)
  const id = literal(source.id, spec.id, `${location}.id`)
  const partitionSource = record(source.partitionEvidence, `${location}.partitionEvidence`)
  const parsedLogicalOrder = integer(partitionSource.logicalOrder, `${location}.partitionEvidence.logicalOrder`)
  if (parsedLogicalOrder !== logicalOrder) throw new Error(`${location}.partitionEvidence.logicalOrder: 구성원 논리 순서가 다릅니다.`)
  const partitionEvidence = {
    ...commonEvidence(partitionSource, `${location}.partitionEvidence`),
    method: literal(partitionSource.method, FINAL_COMPONENT_P0_CONTRACT.memberPartitionMethod, `${location}.partitionEvidence.method`),
    memberId: literal(partitionSource.memberId, id, `${location}.partitionEvidence.memberId`),
    logicalOrder: parsedLogicalOrder,
  }
  const boundaryFragments = array(source.boundaryFragments, `${location}.boundaryFragments`).map((fragment, index) => parseBoundaryFragment(fragment, `${location}.boundaryFragments[${index}]`))
  if (boundaryFragments.length === 0) throw new Error(`${location}.boundaryFragments: 구성원 provenance가 필요합니다.`)
  const memberIds = [id] as const
  const boundsSource = record(source.inkBounds, `${location}.inkBounds`)
  const facesSource = record(source.axisFaces, `${location}.axisFaces`)
  const inkBounds = Object.fromEntries(FINAL_COMPONENT_P0_CONTRACT.boundSides.map((side) => [side, parseBound(boundsSource[side], side, memberIds, `${location}.inkBounds.${side}`)])) as FinalComponentMemberObservation['inkBounds']
  const axisFaces = Object.fromEntries(FINAL_COMPONENT_P0_CONTRACT.boundSides.map((side) => [side, parseAxisFaces(facesSource[side], side, memberIds, `${location}.axisFaces.${side}`)])) as FinalComponentMemberObservation['axisFaces']
  for (const side of FINAL_COMPONENT_P0_CONTRACT.boundSides) {
    const bound = inkBounds[side]
    if (bound.status === 'candidate' && bound.evidence.boundaryRefs.some((ref) => !boundaryFragments.some((fragment) => fragment.contourId === ref.contourId && fragment.segmentIds.includes(ref.segmentId)))) {
      throw new Error(`${location}.inkBounds.${side}: 구성원이 소유하지 않은 경계 근거입니다.`)
    }
    const faces = axisFaces[side]
    if (faces.status === 'candidate' && faces.value.some((face) => face.boundaryRefs.some((ref) => !boundaryFragments.some((fragment) => fragment.contourId === ref.contourId && fragment.segmentIds.includes(ref.segmentId))))) {
      throw new Error(`${location}.axisFaces.${side}: 구성원이 소유하지 않은 경계 근거입니다.`)
    }
  }
  return {
    id,
    jamo: literal(source.jamo, spec.jamo, `${location}.jamo`),
    role: literal(source.role, spec.role, `${location}.role`),
    partitionEvidence,
    boundaryFragments,
    inkBounds,
    axisFaces,
  }
}

function parseComponentGroup(value: unknown, members: readonly FinalComponentMemberObservation[], context: FinalComponentContext, location: string): FinalComponentObservation<FinalComponentGroupValue, FinalComponentGroupEvidence> {
  const source = record(value, location)
  if (source.status !== 'candidate') return abstained(source, location)
  const candidate = record(source.value, `${location}.value`)
  const evidenceSource = record(source.evidence, `${location}.evidence`)
  const contourIds = parseIdArray(candidate.contourIds, `${location}.value.contourIds`)
  const holeContourIds = parseIdArray(candidate.holeContourIds, `${location}.value.holeContourIds`, true)
  if (holeContourIds.some((id) => !contourIds.includes(id))) throw new Error(`${location}.value.holeContourIds: contourIds의 부분집합이어야 합니다.`)
  const expectedMemberIds = members.map(({ id }) => id)
  const memberIds = array(candidate.memberIds, `${location}.value.memberIds`).map((item, index) => enumValue(item, FINAL_COMPONENT_P0_CONTRACT.memberRoles, `${location}.value.memberIds[${index}]`))
  if (memberIds.join(',') !== expectedMemberIds.join(',')) throw new Error(`${location}.value.memberIds: 구성원 순서가 계약과 다릅니다.`)
  if (members.some((member) => member.boundaryFragments.some((fragment) => !contourIds.includes(fragment.contourId)))) throw new Error(`${location}.value.contourIds: 구성원 경계 contour를 모두 포함해야 합니다.`)
  const selectedPathSha256 = sha256(candidate.selectedPathSha256, `${location}.value.selectedPathSha256`)
  return {
    status: 'candidate',
    value: { contourIds, holeContourIds, memberIds, selectedPathSha256 },
    evidence: {
      ...commonEvidence(evidenceSource, `${location}.evidence`),
      method: literal(evidenceSource.method, FINAL_COMPONENT_P0_CONTRACT.groupingMethod, `${location}.evidence.method`),
      scanOrigin: literal(evidenceSource.scanOrigin, context.scanOrigin, `${location}.evidence.scanOrigin`),
      scanDirection: literal(evidenceSource.scanDirection, context.scanDirection, `${location}.evidence.scanDirection`),
      selectionRule: enumValue(evidenceSource.selectionRule, FINAL_COMPONENT_P0_CONTRACT.selectionRules, `${location}.evidence.selectionRule`),
      score: finite(evidenceSource.score, `${location}.evidence.score`),
      margin: finite(evidenceSource.margin, `${location}.evidence.margin`),
    },
  }
}

function parseMemberRelation(value: unknown, members: readonly FinalComponentMemberObservation[], location: string): FinalMemberRelation | null {
  if (members.length === 1) {
    if (value !== null) throw new Error(`${location}: 단일받침은 구성원 관계가 null이어야 합니다.`)
    return null
  }
  const source = record(value, location)
  const left = members.find(({ id }) => id === 'left')
  const right = members.find(({ id }) => id === 'right')
  if (!left || !right) throw new Error(`${location}: 좌·우 구성원이 필요합니다.`)
  const relation = enumValue(source.relation, FINAL_COMPONENT_P0_CONTRACT.contactRelations, `${location}.relation`)
  const leftAnchorX = finite(source.leftAnchorX, `${location}.leftAnchorX`)
  const rightAnchorX = finite(source.rightAnchorX, `${location}.rightAnchorX`)
  if (leftAnchorX >= rightAnchorX) throw new Error(`${location}: 왼구성원 앵커가 오른구성원보다 왼쪽이어야 합니다.`)
  const boundaryPairs = array(source.boundaryPairs, `${location}.boundaryPairs`).map((pair, index) => {
    const item = record(pair, `${location}.boundaryPairs[${index}]`)
    const parsed = {
      left: parseBoundaryRef(item.left, ['left'], `${location}.boundaryPairs[${index}].left`),
      right: parseBoundaryRef(item.right, ['right'], `${location}.boundaryPairs[${index}].right`),
      distance: finite(item.distance, `${location}.boundaryPairs[${index}].distance`),
      intersects: boolean(item.intersects, `${location}.boundaryPairs[${index}].intersects`),
    }
    if (parsed.distance < 0 || !memberOwnsRef(left, parsed.left) || !memberOwnsRef(right, parsed.right)) throw new Error(`${location}.boundaryPairs[${index}]: 실제 구성원 경계 근거가 필요합니다.`)
    return parsed
  })
  if (boundaryPairs.length === 0) throw new Error(`${location}.boundaryPairs: 실제 경계 관계 근거가 필요합니다.`)
  if (relation === 'disjoint' && boundaryPairs.some(({ distance, intersects }) => distance <= 0 || intersects)) throw new Error(`${location}: 분리 관계 근거가 실제 경계와 다릅니다.`)
  if ((relation === 'touching' || relation === 'overlapping') && !boundaryPairs.some(({ distance, intersects }) => distance === 0 || intersects)) throw new Error(`${location}: 실제 접촉·교차 근거가 필요합니다.`)
  if (relation === 'merged-boundary' && !boundaryPairs.some(({ left: leftRef, right: rightRef }) => leftRef.contourId === rightRef.contourId)) throw new Error(`${location}: 합쳐진 contour 근거가 필요합니다.`)
  return {
    method: literal(source.method, FINAL_COMPONENT_P0_CONTRACT.memberRelationMethod, `${location}.method`),
    direction: literal(source.direction, 'left-to-right', `${location}.direction`),
    relation,
    leftMemberId: literal(source.leftMemberId, 'left', `${location}.leftMemberId`),
    rightMemberId: literal(source.rightMemberId, 'right', `${location}.rightMemberId`),
    leftAnchorX,
    rightAnchorX,
    boundaryPairs,
  }
}

function validateRefs(refs: readonly FinalBoundaryRef[], members: readonly FinalComponentMemberObservation[], location: string): void {
  if (refs.some((ref) => {
    const member = members.find(({ id }) => id === ref.memberId)
    return !member || !memberOwnsRef(member, ref)
  })) throw new Error(`${location}: 구성원이 소유하지 않은 contour·segment 근거입니다.`)
}

function parseRoleFace(value: unknown, side: FinalComponentSide, memberIds: readonly FinalComponentMemberRole[], location: string): FinalComponentObservation<number, FinalComponentRoleFaceEvidence> {
  const source = record(value, location)
  if (source.status !== 'candidate') return abstained(source, location)
  const evidenceSource = record(source.evidence, `${location}.evidence`)
  return {
    status: 'candidate',
    value: finite(source.value, `${location}.value`),
    evidence: {
      ...commonEvidence(evidenceSource, `${location}.evidence`),
      method: literal(evidenceSource.method, FINAL_COMPONENT_P0_CONTRACT.roleFaceMethod, `${location}.evidence.method`),
      side: literal(evidenceSource.side, side, `${location}.evidence.side`),
      selectionRule: literal(evidenceSource.selectionRule, FINAL_COMPONENT_P0_CONTRACT.roleFaceSelectionRule, `${location}.evidence.selectionRule`),
      supportKind: enumValue(evidenceSource.supportKind, ['axis-face', 'bezier-extremum'] as const, `${location}.evidence.supportKind`),
      boundaryRefs: parseBoundaryRefs(evidenceSource.boundaryRefs, memberIds, `${location}.evidence.boundaryRefs`),
    },
  }
}

function parseSelectionArea(value: unknown, location: string): FinalComponentObservation<FinalComponentSelectionArea, FinalComponentSelectionAreaEvidence> {
  const source = record(value, location)
  if (source.status !== 'candidate') return abstained(source, location)
  const candidate = record(source.value, `${location}.value`)
  const evidenceSource = record(source.evidence, `${location}.evidence`)
  const derivedFrom = array(evidenceSource.derivedFrom, `${location}.evidence.derivedFrom`)
  if (derivedFrom.join(',') !== 'top,bottom,left,right') throw new Error(`${location}.evidence.derivedFrom: 네 역할 단면 순서가 필요합니다.`)
  const width = finite(candidate.width, `${location}.value.width`)
  const height = finite(candidate.height, `${location}.value.height`)
  if (width <= 0 || height <= 0) throw new Error(`${location}.value: 양의 너비·높이가 필요합니다.`)
  return {
    status: 'candidate',
    value: { x: finite(candidate.x, `${location}.value.x`), y: finite(candidate.y, `${location}.value.y`), width, height },
    evidence: {
      ...commonEvidence(evidenceSource, `${location}.evidence`),
      method: literal(evidenceSource.method, FINAL_COMPONENT_P0_CONTRACT.selectionAreaMethod, `${location}.evidence.method`),
      derivedFrom: ['top', 'bottom', 'left', 'right'],
    },
  }
}

function parseIdentity(value: unknown, fontSha256: string, fontAxes: Readonly<Record<string, number>>, location: string): { identity: FinalComponentIdentity, context: FinalComponentContext, spec: FinalComponentMemberSpec } {
  const source = record(value, location)
  const character = text(source.character, `${location}.character`)
  if ([...character].length !== 1) throw new Error(`${location}.character: 한 글자가 필요합니다.`)
  const codepoint = integer(source.codepoint, `${location}.codepoint`)
  if (character.codePointAt(0) !== codepoint || codepoint < 0xac00 || codepoint > 0xd7a3) throw new Error(`${location}: 현대 한글 codepoint가 맞지 않습니다.`)
  const initialJamo = enumValue(source.initialJamo, CHOSEONG_LIST, `${location}.initialJamo`)
  const medialJamo = enumValue(source.medialJamo, ['ㅏ', 'ㅗ', 'ㅘ'] as const, `${location}.medialJamo`)
  const finalJamo = enumValue(source.finalJamo, FINAL_COMPONENT_P0_CONTRACT.finalJamos, `${location}.finalJamo`)
  const contextId = enumValue(source.contextId, FINAL_COMPONENT_P0_CONTRACT.contexts.map(({ id }) => id), `${location}.contextId`)
  const context = FINAL_COMPONENT_P0_CONTRACT.contexts.find(({ id }) => id === contextId)
  if (!context || context.medialJamo !== medialJamo) throw new Error(`${location}: 대표 홀자와 문맥 ID가 맞지 않습니다.`)
  const offset = codepoint - 0xac00
  if (CHOSEONG_LIST[Math.floor(offset / 588)] !== initialJamo || JUNGSEONG_LIST[Math.floor((offset % 588) / 28)] !== medialJamo || JONGSEONG_LIST[offset % 28] !== finalJamo) throw new Error(`${location}: character와 자모 identity가 맞지 않습니다.`)
  const parsedFontSha256 = sha256(source.fontSha256, `${location}.fontSha256`)
  const axes = numberRecord(source.axes, `${location}.axes`)
  if (parsedFontSha256 !== fontSha256 || !sameNumberRecord(axes, fontAxes)) throw new Error(`${location}: 응답 font identity와 다릅니다.`)
  const spec = finalMemberSpecFor(finalJamo)
  return {
    identity: {
      fontSha256: parsedFontSha256,
      axes,
      character,
      codepoint,
      glyphName: source.glyphName === null ? null : text(source.glyphName, `${location}.glyphName`),
      pathSha256: source.pathSha256 === null ? null : sha256(source.pathSha256, `${location}.pathSha256`),
      initialJamo,
      medialJamo,
      finalJamo,
      contextId,
      schemaVersion: literal(source.schemaVersion, FINAL_COMPONENT_P0_CONTRACT.schema, `${location}.schemaVersion`),
      extractorVersion: literal(source.extractorVersion, FINAL_COMPONENT_EXTRACTOR_VERSION, `${location}.extractorVersion`),
      roleDefinitionVersion: literal(source.roleDefinitionVersion, FINAL_COMPONENT_ROLE_DEFINITION_VERSION, `${location}.roleDefinitionVersion`),
    },
    context,
    spec,
  }
}

export function parseFinalComponentIdentityForDisplay(
  value: unknown,
  fontSha256: string,
  fontAxes: Readonly<Record<string, number>>,
  location: string,
): FinalComponentIdentity {
  return parseIdentity(value, fontSha256, fontAxes, location).identity
}

function parseCase(value: unknown, fontSha256: string, fontAxes: Readonly<Record<string, number>>, location: string): FinalComponentCase {
  assertNoForbiddenCandidateKeys(value, location)
  const source = record(value, location)
  const { identity, context, spec } = parseIdentity(source.identity, fontSha256, fontAxes, `${location}.identity`)
  if (source.state !== 'candidate') {
    if (source.reasonCode === 'glyph-missing' && (identity.glyphName !== null || identity.pathSha256 !== null)) throw new Error(`${location}.identity: 없는 글리프는 glyphName·pathSha256이 null이어야 합니다.`)
    return {
      identity,
      state: literal(source.state, 'abstained', `${location}.state`),
      reasonCode: enumValue(source.reasonCode, FINAL_COMPONENT_P0_CONTRACT.reasonCodes, `${location}.reasonCode`),
    }
  }
  if (identity.glyphName === null || identity.pathSha256 === null) throw new Error(`${location}.identity: candidate에는 실제 glyphName·pathSha256이 필요합니다.`)
  const structureKind = literal(source.structureKind, spec.structureKind, `${location}.structureKind`)
  const membersSource = array(source.members, `${location}.members`)
  if (membersSource.length !== spec.members.length) throw new Error(`${location}.members: 구조군별 구성원 수가 다릅니다.`)
  const members = membersSource.map((member, index) => parseMember(member, spec.members[index], index, `${location}.members[${index}]`))
  const componentGroup = parseComponentGroup(source.componentGroup, members, context, `${location}.componentGroup`)
  if (componentGroup.status !== 'candidate') throw new Error(`${location}.componentGroup: candidate case에는 받침 그룹 후보가 필요합니다.`)
  const memberRelation = parseMemberRelation(source.memberRelation, members, `${location}.memberRelation`)
  const memberIds = members.map(({ id }) => id)
  const boundsSource = record(source.inkBounds, `${location}.inkBounds`)
  const facesSource = record(source.axisFaces, `${location}.axisFaces`)
  const roleFacesSource = record(source.roleFaces, `${location}.roleFaces`)
  const inkBounds = Object.fromEntries(FINAL_COMPONENT_P0_CONTRACT.boundSides.map((side) => [side, parseBound(boundsSource[side], side, memberIds, `${location}.inkBounds.${side}`)])) as FinalComponentCandidateCase['inkBounds']
  const axisFaces = Object.fromEntries(FINAL_COMPONENT_P0_CONTRACT.boundSides.map((side) => [side, parseAxisFaces(facesSource[side], side, memberIds, `${location}.axisFaces.${side}`)])) as FinalComponentCandidateCase['axisFaces']
  const roleFaces = Object.fromEntries(FINAL_COMPONENT_P0_CONTRACT.boundSides.map((side) => [side, parseRoleFace(roleFacesSource[side], side, memberIds, `${location}.roleFaces.${side}`)])) as FinalComponentCandidateCase['roleFaces']
  for (const side of FINAL_COMPONENT_P0_CONTRACT.boundSides) {
    const bound = inkBounds[side]
    if (bound.status === 'candidate') validateRefs(bound.evidence.boundaryRefs, members, `${location}.inkBounds.${side}`)
    const faces = axisFaces[side]
    if (faces.status === 'candidate') faces.value.forEach((face, index) => validateRefs(face.boundaryRefs, members, `${location}.axisFaces.${side}.value[${index}]`))
    const roleFace = roleFaces[side]
    if (roleFace.status === 'candidate') {
      validateRefs(roleFace.evidence.boundaryRefs, members, `${location}.roleFaces.${side}`)
      if (bound.status !== 'candidate' || roleFace.value !== bound.value) throw new Error(`${location}.roleFaces.${side}: 받침 전체 그룹 원시 극값과 같아야 합니다.`)
    }
  }
  const top = inkBounds.top
  const bottom = inkBounds.bottom
  const left = inkBounds.left
  const right = inkBounds.right
  if (top.status === 'candidate' && bottom.status === 'candidate' && top.value >= bottom.value) throw new Error(`${location}.inkBounds: top은 bottom보다 작아야 합니다.`)
  if (left.status === 'candidate' && right.status === 'candidate' && left.value >= right.value) throw new Error(`${location}.inkBounds: left는 right보다 작아야 합니다.`)
  const selectionArea = parseSelectionArea(source.selectionArea, `${location}.selectionArea`)
  if (selectionArea.status === 'candidate') {
    if (FINAL_COMPONENT_P0_CONTRACT.boundSides.some((side) => roleFaces[side].status !== 'candidate')) throw new Error(`${location}.selectionArea: 네 역할 단면 후보가 필요합니다.`)
    const expected = selectionAreaFromFinalRoleFaces(Object.fromEntries(FINAL_COMPONENT_P0_CONTRACT.boundSides.map((side) => {
      const face = roleFaces[side]
      return [side, face.status === 'candidate' ? face.value : 0]
    })) as Record<FinalComponentSide, number>)
    if (Object.entries(expected).some(([key, expectedValue]) => !sameRoundedGeometry(selectionArea.value[key as keyof FinalComponentSelectionArea], expectedValue))) throw new Error(`${location}.selectionArea: 네 역할 단면의 정확한 파생값이어야 합니다.`)
  }
  return { identity, state: 'candidate', structureKind, members, componentGroup, memberRelation, inkBounds, axisFaces, roleFaces, selectionArea }
}

function assertNoForbiddenCandidateKeys(value: unknown, location: string): void {
  if (!value || typeof value !== 'object') return
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoForbiddenCandidateKeys(item, `${location}[${index}]`))
    return
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (FINAL_COMPONENT_P0_CONTRACT.forbiddenCandidateKeys.includes(key)) throw new Error(`${location}.${key}: ROI·레거시 값·검증 상태를 후보 응답에 넣을 수 없습니다.`)
    assertNoForbiddenCandidateKeys(child, `${location}.${key}`)
  }
}

function validateContract(): void {
  if (FINAL_COMPONENT_P0_CONTRACT.initialJamos.length !== 19 || new Set(FINAL_COMPONENT_P0_CONTRACT.initialJamos).size !== 19) throw new Error('첫닿자 19종 계약이 필요합니다.')
  if (FINAL_COMPONENT_P0_CONTRACT.finalJamos.length !== 27 || new Set(FINAL_COMPONENT_P0_CONTRACT.finalJamos).size !== 27) throw new Error('받침 27종 계약이 필요합니다.')
  if (FINAL_COMPONENT_P0_CONTRACT.memberSpecs.map(({ finalJamo }) => finalJamo).join(',') !== FINAL_COMPONENT_P0_CONTRACT.finalJamos.join(',')) throw new Error('받침 구성원 계약 순서가 다릅니다.')
  const classified = FINAL_COMPONENT_P0_CONTRACT.structureKinds.flatMap(({ finalJamos }) => finalJamos)
  if (classified.length !== 27 || new Set(classified).size !== 27 || classified.some((jamo) => !FINAL_COMPONENT_P0_CONTRACT.finalJamos.includes(jamo))) throw new Error('받침은 정확히 하나의 구조군에 속해야 합니다.')
  for (const spec of FINAL_COMPONENT_P0_CONTRACT.memberSpecs) {
    const kind = FINAL_COMPONENT_P0_CONTRACT.structureKinds.find(({ id }) => id === spec.structureKind)
    if (!kind || !kind.finalJamos.includes(spec.finalJamo) || spec.members.length !== kind.expectedMemberCount) throw new Error('받침 구성원과 구조군이 맞지 않습니다.')
    const expectedRoles = spec.structureKind === 'single' ? ['only'] : ['left', 'right']
    if (spec.members.map(({ id }) => id).join(',') !== expectedRoles.join(',') || spec.members.map(({ role }) => role).join(',') !== expectedRoles.join(',')) throw new Error('구성원 역할 순서가 맞지 않습니다.')
  }
}

validateContract()

export function finalMemberSpecFor(finalJamo: FinalJamo): FinalComponentMemberSpec {
  const matches = FINAL_COMPONENT_P0_CONTRACT.memberSpecs.filter((spec) => spec.finalJamo === finalJamo)
  if (matches.length !== 1) throw new Error('받침은 정확히 하나의 구성원 계약을 가져야 합니다.')
  return matches[0]
}

export function selectionAreaFromFinalRoleFaces(roleFaces: Record<FinalComponentSide, number>): FinalComponentSelectionArea {
  const { top, bottom, left, right } = roleFaces
  if (!(top < bottom) || !(left < right)) throw new Error('받침 역할 단면 순서가 잘못됐습니다.')
  return { x: left, y: top, width: right - left, height: bottom - top }
}

export function parseFinalComponentCandidateResponse(value: unknown): FinalComponentCandidateResponse {
  assertNoForbiddenCandidateKeys(value, 'response')
  const source = record(value, 'response')
  const fontSource = record(source.font, 'response.font')
  const font = {
    id: text(fontSource.id, 'response.font.id'),
    fileSha256: sha256(fontSource.fileSha256, 'response.font.fileSha256'),
    axes: numberRecord(fontSource.axes, 'response.font.axes'),
  }
  const cases = array(source.cases, 'response.cases').map((item, index) => parseCase(item, font.fileSha256, font.axes, `response.cases[${index}]`))
  const identities = cases.map(({ identity }) => `${identity.fontSha256}:${identity.character}:${identity.pathSha256}`)
  if (new Set(identities).size !== identities.length) throw new Error('response.cases: 중복 identity가 있습니다.')
  return {
    schema: literal(source.schema, FINAL_COMPONENT_RESPONSE_SCHEMA, 'response.schema'),
    apiVersion: literal(source.apiVersion, 'reference.v1', 'response.apiVersion'),
    lifecycle: literal(source.lifecycle, FINAL_COMPONENT_P0_CONTRACT.candidateLifecycle, 'response.lifecycle'),
    extractorVersion: literal(source.extractorVersion, FINAL_COMPONENT_EXTRACTOR_VERSION, 'response.extractorVersion'),
    roleDefinitionVersion: literal(source.roleDefinitionVersion, FINAL_COMPONENT_ROLE_DEFINITION_VERSION, 'response.roleDefinitionVersion'),
    medialAnchorExtractorVersion: literal(source.medialAnchorExtractorVersion, FINAL_COMPONENT_MEDIAL_ANCHOR_VERSION, 'response.medialAnchorExtractorVersion'),
    coordinateFrame: literal(source.coordinateFrame, FINAL_COMPONENT_P0_CONTRACT.coordinateFrame, 'response.coordinateFrame'),
    font,
    cases,
  }
}

export function parseFinalComponentVerification(value: unknown): FinalComponentVerification {
  const source = record(value, 'verification')
  const reviewSource = record(source.review, 'verification.review')
  const reviewedAt = text(reviewSource.reviewedAt, 'verification.review.reviewedAt')
  if (Number.isNaN(Date.parse(reviewedAt))) throw new Error('verification.review.reviewedAt: ISO 날짜가 필요합니다.')
  return {
    schema: literal(source.schema, FINAL_COMPONENT_VERIFICATION_SCHEMA, 'verification.schema'),
    state: enumValue(source.state, FINAL_COMPONENT_P0_CONTRACT.verificationStates, 'verification.state'),
    candidateArtifactSha256: sha256(source.candidateArtifactSha256, 'verification.candidateArtifactSha256'),
    candidateIdentitySha256: sha256(source.candidateIdentitySha256, 'verification.candidateIdentitySha256'),
    review: {
      method: literal(reviewSource.method, 'user-visual-review', 'verification.review.method'),
      reviewedAt,
      reviewedBy: text(reviewSource.reviewedBy, 'verification.review.reviewedBy'),
      note: text(reviewSource.note, 'verification.review.note'),
    },
  }
}
