import { useMemo } from 'react'
import { storedRules, useLayoutDeltaStore } from './layoutDeltaStore'
import { deltaSummary, partOfGroup } from './layoutOverrides'
import type { OverrideGroup } from './layoutOverrides'
import type { CorpusIdentity } from './notoCorpus'
import { PART_COLOR } from './partColors'
import { PART_GROUP_LABEL } from './reviewPropagation'
import { ScopeThumbnail } from './ScopeThumbnail'
import { compareBreadth, familyOfContext, finalOfContext, isEmptyRule, matchesRule, ruleGlyphCount, ruleKey, ruleName, ruleOfContext } from './scopeRule'
import type { ScopeRule } from './scopeRule'
import styles from './LayoutOptionStack.module.css'

/**
 * 적용 범위 = 옵션 박스 스택. 계약은 `docs/specs/적용범위-규칙식.md`.
 *
 * 박스 하나 = 저장 항목 하나이고, **지금 고른 범위**는 아직 Δ가 없어도 점선 박스로 미리 선다(적용하면 실선).
 * 순서는 닿는 글자 수 내림차순이라 넓은 것이 위다 — `전체`(옛 저장분, 읽기 전용)가 있으면 늘 맨 위에 온다.
 * 이 레이아웃과 상관없는 규칙은 안 보인다. 조건 없는 규칙은 어디서나 보인다.
 * 아직 안 한 것: 넷 이상일 때 접기(표본 줄이 위로 간 뒤 남는 세로를 보고 정한다), 머리의 몬드리안 썸네일(범위 고르기 화면과 같은 그림이라 거기서 같이).
 */

const RULE_PART = { CH: 'initial', JU: 'medial', JO: 'final' } as const
const PART_OF_RULE_KEY: Record<string, OverrideGroup> = { initial: 'CH', medial: 'JU', final: 'JO' }

/** 이 문맥 화면에 보일 규칙인가. 조건 없는 것은 어디서나, 나머지는 이 문맥을 품을 때만. */
function belongsHere(rule: ScopeRule, contextId: string): boolean {
  if (isEmptyRule(rule)) return true
  if (rule.medialFamily && !rule.medialFamily.includes(familyOfContext(contextId))) return false
  if (rule.hasFinal !== undefined && rule.hasFinal !== finalOfContext(contextId)) return false
  return true
}

/** 박스에 적는 이름. 이 레이아웃이 이름의 앞머리면 떼고 꼬리만 남긴다(박스가 이미 그 레이아웃 자리에 있어서). */
function stackLabel(rule: ScopeRule, contextId: string): string {
  const full = ruleName(rule)
  const head = ruleName(ruleOfContext(contextId))
  return full !== head && full.startsWith(`${head} · `) ? full.slice(head.length + 3) : full
}

/** 그 규칙이 건드리는 부품 색. 자모 조건이 있으면 그 부품, 없으면 중립. */
const NEUTRAL = '#8a8f98'
function ruleColor(rule: ScopeRule): string {
  for (const [key, group] of Object.entries(PART_OF_RULE_KEY)) {
    if (rule[key as keyof ScopeRule]) return PART_COLOR[partOfGroup[group]]
  }
  return NEUTRAL
}

export interface StackEntry { rule: ScopeRule; key: string; delta: ReturnType<typeof storedRules>[number]['delta'] | null }

export function LayoutOptionStack({ source, drafts, scope, fixedDisabled, onScope, onOpenPicker, onSelect, onRemove, onOpenScope }: {
  source: CorpusIdentity
  /** 지금 고른 범위가 저장될 자리들. 켜지는 박스이기도 하다. 자모를 여럿 고르면 자모마다 하나씩이다. */
  drafts: ScopeRule[]
  scope: 'layer' | 'jamo'
  /** 잡은 rail이 없으면 범위를 못 고른다. */
  fixedDisabled: boolean
  onScope: (scope: 'layer') => void
  onOpenPicker: () => void
  onSelect: (rule: ScopeRule) => void
  onRemove: (rule: ScopeRule) => void
  /** 박스의 `더 보기`. 그 규칙으로 범위 고르기 화면을 연다. */
  onOpenScope?: (rule: ScopeRule) => void
}) {
  const rules = useLayoutDeltaStore((state) => state.rules)
  const draftKeys = drafts.map(ruleKey)
  const entries = useMemo<StackEntry[]>(() => {
    const stored = storedRules({ rules }).filter(({ rule }) => belongsHere(rule, source.contextId))
    const storedKeys = new Set(stored.map(({ key }) => key))
    const extra = drafts.filter((rule) => !storedKeys.has(ruleKey(rule))).map((rule) => ({ rule, key: ruleKey(rule), delta: null }))
    return [...stored, ...extra].sort((a, b) => compareBreadth(a.rule, b.rule))
  }, [rules, source.contextId, drafts])

  return <section className={styles.stack} aria-label="배치 적용 범위" data-testid="layout-option-stack">
    <div className={styles.picker}>
      <button type="button" className={styles.scopeBtn} aria-pressed={scope === 'layer'} disabled={fixedDisabled} onClick={() => onScope('layer')}>이 레이아웃</button>
      <button type="button" className={styles.scopeBtn} aria-pressed={scope === 'jamo'} disabled={fixedDisabled} onClick={onOpenPicker}>이 자모만</button>
      <span className={styles.hint}>전체는 기본값</span>
    </div>
    <div className={styles.head}><b>옵션</b> {entries.length}</div>
    <ul className={styles.list}>
      {entries.map(({ rule, key, delta }) => {
        // `전체`는 옛 저장분 자리라 고를 수 없다. 지우기 ×만 산다.
        const locked = isEmptyRule(rule)
        const on = draftKeys.includes(key)
        const jamo = (['initial', 'medial', 'final'] as const).flatMap((part) => rule[part]?.length === 1 ? [{ part, jamo: rule[part]![0] }] : [])[0]
        const name = stackLabel(rule, source.contextId)
        const lines = delta ? deltaSummary(delta, !jamo) : []
        return <li key={key} className={styles.opt} style={{ '--chip-color': ruleColor(rule) } as React.CSSProperties}
          data-testid={delta ? 'layout-override-card' : 'layout-scope-chip'}
          data-kind={locked ? 'all' : jamo ? 'jamo' : 'layer'}
          data-jamo={jamo?.jamo} data-group={jamo ? PART_OF_RULE_KEY[jamo.part] : undefined}
          data-selected={on || undefined} data-stored={delta ? 'true' : undefined}>
          <button type="button" className={styles.body} data-testid="layout-override-select" aria-label={name} aria-pressed={locked ? undefined : on} disabled={locked || fixedDisabled} onClick={() => onSelect(rule)}>
            {/* 머리 그림 = 그 규칙의 몬드리안. 범위 고르기 화면 머리와 같은 그림이다. */}
            <ScopeThumbnail rule={rule} contextId={source.contextId} size={26} />
            <span className={styles.bodyText}>
              <span className={styles.name}>
                <b>{name}</b>
                <em>{ruleGlyphCount(rule).toLocaleString()}자</em>
                {locked && <em>기본값</em>}
              </span>
              <small data-empty={lines.length === 0 || undefined}>
                {lines.length === 0 ? '아직 고친 것 없음' : `${lines[0]}${lines.length > 1 ? ` 외 ${lines.length - 1}` : ''}`}
              </small>
            </span>
          </button>
          {/* `더 보기` = 범위 고르기 화면. 표에서 이 범위를 다시 집는 자리다. `전체`는 고르는 범위가 아니라 없다. */}
          {!locked && onOpenScope && <button type="button" className={styles.more} aria-label={`${name} 범위 고르기`} disabled={fixedDisabled} onClick={() => onOpenScope(rule)} data-testid="layout-override-more">더 보기 ›</button>}
          {delta && <button type="button" className={styles.remove} aria-label={`${name} 오버라이드 지우기`} onClick={() => onRemove(rule)} data-testid="layout-override-remove">×</button>}
        </li>
      })}
    </ul>
  </section>
}

export { RULE_PART, PART_GROUP_LABEL, matchesRule }
