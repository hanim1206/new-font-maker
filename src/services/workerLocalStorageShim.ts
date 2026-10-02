/**
 * Worker에는 localStorage가 없다. 스토어(persist · debouncedStorage)가 모듈 로드 때 바로 만지므로,
 * 이 모듈을 **다른 import보다 먼저** 적어 메모리 대역을 깔아 둔다(import는 적은 순서로 실행된다).
 */
const memory = new Map<string, string>()
if (typeof localStorage === 'undefined') {
  ;(globalThis as unknown as { localStorage: unknown }).localStorage = {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => memory.set(key, value),
    removeItem: (key: string) => memory.delete(key),
    clear: () => memory.clear(),
    key: (index: number) => [...memory.keys()][index] ?? null,
    get length() { return memory.size },
  }
}

export {}
