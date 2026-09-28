import { useUIStore } from '../src/stores/uiStore'
import { readStamp } from './accountFont'
import { deviceOf, screenOf } from './feedback'
import type { FeedbackContext, ReportTag } from './feedback'

/**
 * 의견을 보낸 자리. 경로 · 화면 이름 · 지금 연 폰트(id · 이름) · 기기 · 빌드.
 * 폰트 id는 브라우저 사본 이름표(`readStamp`)에서 — 재현 화면이 이 id로 그 친구 폰트를 연다. 빌드는 진입 번들 이름(해시).
 */
export function feedbackContextOf(pathname: string, tag: ReportTag | null = null): FeedbackContext {
  const entry = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/"]')?.src
  let fontId: string | null = null
  try { fontId = readStamp(window.localStorage).fontId } catch { /* 저장소를 못 읽으면 id 없이 */ }
  return {
    path: pathname,
    screen: screenOf(pathname),
    font: useUIStore.getState().currentProjectName,
    fontId,
    device: deviceOf(navigator.userAgent),
    build: entry ? entry.split('/').pop()!.replace(/\.js$/, '') : 'dev',
    tag,
  }
}
