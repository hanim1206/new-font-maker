import { describe, expect, it } from 'vitest'
import type { ReferenceFont } from './ReferenceLabPage'
import {
  MEDIAL_GUIDE_CANDIDATE_CACHE_LIMIT,
  MISSING_GLYPH_PATH_IDENTITY,
  candidateCacheKey,
  candidateRequestFingerprint,
  createCandidateCacheIdentity,
  normalizedAxesKey,
  readCachedCandidateCases,
  readCandidateCacheStore,
  writeCandidateCacheCases,
} from './medialGuideCandidateCache'
import type { MedialGuideCandidateCase, MedialGuideCandidateCaseResult } from './medialGuideCandidateModel'

const FONT: ReferenceFont = {
  id: 'fixture',
  family: 'Fixture',
  fileName: 'fixture.ttf',
  fileSha256: '1'.repeat(64),
  version: null,
  source: 'https://example.invalid/fixture.ttf',
  license: 'OFL',
  weight: 400,
  axes: { wght: 400, wdth: 100 },
}

class MemoryStorage {
  private readonly values = new Map<string, string>()

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }
}

function candidate(character: string, pathSha256: string): MedialGuideCandidateCaseResult {
  const evidence = {
    hypothesisId: 'outerPillar:contour-0:right',
    contourId: 0,
    segmentIds: [1],
    method: 'geometric-role-matcher-v3' as const,
    referenceMode: 'axis-aligned-face' as const,
  }
  return {
    character,
    initialJamo: 'ㄱ',
    medialJamo: 'ㅏ',
    finalJamo: null,
    status: 'candidate',
    glyphName: `glyph-${character}`,
    pathSha256,
    elements: [{
      elementId: 'outerPillar',
      orientation: 'vertical',
      faceSide: 'right',
      legacyFaceRole: 'outerPillarFace',
      legacyTipRole: null,
      face: { status: 'candidate', value: 745, evidence },
      visibleSpans: { status: 'candidate', value: [{ from: 50, to: 950 }], evidence },
      match: { status: 'matched', score: 0.99, confidence: 'high', margin: 0.5, alternatives: [{ contourId: 0, score: 0.99 }] },
    }],
  }
}

function abstained(character: string): MedialGuideCandidateCase {
  return { character, initialJamo: 'ㄱ', medialJamo: 'ㅏ', finalJamo: null, status: 'abstained', reasonCode: 'glyph-missing' }
}

describe('medial guide browser candidate cache', () => {
  it('축 순서를 정규화하고 identity 구성값 변경을 모두 cache miss로 만든다', () => {
    expect(normalizedAxesKey({ wght: 400, wdth: 100 })).toBe(normalizedAxesKey({ wdth: 100, wght: 400 }))
    const base = createCandidateCacheIdentity(FONT, '가', '2'.repeat(64))
    expect(base.extractorVersion).toBe('geometric-role-matcher-v9')
    expect(base.roleDefinitionVersion).toBe('medial-guide-role-v4')
    const identity = {
      fontFileSha256: base.fontFileSha256,
      axesKey: base.axesKey,
      character: base.character,
      codepoint: base.codepoint,
      pathSha256: base.pathSha256,
      extractorVersion: base.extractorVersion,
      roleDefinitionVersion: base.roleDefinitionVersion,
    }

    expect(createCandidateCacheIdentity({ ...FONT, fileSha256: '3'.repeat(64) }, '가', '2'.repeat(64)).key).not.toBe(base.key)
    expect(createCandidateCacheIdentity({ ...FONT, axes: { ...FONT.axes, wght: 500 } }, '가', '2'.repeat(64)).key).not.toBe(base.key)
    expect(createCandidateCacheIdentity(FONT, '각', '2'.repeat(64)).key).not.toBe(base.key)
    expect(createCandidateCacheIdentity(FONT, '가', '4'.repeat(64)).key).not.toBe(base.key)
    expect(candidateCacheKey({ ...identity, extractorVersion: 'next-extractor' })).not.toBe(base.key)
    expect(candidateCacheKey({ ...identity, roleDefinitionVersion: 'next-role' })).not.toBe(base.key)
    expect(candidateRequestFingerprint([base])).toBe(candidateRequestFingerprint([{ ...base }]))
    expect(candidateRequestFingerprint([base, createCandidateCacheIdentity(FONT, '각', '5'.repeat(64))])).not.toBe(candidateRequestFingerprint([base]))

    const storage = new MemoryStorage()
    writeCandidateCacheCases(storage, [base], [candidate('가', base.pathSha256)], 1)
    expect(readCachedCandidateCases(storage, [createCandidateCacheIdentity(FONT, '가', '4'.repeat(64))]).size).toBe(0)
  })

  it('candidate와 glyph-missing 자동 포기를 새 cache instance에서 함께 재사용한다', () => {
    const storage = new MemoryStorage()
    const presentIdentity = createCandidateCacheIdentity(FONT, '가', '2'.repeat(64))
    const missingIdentity = createCandidateCacheIdentity(FONT, '각', MISSING_GLYPH_PATH_IDENTITY)
    writeCandidateCacheCases(storage, [presentIdentity, missingIdentity], [candidate('가', presentIdentity.pathSha256), abstained('각')], 10)

    const hits = readCachedCandidateCases(storage, [presentIdentity, missingIdentity], 20)
    expect(hits.get(presentIdentity.key)?.status).toBe('candidate')
    expect(hits.get(missingIdentity.key)).toMatchObject({ character: '각', status: 'abstained', reasonCode: 'glyph-missing' })
    expect(readCandidateCacheStore(storage).entries.every(({ accessedAt }) => accessedAt === 20)).toBe(true)
  })

  it('최근 사용 entry를 보존하며 600개 LRU 상한을 지킨다', () => {
    const storage = new MemoryStorage()
    const identities = Array.from({ length: MEDIAL_GUIDE_CANDIDATE_CACHE_LIMIT }, (_, index) => (
      createCandidateCacheIdentity(FONT, String.fromCodePoint(0xac00 + index), MISSING_GLYPH_PATH_IDENTITY)
    ))
    writeCandidateCacheCases(storage, identities, identities.map(({ character }) => abstained(character)), 1)
    readCachedCandidateCases(storage, [identities[0]], 2)

    const newcomer = createCandidateCacheIdentity(FONT, String.fromCodePoint(0xac00 + MEDIAL_GUIDE_CANDIDATE_CACHE_LIMIT), MISSING_GLYPH_PATH_IDENTITY)
    writeCandidateCacheCases(storage, [newcomer], [abstained(newcomer.character)], 3)
    const entries = readCandidateCacheStore(storage).entries

    expect(entries).toHaveLength(MEDIAL_GUIDE_CANDIDATE_CACHE_LIMIT)
    expect(entries.some(({ key }) => key === identities[0].key)).toBe(true)
    expect(entries.some(({ key }) => key === newcomer.key)).toBe(true)
    expect(identities.slice(1).filter((identity) => entries.some(({ key }) => key === identity.key))).toHaveLength(MEDIAL_GUIDE_CANDIDATE_CACHE_LIMIT - 2)
  })
})
