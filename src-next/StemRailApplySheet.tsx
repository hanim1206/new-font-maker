import { Check, Lock, Minus } from 'lucide-react'
import { AppGlyph } from './AppGlyph'
import { corpusCodepoint } from './notoCorpus'
import { railCardKey, type StemRailGroup } from './stemRailSession'
import styles from './StemRailApplySheet.module.css'

/** 칸 카드에 그릴 글자: ㅇ + 홀자(받침 칸이면 + ㄴ). */
const sampleOf = (contextId: string, medial: string) => String.fromCodePoint(corpusCodepoint('ㅇ', medial, contextId.endsWith('-final') ? 'ㄴ' : null))

/**
 * 획 편집에서 줄기 끝을 끌어 보선을 옮긴 뒤 나갈 때 한 번 묻는다. "어디까지 반영할까요?"
 * 묶음 = 레이아웃 칸(머리 체크 = 칸 전체), 카드 = 그 칸에서 같은 역할을 가진 홀자. 처음엔 전부 골라져 있고, 고친 홀자는 뺄 수 없다.
 * 카드는 지금(이미 옮긴) 모양이고, 뺀 카드는 흐려진다. 반영하면 뺀 홀자만 `이 자모만` 층의 반대 Δ로 제자리에 남는다.
 */
export function StemRailApplySheet({ groups, picked, onToggle, onApply, onCancel }: {
  groups: readonly StemRailGroup[]
  picked: ReadonlySet<string>
  onToggle: (keys: readonly string[], on: boolean) => void
  onApply: () => void
  onCancel: () => void
}) {
  const chars = [...new Set(groups.flatMap((group) => group.medials.filter((medial) => picked.has(railCardKey(group.contextId, medial)))))]
  return (
    <div className={styles.modalLayer} onPointerDown={(event) => { if (event.target === event.currentTarget) onCancel() }} onKeyDown={(event) => { if (event.key === 'Escape') onCancel() }}>
      <section className={styles.applySheet} role="dialog" aria-modal="true" aria-label="보선 반영 범위" data-testid="stem-rail-apply">
        <header className={styles.applyHead}>
          <h2>줄기 자리를 옮겼어요. 어디까지 반영할까요?</h2>
        </header>
        <div className={styles.applyScroll}>
          {groups.map((group) => {
            const keys = group.medials.filter((medial) => !group.edited.includes(medial)).map((medial) => railCardKey(group.contextId, medial))
            const on = group.medials.filter((medial) => picked.has(railCardKey(group.contextId, medial))).length
            const state = on === group.medials.length ? 'true' : on === group.edited.length ? 'false' : 'mixed'
            return (
              <div key={group.contextId} className={styles.applyGroup} data-context={group.contextId}>
                <button type="button" role="checkbox" className={styles.applyGroupHead} aria-checked={state} onClick={() => onToggle(keys, state !== 'true')}>
                  <span className={styles.applyCheck} aria-hidden="true">{state === 'mixed' ? <Minus size={14} strokeWidth={3} /> : <Check size={14} strokeWidth={3} />}</span>
                  {group.label}
                  <span className={styles.applyCount}>{group.medials.length}</span>
                </button>
                <div className={styles.applyCards}>
                  {group.medials.map((medial) => {
                    const key = railCardKey(group.contextId, medial)
                    const pressed = picked.has(key)
                    const locked = group.edited.includes(medial)
                    return (
                      <button key={key} type="button" className={styles.applyCard} data-char={medial} data-locked={locked || undefined} aria-pressed={pressed} aria-disabled={locked || undefined} aria-label={locked ? `${medial} 고친 홀자(늘 반영)` : `${medial} ${pressed ? '빼기' : '담기'}`} onClick={() => { if (!locked) onToggle([key], !pressed) }}>
                        <AppGlyph char={sampleOf(group.contextId, medial)} size={52} />
                        {locked && <em><Lock size={10} strokeWidth={3} aria-hidden="true" />고친 홀자</em>}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
        <footer className={styles.applyFoot}>
          <p aria-label="반영되는 홀자">{chars.join(' ')}</p>
          <button type="button" className={styles.applyCancel} onClick={onCancel}>취소</button>
          <button type="button" className={styles.applyGo} data-testid="stem-rail-apply-go" onClick={onApply} autoFocus><span data-testid="stem-rail-apply-count">{chars.length}</span>개 홀자에 반영</button>
        </footer>
      </section>
    </div>
  )
}
