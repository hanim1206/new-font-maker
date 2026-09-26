import { freezePersistedWrites } from '../src/utils/debouncedStorage'
import { clearLocalFont, writeStamp } from './accountFont'
import { flushAccountFont, suspendAccountFont } from './accountFontSync'

/**
 * 대시보드 폰트 캐러셀에서 다른 폰트로 가기 · 새로 만들기 · 지운 뒤 다시 고르기.
 * 모두 이름표를 고쳐 쓰고 대시보드를 새로 연다 — 여는 길은 `main.tsx`(`startAccountFont` · `pickFont`) 하나다.
 */

const DASHBOARD_PATH = '/dashboard'
/** 다음에 열 폰트 이름. `index.html` 뼈대가 JS보다 먼저 한 번 읽어 머리 알약에 띄우고 지운다. */
const NEXT_FONT_NAME_KEY = 'next-font-name'

function rememberNextName(name: string): void {
  try { window.sessionStorage.setItem(NEXT_FONT_NAME_KEY, name) } catch { /* 이름 없이 회색 막대로 뜬다. */ }
}

/**
 * 브라우저 사본을 비운다. 스토어 사본 쓰기는 300ms 디바운스라, 예약을 버리고 쓰기를 얼린 뒤 지운다 —
 * 안 그러면 떠날 때(`beforeunload`) 옛 폰트가 다시 써져 새 폰트가 베낀다.
 */
function dropCopy(): void {
  suspendAccountFont()
  freezePersistedWrites()
  clearLocalFont(window.localStorage)
}

/** 지금 폰트를 올리고 떠난다. 못 올리면 false — 가지 않는다. */
async function leave(): Promise<boolean> {
  if (!(await flushAccountFont())) return false
  dropCopy()
  return true
}

/** 그 폰트로 대시보드를 다시 연다. 사본은 비우고 기록에서 읽게(`fresh`). */
export async function openFont(me: string, fontId: string, name: string): Promise<boolean> {
  if (!(await leave())) return false
  writeStamp(window.localStorage, { owner: me, fontId, pending: false, fresh: true })
  rememberNextName(name)
  window.location.assign(DASHBOARD_PATH)
  return true
}

/** 새 폰트(프리셋 그대로)를 이 이름으로 만들어 연다. 한도는 서버가 한 번 더 본다. */
export async function openNewFont(me: string, name: string): Promise<boolean> {
  if (!(await leave())) return false
  writeStamp(window.localStorage, { owner: me, fontId: null, pending: false, create: name })
  rememberNextName(name)
  window.location.assign(DASHBOARD_PATH)
  return true
}

/** 지금 폰트를 서버에서 지운 뒤 부른다. 올릴 것도 없다. 다시 열면 최근 폰트(없으면 새 폰트)가 열린다. */
export async function leaveDeletedFont(me: string): Promise<void> {
  dropCopy()
  writeStamp(window.localStorage, { owner: me, fontId: null, pending: false })
  window.location.assign(DASHBOARD_PATH)
}
