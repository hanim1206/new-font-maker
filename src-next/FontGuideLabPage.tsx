import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import {
  describeError,
  isAbortError,
  parseFontCatalogResponse,
  parseOutlineResponse,
  requireSuccessfulJson,
  validateOutlineCoverage,
  type DisplayContract,
  type FontCatalogResponse,
  type GlyphOutline,
  type OutlineResponse,
  type ReferenceFont,
} from './ReferenceLabPage'
import styles from './FontGuideLabPage.module.css'
import {
  MEDIAL_DEFINITIONS,
  emptyProfile as emptyObservationProfile,
  observationValues,
  readProfile as readObservationProfile,
  scalarCandidatesFromElements,
  updateObservation,
  writeProfile as writeObservationProfile,
  type CandidateValue,
  type FontObservationProfile,
  type ObservationValue,
  type RoleDefinition,
  type RoleId,
} from './medialGuideModel'
import {
  MEDIAL_GUIDE_P0_G0_FIXTURE,
  type MedialGuideG0ContextDefinition,
  type MedialGuideG0TuningCase,
} from './fixtures/medialGuideP0G0.v1'
import {
  MEDIAL_GUIDE_EXTRACTOR_VERSION,
  MEDIAL_GUIDE_ROLE_DEFINITION_VERSION,
  parseMedialGuideCandidateResponse,
  type MedialFaceElementCandidate,
  type MedialFaceElementId,
  type MedialGuideCandidateCase,
  type MedialGuideCandidateResponse,
} from './medialGuideCandidateModel'
import {
  MISSING_GLYPH_PATH_IDENTITY,
  candidateRequestFingerprint,
  createCandidateCacheIdentity,
  normalizedAxesKey,
  readCachedCandidateCases,
  writeCandidateCacheCases,
  type CandidateCacheIdentity,
} from './medialGuideCandidateCache'
import {
  MEDIAL_G0_GOLD_TOLERANCE,
  compareMedialElementToGold,
  medialGuideG0GoldCase,
  type MedialGuideG0GoldCase,
  type MedialGuideG0GoldElement,
  type MedialGuideGoldComparison,
} from './medialGuideGoldModel'
import {
  INITIAL_COMPONENT_EXTRACTOR_VERSION,
  INITIAL_COMPONENT_MEDIAL_ANCHOR_VERSION,
  INITIAL_COMPONENT_RESPONSE_SCHEMA,
  INITIAL_COMPONENT_ROLE_DEFINITION_VERSION,
  parseInitialComponentCandidateResponse,
  type InitialComponentBoundSide,
  type InitialComponentCandidateCase,
  type InitialComponentCase,
  type InitialComponentContextId,
  type InitialComponentRequestCase,
  type InitialComponentCandidateResponse,
} from './initialComponentCandidateModel'
import {
  INITIAL_COMPONENT_MISSING_GLYPH_PATH_IDENTITY,
  createInitialComponentCacheIdentity,
  initialComponentRequestFingerprint,
  readCachedInitialComponentCases,
  writeInitialComponentCacheCases,
  type InitialComponentCacheIdentity,
} from './initialComponentCandidateCache'
import {
  FINAL_COMPONENT_P0_CONTRACT,
  type FinalComponentContextId,
  type FinalComponentSide,
  type FinalJamo,
} from './finalComponentCandidateModel'
import {
  finalComponentDisplayCaseMatchesOutline,
  finalComponentDisplaySourceIsVerified,
  isFinalComponentDisplayCandidate,
  parseFinalComponentDisplayResponse,
  type FinalComponentDisplayCase,
  type FinalComponentDisplayCandidateCase,
  type FinalComponentDisplayInputCase,
  type FinalComponentDisplayResponse,
} from './finalComponentDisplayModel'

const FONT_CATALOG_URL = '/api/reference/v1/fonts'
const OUTLINE_URL = '/api/reference/v1/outlines'
const MEDIAL_CANDIDATE_URL = '/api/reference/v1/medial-guide-candidates'
const INITIAL_COMPONENT_CANDIDATE_URL = '/api/reference/v1/initial-component-candidates'
const FINAL_COMPONENT_DISPLAY_URL = '/api/reference/v1/final-component-display'
const STORAGE_KEY = 'reference-font-guide-calibrations-v1'
const BASELINE_Y = 880
const GUIDE_MIN = -120
const GUIDE_MAX = 1120

type GuideId = 'initialTop' | 'initialBottom' | 'initialLeft' | 'initialRight' | 'finalTop' | 'finalBottom' | 'finalLeft' | 'finalRight' | 'pillarX'
type ContextId = 'initial-horizontal' | 'initial-horizontal-final' | 'initial-vertical' | 'initial-vertical-final' | 'initial-mixed' | 'initial-mixed-final'
type InitialConsonant = 'ㄱ' | 'ㄲ' | 'ㄴ' | 'ㄷ' | 'ㄸ' | 'ㄹ' | 'ㅁ' | 'ㅂ' | 'ㅃ' | 'ㅅ' | 'ㅆ' | 'ㅇ' | 'ㅈ' | 'ㅉ' | 'ㅊ' | 'ㅋ' | 'ㅌ' | 'ㅍ' | 'ㅎ'
type Medial = 'ㅏ' | 'ㅐ' | 'ㅑ' | 'ㅒ' | 'ㅓ' | 'ㅔ' | 'ㅕ' | 'ㅖ' | 'ㅗ' | 'ㅘ' | 'ㅙ' | 'ㅚ' | 'ㅛ' | 'ㅜ' | 'ㅝ' | 'ㅞ' | 'ㅟ' | 'ㅠ' | 'ㅡ' | 'ㅢ' | 'ㅣ'
type MedialContext = 'right' | 'bottom' | 'mixed'

interface GuideSet {
  initialTop: number
  initialBottom: number
  initialLeft: number
  initialRight: number
  finalTop: number
  finalBottom: number
  finalLeft: number
  finalRight: number
  pillarX: number
}

interface GuideDefinition {
  id: GuideId
  label: string
  axis: 'x' | 'y'
  color: string
  activeColor: string
}

interface GuideCalibrationStore {
  schema: 'reference-font-guide-calibrations-v4'
  version: 4
  values: Record<string, FontGuideProfile>
}

interface FontGuideProfile {
  base: Partial<Record<ContextId, GuideSet>>
  overrides: Partial<Record<InitialConsonant, Partial<Record<ContextId, GuideSet>>>>
}

interface PreviousInitialGuideCalibrationStore {
  schema: 'reference-font-guide-calibrations-v3'
  version: 3
  values: Record<string, Partial<Record<InitialConsonant, Partial<Record<ContextId, GuideSet>>>>>
}

interface PreviousGuideCalibrationStore {
  schema: 'reference-font-guide-calibrations-v2'
  version: 2
  values: Record<string, Partial<Record<ContextId, GuideSet>>>
}

interface LegacyGuideCalibrationStore {
  schema: 'reference-font-guide-calibrations-v1'
  version: 1
  values: Record<string, GuideSet>
}

interface CaseContext {
  id: ContextId
  medialContext: MedialContext
  label: string
  pairLabel: string
  hasFinal: boolean
  showsPillar: boolean
}

type GuideSource = 'base' | 'override' | 'default'
type InitialHoverTargetId = `initial:role:${InitialComponentBoundSide}` | `initial:axis:${InitialComponentBoundSide}`
type MedialElementHoverTargetId = `medial:element:${MedialFaceElementId}`
type FinalHoverTargetId = `final:role:${FinalComponentSide}` | `final:axis:${FinalComponentSide}` | `final:member:${'only' | 'left' | 'right'}`
type HoverTargetId = GuideId | `medial:${MedialOverlayGuide['source']}:${RoleId}` | MedialElementHoverTargetId | InitialHoverTargetId | FinalHoverTargetId

function medialHoverTarget(source: MedialOverlayGuide['source'], id: RoleId): `medial:${MedialOverlayGuide['source']}:${RoleId}` {
  return `medial:${source}:${id}`
}

function initialHoverTarget(kind: 'role' | 'axis', side: InitialComponentBoundSide): InitialHoverTargetId {
  return `initial:${kind}:${side}`
}

function medialElementHoverTarget(id: MedialFaceElementId): MedialElementHoverTargetId {
  return `medial:element:${id}`
}

function finalHoverTarget(kind: 'role' | 'axis' | 'member', id: FinalComponentSide | 'only' | 'left' | 'right'): FinalHoverTargetId {
  return `final:${kind}:${id}` as FinalHoverTargetId
}

interface MedialOverlayGuide {
  id: RoleId
  axis: 'x' | 'y'
  value: number
  source: 'candidate' | 'observation'
}

interface MedialG0ReviewSpec {
  context: MedialGuideG0ContextDefinition
  tuningCase: MedialGuideG0TuningCase
  goldCase: MedialGuideG0GoldCase
  roleDefinitionVersion: typeof MEDIAL_GUIDE_P0_G0_FIXTURE.roleDefinitionVersion
  roiDefinitionVersion: typeof MEDIAL_GUIDE_P0_G0_FIXTURE.roiDefinitionVersion
}

interface MedialG0ComparisonSummary {
  matched: number
  total: number
  maximumCoordinateDelta: number
  highConfidence: number
  highConfidenceMismatches: number
}

interface P1RiskReviewSample {
  id: string
  label: string
  note: string
  fontId: 'noto-sans-kr' | 'nanum-gothic'
  initialJamo: InitialConsonant
  medials: Readonly<Record<MedialContext, Medial>>
}

const MEDIAL_ELEMENT_LABELS: Readonly<Record<MedialFaceElementId, string>> = {
  innerPillar: '안쪽 긴 세로기둥',
  outerPillar: '긴 세로기둥',
  primaryBeam: '주 가로보',
  baseStem: '짧은 세로줄기',
  leftStem: '왼쪽 짧은 세로줄기',
  rightStem: '오른쪽 짧은 세로줄기',
  upperBeam: '윗 가로보',
  lowerBeam: '아랫 가로보',
}

const DEFAULT_GUIDES: GuideSet = {
  initialTop: 90,
  initialBottom: 590,
  initialLeft: 60,
  initialRight: 500,
  finalTop: 650,
  finalBottom: 930,
  finalLeft: 150,
  finalRight: 750,
  pillarX: 610,
}

const GUIDE_DEFINITIONS: readonly GuideDefinition[] = [
  { id: 'initialTop', label: '첫닿윗선', axis: 'y', color: '#b8bec7', activeColor: '#d97706' },
  { id: 'initialBottom', label: '첫닿밑선', axis: 'y', color: '#b8bec7', activeColor: '#d97706' },
  { id: 'initialLeft', label: '첫닿왼선', axis: 'x', color: '#b8bec7', activeColor: '#d97706' },
  { id: 'initialRight', label: '첫닿오른선', axis: 'x', color: '#b8bec7', activeColor: '#d97706' },
  { id: 'finalTop', label: '받침윗선', axis: 'y', color: '#b8bec7', activeColor: '#7c3aed' },
  { id: 'finalBottom', label: '받침밑선', axis: 'y', color: '#b8bec7', activeColor: '#7c3aed' },
  { id: 'finalLeft', label: '받침왼선', axis: 'x', color: '#b8bec7', activeColor: '#7c3aed' },
  { id: 'finalRight', label: '받침오른선', axis: 'x', color: '#b8bec7', activeColor: '#7c3aed' },
  { id: 'pillarX', label: '기둥선', axis: 'x', color: '#b8bec7', activeColor: '#0f766e' },
]

const LEGACY_GUIDE_IDS: readonly GuideId[] = ['initialTop', 'initialBottom', 'finalTop', 'finalBottom', 'pillarX']
const INITIAL_CONSONANTS: readonly InitialConsonant[] = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ']
const INITIAL_INDEX = new Map<InitialConsonant, number>(INITIAL_CONSONANTS.map((consonant, index) => [consonant, index]))
const MEDIAL_INDEX: Readonly<Record<Medial, number>> = { 'ㅏ': 0, 'ㅐ': 1, 'ㅑ': 2, 'ㅒ': 3, 'ㅓ': 4, 'ㅔ': 5, 'ㅕ': 6, 'ㅖ': 7, 'ㅗ': 8, 'ㅘ': 9, 'ㅙ': 10, 'ㅚ': 11, 'ㅛ': 12, 'ㅜ': 13, 'ㅝ': 14, 'ㅞ': 15, 'ㅟ': 16, 'ㅠ': 17, 'ㅡ': 18, 'ㅢ': 19, 'ㅣ': 20 }
const MEDIAL_OPTIONS: Readonly<Record<MedialContext, readonly Medial[]>> = {
  right: ['ㅏ', 'ㅐ', 'ㅑ', 'ㅒ', 'ㅓ', 'ㅔ', 'ㅕ', 'ㅖ', 'ㅣ'],
  bottom: ['ㅗ', 'ㅛ', 'ㅜ', 'ㅠ', 'ㅡ'],
  mixed: ['ㅘ', 'ㅙ', 'ㅚ', 'ㅝ', 'ㅞ', 'ㅟ', 'ㅢ'],
}
const DEFAULT_MEDIALS: Readonly<Record<MedialContext, Medial>> = { right: 'ㅏ', bottom: 'ㅗ', mixed: 'ㅘ' }
const LEGACY_GUIDES_VISIBLE = false

const CASE_CONTEXTS: readonly CaseContext[] = [
  { id: 'initial-horizontal', medialContext: 'right', label: '가로 첫닿자', pairLabel: '가로 첫닿자 ↔ 오른쪽 홀자 · 받침', hasFinal: false, showsPillar: true },
  { id: 'initial-horizontal-final', medialContext: 'right', label: '오른쪽 홀자 · 받침', pairLabel: '가로 첫닿자 ↔ 오른쪽 홀자 · 받침', hasFinal: true, showsPillar: true },
  { id: 'initial-vertical', medialContext: 'bottom', label: '세로 첫닿자', pairLabel: '세로 첫닿자 ↔ 아래 홀자 · 받침', hasFinal: false, showsPillar: false },
  { id: 'initial-vertical-final', medialContext: 'bottom', label: '아래 홀자 · 받침', pairLabel: '세로 첫닿자 ↔ 아래 홀자 · 받침', hasFinal: true, showsPillar: false },
  { id: 'initial-mixed', medialContext: 'mixed', label: '섞임 첫닿자', pairLabel: '섞임 첫닿자 ↔ 섞임 홀자 · 받침', hasFinal: false, showsPillar: true },
  { id: 'initial-mixed-final', medialContext: 'mixed', label: '섞임 홀자 · 받침', pairLabel: '섞임 첫닿자 ↔ 섞임 홀자 · 받침', hasFinal: true, showsPillar: true },
]

const CASE_PAIRS: readonly { label: string; contextIds: readonly ContextId[] }[] = [
  { label: '가로 첫닿자 ↔ 오른쪽 홀자 · 받침', contextIds: ['initial-horizontal', 'initial-horizontal-final'] },
  { label: '섞임 첫닿자 ↔ 섞임 홀자 · 받침', contextIds: ['initial-mixed', 'initial-mixed-final'] },
  { label: '세로 첫닿자 ↔ 아래 홀자 · 받침', contextIds: ['initial-vertical', 'initial-vertical-final'] },
]

const CONTEXT_BY_ID = new Map<ContextId, CaseContext>(CASE_CONTEXTS.map((context) => [context.id, context]))
const INITIAL_COMPONENT_CONTEXT_BY_CARD: Readonly<Record<ContextId, InitialComponentContextId>> = {
  'initial-horizontal': 'right',
  'initial-horizontal-final': 'right-final',
  'initial-vertical': 'bottom',
  'initial-vertical-final': 'bottom-final',
  'initial-mixed': 'mixed',
  'initial-mixed-final': 'mixed-final',
}
const FINAL_COMPONENT_CONTEXT_BY_CARD: Readonly<Partial<Record<ContextId, FinalComponentContextId>>> = {
  'initial-horizontal-final': 'right-final',
  'initial-vertical-final': 'bottom-final',
  'initial-mixed-final': 'mixed-final',
}
const INITIAL_COMPONENT_P0_MEDIALS = { right: 'ㅏ', bottom: 'ㅗ', mixed: 'ㅘ' } as const
const INITIAL_COMPONENT_SIDE_LABELS: Readonly<Record<InitialComponentBoundSide, string>> = {
  top: '첫윗단면', bottom: '첫밑단면', left: '첫왼단면', right: '첫오른단면',
}
const FINAL_COMPONENT_SIDE_LABELS: Readonly<Record<FinalComponentSide, string>> = {
  top: '받침윗단면', bottom: '받침밑단면', left: '받침왼단면', right: '받침오른단면',
}
const FINAL_JAMO_INDEX = new Map<FinalJamo, number>(FINAL_COMPONENT_P0_CONTRACT.finalJamos.map((jamo, index) => [jamo, index + 1]))
const G0_TUNING_CASE_BY_MEDIAL = new Map<Medial, MedialGuideG0TuningCase>(MEDIAL_GUIDE_P0_G0_FIXTURE.tuningCases.map((tuningCase) => [tuningCase.medialJamo, tuningCase]))
const G0_ELEMENT_COUNT = MEDIAL_GUIDE_P0_G0_FIXTURE.tuningCases.reduce((count, tuningCase) => count + tuningCase.elements.length * 2, 0)
const P1_RISK_REVIEW_SAMPLES: readonly P1RiskReviewSample[] = [
  { id: 'noto-complex', label: 'Noto · 반복 구조', note: '겹기둥·쌍줄기·혼합', fontId: 'noto-sans-kr', initialJamo: 'ㄱ', medials: { right: 'ㅒ', bottom: 'ㅠ', mixed: 'ㅞ' } },
  { id: 'noto-direction', label: 'Noto · 방향 스캔', note: '표·풔·접합 방향', fontId: 'noto-sans-kr', initialJamo: 'ㅍ', medials: { right: 'ㅕ', bottom: 'ㅛ', mixed: 'ㅝ' } },
  { id: 'nanum-rounded', label: '나눔 · 곡면·접합', note: '뫠 기반 보·줄기', fontId: 'nanum-gothic', initialJamo: 'ㅁ', medials: { right: 'ㅒ', bottom: 'ㅠ', mixed: 'ㅙ' } },
  { id: 'nanum-parallel', label: '나눔 · 병렬 구조', note: '뚀·뛔·뛕', fontId: 'nanum-gothic', initialJamo: 'ㄸ', medials: { right: 'ㅒ', bottom: 'ㅛ', mixed: 'ㅞ' } },
  { id: 'nanum-twin', label: '나눔 · 쌍줄기', note: '퓩·풰·풱', fontId: 'nanum-gothic', initialJamo: 'ㅍ', medials: { right: 'ㅖ', bottom: 'ㅠ', mixed: 'ㅞ' } },
]

function isG0ReviewFont(font: ReferenceFont): boolean {
  return font.id === MEDIAL_GUIDE_P0_G0_FIXTURE.font.id && font.fileSha256 === MEDIAL_GUIDE_P0_G0_FIXTURE.font.fileSha256
}

const P1_VERIFIED_FONT_SHA256: Readonly<Record<string, string>> = {
  [MEDIAL_GUIDE_P0_G0_FIXTURE.font.id]: MEDIAL_GUIDE_P0_G0_FIXTURE.font.fileSha256,
  'nanum-gothic': '76f45ef4a6bcff344c837c95a7dcc26e017e38b5846d5ae0cdcb5b86be2e2d31',
}
const FINAL_COMPONENT_VERIFIED_FONT_SHA256: Readonly<Record<string, string>> = {
  'noto-sans-kr': '194018e6b2b293a7964f037b25c0249ce1418bc9ab3c971060a03aa57861e252',
  'nanum-gothic': '76f45ef4a6bcff344c837c95a7dcc26e017e38b5846d5ae0cdcb5b86be2e2d31',
  'dotum': '12f749ac462e547e3f4073227bb3b2b4c116062fc7546fbdadaa04e5e9f88b12',
}

function isP1CandidateFont(font: ReferenceFont): boolean {
  return P1_VERIFIED_FONT_SHA256[font.id] === font.fileSha256
}

function isFinalComponentVerifiedFont(font: ReferenceFont): boolean {
  return FINAL_COMPONENT_VERIFIED_FONT_SHA256[font.id] === font.fileSha256
}

function candidateResponseFromCases(font: ReferenceFont, cases: readonly MedialGuideCandidateCase[]): MedialGuideCandidateResponse {
  return {
    schema: 'reference-medial-guide-candidate-response-v1',
    apiVersion: 'reference.v1',
    extractorVersion: MEDIAL_GUIDE_EXTRACTOR_VERSION,
    roleDefinitionVersion: MEDIAL_GUIDE_ROLE_DEFINITION_VERSION,
    coordinateFrame: 'shared-baseline',
    matching: 'geometry-role-search',
    font: { id: font.id, fileSha256: font.fileSha256, axes: font.axes },
    cases,
  }
}

function orderedCachedCases(
  identities: readonly CandidateCacheIdentity[],
  cached: ReadonlyMap<string, MedialGuideCandidateCase>,
): MedialGuideCandidateCase[] | null {
  const cases = identities.map(({ key }) => cached.get(key))
  return cases.every((candidateCase) => candidateCase !== undefined) ? cases : null
}

function initialComponentResponseFromCases(font: ReferenceFont, cases: readonly InitialComponentCase[]): InitialComponentCandidateResponse {
  return {
    schema: INITIAL_COMPONENT_RESPONSE_SCHEMA,
    apiVersion: 'reference.v1',
    extractorVersion: INITIAL_COMPONENT_EXTRACTOR_VERSION,
    roleDefinitionVersion: INITIAL_COMPONENT_ROLE_DEFINITION_VERSION,
    medialAnchorExtractorVersion: INITIAL_COMPONENT_MEDIAL_ANCHOR_VERSION,
    coordinateFrame: 'shared-baseline',
    matching: 'medial-anchored-component-grouping',
    font: { id: font.id, fileSha256: font.fileSha256, axes: font.axes },
    cases,
  }
}

function orderedInitialComponentCases(
  identities: readonly InitialComponentCacheIdentity[],
  cached: ReadonlyMap<string, InitialComponentCase>,
): InitialComponentCase[] | null {
  const cases = identities.map(({ key }) => cached.get(key))
  return cases.every((candidateCase) => candidateCase !== undefined) ? cases : null
}

function initialComponentHoverTargets(
  candidate: InitialComponentCandidateCase | null,
  x: number,
  y: number,
  xTolerance: number,
  yTolerance: number,
): InitialHoverTargetId[] {
  if (!candidate) return []
  const active = new Set<InitialHoverTargetId>()
  if (candidate.selectionArea.status === 'candidate') {
    const area = candidate.selectionArea.value
    const insideX = x >= area.x - xTolerance && x <= area.x + area.width + xTolerance
    const insideY = y >= area.y - yTolerance && y <= area.y + area.height + yTolerance
    for (const side of ['top', 'bottom'] as const) {
      const roleFace = candidate.roleFaces[side]
      if (roleFace.status === 'candidate' && insideX && Math.abs(y - roleFace.value) <= yTolerance) active.add(initialHoverTarget('role', side))
    }
    for (const side of ['left', 'right'] as const) {
      const roleFace = candidate.roleFaces[side]
      if (roleFace.status === 'candidate' && insideY && Math.abs(x - roleFace.value) <= xTolerance) active.add(initialHoverTarget('role', side))
    }
  }
  for (const side of ['top', 'bottom', 'left', 'right'] as const) {
    const observation = candidate.axisFaces[side]
    if (observation.status !== 'candidate') continue
    for (const face of observation.value) {
      const coordinate = face.orientation === 'vertical' ? x : y
      const tolerance = face.orientation === 'vertical' ? xTolerance : yTolerance
      const spanCoordinate = face.orientation === 'vertical' ? y : x
      if (Math.abs(coordinate - face.value) <= tolerance && face.visibleSpans.some((span) => spanCoordinate >= span.from - tolerance && spanCoordinate <= span.to + tolerance)) {
        active.add(initialHoverTarget('axis', side))
      }
    }
  }
  return [...active]
}

function finalComponentHoverTargets(
  candidate: FinalComponentDisplayCandidateCase | null,
  x: number,
  y: number,
  xTolerance: number,
  yTolerance: number,
): FinalHoverTargetId[] {
  if (!candidate || candidate.selectionArea.status !== 'candidate') return []
  const area = candidate.selectionArea.value
  const insideX = x >= area.x - xTolerance && x <= area.x + area.width + xTolerance
  const insideY = y >= area.y - yTolerance && y <= area.y + area.height + yTolerance
  const active = new Set<FinalHoverTargetId>()
  for (const side of ['top', 'bottom'] as const) {
    const roleFace = candidate.roleFaces[side]
    if (roleFace.status === 'candidate' && insideX && Math.abs(y - roleFace.value) <= yTolerance) active.add(finalHoverTarget('role', side))
  }
  for (const side of ['left', 'right'] as const) {
    const roleFace = candidate.roleFaces[side]
    if (roleFace.status === 'candidate' && insideY && Math.abs(x - roleFace.value) <= xTolerance) active.add(finalHoverTarget('role', side))
  }
  for (const side of ['top', 'bottom', 'left', 'right'] as const) {
    const observation = candidate.axisFaces[side]
    if (observation.status !== 'candidate') continue
    for (const face of observation.value) {
      const coordinate = face.orientation === 'vertical' ? x : y
      const tolerance = face.orientation === 'vertical' ? xTolerance : yTolerance
      const spanCoordinate = face.orientation === 'vertical' ? y : x
      if (Math.abs(coordinate - face.value) <= tolerance && face.visibleSpans.some((span) => spanCoordinate >= span.from - tolerance && spanCoordinate <= span.to + tolerance)) active.add(finalHoverTarget('axis', side))
    }
  }
  return [...active]
}

function medialElementHoverTargets(
  candidates: readonly MedialFaceElementCandidate[],
  x: number,
  y: number,
  xTolerance: number,
  yTolerance: number,
): MedialElementHoverTargetId[] {
  return candidates.flatMap((element) => {
    if (element.face.status !== 'candidate' || element.visibleSpans.status !== 'candidate') return []
    const coordinate = element.orientation === 'vertical' ? x : y
    const spanCoordinate = element.orientation === 'vertical' ? y : x
    const tolerance = element.orientation === 'vertical' ? xTolerance : yTolerance
    const spanTolerance = element.orientation === 'vertical' ? yTolerance : xTolerance
    const touchesFace = Math.abs(coordinate - element.face.value) <= tolerance
      && element.visibleSpans.value.some((span) => spanCoordinate >= span.from - spanTolerance && spanCoordinate <= span.to + spanTolerance)
    return touchesFace ? [medialElementHoverTarget(element.elementId)] : []
  })
}

function medialG0ReviewSpec(font: ReferenceFont, initial: InitialConsonant, medial: Medial, contextId: ContextId): MedialG0ReviewSpec | null {
  if (!isG0ReviewFont(font) || initial !== MEDIAL_GUIDE_P0_G0_FIXTURE.initialJamo) return null
  const tuningCase = G0_TUNING_CASE_BY_MEDIAL.get(medial)
  const context = CONTEXT_BY_ID.get(contextId)
  if (!tuningCase || !context) return null
  const goldCase = medialGuideG0GoldCase(tuningCase.characters[context.hasFinal ? 1 : 0])
  if (!goldCase) return null
  return {
    context: MEDIAL_GUIDE_P0_G0_FIXTURE.contexts[contextId],
    tuningCase,
    goldCase,
    roleDefinitionVersion: MEDIAL_GUIDE_P0_G0_FIXTURE.roleDefinitionVersion,
    roiDefinitionVersion: MEDIAL_GUIDE_P0_G0_FIXTURE.roiDefinitionVersion,
  }
}

function goldComparisonLabel(comparison: MedialGuideGoldComparison, gold: MedialGuideG0GoldElement): string {
  if (comparison.status === 'mismatch') return 'G0 불일치'
  if (gold.face.status === 'abstained') return 'G0 포기 일치'
  return 'G0 일치'
}

function medialOverlayGuides(initial: InitialConsonant, context: CaseContext, medials: Readonly<Record<MedialContext, Medial>>, observations: FontObservationProfile): readonly MedialOverlayGuide[] {
  const medial = medials[context.medialContext]
  const roles = MEDIAL_DEFINITIONS[medial].roles
  const measured = observationValues(observations, initial, medial, context.hasFinal ? 'ㄱ' : null)
  const guides: MedialOverlayGuide[] = []
  roles.forEach((role) => {
    const observation = measured[role.id]
    if (observation && observation.review !== 'rejected') guides.push({ id: role.id, axis: role.axis, value: observation.value, source: 'observation' })
  })
  return guides
}

function manualReviewState(observation: ObservationValue | undefined): ObservationValue['review'] {
  return observation && (observation.method === 'automatic-candidate' || observation.review !== 'pending') ? 'corrected' : 'pending'
}

function observationStateLabel(observation: ObservationValue): string {
  if (observation.review === 'rejected') return '자동 후보 · 거부됨'
  if (observation.review === 'corrected') return '수정 관측 · 검토 대기'
  if (observation.review === 'accepted-for-analysis') return `${observation.method === 'manual' ? '직접 입력' : observation.method === 'legacy-inferred' ? '이관 관측' : '자동 후보'} · 분석 채택`
  return `${observation.method === 'manual' ? '직접 입력' : observation.method === 'legacy-inferred' ? '이관 관측' : '자동 후보 채택'} · 검토 대기`
}

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max)

function createGuidesByContext(seed: GuideSet = DEFAULT_GUIDES): Record<ContextId, GuideSet> {
  return CASE_CONTEXTS.reduce<Record<ContextId, GuideSet>>((guidesByContext, context) => {
    guidesByContext[context.id] = { ...seed }
    return guidesByContext
  }, {} as Record<ContextId, GuideSet>)
}

function guideDefinitionsFor(context: CaseContext): readonly GuideDefinition[] {
  return GUIDE_DEFINITIONS.filter((guide) => {
    if (guide.id.startsWith('final')) return context.hasFinal
    if (guide.id === 'pillarX') return context.showsPillar
    return true
  })
}

function caseCharacter(
  context: CaseContext,
  initial: InitialConsonant,
  medials: Readonly<Record<MedialContext, Medial>>,
  finalJamo: FinalJamo,
): string {
  const finalIndex = context.hasFinal ? FINAL_JAMO_INDEX.get(finalJamo) : 0
  if (finalIndex === undefined) throw new Error('현대 받침 27종이 필요합니다.')
  return String.fromCodePoint(0xac00 + INITIAL_INDEX.get(initial)! * 588 + MEDIAL_INDEX[medials[context.medialContext]] * 28 + finalIndex)
}

function caseText(initial: InitialConsonant, medials: Readonly<Record<MedialContext, Medial>>, finalJamo: FinalJamo): string {
  return CASE_CONTEXTS.map((context) => caseCharacter(context, initial, medials, finalJamo)).join('')
}

function calibrationKey(font: ReferenceFont): string {
  const axes = Object.entries(font.axes).sort(([left], [right]) => left.localeCompare(right)).map(([tag, value]) => `${tag}=${value}`).join('&')
  return `${font.id}:${font.fileSha256}:${axes}`
}

function parseStoredCalibrations(): GuideCalibrationStore {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('missing')
    const record = parsed as Partial<GuideCalibrationStore | PreviousInitialGuideCalibrationStore | PreviousGuideCalibrationStore | LegacyGuideCalibrationStore>
    if (!record.values || typeof record.values !== 'object' || Array.isArray(record.values)) throw new Error('invalid')
    if (record.schema === 'reference-font-guide-calibrations-v4' && record.version === 4) {
      return { schema: 'reference-font-guide-calibrations-v4', version: 4, values: record.values as Record<string, FontGuideProfile> }
    }
    if (record.schema === 'reference-font-guide-calibrations-v3' && record.version === 3) {
      const previousValues = record.values as PreviousInitialGuideCalibrationStore['values']
      return {
        schema: 'reference-font-guide-calibrations-v4',
        version: 4,
        values: Object.fromEntries(Object.entries(previousValues).map(([key, overrides]) => [key, { base: {}, overrides }])),
      }
    }
    if (record.schema === 'reference-font-guide-calibrations-v2' && record.version === 2) {
      const previousValues = record.values as Record<string, Partial<Record<ContextId, GuideSet>>>
      return {
        schema: 'reference-font-guide-calibrations-v4',
        version: 4,
        values: Object.fromEntries(Object.entries(previousValues).map(([key, value]) => [key, { base: {}, overrides: { 'ㄱ': value } }])),
      }
    }
    if (record.schema === 'reference-font-guide-calibrations-v1' && record.version === 1) {
      const legacyValues = record.values as Record<string, unknown>
      return {
        schema: 'reference-font-guide-calibrations-v4',
        version: 4,
        values: Object.fromEntries(Object.entries(legacyValues).flatMap(([key, value]) => isGuideSet(value) ? [[key, { base: {}, overrides: { 'ㄱ': createGuidesByContext(value) } }]] : [])),
      }
    }
    throw new Error('invalid')
  } catch {
    return { schema: 'reference-font-guide-calibrations-v4', version: 4, values: {} }
  }
}

function isGuideSet(value: unknown): value is GuideSet {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const candidate = value as Record<string, unknown>
  return LEGACY_GUIDE_IDS.every((id) => typeof candidate[id] === 'number' && Number.isFinite(candidate[id]))
    && GUIDE_DEFINITIONS.every(({ id }) => candidate[id] === undefined || (typeof candidate[id] === 'number' && Number.isFinite(candidate[id])))
}

function normalizeGuideSet(value: GuideSet): GuideSet {
  return { ...DEFAULT_GUIDES, ...value }
}

function emptyGuideProfile(): FontGuideProfile {
  return { base: {}, overrides: {} }
}

function resolveGuides(profile: FontGuideProfile, initial: InitialConsonant): Record<ContextId, GuideSet> {
  const defaults = createGuidesByContext()
  CASE_CONTEXTS.forEach((context) => {
    const baseGuides = profile.base[context.id]
    const overrideGuides = profile.overrides[initial]?.[context.id]
    if (isGuideSet(baseGuides)) defaults[context.id] = normalizeGuideSet(baseGuides)
    if (isGuideSet(overrideGuides)) defaults[context.id] = normalizeGuideSet(overrideGuides)
  })
  return defaults
}

function readGuideProfile(font: ReferenceFont): FontGuideProfile {
  return parseStoredCalibrations().values[calibrationKey(font)] ?? emptyGuideProfile()
}

function guideSource(profile: FontGuideProfile, initial: InitialConsonant, contextId: ContextId): GuideSource {
  if (isGuideSet(profile.overrides[initial]?.[contextId])) return 'override'
  if (isGuideSet(profile.base[contextId])) return 'base'
  return 'default'
}

function writeGuideProfile(font: ReferenceFont, profile: FontGuideProfile): void {
  const stored = parseStoredCalibrations()
  stored.values[calibrationKey(font)] = profile
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
}

function updateGuide(context: CaseContext, guides: GuideSet, id: GuideId, value: number): GuideSet {
  const rounded = Math.round(value)
  switch (id) {
    case 'initialTop': return { ...guides, initialTop: clamp(rounded, GUIDE_MIN, guides.initialBottom) }
    case 'initialBottom': return { ...guides, initialBottom: clamp(rounded, guides.initialTop, context.hasFinal ? guides.finalTop : GUIDE_MAX) }
    case 'initialLeft': return { ...guides, initialLeft: clamp(rounded, GUIDE_MIN, guides.initialRight) }
    case 'initialRight': return { ...guides, initialRight: clamp(rounded, guides.initialLeft, GUIDE_MAX) }
    case 'finalTop': return { ...guides, finalTop: clamp(rounded, guides.initialBottom, guides.finalBottom) }
    case 'finalBottom': return { ...guides, finalBottom: clamp(rounded, Math.max(guides.finalTop, BASELINE_Y), GUIDE_MAX) }
    case 'finalLeft': return { ...guides, finalLeft: clamp(rounded, GUIDE_MIN, guides.finalRight) }
    case 'finalRight': return { ...guides, finalRight: clamp(rounded, guides.finalLeft, GUIDE_MAX) }
    case 'pillarX': return { ...guides, pillarX: clamp(rounded, GUIDE_MIN, GUIDE_MAX) }
  }
}

function GuideTile({
  context,
  display,
  font,
  glyph,
  guides,
  guideSource,
  showLegacyGuides,
  medialGuides,
  medialRoles,
  medialObservations,
  medialCandidates,
  medialElementCandidates,
  initialCandidate,
  finalCandidate,
  medialG0Review,
  showMedialG0Regions,
  onGuideInputFocus,
  onGuideInputChange,
  onGuideInputBlur,
  onMedialObservationChange,
  onMedialObservationReview,
}: {
  context: CaseContext
  display: DisplayContract
  font: ReferenceFont
  glyph: GlyphOutline
  guides: GuideSet
  guideSource: GuideSource
  showLegacyGuides: boolean
  medialGuides: readonly MedialOverlayGuide[]
  medialRoles: readonly RoleDefinition[]
  medialObservations: Partial<Record<RoleId, ObservationValue>>
  medialCandidates: Partial<Record<RoleId, CandidateValue>>
  medialElementCandidates: readonly MedialFaceElementCandidate[]
  initialCandidate: InitialComponentCandidateCase | null
  finalCandidate: FinalComponentDisplayCase | null
  medialG0Review: MedialG0ReviewSpec | null
  showMedialG0Regions: boolean
  onGuideInputFocus: (contextId: ContextId, id: GuideId) => void
  onGuideInputChange: (contextId: ContextId, id: GuideId, value: string) => void
  onGuideInputBlur: (contextId: ContextId, id: GuideId) => void
  onMedialObservationChange: (context: CaseContext, role: RoleDefinition, value: number | null, source: Pick<ObservationValue, 'method' | 'confidence' | 'review'>, persist: boolean) => void
  onMedialObservationReview: (context: CaseContext, role: RoleDefinition) => void
}) {
  const candidateExtractorVersion = medialElementCandidates[0]?.face.evidence.method ?? MEDIAL_GUIDE_EXTRACTOR_VERSION
  const initialSelectionArea = initialCandidate?.selectionArea.status === 'candidate' ? initialCandidate.selectionArea.value : null
  const finalDisplayCandidate = isFinalComponentDisplayCandidate(finalCandidate) ? finalCandidate : null
  const finalSelectionArea = finalDisplayCandidate?.selectionArea.status === 'candidate' ? finalDisplayCandidate.selectionArea.value : null
  const glyphScale = glyph.missing ? null : display.unitsPerEm / glyph.unitsPerEm
  const legacyGuideDefinitions = guideDefinitionsFor(context)
  const visibleGuides = showLegacyGuides ? legacyGuideDefinitions : []
  const editableGuides = showLegacyGuides ? legacyGuideDefinitions : []
  const [hoveredGuideIds, setHoveredGuideIds] = useState<readonly HoverTargetId[]>([])
  const setHoveredGuides = (ids: readonly HoverTargetId[]) => {
    setHoveredGuideIds((current) => current.length === ids.length && current.every((id, index) => id === ids[index]) ? current : ids)
  }
  const handleCanvasPointerMove = (event: ReactPointerEvent<SVGRectElement>) => {
    const svg = event.currentTarget.ownerSVGElement
    if (!svg) return
    const bounds = svg.getBoundingClientRect()
    const viewBox = svg.viewBox.baseVal
    if (bounds.width === 0 || bounds.height === 0) return
    const x = viewBox.x + (event.clientX - bounds.left) / bounds.width * viewBox.width
    const y = viewBox.y + (event.clientY - bounds.top) / bounds.height * viewBox.height
    const xTolerance = 12 / bounds.width * viewBox.width
    const yTolerance = 12 / bounds.height * viewBox.height
    const hoverableGuides = [
      ...visibleGuides.map((guide) => ({ id: guide.id, axis: guide.axis, value: guides[guide.id] })),
      ...medialGuides.map((guide) => ({ ...guide, id: medialHoverTarget(guide.source, guide.id) })),
    ]
    setHoveredGuides([
      ...hoverableGuides.filter((guide) => Math.abs((guide.axis === 'x' ? x : y) - guide.value) <= (guide.axis === 'x' ? xTolerance : yTolerance)).map((guide) => guide.id),
      ...initialComponentHoverTargets(initialCandidate, x, y, xTolerance, yTolerance),
      ...finalComponentHoverTargets(finalDisplayCandidate, x, y, xTolerance, yTolerance),
      ...medialElementHoverTargets(medialElementCandidates, x, y, xTolerance, yTolerance),
    ])
  }
  return (
    <article className={styles.caseTile} data-testid="font-guide-case" data-glyph={glyph.character} data-context-id={context.id} data-g0-analysis-gold={medialG0Review ? 'true' : undefined}>
      <header><strong>{glyph.character}</strong><span>{context.label}</span></header>
      <svg
        className={styles.glyphCanvas}
        viewBox={display.viewBox.join(' ')}
        data-testid="font-guide-glyph"
        data-coordinate-frame="shared-baseline"
        role="img"
        aria-label={`${font.family} ${glyph.character} 기준선 조율`}
      >
        <rect className={styles.emFrame} x="0" y="0" width="1000" height="1000" />
        <rect className={styles.designBody} x="75" y="75" width="850" height="850" />
        {initialCandidate?.selectionArea.status === 'candidate' && initialSelectionArea && (
          <rect
            className={`${styles.initialSelectionArea} ${hoveredGuideIds.some((id) => id.startsWith('initial:')) ? styles.activeInitialSelectionArea : ''}`}
            data-initial-selection-area="true"
            data-initial-selection-area-method={initialCandidate.selectionArea.evidence.method}
            x={initialSelectionArea.x}
            y={initialSelectionArea.y}
            width={initialSelectionArea.width}
            height={initialSelectionArea.height}
          />
        )}
        {finalSelectionArea && (
          <rect
            className={`${styles.finalSelectionArea} ${hoveredGuideIds.some((id) => id.startsWith('final:')) ? styles.activeFinalSelectionArea : ''}`}
            data-final-selection-area="true"
            x={finalSelectionArea.x}
            y={finalSelectionArea.y}
            width={finalSelectionArea.width}
            height={finalSelectionArea.height}
          />
        )}
        {showMedialG0Regions && medialG0Review?.context.include.map((region) => <rect key={`include-${region.id}`} className={styles.medialAnalysisRoi} data-medial-analysis-roi={region.id} data-roi-version={medialG0Review.roiDefinitionVersion} x={region.x} y={region.y} width={region.width} height={region.height} pointerEvents="none" />)}
        {showMedialG0Regions && medialG0Review && <text className={styles.medialAnalysisRoiLabel} x={medialG0Review.context.include[0].x + 12} y={medialG0Review.context.include[0].y + 26}>G0 분석 ROI</text>}
        {medialG0Review?.goldCase.elements.flatMap((element) => {
          if (element.face.status !== 'candidate' || element.visibleSpans.status !== 'candidate') return []
          const faceValue = element.face.value
          return element.visibleSpans.value.map((span, spanIndex) => element.orientation === 'vertical'
            ? <line key={`gold-${element.elementId}-${spanIndex}`} className={styles.medialFiniteGold} data-medial-gold-segment-id={element.elementId} data-medial-gold-span-index={spanIndex} x1={faceValue} x2={faceValue} y1={span.from} y2={span.to} />
            : <line key={`gold-${element.elementId}-${spanIndex}`} className={styles.medialFiniteGold} data-medial-gold-segment-id={element.elementId} data-medial-gold-span-index={spanIndex} x1={span.from} x2={span.to} y1={faceValue} y2={faceValue} />)
        })}
        {medialGuides.map((guide) => {
          const isActive = hoveredGuideIds.includes(medialHoverTarget(guide.source, guide.id))
          const className = `${guide.source === 'observation' ? styles.medialObservationGuide : styles.medialGuide} ${isActive ? styles.activeMedialGuide : ''}`
          return guide.axis === 'x'
            ? <line key={`${guide.source}-${guide.id}`} className={className} data-medial-overlay-id={guide.id} data-medial-overlay-source={guide.source} data-medial-overlay-active={isActive || undefined} x1={guide.value} x2={guide.value} y1="-120" y2="1120" />
            : <line key={`${guide.source}-${guide.id}`} className={className} data-medial-overlay-id={guide.id} data-medial-overlay-source={guide.source} data-medial-overlay-active={isActive || undefined} x1="-120" x2="1120" y1={guide.value} y2={guide.value} />
        })}
        <line className={styles.baseline} x1="-120" x2="1120" y1={display.baselineY} y2={display.baselineY} />
        {visibleGuides.map((guide) => {
          const value = guides[guide.id]
          const isActive = hoveredGuideIds.includes(guide.id)
          return guide.axis === 'y'
            ? <line key={guide.id} className={`${styles.draggableGuide} ${isActive ? styles.activeGuideLine : ''}`} data-guide-line-id={guide.id} data-guide-active={isActive || undefined} x1="-120" x2="1120" y1={value} y2={value} stroke={isActive ? guide.activeColor : guide.color} />
            : <line key={guide.id} className={`${styles.draggableGuide} ${isActive ? styles.activeGuideLine : ''}`} data-guide-line-id={guide.id} data-guide-active={isActive || undefined} x1={value} x2={value} y1="-120" y2="1120" stroke={isActive ? guide.activeColor : guide.color} />
        })}
        {glyph.missing ? (
          <text className={styles.missingGlyph} x="500" y="500" textAnchor="middle">글리프 없음</text>
        ) : (
          <g transform={`matrix(${display.unitsPerEm / glyph.unitsPerEm} 0 0 ${-(display.unitsPerEm / glyph.unitsPerEm)} 0 ${display.baselineY})`}>
            <path className={styles.glyphInk} d={glyph.path} />
          </g>
        )}
        {glyphScale !== null && finalDisplayCandidate?.memberPaths.map((memberPath) => {
          const active = hoveredGuideIds.includes(finalHoverTarget('member', memberPath.id))
          return (
            <g
              key={`final-member-${memberPath.id}`}
              className={`${styles.finalMemberPath} ${active ? styles.activeFinalMemberPath : ''}`}
              data-final-member-id={memberPath.id}
              data-final-member-active={active || undefined}
              transform={`matrix(${glyphScale} 0 0 ${-glyphScale} 0 ${display.baselineY})`}
            >
              <path d={memberPath.path} />
            </g>
          )
        })}
        {initialCandidate && initialSelectionArea && (['top', 'bottom', 'left', 'right'] as const).flatMap((side) => {
          const roleFace = initialCandidate.roleFaces[side]
          if (roleFace.status !== 'candidate') return []
          const active = hoveredGuideIds.includes(initialHoverTarget('role', side))
          return side === 'top' || side === 'bottom'
            ? <line key={`initial-role-${side}`} className={`${styles.initialRoleFace} ${active ? styles.activeInitialGeometry : ''}`} data-initial-role-face-side={side} data-initial-role-face-active={active || undefined} x1={initialSelectionArea.x} x2={initialSelectionArea.x + initialSelectionArea.width} y1={roleFace.value} y2={roleFace.value} />
            : <line key={`initial-role-${side}`} className={`${styles.initialRoleFace} ${active ? styles.activeInitialGeometry : ''}`} data-initial-role-face-side={side} data-initial-role-face-active={active || undefined} x1={roleFace.value} x2={roleFace.value} y1={initialSelectionArea.y} y2={initialSelectionArea.y + initialSelectionArea.height} />
        })}
        {initialCandidate && (['top', 'bottom', 'left', 'right'] as const).flatMap((side) => {
          const observation = initialCandidate.axisFaces[side]
          if (observation.status !== 'candidate') return []
          const active = hoveredGuideIds.includes(initialHoverTarget('axis', side))
          return observation.value.flatMap((face, faceIndex) => face.visibleSpans.map((span, spanIndex) => face.orientation === 'vertical'
            ? <line key={`initial-axis-${side}-${faceIndex}-${spanIndex}`} className={`${styles.initialAxisFace} ${active ? styles.activeInitialGeometry : ''}`} data-initial-axis-face-side={side} data-initial-axis-face-active={active || undefined} x1={face.value} x2={face.value} y1={span.from} y2={span.to} />
            : <line key={`initial-axis-${side}-${faceIndex}-${spanIndex}`} className={`${styles.initialAxisFace} ${active ? styles.activeInitialGeometry : ''}`} data-initial-axis-face-side={side} data-initial-axis-face-active={active || undefined} x1={span.from} x2={span.to} y1={face.value} y2={face.value} />))
        })}
        {finalDisplayCandidate && finalSelectionArea && (['top', 'bottom', 'left', 'right'] as const).flatMap((side) => {
          const roleFace = finalDisplayCandidate.roleFaces[side]
          if (roleFace.status !== 'candidate') return []
          const active = hoveredGuideIds.includes(finalHoverTarget('role', side))
          return side === 'top' || side === 'bottom'
            ? <line key={`final-role-${side}`} className={`${styles.finalRoleFace} ${active ? styles.activeFinalGeometry : ''}`} data-final-role-face-side={side} data-final-role-face-active={active || undefined} x1={finalSelectionArea.x} x2={finalSelectionArea.x + finalSelectionArea.width} y1={roleFace.value} y2={roleFace.value} />
            : <line key={`final-role-${side}`} className={`${styles.finalRoleFace} ${active ? styles.activeFinalGeometry : ''}`} data-final-role-face-side={side} data-final-role-face-active={active || undefined} x1={roleFace.value} x2={roleFace.value} y1={finalSelectionArea.y} y2={finalSelectionArea.y + finalSelectionArea.height} />
        })}
        {finalDisplayCandidate && (['top', 'bottom', 'left', 'right'] as const).flatMap((side) => {
          const observation = finalDisplayCandidate.axisFaces[side]
          if (observation.status !== 'candidate') return []
          const active = hoveredGuideIds.includes(finalHoverTarget('axis', side))
          return observation.value.flatMap((face, faceIndex) => face.visibleSpans.map((span, spanIndex) => face.orientation === 'vertical'
            ? <line key={`final-axis-${side}-${faceIndex}-${spanIndex}`} className={`${styles.finalAxisFace} ${active ? styles.activeFinalGeometry : ''}`} data-final-axis-face-side={side} data-final-axis-face-active={active || undefined} x1={face.value} x2={face.value} y1={span.from} y2={span.to} />
            : <line key={`final-axis-${side}-${faceIndex}-${spanIndex}`} className={`${styles.finalAxisFace} ${active ? styles.activeFinalGeometry : ''}`} data-final-axis-face-side={side} data-final-axis-face-active={active || undefined} x1={span.from} x2={span.to} y1={face.value} y2={face.value} />))
        })}
        {medialElementCandidates.flatMap((element) => {
          if (element.face.status !== 'candidate' || element.visibleSpans.status !== 'candidate') return []
          const faceValue = element.face.value
          const active = hoveredGuideIds.includes(medialElementHoverTarget(element.elementId))
          return element.visibleSpans.value.map((span, spanIndex) => element.orientation === 'vertical'
            ? <line key={`${element.elementId}-${spanIndex}`} className={`${styles.medialFiniteCandidate} ${active ? styles.activeMedialFiniteCandidate : ''}`} data-medial-face-segment-id={element.elementId} data-medial-face-span-index={spanIndex} data-medial-face-active={active || undefined} x1={faceValue} x2={faceValue} y1={span.from} y2={span.to} />
            : <line key={`${element.elementId}-${spanIndex}`} className={`${styles.medialFiniteCandidate} ${active ? styles.activeMedialFiniteCandidate : ''}`} data-medial-face-segment-id={element.elementId} data-medial-face-span-index={spanIndex} data-medial-face-active={active || undefined} x1={span.from} x2={span.to} y1={faceValue} y2={faceValue} />)
        })}
        {medialElementCandidates.flatMap((element) => {
          if (element.face.status !== 'candidate' || element.face.evidence.referenceMode !== 'start-side-local-tangent' || !element.face.evidence.anchor) return []
          const { x, y } = element.face.evidence.anchor
          const active = hoveredGuideIds.includes(medialElementHoverTarget(element.elementId))
          return <circle key={`anchor-${element.elementId}`} className={`${styles.medialLocalTangentAnchor} ${active ? styles.activeMedialTangentAnchor : ''}`} data-medial-local-tangent-anchor-id={element.elementId} data-medial-local-tangent-anchor-active={active || undefined} cx={x} cy={y} r="8" />
        })}
        <rect className={styles.guideHoverArea} data-guide-hover-area="true" x="-120" y="-120" width="1240" height="1240" onPointerMove={handleCanvasPointerMove} onPointerLeave={() => setHoveredGuides([])} />
      </svg>
      <footer className={styles.cardGuideControls}>
        {finalCandidate && (
          <section className={styles.finalComponentCandidate} data-testid="final-component-candidate" data-final-component-state={finalCandidate.state}>
            <header>
              <strong>받침 구조 fixture · 사용자 화면 검증</strong>
              <small>파랑=왼 구성원 · 주황=오른 구성원 · 보라=역할 영역</small>
            </header>
            {finalDisplayCandidate && finalSelectionArea ? (
              <>
                <small className={styles.finalComponentEvidence}>{finalDisplayCandidate.structureKind} · {finalDisplayCandidate.memberRelation?.relation ?? '단일 구성원'} · 영역 {Math.round(finalSelectionArea.width)}×{Math.round(finalSelectionArea.height)}</small>
                <div className={styles.finalMemberSummary}>
                  {finalDisplayCandidate.members.map((member) => {
                    const active = hoveredGuideIds.includes(finalHoverTarget('member', member.id))
                    return <span key={member.id} className={active ? styles.activeFinalMemberSummary : undefined} data-final-member-summary={member.id} onPointerEnter={() => setHoveredGuides([finalHoverTarget('member', member.id)])} onPointerLeave={() => setHoveredGuides([])}>{member.id === 'only' ? '단일 구성원' : member.id === 'left' ? '왼 구성원' : '오른 구성원'} · {member.jamo} · contour {member.contourIds.join(',')}</span>
                  })}
                </div>
                <div className={styles.finalFaceSummary}>
                  {(['top', 'bottom', 'left', 'right'] as const).map((side) => {
                    const roleFace = finalDisplayCandidate.roleFaces[side]
                    const inkBound = finalDisplayCandidate.inkBounds[side]
                    const axisFaces = finalDisplayCandidate.axisFaces[side]
                    const active = hoveredGuideIds.includes(finalHoverTarget('role', side)) || hoveredGuideIds.includes(finalHoverTarget('axis', side))
                    return (
                      <span key={side} className={active ? styles.activeFinalFaceSummary : undefined} data-final-face-summary={side} onPointerEnter={() => setHoveredGuides([finalHoverTarget('role', side), finalHoverTarget('axis', side)])} onPointerLeave={() => setHoveredGuides([])}>
                        {FINAL_COMPONENT_SIDE_LABELS[side]} {roleFace.status === 'candidate' ? Math.round(roleFace.value) : '포기'} · ink {inkBound.status === 'candidate' ? Math.round(inkBound.value) : '포기'} · axis {axisFaces.status === 'candidate' ? axisFaces.value.length : 0}
                      </span>
                    )
                  })}
                </div>
                <small className={styles.finalComponentEvidence}>원시 inkBounds · 선택 전 axisFaces · 판정 roleFaces · 네 역할 단면 파생 selectionArea 분리</small>
              </>
            ) : (
              <small className={styles.finalComponentEvidence}>안전 자동 포기 · {finalCandidate.state === 'abstained' ? finalCandidate.reasonCode : 'invalid-component-bounds'}</small>
            )}
          </section>
        )}
        {initialCandidate && (
          <section
            className={styles.initialComponentCandidate}
            data-testid="initial-component-candidate"
            data-initial-component-status={initialCandidate.componentGroup.status}
            data-initial-selection-rule={initialCandidate.componentGroup.status === 'candidate' ? initialCandidate.componentGroup.evidence.selectionRule : undefined}
          >
            <header>
              <strong>첫닿 구조 후보 · {INITIAL_COMPONENT_EXTRACTOR_VERSION}</strong>
              <small>초록 색면은 네 역할 단면 파생 · 색선은 선택 전 축평행 면 후보</small>
            </header>
            {initialCandidate.componentGroup.status === 'candidate' && initialCandidate.selectionArea.status === 'candidate' ? (
              <>
                <small className={styles.initialComponentEvidence}>구조 결속 {initialCandidate.componentGroup.evidence.selectionRule === 'context-directed-merged-boundary' ? '합쳐진 윤곽 경계 분리' : '문맥 방향 contour island'} · score {initialCandidate.componentGroup.evidence.score} · 영역 {Math.round(initialCandidate.selectionArea.value.width)}×{Math.round(initialCandidate.selectionArea.value.height)}</small>
                <div className={styles.initialFaceSummary}>
                  {(['top', 'bottom', 'left', 'right'] as const).map((side) => {
                    const roleFace = initialCandidate.roleFaces[side]
                    const faces = initialCandidate.axisFaces[side]
                    const active = hoveredGuideIds.includes(initialHoverTarget('role', side)) || hoveredGuideIds.includes(initialHoverTarget('axis', side))
                    return (
                      <span
                        key={side}
                        className={active ? styles.activeInitialFaceSummary : undefined}
                        data-initial-face-summary={side}
                        onPointerEnter={() => setHoveredGuides([initialHoverTarget('role', side), initialHoverTarget('axis', side)])}
                        onPointerLeave={() => setHoveredGuides([])}
                      >
                        {INITIAL_COMPONENT_SIDE_LABELS[side]} {roleFace.status === 'candidate' ? Math.round(roleFace.value) : '포기'} · 원시 면 후보 {faces.status === 'candidate' ? faces.value.length : 0}
                      </span>
                    )
                  })}
                </div>
              </>
            ) : (
              <small className={styles.initialComponentEvidence}>자동 포기 · {initialCandidate.componentGroup.status === 'abstained' ? initialCandidate.componentGroup.reasonCode : initialCandidate.selectionArea.status === 'abstained' ? initialCandidate.selectionArea.reasonCode : 'invalid-component-bounds'}</small>
            )}
          </section>
        )}
        {showLegacyGuides && <span className={styles.cardGuideSource}>{guideSource === 'override' ? '개별 조율값' : guideSource === 'base' ? '기준값' : '기본값'}</span>}
        {editableGuides.map((guide) => {
          const isActive = hoveredGuideIds.includes(guide.id)
          return (
          <label key={guide.id} className={`${styles.cardGuideControl} ${isActive ? styles.activeCardGuideControl : ''}`} data-card-guide-control-id={guide.id} data-guide-control-active={isActive || undefined} style={{ '--guide-color': guide.activeColor } as CSSProperties} onPointerEnter={() => setHoveredGuides([guide.id])} onPointerLeave={() => setHoveredGuides([])}>
            <span>{guide.label}</span>
            <input
              aria-label={`${glyph.character} · ${guide.label}`}
              type="number"
              min={GUIDE_MIN}
              max={GUIDE_MAX}
              step="1"
              inputMode="numeric"
              value={guides[guide.id]}
              onFocus={() => onGuideInputFocus(context.id, guide.id)}
              onChange={(event) => onGuideInputChange(context.id, guide.id, event.target.value)}
              onBlur={() => onGuideInputBlur(context.id, guide.id)}
              onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }}
            />
          </label>
          )
        })}
        {medialElementCandidates.length > 0 && (
          <section className={styles.medialElementCandidates} data-testid="medial-face-elements" aria-label={`${glyph.character} 유한 구조면 후보`}>
            <header>
              <strong>홀자 구조 후보 · {medialG0Review ? `${candidateExtractorVersion} ↔ G0 gold` : `${candidateExtractorVersion} 자동 추출 후보`}</strong>
              <small>{medialG0Review ? `주황선은 실시간 후보 · 청록선은 동결 gold · 허용 오차 ±${MEDIAL_G0_GOLD_TOLERANCE}` : '주황선은 실시간 분석 후보 · gold·생산값 아님'}</small>
            </header>
            <div className={styles.medialFaceSummary}>
              {medialElementCandidates.map((element) => {
                const goldElement = medialG0Review?.goldCase.elements.find(({ elementId }) => elementId === element.elementId)
                const goldComparison = goldElement ? compareMedialElementToGold(element, goldElement) : null
                const candidate = element.face.status === 'candidate' && element.visibleSpans.status === 'candidate'
                const active = hoveredGuideIds.includes(medialElementHoverTarget(element.elementId))
                return (
                  <article
                    key={element.elementId}
                    className={`${styles.medialElementCandidate} ${active ? styles.activeMedialElementCandidate : ''}`}
                    data-medial-element-id={element.elementId}
                    data-medial-element-status={candidate ? 'candidate' : 'abstained'}
                    data-medial-element-active={active || undefined}
                    data-medial-face-reference-mode={element.face.evidence.referenceMode}
                    data-medial-reference-side={element.face.evidence.referenceSide}
                    data-medial-match-confidence={element.match.confidence}
                    data-medial-face-value={element.face.status === 'candidate' ? Math.round(element.face.value) : undefined}
                    data-medial-visible-spans={element.visibleSpans.status === 'candidate' ? element.visibleSpans.value.map((span) => `${Math.round(span.from)}-${Math.round(span.to)}`).join('|') : undefined}
                    data-medial-gold-status={goldComparison?.status}
                    onPointerEnter={() => setHoveredGuides(candidate ? [medialElementHoverTarget(element.elementId)] : [])}
                    onPointerLeave={() => setHoveredGuides([])}
                  >
                    <strong>{MEDIAL_ELEMENT_LABELS[element.elementId]}</strong>
                    <span>{candidate && element.face.status === 'candidate'
                      ? `${element.faceSide === 'right' ? '오른면' : element.faceSide === 'left' ? '왼면' : element.faceSide === 'top' ? '윗면' : '아랫면'} ${Math.round(element.face.value)}`
                      : '자동 포기'}</span>
                    {element.face.evidence.referenceMode === 'start-side-local-tangent' && <small>국소 접선</small>}
                    {goldComparison && goldElement && <small className={goldComparison.status === 'match' ? styles.goldMatch : styles.goldMismatch}>{goldComparisonLabel(goldComparison, goldElement)}</small>}
                  </article>
                )
              })}
            </div>
          </section>
        )}
        <span className={styles.medialCardTitle}>자동 scalar 관측 보조 · finalJamo 분리 저장</span>
        {medialG0Review && (
          <div className={styles.medialG0Contract} data-testid="medial-g0-contract">
            <strong>G0 analysis gold · 생산값 아님</strong>
            <span>{medialG0Review.roleDefinitionVersion} · {medialG0Review.roiDefinitionVersion}</span>
            <code>{medialG0Review.tuningCase.elements.join(' · ')}</code>
            <small>면 위치와 복수 가시 구간 · 숨은 접합부는 관측값으로 복원하지 않음</small>
          </div>
        )}
        {medialRoles.map((role) => {
          const observation = medialObservations[role.id]
          const visibleObservation = observation?.review === 'rejected' ? undefined : observation
          const candidate = medialCandidates[role.id]
          const source = visibleObservation ? 'observation' : candidate && candidate.confidence !== 'abstained' ? 'candidate' : null
          const isActive = source !== null && hoveredGuideIds.includes(medialHoverTarget(source, role.id))
          return (
            <label key={`medial-${role.id}`} className={`${styles.medialCardControl} ${isActive ? styles.activeMedialCardControl : ''}`} data-medial-card-control-id={role.id} data-medial-card-control-active={isActive || undefined} style={{ '--guide-color': '#0f766e' } as CSSProperties} onPointerEnter={() => setHoveredGuides(source ? [medialHoverTarget(source, role.id)] : [])} onPointerLeave={() => setHoveredGuides([])}>
              <span>{role.label}</span>
              <div className={styles.medialCardInput}>
                <input
                  aria-label={`${glyph.character} · ${role.label}`}
                  type="number"
                  min={GUIDE_MIN}
                  max={GUIDE_MAX}
                  step="1"
                  inputMode="numeric"
                  placeholder="미측정"
                  value={visibleObservation?.value ?? ''}
                  onChange={(event) => {
                    const raw = event.target.value
                    onMedialObservationChange(context, role, raw === '' ? null : Number(raw), { method: 'manual', confidence: 'pending', review: manualReviewState(observation) }, false)
                  }}
                  onBlur={(event) => {
                    const raw = event.target.value
                    onMedialObservationChange(context, role, raw === '' ? null : Number(raw), { method: 'manual', confidence: 'pending', review: manualReviewState(observation) }, true)
                  }}
                  onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }}
                />
                {visibleObservation
                  ? <button type="button" disabled={visibleObservation.review === 'accepted-for-analysis'} onClick={() => onMedialObservationReview(context, role)}>{visibleObservation.review === 'accepted-for-analysis' ? '분석 채택됨' : '분석 채택'}</button>
                  : observation?.review === 'rejected'
                    ? <button type="button" disabled data-candidate-state="rejected">후보 거부됨</button>
                  : candidate && candidate.confidence !== 'abstained'
                    ? <>
                        <button type="button" title={candidate.evidence} data-candidate-origin="geometry-role-search" data-candidate-state="candidate" onClick={() => onMedialObservationChange(context, role, candidate.value, { method: 'automatic-candidate', confidence: candidate.confidence, review: 'pending' }, true)}>자동 후보 {candidate.value}</button>
                        <button type="button" className={styles.rejectCandidateButton} data-candidate-action="reject" onClick={() => onMedialObservationChange(context, role, candidate.value, { method: 'automatic-candidate', confidence: candidate.confidence, review: 'rejected' }, true)}>후보 거부</button>
                      </>
                    : candidate && <button type="button" disabled title={candidate.evidence} data-candidate-origin="abstained">후보 보류</button>}
              </div>
              {observation && <small className={styles.medialObservationState} data-observation-method={observation.method} data-observation-review={observation.review}>{observationStateLabel(observation)}</small>}
              {!observation && !candidate && <small className={styles.medialObservationState} data-candidate-state="unavailable">자동 후보 없음</small>}
              {candidate && <small className={styles.medialCandidateEvidence}>근거 · {candidate.evidence}</small>}
            </label>
          )
        })}
      </footer>
    </article>
  )
}

function InitialGuideLabPage() {
  const requestedFontId = useMemo(() => new URLSearchParams(window.location.search).get('font'), [])
  const [catalog, setCatalog] = useState<FontCatalogResponse | null>(null)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [activeFontId, setActiveFontId] = useState(requestedFontId ?? 'noto-sans-kr')
  const [comparison, setComparison] = useState<OutlineResponse | null>(null)
  const [comparisonError, setComparisonError] = useState<string | null>(null)
  const [medialCandidateResponse, setMedialCandidateResponse] = useState<MedialGuideCandidateResponse | null>(null)
  const [medialCandidateError, setMedialCandidateError] = useState<string | null>(null)
  const [initialComponentResponse, setInitialComponentResponse] = useState<InitialComponentCandidateResponse | null>(null)
  const [initialComponentError, setInitialComponentError] = useState<string | null>(null)
  const [finalComponentResponse, setFinalComponentResponse] = useState<FinalComponentDisplayResponse | null>(null)
  const [finalComponentError, setFinalComponentError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [guideProfile, setGuideProfile] = useState<FontGuideProfile>(() => emptyGuideProfile())
  const [activeInitial, setActiveInitial] = useState<InitialConsonant>('ㄱ')
  const [selectedMedials, setSelectedMedials] = useState<Record<MedialContext, Medial>>({ ...DEFAULT_MEDIALS })
  const [selectedFinalJamo, setSelectedFinalJamo] = useState<FinalJamo>('ㄱ')
  const [showG0AnalysisRegions, setShowG0AnalysisRegions] = useState(false)
  const [observationProfile, setObservationProfile] = useState<FontObservationProfile>(() => emptyObservationProfile())
  const guideProfileRef = useRef(guideProfile)
  const observationProfileRef = useRef(observationProfile)
  const editingGuideRef = useRef<{ initial: InitialConsonant; contextId: ContextId; id: GuideId; changed: boolean } | null>(null)
  const medialCandidateRequestFingerprintRef = useRef<string | null>(null)
  const initialComponentRequestFingerprintRef = useRef<string | null>(null)
  const finalComponentRequestFingerprintRef = useRef<string | null>(null)
  const activeFont = catalog?.fonts.find(({ id }) => id === activeFontId) ?? catalog?.fonts[0] ?? null
  const guidesByContext = useMemo(() => resolveGuides(guideProfile, activeInitial), [guideProfile, activeInitial])
  const currentCaseText = useMemo(() => caseText(activeInitial, selectedMedials, selectedFinalJamo), [activeInitial, selectedMedials, selectedFinalJamo])
  const g0ReviewEnabled = activeFont !== null && isG0ReviewFont(activeFont) && activeInitial === MEDIAL_GUIDE_P0_G0_FIXTURE.initialJamo
  const currentSelectionHasG0Gold = selectedFinalJamo === 'ㄱ' && g0ReviewEnabled && Object.values(selectedMedials).some((medial) => G0_TUNING_CASE_BY_MEDIAL.has(medial))
  const candidateEnabled = activeFont !== null && isP1CandidateFont(activeFont)
  const scalarCandidateEnabled = candidateEnabled && selectedFinalJamo === 'ㄱ'
  const finalComponentFontVerified = activeFont !== null && isFinalComponentVerifiedFont(activeFont)
  const finalComponentP0MedialsSelected = selectedMedials.right === 'ㅏ' && selectedMedials.bottom === 'ㅗ' && selectedMedials.mixed === 'ㅘ'
  const finalComponentEnabled = finalComponentFontVerified && finalComponentP0MedialsSelected
  const p1RiskReviewEnabled = catalog?.fonts.some(isP1CandidateFont) ?? false
  const candidateCases = useMemo(() => scalarCandidateEnabled ? CASE_CONTEXTS.map((context) => {
    const medial = selectedMedials[context.medialContext]
    return {
      character: caseCharacter(context, activeInitial, selectedMedials, selectedFinalJamo),
      initialJamo: activeInitial,
      medialJamo: medial,
      finalJamo: context.hasFinal ? 'ㄱ' : null,
    }
  }) : [], [activeInitial, scalarCandidateEnabled, selectedFinalJamo, selectedMedials])
  const initialComponentCases = useMemo<readonly InitialComponentRequestCase[]>(() => scalarCandidateEnabled ? CASE_CONTEXTS.flatMap((context) => {
    const medial = INITIAL_COMPONENT_P0_MEDIALS[context.medialContext]
    if (selectedMedials[context.medialContext] !== medial) return []
    return [{
      character: caseCharacter(context, activeInitial, selectedMedials, selectedFinalJamo),
      initialJamo: activeInitial,
      medialJamo: medial,
      finalJamo: context.hasFinal ? 'ㄱ' : null,
      contextId: INITIAL_COMPONENT_CONTEXT_BY_CARD[context.id],
    }]
  }) : [], [activeInitial, scalarCandidateEnabled, selectedFinalJamo, selectedMedials])
  const finalComponentCases = useMemo<readonly FinalComponentDisplayInputCase[]>(() => finalComponentEnabled ? CASE_CONTEXTS.flatMap((context) => {
    const contextId = FINAL_COMPONENT_CONTEXT_BY_CARD[context.id]
    if (!context.hasFinal || !contextId) return []
    const medial = INITIAL_COMPONENT_P0_MEDIALS[context.medialContext]
    if (selectedMedials[context.medialContext] !== medial) return []
    return [{
      character: caseCharacter(context, activeInitial, selectedMedials, selectedFinalJamo),
      initialJamo: activeInitial,
      medialJamo: medial,
      finalJamo: selectedFinalJamo,
      contextId,
    }]
  }) : [], [activeInitial, finalComponentEnabled, selectedFinalJamo, selectedMedials])
  const candidateOutlineGlyphs = useMemo<readonly GlyphOutline[] | null>(() => {
    if (!activeFont || comparison?.text !== currentCaseText) return null
    const sample = comparison.samples.find(({ fontId }) => fontId === activeFont.id)
    if (!sample) return null
    const glyphByCharacter = new Map(sample.glyphs.map((glyph) => [glyph.character, glyph]))
    const ordered = candidateCases.map(({ character }) => glyphByCharacter.get(character))
    return ordered.every((glyph) => glyph !== undefined) ? ordered : null
  }, [activeFont, comparison, currentCaseText, candidateCases])
  const initialComponentOutlineGlyphs = useMemo<readonly GlyphOutline[] | null>(() => {
    if (!activeFont || comparison?.text !== currentCaseText) return null
    const sample = comparison.samples.find(({ fontId }) => fontId === activeFont.id)
    if (!sample) return null
    const glyphByCharacter = new Map(sample.glyphs.map((glyph) => [glyph.character, glyph]))
    const ordered = initialComponentCases.map(({ character }) => glyphByCharacter.get(character))
    return ordered.every((glyph) => glyph !== undefined) ? ordered : null
  }, [activeFont, comparison, currentCaseText, initialComponentCases])
  const finalComponentOutlineGlyphs = useMemo<readonly GlyphOutline[] | null>(() => {
    if (!activeFont || comparison?.text !== currentCaseText) return null
    const sample = comparison.samples.find(({ fontId }) => fontId === activeFont.id)
    if (!sample) return null
    const glyphByCharacter = new Map(sample.glyphs.map((glyph) => [glyph.character, glyph]))
    const ordered = finalComponentCases.map(({ character }) => glyphByCharacter.get(character))
    return ordered.every((glyph) => glyph !== undefined) ? ordered : null
  }, [activeFont, comparison, currentCaseText, finalComponentCases])
  const medialCandidateByCharacter = useMemo(() => new Map(
    (medialCandidateResponse?.cases ?? []).map((candidateCase) => [candidateCase.character, candidateCase]),
  ), [medialCandidateResponse])
  const initialComponentByCharacter = useMemo(() => new Map(
    (initialComponentResponse?.cases ?? []).map((candidateCase) => [candidateCase.character, candidateCase]),
  ), [initialComponentResponse])
  const finalComponentByCharacter = useMemo(() => new Map(
    (finalComponentResponse?.cases ?? []).map((candidateCase) => [candidateCase.identity.character, candidateCase]),
  ), [finalComponentResponse])
  const g0ComparisonSummary = useMemo<MedialG0ComparisonSummary | null>(() => {
    if (!medialCandidateResponse) return null
    const comparisons = medialCandidateResponse.cases.flatMap((candidateCase) => {
      const goldCase = medialGuideG0GoldCase(candidateCase.character)
      if (!goldCase) return []
      if (candidateCase.status === 'abstained') return goldCase.elements.map((goldElement) => ({
        comparison: compareMedialElementToGold(undefined, goldElement),
        confidence: 'abstained' as const,
      }))
      return goldCase.elements.map((goldElement) => {
        const actual = candidateCase.elements.find(({ elementId }) => elementId === goldElement.elementId)
        return {
          comparison: compareMedialElementToGold(actual, goldElement),
          confidence: actual?.match.confidence ?? 'abstained',
        }
      })
    })
    if (comparisons.length === 0) return null
    return {
      matched: comparisons.filter(({ comparison }) => comparison.status === 'match').length,
      total: comparisons.length,
      maximumCoordinateDelta: comparisons.reduce((maximum, { comparison }) => Math.max(maximum, comparison.maximumCoordinateDelta ?? 0), 0),
      highConfidence: comparisons.filter(({ confidence }) => confidence === 'high').length,
      highConfidenceMismatches: comparisons.filter(({ confidence, comparison }) => confidence === 'high' && comparison.status === 'mismatch').length,
    }
  }, [medialCandidateResponse])

  const handleObservationChange = (
    medial: Medial,
    hasFinal: boolean,
    role: RoleDefinition,
    value: number | null,
    source: Pick<ObservationValue, 'method' | 'confidence' | 'review'>,
    persist: boolean,
  ) => {
    if (value !== null && !Number.isFinite(value)) return
    const next = updateObservation(
      observationProfileRef.current,
      activeInitial,
      medial,
      hasFinal ? 'ㄱ' : null,
      role,
      value,
      source,
    )
    observationProfileRef.current = next
    setObservationProfile(next)
    if (persist && activeFont) writeObservationProfile(activeFont, next)
  }

  const handleMedialObservationChange = (context: CaseContext, role: RoleDefinition, value: number | null, source: Pick<ObservationValue, 'method' | 'confidence' | 'review'>, persist: boolean) => {
    handleObservationChange(selectedMedials[context.medialContext], context.hasFinal, role, value, source, persist)
  }

  const handleMedialObservationReview = (context: CaseContext, role: RoleDefinition) => {
    const medial = selectedMedials[context.medialContext]
    const finalJamo = context.hasFinal ? 'ㄱ' : null
    const current = observationValues(observationProfileRef.current, activeInitial, medial, finalJamo)[role.id]
    if (!current || !activeFont) return
    const next = updateObservation(observationProfileRef.current, activeInitial, medial, finalJamo, role, current.value, { ...current, review: 'accepted-for-analysis' })
    observationProfileRef.current = next
    setObservationProfile(next)
    writeObservationProfile(activeFont, next)
  }

  const handleSelectG0TuningCase = (tuningCase: MedialGuideG0TuningCase) => {
    setSelectedFinalJamo('ㄱ')
    setSelectedMedials((current) => current[tuningCase.medialContext] === tuningCase.medialJamo
      ? current
      : { ...current, [tuningCase.medialContext]: tuningCase.medialJamo })
  }

  const handleSelectP1RiskSample = (sample: P1RiskReviewSample) => {
    setActiveFontId(sample.fontId)
    setActiveInitial(sample.initialJamo)
    setSelectedMedials({ ...sample.medials })
    setSelectedFinalJamo('ㄱ')
  }

  const applyGuides = (initial: InitialConsonant, contextId: ContextId, next: GuideSet, persist: boolean) => {
    const nextProfile: FontGuideProfile = {
      ...guideProfileRef.current,
      overrides: {
        ...guideProfileRef.current.overrides,
        [initial]: { ...guideProfileRef.current.overrides[initial], [contextId]: next },
      },
    }
    guideProfileRef.current = nextProfile
    setGuideProfile(nextProfile)
    if (persist && activeFont) {
      writeGuideProfile(activeFont, nextProfile)
    }
  }

  const handleGuideInputFocus = (contextId: ContextId, id: GuideId) => {
    editingGuideRef.current = { initial: activeInitial, contextId, id, changed: false }
  }

  const handleGuideInputChange = (contextId: ContextId, id: GuideId, rawValue: string) => {
    const value = Number(rawValue)
    if (!Number.isFinite(value)) return
    const editing = editingGuideRef.current
    if (editing?.initial === activeInitial && editing.contextId === contextId && editing.id === id) editing.changed = true
    const currentGuides = resolveGuides(guideProfileRef.current, activeInitial)
    applyGuides(activeInitial, contextId, updateGuide(CONTEXT_BY_ID.get(contextId)!, currentGuides[contextId], id, value), false)
  }

  const handleGuideInputBlur = (contextId: ContextId, id: GuideId) => {
    const editing = editingGuideRef.current
    editingGuideRef.current = null
    if (!editing || !editing.changed || editing.initial !== activeInitial || editing.contextId !== contextId || editing.id !== id) return
    const currentGuides = resolveGuides(guideProfileRef.current, activeInitial)
    applyGuides(activeInitial, contextId, currentGuides[contextId], true)
  }

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    async function loadCatalog(): Promise<void> {
      try {
        const response = await fetch(FONT_CATALOG_URL, { headers: { Accept: 'application/json' }, credentials: 'same-origin', signal: controller.signal })
        const parsed = parseFontCatalogResponse(await requireSuccessfulJson(response))
        if (active) {
          setCatalog(parsed)
          setActiveFontId((currentFontId) => (
            parsed.fonts.some(({ id }) => id === currentFontId) ? currentFontId : parsed.fonts[0].id
          ))
        }
      } catch (error) {
        if (active && !isAbortError(error)) setCatalogError(describeError(error))
      }
    }
    void loadCatalog()
    return () => { active = false; controller.abort() }
  }, [])

  useEffect(() => {
    if (!activeFont) return
    const next = readGuideProfile(activeFont)
    guideProfileRef.current = next
    setGuideProfile(next)
  }, [activeFont, activeInitial])

  useEffect(() => {
    if (!activeFont) return
    const next = readObservationProfile(activeFont)
    observationProfileRef.current = next
    setObservationProfile(next)
  }, [activeFont])

  useEffect(() => {
    if (!activeFont) return
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return
      const next = readGuideProfile(activeFont)
      guideProfileRef.current = next
      setGuideProfile(next)
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [activeFont])

  useEffect(() => {
    if (!catalog || !activeFont) return
    const fontForRequest = activeFont
    const controller = new AbortController()
    let active = true
    async function loadOutlines(): Promise<void> {
      setLoading(true)
      setComparisonError(null)
      try {
        const response = await fetch(OUTLINE_URL, {
          method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, credentials: 'same-origin',
          body: JSON.stringify({ text: currentCaseText, fontIds: [fontForRequest.id] }), signal: controller.signal,
        })
        const parsed = parseOutlineResponse(await requireSuccessfulJson(response))
        validateOutlineCoverage(parsed, currentCaseText, [fontForRequest])
        if (active) setComparison(parsed)
      } catch (error) {
        if (active && !isAbortError(error)) setComparisonError(describeError(error))
      } finally {
        if (active) setLoading(false)
      }
    }
    void loadOutlines()
    return () => { active = false; controller.abort() }
  }, [catalog, activeFont, currentCaseText])

  useEffect(() => {
    if (!activeFont || candidateCases.length === 0 || !candidateOutlineGlyphs) {
      medialCandidateRequestFingerprintRef.current = null
      setMedialCandidateResponse(null)
      setMedialCandidateError(null)
      return
    }
    const requestedFont = activeFont
    const requestedCharacters = candidateCases.map(({ character }) => character)
    const identities = candidateOutlineGlyphs.map((glyph, index) => createCandidateCacheIdentity(
      requestedFont,
      requestedCharacters[index],
      glyph.missing ? MISSING_GLYPH_PATH_IDENTITY : glyph.pathSha256,
    ))
    const fingerprint = candidateRequestFingerprint(identities)
    medialCandidateRequestFingerprintRef.current = fingerprint
    const cached = readCachedCandidateCases(window.localStorage, identities)
    const cachedCases = orderedCachedCases(identities, cached)
    if (cachedCases) {
      setMedialCandidateResponse(candidateResponseFromCases(requestedFont, cachedCases))
      setMedialCandidateError(null)
      return
    }
    const missingIdentities = identities.filter(({ key }) => !cached.has(key))
    const missingKeys = new Set(missingIdentities.map(({ key }) => key))
    const missingCases = candidateCases.filter((_, index) => missingKeys.has(identities[index].key))
    const controller = new AbortController()
    let active = true
    setMedialCandidateResponse(null)
    setMedialCandidateError(null)
    async function loadMedialCandidates(): Promise<void> {
      try {
        const response = await fetch(MEDIAL_CANDIDATE_URL, {
          method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, credentials: 'same-origin',
          body: JSON.stringify({ fontId: requestedFont.id, cases: missingCases }), signal: controller.signal,
        })
        const parsed = parseMedialGuideCandidateResponse(await requireSuccessfulJson(response))
        if (parsed.font.id !== requestedFont.id || parsed.font.fileSha256 !== requestedFont.fileSha256) throw new Error('홀자 후보의 폰트 identity가 현재 선택과 다릅니다.')
        if (normalizedAxesKey(parsed.font.axes) !== normalizedAxesKey(requestedFont.axes)) throw new Error('홀자 후보의 축 identity가 현재 선택과 다릅니다.')
        if (parsed.cases.length !== missingCases.length || parsed.cases.some((candidateCase, index) => candidateCase.character !== missingCases[index].character)) throw new Error('홀자 후보의 글자 순서가 현재 요청과 다릅니다.')
        if (parsed.cases.some((candidateCase, index) => (
          candidateCase.status === 'candidate'
            ? candidateCase.pathSha256 !== missingIdentities[index].pathSha256
            : missingIdentities[index].pathSha256 !== MISSING_GLYPH_PATH_IDENTITY
        ))) throw new Error('홀자 후보의 path identity가 현재 윤곽과 다릅니다.')
        writeCandidateCacheCases(window.localStorage, missingIdentities, parsed.cases)
        const fresh = new Map(parsed.cases.map((candidateCase, index) => [missingIdentities[index].key, candidateCase]))
        const merged = orderedCachedCases(identities, new Map([...cached, ...fresh]))
        if (!merged) throw new Error('홀자 후보 cache 병합 결과가 불완전합니다.')
        if (active && medialCandidateRequestFingerprintRef.current === fingerprint) {
          setMedialCandidateResponse(candidateResponseFromCases(requestedFont, merged))
        }
      } catch (error) {
        if (active && medialCandidateRequestFingerprintRef.current === fingerprint && !isAbortError(error)) setMedialCandidateError(describeError(error))
      }
    }
    void loadMedialCandidates()
    return () => { active = false; controller.abort() }
  }, [activeFont, candidateOutlineGlyphs, candidateCases])

  useEffect(() => {
    if (!activeFont || initialComponentCases.length === 0 || !initialComponentOutlineGlyphs) {
      initialComponentRequestFingerprintRef.current = null
      setInitialComponentResponse(null)
      setInitialComponentError(null)
      return
    }
    const requestedFont = activeFont
    const requestedCharacters = initialComponentCases.map(({ character }) => character)
    const identities = initialComponentOutlineGlyphs.map((glyph, index) => createInitialComponentCacheIdentity(
      requestedFont,
      requestedCharacters[index],
      glyph.missing ? INITIAL_COMPONENT_MISSING_GLYPH_PATH_IDENTITY : glyph.pathSha256,
    ))
    const fingerprint = initialComponentRequestFingerprint(identities)
    initialComponentRequestFingerprintRef.current = fingerprint
    const cached = readCachedInitialComponentCases(window.localStorage, identities)
    const cachedCases = orderedInitialComponentCases(identities, cached)
    if (cachedCases) {
      setInitialComponentResponse(initialComponentResponseFromCases(requestedFont, cachedCases))
      setInitialComponentError(null)
      return
    }
    const missingIdentities = identities.filter(({ key }) => !cached.has(key))
    const missingKeys = new Set(missingIdentities.map(({ key }) => key))
    const missingCases = initialComponentCases.filter((_, index) => missingKeys.has(identities[index].key))
    const controller = new AbortController()
    let active = true
    setInitialComponentResponse(null)
    setInitialComponentError(null)
    async function loadInitialComponentCandidates(): Promise<void> {
      try {
        const response = await fetch(INITIAL_COMPONENT_CANDIDATE_URL, {
          method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, credentials: 'same-origin',
          body: JSON.stringify({ fontId: requestedFont.id, cases: missingCases }), signal: controller.signal,
        })
        const parsed = parseInitialComponentCandidateResponse(await requireSuccessfulJson(response))
        if (parsed.font.id !== requestedFont.id || parsed.font.fileSha256 !== requestedFont.fileSha256) throw new Error('첫닿 후보의 폰트 identity가 현재 선택과 다릅니다.')
        if (normalizedAxesKey(parsed.font.axes) !== normalizedAxesKey(requestedFont.axes)) throw new Error('첫닿 후보의 축 identity가 현재 선택과 다릅니다.')
        if (parsed.cases.length !== missingCases.length || parsed.cases.some((candidateCase, index) => candidateCase.character !== missingCases[index].character)) throw new Error('첫닿 후보의 글자 순서가 현재 요청과 다릅니다.')
        if (parsed.cases.some((candidateCase, index) => (
          candidateCase.status === 'candidate'
            ? candidateCase.pathSha256 !== missingIdentities[index].pathSha256
            : missingIdentities[index].pathSha256 !== INITIAL_COMPONENT_MISSING_GLYPH_PATH_IDENTITY
        ))) throw new Error('첫닿 후보의 path identity가 현재 윤곽과 다릅니다.')
        writeInitialComponentCacheCases(window.localStorage, missingIdentities, parsed.cases)
        const fresh = new Map(parsed.cases.map((candidateCase, index) => [missingIdentities[index].key, candidateCase]))
        const merged = orderedInitialComponentCases(identities, new Map([...cached, ...fresh]))
        if (!merged) throw new Error('첫닿 후보 cache 병합 결과가 불완전합니다.')
        if (active && initialComponentRequestFingerprintRef.current === fingerprint) {
          setInitialComponentResponse(initialComponentResponseFromCases(requestedFont, merged))
        }
      } catch (error) {
        if (active && initialComponentRequestFingerprintRef.current === fingerprint && !isAbortError(error)) setInitialComponentError(describeError(error))
      }
    }
    void loadInitialComponentCandidates()
    return () => { active = false; controller.abort() }
  }, [activeFont, initialComponentOutlineGlyphs, initialComponentCases])

  useEffect(() => {
    const requestedOutlines = finalComponentOutlineGlyphs
    if (!activeFont || finalComponentCases.length === 0 || !requestedOutlines) {
      finalComponentRequestFingerprintRef.current = null
      setFinalComponentResponse(null)
      setFinalComponentError(null)
      return
    }
    const displayOutlines: readonly GlyphOutline[] = requestedOutlines
    const requestedFont = activeFont
    const fingerprint = [
      requestedFont.id,
      requestedFont.fileSha256,
      normalizedAxesKey(requestedFont.axes),
      ...displayOutlines.map((glyph) => glyph.missing ? 'glyph-missing' : glyph.pathSha256),
    ].join(':')
    finalComponentRequestFingerprintRef.current = fingerprint
    const controller = new AbortController()
    let active = true
    setFinalComponentResponse(null)
    setFinalComponentError(null)
    async function loadFinalComponentDisplay(): Promise<void> {
      try {
        const response = await fetch(FINAL_COMPONENT_DISPLAY_URL, {
          method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, credentials: 'same-origin',
          body: JSON.stringify({ fontId: requestedFont.id, cases: finalComponentCases }), signal: controller.signal,
        })
        const parsed = parseFinalComponentDisplayResponse(await requireSuccessfulJson(response))
        if (!finalComponentDisplaySourceIsVerified(parsed)) throw new Error('받침 화면은 사용자 검증 fixture만 표시할 수 있습니다.')
        if (parsed.font.id !== requestedFont.id || parsed.font.fileSha256 !== requestedFont.fileSha256) throw new Error('받침 fixture의 폰트 identity가 현재 선택과 다릅니다.')
        if (normalizedAxesKey(parsed.font.axes) !== normalizedAxesKey(requestedFont.axes)) throw new Error('받침 fixture의 축 identity가 현재 선택과 다릅니다.')
        if (parsed.cases.length !== finalComponentCases.length || parsed.cases.some((candidateCase, index) => {
          const requestedCase = finalComponentCases[index]
          return candidateCase.identity.character !== requestedCase.character
            || candidateCase.identity.initialJamo !== requestedCase.initialJamo
            || candidateCase.identity.medialJamo !== requestedCase.medialJamo
            || candidateCase.identity.finalJamo !== requestedCase.finalJamo
            || candidateCase.identity.contextId !== requestedCase.contextId
        })) throw new Error('받침 fixture의 사례 순서가 현재 요청과 다릅니다.')
        if (parsed.cases.some((candidateCase, index) => {
          const glyph = displayOutlines[index]
          return glyph.missing || !finalComponentDisplayCaseMatchesOutline(candidateCase, glyph.pathSha256)
        })) throw new Error('받침 fixture의 path identity가 현재 윤곽과 다릅니다.')
        if (active && finalComponentRequestFingerprintRef.current === fingerprint) setFinalComponentResponse(parsed)
      } catch (error) {
        if (active && finalComponentRequestFingerprintRef.current === fingerprint && !isAbortError(error)) setFinalComponentError(describeError(error))
      }
    }
    void loadFinalComponentDisplay()
    return () => { active = false; controller.abort() }
  }, [activeFont, finalComponentCases, finalComponentOutlineGlyphs])

  const glyphs = comparison?.samples.find(({ fontId }) => fontId === activeFont?.id)?.glyphs ?? []
  const showsInitialComponentCandidates = initialComponentResponse?.cases.some((candidateCase) => candidateCase.status === 'candidate') ?? false
  const showsFinalComponentDisplay = finalComponentResponse !== null
  const showsFinalComponentCandidates = finalComponentResponse?.cases.some(isFinalComponentDisplayCandidate) ?? false

  return (
    <main className={styles.page} data-testid="font-guide-lab">
      <header className={styles.hero}>
        <span>R0 분석 보드 · 폰트별 조율값</span>
        <h1>기준선 조율 랩</h1>
        <a href="/noto-corpus-lab">Noto 전체 추출 진행·검수 보기</a>
        <p>폰트와 조합 문맥마다 기준선 세트를 따로 조율합니다. 이 값은 분석용이며 폰트메이커 레이아웃이나 OTF에 자동 반영되지 않습니다.</p>
      </header>

      {catalog && activeFont && (
        <section className={styles.fontSwitch} aria-label="조율 폰트 선택">
          <span>조율할 폰트</span>
          <div>{catalog.fonts.map((font) => (
            <button key={font.id} type="button" aria-pressed={font.id === activeFont.id} className={font.id === activeFont.id ? styles.activeFont : undefined} onClick={() => setActiveFontId(font.id)}>{font.family}</button>
          ))}</div>
        </section>
      )}

      {catalog && activeFont && (
        <section className={styles.initialSwitch} aria-label="첫닿자 비교 선택">
          <span>첫닿자 비교</span>
          <div>{INITIAL_CONSONANTS.map((consonant) => (
            <button key={consonant} type="button" aria-pressed={consonant === activeInitial} className={consonant === activeInitial ? styles.activeInitial : undefined} onClick={() => setActiveInitial(consonant)}>{consonant}</button>
          ))}</div>
        </section>
      )}

      {catalog && activeFont && (
        <section className={styles.medialSwitch} aria-label="문맥 홀자 선택">
          <span>문맥 홀자</span>
          <div>{(['right', 'bottom', 'mixed'] as const).map((context) => (
            <section key={context} className={styles.medialButtonGroup} aria-label={`${context === 'right' ? '오른쪽' : context === 'bottom' ? '아래' : '섞임'} 홀자`}>
              <small>{context === 'right' ? '오른쪽' : context === 'bottom' ? '아래' : '섞임'}</small>
              <div>{MEDIAL_OPTIONS[context].map((medial) => <button key={medial} type="button" aria-pressed={selectedMedials[context] === medial} className={selectedMedials[context] === medial ? styles.activeMedial : undefined} onClick={() => setSelectedMedials((current) => ({ ...current, [context]: medial }))}>{medial}</button>)}</div>
            </section>
          ))}</div>
        </section>
      )}

      {catalog && activeFont && (
        <section className={styles.finalSwitch} aria-label="받침 27종 선택">
          <span>받침 27종</span>
          <label>
            <span>받침</span>
            <select aria-label="받침 선택" value={selectedFinalJamo} onChange={(event) => {
              const next = FINAL_COMPONENT_P0_CONTRACT.finalJamos.find((jamo) => jamo === event.target.value)
              if (next) setSelectedFinalJamo(next)
            }}>
              {FINAL_COMPONENT_P0_CONTRACT.finalJamos.map((jamo) => <option key={jamo} value={jamo}>{jamo}</option>)}
            </select>
          </label>
          <small>{finalComponentEnabled ? '검증 fixture 표시 · 생산 자모·OTF 값 아님' : finalComponentFontVerified ? '받침 fixture는 ㅏ·ㅗ·ㅘ 문맥만 표시' : '현재 폰트는 받침 검증 fixture 없음'}</small>
        </section>
      )}

      {g0ReviewEnabled && selectedFinalJamo === 'ㄱ' && (
        <section className={styles.g0Review} data-testid="medial-g0-review" aria-label="G0 gold 검토 사례">
          <header>
            <div>
              <span>G0 ANALYSIS GOLD</span>
              <strong>14글자 · {G0_ELEMENT_COUNT}요소 · 2026-09-14 동결</strong>
              {g0ComparisonSummary && <small className={g0ComparisonSummary.matched === g0ComparisonSummary.total ? styles.g0ComparisonMatch : styles.g0ComparisonMismatch} data-testid="medial-g0-comparison-summary">현재 화면 {g0ComparisonSummary.matched}/{g0ComparisonSummary.total} 일치 · 최대 Δ{Number(g0ComparisonSummary.maximumCoordinateDelta.toFixed(3))} · high {g0ComparisonSummary.highConfidence} · high 오선택 {g0ComparisonSummary.highConfidenceMismatches}</small>}
            </div>
            <p>사용자 시각 검증을 통과한 v3 면 위치·유한 가시 구간입니다. 분석 회귀 기준이며 생산 자모·폰트 값으로 승격하지 않습니다.</p>
            <button type="button" className={styles.g0RegionToggle} aria-pressed={showG0AnalysisRegions} onClick={() => setShowG0AnalysisRegions((visible) => !visible)}>{showG0AnalysisRegions ? '분석 ROI 숨기기' : '분석 ROI 보기'}</button>
          </header>
          <div className={styles.g0ReviewCases}>
            {MEDIAL_GUIDE_P0_G0_FIXTURE.tuningCases.map((tuningCase) => {
              const selected = selectedMedials[tuningCase.medialContext] === tuningCase.medialJamo
              return (
                <button key={tuningCase.medialJamo} type="button" aria-label={`${tuningCase.characters.join('·')} G0 검토`} aria-pressed={selected} className={selected ? styles.activeG0ReviewCase : undefined} onClick={() => handleSelectG0TuningCase(tuningCase)}>
                  <span>{tuningCase.medialJamo} · {tuningCase.characters.join('·')}</span><small>{tuningCase.elements.length * 2}요소</small>
                </button>
              )
            })}
          </div>
        </section>
      )}

      {p1RiskReviewEnabled && activeFont && selectedFinalJamo === 'ㄱ' && (
        <section className={`${styles.g0Review} ${styles.p1RiskReview}`} data-testid="medial-p1-risk-review" aria-label="P1 위험 표본 검토">
          <header>
            <div>
              <span>P1 RISK REVIEW</span>
              <strong>5세트 · 30글자 · v9 사용자 확인 완료</strong>
            </div>
            <p>v8은 풔·풕 등 11문맥에서 초성을 고른 오류로 폐기했습니다. 혼합 바탕 보 안쪽 줄기 결속을 추가한 v9는 두 폰트 380카드 자체 화면검증과 풔·풕 사용자 확인을 통과했습니다. 결과는 분석 관측이며 생산값으로 자동 승격하지 않습니다.</p>
          </header>
          <div className={styles.g0ReviewCases}>
            {P1_RISK_REVIEW_SAMPLES.map((sample) => {
              const active = activeFont.id === sample.fontId
                && activeInitial === sample.initialJamo
                && Object.entries(sample.medials).every(([context, medial]) => selectedMedials[context as MedialContext] === medial)
              return (
                <button key={sample.id} type="button" data-p1-risk-sample={sample.id} aria-label={`${sample.label} 위험 표본`} aria-pressed={active} className={active ? styles.activeG0ReviewCase : undefined} onClick={() => handleSelectP1RiskSample(sample)}>
                  <span>{sample.label}</span><small>{sample.initialJamo} · {sample.note}</small>
                </button>
              )
            })}
          </div>
        </section>
      )}

      {catalogError && <p className={styles.error} role="alert">{catalogError}</p>}
      {comparisonError && <p className={styles.error} role="alert">{comparisonError}</p>}
      {medialCandidateError && <p className={styles.error} role="alert">유한 구조면 후보 오류 · {medialCandidateError}</p>}
      {initialComponentError && <p className={styles.error} role="alert">첫닿 구조 후보 오류 · {initialComponentError}</p>}
      {finalComponentError && <p className={styles.error} role="alert">받침 구조 fixture 오류 · {finalComponentError}</p>}
      {catalog === null && !catalogError && <p className={styles.status} role="status">로컬 폰트 목록을 읽는 중…</p>}

      {catalog && activeFont && (
          <section className={styles.guideBoard} aria-label={`${activeFont.family} 기준선 조율 대지`}>
            <header className={styles.boardHeader}>
              <div><span>GUIDE CANVAS</span><h2>문맥별 기준선으로 조합 사례 확인</h2><p className={styles.boardNote}>첫닿자·홀자·받침 관계를 같은 카드에서 봅니다. 고정 기준선 {BASELINE_Y}, 홀자 구조면, 첫닿 P0와 검증 fixture 받침 역할 단면·파생 영역을 표시합니다. 레거시 첫닿·받침·기둥선은 숨깁니다.</p></div>
              <ul className={styles.legend}>
                <li><i className={styles.baselineMark} />고정 기준선 {BASELINE_Y}</li>
                {showsInitialComponentCandidates && <li><i className={styles.initialAreaMark} />첫닿 역할 색면</li>}
                {showsInitialComponentCandidates && <li><i className={styles.initialRoleMark} />첫닿 네 역할 단면</li>}
                {showsInitialComponentCandidates && <li><i className={styles.initialFaceMark} />첫닿 원시 면 후보</li>}
                {showsFinalComponentDisplay && <li><i className={styles.finalAreaMark} />받침 역할 색면</li>}
                {showsFinalComponentCandidates && <li><i className={styles.finalMemberMark} />받침 구성원</li>}
                {showsFinalComponentCandidates && <li><i className={styles.finalFaceMark} />받침 역할·원시 면</li>}
                {currentSelectionHasG0Gold && <li><i className={styles.goldMark} />G0 gold</li>}
                <li><i className={styles.candidateMark} />자동 후보 관측선</li>
                {currentSelectionHasG0Gold && showG0AnalysisRegions && <li><i className={styles.roiMark} />G0 분석 ROI</li>}
              </ul>
            </header>
            {loading && <p className={styles.status} role="status">조합 사례 윤곽을 읽는 중…</p>}
            {!loading && glyphs.length > 0 && (
              <div className={styles.caseGrid}>
                {CASE_PAIRS.map((pair) => (
                  <section key={pair.label} className={styles.casePair} data-testid="font-guide-pair" aria-label={pair.label}>
                    <h3>{pair.label}</h3>
                    {pair.contextIds.map((contextId) => {
                      const context = CONTEXT_BY_ID.get(contextId)!
                      const glyph = glyphs.find((candidate) => candidate.character === caseCharacter(context, activeInitial, selectedMedials, selectedFinalJamo))
                      const finiteCandidateCase = glyph && !glyph.missing ? medialCandidateByCharacter.get(glyph.character) : undefined
                      const medialElementCandidates = glyph && !glyph.missing && finiteCandidateCase?.status === 'candidate' && finiteCandidateCase.pathSha256 === glyph.pathSha256 ? finiteCandidateCase.elements : []
                      const initialComponentCase = glyph && !glyph.missing ? initialComponentByCharacter.get(glyph.character) : undefined
                      const initialCandidate = glyph && !glyph.missing && initialComponentCase?.status === 'candidate' && initialComponentCase.pathSha256 === glyph.pathSha256 ? initialComponentCase : null
                      const finalComponentCase = glyph && !glyph.missing && context.hasFinal ? finalComponentByCharacter.get(glyph.character) : undefined
                      const finalCandidate = glyph && !glyph.missing && finalComponentCase && finalComponentDisplayCaseMatchesOutline(finalComponentCase, glyph.pathSha256) ? finalComponentCase : null
                      const medial = selectedMedials[context.medialContext]
                      const medialRoles = MEDIAL_DEFINITIONS[medial].roles
                      const medialObservations = observationValues(observationProfile, activeInitial, medial, context.hasFinal ? 'ㄱ' : null)
                      const medialCandidates = scalarCandidatesFromElements(medialRoles, medialElementCandidates)
                      return glyph ? (
                        <GuideTile
                          key={glyph.character}
                          context={context}
                          display={comparison!.display}
                          font={activeFont}
                          glyph={glyph}
                          guides={guidesByContext[contextId]}
                          guideSource={guideSource(guideProfile, activeInitial, contextId)}
                          showLegacyGuides={LEGACY_GUIDES_VISIBLE}
                          medialGuides={medialOverlayGuides(activeInitial, context, selectedMedials, observationProfile)}
                          medialRoles={medialRoles}
                          medialObservations={medialObservations}
                          medialCandidates={medialCandidates}
                          medialElementCandidates={medialElementCandidates}
                          initialCandidate={initialCandidate}
                          finalCandidate={finalCandidate}
                          medialG0Review={medialG0ReviewSpec(activeFont, activeInitial, selectedMedials[context.medialContext], contextId)}
                          showMedialG0Regions={showG0AnalysisRegions}
                          onGuideInputFocus={handleGuideInputFocus}
                          onGuideInputChange={handleGuideInputChange}
                          onGuideInputBlur={handleGuideInputBlur}
                          onMedialObservationChange={handleMedialObservationChange}
                          onMedialObservationReview={handleMedialObservationReview}
                        />
                      ) : null
                    })}
                  </section>
                ))}
              </div>
            )}
          </section>
      )}
    </main>
  )
}

export function FontGuideLabPage() {
  return <InitialGuideLabPage />
}
