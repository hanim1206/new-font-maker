import { NOTO_PRESET_MODEL_SCHEMA, NOTO_PRESET_SCHEMA, NOTO_PRESET_XOR_SCHEMA } from './notoPreset'
import type { NotoPresetGlyph, NotoPresetManifest, NotoPresetModelBundle, NotoPresetXorMap } from './notoPreset'

export type { NotoPresetGlyph, NotoPresetManifest, NotoPresetModelBundle, NotoPresetXorMap }

/**
 * 글자별 Noto 윤곽을 필요한 글자만 받아 IndexedDB에 둔다.
 * 캐시 키에 outline stageKey를 넣어 추출 버전이 바뀌면 자동으로 새로 받는다.
 *
 * 읽는 곳은 둘이다. dev 서버는 새로 뽑은 값이 바로 보이도록 API(`notoPresetApi`)를,
 * 배포 빌드는 `npm run reference:noto-static`이 `public/noto-preset/`에 써 둔 정적 파일을 읽는다.
 * 두 곳의 내용은 같은 reader가 만들어 바이트 단위로 같다.
 */

const API = '/api/noto-preset'
const STATIC_DIRECTORY = 'noto-preset'
const HANGUL_BASE = 0xac00
const HANGUL_COUNT = 11172
/** 정적 글자 묶음 하나 = 초성·중성이 같은 28자. 묶음은 399개다. */
export const NOTO_PRESET_CHUNK_SIZE = 28

export type NotoPresetSource = 'api' | 'static'
/** 정적 글자 묶음 파일의 모양. 키는 codepoint 십진수. */
export type NotoPresetGlyphChunk = Record<string, NotoPresetGlyph>

export function notoPresetChunkIndex(codepoint: number): number | null {
  const offset = codepoint - HANGUL_BASE
  return Number.isInteger(offset) && offset >= 0 && offset < HANGUL_COUNT ? Math.floor(offset / NOTO_PRESET_CHUNK_SIZE) : null
}

export function notoPresetChunkFile(index: number): string {
  return `glyphs/${String(index).padStart(3, '0')}.json`
}

/** dev는 API, 배포 빌드는 정적 파일. `?preset=static`·`?preset=api`로 배포 전에 다른 쪽 경로를 확인한다. */
export function resolveNotoPresetSource(isDev: boolean, search = ''): NotoPresetSource {
  const forced = new URLSearchParams(search).get('preset')
  if (forced === 'static' || forced === 'api') return forced
  return isDev ? 'api' : 'static'
}
const DB_NAME = 'noto-preset-glyphs'
const STORE = 'glyphs'

export interface NotoPresetGlyphCache {
  get<T = unknown>(key: string): Promise<T | undefined>
  set(key: string, value: unknown): Promise<void>
}

export type FetchJson = <T>(url: string, signal?: AbortSignal) => Promise<T>

export interface NotoPresetGlyphLoader {
  manifest(signal?: AbortSignal): Promise<NotoPresetManifest>
  glyph(codepoint: number, signal?: AbortSignal): Promise<NotoPresetGlyph>
  /** 변화량 모델 + 대표 두께. 글자와 같은 캐시에 stageKey로 둔다. */
  model(signal?: AbortSignal): Promise<NotoPresetModelBundle>
  /** 글자별 xor 리포트. 없으면 거부된다(격자는 상태 색으로 남는다). */
  xor(signal?: AbortSignal): Promise<NotoPresetXorMap>
  /** 서버 export가 바뀐 뒤 manifest를 다시 읽고 싶을 때. 캐시 항목은 키가 달라져 자연히 무시된다. */
  reset(): void
}

export async function defaultFetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal })
  const value: unknown = await response.json().catch(() => undefined)
  // 정적 호스팅은 없는 파일에 404나 SPA용 index.html(200, JSON 아님)을 준다. 둘 다 "배포에 파일이 없음"이다.
  if (response.status === 404 || (response.ok && value === undefined)) throw new Error((value as { error?: string } | undefined)?.error ?? 'Noto 프리셋 파일이 배포에 없습니다.')
  if (!response.ok) throw new Error((value as { error?: string } | undefined)?.error ?? 'Noto 프리셋을 읽지 못했습니다.')
  return value as T
}

export function createMemoryGlyphCache(): NotoPresetGlyphCache {
  const entries = new Map<string, unknown>()
  return { get: async <T,>(key: string) => entries.get(key) as T | undefined, set: async (key, value) => { entries.set(key, value) } }
}

/** 열기·읽기·쓰기 어느 단계든 실패하면 조용히 미스로 처리해 화면은 항상 API로 그릴 수 있게 한다. */
export function createIndexedDbGlyphCache(): NotoPresetGlyphCache {
  let opening: Promise<IDBDatabase | null> | undefined
  const open = () => {
    opening ??= new Promise<IDBDatabase | null>((resolve) => {
      try {
        const request = indexedDB.open(DB_NAME, 1)
        request.onupgradeneeded = () => { request.result.createObjectStore(STORE) }
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => resolve(null)
        request.onblocked = () => resolve(null)
      } catch { resolve(null) }
    })
    return opening
  }
  const run = <T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> => open().then((db) => new Promise<T | undefined>((resolve) => {
    if (!db) return resolve(undefined)
    try {
      const request = action(db.transaction(STORE, mode).objectStore(STORE))
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(undefined)
    } catch { resolve(undefined) }
  }))
  return {
    get: <T,>(key: string) => run<T | undefined>('readonly', (store) => store.get(key) as IDBRequest<T | undefined>),
    set: async (key, value) => { await run('readwrite', (store) => store.put(value, key)) },
  }
}

export function glyphCacheKey(manifest: Pick<NotoPresetManifest, 'stageKeys'>, codepoint: number): string {
  return `${manifest.stageKeys.outline}:${codepoint}`
}

export function modelCacheKey(manifest: Pick<NotoPresetManifest, 'stageKeys' | 'modelKey'>): string {
  return `${manifest.stageKeys.outline}:model:${manifest.modelKey ?? ''}`
}

export function createNotoPresetGlyphLoader(input: { fetchJson?: FetchJson; cache?: NotoPresetGlyphCache; source?: NotoPresetSource; baseUrl?: string } = {}): NotoPresetGlyphLoader {
  const fetchJson = input.fetchJson ?? defaultFetchJson
  const cache = input.cache ?? createMemoryGlyphCache()
  const isStatic = input.source === 'static'
  const staticRoot = `${input.baseUrl ?? '/'}${STATIC_DIRECTORY}`
  // 정적 파일은 이름이 안 바뀌므로 내용 키를 쿼리로 붙여 HTTP 캐시가 옛 파일을 주지 않게 한다.
  const staticUrl = (file: string, version: string) => `${staticRoot}/${file}?v=${encodeURIComponent(version)}`
  let manifestPromise: Promise<NotoPresetManifest> | undefined
  const inflight = new Map<string, Promise<NotoPresetGlyph>>()
  const chunkInflight = new Map<string, Promise<NotoPresetGlyphChunk>>()

  // 공유 요청(manifest·같은 글자)은 호출자 signal 없이 보낸다. 한 호출자가 취소해도(StrictMode 이중 effect 등)
  // 다른 호출자의 같은 요청이 함께 죽지 않게 하고, 취소는 호출자 promise에서만 거절한다.
  const abortable = <T,>(promise: Promise<T>, signal?: AbortSignal): Promise<T> => {
    if (!signal) return promise
    if (signal.aborted) return Promise.reject(signal.reason instanceof Error ? signal.reason : new DOMException('요청이 취소되었습니다.', 'AbortError'))
    return new Promise<T>((resolve, reject) => {
      const onAbort = () => reject(signal.reason instanceof Error ? signal.reason : new DOMException('요청이 취소되었습니다.', 'AbortError'))
      signal.addEventListener('abort', onAbort, { once: true })
      promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort))
    })
  }

  const sharedManifest = () => {
    manifestPromise ??= fetchJson<NotoPresetManifest>(isStatic ? `${staticRoot}/manifest.json` : API).then((value) => {
      if (value?.schema !== NOTO_PRESET_SCHEMA || typeof value.stageKeys?.outline !== 'string') throw new Error('Noto 프리셋 manifest 형식이 다릅니다.')
      return value
    }).catch((error: unknown) => { manifestPromise = undefined; throw error })
    return manifestPromise
  }

  // 정적 묶음은 한 번 받으면 28자를 모두 글자 단위 캐시에 넣는다. 같은 묶음의 동시 요청은 하나로 합친다.
  const sharedChunk = (manifest: NotoPresetManifest, index: number) => {
    const url = staticUrl(notoPresetChunkFile(index), manifest.stageKeys.outline)
    const pending = chunkInflight.get(url) ?? fetchJson<NotoPresetGlyphChunk>(url).then(async (chunk) => {
      if (!chunk || typeof chunk !== 'object') throw new Error('글자 묶음 형식이 다릅니다.')
      await Promise.all(Object.values(chunk).map((glyph) => cache.set(glyphCacheKey(manifest, glyph.identity.codepoint), glyph)))
      return chunk
    }).finally(() => chunkInflight.delete(url))
    chunkInflight.set(url, pending)
    return pending
  }

  const staticGlyph = async (manifest: NotoPresetManifest, codepoint: number) => {
    const index = notoPresetChunkIndex(codepoint)
    const value = index === null ? undefined : (await sharedChunk(manifest, index))[String(codepoint)]
    if (!value) throw new Error('이 글자의 Noto 윤곽이 없습니다.')
    if (value.identity?.codepoint !== codepoint || !value.outline?.operations) throw new Error('받은 글자가 요청과 다릅니다.')
    return value
  }

  const sharedGlyph = async (codepoint: number) => {
    const manifest = await sharedManifest()
    const key = glyphCacheKey(manifest, codepoint)
    const cached = await cache.get<NotoPresetGlyph>(key)
    if (cached) return cached
    if (isStatic) return staticGlyph(manifest, codepoint)
    const pending = inflight.get(key) ?? fetchJson<NotoPresetGlyph>(`${API}/glyph/${codepoint}`).then(async (value) => {
      if (value?.identity?.codepoint !== codepoint || !value.outline?.operations) throw new Error('받은 글자가 요청과 다릅니다.')
      await cache.set(key, value)
      return value
    }).finally(() => inflight.delete(key))
    inflight.set(key, pending)
    return pending
  }

  let modelInflight: Promise<NotoPresetModelBundle> | undefined
  const sharedModel = async () => {
    const key = modelCacheKey(await sharedManifest())
    const cached = await cache.get<NotoPresetModelBundle>(key)
    if (cached) return cached
    modelInflight ??= fetchJson<NotoPresetModelBundle>(isStatic ? staticUrl('model.json', key) : `${API}/model`).then(async (value) => {
      if (value?.schema !== NOTO_PRESET_MODEL_SCHEMA || !value.model?.targets || !value.thickness) throw new Error('모델 묶음 형식이 다릅니다.')
      await cache.set(key, value)
      return value
    }).finally(() => { modelInflight = undefined })
    return modelInflight
  }

  let xorInflight: Promise<NotoPresetXorMap> | undefined
  const sharedXor = async () => {
    const manifest = await sharedManifest()
    const key = `${manifest.stageKeys.outline}:xor:${manifest.xorKey ?? ''}`
    const cached = await cache.get<NotoPresetXorMap>(key)
    if (cached) return cached
    xorInflight ??= fetchJson<NotoPresetXorMap>(isStatic ? staticUrl('xor.json', key) : `${API}/xor`).then(async (value) => {
      if (value?.schema !== NOTO_PRESET_XOR_SCHEMA || !value.characters) throw new Error('글자 xor 리포트 형식이 다릅니다.')
      await cache.set(key, value)
      return value
    }).finally(() => { xorInflight = undefined })
    return xorInflight
  }

  return {
    manifest: (signal) => abortable(sharedManifest(), signal),
    glyph: (codepoint, signal) => {
      if (!Number.isInteger(codepoint)) return Promise.reject(new Error('codepoint가 정수여야 합니다.'))
      return abortable(sharedGlyph(codepoint), signal)
    },
    model: (signal) => abortable(sharedModel(), signal),
    xor: (signal) => abortable(sharedXor(), signal),
    reset: () => { manifestPromise = undefined },
  }
}

export const notoPresetGlyphs: NotoPresetGlyphLoader = createNotoPresetGlyphLoader({
  cache: typeof indexedDB === 'undefined' ? createMemoryGlyphCache() : createIndexedDbGlyphCache(),
  source: resolveNotoPresetSource(import.meta.env.DEV, typeof location === 'undefined' ? '' : location.search),
  baseUrl: import.meta.env.BASE_URL,
})
