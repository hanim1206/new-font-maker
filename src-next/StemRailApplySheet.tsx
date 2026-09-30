import { ArrowRight, Lock } from 'lucide-react'
import { AppGlyph } from './AppGlyph'
import { ACTIVE_STROKE_COLOR, byLeafRank, keyOf, sampleSyllable, type ShapeAsk, type StemEntry } from './stemShapeSession'
import { baseOf, stemMasterLabel, type StemMasterName } from '../src/services/stemMaster'
import { STEM_NAME_LABEL } from '../src/services/strokeGrammar'
import type { JamoData, ResolvedStrokeInkSource } from '../src/types'
import styles from './StemRailApplySheet.module.css'

/** 모양 카드 하나 = 한 칸 안의 홀자 하나. 그 홀자에서 이 칸에 걸린 획을 다 묶는다(ㅛ의 짧은기둥 둘이 한 카드). */
interface ShapeCard { char: string; keys: string[]; locked: boolean }

/** 갈래 순서(단일 · 섞임 먼저, 그 안에서 질문 보기 순서)로 홀자를 늘어놓는다. 기준 획이 든 홀자는 잠긴다. */
function cardsOf(entries: readonly StemEntry[], leaf: StemMasterName, editedKey: string): ShapeCard[] {
  const rank = byLeafRank(baseOf(leaf))
  const cards = new Map<string, ShapeCard>()
  for (const entry of [...entries].sort((a, b) => rank(a.name, b.name))) {
    const card = cards.get(entry.char) ?? { char: entry.char, keys: [], locked: false }
    card.keys.push(keyOf(entry))
    card.locked ||= keyOf(entry) === editedKey
    cards.set(entry.char, card)
  }
  return [...cards.values()]
}

/** 고치기 전 모양에서 기준 획을 칠하는 색(주황 = 고친 뒤). */
const BEFORE_STROKE_COLOR = '#8b95a1'
/** 꺼진 다른 갈래 카드: 받을 획 · 나머지. */
const EXTRA_TARGET_COLOR = '#4e5968'
const EXTRA_REST_COLOR = '#d1d6db'

/**
 * 획 편집에서 줄기 모양(휨 · 기울기)을 고친 뒤 나갈 때 한 번 띄운다. 묻지 않고 규칙대로 퍼진 결과를 보여 주고, 예외만 끈다.
 * 칸 = 고친 갈래 하나, 머리에 기준 획의 전(`before`) → 후. 카드 = 홀자 하나. 같은 갈래는 처음부터 켜져 있고 툭 치면 꺼진다(지금 모양 그대로 · 풀림) — 도마 미선택처럼 흐려질 뿐 표식은 없다.
 * 같은 줄기의 다른 갈래는 `다른 ○○에도` 아래 꺼진 채 보이고, 켜면 그 칸의 모양을 받는다.
 * 카드는 반영하면 될 모양(`preview`)으로 그린다. 반영하고 나가는 길은 `완료` 하나, `취소` · 바깥 누르기 · Esc는 나가지 않고 획 편집으로 돌아간다.
 * 줄기 자리(보선)는 여기서 다루지 않는다 — 보선은 레이아웃 편집에서만 옮기고, 획 편집에서 옮긴 자리는 그 홀자에만 남는다.
 */
export function StemRailApplySheet({ ask, picked, preview, before, onToggle, onDone, onCancel }: {
  ask: ShapeAsk
  picked: ReadonlySet<string>
  preview: Readonly<Record<string, JamoData>>
  before: Readonly<Record<string, JamoData>>
  onToggle: (keys: readonly string[], on: boolean) => void
  /** 닫기 = 고른 대로 반영하고 나가기. */
  onDone: () => void
  /** 취소 = 나가지 않고 획 편집으로 돌아가기. */
  onCancel: () => void
}) {
  const shape = { ask, picked, preview, before, onToggle }
  const sections = shape.ask.sections.map((section) => ({ section, cards: cardsOf(section.entries, section.leaf, section.editedKey), extras: cardsOf(section.extras, section.leaf, '') }))
  const on = (card: ShapeCard) => card.keys.some((key) => shape.picked.has(key))
  const setCard = (card: ShapeCard, follow: boolean) => {
    if (card.locked) return
    shape.onToggle(card.keys, follow)
  }
  return (
    <div className={styles.modalLayer} onPointerDown={(event) => { if (event.target === event.currentTarget) onCancel() }} onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); onCancel() } }}>
      <section className={styles.applySheet} role="dialog" aria-modal="true" aria-label="보선 반영 범위" data-testid="stem-rail-apply">
        <header className={styles.applyHead}>
          <h2>고친 획이 퍼졌어요</h2>
          <p className={styles.applyHint}>마음에 안 드는 글자를 툭 치면 그 글자는 빠져요</p>
        </header>
        <div className={styles.applyScroll}>
          {sections.map(({ section, cards, extras }) => {
            const [editedChar, editedStroke] = section.editedKey.split(':')
            const mark = (color: string) => (source: ResolvedStrokeInkSource) => source.jamoId === editedChar && source.strokeId === editedStroke ? color : undefined
            const onCount = cards.filter(on).length
            return (
              <div key={section.leaf} className={styles.shapeSection} data-leaf={section.leaf} data-testid="stem-shape-section">
                <div className={styles.shapeHead}>
                  <div className={styles.shapeDiff} aria-label={`${editedChar} 고치기 전과 뒤`}>
                    <span data-diff="before"><AppGlyph char={sampleSyllable(editedChar, 'open')} size={44} strokeColorOf={mark(BEFORE_STROKE_COLOR)} jungseongOverride={shape.before[editedChar] ? { [editedChar]: shape.before[editedChar] } : undefined} /></span>
                    <ArrowRight size={16} strokeWidth={2.5} aria-hidden="true" />
                    <span data-diff="after"><AppGlyph char={sampleSyllable(editedChar, 'open')} size={44} strokeColorOf={mark(ACTIVE_STROKE_COLOR)} /></span>
                  </div>
                  <div className={styles.shapeTitle}>
                    <h3>{stemMasterLabel(section.leaf)}</h3>
                    <p data-testid="stem-shape-count">{onCount}자에 퍼졌어요</p>
                  </div>
                </div>
                <div className={styles.applyCards}>
                  {cards.map((card) => {
                    const follows = on(card)
                    const color = (source: ResolvedStrokeInkSource) => follows && source.jamoId === card.char && card.keys.includes(`${card.char}:${source.strokeId}`) ? ACTIVE_STROKE_COLOR : undefined
                    return (
                      <button key={card.char} type="button" className={styles.applyCard} data-char={card.char} data-kind="shape" data-locked={card.locked || undefined} aria-pressed={follows} aria-disabled={card.locked || undefined} aria-label={card.locked ? `${card.char} 고친 홀자(늘 반영)` : `${card.char} ${follows ? '빼기' : '담기'}`} onClick={() => setCard(card, !follows)}>
                        <AppGlyph char={sampleSyllable(card.char, 'open')} size={52} strokeColorOf={color} jungseongOverride={shape.preview} />
                        {card.locked && <Lock className={styles.applyLock} size={14} strokeWidth={2.5} aria-hidden="true" />}
                      </button>
                    )
                  })}
                </div>
                {extras.length > 0 && (
                  <>
                    <h4 className={styles.shapeExtraHead}>다른 {STEM_NAME_LABEL[baseOf(section.leaf)]}에도</h4>
                    <div className={styles.applyCards}>
                      {extras.map((card) => {
                        const pressed = on(card)
                        // 꺼진 카드도 받을 획은 진하게, 나머지는 옅게 — 켜면 어느 획이 바뀌는지 미리 보인다.
                        const color = (source: ResolvedStrokeInkSource) => {
                          const target = source.jamoId === card.char && card.keys.includes(`${card.char}:${source.strokeId}`)
                          if (pressed) return target ? ACTIVE_STROKE_COLOR : undefined
                          return target ? EXTRA_TARGET_COLOR : EXTRA_REST_COLOR
                        }
                        return (
                          <button key={card.char} type="button" className={styles.applyCard} data-char={card.char} data-kind="shape" data-extra aria-pressed={pressed} aria-label={`${card.char} ${pressed ? '빼기' : '이 모양 받기'}`} onClick={() => setCard(card, !pressed)}>
                            <AppGlyph char={sampleSyllable(card.char, 'open')} size={52} strokeColorOf={color} jungseongOverride={shape.preview} />
                          </button>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
        <footer className={styles.applyFoot}>
          <span className={styles.applySpacer} />
          <button type="button" className={styles.applyCancel} data-testid="stem-rail-apply-cancel" onClick={onCancel}>취소</button>
          <button type="button" className={styles.applyGo} data-testid="stem-rail-apply-go" onClick={onDone} autoFocus>완료</button>
        </footer>
      </section>
    </div>
  )
}
