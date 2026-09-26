import type { StateStorage } from 'zustand/middleware'

export interface FlushableStateStorage extends StateStorage {
  /** 예약된 write를 즉시 반영한다. 실패는 호출자에게 전달한다. */
  flush: (name?: string) => void
}

let writeErrorHandler: ((error: unknown, name: string) => void) | null = null

/** 만든 스토리지마다 `예약 버리기`를 모아 둔다. 폰트를 바꿔 떠날 때 한 번에 부른다. */
const discarders = new Set<() => void>()
let frozen = false

/**
 * 예약된 쓰기를 모두 버리고, 이 페이지가 끝날 때까지 새 쓰기도 받지 않는다.
 * 폰트를 바꿔 떠나기 직전에 부른다 — 사본을 비운 뒤 옛 폰트가 떠나면서(`beforeunload`) 다시 써지지 않게.
 * 예약이 끝나기를 기다리지 않아도 된다(옛 400ms 기다림 대신).
 */
export function freezePersistedWrites(): void {
  frozen = true
  for (const discard of discarders) discard()
}

/** 예약된 쓰기가 실패하면(저장 공간 초과 등) 부른다. 앱이 알림을 붙인다(`main.tsx`). */
export function setPersistWriteErrorHandler(handler: ((error: unknown, name: string) => void) | null): void {
  writeErrorHandler = handler
}

/**
 * localStorage를 디바운스로 감싼 스토리지
 *
 * 드래그 등 빈번한 상태 변경 시 localStorage.setItem 호출을 디바운스하여
 * 성능 저하를 방지한다. 인메모리 캐시를 통해 읽기는 항상 최신 값을 반환.
 */
export function createDebouncedStorage(delay = 300): FlushableStateStorage {
  const cache: Record<string, string> = {}
  const timers: Record<string, ReturnType<typeof setTimeout>> = {}
  const dirty = new Set<string>()

  const flushOne = (name: string) => {
    const timer = timers[name]
    if (timer) clearTimeout(timer)
    delete timers[name]
    if (!dirty.has(name) || !(name in cache)) return
    localStorage.setItem(name, cache[name])
    dirty.delete(name)
  }

  // 탭 종료 시 미플러시 데이터 저장
  const flush = () => {
    for (const name of [...dirty]) {
      try { flushOne(name) } catch { /* unload 중에는 재시도 UI를 표시할 수 없다. */ }
    }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', flush)
  }
  discarders.add(() => {
    for (const name of Object.keys(timers)) clearTimeout(timers[name])
    for (const name of Object.keys(timers)) delete timers[name]
    dirty.clear()
  })

  return {
    getItem: (name: string) => {
      return cache[name] ?? localStorage.getItem(name)
    },
    setItem: (name: string, value: string) => {
      if (frozen) return
      cache[name] = value
      dirty.add(name)
      clearTimeout(timers[name])
      timers[name] = setTimeout(() => {
        // dirty를 유지해 명시 flush에서 관측·재시도한다. 실패는 앱에 알린다.
        try { flushOne(name) } catch (error) { writeErrorHandler?.(error, name) }
      }, delay)
    },
    removeItem: (name: string) => {
      delete cache[name]
      dirty.delete(name)
      clearTimeout(timers[name])
      delete timers[name]
      localStorage.removeItem(name)
    },
    flush: (name?: string) => {
      if (name !== undefined) flushOne(name)
      else for (const dirtyName of [...dirty]) flushOne(dirtyName)
    },
  }
}
