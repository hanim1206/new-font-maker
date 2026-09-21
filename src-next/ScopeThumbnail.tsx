import { useMemo } from 'react'
import { resolveContextBoxes } from '../src/services/contextBoxResolver'
import type { Part } from '../src/types'
import { effectiveLayoutDelta, useLayoutDeltaStore } from './layoutDeltaStore'
import { corpusIdentity } from './notoCorpus'
import { useNotoModel } from './notoModel'
import { PART_COLOR } from './partColors'
import { layoutSampleCharOf } from './reviewPropagation'
import { contextIdOfRule } from './scopePicker'
import type { ScopeRule } from './scopeRule'

/**
 * 규칙 하나의 몬드리안 썸네일. 옵션 박스 머리와 범위 고르기 화면 머리가 같은 그림을 쓴다.
 * 칸은 그 규칙의 계열·받침으로 고르고(조건이 없으면 지금 글자의 칸), 자모 조건이 붙은 부품만 진하게 칠한다.
 * 상자는 `LayoutContextCards`와 같은 길로 푼다 — 칸 대표 글자의 모델 상자 + 저장된 Δ.
 */

const VIEW_BOX = '-0.08 -0.08 1.16 1.16'
const PART_ORDER: Part[] = ['CH', 'JU', 'JU_H', 'JU_V', 'JO']

/** 자모 조건이 붙은 부품. 진하게 칠할 자리다. */
const strongPartOf = (rule: ScopeRule): Part | null =>
  rule.initial?.length ? 'CH' : rule.medial?.length ? 'JU' : rule.final?.length ? 'JO' : null

export function ScopeThumbnail({ rule, contextId, size = 28 }: { rule: ScopeRule; contextId: string; size?: number }) {
  const { bundle } = useNotoModel()
  const rules = useLayoutDeltaStore((state) => state.rules)
  const target = contextIdOfRule(rule, contextId)
  const boxes = useMemo(() => {
    if (!bundle) return []
    const identity = corpusIdentity(layoutSampleCharOf(target).codePointAt(0)!)
    const resolved = resolveContextBoxes({ identity, model: bundle, delta: effectiveLayoutDelta({ rules }, identity) }).boxes
    return PART_ORDER.flatMap((part) => resolved[part] ? [{ part, box: resolved[part]! }] : [])
  }, [bundle, rules, target])
  const strong = strongPartOf(rule)
  const samePart = (part: Part) => strong === 'JU' ? part === 'JU' || part === 'JU_H' || part === 'JU_V' : part === strong
  return <svg width={size} height={size} viewBox={VIEW_BOX} role="img" aria-hidden="true" data-testid="scope-thumbnail" data-context={target} style={{ borderRadius: 4, background: '#fff', flex: '0 0 auto' }}>
    {boxes.map(({ part, box }) => <rect key={part} x={box.x} y={box.y} width={box.width} height={box.height} fill={PART_COLOR[part]} fillOpacity={!strong || samePart(part) ? 1 : 0.28} />)}
  </svg>
}
