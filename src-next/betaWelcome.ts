/** 초대 링크 `?to=민지`로 받은 이름을 이 기기에 남겨 두는 키. 링크 없이 다시 들어와도 인사한다. */
export const WELCOME_NAME_KEY = 'hfm-beta-welcome-name'

/** 로그인 화면 인사는 프리셋 글자로 그린다 — 한글 음절만, 여섯 자까지. */
const DRAWABLE_NAME = /^[가-힣]{1,6}$/

export function isDrawableName(name: string): boolean {
  return DRAWABLE_NAME.test(name)
}

/**
 * 로그인 화면에서 부를 이름. 링크의 `to`가 그릴 수 있는 이름이면 기억하고 그것을, 아니면 기억해 둔 이름을.
 * 그릴 수 없는 `to`(영문 등)는 기억을 덮지 않는다. 없으면 null — 화면은 `환영합니다`만.
 */
export function welcomeNameOf(search: string, storage: Pick<Storage, 'getItem' | 'setItem'>): string | null {
  const fromLink = new URLSearchParams(search).get('to')?.trim() ?? ''
  if (isDrawableName(fromLink)) {
    try { storage.setItem(WELCOME_NAME_KEY, fromLink) } catch { /* 저장 못 해도 이번엔 부른다 */ }
    return fromLink
  }
  let remembered: string | null = null
  try { remembered = storage.getItem(WELCOME_NAME_KEY) } catch { /* 없는 셈 */ }
  return remembered && isDrawableName(remembered) ? remembered : null
}
