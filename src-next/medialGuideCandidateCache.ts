import type { ReferenceFont } from './ReferenceLabPage'
import {
  MEDIAL_GUIDE_EXTRACTOR_VERSION,
  MEDIAL_GUIDE_ROLE_DEFINITION_VERSION,
  parseMedialGuideCandidateCase,
  type MedialGuideCandidateCase,
} from './medialGuideCandidateModel'

export const MEDIAL_GUIDE_CANDIDATE_CACHE_KEY = 'reference-medial-guide-candidates-v1'
export const MEDIAL_GUIDE_CANDIDATE_CACHE_LIMIT = 600
export const MISSING_GLYPH_PATH_IDENTITY = 'glyph-missing'

export interface CandidateCacheIdentity {
  key: string
  fontFileSha256: string
  axesKey: string
  character: string
  codepoint: number
  pathSha256: string
  extractorVersion: string
  roleDefinitionVersion: string
}

export interface CandidateCacheEntry extends CandidateCacheIdentity {
  accessedAt: number
  candidate: MedialGuideCandidateCase
}

export interface CandidateCacheStore {
  schema: 'reference-medial-guide-candidates-v1'
  version: 1
  entries: CandidateCacheEntry[]
}

interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

function emptyStore(): CandidateCacheStore {
  return { schema: 'reference-medial-guide-candidates-v1', version: 1, entries: [] }
}

export function normalizedAxesKey(axes: Readonly<Record<string, number>>): string {
  return JSON.stringify(Object.entries(axes).sort(([left], [right]) => left.localeCompare(right)))
}

export function candidateCacheKey(identity: Omit<CandidateCacheIdentity, 'key'>): string {
  return JSON.stringify([
    identity.fontFileSha256,
    identity.axesKey,
    identity.codepoint,
    identity.pathSha256,
    identity.extractorVersion,
    identity.roleDefinitionVersion,
  ])
}

export function createCandidateCacheIdentity(font: ReferenceFont, character: string, pathSha256: string): CandidateCacheIdentity {
  const withoutKey = {
    fontFileSha256: font.fileSha256,
    axesKey: normalizedAxesKey(font.axes),
    character,
    codepoint: character.codePointAt(0)!,
    pathSha256,
    extractorVersion: MEDIAL_GUIDE_EXTRACTOR_VERSION,
    roleDefinitionVersion: MEDIAL_GUIDE_ROLE_DEFINITION_VERSION,
  }
  return { key: candidateCacheKey(withoutKey), ...withoutKey }
}

export function candidateRequestFingerprint(identities: readonly CandidateCacheIdentity[]): string {
  return JSON.stringify(identities.map(({ key }) => key))
}

function parseEntry(value: unknown): CandidateCacheEntry | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const entry = value as Partial<CandidateCacheEntry>
  if (
    typeof entry.key !== 'string'
    || typeof entry.fontFileSha256 !== 'string'
    || typeof entry.axesKey !== 'string'
    || typeof entry.character !== 'string'
    || typeof entry.codepoint !== 'number'
    || typeof entry.pathSha256 !== 'string'
    || typeof entry.extractorVersion !== 'string'
    || typeof entry.roleDefinitionVersion !== 'string'
    || typeof entry.accessedAt !== 'number'
    || !Number.isFinite(entry.accessedAt)
  ) return null
  try {
    const candidate = parseMedialGuideCandidateCase(entry.candidate)
    const identity: Omit<CandidateCacheIdentity, 'key'> = {
      fontFileSha256: entry.fontFileSha256,
      axesKey: entry.axesKey,
      character: entry.character,
      codepoint: entry.codepoint,
      pathSha256: entry.pathSha256,
      extractorVersion: entry.extractorVersion,
      roleDefinitionVersion: entry.roleDefinitionVersion,
    }
    if (
      entry.key !== candidateCacheKey(identity)
      || candidate.character !== entry.character
      || (candidate.status === 'candidate' && candidate.pathSha256 !== entry.pathSha256)
      || (candidate.status === 'abstained' && entry.pathSha256 !== MISSING_GLYPH_PATH_IDENTITY)
      || entry.character.codePointAt(0) !== entry.codepoint
    ) return null
    return { key: entry.key, ...identity, accessedAt: entry.accessedAt, candidate }
  } catch {
    return null
  }
}

export function parseCandidateCacheStore(value: unknown): CandidateCacheStore {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return emptyStore()
  const source = value as Partial<CandidateCacheStore>
  if (source.schema !== 'reference-medial-guide-candidates-v1' || source.version !== 1 || !Array.isArray(source.entries)) return emptyStore()
  const byKey = new Map<string, CandidateCacheEntry>()
  source.entries.forEach((value) => {
    const entry = parseEntry(value)
    if (entry) byKey.set(entry.key, entry)
  })
  return { schema: 'reference-medial-guide-candidates-v1', version: 1, entries: [...byKey.values()] }
}

export function readCandidateCacheStore(storage: StorageLike): CandidateCacheStore {
  try {
    return parseCandidateCacheStore(JSON.parse(storage.getItem(MEDIAL_GUIDE_CANDIDATE_CACHE_KEY) ?? 'null') as unknown)
  } catch {
    return emptyStore()
  }
}

function writeStore(storage: StorageLike, store: CandidateCacheStore): void {
  try {
    storage.setItem(MEDIAL_GUIDE_CANDIDATE_CACHE_KEY, JSON.stringify(store))
  } catch {
    // Cache quota and disabled storage must not block extraction.
  }
}

export function readCachedCandidateCases(
  storage: StorageLike,
  identities: readonly CandidateCacheIdentity[],
  now = Date.now(),
): ReadonlyMap<string, MedialGuideCandidateCase> {
  const store = readCandidateCacheStore(storage)
  const requestedKeys = new Set(identities.map(({ key }) => key))
  const hits = new Map<string, MedialGuideCandidateCase>()
  const entries = store.entries.map((entry) => {
    if (!requestedKeys.has(entry.key)) return entry
    hits.set(entry.key, entry.candidate)
    return { ...entry, accessedAt: now }
  })
  if (hits.size > 0) writeStore(storage, { ...store, entries })
  return hits
}

export function writeCandidateCacheCases(
  storage: StorageLike,
  identities: readonly CandidateCacheIdentity[],
  candidates: readonly MedialGuideCandidateCase[],
  now = Date.now(),
): void {
  const identityByCharacter = new Map(identities.map((identity) => [identity.character, identity]))
  const byKey = new Map(readCandidateCacheStore(storage).entries.map((entry) => [entry.key, entry]))
  candidates.forEach((candidate) => {
    const identity = identityByCharacter.get(candidate.character)
    if (
      !identity
      || (candidate.status === 'candidate' && candidate.pathSha256 !== identity.pathSha256)
      || (candidate.status === 'abstained' && identity.pathSha256 !== MISSING_GLYPH_PATH_IDENTITY)
    ) return
    byKey.set(identity.key, { ...identity, accessedAt: now, candidate })
  })
  const entries = [...byKey.values()]
    .sort((left, right) => right.accessedAt - left.accessedAt || left.key.localeCompare(right.key))
    .slice(0, MEDIAL_GUIDE_CANDIDATE_CACHE_LIMIT)
  writeStore(storage, { schema: 'reference-medial-guide-candidates-v1', version: 1, entries })
}
