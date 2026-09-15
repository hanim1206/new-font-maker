import type { ReferenceFont } from './ReferenceLabPage'
import type { MedialFaceElementCandidate, MedialFaceReasonCode } from './medialGuideCandidateModel'

const STORAGE_KEY = 'reference-medial-guide-observations-v3'
const LEGACY_STORAGE_KEY = 'reference-medial-guide-observations-v1'
const INVALIDATION_LEDGER_KEY = 'reference-medial-guide-observation-invalidations-v1'
const INVALID_GA_GWA_CANDIDATE_RESET_ID = '2026-09-14-noto-g0-ga-gwa-invalid-candidate-reset-v1'
const INVALID_GA_GWA_FONT = {
  id: 'noto-sans-kr',
  fileSha256: '194018e6b2b293a7964f037b25c0249ce1418bc9ab3c971060a03aa57861e252',
} as const
const GUIDE_MIN = -120
const GUIDE_MAX = 1120

export const MEDIAL_GUIDE_P1_ROLE_CONTRACT_VERSION = 'medial-guide-role-v4' as const

export type Medial = 'ㅏ' | 'ㅐ' | 'ㅑ' | 'ㅒ' | 'ㅓ' | 'ㅔ' | 'ㅕ' | 'ㅖ' | 'ㅗ' | 'ㅘ' | 'ㅙ' | 'ㅚ' | 'ㅛ' | 'ㅜ' | 'ㅝ' | 'ㅞ' | 'ㅟ' | 'ㅠ' | 'ㅡ' | 'ㅢ' | 'ㅣ'
export type ObservationInitial = 'ㄱ' | 'ㄲ' | 'ㄴ' | 'ㄷ' | 'ㄸ' | 'ㄹ' | 'ㅁ' | 'ㅂ' | 'ㅃ' | 'ㅅ' | 'ㅆ' | 'ㅇ' | 'ㅈ' | 'ㅉ' | 'ㅊ' | 'ㅋ' | 'ㅌ' | 'ㅍ' | 'ㅎ'
export type ObservationFinalJamo = null | 'ㄱ'
export type RoleId = 'basePillarFace' | 'innerPillarFace' | 'outerPillarFace' | 'primaryBeamFace' | 'upperBeamFace' | 'lowerBeamFace' | 'baseStemTipFace' | 'leftStemFace' | 'leftStemTipFace' | 'rightStemFace' | 'rightStemTipFace'

export interface RoleDefinition {
  id: RoleId
  label: string
  axis: 'x' | 'y'
  side: 'left' | 'right' | 'top' | 'bottom'
}

export interface MedialDefinition {
  index: number
  layout: 'vertical' | 'horizontal' | 'mixed'
  roles: readonly RoleDefinition[]
}

export interface ObservationValue {
  coordinateFrame: 'shared-baseline'
  value: number
  anchor: { id: RoleId; mode: 'outerFace'; side: RoleDefinition['side'] }
  method: 'manual' | 'automatic-candidate' | 'legacy-inferred'
  confidence: 'pending' | 'medium' | 'high'
  review: 'pending' | 'accepted-for-analysis' | 'corrected' | 'rejected'
}

export type CandidateValue = {
  value: number
  confidence: 'high' | 'medium'
  evidence: string
} | {
  value: null
  confidence: 'abstained'
  reasonCode: MedialFaceReasonCode
  evidence: string
}

export type ObservationRoleValues = Partial<Record<RoleId, ObservationValue>>

export interface ObservationCase {
  initialJamo: ObservationInitial
  medialJamo: Medial
  finalJamo: ObservationFinalJamo
  roles: ObservationRoleValues
}

export interface FontObservationProfile {
  observations: ObservationCase[]
}

interface ObservationStoreV3 {
  schema: 'reference-medial-guide-observations-v3'
  version: 3
  values: Record<string, FontObservationProfile>
}

type LegacyContextId = 'without-final' | 'with-final'
type LegacyRoleValues = Partial<Record<RoleId, Omit<ObservationValue, 'method' | 'confidence' | 'review'> & {
  method: 'manual' | 'inferred'
  confidence: 'pending' | 'medium'
  review: 'pending' | 'accepted-for-analysis'
}>>
type LegacyContexts = Partial<Record<LegacyContextId, LegacyRoleValues>>
type LegacyMedials = Partial<Record<Medial, LegacyContexts>>

interface ObservationStoreV2 {
  schema: 'reference-medial-guide-observations-v2'
  version: 2
  values: Record<string, { observations: Partial<Record<ObservationInitial, LegacyMedials>> }>
}

interface ObservationStoreV1 {
  schema: 'reference-medial-guide-observations-v1'
  version: 1
  values: Record<string, { observations: LegacyMedials }>
}

interface InvalidationLedger {
  schema: 'reference-medial-guide-observation-invalidations-v1'
  applied: string[]
}

const ROLE = {
  basePillar: { id: 'basePillarFace', label: '관측 바탕 세로줄기 · 오른면', axis: 'x', side: 'right' },
  innerPillar: { id: 'innerPillarFace', label: '관측 안쪽기둥선 · 오른면', axis: 'x', side: 'right' },
  pillarRight: { id: 'outerPillarFace', label: '관측 기둥선 · 오른면', axis: 'x', side: 'right' },
  primary: { id: 'primaryBeamFace', label: '주 보 윗면', axis: 'y', side: 'top' },
  upper: { id: 'upperBeamFace', label: '윗 보 윗면', axis: 'y', side: 'top' },
  lower: { id: 'lowerBeamFace', label: '아랫 보 윗면', axis: 'y', side: 'top' },
  baseStemTipTop: { id: 'baseStemTipFace', label: '바탕 세로줄기 · 윗끝면', axis: 'y', side: 'top' },
  baseStemTipBottom: { id: 'baseStemTipFace', label: '바탕 세로줄기 · 아랫끝면', axis: 'y', side: 'bottom' },
  leftStem: { id: 'leftStemFace', label: '왼쪽 세로줄기 · 오른면', axis: 'x', side: 'right' },
  leftStemTipTop: { id: 'leftStemTipFace', label: '왼쪽 세로줄기 · 윗끝면', axis: 'y', side: 'top' },
  leftStemTipBottom: { id: 'leftStemTipFace', label: '왼쪽 세로줄기 · 아랫끝면', axis: 'y', side: 'bottom' },
  rightStem: { id: 'rightStemFace', label: '오른쪽 세로줄기 · 오른면', axis: 'x', side: 'right' },
  rightStemTipTop: { id: 'rightStemTipFace', label: '오른쪽 세로줄기 · 윗끝면', axis: 'y', side: 'top' },
  rightStemTipBottom: { id: 'rightStemTipFace', label: '오른쪽 세로줄기 · 아랫끝면', axis: 'y', side: 'bottom' },
} as const satisfies Record<string, RoleDefinition>

export const MEDIALS: readonly Medial[] = ['ㅏ', 'ㅐ', 'ㅑ', 'ㅒ', 'ㅓ', 'ㅔ', 'ㅕ', 'ㅖ', 'ㅗ', 'ㅘ', 'ㅙ', 'ㅚ', 'ㅛ', 'ㅜ', 'ㅝ', 'ㅞ', 'ㅟ', 'ㅠ', 'ㅡ', 'ㅢ', 'ㅣ']

export const MEDIAL_DEFINITIONS: Readonly<Record<Medial, MedialDefinition>> = {
  'ㅏ': { index: 0, layout: 'vertical', roles: [ROLE.pillarRight, ROLE.primary] },
  'ㅐ': { index: 1, layout: 'vertical', roles: [ROLE.innerPillar, ROLE.pillarRight, ROLE.primary] },
  'ㅑ': { index: 2, layout: 'vertical', roles: [ROLE.pillarRight, ROLE.upper, ROLE.lower] },
  'ㅒ': { index: 3, layout: 'vertical', roles: [ROLE.innerPillar, ROLE.pillarRight, ROLE.upper, ROLE.lower] },
  'ㅓ': { index: 4, layout: 'vertical', roles: [ROLE.pillarRight, ROLE.primary] },
  'ㅔ': { index: 5, layout: 'vertical', roles: [ROLE.innerPillar, ROLE.pillarRight, ROLE.primary] },
  'ㅕ': { index: 6, layout: 'vertical', roles: [ROLE.pillarRight, ROLE.upper, ROLE.lower] },
  'ㅖ': { index: 7, layout: 'vertical', roles: [ROLE.innerPillar, ROLE.pillarRight, ROLE.upper, ROLE.lower] },
  'ㅗ': { index: 8, layout: 'horizontal', roles: [ROLE.basePillar, ROLE.baseStemTipTop, ROLE.primary] },
  'ㅘ': { index: 9, layout: 'mixed', roles: [ROLE.basePillar, ROLE.baseStemTipTop, ROLE.pillarRight, ROLE.upper, ROLE.lower] },
  'ㅙ': { index: 10, layout: 'mixed', roles: [ROLE.basePillar, ROLE.baseStemTipTop, ROLE.innerPillar, ROLE.pillarRight, ROLE.upper, ROLE.lower] },
  'ㅚ': { index: 11, layout: 'mixed', roles: [ROLE.basePillar, ROLE.baseStemTipTop, ROLE.pillarRight, ROLE.primary] },
  'ㅛ': { index: 12, layout: 'horizontal', roles: [ROLE.leftStem, ROLE.leftStemTipTop, ROLE.rightStem, ROLE.rightStemTipTop, ROLE.primary] },
  'ㅜ': { index: 13, layout: 'horizontal', roles: [ROLE.basePillar, ROLE.baseStemTipBottom, ROLE.primary] },
  'ㅝ': { index: 14, layout: 'mixed', roles: [ROLE.basePillar, ROLE.baseStemTipBottom, ROLE.pillarRight, ROLE.upper, ROLE.lower] },
  'ㅞ': { index: 15, layout: 'mixed', roles: [ROLE.basePillar, ROLE.baseStemTipBottom, ROLE.innerPillar, ROLE.pillarRight, ROLE.upper, ROLE.lower] },
  'ㅟ': { index: 16, layout: 'mixed', roles: [ROLE.basePillar, ROLE.baseStemTipBottom, ROLE.pillarRight, ROLE.primary] },
  'ㅠ': { index: 17, layout: 'horizontal', roles: [ROLE.leftStem, ROLE.leftStemTipBottom, ROLE.rightStem, ROLE.rightStemTipBottom, ROLE.primary] },
  'ㅡ': { index: 18, layout: 'horizontal', roles: [ROLE.primary] },
  'ㅢ': { index: 19, layout: 'mixed', roles: [ROLE.pillarRight, ROLE.primary] },
  'ㅣ': { index: 20, layout: 'vertical', roles: [ROLE.pillarRight] },
}

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max)

function calibrationKey(font: ReferenceFont): string {
  const axes = Object.entries(font.axes).sort(([left], [right]) => left.localeCompare(right)).map(([tag, value]) => `${tag}=${value}`).join('&')
  return `${font.id}:${font.fileSha256}:${axes}`
}

function migrateRoleValues(values: LegacyRoleValues): ObservationRoleValues {
  return Object.fromEntries(Object.entries(values).map(([roleId, observation]) => [roleId, observation ? {
    ...observation,
    method: observation.method === 'inferred' ? 'legacy-inferred' : 'manual',
  } : observation])) as ObservationRoleValues
}

function migrateProfile(observations: Partial<Record<ObservationInitial, LegacyMedials>>): FontObservationProfile {
  const cases: ObservationCase[] = []
  Object.entries(observations).forEach(([initialJamo, medials]) => {
    Object.entries(medials ?? {}).forEach(([medialJamo, contexts]) => {
      Object.entries(contexts ?? {}).forEach(([contextId, roles]) => {
        if (!roles || Object.keys(roles).length === 0) return
        cases.push({
          initialJamo: initialJamo as ObservationInitial,
          medialJamo: medialJamo as Medial,
          finalJamo: contextId === 'with-final' ? 'ㄱ' : null,
          roles: migrateRoleValues(roles),
        })
      })
    })
  })
  return { observations: cases }
}

function parseStoredObject(key: string): unknown {
  try {
    return JSON.parse(window.localStorage.getItem(key) ?? 'null') as unknown
  } catch {
    return null
  }
}

function readStore(): ObservationStoreV3 {
  const current = parseStoredObject(STORAGE_KEY)
  if (current && typeof current === 'object' && !Array.isArray(current)) {
    const store = current as Partial<ObservationStoreV3>
    if (store.schema === 'reference-medial-guide-observations-v3' && store.version === 3 && store.values && typeof store.values === 'object' && !Array.isArray(store.values)) return store as ObservationStoreV3
  }

  const legacy = parseStoredObject(LEGACY_STORAGE_KEY)
  if (!legacy || typeof legacy !== 'object' || Array.isArray(legacy)) return { schema: 'reference-medial-guide-observations-v3', version: 3, values: {} }
  const store = legacy as Partial<ObservationStoreV1 | ObservationStoreV2>
  if (!store.values || typeof store.values !== 'object' || Array.isArray(store.values)) return { schema: 'reference-medial-guide-observations-v3', version: 3, values: {} }
  let values: Record<string, FontObservationProfile>
  if (store.schema === 'reference-medial-guide-observations-v2' && store.version === 2) {
    values = Object.fromEntries(Object.entries(store.values as ObservationStoreV2['values']).map(([key, profile]) => [key, migrateProfile(profile.observations)]))
  } else if (store.schema === 'reference-medial-guide-observations-v1' && store.version === 1) {
    values = Object.fromEntries(Object.entries(store.values as ObservationStoreV1['values']).map(([key, profile]) => [key, migrateProfile({ 'ㄱ': profile.observations })]))
  } else {
    return { schema: 'reference-medial-guide-observations-v3', version: 3, values: {} }
  }
  const migrated: ObservationStoreV3 = { schema: 'reference-medial-guide-observations-v3', version: 3, values }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated))
  return migrated
}

function readInvalidationLedger(): InvalidationLedger {
  const parsed = parseStoredObject(INVALIDATION_LEDGER_KEY)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { schema: 'reference-medial-guide-observation-invalidations-v1', applied: [] }
  const ledger = parsed as Partial<InvalidationLedger>
  if (ledger.schema !== 'reference-medial-guide-observation-invalidations-v1' || !Array.isArray(ledger.applied) || ledger.applied.some((id) => typeof id !== 'string')) return { schema: 'reference-medial-guide-observation-invalidations-v1', applied: [] }
  return ledger as InvalidationLedger
}

function clearInvalidGaGwaCandidates(profile: FontObservationProfile): FontObservationProfile {
  let changed = false
  const observations = profile.observations.flatMap((observationCase) => {
    if (observationCase.initialJamo !== 'ㄱ' || observationCase.finalJamo !== null || !(['ㅏ', 'ㅘ'] as Medial[]).includes(observationCase.medialJamo)) return [observationCase]
    const roles = Object.fromEntries(Object.entries(observationCase.roles).filter(([, observation]) => observation?.method !== 'legacy-inferred')) as ObservationRoleValues
    if (Object.keys(roles).length === Object.keys(observationCase.roles).length) return [observationCase]
    changed = true
    return Object.keys(roles).length === 0 ? [] : [{ ...observationCase, roles }]
  })
  return changed ? { observations } : profile
}

export function emptyProfile(): FontObservationProfile {
  return { observations: [] }
}

export function observationValues(
  profile: FontObservationProfile,
  initialJamo: ObservationInitial,
  medialJamo: Medial,
  finalJamo: ObservationFinalJamo,
): ObservationRoleValues {
  return profile.observations.find((observationCase) => observationCase.initialJamo === initialJamo && observationCase.medialJamo === medialJamo && observationCase.finalJamo === finalJamo)?.roles ?? {}
}

export function observationFor(
  profile: FontObservationProfile,
  initialJamo: ObservationInitial,
  medialJamo: Medial,
  finalJamo: ObservationFinalJamo,
  roleId: RoleId,
): ObservationValue | null {
  return observationValues(profile, initialJamo, medialJamo, finalJamo)[roleId] ?? null
}

export function updateObservation(
  profile: FontObservationProfile,
  initialJamo: ObservationInitial,
  medialJamo: Medial,
  finalJamo: ObservationFinalJamo,
  role: RoleDefinition,
  value: number | null,
  source: Pick<ObservationValue, 'method' | 'confidence' | 'review'> = { method: 'manual', confidence: 'pending', review: 'pending' },
): FontObservationProfile {
  const index = profile.observations.findIndex((observationCase) => observationCase.initialJamo === initialJamo && observationCase.medialJamo === medialJamo && observationCase.finalJamo === finalJamo)
  const existing = index >= 0 ? profile.observations[index] : null
  const roles = { ...(existing?.roles ?? {}) }
  if (value === null) delete roles[role.id]
  else roles[role.id] = {
    coordinateFrame: 'shared-baseline',
    value: Math.round(clamp(value, GUIDE_MIN, GUIDE_MAX)),
    anchor: { id: role.id, mode: 'outerFace', side: role.side },
    ...source,
  }
  const observations = [...profile.observations]
  if (Object.keys(roles).length === 0) {
    if (index >= 0) observations.splice(index, 1)
  } else if (existing) {
    observations[index] = { ...existing, roles }
  } else {
    observations.push({ initialJamo, medialJamo, finalJamo, roles })
  }
  return { observations }
}

export function readProfile(font: ReferenceFont): FontObservationProfile {
  const store = readStore()
  const key = calibrationKey(font)
  const profile = store.values[key] ?? emptyProfile()
  if (font.id !== INVALID_GA_GWA_FONT.id || font.fileSha256 !== INVALID_GA_GWA_FONT.fileSha256) return profile
  const ledger = readInvalidationLedger()
  if (ledger.applied.includes(INVALID_GA_GWA_CANDIDATE_RESET_ID)) return profile
  const next = clearInvalidGaGwaCandidates(profile)
  if (next !== profile) {
    store.values[key] = next
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  }
  window.localStorage.setItem(INVALIDATION_LEDGER_KEY, JSON.stringify({ ...ledger, applied: [...ledger.applied, INVALID_GA_GWA_CANDIDATE_RESET_ID] }))
  return next
}

export function writeProfile(font: ReferenceFont, profile: FontObservationProfile): void {
  const store = readStore()
  store.values[calibrationKey(font)] = profile
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

function isRoleId(value: string): value is RoleId {
  return Object.values(MEDIAL_DEFINITIONS).some(({ roles }) => roles.some(({ id }) => id === value))
}

function matcherEvidence(element: MedialFaceElementCandidate): string {
  const alternatives = element.match.alternatives.map(({ contourId, score }) => `c${contourId} ${score}`).join(' / ')
  return `${element.face.evidence.method} · score ${element.match.score ?? '—'} · margin ${element.match.margin ?? '—'}${alternatives ? ` · ${alternatives}` : ''}`
}

function abstainedCandidate(reasonCode: MedialFaceReasonCode, element: MedialFaceElementCandidate, detail?: string): CandidateValue {
  return { value: null, confidence: 'abstained', reasonCode, evidence: `${matcherEvidence(element)}${detail ? ` · ${detail}` : ''}` }
}

export function scalarCandidatesFromElements(
  roles: readonly RoleDefinition[],
  elements: readonly MedialFaceElementCandidate[],
): Partial<Record<RoleId, CandidateValue>> {
  const candidates: Partial<Record<RoleId, CandidateValue>> = {}
  const roleById = new Map(roles.map((role) => [role.id, role]))
  elements.forEach((element) => {
    if (isRoleId(element.legacyFaceRole) && roleById.has(element.legacyFaceRole)) {
      candidates[element.legacyFaceRole] = element.face.status === 'candidate' && element.visibleSpans.status === 'candidate' && element.match.confidence !== 'abstained'
        ? { value: Math.round(element.face.value), confidence: element.match.confidence, evidence: matcherEvidence(element) }
        : abstainedCandidate(element.face.status === 'abstained' ? element.face.reasonCode : element.visibleSpans.status === 'abstained' ? element.visibleSpans.reasonCode : 'no-role-match', element)
    }
    if (!element.legacyTipRole || !isRoleId(element.legacyTipRole) || !roleById.has(element.legacyTipRole)) return
    const tipRole = roleById.get(element.legacyTipRole)!
    if (!element.componentSpans?.length || element.visibleSpans.status !== 'candidate' || element.match.confidence === 'abstained') {
      candidates[element.legacyTipRole] = abstainedCandidate(element.visibleSpans.status === 'abstained' ? element.visibleSpans.reasonCode : 'no-role-match', element)
      return
    }
    const componentEndpoint = tipRole.side === 'top'
      ? Math.min(...element.componentSpans.map(({ from }) => from))
      : Math.max(...element.componentSpans.map(({ to }) => to))
    const visibleEndpoint = tipRole.side === 'top'
      ? Math.min(...element.visibleSpans.value.map(({ from }) => from))
      : Math.max(...element.visibleSpans.value.map(({ to }) => to))
    if (Math.abs(componentEndpoint - visibleEndpoint) > 2) {
      candidates[element.legacyTipRole] = abstainedCandidate('occluded-by-neighbor-overlap', element, `숨은 성분 끝 ${componentEndpoint.toFixed(3)} · 보이는 끝 ${visibleEndpoint.toFixed(3)}`)
      return
    }
    candidates[element.legacyTipRole] = { value: Math.round(componentEndpoint), confidence: element.match.confidence, evidence: matcherEvidence(element) }
  })
  return candidates
}
