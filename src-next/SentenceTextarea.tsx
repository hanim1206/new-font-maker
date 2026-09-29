import { startTransition, useEffect, useRef, useState, type Ref, type TextareaHTMLAttributes } from 'react'

/**
 * 문장 입력칸. 칸 안 글자는 바로 바뀌고, 문장 그림(글자마다 획 맞추기 · 커서)은 전환으로 뒤따른다 — 치는 동안 입력이 막히지 않는다.
 * 늦게 돌아오는 내 값은 무시하고, 밖에서 바꾼 값(주사위 · 전체 삭제)만 칸에 받는다.
 */
export function SentenceTextarea({ value, onValueChange, onCaretChange, ref, ...rest }: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange' | 'onSelect'> & {
  value: string
  onValueChange: (value: string) => void
  onCaretChange?: (input: HTMLTextAreaElement) => void
  ref?: Ref<HTMLTextAreaElement>
}) {
  const [draft, setDraft] = useState(value)
  const sent = useRef<string[]>([])
  useEffect(() => {
    const index = sent.current.indexOf(value)
    if (index >= 0) { sent.current = sent.current.slice(index + 1); return }
    sent.current = []
    setDraft(value)
  }, [value])
  return <textarea
    {...rest}
    ref={ref}
    value={draft}
    onChange={(event) => {
      const input = event.target
      setDraft(input.value)
      sent.current.push(input.value)
      startTransition(() => { onValueChange(input.value); onCaretChange?.(input) })
    }}
    onSelect={(event) => { const input = event.currentTarget; startTransition(() => onCaretChange?.(input)) }}
  />
}
