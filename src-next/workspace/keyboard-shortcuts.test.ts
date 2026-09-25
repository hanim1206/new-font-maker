import { describe, expect, it } from 'vitest'
import { historyShortcutOf, isDeleteKey } from './keyboardShortcuts'

const key = (partial: Partial<KeyboardEvent>) => ({ key: '', code: '', metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...partial }) as KeyboardEvent

describe('편집 단축키', () => {
  it('⌘Z · Ctrl+Z = 되돌리기, ⇧를 더하거나 Ctrl+Y면 다시 실행', () => {
    expect(historyShortcutOf(key({ key: 'z', code: 'KeyZ', metaKey: true }))).toBe('undo')
    expect(historyShortcutOf(key({ key: 'z', code: 'KeyZ', ctrlKey: true }))).toBe('undo')
    expect(historyShortcutOf(key({ key: 'Z', code: 'KeyZ', metaKey: true, shiftKey: true }))).toBe('redo')
    expect(historyShortcutOf(key({ key: 'y', code: 'KeyY', ctrlKey: true }))).toBe('redo')
  })

  it('한글 자판이어도 자리(KeyZ)로 알아본다', () => {
    expect(historyShortcutOf(key({ key: 'ㅋ', code: 'KeyZ', metaKey: true }))).toBe('undo')
  })

  it('수식키 없이, Alt를 섞거나, ⌘·Ctrl을 같이 누르면 아니다. ⌘Y는 다시 실행이 아니다', () => {
    expect(historyShortcutOf(key({ key: 'z', code: 'KeyZ' }))).toBeNull()
    expect(historyShortcutOf(key({ key: 'z', code: 'KeyZ', metaKey: true, altKey: true }))).toBeNull()
    expect(historyShortcutOf(key({ key: 'z', code: 'KeyZ', metaKey: true, ctrlKey: true }))).toBeNull()
    expect(historyShortcutOf(key({ key: 'y', code: 'KeyY', metaKey: true }))).toBeNull()
  })

  it('지우기는 Delete · Backspace, 수식키 없이만', () => {
    expect(isDeleteKey(key({ key: 'Delete' }))).toBe(true)
    expect(isDeleteKey(key({ key: 'Backspace' }))).toBe(true)
    expect(isDeleteKey(key({ key: 'Backspace', metaKey: true }))).toBe(false)
  })
})
