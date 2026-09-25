import { useEffect, useRef } from 'react'

/**
 * 편집 단축키(피드백 31). 되돌리기 · 다시 실행은 셸 머리의 두 단추와 같은 일을 한다.
 * 입력칸에서는 브라우저 제 것(글자 되돌리기)에 맡긴다. 한글 입력 중에도 되도록 글자(`key`)가 아니라 자판 자리(`code`)로 본다.
 */

type KeyLike = Pick<KeyboardEvent, 'key' | 'code' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>

/** 글자를 치는 자리면 단축키를 쓰지 않는다. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as Element).closest !== 'function') return false
  return Boolean((target as Element).closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])'))
}

/** ⌘Z / Ctrl+Z = 되돌리기, ⇧⌘Z / Ctrl+Shift+Z / Ctrl+Y = 다시 실행. 맥 · 윈도우를 가리지 않고 둘 다 받는다. */
export function historyShortcutOf(event: KeyLike): 'undo' | 'redo' | null {
  if (event.altKey || event.metaKey === event.ctrlKey) return null
  const z = event.code === 'KeyZ' || event.key.toLowerCase() === 'z'
  const y = event.code === 'KeyY' || event.key.toLowerCase() === 'y'
  if (z) return event.shiftKey ? 'redo' : 'undo'
  if (y && event.ctrlKey && !event.shiftKey) return 'redo'
  return null
}

/** 선택한 획 · 점 지우기. 맥의 `delete`는 Backspace로 온다. */
export function isDeleteKey(event: KeyLike): boolean {
  return (event.key === 'Delete' || event.key === 'Backspace') && !event.metaKey && !event.ctrlKey && !event.altKey
}

/** 셸이 쓴다. `controls`가 바뀌어도 듣기는 한 번만 붙인다. */
export function useHistoryShortcuts(controls: { canUndo: boolean; canRedo: boolean; onUndo: () => void; onRedo: () => void } | undefined): void {
  const latest = useRef(controls)
  useEffect(() => { latest.current = controls })
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing || isTypingTarget(event.target)) return
      const command = historyShortcutOf(event)
      const current = latest.current
      if (!command || !current) return
      event.preventDefault()
      if (command === 'undo' && current.canUndo) current.onUndo()
      if (command === 'redo' && current.canRedo) current.onRedo()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
