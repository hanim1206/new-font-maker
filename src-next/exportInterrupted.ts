import { showAppNotice } from './appNotice'

/**
 * 추출 도중 탭이 죽었는지 알아보는 표시. 아이폰 Safari는 메모리가 모자라면 탭을 죽이고 다시 불러온다 —
 * 그러면 앱의 실패 토스트가 뜰 틈이 없다. 시작할 때 표시를 남기고 끝나면 지운다. 다시 열었는데 표시가 남아 있으면 알린다.
 * 스토어(추출기 전체)를 가져오지 않고 `main.tsx`에서 바로 부를 수 있게 따로 둔다.
 */

export const EXPORT_IN_FLIGHT_KEY = 'font-export-in-flight-v1'
/** 이보다 오래된 표시는 탭을 닫았다 한참 뒤 연 것으로 보고 조용히 지운다. */
const STALE_MS = 60 * 60 * 1000

export const INTERRUPTED_EXPORT_MESSAGE = '지난번 폰트 받기가 끝나지 못하고 화면이 다시 열렸어요. 기기 메모리가 모자랐을 수 있어요. 다시 받아 보고, 또 그러면 알려 주세요.'

export function markExportStarted(storage: Storage, now = Date.now()): void {
  try { storage.setItem(EXPORT_IN_FLIGHT_KEY, String(now)) } catch { /* 못 남겨도 추출은 된다 */ }
}

export function clearExportMark(storage: Storage): void {
  try { storage.removeItem(EXPORT_IN_FLIGHT_KEY) } catch { /* 없다 */ }
}

/** 끝나지 못한 추출이 있었나. 읽으면 지운다(한 번만 알린다). */
export function takeInterruptedExport(storage: Storage, now = Date.now()): boolean {
  let raw: string | null
  try { raw = storage.getItem(EXPORT_IN_FLIGHT_KEY) } catch { return false }
  if (raw === null) return false
  clearExportMark(storage)
  const at = Number(raw)
  return Number.isFinite(at) && now - at >= 0 && now - at < STALE_MS
}

export function reportInterruptedExport(storage: Storage): void {
  if (!takeInterruptedExport(storage)) return
  showAppNotice('export-interrupted', { tone: 'error', message: INTERRUPTED_EXPORT_MESSAGE, dismissable: true })
}
