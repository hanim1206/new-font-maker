import { LOCAL_FONT_KEYS } from './accountFont'

/**
 * 오류 화면 · 업데이트 알림 · 탭 잠금이 지금 작업을 다루는 창구. 편집 화면을 열 때 `accountFontSync`가 채운다.
 * 이 모듈은 스토어를 가져오지 않는다 — 로그인 화면에서 가져와도 브라우저 사본을 읽지 않게.
 */
export interface WorkGuard {
  /** 못 올린 변경을 올린다. 다 올라갔으면 true. */
  flush: () => Promise<boolean>
  /** 지금 폰트 JSON(`FontData`). */
  collect: () => unknown
  /** 지금 폰트 이름. 없으면 null. */
  name: () => string | null
  /** 이 탭에서 저장을 멈춘다(다른 탭이 편집을 가져갔을 때). */
  suspend: () => void
}

let guard: WorkGuard | null = null

export function registerWorkGuard(next: WorkGuard): void {
  guard = next
}

/** 편집 화면이 없으면 올릴 것도 없다. 던지면 못 올린 것으로 친다. */
export async function flushWork(): Promise<boolean> {
  if (!guard) return true
  try { return await guard.flush() } catch { return false }
}

export function suspendWork(): void {
  guard?.suspend()
}

/** 스토어에서 모으다 실패하면(스토어가 깨졌을 때) 브라우저 사본 원문을 그대로 담는다. */
export interface RawFontBackup {
  kind: 'font-maker-raw-backup'
  savedAt: string
  keys: Record<string, string | null>
}

export interface WorkBackup {
  fileName: string
  /** `FontData`, 또는 모으기 실패 때 `RawFontBackup`. */
  data: unknown
  raw: boolean
}

function dayText(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** 파일 이름에 못 쓰는 글자를 뺀다. */
function safeName(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, ' ').trim() || '내 폰트'
}

export function buildWorkBackup(storage: Storage, now = new Date()): WorkBackup {
  let name: string | null = null
  try { name = guard?.name() ?? null } catch { name = null }
  const fileName = `${safeName(name ?? '내 폰트')}_${dayText(now)}.json`
  if (guard) {
    try { return { fileName, data: guard.collect(), raw: false } } catch { /* 아래 원문으로 */ }
  }
  const keys: Record<string, string | null> = {}
  for (const key of LOCAL_FONT_KEYS) {
    try { keys[key] = storage.getItem(key) } catch { keys[key] = null }
  }
  const raw: RawFontBackup = { kind: 'font-maker-raw-backup', savedAt: now.toISOString(), keys }
  return { fileName, data: raw, raw: true }
}

/** 지금 작업을 JSON 파일로 내려받는다. 다시 불러오기는 아직 없다(26 저장 형식에서). */
export function downloadWorkBackup(): WorkBackup {
  const backup = buildWorkBackup(window.localStorage)
  const blob = new Blob([JSON.stringify(backup.data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = backup.fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return backup
}

/** 테스트용. */
export function resetWorkGuardForTest(): void {
  guard = null
}
