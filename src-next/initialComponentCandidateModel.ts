import contractSource from '../reference-data/font-guide-calibrations/initial-component-p0-contract.v2.json'
import { CHOSEONG_LIST, JUNGSEONG_LIST, JONGSEONG_LIST } from '../src/data/Hangul'

export type InitialComponentBoundSide = 'top' | 'bottom' | 'left' | 'right'
export type InitialComponentOrientation = 'vertical' | 'horizontal'
export type InitialComponentContextId = 'right' | 'right-final' | 'bottom' | 'bottom-final' | 'mixed' | 'mixed-final'
export type InitialComponentReasonCode = 'glyph-missing' | 'medial-anchor-unavailable' | 'ambiguous-component-group' | 'merged-jamo-boundary' | 'invalid-component-bounds' | 'no-axis-face' | 'role-face-unavailable'
export type InitialComponentRoleClass = 'full-component' | 'first-main-horizontal' | 'paired-first-main-horizontal' | 'marked-body-horizontal'
export type InitialComponentRoleFaceSelectionRule = 'component-ink-extremum' | 'first-main-horizontal-endpoint' | 'paired-first-main-horizontal-endpoint' | 'body-main-horizontal-endpoint'

export const INITIAL_COMPONENT_RESPONSE_SCHEMA = 'reference-initial-component-candidate-response-v2' as const
export const INITIAL_COMPONENT_EXTRACTOR_VERSION = 'initial-component-matcher-v3' as const
export const INITIAL_COMPONENT_ROLE_DEFINITION_VERSION = 'initial-component-role-v2' as const
export const INITIAL_COMPONENT_MEDIAL_ANCHOR_VERSION = 'geometric-role-matcher-v9' as const

interface InitialComponentP0Context {
  id: InitialComponentContextId
  medialJamo: 'ㅏ' | 'ㅗ' | 'ㅘ'
  finalJamo: null | 'ㄱ'
  scanOrigin: 'medial-outer-pillar' | 'medial-primary-beam' | 'medial-base-beam-and-outer-pillar'
  scanDirection: 'right-to-left' | 'right-to-left-and-upper-cluster' | 'bottom-to-top' | 'anchor-to-upper-left'
}

interface InitialComponentContract {
  schema: 'initial-component-p0-contract-v2'
  version: 2
  responseSchema: typeof INITIAL_COMPONENT_RESPONSE_SCHEMA
  extractorVersion: typeof INITIAL_COMPONENT_EXTRACTOR_VERSION
  roleDefinitionVersion: typeof INITIAL_COMPONENT_ROLE_DEFINITION_VERSION
  medialAnchorExtractorVersion: typeof INITIAL_COMPONENT_MEDIAL_ANCHOR_VERSION
  coordinateFrame: 'shared-baseline'
  groupingMethod: 'medial-anchored-component-grouping-v1'
  boundMethod: 'bezier-ink-extremum-v1'
  roleFaceMethod: 'initial-structure-role-face-v2'
  selectionAreaMethod: 'derived-four-role-faces-v2'
  selectionRules: readonly InitialComponentGroupEvidence['selectionRule'][]
  roleFaceSelectionRules: readonly InitialComponentRoleFaceSelectionRule[]
  roleClasses: readonly {
    id: InitialComponentRoleClass
    initialJamos: readonly (typeof CHOSEONG_LIST)[number][]
    horizontalRule: InitialComponentRoleFaceSelectionRule
  }[]
  initialJamos: readonly (typeof CHOSEONG_LIST)[number][]
  boundSides: readonly InitialComponentBoundSide[]
  reasonCodes: readonly InitialComponentReasonCode[]
  contexts: readonly InitialComponentP0Context[]
}

export const INITIAL_COMPONENT_P0_CONTRACT = contractSource as InitialComponentContract

export interface InitialComponentCommonEvidence {
  source: 'actual-glyph-outline'
  medialAnchorExtractorVersion: typeof INITIAL_COMPONENT_MEDIAL_ANCHOR_VERSION
}

export type InitialComponentObservation<T, Evidence extends InitialComponentCommonEvidence> = {
  status: 'candidate'
  value: T
  evidence: Evidence
} | {
  status: 'abstained'
  reasonCode: InitialComponentReasonCode
  evidence: InitialComponentCommonEvidence
}

export interface InitialComponentGroupValue {
  contourIds: readonly number[]
  holeContourIds: readonly number[]
  selectedPathSha256: string
}

export interface InitialComponentGroupEvidence extends InitialComponentCommonEvidence {
  method: 'medial-anchored-component-grouping-v1'
  scanOrigin: InitialComponentP0Context['scanOrigin']
  scanDirection: InitialComponentP0Context['scanDirection']
  selectionRule: 'context-directed-contour-islands' | 'context-directed-merged-boundary'
  score: number
  margin: number
}

export interface InitialComponentBoundEvidence extends InitialComponentCommonEvidence {
  method: 'bezier-ink-extremum-v1'
  side: InitialComponentBoundSide
  contourIds: readonly number[]
}

export interface InitialComponentSpan {
  from: number
  to: number
}

export interface InitialComponentAxisFace {
  orientation: InitialComponentOrientation
  side: InitialComponentBoundSide
  value: number
  visibleSpans: readonly InitialComponentSpan[]
  contourId: number
  segmentIds: readonly number[]
}

export interface InitialComponentAxisFaceEvidence extends InitialComponentCommonEvidence {
  method: 'selected-component-axis-face-v1'
  side: InitialComponentBoundSide
}

export interface InitialComponentRoleFaceEvidence extends InitialComponentCommonEvidence {
  method: 'initial-structure-role-face-v2'
  side: InitialComponentBoundSide
  roleClass: InitialComponentRoleClass
  selectionRule: InitialComponentRoleFaceSelectionRule
  sourceSide: InitialComponentBoundSide
  sourceValues: readonly number[]
  contourIds: readonly number[]
  segmentIds: readonly number[]
  sourceSpans: readonly InitialComponentSpan[]
}

export interface InitialComponentSelectionArea {
  x: number
  y: number
  width: number
  height: number
}

export interface InitialComponentSelectionAreaEvidence extends InitialComponentCommonEvidence {
  method: 'derived-four-role-faces-v2'
  derivedFrom: readonly ['top', 'bottom', 'left', 'right']
}

export interface InitialComponentCandidateCase {
  character: string
  initialJamo: (typeof CHOSEONG_LIST)[number]
  medialJamo: 'ㅏ' | 'ㅗ' | 'ㅘ'
  finalJamo: null | 'ㄱ'
  contextId: InitialComponentContextId
  status: 'candidate'
  glyphName: string
  pathSha256: string
  componentGroup: InitialComponentObservation<InitialComponentGroupValue, InitialComponentGroupEvidence>
  inkBounds: Record<InitialComponentBoundSide, InitialComponentObservation<number, InitialComponentBoundEvidence>>
  axisFaces: Record<InitialComponentBoundSide, InitialComponentObservation<readonly InitialComponentAxisFace[], InitialComponentAxisFaceEvidence>>
  roleFaces: Record<InitialComponentBoundSide, InitialComponentObservation<number, InitialComponentRoleFaceEvidence>>
  selectionArea: InitialComponentObservation<InitialComponentSelectionArea, InitialComponentSelectionAreaEvidence>
}

export interface InitialComponentMissingCase {
  character: string
  initialJamo: (typeof CHOSEONG_LIST)[number]
  medialJamo: 'ㅏ' | 'ㅗ' | 'ㅘ'
  finalJamo: null | 'ㄱ'
  contextId: InitialComponentContextId
  status: 'abstained'
  reasonCode: 'glyph-missing'
}

export type InitialComponentCase = InitialComponentCandidateCase | InitialComponentMissingCase

export interface InitialComponentCandidateResponse {
  schema: typeof INITIAL_COMPONENT_RESPONSE_SCHEMA
  apiVersion: 'reference.v1'
  extractorVersion: typeof INITIAL_COMPONENT_EXTRACTOR_VERSION
  roleDefinitionVersion: typeof INITIAL_COMPONENT_ROLE_DEFINITION_VERSION
  medialAnchorExtractorVersion: typeof INITIAL_COMPONENT_MEDIAL_ANCHOR_VERSION
  coordinateFrame: 'shared-baseline'
  matching: 'medial-anchored-component-grouping'
  font: {
    id: string
    fileSha256: string
    axes: Readonly<Record<string, number>>
  }
  cases: readonly InitialComponentCase[]
}

export interface InitialComponentRequestCase {
  character: string
  initialJamo: (typeof CHOSEONG_LIST)[number]
  medialJamo: 'ㅏ' | 'ㅗ' | 'ㅘ'
  finalJamo: null | 'ㄱ'
  contextId: InitialComponentContextId
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

function commonEvidence(value: unknown, location: string): InitialComponentCommonEvidence {
  const source = record(value, location)
  return {
    source: literal(source.source, 'actual-glyph-outline', `${location}.source`),
    medialAnchorExtractorVersion: literal(source.medialAnchorExtractorVersion, INITIAL_COMPONENT_MEDIAL_ANCHOR_VERSION, `${location}.medialAnchorExtractorVersion`),
  }
}

function abstained<T>(source: Record<string, unknown>, location: string): InitialComponentObservation<T, never> {
  return {
    status: literal(source.status, 'abstained', `${location}.status`),
    reasonCode: enumValue(source.reasonCode, INITIAL_COMPONENT_P0_CONTRACT.reasonCodes, `${location}.reasonCode`),
    evidence: commonEvidence(source.evidence, `${location}.evidence`),
  }
}

function parseIdArray(value: unknown, location: string, allowEmpty = false): number[] {
  const values = array(value, location).map((item, index) => integer(item, `${location}[${index}]`))
  if (!allowEmpty && values.length === 0) throw new Error(`${location}: 비어 있지 않아야 합니다.`)
  if (new Set(values).size !== values.length) throw new Error(`${location}: 중복 ID가 있습니다.`)
  return values
}

function parseComponentGroup(value: unknown, location: string): InitialComponentCandidateCase['componentGroup'] {
  const source = record(value, location)
  if (source.status !== 'candidate') return abstained(source, location)
  const candidate = record(source.value, `${location}.value`)
  const evidenceSource = record(source.evidence, `${location}.evidence`)
  const contourIds = parseIdArray(candidate.contourIds, `${location}.value.contourIds`)
  const holeContourIds = parseIdArray(candidate.holeContourIds, `${location}.value.holeContourIds`, true)
  if (holeContourIds.some((id) => !contourIds.includes(id))) throw new Error(`${location}.value.holeContourIds: contourIds의 부분집합이어야 합니다.`)
  return {
    status: 'candidate',
    value: { contourIds, holeContourIds, selectedPathSha256: sha256(candidate.selectedPathSha256, `${location}.value.selectedPathSha256`) },
    evidence: {
      ...commonEvidence(evidenceSource, `${location}.evidence`),
      method: literal(evidenceSource.method, INITIAL_COMPONENT_P0_CONTRACT.groupingMethod, `${location}.evidence.method`),
      scanOrigin: enumValue(evidenceSource.scanOrigin, INITIAL_COMPONENT_P0_CONTRACT.contexts.map(({ scanOrigin }) => scanOrigin), `${location}.evidence.scanOrigin`),
      scanDirection: enumValue(evidenceSource.scanDirection, INITIAL_COMPONENT_P0_CONTRACT.contexts.map(({ scanDirection }) => scanDirection), `${location}.evidence.scanDirection`),
      selectionRule: enumValue(evidenceSource.selectionRule, INITIAL_COMPONENT_P0_CONTRACT.selectionRules, `${location}.evidence.selectionRule`),
      score: finite(evidenceSource.score, `${location}.evidence.score`),
      margin: finite(evidenceSource.margin, `${location}.evidence.margin`),
    },
  }
}

function parseBound(value: unknown, side: InitialComponentBoundSide, location: string): InitialComponentCandidateCase['inkBounds'][InitialComponentBoundSide] {
  const source = record(value, location)
  if (source.status !== 'candidate') return abstained(source, location)
  const evidenceSource = record(source.evidence, `${location}.evidence`)
  return {
    status: 'candidate',
    value: finite(source.value, `${location}.value`),
    evidence: {
      ...commonEvidence(evidenceSource, `${location}.evidence`),
      method: literal(evidenceSource.method, INITIAL_COMPONENT_P0_CONTRACT.boundMethod, `${location}.evidence.method`),
      side: literal(evidenceSource.side, side, `${location}.evidence.side`),
      contourIds: parseIdArray(evidenceSource.contourIds, `${location}.evidence.contourIds`),
    },
  }
}

function parseSpan(value: unknown, location: string): InitialComponentSpan {
  const source = record(value, location)
  const from = finite(source.from, `${location}.from`)
  const to = finite(source.to, `${location}.to`)
  if (from >= to) throw new Error(`${location}: from은 to보다 작아야 합니다.`)
  return { from, to }
}

function parseAxisFaces(value: unknown, side: InitialComponentBoundSide, location: string): InitialComponentCandidateCase['axisFaces'][InitialComponentBoundSide] {
  const source = record(value, location)
  if (source.status !== 'candidate') return abstained(source, location)
  const evidenceSource = record(source.evidence, `${location}.evidence`)
  const faces = array(source.value, `${location}.value`).map((face, index) => {
    const item = record(face, `${location}.value[${index}]`)
    const orientation = enumValue(item.orientation, ['vertical', 'horizontal'] as const, `${location}.value[${index}].orientation`)
    const parsedSide = literal(item.side, side, `${location}.value[${index}].side`)
    if ((orientation === 'vertical') !== (parsedSide === 'left' || parsedSide === 'right')) throw new Error(`${location}.value[${index}]: orientation과 side 축이 다릅니다.`)
    const visibleSpans = array(item.visibleSpans, `${location}.value[${index}].visibleSpans`).map((span, spanIndex) => parseSpan(span, `${location}.value[${index}].visibleSpans[${spanIndex}]`))
    if (visibleSpans.length === 0) throw new Error(`${location}.value[${index}].visibleSpans: 비어 있지 않아야 합니다.`)
    return {
      orientation,
      side: parsedSide,
      value: finite(item.value, `${location}.value[${index}].value`),
      visibleSpans,
      contourId: integer(item.contourId, `${location}.value[${index}].contourId`),
      segmentIds: parseIdArray(item.segmentIds, `${location}.value[${index}].segmentIds`),
    }
  })
  if (faces.length === 0) throw new Error(`${location}.value: 비어 있으면 no-axis-face로 포기해야 합니다.`)
  return {
    status: 'candidate',
    value: faces,
    evidence: {
      ...commonEvidence(evidenceSource, `${location}.evidence`),
      method: literal(evidenceSource.method, 'selected-component-axis-face-v1', `${location}.evidence.method`),
      side: literal(evidenceSource.side, side, `${location}.evidence.side`),
    },
  }
}

function parseRoleFace(value: unknown, side: InitialComponentBoundSide, location: string): InitialComponentCandidateCase['roleFaces'][InitialComponentBoundSide] {
  const source = record(value, location)
  if (source.status !== 'candidate') return abstained(source, location)
  const evidenceSource = record(source.evidence, `${location}.evidence`)
  const sourceValues = array(evidenceSource.sourceValues, `${location}.evidence.sourceValues`).map((item, index) => finite(item, `${location}.evidence.sourceValues[${index}]`))
  if (sourceValues.length === 0) throw new Error(`${location}.evidence.sourceValues: 비어 있지 않아야 합니다.`)
  return {
    status: 'candidate',
    value: finite(source.value, `${location}.value`),
    evidence: {
      ...commonEvidence(evidenceSource, `${location}.evidence`),
      method: literal(evidenceSource.method, INITIAL_COMPONENT_P0_CONTRACT.roleFaceMethod, `${location}.evidence.method`),
      side: literal(evidenceSource.side, side, `${location}.evidence.side`),
      roleClass: enumValue(evidenceSource.roleClass, INITIAL_COMPONENT_P0_CONTRACT.roleClasses.map(({ id }) => id), `${location}.evidence.roleClass`),
      selectionRule: enumValue(evidenceSource.selectionRule, INITIAL_COMPONENT_P0_CONTRACT.roleFaceSelectionRules, `${location}.evidence.selectionRule`),
      sourceSide: enumValue(evidenceSource.sourceSide, INITIAL_COMPONENT_P0_CONTRACT.boundSides, `${location}.evidence.sourceSide`),
      sourceValues,
      contourIds: parseIdArray(evidenceSource.contourIds, `${location}.evidence.contourIds`),
      segmentIds: parseIdArray(evidenceSource.segmentIds, `${location}.evidence.segmentIds`, true),
      sourceSpans: array(evidenceSource.sourceSpans, `${location}.evidence.sourceSpans`).map((span, index) => parseSpan(span, `${location}.evidence.sourceSpans[${index}]`)),
    },
  }
}

function parseSelectionArea(value: unknown, location: string): InitialComponentCandidateCase['selectionArea'] {
  const source = record(value, location)
  if (source.status !== 'candidate') return abstained(source, location)
  const candidate = record(source.value, `${location}.value`)
  const evidenceSource = record(source.evidence, `${location}.evidence`)
  const derivedFrom = array(evidenceSource.derivedFrom, `${location}.evidence.derivedFrom`)
  if (derivedFrom.join(',') !== 'top,bottom,left,right') throw new Error(`${location}.evidence.derivedFrom: 네 경계 순서가 필요합니다.`)
  const width = finite(candidate.width, `${location}.value.width`)
  const height = finite(candidate.height, `${location}.value.height`)
  if (width <= 0 || height <= 0) throw new Error(`${location}.value: 양의 너비·높이가 필요합니다.`)
  return {
    status: 'candidate',
    value: { x: finite(candidate.x, `${location}.value.x`), y: finite(candidate.y, `${location}.value.y`), width, height },
    evidence: {
      ...commonEvidence(evidenceSource, `${location}.evidence`),
      method: literal(evidenceSource.method, INITIAL_COMPONENT_P0_CONTRACT.selectionAreaMethod, `${location}.evidence.method`),
      derivedFrom: ['top', 'bottom', 'left', 'right'],
    },
  }
}

function expectedContext(initialJamo: string, medialJamo: string, finalJamo: string | null, character: string, contextId: string, location: string): InitialComponentP0Context {
  const context = INITIAL_COMPONENT_P0_CONTRACT.contexts.find((item) => item.id === contextId)
  if (!context || context.medialJamo !== medialJamo || context.finalJamo !== finalJamo) throw new Error(`${location}: P0 6문맥 identity가 맞지 않습니다.`)
  const code = character.codePointAt(0)
  if (code === undefined || code < 0xac00 || code > 0xd7a3) throw new Error(`${location}.character: 현대 한글 음절이 필요합니다.`)
  const offset = code - 0xac00
  if (CHOSEONG_LIST[Math.floor(offset / 588)] !== initialJamo || JUNGSEONG_LIST[Math.floor((offset % 588) / 28)] !== medialJamo || (JONGSEONG_LIST[offset % 28] || null) !== finalJamo) {
    throw new Error(`${location}: character와 자모 identity가 맞지 않습니다.`)
  }
  return context
}

function parseCase(value: unknown, location: string): InitialComponentCase {
  const source = record(value, location)
  for (const forbidden of ['roi', 'initialTop', 'initialBottom', 'initialLeft', 'initialRight', 'legacyGuides']) {
    if (forbidden in source) throw new Error(`${location}.${forbidden}: 탐색 ROI·레거시 기준값을 응답에 넣을 수 없습니다.`)
  }
  const character = text(source.character, `${location}.character`)
  const initialJamo = enumValue(source.initialJamo, CHOSEONG_LIST, `${location}.initialJamo`)
  const medialJamo = enumValue(source.medialJamo, ['ㅏ', 'ㅗ', 'ㅘ'] as const, `${location}.medialJamo`)
  const finalJamo = source.finalJamo === null ? null : literal(source.finalJamo, 'ㄱ', `${location}.finalJamo`)
  const contextId = enumValue(source.contextId, INITIAL_COMPONENT_P0_CONTRACT.contexts.map(({ id }) => id), `${location}.contextId`)
  expectedContext(initialJamo, medialJamo, finalJamo, character, contextId, location)
  const shared = { character, initialJamo, medialJamo, finalJamo, contextId }
  if (source.status === 'abstained') return { ...shared, status: 'abstained', reasonCode: literal(source.reasonCode, 'glyph-missing', `${location}.reasonCode`) }
  literal(source.status, 'candidate', `${location}.status`)
  const boundsSource = record(source.inkBounds, `${location}.inkBounds`)
  const facesSource = record(source.axisFaces, `${location}.axisFaces`)
  const roleFacesSource = record(source.roleFaces, `${location}.roleFaces`)
  const inkBounds = Object.fromEntries(INITIAL_COMPONENT_P0_CONTRACT.boundSides.map((side) => [side, parseBound(boundsSource[side], side, `${location}.inkBounds.${side}`)])) as InitialComponentCandidateCase['inkBounds']
  const axisFaces = Object.fromEntries(INITIAL_COMPONENT_P0_CONTRACT.boundSides.map((side) => [side, parseAxisFaces(facesSource[side], side, `${location}.axisFaces.${side}`)])) as InitialComponentCandidateCase['axisFaces']
  const roleFaces = Object.fromEntries(INITIAL_COMPONENT_P0_CONTRACT.boundSides.map((side) => [side, parseRoleFace(roleFacesSource[side], side, `${location}.roleFaces.${side}`)])) as InitialComponentCandidateCase['roleFaces']
  const componentGroup = parseComponentGroup(source.componentGroup, `${location}.componentGroup`)
  const roleSpec = INITIAL_COMPONENT_P0_CONTRACT.roleClasses.find(({ initialJamos }) => initialJamos.includes(initialJamo))
  if (!roleSpec) throw new Error(`${location}.roleFaces: 역할 구조 클래스가 없습니다.`)
  for (const side of INITIAL_COMPONENT_P0_CONTRACT.boundSides) {
    const roleFace = roleFaces[side]
    if (roleFace.status !== 'candidate') continue
    const expectedRule = side === 'top' || side === 'bottom' ? 'component-ink-extremum' : roleSpec.horizontalRule
    if (roleFace.evidence.roleClass !== roleSpec.id || roleFace.evidence.selectionRule !== expectedRule) throw new Error(`${location}.roleFaces.${side}: 첫닿 역할 구조 클래스·선택 규칙이 다릅니다.`)
    const expectedSourceSide = expectedRule === 'component-ink-extremum' ? side : 'top'
    if (roleFace.evidence.sourceSide !== expectedSourceSide) throw new Error(`${location}.roleFaces.${side}: 역할 단면 출처 방향이 다릅니다.`)
    const bound = inkBounds[side]
    if (bound.status === 'candidate' && expectedRule === 'component-ink-extremum' && Math.abs(roleFace.value - bound.value) > 1e-6) throw new Error(`${location}.roleFaces.${side}: 잉크 극값 역할 단면이 원시 경계와 다릅니다.`)
  }
  const leftRole = roleFaces.left
  const rightRole = roleFaces.right
  if (leftRole.status === 'candidate' && leftRole.evidence.selectionRule !== 'component-ink-extremum') {
    if (leftRole.evidence.sourceSpans.length === 0 || Math.abs(leftRole.value - Math.min(...leftRole.evidence.sourceSpans.map(({ from }) => from))) > 1e-6) throw new Error(`${location}.roleFaces.left: 기준 가로획 시작점과 다릅니다.`)
  }
  if (rightRole.status === 'candidate' && rightRole.evidence.selectionRule !== 'component-ink-extremum') {
    if (rightRole.evidence.sourceSpans.length === 0 || Math.abs(rightRole.value - Math.max(...rightRole.evidence.sourceSpans.map(({ to }) => to))) > 1e-6) throw new Error(`${location}.roleFaces.right: 기준 가로획 끝점과 다릅니다.`)
  }
  const selectionArea = parseSelectionArea(source.selectionArea, `${location}.selectionArea`)
  if (selectionArea.status === 'candidate') {
    if (componentGroup.status !== 'candidate' || INITIAL_COMPONENT_P0_CONTRACT.boundSides.some((side) => roleFaces[side].status !== 'candidate')) throw new Error(`${location}.selectionArea: componentGroup과 네 역할 단면 후보가 필요합니다.`)
    const top = roleFaces.top.status === 'candidate' ? roleFaces.top.value : 0
    const bottom = roleFaces.bottom.status === 'candidate' ? roleFaces.bottom.value : 0
    const left = roleFaces.left.status === 'candidate' ? roleFaces.left.value : 0
    const right = roleFaces.right.status === 'candidate' ? roleFaces.right.value : 0
    const expected = { x: left, y: top, width: right - left, height: bottom - top }
    if (Object.entries(expected).some(([key, expectedValue]) => Math.abs(selectionArea.value[key as keyof InitialComponentSelectionArea] - expectedValue) > 1e-6)) throw new Error(`${location}.selectionArea: 네 역할 단면의 정확한 파생값이어야 합니다.`)
  }
  return {
    ...shared,
    status: 'candidate',
    glyphName: text(source.glyphName, `${location}.glyphName`),
    pathSha256: sha256(source.pathSha256, `${location}.pathSha256`),
    componentGroup,
    inkBounds,
    axisFaces,
    roleFaces,
    selectionArea,
  }
}

export function parseInitialComponentCandidateCase(value: unknown): InitialComponentCase {
  return parseCase(value, 'initial component candidate case')
}

export function buildInitialComponentP0Cases(): readonly InitialComponentRequestCase[] {
  return CHOSEONG_LIST.flatMap((initialJamo, initialIndex) => INITIAL_COMPONENT_P0_CONTRACT.contexts.map((context) => ({
    character: String.fromCodePoint(0xac00 + initialIndex * 588 + JUNGSEONG_LIST.indexOf(context.medialJamo) * 28 + (context.finalJamo === null ? 0 : 1)),
    initialJamo,
    medialJamo: context.medialJamo,
    finalJamo: context.finalJamo,
    contextId: context.id,
  })))
}

export function parseInitialComponentCandidateResponse(value: unknown): InitialComponentCandidateResponse {
  const source = record(value, 'initial component response')
  const font = record(source.font, 'initial component response.font')
  const axes = record(font.axes, 'initial component response.font.axes')
  const cases = array(source.cases, 'initial component response.cases').map((item, index) => parseCase(item, `initial component response.cases[${index}]`))
  if (cases.length === 0) throw new Error('initial component response.cases: 비어 있지 않아야 합니다.')
  if (new Set(cases.map(({ character }) => character)).size !== cases.length) throw new Error('initial component response.cases: character가 중복됐습니다.')
  return {
    schema: literal(source.schema, INITIAL_COMPONENT_RESPONSE_SCHEMA, 'initial component response.schema'),
    apiVersion: literal(source.apiVersion, 'reference.v1', 'initial component response.apiVersion'),
    extractorVersion: literal(source.extractorVersion, INITIAL_COMPONENT_EXTRACTOR_VERSION, 'initial component response.extractorVersion'),
    roleDefinitionVersion: literal(source.roleDefinitionVersion, INITIAL_COMPONENT_ROLE_DEFINITION_VERSION, 'initial component response.roleDefinitionVersion'),
    medialAnchorExtractorVersion: literal(source.medialAnchorExtractorVersion, INITIAL_COMPONENT_MEDIAL_ANCHOR_VERSION, 'initial component response.medialAnchorExtractorVersion'),
    coordinateFrame: literal(source.coordinateFrame, 'shared-baseline', 'initial component response.coordinateFrame'),
    matching: literal(source.matching, 'medial-anchored-component-grouping', 'initial component response.matching'),
    font: {
      id: text(font.id, 'initial component response.font.id'),
      fileSha256: sha256(font.fileSha256, 'initial component response.font.fileSha256'),
      axes: Object.fromEntries(Object.entries(axes).map(([tag, axisValue]) => [tag, finite(axisValue, `initial component response.font.axes.${tag}`)])),
    },
    cases,
  }
}
