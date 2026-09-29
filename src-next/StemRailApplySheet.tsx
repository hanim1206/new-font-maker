import { Check, Lock, Minus } from 'lucide-react'
import { AppGlyph } from './AppGlyph'
import { corpusCodepoint } from './notoCorpus'
import { railCardKey, type StemRailGroup } from './stemRailSession'
import { ACTIVE_STROKE_COLOR, byLeafRank, keyOf, sampleSyllable, type ShapeAsk } from './stemShapeSession'
import { stemMasterLabel } from '../src/services/stemMaster'
import { STEM_NAME_LABEL } from '../src/services/strokeGrammar'
import type { JamoData, ResolvedStrokeInkSource } from '../src/types'
import styles from './StemRailApplySheet.module.css'

/** 칸 카드에 그릴 글자: ㅇ + 홀자(받침 칸이면 + ㄴ). */
const sampleOf = (contextId: string, medial: string) => String.fromCodePoint(corpusCodepoint('ㅇ', medial, contextId.endsWith('-final') ? 'ㄴ' : null))

/**
 * 획 편집에서 줄기 끝을 끌어 보선을 옮긴 뒤 나갈 때 한 번 띄운다. 보선은 끄는 순간 이미 이 레이아웃 전체에 저장돼 있어서,
 * 이 창은 좁히는 창이다 — 반영하고 나가는 길은 `완료` 하나다(고친 카드만 남아도 `완료`). `취소` · 바깥 누르기 · Esc는 나가지 않고 획 편집으로 돌아간다(다음에 나갈 때 다시 묻는다).
 * 묶음 = 레이아웃 칸(머리 체크 = 칸 전체), 카드 = 그 칸에서 같은 역할을 가진 홀자. 처음엔 전부 골라져 있고, 고친 홀자는 뺄 수 없다.
 * 카드는 지금(이미 옮긴) 모양이고, 뺀 카드는 흐려진다. 뺀 홀자만 `이 자모만` 층의 반대 Δ로 제자리에 남는다.
 */
export function StemRailApplySheet({ groups, picked, onToggle, shape, onDone, onCancel, onDiscard }: {
  groups: readonly StemRailGroup[]
  picked: ReadonlySet<string>
  onToggle: (keys: readonly string[], on: boolean) => void
  /** 줄기 모양을 고쳤으면: 갈래 묶음(카드 = 획) — 줄기 마스터 랩과 같은 고르기. 카드는 반영하면 될 모양(`preview`)으로 그린다. */
  shape?: { ask: ShapeAsk; picked: ReadonlySet<string>; preview: Readonly<Record<string, JamoData>>; onToggle: (keys: readonly string[], on: boolean) => void }
  /** 닫기 = 고른 대로 반영하고 나가기. */
  onDone: () => void
  /** 취소 = 나가지 않고 획 편집으로 돌아가기. */
  onCancel: () => void
  /** 자리 버리기 = 이번에 옮긴 보선을 들어오기 전 자리로(모양은 그대로). 자리 칸이 있을 때만 보인다. */
  onDiscard: () => void
}) {
  const leaves = shape ? [...new Set(shape.ask.entries.map((entry) => entry.name))].sort(byLeafRank(shape.ask.base)) : []
  return (
    <div className={styles.modalLayer} onPointerDown={(event) => { if (event.target === event.currentTarget) onCancel() }} onKeyDown={(event) => { if (event.key === 'Escape') onCancel() }}>
      <section className={styles.applySheet} role="dialog" aria-modal="true" aria-label="보선 반영 범위" data-testid="stem-rail-apply">
        <header className={styles.applyHead}>
          <h2>{shape ? `${STEM_NAME_LABEL[shape.ask.base]}을 고쳤어요. 어디까지 반영할까요?` : '줄기 자리를 옮겼어요. 뺄 홀자가 있으면 눌러 주세요'}</h2>
        </header>
        <div className={styles.applyScroll}>
          {shape && leaves.map((leaf) => {
            const inLeaf = shape.ask.entries.filter((entry) => entry.name === leaf)
            const keys = inLeaf.map(keyOf)
            const on = keys.filter((key) => shape.picked.has(key)).length
            const state = on === keys.length ? 'true' : on === 0 || (on === 1 && keys.includes(shape.ask.editedKey)) ? 'false' : 'mixed'
            return (
              <div key={leaf} className={styles.applyGroup} data-role={leaf} data-testid="stem-shape-group">
                <button type="button" role="checkbox" className={styles.applyGroupHead} aria-checked={state} onClick={() => shape.onToggle(keys, state !== 'true')}>
                  <span className={styles.applyCheck} aria-hidden="true">{state === 'mixed' ? <Minus size={14} strokeWidth={3} /> : <Check size={14} strokeWidth={3} />}</span>
                  {stemMasterLabel(leaf).split(' · ').slice(1).join(' · ') || STEM_NAME_LABEL[shape.ask.base]}
                  <span className={styles.applyCount}>{keys.length}</span>
                </button>
                <div className={styles.applyCards}>
                  {inLeaf.map((entry) => {
                    const key = keyOf(entry)
                    const pressed = shape.picked.has(key)
                    const locked = shape.ask.editedKey === key
                    const color = (source: ResolvedStrokeInkSource) => source.jamoId === entry.char && source.strokeId === entry.strokeId ? ACTIVE_STROKE_COLOR : undefined
                    return (
                      <button key={key} type="button" className={styles.applyCard} data-char={entry.char} data-kind="shape" data-locked={locked || undefined} aria-pressed={pressed} aria-disabled={locked || undefined} aria-label={locked ? `${entry.char} ${stemMasterLabel(leaf)} 고친 획(늘 반영)` : `${entry.char} ${stemMasterLabel(leaf)} ${pressed ? '빼기' : '담기'}`} onClick={() => { if (!locked) shape.onToggle([key], !pressed) }}>
                        <AppGlyph char={sampleSyllable(entry.char, 'open')} size={52} strokeColorOf={color} jungseongOverride={shape.preview} />
                        {locked && <Lock className={styles.applyLock} size={14} strokeWidth={2.5} aria-hidden="true" />}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
          {shape && groups.length > 0 && <h3 className={styles.applySection}>자리(보선)</h3>}
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
                      <button key={key} type="button" className={styles.applyCard} data-char={medial} data-kind="rail" data-locked={locked || undefined} aria-pressed={pressed} aria-disabled={locked || undefined} aria-label={locked ? `${medial} 고친 홀자(늘 반영)` : `${medial} ${pressed ? '빼기' : '담기'}`} onClick={() => { if (!locked) onToggle([key], !pressed) }}>
                        <AppGlyph char={sampleOf(group.contextId, medial)} size={52} />
                        {locked && <Lock className={styles.applyLock} size={14} strokeWidth={2.5} aria-hidden="true" />}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
        <footer className={styles.applyFoot}>
          {groups.length > 0 && <button type="button" className={styles.applyDiscard} data-testid="stem-rail-apply-discard" onClick={onDiscard}>자리 버리기</button>}
          <span className={styles.applySpacer} />
          <button type="button" className={styles.applyCancel} data-testid="stem-rail-apply-cancel" onClick={onCancel}>취소</button>
          <button type="button" className={styles.applyGo} data-testid="stem-rail-apply-go" onClick={onDone} autoFocus>완료</button>
        </footer>
      </section>
    </div>
  )
}
