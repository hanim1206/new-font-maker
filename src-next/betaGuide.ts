/**
 * 처음 들어온 베타 테스터에게 띄우는 안내(`BetaGuideSheet`). 로그인하면 `pending`, 다 보거나 닫으면 `seen`.
 * 이 기기에서 한 번 본 사람은 다시 로그인해도 안 띄운다. `?guide`가 붙은 대시보드는 언제나 띄운다(미리 보기).
 */
export const BETA_GUIDE_KEY = 'hfm-beta-guide'

type GuideStorage = Pick<Storage, 'getItem' | 'setItem'>

function read(storage: GuideStorage): string | null {
  try { return storage.getItem(BETA_GUIDE_KEY) } catch { return null }
}

function write(storage: GuideStorage, value: 'pending' | 'seen'): void {
  try { storage.setItem(BETA_GUIDE_KEY, value) } catch { /* 못 남기면 이번엔 안 띄운다 */ }
}

/** 로그인 성공 때. 이미 본 기기면 그대로 둔다. */
export function markBetaGuidePending(storage: GuideStorage): void {
  if (read(storage) !== 'seen') write(storage, 'pending')
}

export function shouldShowBetaGuide(search: string, storage: GuideStorage): boolean {
  return new URLSearchParams(search).has('guide') || read(storage) === 'pending'
}

export function markBetaGuideSeen(storage: GuideStorage): void {
  write(storage, 'seen')
}
