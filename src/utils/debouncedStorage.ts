import type { StateStorage } from 'zustand/middleware'

/**
 * localStorage를 디바운스로 감싼 스토리지
 *
 * 드래그 등 빈번한 상태 변경 시 localStorage.setItem 호출을 디바운스하여
 * 성능 저하를 방지한다. 인메모리 캐시를 통해 읽기는 항상 최신 값을 반환.
 */
export function createDebouncedStorage(delay = 300): StateStorage {
  const cache: Record<string, string> = {}
  const timers: Record<string, ReturnType<typeof setTimeout>> = {}

  // 탭 종료 시 미플러시 데이터 저장
  const flush = () => {
    for (const [name, timer] of Object.entries(timers)) {
      clearTimeout(timer)
      delete timers[name]
      if (name in cache) {
        try { localStorage.setItem(name, cache[name]) } catch { /* quota 초과 등 무시 */ }
      }
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
      clearTimeout(timers[name])
      timers[name] = setTimeout(() => {
        delete timers[name]
        try { localStorage.setItem(name, value) } catch { /* quota 초과 등 무시 */ }
      }, delay)
    },
    removeItem: (name: string) => {
      delete cache[name]
      clearTimeout(timers[name])
      delete timers[name]
      localStorage.removeItem(name)
    },
  }
}
