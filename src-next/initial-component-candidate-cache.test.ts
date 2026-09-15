import { describe, expect, it } from 'vitest'
import fixtureSource from '../reference-data/font-guide-calibrations/noto-sans-kr.initial-component-g0.v2.json'
import type { ReferenceFont } from './ReferenceLabPage'
import {
  createInitialComponentCacheIdentity,
  initialComponentCacheKey,
  initialComponentRequestFingerprint,
  readCachedInitialComponentCases,
  readInitialComponentCacheStore,
  writeInitialComponentCacheCases,
} from './initialComponentCandidateCache'
import { parseInitialComponentCandidateResponse } from './initialComponentCandidateModel'

class MemoryStorage {
  private readonly values = new Map<string, string>()
  getItem(key: string): string | null { return this.values.get(key) ?? null }
  setItem(key: string, value: string): void { this.values.set(key, value) }
}

const response = parseInitialComponentCandidateResponse(fixtureSource)
const candidate = response.cases[0]
if (candidate.status !== 'candidate') throw new Error('Noto 첫 fixture candidate가 필요합니다.')

const FONT: ReferenceFont = {
  id: response.font.id,
  family: 'Noto Sans KR',
  fileName: 'NotoSansKR.ttf',
  fileSha256: response.font.fileSha256,
  source: 'fixture',
  license: 'OFL',
  version: 'fixture',
  weight: 400,
  axes: response.font.axes,
}

describe('initial component browser candidate cache', () => {
  it('응답 schema·추출기·역할·홀자 앵커 버전을 모두 identity에 포함한다', () => {
    const base = createInitialComponentCacheIdentity(FONT, candidate.character, candidate.pathSha256)
    const identity = {
      fontFileSha256: base.fontFileSha256,
      axesKey: base.axesKey,
      character: base.character,
      codepoint: base.codepoint,
      pathSha256: base.pathSha256,
      responseSchema: base.responseSchema,
      extractorVersion: base.extractorVersion,
      roleDefinitionVersion: base.roleDefinitionVersion,
      medialAnchorExtractorVersion: base.medialAnchorExtractorVersion,
    }

    expect(initialComponentCacheKey({ ...identity, responseSchema: 'next-schema' })).not.toBe(base.key)
    expect(initialComponentCacheKey({ ...identity, extractorVersion: 'next-extractor' })).not.toBe(base.key)
    expect(initialComponentCacheKey({ ...identity, roleDefinitionVersion: 'next-role' })).not.toBe(base.key)
    expect(initialComponentCacheKey({ ...identity, medialAnchorExtractorVersion: 'next-anchor' })).not.toBe(base.key)
    expect(createInitialComponentCacheIdentity({ ...FONT, axes: { wght: 500 } }, candidate.character, candidate.pathSha256).key).not.toBe(base.key)
    expect(initialComponentRequestFingerprint([base])).toBe(initialComponentRequestFingerprint([{ ...base }]))
  })

  it('검증된 candidate만 새 cache instance에서 재사용한다', () => {
    const storage = new MemoryStorage()
    const identity = createInitialComponentCacheIdentity(FONT, candidate.character, candidate.pathSha256)
    writeInitialComponentCacheCases(storage, [identity], [candidate], 1)

    expect(readCachedInitialComponentCases(storage, [identity], 2).get(identity.key)).toEqual(candidate)
    expect(readInitialComponentCacheStore(storage).entries).toHaveLength(1)
    expect(readInitialComponentCacheStore(storage).entries[0].accessedAt).toBe(2)
    expect(readCachedInitialComponentCases(storage, [{ ...identity, pathSha256: 'f'.repeat(64), key: initialComponentCacheKey({ ...identity, pathSha256: 'f'.repeat(64) }) }]).size).toBe(0)
  })
})
