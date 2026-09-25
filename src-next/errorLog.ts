/**
 * 화면을 깨뜨리지 않은 오류(이벤트 · `await` 속 예외)는 알리지 않고 여기 모은다(최근 10개).
 * 오류 화면의 `자세히`가 같이 보여 준다. 서버로 보내기는 나중에 `onErrorRecorded` 자리에 붙인다.
 */

export type ErrorSource = 'render' | 'event' | 'promise'

export interface LoggedError {
  at: string
  source: ErrorSource
  message: string
  stack?: string
}

export const ERROR_LOG_LIMIT = 10

const entries: LoggedError[] = []
const listeners = new Set<(entry: LoggedError, error: unknown) => void>()

function messageOf(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`
  if (typeof error === 'string') return error
  try { return JSON.stringify(error) } catch { return String(error) }
}

export function recordError(error: unknown, source: ErrorSource, extraStack?: string): LoggedError {
  const stack = [error instanceof Error ? error.stack : undefined, extraStack].filter(Boolean).join('\n') || undefined
  const entry: LoggedError = { at: new Date().toISOString(), source, message: messageOf(error), stack }
  entries.push(entry)
  if (entries.length > ERROR_LOG_LIMIT) entries.splice(0, entries.length - ERROR_LOG_LIMIT)
  for (const listener of listeners) {
    try { listener(entry, error) } catch { /* 듣는 쪽 실패가 기록을 막지 않게. */ }
  }
  return entry
}

export function recentErrors(): readonly LoggedError[] {
  return entries
}

/** 기록될 때마다 부른다. 끊는 함수를 돌려준다. */
export function onErrorRecorded(listener: (entry: LoggedError, error: unknown) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** 브라우저 저장 공간이 찼을 때 나는 오류. 브라우저마다 이름이 다르다. */
export function isQuotaExceeded(error: unknown): boolean {
  if (!(error instanceof DOMException)) return false
  return error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED' || error.code === 22
}

let installed = false

/** 앱을 열 때 한 번. 잡히지 않은 예외를 기록만 한다(화면은 그대로). */
export function installErrorLog(): void {
  if (installed || typeof window === 'undefined') return
  installed = true
  window.addEventListener('error', (event) => { recordError(event.error ?? event.message, 'event') })
  window.addEventListener('unhandledrejection', (event) => { recordError(event.reason, 'promise') })
}

/** 테스트용. */
export function resetErrorLogForTest(): void {
  entries.length = 0
  listeners.clear()
}
