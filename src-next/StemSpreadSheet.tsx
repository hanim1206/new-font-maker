import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, Check, Lock } from 'lucide-react'
import { AppGlyph } from './AppGlyph'
import { ACTIVE_STROKE_COLOR, askEntries, keyOf, lockedKeys, sampleSyllable, slotFacetOf, slotOf, type ShapeAsk, type StemEntry } from './stemShapeSession'
import { baseOf, STEM_FACETS, type StemBase } from '../src/services/stemMaster'
import { STEM_NAME_LABEL } from '../src/services/strokeGrammar'
import type { JamoData, ResolvedStrokeInkSource } from '../src/types'
import styles from './StemSpreadSheet.module.css'

/**
 * 줄기 모양 전파 창. 획 편집에서 획을 잡고 `전파`를 누르면 그 획 하나를 기준으로 뜬다 — 도마 섹션 홈과 같은 판.
 * 카드 = 홀자 하나(기둥이면 16장), 카드 안 자리 = 같은 홀자 안에서 갈리는 줄기(바깥 · 안). 카드는 절대 배치 + transform이라 묶기를 바꾸면 제자리로 미끄러진다.
 * 탭 = 묶는 축(`전체` + 줄기 질문 + 줄기 수). 묶음 머리 `○○ 모두` 체크 = 카드 전체 선택 · 해제(자리와 무관), 머리 옆 자리 토글 = 묶음의 그 자리 열 전부(언제나 누를 수 있다)(꺼진 카드는 안 켠다).
 * 카드 탭 = 낱개 — 자리가 둘이면 첫 자리 → 둘 다 → 끔, 우상단 점 둘이 어느 자리가 켜졌는지 보인다. 카드 잉크는 검정(주황은 머리의 기준 획만). 기준 획의 홀자는 잠긴다. 뺀 획은 지금 모양 그대로(풀림).
 * `취소` · 바깥 누르기 · Esc는 창만 닫고 획 편집에 남는다. `n자 받기`가 반영.
 */

const COLUMNS = 4
const GAP = 6
const PAD = 8
const GROUP_HEAD = 44
const GROUP_GAP = 24
/** 켜진 획이 주황으로 머무는 시간. 그 뒤 CSS `fill` 전환으로 검정에 돌아온다. */
const FLASH_MS = 180

/** 고치기 전 모양에서 기준 획을 칠하는 색(주황 = 고친 뒤). */
const BEFORE_STROKE_COLOR = '#8b95a1'

interface Card { char: string; entries: StemEntry[]; slots: string[]; locked: boolean }
interface Axis { id: string; label: string; groups: { id: string; label: string; cards: Card[] }[] }

/** 질문 답의 사람 말. 단일 · 섞임은 홀자 종류로 읽히게 `단일 홀자` · `섞임홀자`. */
function optionLabel(base: StemBase, facetKey: string, value: string): string {
  const option = STEM_FACETS[base].find((facet) => facet.key === facetKey)?.options.find((item) => item.value === value)
  if (facetKey === 'kind') return value === 'single' ? '단일 홀자' : value === 'mixed' ? '섞임홀자' : option?.label ?? value
  return option?.label ?? value
}

/** 카드(홀자)마다 자리 순서: 질문 보기 순서. 자리 질문이 없으면 `''` 하나. */
function slotsOf(entries: readonly StemEntry[], base: StemBase, slotFacet: string | null): string[] {
  if (!slotFacet) return ['']
  const order = STEM_FACETS[base].find((facet) => facet.key === slotFacet)?.options.map((option) => option.value) ?? []
  return [...new Set(entries.map((entry) => entry.values[slotFacet] ?? ''))].sort((a, b) => order.indexOf(a) - order.indexOf(b))
}

/**
 * 묶는 축. `전체` 하나, 자리가 아닌 질문마다 하나(답이 둘 이상 나올 때만), 카드마다 자리 수가 다르면 `줄기 수`.
 * 묶음 순서는 질문 보기 순서, 답이 없는 카드는 그 축에서 숨는다(`전체`에서 다 보인다).
 */
function axesOf(cards: readonly Card[], base: StemBase, slotFacet: string | null): Axis[] {
  const label = STEM_NAME_LABEL[base]
  const axes: Axis[] = [{ id: 'all', label: '전체', groups: [{ id: 'all', label: `${label} 전체`, cards: [...cards] }] }]
  for (const facet of STEM_FACETS[base]) {
    if (facet.key === slotFacet) continue
    const groups = facet.options
      .map((option) => ({ id: `${facet.key}:${option.value}`, label: `${optionLabel(base, facet.key, option.value)} 모두`, cards: cards.filter((card) => card.entries.some((entry) => entry.values[facet.key] === option.value)) }))
      .filter((group) => group.cards.length > 0)
    if (groups.length > 1) axes.push({ id: facet.key, label: facet.key === 'kind' ? '단일 · 섞임' : facet.question.replace(/\?$/, ''), groups })
  }
  const counts = [...new Set(cards.map((card) => card.slots.length))].sort((a, b) => a - b)
  if (counts.length > 1) {
    axes.push({ id: 'count', label: `${label} 수`, groups: counts.map((count) => ({ id: `count:${count}`, label: `${label} ${count === 1 ? '하나' : count === 2 ? '둘' : count} 모두`, cards: cards.filter((card) => card.slots.length === count) })) })
  }
  return axes
}

export function StemSpreadSheet({ ask, picked, preview, before, onToggle, onDone, onCancel }: {
  ask: ShapeAsk
  picked: ReadonlySet<string>
  preview: Readonly<Record<string, JamoData>>
  before: Readonly<Record<string, JamoData>>
  onToggle: (keys: readonly string[], on: boolean) => void
  /** `n자 받기` = 고른 대로 반영하고 창을 닫는다. 획 편집에 남는다. */
  onDone: () => void
  /** 취소 · 바깥 · Esc = 창만 닫는다. */
  onCancel: () => void
}) {
  const section = ask.sections[0]
  const base = baseOf(section.leaf)
  const [editedChar, editedStroke] = section.editedKey.split(':')
  const locked = useMemo(() => lockedKeys(ask), [ask])
  const entries = useMemo(() => askEntries(ask), [ask])
  const slotFacet = useMemo(() => slotFacetOf(entries), [entries])
  const cards = useMemo((): Card[] => {
    const byChar = new Map<string, StemEntry[]>()
    for (const entry of entries) byChar.set(entry.char, [...(byChar.get(entry.char) ?? []), entry])
    return [...byChar.entries()].map(([char, own]) => ({ char, entries: own, slots: slotsOf(own, base, slotFacet), locked: own.some((entry) => locked.has(keyOf(entry))) }))
  }, [entries, base, slotFacet, locked])
  const axes = useMemo(() => axesOf(cards, base, slotFacet), [cards, base, slotFacet])
  const [axisId, setAxisId] = useState('all')
  const axis = axes.find((item) => item.id === axisId) ?? axes[0]
  const slotLabels = useMemo(() => slotFacet ? (STEM_FACETS[base].find((facet) => facet.key === slotFacet)?.options ?? []) : [], [base, slotFacet])

  // 켜지는 순간의 획은 주황으로 번쩍였다가 검정으로 돌아온다(`fill` 전환은 CSS). 열 때 이미 켜진 획은 안 번쩍인다.
  const [flash, setFlash] = useState<ReadonlySet<string>>(() => new Set())
  const flashTimer = useRef<number | null>(null)
  useEffect(() => () => { if (flashTimer.current !== null) window.clearTimeout(flashTimer.current) }, [])
  const toggle = (keys: readonly string[], on: boolean) => {
    onToggle(keys, on)
    if (!on) return
    setFlash((current) => new Set([...current, ...keys]))
    if (flashTimer.current !== null) window.clearTimeout(flashTimer.current)
    flashTimer.current = window.setTimeout(() => { flashTimer.current = null; setFlash(new Set()) }, FLASH_MS)
  }
  const isOn = (entry: StemEntry) => picked.has(keyOf(entry))
  const cardOn = (card: Card) => card.entries.some(isOn)
  const slotEntries = (card: Card, slot: string) => card.entries.filter((entry) => slotOf(entry, slotFacet) === slot)
  const slotOn = (card: Card, slot: string) => slotEntries(card, slot).some(isOn)
  // 카드 탭: 자리 하나면 켬 · 끔, 여럿이면 첫 자리 → 다음 자리도 → … → 끔.
  const tapCard = (card: Card) => {
    if (card.locked) return
    const on = card.slots.filter((slot) => slotOn(card, slot))
    if (on.length === card.slots.length) toggle(card.entries.map(keyOf), false)
    else {
      const next = card.slots.find((slot) => !slotOn(card, slot))!
      toggle(slotEntries(card, next).map(keyOf), true)
    }
  }
  // 묶음 머리 체크 = 카드 단위 전체 선택 · 해제(자리와 무관). 켤 때 자리는 지금 켜진 카드들이 쓰는 자리를 따르고, 켜진 카드가 없으면 기준 획의 자리.
  const editedSlot = (() => { const edited = entries.find((entry) => keyOf(entry) === section.editedKey); return edited ? slotOf(edited, slotFacet) : '' })()
  const toggleGroup = (cards: readonly Card[]) => {
    const off = cards.filter((card) => !cardOn(card))
    if (off.length === 0) { toggle(cards.flatMap((card) => card.entries.map(keyOf)), false); return }
    const onCards = cards.filter(cardOn)
    const slots = new Set(onCards.flatMap((card) => card.slots.filter((slot) => slotOn(card, slot))))
    if (slots.size === 0) slots.add(editedSlot)
    toggle(off.flatMap((card) => card.slots.filter((slot) => slots.has(slot)).flatMap((slot) => slotEntries(card, slot).map(keyOf))), true)
  }
  // 자리 토글 = 묶음의 그 자리 열 전부. 꺼진 카드도 그 자리로 켜진다. 다 켜져 있으면 끈다 — `안`을 끄면 바깥만 남고, 둘 다 끄면 카드가 꺼진다.
  const slotKeys = (cards: readonly Card[], slot: string) => cards.flatMap((card) => slotEntries(card, slot).map(keyOf))
  const toggleSlot = (cards: readonly Card[], slot: string) => {
    const keys = slotKeys(cards, slot)
    if (keys.length === 0) return
    toggle(keys, !keys.every((key) => picked.has(key)))
  }
  // 묶음 머리의 수 · 체크는 잠긴 카드(이 자소, 늘 켜짐)를 빼고 센다 — 형제 몇 자에 가는지만.
  const others = (cards: readonly Card[]) => cards.filter((card) => !card.locked)
  const stateOf = (cards: readonly Card[]) => {
    const rest = others(cards)
    const on = rest.filter(cardOn).length
    return on === rest.length ? 'true' : on === 0 ? 'false' : 'mixed'
  }
  // 이미 따로 고친(풀린) 형제 — 켜 두면 이 모양으로 덮인다. 기본은 켜짐, 사용자가 직접 뺀다.
  const released = (card: Card) => card.entries.some((entry) => !entry.follows)

  // 판 폭을 재서 칸 크기를 정한다. 카드 · 소제목은 절대좌표 + transform — 묶기를 바꾸면 미끄러진다(도마 섹션 홈과 같음).
  const board = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const element = board.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(element)
    setWidth(element.clientWidth)
    return () => observer.disconnect()
  }, [])
  const cell = width > 0 ? (width - PAD * 2 - GAP * (COLUMNS - 1)) / COLUMNS : 0
  const layout = useMemo(() => {
    const at = new Map<string, { x: number; y: number }>()
    const heads: { id: string; label: string; cards: Card[]; y: number }[] = []
    let y = 0
    for (const group of axis.groups) {
      heads.push({ ...group, y })
      y += GROUP_HEAD
      group.cards.forEach((card, index) => at.set(card.char, { x: PAD + (index % COLUMNS) * (cell + GAP), y: y + Math.floor(index / COLUMNS) * (cell + GAP) }))
      y += Math.ceil(group.cards.length / COLUMNS) * (cell + GAP) - GAP + GROUP_GAP
    }
    return { at, heads, height: Math.max(0, y - GROUP_GAP) }
  }, [axis, cell])
  // 숨는 카드는 마지막 자리에서 흐려진다.
  const lastAt = useRef(new Map<string, { x: number; y: number }>())
  useLayoutEffect(() => { for (const [char, spot] of layout.at) lastAt.current.set(char, spot) }, [layout])

  const flashColor = (char: string) => (source: ResolvedStrokeInkSource) => source.jamoId === char && flash.has(`${char}:${source.strokeId}`) ? ACTIVE_STROKE_COLOR : undefined
  const total = new Set(entries.filter(isOn).map((entry) => entry.char)).size
  const mark = (color: string) => (source: ResolvedStrokeInkSource) => source.jamoId === editedChar && source.strokeId === editedStroke ? color : undefined
  return (
    <div className={styles.modalLayer} onPointerDown={(event) => { if (event.target === event.currentTarget) onCancel() }} onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); onCancel() } }}>
      <section className={styles.sheet} role="dialog" aria-modal="true" aria-label="줄기 모양 전파" data-testid="stem-rail-apply">
        <header className={styles.head}>
          <div className={styles.diff} aria-label={`${editedChar} 고치기 전과 뒤`}>
            <span data-diff="before"><AppGlyph char={sampleSyllable(editedChar, 'open')} size={44} strokeColorOf={mark(BEFORE_STROKE_COLOR)} jungseongOverride={before[editedChar] ? { [editedChar]: before[editedChar] } : undefined} /></span>
            <ArrowRight size={16} strokeWidth={2.5} aria-hidden="true" />
            <span data-diff="after"><AppGlyph char={sampleSyllable(editedChar, 'open')} size={44} strokeColorOf={mark(ACTIVE_STROKE_COLOR)} /></span>
          </div>
          <div className={styles.title}>
            <h2>{STEM_NAME_LABEL[base]} 모양을 퍼뜨릴까요?</h2>
            <p>{STEM_NAME_LABEL[base]} 모양을 퍼뜨릴 범위를 선택해주세요</p>
          </div>
        </header>
        <div className={styles.tabs} role="tablist" aria-label="묶기">
          {axes.map((item) => <button key={item.id} type="button" role="tab" aria-selected={item.id === axis.id} onClick={() => setAxisId(item.id)}>{item.label}</button>)}
        </div>
        <div className={styles.scroll}>
          <div ref={board} className={styles.board} style={{ height: layout.height }}>
            {cell > 0 && layout.heads.map((group) => {
              const state = stateOf(group.cards)
              return (
                <div key={group.id} className={styles.groupRow} style={{ transform: `translateY(${group.y}px)` }} data-testid="stem-spread-group" data-group={group.id}>
                  <button type="button" className={styles.groupHead} role="checkbox" aria-checked={state} onClick={() => toggleGroup(group.cards)}>
                    <span className={styles.check} aria-hidden="true">{state === 'mixed' ? <span className={styles.dash} /> : <Check size={14} strokeWidth={3} />}</span>
                    {group.label}<span className={styles.groupCount}>{others(group.cards).filter(cardOn).length}/{others(group.cards).length}</span>
                  </button>
                  {/* 자리 토글 — 묶음 전체의 그 자리 열. 꺼진 카드도 켠다. 자리가 없는 줄기(걸침 · 보)엔 안 뜬다. */}
                  {slotLabels.length > 0 && <span className={styles.slots}>
                    {slotLabels.filter((option) => group.cards.some((card) => card.slots.includes(option.value))).map((option) => {
                      const keys = slotKeys(group.cards, option.value)
                      return <button key={option.value} type="button" className={styles.slot} aria-pressed={keys.length > 0 && keys.every((key) => picked.has(key))} onClick={() => toggleSlot(group.cards, option.value)}>{option.label}</button>
                    })}
                  </span>}
                </div>
              )
            })}
            {cell > 0 && cards.map((card) => {
              const shown = layout.at.has(card.char)
              const spot = layout.at.get(card.char) ?? lastAt.current.get(card.char)
              const on = cardOn(card)
              const onSlots = card.slots.filter((slot) => slotOn(card, slot))
              return (
                <button key={card.char} type="button" className={styles.card} style={{ width: cell, height: cell, transform: spot ? `translate(${spot.x}px, ${spot.y}px)` : undefined }} data-char={card.char} data-kind="shape" data-hidden={shown ? undefined : true} aria-hidden={shown ? undefined : true} tabIndex={shown ? undefined : -1} data-locked={card.locked || undefined} data-slots={onSlots.join(' ') || undefined} aria-pressed={on} aria-disabled={card.locked || undefined} aria-label={card.locked ? `${card.char} 고친 홀자(늘 반영)` : `${card.char} ${on ? (onSlots.length === card.slots.length ? '빼기' : '다음 자리도') : '담기'}`} onClick={() => tapCard(card)}>
                  {/* 카드 잉크는 검정(주황은 머리의 기준 획만). 방금 켜진 획만 주황으로 번쩍였다가 돌아온다. 어느 자리가 켜졌는지는 우상단 점이 말한다. */}
                  <AppGlyph char={sampleSyllable(card.char, 'open')} size={Math.round(cell * 0.62)} strokeColorOf={flashColor(card.char)} jungseongOverride={preview} />
                  {card.locked && <Lock className={styles.lock} size={14} strokeWidth={2.5} aria-hidden="true" />}
                  {!card.locked && released(card) && <span className={styles.released} data-testid="stem-spread-released">따로 고침</span>}
                  {/* 자리가 둘 이상인 카드는 우상단에 자리마다 점 하나 — 켜진 자리만 주황. 기둥은 글자 자리대로 안 점이 왼쪽, 바깥 점이 오른쪽. */}
                  {card.slots.length > 1 && <span className={styles.dots} aria-hidden="true">{(slotFacet === 'side' ? [...card.slots].reverse() : card.slots).map((slot) => <i key={slot} data-on={slotOn(card, slot) || undefined} />)}</span>}
                </button>
              )
            })}
          </div>
        </div>
        <footer className={styles.foot}>
          <button type="button" className={styles.cancel} data-testid="stem-rail-apply-cancel" onClick={onCancel}>취소</button>
          <button type="button" className={styles.go} data-testid="stem-rail-apply-go" onClick={onDone} autoFocus><span data-testid="stem-spread-count">{total}</span>자 받기</button>
        </footer>
      </section>
    </div>
  )
}
