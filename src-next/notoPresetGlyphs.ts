import { NOTO_PRESET_MODEL_SCHEMA, NOTO_PRESET_SCHEMA } from './notoPreset'
import type { NotoPresetGlyph, NotoPresetManifest, NotoPresetModelBundle } from './notoPreset'

export type { NotoPresetGlyph, NotoPresetManifest, NotoPresetModelBundle }

/**
 * 글자별 Noto 윤곽을 필요한 글자만 API로 받아 IndexedDB에 둔다.
 * 캐시 키에 outline stageKey를 넣어 추출 버전이 바뀌면 자동으로 새로 받는다.
 */

const API = '/api/noto-preset'
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
  /** 서버 export가 바뀐 뒤 manifest를 다시 읽고 싶을 때. 캐시 항목은 키가 달라져 자연히 무시된다. */
  reset(): void
}

export async function defaultFetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal })
  const value = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error((value as { error?: string }).error ?? 'Noto 프리셋을 읽지 못했습니다.')
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

export function modelCacheKey(manifest: Pick<NotoPresetManifest, 'stageKeys'>): string {
  return `${manifest.stageKeys.outline}:model`
}

export function createNotoPresetGlyphLoader(input: { fetchJson?: FetchJson; cache?: NotoPresetGlyphCache } = {}): NotoPresetGlyphLoader {
  const fetchJson = input.fetchJson ?? defaultFetchJson
  const cache = input.cache ?? createMemoryGlyphCache()
  let manifestPromise: Promise<NotoPresetManifest> | undefined
  const inflight = new Map<string, Promise<NotoPresetGlyph>>()

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
    manifestPromise ??= fetchJson<NotoPresetManifest>(API).then((value) => {
      if (value?.schema !== NOTO_PRESET_SCHEMA || typeof value.stageKeys?.outline !== 'string') throw new Error('Noto 프리셋 manifest 형식이 다릅니다.')
      return value
    }).catch((error: unknown) => { manifestPromise = undefined; throw error })
    return manifestPromise
  }

  const sharedGlyph = async (codepoint: number) => {
    const key = glyphCacheKey(await sharedManifest(), codepoint)
    const cached = await cache.get<NotoPresetGlyph>(key)
    if (cached) return cached
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
    modelInflight ??= fetchJson<NotoPresetModelBundle>(`${API}/model`).then(async (value) => {
      if (value?.schema !== NOTO_PRESET_MODEL_SCHEMA || !value.model?.targets || !value.thickness) throw new Error('모델 묶음 형식이 다릅니다.')
      await cache.set(key, value)
      return value
    }).finally(() => { modelInflight = undefined })
    return modelInflight
  }

  return {
    manifest: (signal) => abortable(sharedManifest(), signal),
    glyph: (codepoint, signal) => {
      if (!Number.isInteger(codepoint)) return Promise.reject(new Error('codepoint가 정수여야 합니다.'))
      return abortable(sharedGlyph(codepoint), signal)
    },
    model: (signal) => abortable(sharedModel(), signal),
    reset: () => { manifestPromise = undefined },
  }
}

export const notoPresetGlyphs: NotoPresetGlyphLoader = createNotoPresetGlyphLoader({
  cache: typeof indexedDB === 'undefined' ? createMemoryGlyphCache() : createIndexedDbGlyphCache(),
})
