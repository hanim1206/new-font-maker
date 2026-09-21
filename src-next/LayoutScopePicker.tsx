import { useEffect, useMemo, useRef, useState } from 'react'
import { AppGlyph } from './AppGlyph'
import { allCorpusRows, corpusIdentity } from './notoCorpus'
import type { CorpusIdentity, CorpusRow, CorpusSnapshot } from './notoCorpus'
import { NotoCorpusMatrix } from './NotoCorpusMatrix'
import { ScopeThumbnail } from './ScopeThumbnail'
import { axisOn, ruleOfSets, ruleSamples, scopeChipsFor, setsOfRule, toggleAxis } from './scopePicker'
import type { ScopeSets } from './scopePicker'
import { isEmptyRule, ruleGlyphCount, ruleKey, ruleName } from './scopeRule'
import type { RuleJamoPart, ScopeRule } from './scopeRule'
import styles from './LayoutScopePicker.module.css'

/**
 * 범위 고르기 화면. 옵션 박스의 `더 보기`가 연다. 계약은 `docs/specs/적용범위-규칙식.md` §6·§7.
 *
 * 검수 탭과 **같은 격자**(`NotoCorpusMatrix`)를 쓴다. 범위가 되는 조작은 셋뿐 — 행 머리 · 열 머리 · 그룹 머리.
 * 머리를 쓸면 지나간 줄이 한 번에 켜진다. 칸을 누르면 그 글자를 크게 볼 뿐 범위는 안 바뀐다.
 * 추천 칩은 표를 켜 주는 지름길이고, 누르면 그 규칙으로 **갈아치운다**(합치지 않는다).
 * 칸은 프로젝트 획으로 그리고 Δ는 안 얹는다 — Δ가 10~20u라 20px 칸에서는 안 보이고, 칸이 답하는 질문은 `이 범위에 어떤 글자가 들었나`다.
 */

const ROWS: CorpusRow[] = allCorpusRows({ rows: [] } as unknown as CorpusSnapshot)
const NO_REVIEWS = {}
const SAMPLE_COUNT = 6
const CELL_GLYPH_SIZE = 26

const renderCell = (row: CorpusRow) => <AppGlyph char={row.identity.character} size={CELL_GLYPH_SIZE} upright />

/** 받침 축을 다루는 세 자리. 표에서 받침이 시트로 접혀 있어도 이 세그먼트가 뜻을 말한다. */
type FinalMode = 'all' | 'with' | 'without'
const FINAL_MODES: { id: FinalMode; label: string }[] = [{ id: 'all', label: '전부' }, { id: 'with', label: '있음' }, { id: 'without', label: '없음' }]

function finalModeOf(sets: ScopeSets): FinalMode {
  const hasNone = sets.final.has(null)
  const others = [...sets.final].filter((value) => value !== null).length
  return hasNone && others > 0 ? 'all' : hasNone ? 'without' : 'with'
}

export function LayoutScopePicker({ source, rule, deltaLine, part, railRole, onCancel, onConfirm }: {
  /** 지금 고치는 글자. 표는 이 글자가 든 시트에서 연다. */
  source: CorpusIdentity
  /** 열 때의 범위. `취소`는 여기로 되돌린다. */
  rule: ScopeRule
  /** 머리에 한 줄로 적는 Δ 요약. 없으면 `아직 고친 것 없음`. */
  deltaLine?: string
  /** 잡은 부품. 추천 칩이 어느 자리의 자모를 볼지 정한다. */
  part: RuleJamoPart
  /** 잡은 rail의 역할(`outerPillar` 등). 추천 칩 `…있는 홀자`가 여기서 나온다. */
  railRole?: string
  onCancel: () => void
  onConfirm: (rule: ScopeRule) => void
}) {
  const [sets, setSets] = useState<ScopeSets>(() => setsOfRule(rule))
  // 켠 칩. 같은 칩을 다시 누르면 꺼지고 바로 앞 규칙으로 돌아간다.
  const [chipOn, setChipOn] = useState<string | null>(null)
  const previous = useRef<ScopeSets | null>(null)
  const [zoom, setZoom] = useState(source.codepoint)
  const chips = useMemo(() => scopeChipsFor({ source, part, railRole }), [source, part, railRole])
  const current = useMemo(() => ruleOfSets(sets), [sets])
  const count = useMemo(() => ruleGlyphCount(current), [current])
  const samples = useMemo(() => ruleSamples(current, SAMPLE_COUNT), [current])
  const name = isEmptyRule(current) ? '전체' : ruleName(current)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  const pickChip = (chip: { id: string; rule: ScopeRule }) => {
    if (chipOn === chip.id) {
      // 다시 누르면 꺼지고 칩을 누르기 전 범위로 돌아간다.
      setSets(previous.current ?? setsOfRule(rule))
      setChipOn(null)
      return
    }
    if (chipOn === null) previous.current = sets
    setSets(setsOfRule(chip.rule))
    setChipOn(chip.id)
  }
  // 손으로 머리를 건드리면 칩은 꺼진 것으로 본다(칩이 켜 준 표를 다듬는 중이라 규칙은 그대로 둔다).
  const toggle = (axis: 'initial' | 'medial' | 'final', values: (string | null)[], on: boolean) => {
    setChipOn(null)
    setSets((sets) => toggleAxis(sets, axis, values, on))
  }
  const setFinalMode = (mode: FinalMode) => {
    setChipOn(null)
    setSets((sets) => {
      const withFinals = new Set([...sets.final].filter((value): value is string => value !== null))
      const finals = withFinals.size > 0 ? withFinals : new Set(setsOfRule({ hasFinal: true }).final)
      const next: Set<string | null> = mode === 'without' ? new Set([null]) : mode === 'with' ? new Set(finals) : new Set<string | null>([null, ...finals])
      return { ...sets, final: next }
    })
  }
  const zoomed = corpusIdentity(zoom)

  return <div className={styles.backdrop} role="dialog" aria-modal="true" aria-label="적용 범위 고르기" data-testid="layout-scope-picker">
    <div className={styles.sheet}>
      <header className={styles.head}>
        <ScopeThumbnail rule={current} contextId={source.contextId} size={30} />
        <span className={styles.headText}>
          <b data-testid="scope-picker-name">{name}</b>
          <small>{deltaLine || '아직 고친 것 없음'}</small>
        </span>
        <strong className={styles.count} data-testid="scope-picker-count">{count.toLocaleString()}자</strong>
      </header>

      {chips.length > 0 && <div className={styles.chips} role="group" aria-label="추천 범위">
        <span className={styles.chipsLabel}>추천</span>
        {chips.map((chip) => <button key={chip.id} type="button" data-testid="scope-picker-chip" data-chip={chip.id} aria-pressed={chipOn === chip.id} onClick={() => pickChip(chip)}>
          {chip.label} <em>{chip.count.toLocaleString()}</em>
        </button>)}
      </div>}

      <div className={styles.matrixSection}>
        <NotoCorpusMatrix rows={ROWS} reviews={NO_REVIEWS} selected={zoom} onSelect={setZoom} isHighlighted={() => true} noFinal={false} renderCell={renderCell} variant="picker"
          isAxisOn={(axis, value) => axisOn(sets, axis, value)} onToggleAxis={toggle} />
      </div>

      <div className={styles.finals} role="group" aria-label="받침">
        <span>받침</span>
        {FINAL_MODES.map((mode) => <button key={mode.id} type="button" data-testid="scope-picker-final" data-mode={mode.id} aria-pressed={finalModeOf(sets) === mode.id} onClick={() => setFinalMode(mode.id)}>{mode.label}</button>)}
      </div>

      <div className={styles.samples}>
        {/* 누른 칸은 크게. 범위는 안 바뀐다 — Δ가 10~20u라 작은 칸으로는 못 보는 걸 여기서 본다. */}
        <figure className={styles.zoom} data-testid="scope-picker-zoom"><AppGlyph char={zoomed.character} size={54} /><figcaption>{zoomed.character}</figcaption></figure>
        <div className={styles.sampleRow}>
          {samples.map((identity) => <span key={identity.codepoint} data-testid="scope-picker-sample"><AppGlyph char={identity.character} size={30} /></span>)}
          {count > samples.length && <small>외 {(count - samples.length).toLocaleString()}자</small>}
        </div>
      </div>

      <footer className={styles.foot}>
        <button type="button" className={styles.cancel} onClick={onCancel} data-testid="scope-picker-cancel">취소</button>
        <button type="button" className={styles.confirm} disabled={count === 0 || ruleKey(current) === ruleKey(rule)} onClick={() => onConfirm(current)} data-testid="scope-picker-confirm">이 범위로</button>
      </footer>
    </div>
  </div>
}
