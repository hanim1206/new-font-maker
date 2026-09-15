import {
  FINAL_COMPONENT_EXTRACTOR_VERSION,
  FINAL_COMPONENT_MEDIAL_ANCHOR_VERSION,
  FINAL_COMPONENT_P0_CONTRACT,
  FINAL_COMPONENT_ROLE_DEFINITION_VERSION,
  finalMemberSpecFor,
  parseFinalComponentIdentityForDisplay,
  selectionAreaFromFinalRoleFaces,
  type FinalComponentCase,
  type FinalComponentContactRelation,
  type FinalComponentIdentity,
  type FinalComponentMemberRole,
  type FinalComponentOrientation,
  type FinalComponentReasonCode,
  type FinalComponentSelectionArea,
  type FinalComponentSide,
  type FinalComponentStructureKind,
} from './finalComponentCandidateModel'

export const FINAL_COMPONENT_DISPLAY_RESPONSE_SCHEMA = 'reference-final-component-display-response-v1' as const

export type FinalComponentDisplayObservation<T> = {
  status: 'candidate'
  value: T
} | {
  status: 'abstained'
  reasonCode: FinalComponentReasonCode
}

export interface FinalComponentDisplayAxisFace {
  orientation: FinalComponentOrientation
  value: number
  visibleSpans: readonly { from: number, to: number }[]
}

export interface FinalComponentDisplayMember {
  id: FinalComponentMemberRole
  jamo: string
  role: FinalComponentMemberRole
  contourIds: readonly number[]
}

export interface FinalComponentDisplayMemberPath {
  id: FinalComponentMemberRole
  path: string
}

export interface FinalComponentDisplayCandidateCase {
  identity: FinalComponentIdentity
  state: 'candidate'
  structureKind: FinalComponentStructureKind
  members: readonly FinalComponentDisplayMember[]
  memberPaths: readonly FinalComponentDisplayMemberPath[]
  componentGroup: {
    contourIds: readonly number[]
    holeContourIds: readonly number[]
    selectedPathSha256: string
  }
  memberRelation: null | {
    relation: FinalComponentContactRelation
    leftAnchorX: number
    rightAnchorX: number
  }
  inkBounds: Record<FinalComponentSide, FinalComponentDisplayObservation<number>>
  axisFaces: Record<FinalComponentSide, FinalComponentDisplayObservation<readonly FinalComponentDisplayAxisFace[]>>
  roleFaces: Record<FinalComponentSide, FinalComponentDisplayObservation<number>>
  selectionArea: FinalComponentDisplayObservation<FinalComponentSelectionArea>
}

export interface FinalComponentDisplayAbstainedCase {
  identity: FinalComponentIdentity
  state: 'abstained'
  reasonCode: FinalComponentReasonCode
}

export type FinalComponentDisplayCase = FinalComponentDisplayCandidateCase | FinalComponentDisplayAbstainedCase

export interface FinalComponentDisplayResponse {
  schema: typeof FINAL_COMPONENT_DISPLAY_RESPONSE_SCHEMA
  apiVersion: 'reference.v1'
  coordinateFrame: 'shared-baseline'
  extractorVersion: typeof FINAL_COMPONENT_EXTRACTOR_VERSION
  roleDefinitionVersion: typeof FINAL_COMPONENT_ROLE_DEFINITION_VERSION
  medialAnchorExtractorVersion: typeof FINAL_COMPONENT_MEDIAL_ANCHOR_VERSION
  source: {
    candidateArtifactSha256: string
    candidateIdentitySha256: string
    verification: {
      state: 'verified'
      reviewedAt: string
      reviewedBy: string
    }
  }
  font: {
    id: string
    fileSha256: string
    axes: Readonly<Record<string, number>>
  }
  cases: readonly FinalComponentDisplayCase[]
}

function fail(location: string, expectation: string): never {
  throw new Error(`${location}: ${expectation}`)
}

function record(value: unknown, location: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail(location, '객체가 필요합니다.')
  return value as Record<string, unknown>
}

function array(value: unknown, location: string): unknown[] {
  if (!Array.isArray(value)) return fail(location, '배열이 필요합니다.')
  return value
}

function text(value: unknown, location: string): string {
  if (typeof value !== 'string' || value.length === 0) return fail(location, '비어 있지 않은 문자열이 필요합니다.')
  return value
}

function finite(value: unknown, location: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fail(location, '유한한 숫자가 필요합니다.')
  return value
}

function integer(value: unknown, location: string): number {
  const parsed = finite(value, location)
  if (!Number.isInteger(parsed) || parsed < 0) return fail(location, '0 이상 정수가 필요합니다.')
  return parsed
}

function sha256(value: unknown, location: string): string {
  const parsed = text(value, location)
  if (!/^[0-9a-f]{64}$/u.test(parsed)) return fail(location, 'SHA-256이 필요합니다.')
  return parsed
}

function literal<T extends string>(value: unknown, expected: T, location: string): T {
  if (value !== expected) return fail(location, `${expected}가 필요합니다.`)
  return expected
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], location: string): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) return fail(location, '지원하지 않는 값입니다.')
  return value as T
}

function numberRecord(value: unknown, location: string): Record<string, number> {
  const source = record(value, location)
  return Object.fromEntries(Object.entries(source).map(([key, item]) => [key, finite(item, `${location}.${key}`)]))
}

function observation(value: unknown, location: string): FinalComponentDisplayObservation<number> {
  const source = record(value, location)
  if (source.status === 'candidate') return { status: 'candidate', value: finite(source.value, `${location}.value`) }
  return {
    status: literal(source.status, 'abstained', `${location}.status`),
    reasonCode: enumValue(source.reasonCode, FINAL_COMPONENT_P0_CONTRACT.reasonCodes, `${location}.reasonCode`),
  }
}

function selectionAreaObservation(value: unknown, location: string): FinalComponentDisplayObservation<FinalComponentSelectionArea> {
  const source = record(value, location)
  if (source.status !== 'candidate') {
    return {
      status: literal(source.status, 'abstained', `${location}.status`),
      reasonCode: enumValue(source.reasonCode, FINAL_COMPONENT_P0_CONTRACT.reasonCodes, `${location}.reasonCode`),
    }
  }
  const area = record(source.value, `${location}.value`)
  const width = finite(area.width, `${location}.value.width`)
  const height = finite(area.height, `${location}.value.height`)
  if (width <= 0 || height <= 0) return fail(`${location}.value`, '양의 너비와 높이가 필요합니다.')
  return {
    status: 'candidate',
    value: { x: finite(area.x, `${location}.value.x`), y: finite(area.y, `${location}.value.y`), width, height },
  }
}

function axisObservation(side: FinalComponentSide, value: unknown, location: string): FinalComponentDisplayObservation<readonly FinalComponentDisplayAxisFace[]> {
  const source = record(value, location)
  if (source.status !== 'candidate') {
    return {
      status: literal(source.status, 'abstained', `${location}.status`),
      reasonCode: enumValue(source.reasonCode, FINAL_COMPONENT_P0_CONTRACT.reasonCodes, `${location}.reasonCode`),
    }
  }
  const faces = array(source.value, `${location}.value`).map((item, index) => {
    const face = record(item, `${location}.value[${index}]`)
    const orientation = enumValue(face.orientation, ['vertical', 'horizontal'] as const, `${location}.value[${index}].orientation`)
    if ((side === 'left' || side === 'right') !== (orientation === 'vertical')) return fail(`${location}.value[${index}]`, '방향과 단면 축이 다릅니다.')
    const visibleSpans = array(face.visibleSpans, `${location}.value[${index}].visibleSpans`).map((span, spanIndex) => {
      const parsed = record(span, `${location}.value[${index}].visibleSpans[${spanIndex}]`)
      const from = finite(parsed.from, `${location}.value[${index}].visibleSpans[${spanIndex}].from`)
      const to = finite(parsed.to, `${location}.value[${index}].visibleSpans[${spanIndex}].to`)
      if (from >= to) return fail(`${location}.value[${index}].visibleSpans[${spanIndex}]`, 'from은 to보다 작아야 합니다.')
      return { from, to }
    })
    if (visibleSpans.length === 0) return fail(`${location}.value[${index}].visibleSpans`, '비어 있지 않아야 합니다.')
    return { orientation, value: finite(face.value, `${location}.value[${index}].value`), visibleSpans }
  })
  if (faces.length === 0) return fail(`${location}.value`, '비어 있으면 자동 포기여야 합니다.')
  return { status: 'candidate', value: faces }
}

function ids(value: unknown, location: string, allowEmpty = false): number[] {
  const values = array(value, location).map((item, index) => integer(item, `${location}[${index}]`))
  if (!allowEmpty && values.length === 0) return fail(location, '비어 있지 않아야 합니다.')
  if (new Set(values).size !== values.length) return fail(location, '중복 ID가 있습니다.')
  return values
}

function parseCandidateCase(value: unknown, fontSha256: string, fontAxes: Readonly<Record<string, number>>, location: string): FinalComponentDisplayCandidateCase {
  const source = record(value, location)
  const identity = parseFinalComponentIdentityForDisplay(source.identity, fontSha256, fontAxes, `${location}.identity`)
  if (identity.glyphName === null || identity.pathSha256 === null) return fail(`${location}.identity`, 'candidate에는 glyphName과 path SHA가 필요합니다.')
  const spec = finalMemberSpecFor(identity.finalJamo)
  const structureKind = literal(source.structureKind, spec.structureKind, `${location}.structureKind`)
  const members = array(source.members, `${location}.members`).map((item, index) => {
    const member = record(item, `${location}.members[${index}]`)
    const expected = spec.members[index]
    if (!expected) return fail(`${location}.members`, '구조군별 구성원 수가 다릅니다.')
    return {
      id: literal(member.id, expected.id, `${location}.members[${index}].id`),
      jamo: literal(member.jamo, expected.jamo, `${location}.members[${index}].jamo`),
      role: literal(member.role, expected.role, `${location}.members[${index}].role`),
      contourIds: ids(member.contourIds, `${location}.members[${index}].contourIds`),
    }
  })
  if (members.length !== spec.members.length) return fail(`${location}.members`, '구조군별 구성원 수가 다릅니다.')
  const group = record(source.componentGroup, `${location}.componentGroup`)
  const contourIds = ids(group.contourIds, `${location}.componentGroup.contourIds`)
  const holeContourIds = ids(group.holeContourIds, `${location}.componentGroup.holeContourIds`, true)
  if (holeContourIds.some((id) => !contourIds.includes(id))) return fail(`${location}.componentGroup.holeContourIds`, 'contourIds의 부분집합이어야 합니다.')
  const memberContours = members.flatMap((member) => member.contourIds)
  if (new Set(memberContours).size !== memberContours.length || memberContours.length !== contourIds.length || memberContours.some((id) => !contourIds.includes(id))) return fail(`${location}.members`, '구성원 contour 분할이 전체 그룹과 다릅니다.')
  const relationSource = source.memberRelation
  let memberRelation: FinalComponentDisplayCandidateCase['memberRelation']
  if (members.length === 1) {
    if (relationSource !== null) return fail(`${location}.memberRelation`, '단일받침은 null이어야 합니다.')
    memberRelation = null
  } else {
    const relation = record(relationSource, `${location}.memberRelation`)
    const leftAnchorX = finite(relation.leftAnchorX, `${location}.memberRelation.leftAnchorX`)
    const rightAnchorX = finite(relation.rightAnchorX, `${location}.memberRelation.rightAnchorX`)
    if (leftAnchorX >= rightAnchorX) return fail(`${location}.memberRelation`, '왼 구성원 앵커가 오른 구성원보다 왼쪽이어야 합니다.')
    memberRelation = {
      relation: enumValue(relation.relation, FINAL_COMPONENT_P0_CONTRACT.contactRelations, `${location}.memberRelation.relation`),
      leftAnchorX,
      rightAnchorX,
    }
  }
  const inkSource = record(source.inkBounds, `${location}.inkBounds`)
  const axisSource = record(source.axisFaces, `${location}.axisFaces`)
  const roleSource = record(source.roleFaces, `${location}.roleFaces`)
  const inkBounds = Object.fromEntries(FINAL_COMPONENT_P0_CONTRACT.boundSides.map((side) => [side, observation(inkSource[side], `${location}.inkBounds.${side}`)])) as FinalComponentDisplayCandidateCase['inkBounds']
  const axisFaces = Object.fromEntries(FINAL_COMPONENT_P0_CONTRACT.boundSides.map((side) => [side, axisObservation(side, axisSource[side], `${location}.axisFaces.${side}`)])) as FinalComponentDisplayCandidateCase['axisFaces']
  const roleFaces = Object.fromEntries(FINAL_COMPONENT_P0_CONTRACT.boundSides.map((side) => [side, observation(roleSource[side], `${location}.roleFaces.${side}`)])) as FinalComponentDisplayCandidateCase['roleFaces']
  if (FINAL_COMPONENT_P0_CONTRACT.boundSides.some((side) => roleFaces[side].status !== 'candidate' || inkBounds[side].status !== 'candidate' || roleFaces[side].value !== inkBounds[side].value)) return fail(`${location}.roleFaces`, '각 역할 단면은 받침군 원시 ink 극값과 같아야 합니다.')
  const selectionArea = selectionAreaObservation(source.selectionArea, `${location}.selectionArea`)
  if (selectionArea.status !== 'candidate') return fail(`${location}.selectionArea`, 'candidate에는 역할 단면 파생 영역이 필요합니다.')
  const expectedArea = selectionAreaFromFinalRoleFaces(Object.fromEntries(FINAL_COMPONENT_P0_CONTRACT.boundSides.map((side) => [side, roleFaces[side].status === 'candidate' ? roleFaces[side].value : 0])) as Record<FinalComponentSide, number>)
  if (Object.entries(expectedArea).some(([key, expected]) => Math.abs(selectionArea.value[key as keyof FinalComponentSelectionArea] - expected) > 0.002)) return fail(`${location}.selectionArea`, '네 역할 단면의 파생값이어야 합니다.')
  const memberPaths = array(source.memberPaths, `${location}.memberPaths`).map((item, index) => {
    const path = record(item, `${location}.memberPaths[${index}]`)
    const expected = members[index]
    if (!expected) return fail(`${location}.memberPaths`, '구성원 수가 다릅니다.')
    return { id: literal(path.id, expected.id, `${location}.memberPaths[${index}].id`), path: text(path.path, `${location}.memberPaths[${index}].path`) }
  })
  if (memberPaths.length !== members.length) return fail(`${location}.memberPaths`, '구성원 수가 다릅니다.')
  return {
    identity,
    state: 'candidate',
    structureKind,
    members,
    memberPaths,
    componentGroup: { contourIds, holeContourIds, selectedPathSha256: sha256(group.selectedPathSha256, `${location}.componentGroup.selectedPathSha256`) },
    memberRelation,
    inkBounds,
    axisFaces,
    roleFaces,
    selectionArea,
  }
}

function parseCase(value: unknown, fontSha256: string, fontAxes: Readonly<Record<string, number>>, location: string): FinalComponentDisplayCase {
  const source = record(value, location)
  const identity = parseFinalComponentIdentityForDisplay(source.identity, fontSha256, fontAxes, `${location}.identity`)
  if (source.state === 'candidate') return parseCandidateCase(value, fontSha256, fontAxes, location)
  return {
    identity,
    state: literal(source.state, 'abstained', `${location}.state`),
    reasonCode: enumValue(source.reasonCode, FINAL_COMPONENT_P0_CONTRACT.reasonCodes, `${location}.reasonCode`),
  }
}

export function parseFinalComponentDisplayResponse(value: unknown): FinalComponentDisplayResponse {
  const source = record(value, 'response')
  const fontSource = record(source.font, 'response.font')
  const font = {
    id: text(fontSource.id, 'response.font.id'),
    fileSha256: sha256(fontSource.fileSha256, 'response.font.fileSha256'),
    axes: numberRecord(fontSource.axes, 'response.font.axes'),
  }
  const sourceArtifact = record(source.source, 'response.source')
  const verification = record(sourceArtifact.verification, 'response.source.verification')
  const reviewedAt = text(verification.reviewedAt, 'response.source.verification.reviewedAt')
  if (Number.isNaN(Date.parse(reviewedAt))) return fail('response.source.verification.reviewedAt', 'ISO 날짜가 필요합니다.')
  const cases = array(source.cases, 'response.cases').map((item, index) => parseCase(item, font.fileSha256, font.axes, `response.cases[${index}]`))
  const identities = cases.map(({ identity }) => `${identity.character}:${identity.pathSha256}`)
  if (new Set(identities).size !== identities.length) return fail('response.cases', '중복 identity가 있습니다.')
  if (cases.some((item) => item.state === 'candidate' && item.identity.pathSha256 === null)) return fail('response.cases', 'candidate path SHA가 필요합니다.')
  return {
    schema: literal(source.schema, FINAL_COMPONENT_DISPLAY_RESPONSE_SCHEMA, 'response.schema'),
    apiVersion: literal(source.apiVersion, 'reference.v1', 'response.apiVersion'),
    coordinateFrame: literal(source.coordinateFrame, 'shared-baseline', 'response.coordinateFrame'),
    extractorVersion: literal(source.extractorVersion, FINAL_COMPONENT_EXTRACTOR_VERSION, 'response.extractorVersion'),
    roleDefinitionVersion: literal(source.roleDefinitionVersion, FINAL_COMPONENT_ROLE_DEFINITION_VERSION, 'response.roleDefinitionVersion'),
    medialAnchorExtractorVersion: literal(source.medialAnchorExtractorVersion, FINAL_COMPONENT_MEDIAL_ANCHOR_VERSION, 'response.medialAnchorExtractorVersion'),
    source: {
      candidateArtifactSha256: sha256(sourceArtifact.candidateArtifactSha256, 'response.source.candidateArtifactSha256'),
      candidateIdentitySha256: sha256(sourceArtifact.candidateIdentitySha256, 'response.source.candidateIdentitySha256'),
      verification: {
        state: literal(verification.state, 'verified', 'response.source.verification.state'),
        reviewedAt,
        reviewedBy: text(verification.reviewedBy, 'response.source.verification.reviewedBy'),
      },
    },
    font,
    cases,
  }
}

export function finalComponentDisplayCaseMatchesOutline(
  candidate: FinalComponentDisplayCase,
  pathSha256: string,
): boolean {
  return candidate.identity.pathSha256 === pathSha256
}

export function isFinalComponentDisplayCandidate(
  candidate: FinalComponentDisplayCase | null | undefined,
): candidate is FinalComponentDisplayCandidateCase {
  return candidate?.state === 'candidate'
}

export function finalComponentDisplaySourceIsVerified(
  response: FinalComponentDisplayResponse,
): boolean {
  return response.source.verification.state === 'verified'
}

export type FinalComponentDisplayInputCase = Pick<FinalComponentCase['identity'], 'character' | 'initialJamo' | 'medialJamo' | 'finalJamo' | 'contextId'>
