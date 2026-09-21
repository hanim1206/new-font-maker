import { useEffect, useMemo, useRef, useState } from 'react'
import { AppGlyph } from './AppGlyph'
import { CORPUS_FINALS, CORPUS_INITIALS } from './notoCorpus'
import type { CorpusIdentity } from './notoCorpus'
import { ScopeThumbnail } from './ScopeThumbnail'
import { axisAllOn, axisOn, MEDIAL_FAMILY_ITEMS, ruleOfSets, ruleSamples, scopeChipsFor, setsOfRule, toggleAxisAll, toggleAxisValue } from './scopePicker'
import type { ScopeSets } from './scopePicker'
import { familyOfContext, finalOfContext, isEmptyRule, ruleGlyphCount, ruleKey, ruleName } from './scopeRule'
import type { RuleJamoPart, ScopeRule } from './scopeRule'
import styles from './LayoutScopePicker.module.css'

/**
 * 범위 고르기 화면. 옵션 스택의 `범위 지정`과 박스의 `더 보기`가 연다. 계약은 `docs/specs/적용범위-규칙식.md` §6·§7.
 *
 * 범위 = 규칙식 = **축 셋의 자모 목록**이다. 그래서 화면도 축마다 줄 하나다 — 첫닿자 · 홀자 · 받침.
 * 격자(표)로 고르던 길은 9/22에 버렸다: 축이 셋인데 표는 둘밖에 못 담아 셋째 축이 늘 밖으로 새고
 * 그때마다 뜻이 흐려졌다(받침 `없` 열, 첫닿자 줄의 이중 의미, 숨은 `전부일 때 하나만` 규칙).
 *
 * 줄은 **이 칸 안**만 보인다 — 배치 Δ는 칸(홀자 계열 × 받침 유무) 귀속이라 다른 칸 자모를 고르면
 * 지금 고치는 글자가 안 든 범위가 만들어진다. 민글자는 받침이 `없음`으로 고정이라 줄 대신 한 마디만 적는다.
 * 맨 위 한 줄이 **고르는 법**이다: `직접 선택`(기본) 또는 추천 하나. 추천을 켜면 아래 줄은 그 규칙을 비추기만 하고 흐려진다 —
 * 막지는 않는다. 줄을 건드리면 그 순간 `직접 선택`으로 돌아온다(범위를 손으로 좁히는 게 추천보다 잦아서 문을 안 단다).
 * 아래 표본은 켠 범위에 드는 글자다 — 표를 걷어내면서 여기가 유일한 확인 수단이 됐다.
 */

const SAMPLE_COUNT = 8
const SAMPLE_SIZE = 30

/** 줄 하나 = 축 하나. `전체`는 전부 켜기, 이미 전부면 지금 글자의 자모 하나만 남긴다. */
function AxisRow({ label, axis, items, sets, keep, onToggle, onAll }: {
  label: string
  axis: RuleJamoPart
  items: readonly (string | null)[]
  sets: ScopeSets
  keep: string | null
  onToggle: (axis: RuleJamoPart, value: string | null) => void
  onAll: (axis: RuleJamoPart, items: readonly (string | null)[], keep: string | null) => void
}) {
  const on = items.filter((item) => axisOn(sets, axis, item)).length
  // 전부 켜지면 줄을 한 덩어리 검정 띠로 깐다(버튼 사이 틈까지) — `전부`가 낱낱이 아니라 통째로 읽히게.
  return <div className={styles.axis} data-axis={axis} data-all={on === items.length || undefined}>
    <span className={styles.axisLabel}>{label}<small data-testid="scope-axis-count">{on === items.length ? '전체' : `${on}개`}</small></span>
    <button type="button" className={styles.all} aria-pressed={axisAllOn(sets, axis, items)} data-testid="scope-axis-all" onClick={() => onAll(axis, items, keep)}>전체</button>
    <div className={styles.jamos} role="group" aria-label={`${label} 고르기`}>
      {items.map((item) => <button key={item ?? 'none'} type="button" data-testid="scope-axis-jamo" data-jamo={item ?? 'none'}
        aria-pressed={axisOn(sets, axis, item)} onClick={() => onToggle(axis, item)}>{item ?? '없음'}</button>)}
    </div>
  </div>
}

export function LayoutScopePicker({ source, rule, deltaLine, part, railRole, onCancel, onConfirm }: {
  /** 지금 고치는 글자. 줄에 놓이는 자모와 칸 제한이 여기서 나온다. */
  source: CorpusIdentity
  /** 열 때의 범위. `취소`는 여기로 되돌린다. */
  rule: ScopeRule
  /** 머리에 한 줄로 적는 Δ 요약. 없으면 `아직 고친 것 없음`. */
  deltaLine?: string
  /** 잡은 부품. 추천 칩이 어느 자리의 자모를 볼지 정한다. */
  part: RuleJamoPart
  /** 잡은 rail의 역할(`outerPillar` 등). 추천 칩 `…홀자`가 여기서 나온다. */
  railRole?: string
  onCancel: () => void
  onConfirm: (rule: ScopeRule) => void
}) {
  const [sets, setSets] = useState<ScopeSets>(() => setsOfRule(rule))
  // 켠 칩. 같은 칩을 다시 누르면 꺼지고 바로 앞 규칙으로 돌아간다.
  const [chipOn, setChipOn] = useState<string | null>(null)
  const previous = useRef<ScopeSets | null>(null)
  const chips = useMemo(() => scopeChipsFor({ source, part, railRole }), [source, part, railRole])
  const current = useMemo(() => ruleOfSets(sets), [sets])
  const count = useMemo(() => ruleGlyphCount(current), [current])
  const samples = useMemo(() => ruleSamples(current, SAMPLE_COUNT), [current])
  const name = isEmptyRule(current) ? '전체' : ruleName(current)
  const hasFinal = finalOfContext(source.contextId)
  const medials = MEDIAL_FAMILY_ITEMS[familyOfContext(source.contextId)]
  const finals = useMemo(() => CORPUS_FINALS.filter((value): value is string => value !== null), [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  // 추천을 끄고 칩을 누르기 전 범위로 돌아간다. `직접 선택`을 누르는 것과 같은 일이다.
  const dropChip = () => {
    if (chipOn === null) return
    setSets(previous.current ?? setsOfRule(rule))
    setChipOn(null)
  }
  const pickChip = (chip: { id: string; rule: ScopeRule }) => {
    if (chipOn === chip.id) { dropChip(); return }
    if (chipOn === null) previous.current = sets
    setSets(setsOfRule(chip.rule))
    setChipOn(chip.id)
  }
  // 손으로 줄을 건드리면 칩은 꺼진 것으로 본다(칩이 켜 준 범위를 다듬는 중이라 규칙은 그대로 둔다).
  const toggle = (axis: RuleJamoPart, value: string | null) => { setChipOn(null); setSets((sets) => toggleAxisValue(sets, axis, value)) }
  const toggleAll = (axis: RuleJamoPart, items: readonly (string | null)[], keep: string | null) => { setChipOn(null); setSets((sets) => toggleAxisAll(sets, axis, items, keep)) }

  return <div className={styles.backdrop} role="dialog" aria-modal="true" aria-label="적용 범위 고르기" data-testid="layout-scope-picker">
    <div className={styles.sheet}>
      <header className={styles.head}>
        <ScopeThumbnail rule={current} contextId={source.contextId} size={30} />
        <span className={styles.headText}>
          <b data-testid="scope-picker-name">{name}</b>
          <small>{deltaLine || '아직 고친 것 없음'}</small>
        </span>
        <strong className={styles.count} data-testid="scope-picker-count">{count.toLocaleString()}<span>자</span></strong>
      </header>

      {/* 어떻게 고를지 한 줄. `직접 선택`이 기본이고, 추천을 켜면 아래 줄은 그 규칙을 비추기만 한다(흐려진다). */}
      <div className={styles.chips} role="group" aria-label="범위 고르는 법">
        <button type="button" className={styles.manual} data-testid="scope-picker-chip" data-chip="manual" aria-pressed={chipOn === null} onClick={dropChip}>직접 선택</button>
        {chips.map((chip) => <button key={chip.id} type="button" data-testid="scope-picker-chip" data-chip={chip.id} aria-pressed={chipOn === chip.id} onClick={() => pickChip(chip)}>
          {chip.label} <em>{chip.count.toLocaleString()}</em>
        </button>)}
      </div>

      <div className={styles.axes} data-dim={chipOn !== null || undefined}>
        <AxisRow label="첫닿자" axis="initial" items={CORPUS_INITIALS} sets={sets} keep={source.initialJamo} onToggle={toggle} onAll={toggleAll} />
        <AxisRow label="홀자" axis="medial" items={medials} sets={sets} keep={source.medialJamo} onToggle={toggle} onAll={toggleAll} />
        {/* 받침은 이 칸이 정한다. 민글자는 고를 게 없어 한 마디만 적는다. */}
        {hasFinal
          ? <AxisRow label="받침" axis="final" items={finals} sets={sets} keep={source.finalJamo} onToggle={toggle} onAll={toggleAll} />
          : <div className={styles.axis} data-axis="final"><span className={styles.axisLabel}>받침</span><em className={styles.fixed} data-testid="scope-axis-fixed">없음 고정</em></div>}
      </div>

      {/* 켠 범위에 드는 글자. 보기만 하는 자리다. */}
      <div className={styles.samples} data-testid="scope-picker-samples">
        {samples.map((identity) => <span key={identity.codepoint} data-testid="scope-picker-sample" data-char={identity.character}>
          <AppGlyph char={identity.character} size={SAMPLE_SIZE} upright />
        </span>)}
        {count > samples.length && <small>외 {(count - samples.length).toLocaleString()}자</small>}
      </div>

      <footer className={styles.foot}>
        <button type="button" className={styles.cancel} onClick={onCancel} data-testid="scope-picker-cancel">취소</button>
        <button type="button" className={styles.confirm} disabled={count === 0 || ruleKey(current) === ruleKey(rule)} onClick={() => onConfirm(current)} data-testid="scope-picker-confirm">이 범위로</button>
      </footer>
    </div>
  </div>
}
