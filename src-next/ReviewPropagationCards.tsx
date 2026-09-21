import { useEffect, useImperativeHandle, useMemo, useState } from 'react'
import type { Ref } from 'react'
import type { Part } from '../src/types'
import type { CorpusIdentity } from './notoCorpus'
import type { EditableRail } from './notoMedialFitView'
import { jamoPartOf, layoutDeltaSnapshot, useLayoutDeltaStore } from './layoutDeltaStore'
import { LayoutOptionStack } from './LayoutOptionStack'
import type { OverrideGroup } from './layoutOverrides'
import type { LayoutDeltaSnapshot } from './layoutDeltaStore'
import { ruleName, ruleOfContext, withJamos } from './scopeRule'
import { LayoutScopePicker } from './LayoutScopePicker'
import type { RuleJamoPart, ScopeRule } from './scopeRule'
import { focusJamoOf, jamoChoicesFor, layoutDeltaOf, PART_GROUP_LABEL, PROPAGATION_SCOPES } from './reviewPropagation'
import type { PropagationEdit, PropagationScope } from './reviewPropagation'
import styles from './ReviewPropagationCards.module.css'

/**
 * 캔버스 아래 적용 범위 묶음: 옵션 스택 + Δ 줄 + 자모 고르기 시트.
 * `적용`을 누르면 배치 Δ가 `layoutDeltaStore`에 범위대로 저장돼 앱 전체 배치에 얹힌다. 획 길이(형태)는 여기서 안 다룬다 — `획 고치기`의 몫.
 * - 배치 Δ(중심 rail·홀자 상자 변·닿자 네 변): 기본 `이 레이아웃`, `이 자모만`은 잡은 부품의 자모로 좁힐 때(여러 자모 가능), `전체`는 일부러 넓힐 때. em 그대로.
 * 범위에 닿는 글자 표본은 여기가 아니라 상단 `닿는 글자` 줄(`TouchedGlyphRow`)이 보인다 — 고른 범위만 위로 알린다.
 */

const RULE_PART: Record<OverrideGroup, RuleJamoPart> = { CH: 'initial', JU: 'medial', JO: 'final' }

/** Δ 줄. 더하기는 `+10u`, 고정은 `= 718`(em×1000 자리). */
function DeltaList({ rails, fixed, testId }: { rails: EditableRail[]; fixed?: ReadonlySet<string>; testId: string }) {
  return <div className={styles.deltas} data-testid={testId}>
    {rails.map((rail) => {
      if (fixed?.has(rail.id)) return <span key={rail.id} data-fixed="true"><i>{rail.label}</i>= {Math.round(rail.value * 1000)}</span>
      const units = (rail.value - rail.original) * 1000
      return <span key={rail.id}><i>{rail.label}</i>{units >= 0 ? '+' : ''}{units.toFixed(0)}u</span>
    })}
  </div>
}

/** 편집기 하단 바가 `적용`을 누를 때 쓰는 손잡이. 범위·고른 자모는 이 묶음이 들고 있어서 여기로 판다. */
export interface ReviewPropagationHandle { apply: () => void }

/** 지금 고른 범위. 상단 `닿는 글자` 줄과 캔버스 옆 여섯 칸 표지가 이걸 보고 그린다. */
export interface ScopeSelection {
  scope: PropagationScope
  group: OverrideGroup
  jamos: string[]
  /** 범위 고르기 화면에서 확정한 규칙. 있으면 표본은 이 규칙으로 뽑는다. */
  rule?: ScopeRule
}

export function ReviewPropagationCards({ source, edit, changed, fixed, focus, railRole, onApplied, onCommitted, onSelectPart, onScopeLabel, onScopeChange, onScopeApplied, ref }: {
  source: CorpusIdentity
  edit: PropagationEdit
  /** 모델 값에서 벗어난 rail(고정된 rail 포함). 머리에 이름과 Δ(u)를 보인다. */
  changed: EditableRail[]
  /** 고정(`= 자리`)한 변 rail id. Δ 줄 표시용. */
  fixed?: ReadonlySet<string>
  /** 지금 잡은 rail의 부품. 이게 있어야 범위를 고를 수 있다. */
  focus?: Part
  /** 지금 잡은 rail의 역할(`outerPillar` 등). 범위 고르기 화면의 추천 칩이 쓴다. */
  railRole?: string
  /** 배치 Δ를 저장한 뒤. 호출자는 세션 편집을 비워 새 original에서 다시 시작한다. */
  onApplied?: () => void
  /** 저장소가 바뀐 직후(적용·지우기). 앞뒤 스냅샷을 넘겨 호출자가 Undo 기록을 남긴다. */
  onCommitted?: (before: LayoutDeltaSnapshot, after: LayoutDeltaSnapshot) => void
  /** 오버라이드 카드(자모별)를 누르면 그 부품을 켠다. 캔버스의 부품 고르기와 같은 경로. */
  onSelectPart?: (part: Part) => void
  /** 지금 범위 이름(`이 레이아웃` · `ㄱ·ㅋ` · `전체`). 하단 바의 `…에 적용` 글씨용. */
  onScopeLabel?: (label: string) => void
  /** 지금 범위가 바뀔 때마다. 상단 `닿는 글자` 줄이 이 범위의 글자를 보인다. */
  onScopeChange?: (selection: ScopeSelection) => void
  /** 방금 적용한 규칙들. 문장 줄이 그 범위에 든 글자를 잠깐 표시한다. */
  onScopeApplied?: (rules: readonly ScopeRule[]) => void
  ref?: Ref<ReviewPropagationHandle>
}) {
  const [scope, setScope] = useState<PropagationScope>('layer')
  // 범위 고르기 화면에서 확정한 규칙. 있으면 이게 지금 범위다(칩·자모 시트가 만드는 것보다 넓거나 좁을 수 있다).
  const [custom, setCustom] = useState<ScopeRule | null>(null)
  // 열려 있는 범위 고르기 화면과 그 화면이 들고 연 규칙.
  const [scopeOpen, setScopeOpen] = useState<ScopeRule | null>(null)
  const chooseScope = (next: PropagationScope) => { setCustom(null); setScope(next) }
  const applyDelta = useLayoutDeltaStore((state) => state.apply)
  const clearDelta = useLayoutDeltaStore((state) => state.clear)
  // `이 자모만`에서 고른 자모. 기본은 잡은 자모 하나. 부품이 바뀌면 고른 것을 버린다. 최소 하나는 남는다.
  const focusJamo = focusJamoOf(source, focus)
  const group = focus ? jamoPartOf(focus) : 'JU'
  const [picked, setPicked] = useState<{ group: OverrideGroup; jamos: string[] } | null>(null)
  const jamos = useMemo(() => picked?.group === group && picked.jamos.length > 0 ? picked.jamos : focusJamo ? [focusJamo] : [], [focusJamo, picked, group])
  const togglePicked = (jamo: string) => setPicked(jamos.includes(jamo) ? (jamos.length > 1 ? { group, jamos: jamos.filter((item) => item !== jamo) } : { group, jamos }) : { group, jamos: [...jamos, jamo] })
  // 고른 범위 = 규칙식. `이 레이아웃`은 문맥만, `이 자모만`은 거기에 잡은 부품의 자모 목록을 얹은 것.
  const target = useMemo<ScopeRule>(() => {
    if (custom) return custom
    if (scope === 'all') return {}
    const base = ruleOfContext(source.contextId)
    return scope === 'layer' ? base : withJamos(base, RULE_PART[group], jamos)
  }, [custom, scope, source.contextId, jamos, group])
  // 저장은 자모마다 규칙 하나씩이다. 칩 ×가 고른 자모 중 하나만 지울 수 있어야 해서 — 목록 하나로 합치는 건 옵션 박스(B)에서 정한다.
  const saveTargets = useMemo<ScopeRule[]>(() => {
    if (custom || scope !== 'jamo') return [target]
    const base = ruleOfContext(source.contextId)
    return jamos.map((jamo) => withJamos(base, RULE_PART[group], [jamo]))
  }, [custom, scope, target, source.contextId, jamos, group])
  const commit = (change: () => void) => { const before = layoutDeltaSnapshot(); change(); onCommitted?.(before, layoutDeltaSnapshot()); onApplied?.() }
  // 옵션 박스를 누르면 그게 지금 범위가 된다. 자모 조건이 있으면 그 부품이 켜지고 표본이 그 자모 글자로 바뀐다.
  const selectRule = (rule: ScopeRule) => {
    setCustom(null)
    const picked = (['initial', 'medial', 'final'] as const).flatMap((part) => rule[part]?.length ? [{ part, jamos: rule[part]! }] : [])[0]
    if (!picked) { setScope('layer'); return }
    const jamoGroup = (Object.keys(RULE_PART) as OverrideGroup[]).find((key) => RULE_PART[key] === picked.part) ?? 'CH'
    onSelectPart?.(jamoGroup)
    setPicked({ group: jamoGroup, jamos: [...picked.jamos] })
    setScope('jamo')
  }
  // `이 자모만`의 자모 고르기 시트. 고르는 즉시 표본이 바뀌고 `완료`는 닫기만 한다.
  const [pickerOpen, setPickerOpen] = useState(false)
  useEffect(() => {
    if (!pickerOpen) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setPickerOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pickerOpen])
  const scopeLabel = custom ? ruleName(custom) : scope === 'jamo' ? jamos.join('·') : PROPAGATION_SCOPES.find((item) => item.id === scope)?.label ?? ''
  useEffect(() => { onScopeLabel?.(scopeLabel) }, [onScopeLabel, scopeLabel])
  // 고른 범위를 위로 알린다. 표본은 상단 `닿는 글자` 줄이 그린다.
  useEffect(() => { onScopeChange?.({ scope, group, jamos, rule: custom ?? undefined }) }, [onScopeChange, scope, group, jamos, custom])
  // 적용 = 지금 범위에 Δ 저장. 하단 바가 ref로 부른다. 닫힘값은 렌더마다 새로 잡는다(ref 갱신은 값싸다).
  useImperativeHandle(ref, () => ({ apply: () => commit(() => { for (const rule of saveTargets) applyDelta(rule, layoutDeltaOf(edit)); onScopeApplied?.(saveTargets) }) }))
  return <section className={styles.section} aria-label="다른 글자에 적용하면" data-testid="review-propagation">
    {/* 옵션 스택 = 적용 범위 고르기 + 쌓인 오버라이드. 저장된 Δ는 이미 캔버스 original에 들어 있고, 지우기는 박스 ×로(Undo 됨). */}
    <LayoutOptionStack source={source} drafts={saveTargets} scope={scope === 'jamo' ? 'jamo' : 'layer'} fixedDisabled={!focus}
      onScope={chooseScope} onOpenPicker={() => { chooseScope('jamo'); setPickerOpen(true) }} onSelect={selectRule} onRemove={(removed) => commit(() => clearDelta(removed))}
      onOpenScope={(rule) => setScopeOpen(rule)} />
    {/* Δ 줄은 화면에서 숨기고 읽기 도구에만 남긴다(CSS). 자리를 안 차지하니 옮겨도 아래가 안 밀린다. */}
    <div className={styles.deltaRow}>
      <DeltaList rails={changed} fixed={fixed} testId="review-propagation-deltas" />
    </div>
    {/* 자모 고르기 시트. 잡은 부품 자리에 올 수 있는 자모 전부. 기본은 잡은 자모 하나, 마지막 하나는 못 끈다. 여러 개를 켜면 같은 Δ가 자모마다 따로 저장된다. */}
    {pickerOpen && focus && <div className={styles.sheetBackdrop} onClick={() => setPickerOpen(false)}>
      <div className={styles.sheet} role="dialog" aria-modal="true" aria-label={`${PART_GROUP_LABEL[group]} 자모 고르기`} onClick={(event) => event.stopPropagation()}>
        <header>
          <span><b>{PART_GROUP_LABEL[group]} 자모 고르기</b><small>이 레이아웃에서 {PART_GROUP_LABEL[group]}{group === 'JO' ? '이' : '가'} 고른 자모인 글자에만 · 자모마다 따로 저장</small></span>
          <button type="button" onClick={() => setPickerOpen(false)} data-testid="review-propagation-jamos-done">완료</button>
        </header>
        <div className={styles.jamos} role="group" aria-label={`${PART_GROUP_LABEL[group]} 자모`} data-testid="review-propagation-jamos">
          {jamoChoicesFor(focus).map((jamo) => { const on = jamos.includes(jamo); return <button type="button" key={jamo} aria-pressed={on} disabled={on && jamos.length === 1} data-jamo={jamo} onClick={() => togglePicked(jamo)}>{jamo}</button> })}
        </div>
      </div>
    </div>}
    {/* 범위 고르기 화면. 검수 격자를 그대로 쓰고, 머리를 눌러(쓸어) 범위를 집는다. `이 범위로`가 지금 범위를 갈아치운다. */}
    {scopeOpen && focus && <LayoutScopePicker source={source} rule={scopeOpen} part={RULE_PART[group]} railRole={railRole}
      deltaLine={changed.length > 0 ? `${changed[0].label} ${changed.length > 1 ? `외 ${changed.length - 1}` : ''}`.trim() : undefined}
      onCancel={() => setScopeOpen(null)}
      onConfirm={(rule) => { setCustom(rule); setScopeOpen(null) }} />}
  </section>
}
