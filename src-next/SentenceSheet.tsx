import { type CSSProperties, type ReactNode } from 'react'
import { Check, ClipboardPaste, Copy, Delete, Dices } from 'lucide-react'
import { SENTENCE_SHEET_EM_MAX, SENTENCE_SHEET_EM_MIN, type SentenceSheetState } from './sentenceSheetState'
import { SentenceTextarea } from './SentenceTextarea'
import { Pressable } from './components/ui/pressable'
// 펼친 문장 줄의 생김새는 편집기 것 하나를 편집기 · 대시보드가 같이 쓴다(09-29 사용자: 두 곳 동작이 같아야 한다). 상태는 `sentenceSheetState.ts`.
import styles from './CalibrationSentenceEditor.module.css'

/** 펼친 동안의 입력칸(안 보임) · 왼쪽 크기 막대 · 아래 버튼 바. */
export function SentenceSheetControls({ sheet }: { sheet: SentenceSheetState }) {
  if (!sheet.open) return null
  const empty = sheet.sentence.length === 0
  return <>
    <SentenceTextarea
      ref={sheet.inputRef}
      className={styles.sheetInput}
      value={sheet.sentence}
      onValueChange={sheet.onType}
      onCaretChange={sheet.syncCaret}
      aria-label="문장 입력"
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
    />
    {/* 글자 크기: 왼쪽 회색 세로 막대, 위로 올리면 커진다. */}
    <input type="range" className={styles.sheetSize} min={SENTENCE_SHEET_EM_MIN} max={SENTENCE_SHEET_EM_MAX} step={4} value={sheet.em}
      onChange={(event) => sheet.changeEm(Number(event.target.value))} onClick={(event) => event.stopPropagation()}
      aria-label="문장 글자 크기" aria-orientation="vertical" data-testid="sentence-sheet-size" />
    {/* 아래 버튼 바. 화면 아래에 떠 있고, 자판이 열리면 자판 위로 올라간다. 누를 때 입력칸 포커스를 뺏지 않아 자판이 닫히지 않는다. */}
    <div className={styles.sentenceSheetBar} style={{ '--keyboard-inset': `${sheet.keyboardInset}px` } as CSSProperties} onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.preventDefault()} onMouseDown={(event) => event.preventDefault()}>
      <Pressable type="button" onClick={sheet.roll} aria-label="예시 문장 바꾸기" data-testid="sentence-sheet-roll"><Dices size={18} aria-hidden="true" />다른 문장</Pressable>
      <Pressable type="button" onClick={sheet.clear} disabled={empty} aria-label="문장 전체 삭제" data-testid="sentence-sheet-clear"><Delete size={18} aria-hidden="true" />전체 삭제</Pressable>
      <Pressable type="button" className={styles.sentenceSheetIcon} onClick={sheet.copy} disabled={empty} aria-label={sheet.copied ? '복사함' : '문장 복사'} title="복사" data-testid="sentence-sheet-copy">{sheet.copied ? <Check size={18} aria-hidden="true" /> : <Copy size={18} aria-hidden="true" />}</Pressable>
      <Pressable type="button" className={styles.sentenceSheetIcon} onClick={sheet.paste} aria-label="붙여넣기" title="붙여넣기" data-testid="sentence-sheet-paste"><ClipboardPaste size={18} aria-hidden="true" /></Pressable>
    </div>
  </>
}

/**
 * 펼친 줄의 글자들. 글자를 누르면 그 자리에 커서, 빈 곳은 끝. `renderChar`는 `data-char-index`를 단 글자 하나를 그린다.
 * 단어와 뒤 공백을 한 덩어리로 묶어 줄이 바뀔 때 공백이 다음 줄 앞에 서지 않게 한다. 엔터(\n)는 줄을 끊는다.
 */
export function SentenceSheetRun({ sheet, renderChar }: { sheet: SentenceSheetState; renderChar: (char: string, index: number) => ReactNode }) {
  const chars = [...sheet.sentence]
  const caret = (key: string) => <span key={key} className={styles.directInputCaret} aria-hidden="true" data-testid="sentence-sheet-caret" />
  const withCaret = (char: string, index: number) => index === sheet.caret ? [caret(`caret-${index}`), renderChar(char, index)] : [renderChar(char, index)]
  return <>
    {chars.reduce<({ kind: 'word'; start: number; text: string } | { kind: 'break'; index: number })[]>((groups, char, index) => {
      const last = groups.at(-1)
      if (char === '\n') groups.push({ kind: 'break', index })
      else if (last?.kind === 'word' && (/\s/u.test(char) || !/\s$/u.test(last.text))) last.text += char
      else groups.push({ kind: 'word', start: index, text: char })
      return groups
    }, []).map((group, groupIndex, groups) => group.kind === 'break'
      // 빈 줄(엔터 두 번 · 맨 앞 엔터)도 한 줄 높이를 차지하게 폭 없는 버팀목을 세운다.
      ? [(groupIndex === 0 || groups[groupIndex - 1].kind === 'break') && <span key={`empty-${group.index}`} className={styles.emptyLine} aria-hidden="true" />, group.index === sheet.caret && caret(`caret-${group.index}`), <span key={`break-${group.index}`} className={styles.lineBreak} aria-hidden="true" />]
      : <span key={`word-${group.start}`} className={styles.wordRun}>{[...group.text].flatMap((char, index) => withCaret(char, group.start + index))}</span>)}
    {sheet.caret >= chars.length && caret('caret-end')}
    {chars.length === 0 && <span className={styles.sentenceSheetHint}>고칠 글자가 든 문장을 적어 보세요</span>}
  </>
}
