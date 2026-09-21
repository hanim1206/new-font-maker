export type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export interface SaveToastView {
  tone: 'saving' | 'error'
  message: string
  /** 닫기 단추를 보일지. 실패만 사용자가 직접 닫는다. */
  dismissable: boolean
}

/**
 * 저장 상태를 토스트 한 줄로 옮긴다.
 * 성공은 띄우지 않는다 — 잘 된 일로 매번 방해하지 않기로 했다.
 * `저장 중`은 `savingLate`(300ms 넘김)일 때만 — 빠른 저장에서 깜빡이지 않게.
 */
export function saveToastView(
  state: SaveState,
  feedback: string | null,
  savingLate: boolean,
): SaveToastView | null {
  if (state === 'error') return { tone: 'error', message: feedback ?? '저장하지 못했습니다.', dismissable: true }
  if (state === 'saving' && savingLate) return { tone: 'saving', message: '저장 중…', dismissable: false }
  return null
}
