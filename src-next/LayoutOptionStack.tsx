import { useMemo } from 'react'
import { storedRules, useLayoutDeltaStore } from './layoutDeltaStore'
import { deltaPartCounts, deltaSummary, partOfGroup } from './layoutOverrides'
import type { OverrideGroup } from './layoutOverrides'
import type { CorpusIdentity } from './notoCorpus'
import { PART_COLOR } from './partColors'
import { PART_GROUP_LABEL } from './reviewPropagation'
import { ScopeThumbnail } from './ScopeThumbnail'
import { compareBreadth, familyOfContext, finalOfContext, isEmptyRule, jamoPhrase, matchesRule, ruleGlyphCount, ruleKey, ruleName } from './scopeRule'
import type { RuleJamoPart, ScopeRule } from './scopeRule'
import styles from './LayoutOptionStack.module.css'

/**
 * 적용 범위 = 옵션 박스 스택. 계약은 `docs/specs/적용범위-규칙식.md`.
 *
 * 박스 하나 = **범위 하나**다. `옵션 추가`로 빈 범위를 만들어 두고, 켜서 고치고, 적용하면 Δ가 붙는다.
 * Δ가 없어도 박스는 남는다 — 여러 범위를 미리 세워 두고 하나씩 손보는 자리다(9/22).
 * 순서는 **좁은 것이 위**다(9/22 뒤집힘). 좁힌 범위가 위에 쌓이고, 바닥인 `이 레이아웃`은 `기본` 머리글 아래에 선다.
 * 옛 `전체`(읽기 전용)가 있으면 가장 넓으니 맨 아래다. Δ를 더하는 순서(`compareBreadth`, 넓은 것부터)는 그대로다.
 * 박스는 카드가 아니라 **줄**이다(테두리·그림자 없음). 고르기는 줄 앞의 라디오가 말하고(하나만 켜진다) 켠 줄만 옅은 파란 면이 깔린다. 범위 고치기(연필)와 지우기(×)도 켠 줄에만 선다 — 박스 전체가 누르는 자리라 꺼진 박스 옆의 ×는 잘못 눌린다.
 * 이 레이아웃과 상관없는 규칙은 안 보인다. 조건 없는 규칙은 어디서나 보인다.
 * 아직 안 한 것: 넷 이상일 때 `이 글자 / 전체` 거르기.
 */

const RULE_PART = { CH: 'initial', JU: 'medial', JO: 'final' } as const
const PART_OF_RULE_KEY: Record<RuleJamoPart, OverrideGroup> = { initial: 'CH', medial: 'JU', final: 'JO' }
const RULE_PARTS = ['initial', 'medial', 'final'] as const

/** 이 문맥 화면에 보일 규칙인가. 조건 없는 것은 어디서나, 나머지는 이 문맥을 품을 때만. */
function belongsHere(rule: ScopeRule, contextId: string): boolean {
  if (isEmptyRule(rule)) return true
  if (rule.medialFamily && !rule.medialFamily.includes(familyOfContext(contextId))) return false
  if (rule.hasFinal !== undefined && rule.hasFinal !== finalOfContext(contextId)) return false
  return true
}

/** 박스가 이미 이 레이아웃 자리에 서 있으니 **칸 조건은 떼고** 좁힌 것만 남긴다. */
function narrowedOf(rule: ScopeRule, contextId: string): ScopeRule {
  const short: ScopeRule = { ...rule }
  if (short.medialFamily?.length === 1 && short.medialFamily[0] === familyOfContext(contextId)) delete short.medialFamily
  if (short.hasFinal === finalOfContext(contextId)) delete short.hasFinal
  return short
}

/**
 * 박스의 이름(읽어 주는 말). 화면에는 같은 내용을 부품 알약으로 나눠 적는다.
 * 글자로 앞머리를 자르지 않는다 — `받침 ㄹ`처럼 자모 목록이 붙으면 앞머리 모양이 달라져 안 잘렸다.
 */
export function stackLabel(rule: ScopeRule, contextId: string): string {
  const short = narrowedOf(rule, contextId)
  return isEmptyRule(short) ? '이 레이아웃' : ruleName(short)
}

const PencilIcon = () => <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10.6 2.9l2.5 2.5L5.6 12.9l-3.1.6.6-3.1z" /><path d="M9.2 4.3l2.5 2.5" /></svg>
const CheckIcon = () => <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 8.4 6.9 11.2 12 5.4" /></svg>
const CloseIcon = () => <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" /></svg>

export interface StackEntry { rule: ScopeRule; key: string; delta: ReturnType<typeof storedRules>[number]['delta'] | null }

export function LayoutOptionStack({ source, slots, selectedKey, baseKey, onAdd, onSelect, onRemove, onOpenScope }: {
  source: CorpusIdentity
  /** 저장된 Δ 없이 서 있는 박스들. 맨 앞은 늘 `이 레이아웃`(기본, 못 지움). */
  slots: ScopeRule[]
  /** 켠 박스. 이게 지금 범위다. */
  selectedKey: string
  /** `이 레이아웃` 기본 박스의 키. 이 박스는 ×가 없다. */
  baseKey: string
  /** `옵션 추가` — 빈 범위 고르기 화면을 열어 새 박스를 만든다. */
  onAdd: () => void
  onSelect: (rule: ScopeRule) => void
  onRemove: (rule: ScopeRule) => void
  /** 켠 박스의 연필. 그 박스의 범위를 고쳐 쓴다. */
  onOpenScope?: (rule: ScopeRule) => void
}) {
  const rules = useLayoutDeltaStore((state) => state.rules)
  const entries = useMemo<StackEntry[]>(() => {
    const stored = storedRules({ rules }).filter(({ rule }) => belongsHere(rule, source.contextId))
    const storedKeys = new Set(stored.map(({ key }) => key))
    const extra = slots.filter((rule) => !storedKeys.has(ruleKey(rule))).map((rule) => ({ rule, key: ruleKey(rule), delta: null }))
    // 좁은 것이 위. Δ를 더하는 순서(넓은 것부터)를 화면에서만 뒤집는다.
    return [...stored, ...extra].sort((a, b) => compareBreadth(b.rule, a.rule))
  }, [rules, source.contextId, slots])
  // 바닥 = `이 레이아웃`과 옛 `전체`. 좁힌 범위와 갈라 `기본` 줄 아래에 둔다.
  const isFloor = ({ rule, key }: StackEntry) => key === baseKey || isEmptyRule(rule)
  const narrowed = entries.filter((entry) => !isFloor(entry))
  const floor = entries.filter(isFloor)

  const renderEntry = ({ rule, key, delta }: StackEntry, base: boolean) => {
    // `전체`는 옛 저장분 자리라 고를 수 없다.
    const locked = isEmptyRule(rule)
    const on = key === selectedKey
    // 기본 `이 레이아웃`과 옛 `전체`는 못 지운다. 나머지는 Δ가 있든 빈 슬롯이든 ×로 뺀다.
    const removable = !locked && key !== baseKey
    const jamo = RULE_PARTS.flatMap((part) => rule[part]?.length === 1 ? [{ part, jamo: rule[part]![0] }] : [])[0]
    const name = locked ? '전체' : stackLabel(rule, source.contextId)
    const short = narrowedOf(rule, source.contextId)
    // 칸 조건이 덜 떨어진 규칙(계열 둘 이상 등)은 그 말을 중립 알약으로 앞에 세운다.
    const headRule: ScopeRule = { medialFamily: short.medialFamily, hasFinal: short.hasFinal }
    const pills = RULE_PARTS.flatMap((part) => short[part]?.length ? [{ part, text: jamoPhrase(short[part]!) }] : [])
    const lines = delta ? deltaSummary(delta, !jamo) : []
    const counts = delta ? deltaPartCounts(delta) : []
    return <li key={key} className={styles.opt}
      data-testid={delta ? 'layout-override-card' : 'layout-scope-chip'}
      data-kind={locked ? 'all' : jamo ? 'jamo' : 'layer'} data-base={base || undefined}
      data-jamo={jamo?.jamo} data-group={jamo ? PART_OF_RULE_KEY[jamo.part] : undefined}
      data-selected={on || undefined} data-stored={delta ? 'true' : undefined}>
      <button type="button" className={styles.body} data-testid="layout-override-select" aria-label={name} aria-pressed={locked ? undefined : on} disabled={locked} onClick={() => onSelect(rule)}>
        {/* 앞머리 라디오 = 지금 범위. 옛 `전체`는 고를 수 없어 라디오가 없다. */}
        {!locked && <span className={styles.radio} data-on={on || undefined} aria-hidden="true">{on && <CheckIcon />}</span>}
        {/* 머리 그림 = 그 규칙의 몬드리안. 범위 고르기 화면 머리와 같은 그림이다. */}
        <span className={styles.thumb}>
          <ScopeThumbnail rule={rule} contextId={source.contextId} size={base ? 22 : 28} />
        </span>
        <span className={styles.bodyText}>
          <span className={styles.name}>
            {pills.length === 0 || locked
              ? <b>{name}</b>
              : <>
                {!isEmptyRule(headRule) && <span className={styles.pill} data-neutral="true">{ruleName(headRule)}</span>}
                {pills.map(({ part, text }, index) => <span key={part} className={styles.pillWrap}>
                  {(index > 0 || !isEmptyRule(headRule)) && <i className={styles.times} aria-hidden="true">×</i>}
                  <span className={styles.pill} style={{ '--part-color': PART_COLOR[partOfGroup[PART_OF_RULE_KEY[part]]] } as React.CSSProperties}>
                    <span className={styles.pillPart}>{PART_GROUP_LABEL[PART_OF_RULE_KEY[part]]}</span>{text}
                  </span>
                </span>)}
              </>}
            <em>{ruleGlyphCount(rule).toLocaleString()}자</em>
            {locked && <em>기본값</em>}
          </span>
          {/* 둘째 줄 = 부품마다 몇 군데 고쳤나. 값은 `title`과 읽어 주는 말에만 싣는다. */}
          <small data-empty={counts.length === 0 || undefined} title={lines.join(' · ') || undefined}>
            {counts.length === 0
              ? '아직 고친 것 없음'
              : <>
                {counts.map(({ group, count }) => <span key={group} className={styles.dot} style={{ '--part-color': PART_COLOR[partOfGroup[group]] } as React.CSSProperties} aria-hidden="true">
                  <i />{PART_GROUP_LABEL[group]} <u>{count}</u>
                </span>)}
                <span className={styles.srOnly}>{lines.join(', ')}</span>
              </>}
          </small>
        </span>
      </button>
      {/* 연필 = 범위 고르기 화면(이 범위를 다시 집는다), × = 지우기. 둘 다 켠 박스에만 선다. */}
      {on && !locked && onOpenScope && <button type="button" className={styles.tool} aria-label={`${name} 범위 고치기`} onClick={() => onOpenScope(rule)} data-testid="layout-override-more"><PencilIcon /></button>}
      {on && removable && <button type="button" className={styles.tool} aria-label={`${name} 오버라이드 지우기`} onClick={() => onRemove(rule)} data-testid="layout-override-remove"><CloseIcon /></button>}
    </li>
  }

  return <section className={styles.stack} aria-label="배치 적용 범위" data-testid="layout-option-stack">
    {/* 옵션 하나 = 범위 하나. 빈 범위로 만들어 두고 켜서 고친다. 박스와 같은 폭으로 맨 위에 선다. */}
    <button type="button" className={styles.add} onClick={onAdd} data-testid="layout-option-add"><span aria-hidden="true">+</span> 옵션 추가</button>
    {narrowed.length > 0 && <ul className={styles.list}>{narrowed.map((entry) => renderEntry(entry, false))}</ul>}
    {narrowed.length > 0 && <div className={styles.floorLabel} aria-hidden="true">기본</div>}
    <ul className={styles.floor}>{floor.map((entry) => renderEntry(entry, true))}</ul>
  </section>
}

export { RULE_PART, PART_GROUP_LABEL, matchesRule }
