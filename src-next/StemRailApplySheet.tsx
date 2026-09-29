import { useState } from 'react'
import { Check, Lock, Minus } from 'lucide-react'
import { AppGlyph } from './AppGlyph'
import { corpusCodepoint } from './notoCorpus'
import { railCardKey, type StemRailGroup } from './stemRailSession'
import { ACTIVE_STROKE_COLOR, byLeafRank, keyOf, sampleSyllable, type ShapeAsk } from './stemShapeSession'
import { STEM_NAME_LABEL } from '../src/services/strokeGrammar'
import type { JamoData, ResolvedStrokeInkSource } from '../src/types'
import styles from './StemRailApplySheet.module.css'

/** 칸 카드에 그릴 글자: ㅇ + 홀자(받침 칸이면 + ㄴ). */
const sampleOf = (contextId: string, medial: string) => String.fromCodePoint(corpusCodepoint('ㅇ', medial, contextId.endsWith('-final') ? 'ㄴ' : null))

/** 모양 카드 하나 = 홀자 하나. 그 홀자에서 이 줄기에 귀속된 획을 다 묶는다(ㅑ의 곁줄기 둘이 한 카드). */
interface ShapeCard { char: string; keys: string[]; locked: boolean }

/** 갈래 순서(단일 · 섞임 먼저, 그 안에서 질문 보기 순서)로 홀자를 한 판에 늘어놓는다. 고친 획이 든 홀자는 잠긴다. */
function shapeCardsOf(ask: ShapeAsk): ShapeCard[] {
  const rank = byLeafRank(ask.base)
  const ordered = [...ask.entries].sort((a, b) => rank(a.name, b.name))
  const cards = new Map<string, ShapeCard>()
  for (const entry of ordered) {
    const card = cards.get(entry.char) ?? { char: entry.char, keys: [], locked: false }
    card.keys.push(keyOf(entry))
    card.locked ||= keyOf(entry) === ask.editedKey
    cards.set(entry.char, card)
  }
  return [...cards.values()]
}

/** `곁줄기가` · `기둥이` — 받침 있으면 이, 없으면 가. */
function withSubject(word: string): string {
  const code = word.charCodeAt(word.length - 1) - 0xac00
  return `${word}${code >= 0 && code % 28 > 0 ? '이' : '가'}`
}

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
  /**
   * 줄기 모양을 고쳤으면: 묻지 않고 규칙대로 다 퍼진 결과를 보여 주고, 예외만 끈다. 카드 = 홀자 하나(처음엔 전부 따름),
   * 툭 치면 그 홀자만 `따로`(지금 모양 그대로 · 풀림), 다시 치거나 알림의 `다시 따르기`로 붙는다. 카드는 반영하면 될 모양(`preview`)으로 그린다.
   */
  shape?: { ask: ShapeAsk; picked: ReadonlySet<string>; preview: Readonly<Record<string, JamoData>>; onToggle: (keys: readonly string[], on: boolean) => void }
  /** 닫기 = 고른 대로 반영하고 나가기. */
  onDone: () => void
  /** 취소 = 나가지 않고 획 편집으로 돌아가기. */
  onCancel: () => void
  /** 자리 버리기 = 이번에 옮긴 보선을 들어오기 전 자리로(모양은 그대로). 자리 칸이 있을 때만 보인다. */
  onDiscard: () => void
}) {
  const [apart, setApart] = useState<string | null>(null)
  const cards = shape ? shapeCardsOf(shape.ask) : []
  const apartCount = shape ? cards.filter((card) => !card.keys.some((key) => shape.picked.has(key))).length : 0
  const apartCard = shape && apart ? cards.find((card) => card.char === apart && !card.keys.some((key) => shape.picked.has(key))) : undefined
  const setCard = (card: ShapeCard, follow: boolean) => {
    if (!shape || card.locked) return
    shape.onToggle(card.keys, follow)
    setApart(follow ? null : card.char)
  }
  return (
    <div className={styles.modalLayer} onPointerDown={(event) => { if (event.target === event.currentTarget) onCancel() }} onKeyDown={(event) => { if (event.key === 'Escape') onCancel() }}>
      <section className={styles.applySheet} role="dialog" aria-modal="true" aria-label="보선 반영 범위" data-testid="stem-rail-apply" data-toast={apartCard ? true : undefined}>
        <header className={styles.applyHead}>
          {shape ? (
            <>
              <h2>{withSubject(STEM_NAME_LABEL[shape.ask.base])} {cards.length - apartCount}자에 퍼졌어요{apartCount > 0 && <span className={styles.applyApartCount} data-testid="stem-shape-apart-count"> · 따로 {apartCount}</span>}</h2>
              <p className={styles.applyHint}>마음에 안 드는 글자를 툭 치면 그 글자만 따로예요</p>
            </>
          ) : <h2>줄기 자리를 옮겼어요. 뺄 홀자가 있으면 눌러 주세요</h2>}
        </header>
        <div className={styles.applyScroll}>
          {shape && (
            <div className={styles.applyCards} data-testid="stem-shape-cards">
              {cards.map((card) => {
                const follows = card.keys.some((key) => shape.picked.has(key))
                const color = (source: ResolvedStrokeInkSource) => follows && source.jamoId === card.char && card.keys.includes(`${card.char}:${source.strokeId}`) ? ACTIVE_STROKE_COLOR : undefined
                return (
                  <button key={card.char} type="button" className={styles.applyCard} data-char={card.char} data-kind="shape" data-apart={follows ? undefined : true} data-locked={card.locked || undefined} aria-pressed={follows} aria-disabled={card.locked || undefined} aria-label={card.locked ? `${card.char} 고친 홀자(늘 따름)` : `${card.char} ${follows ? '따로 두기' : '다시 따르기'}`} onClick={() => setCard(card, !follows)}>
                    <AppGlyph char={sampleSyllable(card.char, 'open')} size={52} strokeColorOf={color} jungseongOverride={shape.preview} />
                    {card.locked && <Lock className={styles.applyLock} size={14} strokeWidth={2.5} aria-hidden="true" />}
                    {!follows && <span className={styles.applyApartTag}>{card.char} · <b>따로</b></span>}
                  </button>
                )
              })}
            </div>
          )}
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
        {apartCard && (
          <div className={styles.applyToast} role="status" data-testid="stem-shape-apart-toast">
            <span>{apartCard.char}는 따로 두었어요 · 지금 모양 그대로</span>
            <button type="button" onClick={() => setCard(apartCard, true)}>다시 따르기</button>
          </div>
        )}
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
