import { useEffect, useImperativeHandle, useMemo, useState } from 'react'
import type { Ref } from 'react'
import type { Part } from '../src/types'
import type { CorpusIdentity } from './notoCorpus'
import type { EditableRail } from './notoMedialFitView'
import { jamoPartOf, layoutDeltaSnapshot, useLayoutDeltaStore } from './layoutDeltaStore'
import { LayoutOptionStack, stackLabel } from './LayoutOptionStack'
import { seedRuleOf } from './layoutOverrides'
import type { OverrideGroup } from './layoutOverrides'
import type { LayoutDeltaSnapshot } from './layoutDeltaStore'
import { matchesRule, ruleFromKey, ruleKey, ruleOfContext } from './scopeRule'
import { LayoutScopePicker } from './LayoutScopePicker'
import type { RuleJamoPart, ScopeRule } from './scopeRule'
import { layoutDeltaOf } from './reviewPropagation'
import type { PropagationEdit, PropagationScope } from './reviewPropagation'
import styles from './ReviewPropagationCards.module.css'

/**
 * 캔버스 아래 적용 범위 묶음: 옵션 스택 + Δ 줄 + 범위 고르기 화면.
 * `적용`을 누르면 배치 Δ가 `layoutDeltaStore`에 **켠 박스의 범위**대로 저장돼 앱 전체 배치에 얹힌다. 획 길이(형태)는 여기서 안 다룬다 — `획 고치기`의 몫.
 *
 * 옵션 박스 = **빈 범위 슬롯**이다(9/22). `옵션 추가`로 만들면 Δ가 없어도 박스로 남고, 여럿 만들어 두고 하나씩 켜서 고친다.
 * 켠 박스 하나가 곧 지금 범위고, 저장은 규칙 하나다(옛 `자모마다 규칙 하나씩`은 박스가 자모 목록을 통째로 들면서 필요 없어졌다).
 * 범위에 닿는 글자 표본은 여기가 아니라 상단 `닿는 글자` 줄(`TouchedGlyphRow`)이 보인다 — 고른 범위만 위로 알린다.
 */

const RULE_PART: Record<OverrideGroup, RuleJamoPart> = { CH: 'initial', JU: 'medial', JO: 'final' }
const GROUP_OF_PART: Record<RuleJamoPart, OverrideGroup> = { initial: 'CH', medial: 'JU', final: 'JO' }

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

/**
 * 편집기 하단 바가 쓰는 손잡이. 범위·고른 자모는 이 묶음이 들고 있어서 여기로 판다.
 * `apply`(`선택 옵션에 저장`)는 켠 옵션에 저장하고, `applyAsNew`(`신규 옵션에 저장`)는 옮긴 값을 든 채 범위 고르기 화면을 열어 **새 옵션**에 저장한다.
 */
export interface ReviewPropagationHandle { apply: () => void; applyAsNew: () => void }

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
  const applyDelta = useLayoutDeltaStore((state) => state.apply)
  const clearDelta = useLayoutDeltaStore((state) => state.clear)
  const storedDeltas = useLayoutDeltaStore((state) => state.rules)
  // 이 레이아웃 = 늘 서 있는 기본 옵션. 지울 수 없고 다른 옵션의 출발점이다.
  const baseRule = useMemo(() => ruleOfContext(source.contextId), [source.contextId])
  // `옵션 추가`로 만든 빈 범위 슬롯. Δ가 아직 없어도 박스로 남는다(계약 §4를 9/22에 뒤집었다).
  const [slots, setSlots] = useState<ScopeRule[]>([])
  const [selectedKey, setSelectedKey] = useState(() => ruleKey(baseRule))
  // 열려 있는 범위 고르기 화면. `new`는 빈 옵션을 만들고, `edit`은 그 박스의 범위를 고쳐 쓰고, `apply`는 옮긴 값을 새 옵션에 바로 저장한다.
  const [scopeOpen, setScopeOpen] = useState<{ rule: ScopeRule; mode: 'new' | 'edit' | 'apply'; part?: RuleJamoPart } | null>(null)
  // 레이아웃 칸이 바뀌면 이 칸에서 만든 슬롯은 버리고 기본으로 돌아간다.
  useEffect(() => { setSlots([]); setSelectedKey(ruleKey(baseRule)) }, [baseRule])

  // 켠 옵션이 이 글자에 안 닿게 되면(범위를 고쳐 이 글자가 빠졌거나, 이 글자가 안 든 범위에 저장했거나) 스택에서 사라지니 기본으로 돌아간다.
  useEffect(() => {
    if (selectedKey === ruleKey(baseRule) || slots.some((rule) => ruleKey(rule) === selectedKey)) return
    if (!matchesRule(ruleFromKey(selectedKey), source)) setSelectedKey(ruleKey(baseRule))
  }, [selectedKey, baseRule, slots, source])

  // 켠 박스가 곧 지금 범위다. 키에서 규칙을 되살린다 — 저장된 것이든 세션 슬롯이든 같은 길.
  const target = useMemo<ScopeRule>(() => ruleFromKey(selectedKey), [selectedKey])
  const saveTargets = useMemo<ScopeRule[]>(() => [target], [target])
  // 지금 범위가 어느 부품을 좁히고 있나. 상단 `닿는 글자` 줄과 캔버스 표지가 이걸 본다.
  const rulePart = (['initial', 'medial', 'final'] as const).find((part) => target[part]?.length)
  const group: OverrideGroup = rulePart ? GROUP_OF_PART[rulePart] : focus ? jamoPartOf(focus) : 'JU'
  const jamos = useMemo(() => rulePart ? (target[rulePart] as (string | null)[]).filter((jamo): jamo is string => jamo !== null) : [], [rulePart, target])
  const scope: PropagationScope = rulePart ? 'jamo' : 'layer'

  const commit = (change: () => void) => { const before = layoutDeltaSnapshot(); change(); onCommitted?.(before, layoutDeltaSnapshot()); onApplied?.() }
  // 옵션 박스를 누르면 그게 지금 범위가 된다. 자모 조건이 있으면 그 부품이 켜진다.
  const selectRule = (rule: ScopeRule) => {
    setSelectedKey(ruleKey(rule))
    const part = (['initial', 'medial', 'final'] as const).find((item) => rule[item]?.length)
    if (part) onSelectPart?.(GROUP_OF_PART[part])
  }
  // 박스 지우기. 저장된 Δ가 있으면 그걸 지우고(Undo 됨), 빈 슬롯이면 목록에서만 뺀다.
  const removeRule = (rule: ScopeRule) => {
    const key = ruleKey(rule)
    if (storedDeltas[key]) commit(() => clearDelta(rule))
    setSlots((list) => list.filter((item) => ruleKey(item) !== key))
    if (selectedKey === key) setSelectedKey(ruleKey(baseRule))
  }
  // 범위 고르기 화면이 확정한 규칙. 새로 만들면 슬롯이 하나 늘고, 고쳐 쓰면 그 자리의 Δ까지 옮긴다.
  const confirmScope = (rule: ScopeRule) => {
    const open = scopeOpen
    setScopeOpen(null)
    if (!open) return
    const key = ruleKey(rule)
    const oldKey = ruleKey(open.rule)
    if (open.mode === 'edit' && key !== oldKey) {
      const moved = storedDeltas[oldKey]
      if (moved) commit(() => { clearDelta(open.rule); applyDelta(rule, moved) })
      setSlots((list) => list.map((item) => ruleKey(item) === oldKey ? rule : item))
    } else if (open.mode === 'new') {
      setSlots((list) => list.some((item) => ruleKey(item) === key) ? list : [...list, rule])
    } else if (open.mode === 'apply') {
      // 옮긴 값을 그 범위에 바로 저장한다. 같은 범위의 옵션이 이미 있으면 같은 키라 거기에 더해진다.
      commit(() => { applyDelta(rule, layoutDeltaOf(edit)); onScopeApplied?.([rule]) })
    }
    setSelectedKey(key)
  }
  // `신규 옵션에 저장` — 방금 옮긴 부품의 지금 글자 자모 하나를 미리 골라 둔 채 범위 고르기 화면을 연다. 대부분 그대로 확정하면 끝난다.
  const openApplyAsNew = () => {
    const seed = seedRuleOf(source, focus)
    setScopeOpen({ rule: seed.rule, mode: 'apply', part: seed.part })
  }
  // 하단 바의 `…에 적용`. 박스에 적는 것과 같은 짧은 이름을 쓴다(이 레이아웃 앞머리는 뗀다).
  const scopeLabel = stackLabel(target, source.contextId)
  useEffect(() => { onScopeLabel?.(scopeLabel) }, [onScopeLabel, scopeLabel])
  // 고른 범위를 위로 알린다. 표본은 상단 `닿는 글자` 줄이 그린다.
  useEffect(() => { onScopeChange?.({ scope, group, jamos, rule: target }) }, [onScopeChange, scope, group, jamos, target])
  // 적용 = 지금 범위에 Δ 저장. 하단 바가 ref로 부른다. 닫힘값은 렌더마다 새로 잡는다(ref 갱신은 값싸다).
  useImperativeHandle(ref, () => ({
    apply: () => commit(() => { for (const rule of saveTargets) applyDelta(rule, layoutDeltaOf(edit)); onScopeApplied?.(saveTargets) }),
    applyAsNew: openApplyAsNew,
  }))
  return <section className={styles.section} aria-label="다른 글자에 적용하면" data-testid="review-propagation">
    {/* 옵션 스택 = 쌓인 범위 박스. `옵션 추가`가 새 박스를 만들고, 박스를 누르면 그게 지금 범위다. 지우기는 ×로(Undo 됨). */}
    <LayoutOptionStack source={source} slots={[baseRule, ...slots]} selectedKey={selectedKey} baseKey={ruleKey(baseRule)}
      onAdd={() => setScopeOpen({ rule: baseRule, mode: 'new' })} onSelect={selectRule} onRemove={removeRule}
      onOpenScope={(rule) => setScopeOpen({ rule, mode: 'edit' })} />
    {/* Δ 줄은 화면에서 숨기고 읽기 도구에만 남긴다(CSS). 자리를 안 차지하니 옮겨도 아래가 안 밀린다. */}
    <div className={styles.deltaRow}>
      <DeltaList rails={changed} fixed={fixed} testId="review-propagation-deltas" />
    </div>
    {/* 범위 고르기 화면. 검수 격자를 그대로 쓰고 사각을 집는다. `이 범위로`가 박스를 만들거나 그 박스의 범위를 고쳐 쓴다. */}
    {scopeOpen && <LayoutScopePicker source={source} rule={scopeOpen.rule} part={scopeOpen.part ?? RULE_PART[group]} railRole={railRole}
      confirmLabel={scopeOpen.mode === 'apply' ? '신규 옵션에 저장' : undefined} allowUnchanged={scopeOpen.mode === 'apply'}
      deltaLine={changed.length > 0 ? `${changed[0].label} ${changed.length > 1 ? `외 ${changed.length - 1}` : ''}`.trim() : undefined}
      onCancel={() => setScopeOpen(null)}
      onConfirm={confirmScope} />}
  </section>
}
