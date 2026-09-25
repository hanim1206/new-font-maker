/**
 * 같은 폰트는 한 탭에서만 편집한다(`navigator.locks`). 탭끼리 같은 브라우저 사본을 쓰므로, 둘이 고치면 나중 쓴 쪽이 덮는다.
 * 둘째 탭은 안내를 띄우고, `여기서 열기`면 잠금을 빼앗는다(`steal`). 빼앗긴 탭은 저장을 멈추고 같은 안내로 바뀐다.
 * 따로 넘겨받는 통신은 없다 — 탭을 옮기면 떠난 탭이 이미 올리고(`visibilitychange`), 못 올린 건 사본 이름표(`pending`)로 새 탭이 올린다.
 */

/** `여기서 열기`를 누르고 새로 불러올 때 남기는 표시(이 탭에서만). */
export const EDIT_LOCK_STEAL_KEY = 'font-edit-steal-v1'

/** 계정 폰트면 `사람:폰트`, 로그인 게이트가 꺼졌으면 이 브라우저 사본 하나. */
export function editLockName(me: string | undefined, fontId: string | null): string {
  return me ? `font-edit:${me}:${fontId ?? 'new'}` : 'font-edit:local'
}

/** 이번에 빼앗아야 하는지. 표시는 읽으면서 지운다. */
export function takeStealRequest(storage: Storage): boolean {
  try {
    const requested = storage.getItem(EDIT_LOCK_STEAL_KEY) === '1'
    storage.removeItem(EDIT_LOCK_STEAL_KEY)
    return requested
  } catch {
    return false
  }
}

export function requestStealAndReload(): void {
  try { window.sessionStorage.setItem(EDIT_LOCK_STEAL_KEY, '1') } catch { /* 표시를 못 남기면 다시 안내가 뜬다 */ }
  window.location.reload()
}

/**
 * 잠금을 쥔다. 쥐었으면 true(탭이 살아 있는 동안 놓지 않는다), 다른 탭이 쥐고 있으면 false.
 * 잠금을 모르는 브라우저는 막지 않는다(true).
 */
export function holdEditLock(name: string, options: { steal: boolean; onLost: () => void }): Promise<boolean> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined
  if (!locks) return Promise.resolve(true)
  return new Promise<boolean>((resolve) => {
    let held = false
    const lockOptions: LockOptions = options.steal ? { steal: true } : { ifAvailable: true }
    locks.request(name, lockOptions, (lock) => {
      if (!lock) { resolve(false); return undefined }
      held = true
      resolve(true)
      return new Promise<void>(() => {})
    }).catch(() => {
      // 다른 탭이 빼앗으면 쥐고 있던 요청이 AbortError로 끝난다.
      if (held) options.onLost()
      else resolve(true)
    })
  })
}
