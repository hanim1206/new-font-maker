import { clearLocalFont, writeStamp } from './accountFont'
import { flushAccountFont, suspendAccountFont } from './accountFontSync'

/**
 * 대시보드 폰트 캐러셀에서 다른 폰트로 가기 · 새로 만들기 · 지운 뒤 다시 고르기.
 * 모두 이름표를 고쳐 쓰고 대시보드를 새로 연다 — 여는 길은 `main.tsx`(`startAccountFont` · `pickFont`) 하나다.
 */

const DASHBOARD_PATH = '/dashboard'
/** 스토어 사본 쓰기는 300ms 디바운스다. 그 안에 비우면 떠날 때(`beforeunload`) 옛 폰트가 다시 써져 새 폰트가 베낀다. */
const STORAGE_SETTLE_MS = 400

async function dropCopy(): Promise<void> {
  suspendAccountFont()
  await new Promise((resolve) => setTimeout(resolve, STORAGE_SETTLE_MS))
  clearLocalFont(window.localStorage)
}

/** 지금 폰트를 올리고 떠난다. 못 올리면 false — 가지 않는다. */
async function leave(): Promise<boolean> {
  if (!(await flushAccountFont())) return false
  await dropCopy()
  return true
}

/** 그 폰트로 대시보드를 다시 연다. 사본은 비우고 기록에서 읽게(`fresh`). */
export async function openFont(me: string, fontId: string): Promise<boolean> {
  if (!(await leave())) return false
  writeStamp(window.localStorage, { owner: me, fontId, pending: false, fresh: true })
  window.location.assign(DASHBOARD_PATH)
  return true
}

/** 새 폰트(프리셋 그대로)를 이 이름으로 만들어 연다. 한도는 서버가 한 번 더 본다. */
export async function openNewFont(me: string, name: string): Promise<boolean> {
  if (!(await leave())) return false
  writeStamp(window.localStorage, { owner: me, fontId: null, pending: false, create: name })
  window.location.assign(DASHBOARD_PATH)
  return true
}

/** 지금 폰트를 서버에서 지운 뒤 부른다. 올릴 것도 없다. 다시 열면 최근 폰트(없으면 새 폰트)가 열린다. */
export async function leaveDeletedFont(me: string): Promise<void> {
  await dropCopy()
  writeStamp(window.localStorage, { owner: me, fontId: null, pending: false })
  window.location.assign(DASHBOARD_PATH)
}
