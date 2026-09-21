import { useEffect, useMemo, useRef } from 'react'
import { jamoKeyOf, useLayoutDeltaStore } from './layoutDeltaStore'
import type { LayoutDeltaTarget } from './layoutDeltaStore'
import { deltaSummary, overrideCardsOf, partOfGroup, scopeChipsOf } from './layoutOverrides'
import type { OverrideGroup, ScopeChip } from './layoutOverrides'
import type { CorpusIdentity } from './notoCorpus'
import { PART_COLOR } from './partColors'
import { overrideGlyphCount, PART_GROUP_LABEL } from './reviewPropagation'
import styles from './LayoutScopeStrip.module.css'

/**
 * 범위 띠. 적용 범위 고르기와 쌓인 오버라이드 보기를 한 줄에 합친 것. 계산은 `layoutOverrides.ts`.
 * 앞의 둘(`이 레이아웃` · `이 자모만`)은 늘 있고, 그 뒤에 자모 칩(저장된 것 + 지금 고른 것)이 붙는다.
 * 저장된 Δ가 있는 칩은 부품 색으로 차고 글자 수 · Δ 요약 · ×가 붙는다. ×는 그 층만 지운다. 다른 레이아웃 것은 안 보인다(`전체`는 어디서나).
 * `전체`는 고를 수 없다 — 옛 저장분이 있을 때만 읽기 전용으로 서서 ×로 지우는 길만 준다.
 * 칩을 누르면 그게 적용 범위가 되고 표본이 그 글자로 바뀐다. `이 자모만`은 자모 고르기 시트를 연다.
 */

const NEUTRAL = '#8a8f98'
/** 고른 칩을 끌어올 때 띠 양끝에 남기는 여백(px). 띠의 좌우 padding과 같다. */
const EDGE = 14
const FIXED_LABEL = { layer: '이 레이아웃', picker: '이 자모만', all: '전체' } as const

const isSelected = (chip: ScopeChip, selected: LayoutDeltaTarget) =>
  chip.kind === 'picker' ? selected.scope === 'jamo'
    : chip.kind === 'jamo' ? selected.scope === 'jamo' && selected.jamos.includes(jamoKeyOf(partOfGroup[chip.group], chip.jamo))
      : selected.scope === chip.kind

export function LayoutScopeStrip({ source, selected, picked, fixedDisabled, jamoDisabled, onScope, onPickJamo, onOpenPicker, onRemove }: {
  source: CorpusIdentity
  /** 지금 적용 범위. 맞는 칩을 켠다. */
  selected: LayoutDeltaTarget
  /** `이 자모만`에서 고른 자모. 저장 전이어도 칩으로 보인다. 다른 범위일 때는 null. */
  picked: { group: OverrideGroup; jamos: string[] } | null
  /** 앞의 두 칩을 끈다(잡은 rail 없음 · 형태 모드). */
  fixedDisabled: boolean
  /** 자모 칩을 끈다(형태 모드). */
  jamoDisabled: boolean
  onScope: (scope: 'layer') => void
  /** 자모 칩을 누르면 그 자모 하나만 고른다. 여러 개는 시트에서. */
  onPickJamo: (group: OverrideGroup, jamo: string) => void
  onOpenPicker: () => void
  onRemove: (target: LayoutDeltaTarget) => void
}) {
  const all = useLayoutDeltaStore((state) => state.all)
  const layers = useLayoutDeltaStore((state) => state.layers)
  const jamo = useLayoutDeltaStore((state) => state.jamo)
  const chips = useMemo(() => scopeChipsOf(overrideCardsOf({ all, layers, jamo }, source.contextId), picked), [all, layers, jamo, source.contextId, picked])
  // 고른 칩이 띠 밖에 있으면 가로로만 끌어온다. 세로 스크롤은 건드리지 않는다.
  const listRef = useRef<HTMLUListElement>(null)
  const selectedKey = selected.scope === 'jamo' ? selected.jamos.join(',') : selected.scope
  useEffect(() => {
    const list = listRef.current
    const chip = list?.querySelector<HTMLElement>('[data-selected="true"]:not([data-kind="picker"])')
    if (!list || !chip) return
    const box = list.getBoundingClientRect()
    const rect = chip.getBoundingClientRect()
    if (rect.left < box.left + EDGE) list.scrollLeft -= box.left + EDGE - rect.left
    else if (rect.right > box.right - EDGE) list.scrollLeft += rect.right - (box.right - EDGE)
  }, [selectedKey, chips.length])
  return <ul ref={listRef} className={styles.strip} role="group" aria-label="배치 적용 범위" data-testid="layout-scope-strip">
    {chips.map((chip) => {
      const on = isSelected(chip, selected)
      const key = chip.kind === 'jamo' ? `${chip.group}:${chip.jamo}` : chip.kind
      const name = chip.kind === 'jamo' ? `${chip.jamo} · ${PART_GROUP_LABEL[chip.group]}` : FIXED_LABEL[chip.kind]
      const delta = chip.kind === 'picker' ? null : chip.delta
      const target: LayoutDeltaTarget | null = chip.kind === 'picker' ? null
        : chip.kind === 'jamo' ? { scope: 'jamo', contextId: source.contextId, jamos: [jamoKeyOf(partOfGroup[chip.group], chip.jamo)] }
          : chip.kind === 'all' ? { scope: 'all' }
            : { scope: 'layer', contextId: source.contextId }
      const lines = delta ? deltaSummary(delta, chip.kind !== 'jamo') : []
      const count = !delta || chip.kind === 'picker' ? null : overrideGlyphCount(chip.kind === 'jamo' ? { scope: 'jamo', contextId: source.contextId, group: chip.group, jamo: chip.jamo } : chip.kind === 'all' ? { scope: 'all' } : { scope: 'layer', contextId: source.contextId })
      const color = chip.kind === 'jamo' ? PART_COLOR[partOfGroup[chip.group]] : NEUTRAL
      // `전체`는 읽기 전용이라 몸통이 잠겨 있다. 지우기 ×만 산다.
      const locked = chip.kind === 'all'
      const press = () => chip.kind === 'picker' ? onOpenPicker() : chip.kind === 'jamo' ? onPickJamo(chip.group, chip.jamo) : chip.kind === 'layer' ? onScope('layer') : undefined
      return <li key={key} className={styles.chip} style={{ '--chip-color': color } as React.CSSProperties} data-testid={delta ? 'layout-override-card' : 'layout-scope-chip'} data-kind={chip.kind} data-jamo={chip.kind === 'jamo' ? chip.jamo : undefined} data-group={chip.kind === 'jamo' ? chip.group : undefined} data-selected={on || undefined} data-stored={delta ? 'true' : undefined}>
        <button type="button" className={styles.body} data-testid="layout-override-select" aria-label={name} aria-pressed={locked ? undefined : on} disabled={locked || (chip.kind === 'jamo' ? jamoDisabled : fixedDisabled)} onClick={press}>
          <span className={styles.name}>
            {chip.kind === 'jamo' ? <><b>{chip.jamo}</b><i>{PART_GROUP_LABEL[chip.group]}</i></> : <b>{name}</b>}
            {count !== null && <em>{count.toLocaleString()}자</em>}
          </span>
          {lines.length > 0 && <small>{lines[0]}{lines.length > 1 ? ` 외 ${lines.length - 1}` : ''}</small>}
        </button>
        {delta && target && <button type="button" className={styles.remove} aria-label={`${name} 오버라이드 지우기`} onClick={() => onRemove(target)} data-testid="layout-override-remove">×</button>}
      </li>
    })}
  </ul>
}
