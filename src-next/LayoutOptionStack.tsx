import { useMemo } from 'react'
import { storedRules, useLayoutDeltaStore } from './layoutDeltaStore'
import { deltaSummary, partOfGroup } from './layoutOverrides'
import type { OverrideGroup } from './layoutOverrides'
import type { CorpusIdentity } from './notoCorpus'
import { PART_COLOR } from './partColors'
import { PART_GROUP_LABEL } from './reviewPropagation'
import { ScopeThumbnail } from './ScopeThumbnail'
import { compareBreadth, familyOfContext, finalOfContext, isEmptyRule, matchesRule, ruleGlyphCount, ruleKey, ruleName } from './scopeRule'
import type { ScopeRule } from './scopeRule'
import styles from './LayoutOptionStack.module.css'

/**
 * 적용 범위 = 옵션 박스 스택. 계약은 `docs/specs/적용범위-규칙식.md`.
 *
 * 박스 하나 = **범위 하나**다. `+ 범위 지정`으로 빈 범위를 만들어 두고(점선), 켜서 고치고, 적용하면 Δ가 붙는다(실선).
 * Δ가 없어도 박스는 남는다 — 여러 범위를 미리 세워 두고 하나씩 손보는 자리다(9/22).
 * 순서는 닿는 글자 수 내림차순이라 넓은 것이 위다 — `전체`(옛 저장분, 읽기 전용)가 있으면 늘 맨 위에 온다.
 * 이 레이아웃과 상관없는 규칙은 안 보인다. 조건 없는 규칙은 어디서나 보인다.
 * 아직 안 한 것: 넷 이상일 때 접기(표본 줄이 위로 간 뒤 남는 세로를 보고 정한다).
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

/**
 * 박스에 적는 이름. 박스가 이미 이 레이아웃 자리에 서 있으니 **칸 조건은 떼고** 좁힌 것만 남긴다.
 * 글자로 앞머리를 자르지 않는다 — `받침 ㄹ`처럼 자모 목록이 붙으면 앞머리 모양이 달라져 안 잘렸다.
 */
export function stackLabel(rule: ScopeRule, contextId: string): string {
  const short: ScopeRule = { ...rule }
  if (short.medialFamily?.length === 1 && short.medialFamily[0] === familyOfContext(contextId)) delete short.medialFamily
  if (short.hasFinal === finalOfContext(contextId)) delete short.hasFinal
  return isEmptyRule(short) ? '이 레이아웃' : ruleName(short)
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

export function LayoutOptionStack({ source, slots, selectedKey, baseKey, onAdd, onSelect, onRemove, onOpenScope }: {
  source: CorpusIdentity
  /** 저장된 Δ 없이 서 있는 박스들. 맨 앞은 늘 `이 레이아웃`(기본, 못 지움). */
  slots: ScopeRule[]
  /** 켠 박스. 이게 지금 범위다. */
  selectedKey: string
  /** `이 레이아웃` 기본 박스의 키. 이 박스는 ×가 없다. */
  baseKey: string
  /** `범위 지정` — 빈 범위 고르기 화면을 열어 새 박스를 만든다. */
  onAdd: () => void
  onSelect: (rule: ScopeRule) => void
  onRemove: (rule: ScopeRule) => void
  /** 박스의 `더 보기`. 그 박스의 범위를 고쳐 쓴다. */
  onOpenScope?: (rule: ScopeRule) => void
}) {
  const rules = useLayoutDeltaStore((state) => state.rules)
  const entries = useMemo<StackEntry[]>(() => {
    const stored = storedRules({ rules }).filter(({ rule }) => belongsHere(rule, source.contextId))
    const storedKeys = new Set(stored.map(({ key }) => key))
    const extra = slots.filter((rule) => !storedKeys.has(ruleKey(rule))).map((rule) => ({ rule, key: ruleKey(rule), delta: null }))
    return [...stored, ...extra].sort((a, b) => compareBreadth(a.rule, b.rule))
  }, [rules, source.contextId, slots])

  return <section className={styles.stack} aria-label="배치 적용 범위" data-testid="layout-option-stack">
    <div className={styles.head}>
      <span><b>옵션</b> {entries.length}</span>
      {/* 옵션 하나 = 범위 하나. 빈 범위로 만들어 두고 켜서 고친다. */}
      <button type="button" className={styles.add} onClick={onAdd} data-testid="layout-option-add">+ 범위 지정</button>
    </div>
    <ul className={styles.list}>
      {entries.map(({ rule, key, delta }) => {
        // `전체`는 옛 저장분 자리라 고를 수 없다. 지우기 ×만 산다.
        const locked = isEmptyRule(rule)
        const on = key === selectedKey
        // 기본 `이 레이아웃`과 옛 `전체`는 못 지운다. 나머지는 Δ가 있든 빈 슬롯이든 ×로 뺀다.
        const removable = !locked && key !== baseKey
        const jamo = (['initial', 'medial', 'final'] as const).flatMap((part) => rule[part]?.length === 1 ? [{ part, jamo: rule[part]![0] }] : [])[0]
        const name = locked ? '전체' : stackLabel(rule, source.contextId)
        const lines = delta ? deltaSummary(delta, !jamo) : []
        return <li key={key} className={styles.opt} style={{ '--chip-color': ruleColor(rule) } as React.CSSProperties}
          data-testid={delta ? 'layout-override-card' : 'layout-scope-chip'}
          data-kind={locked ? 'all' : jamo ? 'jamo' : 'layer'}
          data-jamo={jamo?.jamo} data-group={jamo ? PART_OF_RULE_KEY[jamo.part] : undefined}
          data-selected={on || undefined} data-stored={delta ? 'true' : undefined}>
          <button type="button" className={styles.body} data-testid="layout-override-select" aria-label={name} aria-pressed={locked ? undefined : on} disabled={locked} onClick={() => onSelect(rule)}>
            {/* 머리 그림 = 그 규칙의 몬드리안. 범위 고르기 화면 머리와 같은 그림이다. */}
            <ScopeThumbnail rule={rule} contextId={source.contextId} size={28} />
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
          {!locked && onOpenScope && <button type="button" className={styles.more} aria-label={`${name} 범위 고치기`} onClick={() => onOpenScope(rule)} data-testid="layout-override-more">›</button>}
          {removable
            ? <button type="button" className={styles.remove} aria-label={`${name} 오버라이드 지우기`} onClick={() => onRemove(rule)} data-testid="layout-override-remove">×</button>
            : <span className={styles.tailSpace} aria-hidden="true" />}
        </li>
      })}
    </ul>
  </section>
}

export { RULE_PART, PART_GROUP_LABEL, matchesRule }
