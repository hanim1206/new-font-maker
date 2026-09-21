import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createNotoPresetReader } from '../scripts/reference-lab/notoPresetApi'
import { NOTO_PRESET_MODEL_SCHEMA, NOTO_PRESET_SCHEMA, NOTO_PRESET_XOR_SCHEMA } from './notoPreset'
import type { NotoPresetGlyph, NotoPresetManifest, NotoPresetModelBundle, NotoPresetXorMap } from './notoPreset'
import {
  NOTO_PRESET_CHUNK_SIZE, createMemoryGlyphCache, createNotoPresetGlyphLoader, glyphCacheKey,
  notoPresetChunkFile, notoPresetChunkIndex, resolveNotoPresetSource,
} from './notoPresetGlyphs'
import type { FetchJson, NotoPresetGlyphChunk } from './notoPresetGlyphs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const STATIC = path.join(ROOT, 'public/noto-preset')
const CORPUS = path.join(ROOT, '.reference-fonts/guide-corpus')
const readStatic = <T,>(file: string) => JSON.parse(readFileSync(path.join(STATIC, file), 'utf8')) as T

const STAGE_KEYS = { outline: 'o'.repeat(8), initial: 'i', medial: 'm', final: 'f' }
const MANIFEST = { schema: NOTO_PRESET_SCHEMA, stageKeys: STAGE_KEYS, glyphCount: 2, modelKey: 'mk', xorKey: 'xk' } as unknown as NotoPresetManifest
const glyph = (codepoint: number) => ({
  identity: { character: String.fromCodePoint(codepoint), codepoint },
  outline: { unitsPerEm: 1000, operations: [] },
  baselines: {},
}) as unknown as NotoPresetGlyph

function staticHost(files: Record<string, unknown>) {
  const requests: string[] = []
  const fetchJson: FetchJson = async <T,>(url: string) => {
    requests.push(url)
    const file = url.split('?')[0]
    if (!(file in files)) throw new Error('Noto 프리셋 파일이 배포에 없습니다.')
    return files[file] as T
  }
  return { requests, fetchJson }
}

describe('Noto 프리셋 정적 경로', () => {
  it('dev는 API, 배포 빌드는 정적 파일을 읽고 ?preset= 으로 다른 쪽을 강제한다', () => {
    expect(resolveNotoPresetSource(true)).toBe('api')
    expect(resolveNotoPresetSource(false)).toBe('static')
    expect(resolveNotoPresetSource(true, '?preset=static')).toBe('static')
    expect(resolveNotoPresetSource(false, '?preset=api')).toBe('api')
    expect(resolveNotoPresetSource(false, '?preset=nope')).toBe('static')
  })

  it('글자는 초성·중성이 같은 28자 묶음에 들어간다', () => {
    expect(NOTO_PRESET_CHUNK_SIZE).toBe(28)
    expect(notoPresetChunkIndex(0xac00)).toBe(0)
    expect(notoPresetChunkIndex(0xac00 + 27)).toBe(0)
    expect(notoPresetChunkIndex(0xac00 + 28)).toBe(1)
    expect(notoPresetChunkIndex(0xd7a3)).toBe(398)
    expect(notoPresetChunkIndex(0xd7a4)).toBeNull()
    expect(notoPresetChunkIndex(0x3131)).toBeNull()
    expect(notoPresetChunkFile(7)).toBe('glyphs/007.json')
  })

  it('같은 묶음의 글자는 파일을 한 번만 받고 묶음 전체를 글자 단위로 캐시한다', async () => {
    const chunk: NotoPresetGlyphChunk = { [0xac00]: glyph(0xac00), [0xac01]: glyph(0xac01) }
    const host = staticHost({ '/noto-preset/manifest.json': MANIFEST, '/noto-preset/glyphs/000.json': chunk })
    const cache = createMemoryGlyphCache()
    const loader = createNotoPresetGlyphLoader({ fetchJson: host.fetchJson, cache, source: 'static' })

    const [first, second] = await Promise.all([loader.glyph(0xac00), loader.glyph(0xac01)])
    expect(first.identity.codepoint).toBe(0xac00)
    expect(second.identity.codepoint).toBe(0xac01)
    expect(await loader.glyph(0xac01)).toEqual(chunk[0xac01])
    expect(host.requests).toEqual(['/noto-preset/manifest.json', `/noto-preset/glyphs/000.json?v=${STAGE_KEYS.outline}`])
    expect(await cache.get(glyphCacheKey(MANIFEST, 0xac01))).toEqual(chunk[0xac01])
  })

  it('모델과 xor는 내용 키를 주소에 붙여 받고, base 경로를 따른다', async () => {
    const model = { schema: NOTO_PRESET_MODEL_SCHEMA, stageKeys: STAGE_KEYS, model: { schema: 'm', stageKeys: STAGE_KEYS, targets: {} }, thickness: {} }
    const xor = { schema: NOTO_PRESET_XOR_SCHEMA, stageKeys: STAGE_KEYS, generatedAt: '', source: '', characters: {} }
    const host = staticHost({ '/app/noto-preset/manifest.json': MANIFEST, '/app/noto-preset/model.json': model, '/app/noto-preset/xor.json': xor })
    const loader = createNotoPresetGlyphLoader({ fetchJson: host.fetchJson, source: 'static', baseUrl: '/app/' })

    expect(await loader.model()).toEqual(model)
    expect(await loader.xor()).toEqual(xor)
    expect(host.requests[1]).toBe(`/app/noto-preset/model.json?v=${encodeURIComponent(`${STAGE_KEYS.outline}:model:mk`)}`)
    expect(host.requests[2]).toBe(`/app/noto-preset/xor.json?v=${encodeURIComponent(`${STAGE_KEYS.outline}:xor:xk`)}`)
  })

  it('묶음에 없는 글자와 한글 음절 밖 글자는 없다고 말한다', async () => {
    const host = staticHost({ '/noto-preset/manifest.json': MANIFEST, '/noto-preset/glyphs/000.json': { [0xac00]: glyph(0xac00) } })
    const loader = createNotoPresetGlyphLoader({ fetchJson: host.fetchJson, source: 'static' })
    await expect(loader.glyph(0xac05)).rejects.toThrow('이 글자의 Noto 윤곽이 없습니다.')
    await expect(loader.glyph(0x3131)).rejects.toThrow('이 글자의 Noto 윤곽이 없습니다.')
    await expect(loader.glyph(0xac00 + 28)).rejects.toThrow('Noto 프리셋 파일이 배포에 없습니다.')
  })

  it('source를 안 주면 지금처럼 API 주소를 쓴다', async () => {
    const requests: string[] = []
    const loader = createNotoPresetGlyphLoader({ fetchJson: async <T,>(url: string) => { requests.push(url); return (url.endsWith('/glyph/44032') ? glyph(0xac00) : MANIFEST) as T } })
    await loader.glyph(0xac00)
    expect(requests).toEqual(['/api/noto-preset', '/api/noto-preset/glyph/44032'])
  })
})

// git에 들어간 배포 파일이 자기들끼리 맞는지. 원본 코퍼스 없이도 어디서나 돈다.
describe.skipIf(!existsSync(STATIC))('public/noto-preset 배포 파일', () => {
  it('manifest의 글자 수만큼 글자가 있고, 모든 글자가 제 묶음에 제 codepoint로 들어 있다', () => {
    const manifest = readStatic<NotoPresetManifest>('manifest.json')
    expect(manifest.schema).toBe(NOTO_PRESET_SCHEMA)
    const files = readdirSync(path.join(STATIC, 'glyphs')).sort()
    let count = 0
    for (const file of files) {
      const chunk = readStatic<NotoPresetGlyphChunk>(`glyphs/${file}`)
      for (const [key, value] of Object.entries(chunk)) {
        const index = notoPresetChunkIndex(Number(key))
        if (value.identity.codepoint !== Number(key) || index === null || notoPresetChunkFile(index) !== `glyphs/${file}` || !Array.isArray(value.outline.operations)) {
          throw new Error(`${file}의 ${key} 항목이 제자리에 있지 않습니다.`)
        }
        count += 1
      }
    }
    expect(count).toBe(manifest.glyphCount)
    expect(files).toHaveLength(Math.ceil(manifest.glyphCount / NOTO_PRESET_CHUNK_SIZE))
  })

  it('모델과 xor가 manifest와 같은 추출 버전이고 라이선스 문서가 함께 있다', () => {
    const manifest = readStatic<NotoPresetManifest>('manifest.json')
    const model = readStatic<NotoPresetModelBundle>('model.json')
    const xor = readStatic<NotoPresetXorMap>('xor.json')
    expect(model.schema).toBe(NOTO_PRESET_MODEL_SCHEMA)
    expect(model.stageKeys).toEqual(manifest.stageKeys)
    expect(Object.keys(model.model.targets).length).toBeGreaterThan(0)
    expect(xor.schema).toBe(NOTO_PRESET_XOR_SCHEMA)
    expect(Object.keys(xor.characters).length).toBeGreaterThan(0)
    expect(readFileSync(path.join(STATIC, 'OFL.txt'), 'utf8')).toContain('SIL OPEN FONT LICENSE Version 1.1')
  })
})

// 전수 대조는 원본 코퍼스(61MB)를 읽는다. 코퍼스를 다시 뽑으면 배포 파일과 달라지는 게 정상이므로
// (분석값은 자동으로 배포 프리셋이 되지 않는다) NOTO_STATIC_PARITY=1 일 때만, 내보낸 직후에 돌린다.
describe.skipIf(!process.env.NOTO_STATIC_PARITY || !existsSync(CORPUS) || !existsSync(STATIC))('정적 파일 ↔ dev API 전수 대조', () => {
  it('manifest · 모델 · xor · 11,172자가 API 응답과 바이트 단위로 같다', async () => {
    const reader = createNotoPresetReader(CORPUS)
    const manifest = await reader.manifest()
    expect(readFileSync(path.join(STATIC, 'manifest.json'), 'utf8')).toBe(JSON.stringify(manifest))
    expect(readFileSync(path.join(STATIC, 'model.json'), 'utf8')).toBe(JSON.stringify(await reader.model()))
    expect(readFileSync(path.join(STATIC, 'xor.json'), 'utf8')).toBe(JSON.stringify(await reader.xor()))

    let compared = 0
    const different: number[] = []
    for (let index = 0; index < Math.ceil(11172 / NOTO_PRESET_CHUNK_SIZE); index += 1) {
      const chunk = readStatic<NotoPresetGlyphChunk>(notoPresetChunkFile(index))
      for (let codepoint = 0xac00 + index * NOTO_PRESET_CHUNK_SIZE; codepoint < 0xac00 + (index + 1) * NOTO_PRESET_CHUNK_SIZE; codepoint += 1) {
        const fromApi = await reader.glyph(codepoint)
        const fromStatic = chunk[String(codepoint)]
        if (!fromApi && !fromStatic) continue
        compared += 1
        if (JSON.stringify(fromApi) !== JSON.stringify(fromStatic)) different.push(codepoint)
      }
    }
    expect(different).toEqual([])
    expect(compared).toBe(manifest.glyphCount)
  }, 120_000)
})
