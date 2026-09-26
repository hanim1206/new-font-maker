import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** 폰트를 바꿔 떠날 때: 예약된 쓰기를 버리고 얼리면, 떠나며(`beforeunload`) 옛 폰트가 다시 써지지 않는다. */
describe('freezePersistedWrites', () => {
  const written = new Map<string, string>()
  const unloadHandlers: (() => void)[] = []

  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
    written.clear()
    unloadHandlers.length = 0
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => written.get(key) ?? null,
      setItem: (key: string, value: string) => { written.set(key, value) },
      removeItem: (key: string) => { written.delete(key) },
    })
    vi.stubGlobal('window', { addEventListener: (type: string, handler: () => void) => { if (type === 'beforeunload') unloadHandlers.push(handler) } })
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('예약된 쓰기는 떠날 때 버려지고, 얼린 뒤의 쓰기도 받지 않는다', async () => {
    const { createDebouncedStorage, freezePersistedWrites } = await import('./debouncedStorage')
    const storage = createDebouncedStorage(300)
    storage.setItem('font', '옛 폰트')
    freezePersistedWrites()
    storage.setItem('font', '얼린 뒤')
    for (const handler of unloadHandlers) handler()
    vi.advanceTimersByTime(1000)
    expect(written.has('font')).toBe(false)
  })

  it('얼리지 않으면 떠날 때 예약된 쓰기를 마저 쓴다', async () => {
    const { createDebouncedStorage } = await import('./debouncedStorage')
    const storage = createDebouncedStorage(300)
    storage.setItem('font', '지금 폰트')
    for (const handler of unloadHandlers) handler()
    expect(written.get('font')).toBe('지금 폰트')
  })
})
