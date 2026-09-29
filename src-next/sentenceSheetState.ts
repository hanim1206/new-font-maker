import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type RefObject } from 'react'
import { randomSampleSentence } from './sampleSentences'

/**
 * 펼친 문장 줄(`문장` 시트). 줄이 그 자리에서 자라고, 글자를 누르면 그 자리에 커서, 아래 버튼 바는 자판 위에 뜬다.
 * 줄 그릇(높이 · 자라는 애니메이션 · 닫기 단추)은 쓰는 쪽이 그리고, 상태 · 커서 · 입력칸 · 크기 막대 · 버튼 바 · 글자 줄은 여기서.
 * 커서 자리는 글자 수(코드 포인트)로 센다.
 */

// 펼친 줄의 글자 크기(px). 기본 56(09-29 사용자: 64는 크다). 왼쪽 세로 막대로 바꾸고, 바꾼 값은 이 기기에 남긴다.
const SENTENCE_SHEET_EM = 56
export const SENTENCE_SHEET_EM_MIN = 32
export const SENTENCE_SHEET_EM_MAX = 128
const SENTENCE_SHEET_EM_KEY = 'font-maker-sentence-sheet-em'
function loadSentenceSheetEm(): number {
  try {
    const stored = Number(localStorage.getItem(SENTENCE_SHEET_EM_KEY))
    return stored >= SENTENCE_SHEET_EM_MIN && stored <= SENTENCE_SHEET_EM_MAX ? stored : SENTENCE_SHEET_EM
  } catch { return SENTENCE_SHEET_EM }
}

export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text)
    return
  }
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  const copied = document.execCommand('copy')
  textarea.remove()
  if (!copied) throw new Error('clipboard copy failed')
}

export function useSentenceSheet({ sentence, rootRef, measureHeight, onType, onRoll, onClear, onClose }: {
  sentence: string
  /** 고른 범위를 칠할 글자들(`data-char-index`)이 든 줄 그릇. */
  rootRef: RefObject<HTMLElement | null>
  /** 열 때 자랄 높이(px)를 잰다. 줄 그릇을 맨 위로 굴리는 것도 여기서. 못 재면 null(지난 높이 그대로). */
  measureHeight: () => number | null
  onType: (value: string) => void
  /** 주사위. 새 문장을 받는다. */
  onRoll: (next: string) => void
  onClear: () => void
  /** 닫기 직전. 빈 문장으로 닫을 때 채울 것을 쓰는 쪽이 정한다. */
  onClose?: () => void
}) {
  const [open, setOpen] = useState(false)
  // 줄어드는 동안만 true. 그동안은 여러 줄 그대로 줄어들고, 끝나면 원래 줄로 돌아간다.
  const [closing, setClosing] = useState(false)
  const [height, setHeight] = useState(0)
  const [caret, setCaret] = useState(0)
  // 고른 범위의 끝(글자 수). 커서만 있으면 `caret`과 같다. 입력칸이 안 보이므로 범위는 글자 줄에 칠해 보인다.
  const [selectionEnd, setSelectionEnd] = useState(0)
  const [copied, setCopied] = useState(false)
  // 주사위로 바꾼 횟수. 쓰는 쪽이 글자 줄 key에 붙여 새 문장이 올라오는 애니메이션을 다시 건다.
  const [rolled, setRolled] = useState(0)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [em, setEm] = useState(loadSentenceSheetEm)
  const changeEm = (next: number) => {
    setEm(next)
    try { localStorage.setItem(SENTENCE_SHEET_EM_KEY, String(next)) } catch { /* 못 남겨도 지금 화면은 바뀐다 */ }
  }
  const length = [...sentence].length
  // 열면 고른 것 없이 커서만 문장 끝에 둔다.
  const openSheet = () => {
    const measured = measureHeight()
    if (measured !== null) setHeight(measured)
    setCaret(length)
    setSelectionEnd(length)
    setClosing(false)
    setOpen(true)
  }
  const closeSheet = () => {
    inputRef.current?.blur()
    onClose?.()
    setOpen(false)
    setClosing(true)
  }
  // 펼친 동안 아래 버튼 바가 자판 위로 뜨게 자판 높이를 잰다(보이는 화면 아래 끝 ~ 창 아래 끝).
  const [keyboardInset, setKeyboardInset] = useState(0)
  useEffect(() => {
    const viewport = window.visualViewport
    if (!open || !viewport) return
    const measure = () => setKeyboardInset(Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop)))
    measure()
    viewport.addEventListener('resize', measure)
    viewport.addEventListener('scroll', measure)
    return () => {
      viewport.removeEventListener('resize', measure)
      viewport.removeEventListener('scroll', measure)
      setKeyboardInset(0)
    }
  }, [open])
  // 줄어드는 시간(--motion-slow)이 지나면 원래 줄로 돌아간다.
  useEffect(() => {
    if (!closing) return
    const timer = window.setTimeout(() => setClosing(false), 260)
    return () => window.clearTimeout(timer)
  }, [closing])
  const placeCaret = (index: number) => {
    setCaret(index)
    setSelectionEnd(index)
    const input = inputRef.current
    if (!input) return
    // 누른 그 손길 안에서 포커스해야 폰 자판이 열린다.
    input.focus({ preventScroll: true })
    const offset = [...input.value].slice(0, index).join('').length
    input.setSelectionRange(offset, offset)
  }
  const syncCaret = (input: HTMLTextAreaElement) => {
    setCaret([...input.value.slice(0, input.selectionStart ?? input.value.length)].length)
    setSelectionEnd([...input.value.slice(0, input.selectionEnd ?? input.value.length)].length)
  }
  // 마우스로 쓰는 화면에서는 펼치자마자 입력칸에 커서를 둔다(⌘V · ⌘A가 바로 먹게). 폰은 누를 때까지 자판을 안 연다.
  useEffect(() => {
    if (!open || !window.matchMedia?.('(pointer: fine)').matches) return
    placeCaret(length)
  // 펼칠 때 한 번만.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  // 고른 범위를 글자 줄에 칠한다. 글자 그림은 입력칸과 따로라 DOM 표시로 얹는다.
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const from = Math.min(caret, selectionEnd)
    const to = Math.max(caret, selectionEnd)
    root.querySelectorAll<HTMLElement>('[data-char-index]').forEach((element) => {
      const index = Number(element.dataset.charIndex)
      element.toggleAttribute('data-sheet-selected', open && index >= from && index < to)
    })
  }, [rootRef, open, caret, selectionEnd, sentence])
  // 고른 범위가 있으면 그것만, 없으면 문장 전체를 복사한다.
  const copy = () => {
    const input = inputRef.current
    const wasFocused = Boolean(input && document.activeElement === input)
    const text = input && input.selectionStart !== input.selectionEnd ? input.value.slice(input.selectionStart, input.selectionEnd) : sentence
    void copyText(text)
      .then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1200) })
      .catch(() => {})
      .finally(() => { if (wasFocused) input?.focus({ preventScroll: true }) })
  }
  // 커서 자리에(고른 범위가 있으면 그 자리를 바꿔) 붙인다. 폰은 입력칸을 길게 누를 수 없어 이 단추가 붙여넣기 길이다.
  const paste = () => {
    const input = inputRef.current
    if (!input || !navigator.clipboard?.readText) return
    if (document.activeElement !== input) {
      input.focus({ preventScroll: true })
      input.setSelectionRange(input.value.length, input.value.length)
    }
    void navigator.clipboard.readText().then((text) => {
      if (!text) return
      input.focus({ preventScroll: true })
      // 브라우저 입력으로 넣어야 ⌘Z로 되돌릴 수 있다. 안 되는 브라우저는 직접 넣고 입력 이벤트를 쏜다.
      if (!document.execCommand('insertText', false, text)) {
        input.setRangeText(text, input.selectionStart, input.selectionEnd, 'end')
        input.dispatchEvent(new Event('input', { bubbles: true }))
      }
    }).catch(() => {})
  }
  // 글자를 누르면 가까운 쪽 가장자리, 빈 곳을 누르면 문장 끝.
  const pickCaret = (event: ReactMouseEvent<HTMLElement>) => {
    if (!open) return
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-char-index]')
    if (!target) return placeCaret(length)
    const index = Number(target.dataset.charIndex)
    const rect = target.getBoundingClientRect()
    placeCaret(event.clientX < rect.left + rect.width / 2 ? index : index + 1)
  }
  const clear = () => {
    onClear()
    placeCaret(0)
  }
  // 주사위는 비우지 않고 새 문장으로 바꾼다. 값이 바뀌면 입력칸 커서는 저절로 끝으로 간다.
  const roll = () => {
    const next = randomSampleSentence(sentence)
    onRoll(next)
    setRolled((count) => count + 1)
    setCaret([...next].length)
    setSelectionEnd([...next].length)
  }
  return { open, closing, height, caret, rolled, em, changeEm, openSheet, closeSheet, pickCaret, syncCaret, inputRef, keyboardInset, copied, copy, paste, clear, roll, sentence, onType }
}

export type SentenceSheetState = ReturnType<typeof useSentenceSheet>
