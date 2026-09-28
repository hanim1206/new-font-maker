import { beforeEach, describe, expect, it } from 'vitest'
import { resetAppNoticeForTest, topAppNotice, useAppNoticeStore } from './appNotice'
import { EXPORT_IN_FLIGHT_KEY, INTERRUPTED_EXPORT_MESSAGE, clearExportMark, markExportStarted, reportInterruptedExport, takeInterruptedExport } from './exportInterrupted'

function memoryStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() { return map.size },
    clear: () => map.clear(),
    key: (index) => [...map.keys()][index] ?? null,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => { map.set(key, value) },
    removeItem: (key) => { map.delete(key) },
  }
}

describe('추출 도중 탭이 죽었을 때', () => {
  beforeEach(() => resetAppNoticeForTest())

  it('끝까지 돌면 표시가 지워져 다시 열어도 알리지 않는다', () => {
    const storage = memoryStorage()
    markExportStarted(storage)
    clearExportMark(storage)
    expect(takeInterruptedExport(storage)).toBe(false)
  })

  it('표시가 남은 채 다시 열리면 한 번만 알린다', () => {
    const storage = memoryStorage()
    markExportStarted(storage, 1_000)
    expect(takeInterruptedExport(storage, 61_000)).toBe(true)
    expect(storage.getItem(EXPORT_IN_FLIGHT_KEY)).toBeNull()
    expect(takeInterruptedExport(storage, 62_000)).toBe(false)
  })

  it('한 시간 넘은 표시는 조용히 지운다', () => {
    const storage = memoryStorage()
    markExportStarted(storage, 0)
    expect(takeInterruptedExport(storage, 2 * 60 * 60 * 1000)).toBe(false)
    expect(storage.getItem(EXPORT_IN_FLIGHT_KEY)).toBeNull()
  })

  it('앱 아래 한 줄 알림으로 띄운다', () => {
    const storage = memoryStorage()
    markExportStarted(storage)
    reportInterruptedExport(storage)
    expect(topAppNotice(useAppNoticeStore.getState())).toMatchObject({ kind: 'export-interrupted', notice: { tone: 'error', message: INTERRUPTED_EXPORT_MESSAGE } })
  })
})
