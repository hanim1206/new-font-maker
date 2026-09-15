import rawManifest from '../reference-data/preset-candidates/neutral-gothic-noto-seed-v0.source.v1.json' with { type: 'json' }
import { CHOSEONG_LIST, JUNGSEONG_LIST } from '../src/data/Hangul'
import type { GlobalStyle } from '../src/stores/globalStyleStore'
import type { LayoutType } from '../src/types'
import type {
  MedialFaceElementId,
  MedialFaceOrientation,
  MedialFaceReasonCode,
  MedialFaceReferenceMode,
  MedialFaceSide,
  MedialFaceSpan,
} from './medialGuideCandidateModel'

export type PresetSourceClass = 'approved-analysis' | 'automatic-candidate'
export type PresetReviewStatus = 'user-approved-analysis' | 'user-approved-candidate'

interface PresetCandidateFace {
  status: 'candidate'
  value: number
  referenceMode: MedialFaceReferenceMode
  referenceSide?: 'left' | 'right'
  anchor?: { x: number; y: number }
  maximumDeviation?: number
  evidence?: Readonly<Record<string, unknown>>
}

interface PresetAbstainedFace {
  status: 'abstained'
  reasonCode: MedialFaceReasonCode
  referenceMode?: MedialFaceReferenceMode
  evidence?: Readonly<Record<string, unknown>>
}

interface PresetCandidateSpans {
  status: 'candidate'
  value: readonly MedialFaceSpan[]
  evidence?: Readonly<Record<string, unknown>>
}

interface PresetAbstainedSpans {
  status: 'abstained'
  reasonCode: MedialFaceReasonCode
  evidence?: Readonly<Record<string, unknown>>
}

export interface PresetSourceElement {
  elementId: MedialFaceElementId
  orientation: MedialFaceOrientation
  faceSide: MedialFaceSide
  face: PresetCandidateFace | PresetAbstainedFace
  visibleSpans: PresetCandidateSpans | PresetAbstainedSpans
  componentSpans?: readonly MedialFaceSpan[]
  derived?: { extent: number | null; visibleLength: number }
  match?: {
    status: 'matched' | 'abstained'
    score: number | null
    confidence: 'high' | 'medium' | 'abstained'
    margin: number | null
  }
  provenance: {
    sourceId: string
    sourceClass: PresetSourceClass
    reviewStatus: PresetReviewStatus
    extractorVersion: string
    roleDefinitionVersion: string
  }
}

export interface PresetSourceCase {
  character: string
  initialJamo: 'ㄱ'
  medialJamo: (typeof JUNGSEONG_LIST)[number]
  finalJamo: null | 'ㄱ'
  sourceClass: PresetSourceClass
  reviewStatus: PresetReviewStatus
  productionEligible: false
  elements: readonly PresetSourceElement[]
}

export interface PresetSourceManifest {
  schema: 'preset-source-manifest-v1'
  version: 1
  id: 'neutral-gothic-noto-seed-v0'
  label: string
  status: 'analysis-review-candidate'
  productionEligible: false
  coordinateFrame: { id: 'shared-baseline'; unitsPerEm: 1000; baselineY: 880 }
  font: {
    id: 'noto-sans-kr'
    family: 'Noto Sans KR'
    fileSha256: string
    axes: { wght: 400 }
  }
  scope: {
    medialObservationInitialJamo: 'ㄱ'
    medials: readonly (typeof JUNGSEONG_LIST)[number][]
    finalJamos: readonly [null, 'ㄱ']
    characterCount: 42
    legacyConsonantInitialJamos: readonly (typeof CHOSEONG_LIST)[number][]
    legacyConsonantContextCount: 114
  }
  policy: {
    invalidExtractorVersions: readonly string[]
    promotion: 'explicit-user-approval-only'
  }
  sourceDigests: Readonly<Record<string, string>>
  currentBaseline: {
    sourceClass: 'current-fallback'
    storageInput: 'excluded'
    digest: string
    jamos: { basePath: string; overridePath: string }
    layouts: {
      basePath: string
      calculatorPath: string
      legacyProfilePath: string
      mutableLayoutTypes: readonly LayoutType[]
      frozenLayoutTypes: readonly LayoutType[]
    }
    globalStyle: { sourcePath: string; value: GlobalStyle }
  }
  inputDigest: string
  legacyConsonants: {
    sourceId: 'legacy-noto-initial-v1'
    sourceClass: 'provisional-legacy'
    reviewStatus: 'provisional'
    initialJamos: readonly (typeof CHOSEONG_LIST)[number][]
    contextOrder: readonly { id: string; guideOrder: readonly string[] }[]
    values: Readonly<Record<string, readonly (readonly number[])[]>>
  }
  caseCounts: { approvedAnalysis: 14; automaticCandidate: 28; userApprovedCandidate: 28 }
  cases: readonly PresetSourceCase[]
}

const EXPECTED_FONT_SHA256 = '194018e6b2b293a7964f037b25c0249ce1418bc9ab3c971060a03aa57861e252'
const EXPECTED_P1_FULL_SHA256 = '1d0f813107f0a9d88444f93006359353c3b8a2728e8ef10cade2078876b02305'
const INVALID_EXTRACTOR_VERSIONS = ['geometric-role-matcher-v4', 'geometric-role-matcher-v6', 'geometric-role-matcher-v7', 'geometric-role-matcher-v8'] as const
const MUTABLE_LAYOUT_TYPES = [
  'choseong-jungseong-vertical',
  'choseong-jungseong-horizontal',
  'choseong-jungseong-mixed',
  'choseong-jungseong-vertical-jongseong',
  'choseong-jungseong-horizontal-jongseong',
  'choseong-jungseong-mixed-jongseong',
] as const
const FROZEN_LAYOUT_TYPES = [
  'choseong-only',
  'jungseong-vertical-only',
  'jungseong-horizontal-only',
  'jungseong-mixed-only',
] as const
const REQUIRED_SOURCE_DIGESTS = [
  'font',
  'legacy',
  'gold',
  'p1Report',
  'p1Full',
  'p1RawAnchor',
  'invalidV4',
  'invalidV6',
  'invalidV7',
  'invalidV8',
  'baseJamos',
  'userPreset01',
  'basePresets',
  'layoutCalculator',
  'legacyLayoutProfile',
  'globalStyleStore',
] as const
const ELEMENT_IDS = ['innerPillar', 'outerPillar', 'primaryBeam', 'baseStem', 'leftStem', 'rightStem', 'upperBeam', 'lowerBeam'] as const
const REASON_CODES = ['glyph-missing', 'no-role-match', 'ambiguous-role-match', 'non-scalar-face', 'occluded-by-neighbor-overlap'] as const

function record(value: unknown, location: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${location}: 객체가 필요합니다.`)
  return value as Record<string, unknown>
}

function array(value: unknown, location: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${location}: 배열이 필요합니다.`)
  return value
}

function literal<T extends string | number | boolean | null>(value: unknown, expected: T, location: string): T {
  if (value !== expected) throw new Error(`${location}: ${String(expected)}가 필요합니다.`)
  return expected
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], location: string): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) throw new Error(`${location}: 지원하지 않는 값입니다.`)
  return value as T
}

function finite(value: unknown, location: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${location}: 유한한 숫자가 필요합니다.`)
  return value
}

function stringValue(value: unknown, location: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${location}: 문자열이 필요합니다.`)
  return value
}

function sha256Value(value: unknown, location: string): string {
  const digest = stringValue(value, location)
  if (!/^[0-9a-f]{64}$/u.test(digest)) throw new Error(`${location}: SHA-256이 필요합니다.`)
  return digest
}

function exactStringArray(value: unknown, expected: readonly string[], location: string): void {
  const values = array(value, location)
  if (values.length !== expected.length || values.some((item, index) => item !== expected[index])) {
    throw new Error(`${location}: 고정 순서가 다릅니다.`)
  }
}

function validateCurrentBaseline(value: unknown): void {
  const baseline = record(value, 'preset source.currentBaseline')
  literal(baseline.sourceClass, 'current-fallback', 'preset source.currentBaseline.sourceClass')
  literal(baseline.storageInput, 'excluded', 'preset source.currentBaseline.storageInput')
  sha256Value(baseline.digest, 'preset source.currentBaseline.digest')

  const jamos = record(baseline.jamos, 'preset source.currentBaseline.jamos')
  literal(jamos.basePath, 'src/data/baseJamos.json', 'preset source.currentBaseline.jamos.basePath')
  literal(jamos.overridePath, 'src-next/userPreset01.ts', 'preset source.currentBaseline.jamos.overridePath')

  const layouts = record(baseline.layouts, 'preset source.currentBaseline.layouts')
  literal(layouts.basePath, 'src/data/basePresets.json', 'preset source.currentBaseline.layouts.basePath')
  literal(layouts.calculatorPath, 'src/utils/layoutCalculator.ts', 'preset source.currentBaseline.layouts.calculatorPath')
  literal(layouts.legacyProfilePath, 'src/data/legacyCalibrationLayoutProfileV1.ts', 'preset source.currentBaseline.layouts.legacyProfilePath')
  exactStringArray(layouts.mutableLayoutTypes, MUTABLE_LAYOUT_TYPES, 'preset source.currentBaseline.layouts.mutableLayoutTypes')
  exactStringArray(layouts.frozenLayoutTypes, FROZEN_LAYOUT_TYPES, 'preset source.currentBaseline.layouts.frozenLayoutTypes')

  const globalStyle = record(baseline.globalStyle, 'preset source.currentBaseline.globalStyle')
  literal(globalStyle.sourcePath, 'src/stores/globalStyleStore.ts', 'preset source.currentBaseline.globalStyle.sourcePath')
  const style = record(globalStyle.value, 'preset source.currentBaseline.globalStyle.value')
  literal(style.slant, 0, 'preset source.currentBaseline.globalStyle.value.slant')
  literal(style.weight, 400, 'preset source.currentBaseline.globalStyle.value.weight')
  literal(style.letterSpacing, 0, 'preset source.currentBaseline.globalStyle.value.letterSpacing')
  literal(style.linecap, 'round', 'preset source.currentBaseline.globalStyle.value.linecap')
  literal(style.linejoin, 'round', 'preset source.currentBaseline.globalStyle.value.linejoin')
  const brush = record(style.brush, 'preset source.currentBaseline.globalStyle.value.brush')
  literal(brush.tip, 'round', 'preset source.currentBaseline.globalStyle.value.brush.tip')
  literal(brush.aspectRatio, 0.5, 'preset source.currentBaseline.globalStyle.value.brush.aspectRatio')
  literal(brush.angle, 0, 'preset source.currentBaseline.globalStyle.value.brush.angle')
  const strokeStyle = record(style.strokeStyle, 'preset source.currentBaseline.globalStyle.value.strokeStyle')
  literal(strokeStyle.mode, 'brush', 'preset source.currentBaseline.globalStyle.value.strokeStyle.mode')
  const strokeBrush = record(strokeStyle.brush, 'preset source.currentBaseline.globalStyle.value.strokeStyle.brush')
  literal(strokeBrush.tip, 'round', 'preset source.currentBaseline.globalStyle.value.strokeStyle.brush.tip')
  literal(strokeBrush.aspectRatio, 0.5, 'preset source.currentBaseline.globalStyle.value.strokeStyle.brush.aspectRatio')
  literal(strokeBrush.angle, 0, 'preset source.currentBaseline.globalStyle.value.strokeStyle.brush.angle')
}

function validateSpan(value: unknown, location: string): void {
  const span = record(value, location)
  const from = finite(span.from, `${location}.from`)
  const to = finite(span.to, `${location}.to`)
  if (from >= to) throw new Error(`${location}: from은 to보다 작아야 합니다.`)
}

function validateEvidence(value: unknown, location: string): void {
  const evidence = record(value, location)
  const extractorVersion = stringValue(evidence.method, `${location}.method`)
  if (INVALID_EXTRACTOR_VERSIONS.includes(extractorVersion as (typeof INVALID_EXTRACTOR_VERSIONS)[number])) {
    throw new Error(`${location}: 무효화된 extractor가 포함됐습니다.`)
  }
}

function validateElement(value: unknown, location: string, expectedClass: PresetSourceClass, expectedReview: PresetReviewStatus): void {
  const element = record(value, location)
  enumValue(element.elementId, ELEMENT_IDS, `${location}.elementId`)
  const orientation = enumValue(element.orientation, ['vertical', 'horizontal'] as const, `${location}.orientation`)
  const faceSide = enumValue(element.faceSide, ['left', 'right', 'top', 'bottom'] as const, `${location}.faceSide`)
  if ((orientation === 'vertical') !== (faceSide === 'left' || faceSide === 'right')) throw new Error(`${location}: orientation과 faceSide 축이 다릅니다.`)

  const face = record(element.face, `${location}.face`)
  if (face.status === 'candidate') {
    finite(face.value, `${location}.face.value`)
    enumValue(face.referenceMode, ['axis-aligned-face', 'start-side-local-tangent'] as const, `${location}.face.referenceMode`)
  } else {
    literal(face.status, 'abstained', `${location}.face.status`)
    enumValue(face.reasonCode, REASON_CODES, `${location}.face.reasonCode`)
  }
  if (face.evidence !== undefined) validateEvidence(face.evidence, `${location}.face.evidence`)

  const spans = record(element.visibleSpans, `${location}.visibleSpans`)
  if (spans.status === 'candidate') {
    const values = array(spans.value, `${location}.visibleSpans.value`)
    if (values.length === 0) throw new Error(`${location}.visibleSpans.value: 비어 있을 수 없습니다.`)
    values.forEach((span, index) => validateSpan(span, `${location}.visibleSpans.value[${index}]`))
  } else {
    literal(spans.status, 'abstained', `${location}.visibleSpans.status`)
    enumValue(spans.reasonCode, REASON_CODES, `${location}.visibleSpans.reasonCode`)
  }
  if (spans.evidence !== undefined) validateEvidence(spans.evidence, `${location}.visibleSpans.evidence`)

  const provenance = record(element.provenance, `${location}.provenance`)
  literal(provenance.sourceClass, expectedClass, `${location}.provenance.sourceClass`)
  literal(provenance.reviewStatus, expectedReview, `${location}.provenance.reviewStatus`)
  const extractorVersion = stringValue(provenance.extractorVersion, `${location}.provenance.extractorVersion`)
  if (INVALID_EXTRACTOR_VERSIONS.includes(extractorVersion as (typeof INVALID_EXTRACTOR_VERSIONS)[number])) {
    throw new Error(`${location}.provenance: 무효화된 extractor가 포함됐습니다.`)
  }
}

function expectedCharacter(medialJamo: string, finalJamo: null | 'ㄱ'): string {
  const medialIndex = (JUNGSEONG_LIST as readonly string[]).indexOf(medialJamo)
  if (medialIndex < 0) throw new Error(`지원하지 않는 홀자입니다: ${medialJamo}`)
  return String.fromCodePoint(0xac00 + medialIndex * 28 + (finalJamo === null ? 0 : 1))
}

function validateCase(value: unknown, index: number): void {
  const location = `preset source.cases[${index}]`
  const candidateCase = record(value, location)
  const character = stringValue(candidateCase.character, `${location}.character`)
  literal(candidateCase.initialJamo, 'ㄱ', `${location}.initialJamo`)
  const medialJamo = enumValue(candidateCase.medialJamo, JUNGSEONG_LIST, `${location}.medialJamo`)
  const finalJamo = candidateCase.finalJamo === null ? null : literal(candidateCase.finalJamo, 'ㄱ', `${location}.finalJamo`)
  const sourceClass = enumValue(candidateCase.sourceClass, ['approved-analysis', 'automatic-candidate'] as const, `${location}.sourceClass`)
  const reviewStatus = enumValue(candidateCase.reviewStatus, ['user-approved-analysis', 'user-approved-candidate'] as const, `${location}.reviewStatus`)
  if (sourceClass === 'approved-analysis' && reviewStatus !== 'user-approved-analysis') throw new Error(`${location}: 승인 골드의 검수 상태가 맞지 않습니다.`)
  if (sourceClass === 'automatic-candidate' && reviewStatus !== 'user-approved-candidate') throw new Error(`${location}: 자동 후보의 검수 상태가 맞지 않습니다.`)
  literal(candidateCase.productionEligible, false, `${location}.productionEligible`)
  if (character !== expectedCharacter(medialJamo, finalJamo)) throw new Error(`${location}: 글자와 자모 문맥이 맞지 않습니다.`)
  const elements = array(candidateCase.elements, `${location}.elements`)
  if (elements.length === 0) throw new Error(`${location}.elements: 비어 있을 수 없습니다.`)
  elements.forEach((element, elementIndex) => validateElement(element, `${location}.elements[${elementIndex}]`, sourceClass, reviewStatus))
}

export function parsePresetSourceManifest(value: unknown): PresetSourceManifest {
  const source = record(value, 'preset source')
  literal(source.schema, 'preset-source-manifest-v1', 'preset source.schema')
  literal(source.version, 1, 'preset source.version')
  literal(source.id, 'neutral-gothic-noto-seed-v0', 'preset source.id')
  literal(source.status, 'analysis-review-candidate', 'preset source.status')
  literal(source.productionEligible, false, 'preset source.productionEligible')

  const frame = record(source.coordinateFrame, 'preset source.coordinateFrame')
  literal(frame.id, 'shared-baseline', 'preset source.coordinateFrame.id')
  literal(frame.unitsPerEm, 1000, 'preset source.coordinateFrame.unitsPerEm')
  literal(frame.baselineY, 880, 'preset source.coordinateFrame.baselineY')

  const font = record(source.font, 'preset source.font')
  literal(font.id, 'noto-sans-kr', 'preset source.font.id')
  literal(font.fileSha256, EXPECTED_FONT_SHA256, 'preset source.font.fileSha256')
  const axes = record(font.axes, 'preset source.font.axes')
  literal(axes.wght, 400, 'preset source.font.axes.wght')

  const policy = record(source.policy, 'preset source.policy')
  literal(policy.promotion, 'explicit-user-approval-only', 'preset source.policy.promotion')
  const invalidVersions = array(policy.invalidExtractorVersions, 'preset source.policy.invalidExtractorVersions')
  for (const version of INVALID_EXTRACTOR_VERSIONS) {
    if (!invalidVersions.includes(version)) throw new Error(`preset source.policy: ${version} 차단값이 필요합니다.`)
  }

  const scope = record(source.scope, 'preset source.scope')
  literal(scope.medialObservationInitialJamo, 'ㄱ', 'preset source.scope.medialObservationInitialJamo')
  literal(scope.characterCount, 42, 'preset source.scope.characterCount')
  literal(scope.legacyConsonantContextCount, 114, 'preset source.scope.legacyConsonantContextCount')
  exactStringArray(scope.legacyConsonantInitialJamos, CHOSEONG_LIST, 'preset source.scope.legacyConsonantInitialJamos')
  const medials = array(scope.medials, 'preset source.scope.medials')
  if (medials.length !== JUNGSEONG_LIST.length || medials.some((medial, index) => medial !== JUNGSEONG_LIST[index])) {
    throw new Error('preset source.scope.medials: 현대 홀자 21자 순서가 필요합니다.')
  }
  const finalJamos = array(scope.finalJamos, 'preset source.scope.finalJamos')
  if (finalJamos.length !== 2 || finalJamos[0] !== null || finalJamos[1] !== 'ㄱ') throw new Error('preset source.scope.finalJamos: [null, ㄱ]이 필요합니다.')

  const sourceDigests = record(source.sourceDigests, 'preset source.sourceDigests')
  for (const digestId of REQUIRED_SOURCE_DIGESTS) sha256Value(sourceDigests[digestId], `preset source.sourceDigests.${digestId}`)
  literal(sourceDigests.font, EXPECTED_FONT_SHA256, 'preset source.sourceDigests.font')
  literal(sourceDigests.p1Full, EXPECTED_P1_FULL_SHA256, 'preset source.sourceDigests.p1Full')
  validateCurrentBaseline(source.currentBaseline)
  sha256Value(source.inputDigest, 'preset source.inputDigest')

  const legacyConsonants = record(source.legacyConsonants, 'preset source.legacyConsonants')
  literal(legacyConsonants.sourceId, 'legacy-noto-initial-v1', 'preset source.legacyConsonants.sourceId')
  literal(legacyConsonants.sourceClass, 'provisional-legacy', 'preset source.legacyConsonants.sourceClass')
  literal(legacyConsonants.reviewStatus, 'provisional', 'preset source.legacyConsonants.reviewStatus')
  exactStringArray(legacyConsonants.initialJamos, CHOSEONG_LIST, 'preset source.legacyConsonants.initialJamos')
  const legacyContexts = array(legacyConsonants.contextOrder, 'preset source.legacyConsonants.contextOrder')
  if (legacyContexts.length !== 6) throw new Error('preset source.legacyConsonants.contextOrder: 6문맥이 필요합니다.')
  const legacyValues = record(legacyConsonants.values, 'preset source.legacyConsonants.values')
  for (const initialJamo of CHOSEONG_LIST) {
    const rows = array(legacyValues[initialJamo], `preset source.legacyConsonants.values.${initialJamo}`)
    if (rows.length !== legacyContexts.length) throw new Error(`preset source.legacyConsonants.values.${initialJamo}: 6문맥이 필요합니다.`)
    rows.forEach((row, contextIndex) => {
      const values = array(row, `preset source.legacyConsonants.values.${initialJamo}[${contextIndex}]`)
      const context = record(legacyContexts[contextIndex], `preset source.legacyConsonants.contextOrder[${contextIndex}]`)
      const guides = array(context.guideOrder, `preset source.legacyConsonants.contextOrder[${contextIndex}].guideOrder`)
      if (values.length !== guides.length) throw new Error(`preset source.legacyConsonants.values.${initialJamo}[${contextIndex}]: guide 개수가 다릅니다.`)
      values.forEach((value, valueIndex) => finite(value, `preset source.legacyConsonants.values.${initialJamo}[${contextIndex}][${valueIndex}]`))
    })
  }

  const counts = record(source.caseCounts, 'preset source.caseCounts')
  literal(counts.approvedAnalysis, 14, 'preset source.caseCounts.approvedAnalysis')
  literal(counts.automaticCandidate, 28, 'preset source.caseCounts.automaticCandidate')
  literal(counts.userApprovedCandidate, 28, 'preset source.caseCounts.userApprovedCandidate')

  const cases = array(source.cases, 'preset source.cases')
  if (cases.length !== 42) throw new Error('preset source.cases: 42자가 필요합니다.')
  cases.forEach(validateCase)
  const typedCases = cases as unknown as readonly PresetSourceCase[]
  if (new Set(typedCases.map(({ character }) => character)).size !== 42) throw new Error('preset source.cases: 글자가 중복됐습니다.')
  if (typedCases.filter(({ sourceClass }) => sourceClass === 'approved-analysis').length !== 14) throw new Error('preset source.cases: 승인 골드 14자가 필요합니다.')
  if (typedCases.filter(({ sourceClass }) => sourceClass === 'automatic-candidate').length !== 28) throw new Error('preset source.cases: 자동 후보 28자가 필요합니다.')

  return source as unknown as PresetSourceManifest
}

export const PRESET_SOURCE_MANIFEST = parsePresetSourceManifest(rawManifest)
export const PRESET_SOURCE_CASE_BY_CHARACTER = new Map(
  PRESET_SOURCE_MANIFEST.cases.map((candidateCase) => [candidateCase.character, candidateCase]),
)
