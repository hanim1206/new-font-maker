import type { StateStorage } from 'zustand/middleware'

export interface FlushableStateStorage extends StateStorage {
  /** 예약된 write를 즉시 반영한다. 실패는 호출자에게 전달한다. */
  flush: (name?: string) => void
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

  return {
    getItem: (name: string) => {
      return cache[name] ?? localStorage.getItem(name)
    },
    setItem: (name: string, value: string) => {
      cache[name] = value
      dirty.add(name)
      clearTimeout(timers[name])
      timers[name] = setTimeout(() => {
        try { flushOne(name) } catch { /* dirty를 유지해 명시 flush에서 관측·재시도한다. */ }
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
