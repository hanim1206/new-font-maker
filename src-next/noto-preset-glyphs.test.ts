import { describe, expect, it } from 'vitest'
import { createMemoryGlyphCache, createNotoPresetGlyphLoader, glyphCacheKey } from './notoPresetGlyphs'
import type { FetchJson, NotoPresetGlyph, NotoPresetManifest } from './notoPresetGlyphs'

const MANIFEST: NotoPresetManifest = {
  schema: 'noto-preset-outlines-v1',
  font: { id: 'noto', fileSha256: 'f'.repeat(64), axes: { wght: 400 }, unitsPerEm: 1000 },
  stageKeys: { outline: 'o'.repeat(64), initial: 'i'.repeat(64), medial: 'm'.repeat(64), final: 'f'.repeat(64) },
  coordinateFrame: 'glyph-normalized-baselines-with-font-unit-outline',
  glyphCount: 1, runId: 'a'.repeat(24), updatedAt: '2026-09-16T00:00:00.000Z',
}
const GA: NotoPresetGlyph = {
  identity: { character: '가', codepoint: 0xac00, initialJamo: 'ㄱ', medialJamo: 'ㅏ', finalJamo: null, contextId: 'right' },
  outline: { unitsPerEm: 1000, operations: [{ operation: 'moveTo', arguments: [[0, 0]] }, { operation: 'closePath', arguments: [] }] },
  baselines: { 'initial.roleFaces.left': 0.1 },
}

function fakeFetch(responses: Record<string, unknown>) {
  const calls: string[] = []
  const fetchJson: FetchJson = async <T,>(url: string): Promise<T> => {
    calls.push(url)
    if (!(url in responses)) throw new Error(`없는 URL ${url}`)
    return responses[url] as T
  }
  return { fetchJson, calls }
}

describe('createNotoPresetGlyphLoader', () => {
  it('manifest는 한 번만 받고 글자는 stageKey 캐시에 넣어 두 번째부터 API를 부르지 않는다', async () => {
    const { fetchJson, calls } = fakeFetch({ '/api/noto-preset': MANIFEST, '/api/noto-preset/glyph/44032': GA })
    const cache = createMemoryGlyphCache()
    const loader = createNotoPresetGlyphLoader({ fetchJson, cache })
    expect(await loader.glyph(0xac00)).toEqual(GA)
    expect(await loader.glyph(0xac00)).toEqual(GA)
    expect(calls).toEqual(['/api/noto-preset', '/api/noto-preset/glyph/44032'])
    expect(await cache.get(glyphCacheKey(MANIFEST, 0xac00))).toEqual(GA)
  })

  it('같은 글자를 동시에 요청하면 API는 한 번만 부른다', async () => {
    const { fetchJson, calls } = fakeFetch({ '/api/noto-preset': MANIFEST, '/api/noto-preset/glyph/44032': GA })
    const loader = createNotoPresetGlyphLoader({ fetchJson })
    await Promise.all([loader.glyph(0xac00), loader.glyph(0xac00), loader.glyph(0xac00)])
    expect(calls.filter((url) => url.endsWith('/44032'))).toHaveLength(1)
  })

  it('한 호출자가 취소해도 같은 요청을 기다리는 다른 호출자는 결과를 받는다', async () => {
    const { fetchJson, calls } = fakeFetch({ '/api/noto-preset': MANIFEST, '/api/noto-preset/glyph/44032': GA })
    const loader = createNotoPresetGlyphLoader({ fetchJson })
    const controller = new AbortController()
    const cancelled = loader.glyph(0xac00, controller.signal)
    controller.abort()
    await expect(cancelled).rejects.toThrow()
    expect(await loader.glyph(0xac00, new AbortController().signal)).toEqual(GA)
    expect(calls).toEqual(['/api/noto-preset', '/api/noto-preset/glyph/44032'])
  })

  it('추출 버전이 바뀌면 캐시 키가 달라져 다시 받는다', async () => {
    const cache = createMemoryGlyphCache()
    const first = createNotoPresetGlyphLoader({ ...fakeFetch({ '/api/noto-preset': MANIFEST, '/api/noto-preset/glyph/44032': GA }), cache })
    await first.glyph(0xac00)
    const next = { ...MANIFEST, stageKeys: { ...MANIFEST.stageKeys, outline: 'n'.repeat(64) } }
    const { fetchJson, calls } = fakeFetch({ '/api/noto-preset': next, '/api/noto-preset/glyph/44032': GA })
    await createNotoPresetGlyphLoader({ fetchJson, cache }).glyph(0xac00)
    expect(calls).toContain('/api/noto-preset/glyph/44032')
  })

  it('요청과 다른 글자·깨진 manifest는 거부하고 manifest 실패는 다음 호출에서 다시 시도한다', async () => {
    const wrong = { ...GA, identity: { ...GA.identity, codepoint: 0xac01 } }
    const loader = createNotoPresetGlyphLoader(fakeFetch({ '/api/noto-preset': MANIFEST, '/api/noto-preset/glyph/44032': wrong }))
    await expect(loader.glyph(0xac00)).rejects.toThrow('받은 글자가 요청과 다릅니다.')
    await expect(loader.glyph(1.5)).rejects.toThrow('정수')

    const broken = createNotoPresetGlyphLoader(fakeFetch({ '/api/noto-preset': { schema: 'other' } }))
    await expect(broken.manifest()).rejects.toThrow('manifest 형식')

    const { fetchJson, calls } = fakeFetch({})
    const retry = createNotoPresetGlyphLoader({ fetchJson })
    await expect(retry.manifest()).rejects.toThrow()
    await expect(retry.manifest()).rejects.toThrow()
    expect(calls).toEqual(['/api/noto-preset', '/api/noto-preset'])
  })
})
