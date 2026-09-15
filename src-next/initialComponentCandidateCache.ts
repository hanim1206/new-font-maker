import type { ReferenceFont } from './ReferenceLabPage'
import { normalizedAxesKey } from './medialGuideCandidateCache'
import {
  INITIAL_COMPONENT_EXTRACTOR_VERSION,
  INITIAL_COMPONENT_MEDIAL_ANCHOR_VERSION,
  INITIAL_COMPONENT_RESPONSE_SCHEMA,
  INITIAL_COMPONENT_ROLE_DEFINITION_VERSION,
  parseInitialComponentCandidateCase,
  type InitialComponentCase,
} from './initialComponentCandidateModel'

export const INITIAL_COMPONENT_CANDIDATE_CACHE_KEY = 'reference-initial-component-candidates-v2'
export const INITIAL_COMPONENT_CANDIDATE_CACHE_LIMIT = 600
export const INITIAL_COMPONENT_MISSING_GLYPH_PATH_IDENTITY = 'glyph-missing'

export interface InitialComponentCacheIdentity {
  key: string
  fontFileSha256: string
  axesKey: string
  character: string
  codepoint: number
  pathSha256: string
  responseSchema: string
  extractorVersion: string
  roleDefinitionVersion: string
  medialAnchorExtractorVersion: string
}

export interface InitialComponentCacheEntry extends InitialComponentCacheIdentity {
  accessedAt: number
  candidate: InitialComponentCase
}

export interface InitialComponentCacheStore {
  schema: 'reference-initial-component-candidates-v2'
  version: 2
  entries: InitialComponentCacheEntry[]
}

interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

function emptyStore(): InitialComponentCacheStore {
  return { schema: 'reference-initial-component-candidates-v2', version: 2, entries: [] }
}

export function initialComponentCacheKey(identity: Omit<InitialComponentCacheIdentity, 'key'>): string {
  return JSON.stringify([
    identity.fontFileSha256,
    identity.axesKey,
    identity.codepoint,
    identity.pathSha256,
    identity.responseSchema,
    identity.extractorVersion,
    identity.roleDefinitionVersion,
    identity.medialAnchorExtractorVersion,
  ])
}

export function createInitialComponentCacheIdentity(font: ReferenceFont, character: string, pathSha256: string): InitialComponentCacheIdentity {
  const withoutKey = {
    fontFileSha256: font.fileSha256,
    axesKey: normalizedAxesKey(font.axes),
    character,
    codepoint: character.codePointAt(0)!,
    pathSha256,
    responseSchema: INITIAL_COMPONENT_RESPONSE_SCHEMA,
    extractorVersion: INITIAL_COMPONENT_EXTRACTOR_VERSION,
    roleDefinitionVersion: INITIAL_COMPONENT_ROLE_DEFINITION_VERSION,
    medialAnchorExtractorVersion: INITIAL_COMPONENT_MEDIAL_ANCHOR_VERSION,
  }
  return { key: initialComponentCacheKey(withoutKey), ...withoutKey }
}

export function initialComponentRequestFingerprint(identities: readonly InitialComponentCacheIdentity[]): string {
  return JSON.stringify(identities.map(({ key }) => key))
}

function parseEntry(value: unknown): InitialComponentCacheEntry | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const entry = value as Partial<InitialComponentCacheEntry>
  if (
    typeof entry.key !== 'string'
    || typeof entry.fontFileSha256 !== 'string'
    || typeof entry.axesKey !== 'string'
    || typeof entry.character !== 'string'
    || typeof entry.codepoint !== 'number'
    || typeof entry.pathSha256 !== 'string'
    || typeof entry.responseSchema !== 'string'
    || typeof entry.extractorVersion !== 'string'
    || typeof entry.roleDefinitionVersion !== 'string'
    || typeof entry.medialAnchorExtractorVersion !== 'string'
    || typeof entry.accessedAt !== 'number'
    || !Number.isFinite(entry.accessedAt)
  ) return null
  try {
    const candidate = parseInitialComponentCandidateCase(entry.candidate)
    const identity: Omit<InitialComponentCacheIdentity, 'key'> = {
      fontFileSha256: entry.fontFileSha256,
      axesKey: entry.axesKey,
      character: entry.character,
      codepoint: entry.codepoint,
      pathSha256: entry.pathSha256,
      responseSchema: entry.responseSchema,
      extractorVersion: entry.extractorVersion,
      roleDefinitionVersion: entry.roleDefinitionVersion,
      medialAnchorExtractorVersion: entry.medialAnchorExtractorVersion,
    }
    if (
      entry.key !== initialComponentCacheKey(identity)
      || candidate.character !== entry.character
      || (candidate.status === 'candidate' && candidate.pathSha256 !== entry.pathSha256)
      || (candidate.status === 'abstained' && entry.pathSha256 !== INITIAL_COMPONENT_MISSING_GLYPH_PATH_IDENTITY)
      || entry.character.codePointAt(0) !== entry.codepoint
    ) return null
    return { key: entry.key, ...identity, accessedAt: entry.accessedAt, candidate }
  } catch {
    return null
  }
}

export function parseInitialComponentCacheStore(value: unknown): InitialComponentCacheStore {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return emptyStore()
  const source = value as Partial<InitialComponentCacheStore>
  if (source.schema !== 'reference-initial-component-candidates-v2' || source.version !== 2 || !Array.isArray(source.entries)) return emptyStore()
  const byKey = new Map<string, InitialComponentCacheEntry>()
  source.entries.forEach((value) => {
    const entry = parseEntry(value)
    if (entry) byKey.set(entry.key, entry)
  })
  return { schema: 'reference-initial-component-candidates-v2', version: 2, entries: [...byKey.values()] }
}

export function readInitialComponentCacheStore(storage: StorageLike): InitialComponentCacheStore {
  try {
    return parseInitialComponentCacheStore(JSON.parse(storage.getItem(INITIAL_COMPONENT_CANDIDATE_CACHE_KEY) ?? 'null') as unknown)
  } catch {
    return emptyStore()
  }
}

function writeStore(storage: StorageLike, store: InitialComponentCacheStore): void {
  try {
    storage.setItem(INITIAL_COMPONENT_CANDIDATE_CACHE_KEY, JSON.stringify(store))
  } catch {
    // Cache quota and disabled storage must not block extraction.
  }
}

export function readCachedInitialComponentCases(
  storage: StorageLike,
  identities: readonly InitialComponentCacheIdentity[],
  now = Date.now(),
): ReadonlyMap<string, InitialComponentCase> {
  const store = readInitialComponentCacheStore(storage)
  const requestedKeys = new Set(identities.map(({ key }) => key))
  const hits = new Map<string, InitialComponentCase>()
  const entries = store.entries.map((entry) => {
    if (!requestedKeys.has(entry.key)) return entry
    hits.set(entry.key, entry.candidate)
    return { ...entry, accessedAt: now }
  })
  if (hits.size > 0) writeStore(storage, { ...store, entries })
  return hits
}

export function writeInitialComponentCacheCases(
  storage: StorageLike,
  identities: readonly InitialComponentCacheIdentity[],
  candidates: readonly InitialComponentCase[],
  now = Date.now(),
): void {
  const identityByCharacter = new Map(identities.map((identity) => [identity.character, identity]))
  const byKey = new Map(readInitialComponentCacheStore(storage).entries.map((entry) => [entry.key, entry]))
  candidates.forEach((candidate) => {
    const identity = identityByCharacter.get(candidate.character)
    if (
      !identity
      || (candidate.status === 'candidate' && candidate.pathSha256 !== identity.pathSha256)
      || (candidate.status === 'abstained' && identity.pathSha256 !== INITIAL_COMPONENT_MISSING_GLYPH_PATH_IDENTITY)
    ) return
    byKey.set(identity.key, { ...identity, accessedAt: now, candidate })
  })
  const entries = [...byKey.values()]
    .sort((left, right) => right.accessedAt - left.accessedAt || left.key.localeCompare(right.key))
    .slice(0, INITIAL_COMPONENT_CANDIDATE_CACHE_LIMIT)
  writeStore(storage, { schema: 'reference-initial-component-candidates-v2', version: 2, entries })
}
