import { useMemo } from 'react'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { addContextBoxDelta, hasContextBoxDelta, isZeroFace } from '../src/services/contextBoxResolver'
import type { ContextBoxDelta, FaceDelta } from '../src/services/contextBoxResolver'
import type { ModelIdentity } from '../src/services/notoVariationModel'
import type { Part } from '../src/types'
import { compareBreadth, isEmptyRule, matchesRule, normalizeRule, ruleFromKey, ruleKey, ruleOfLegacy } from './scopeRule'
import type { ScopeRule } from './scopeRule'

/**
 * 배치 Δ 저장소. 자소 탭 레이아웃 모드에서 옮긴 기준선을 `적용`하면 여기 쌓이고,
 * 칸 해석(`useContextPlacement` → `resolveContextBoxes`)이 글자마다 읽어 모델 상자에 얹는다.
 *
 * **사용자 전용이다.** 프리셋이 자동으로 넣는 오버라이드(모델 예측, 승인 입력, 자모 `layoutIs`)는 여기 오지 않는다.
 * 키 모양은 같아도 저장은 따로 — 프리셋이 바뀌어도 사용자 Δ는 남고, 사용자 Δ가 프리셋으로 올라가지 않는다.
 *
 * 저장은 Δ만이다. 상자·rail 값은 모델 예측 + Δ의 파생값이라 저장하지 않는다.
 * 자리는 **범위 규칙식 하나**다(`scopeRule.ts`, 계약 `docs/specs/적용범위-규칙식.md`).
 * 옛 세 층(`all` · `layers` · `jamo`)은 읽을 때 규칙식으로 **옮긴다** — 호환이 아니라 이전이다.
 * 글자 하나의 유효 Δ = 닿는 규칙을 **넓은 것부터** 더한 것. 더하기는 순서가 없지만 변 고정(`{ at }`)은 좁은 쪽이 값을 교체한다.
 * 같은 범위에 다시 적용하면 더해진다(편집은 늘 현재 상자 기준 차이라서).
 */

export const LAYOUT_DELTA_STORAGE_KEY = 'noto-layout-delta-v1'

/** 자모 층 키. 옛 저장분을 읽을 때만 쓴다. */
export type JamoKey = `${'CH' | 'JU' | 'JO'}:${string}`
export const jamoPartOf = (part: Part): 'CH' | 'JU' | 'JO' => part === 'CH' ? 'CH' : part === 'JO' ? 'JO' : 'JU'
export const jamoKeyOf = (part: Part, jamo: string): JamoKey => `${jamoPartOf(part)}:${jamo}`

interface LayoutDeltaState extends LayoutDeltaSnapshot {
  /** Δ를 범위에 더한다. 0만 남는 항목은 지운다. */
  apply: (rule: ScopeRule, delta: ContextBoxDelta) => void
  /** 한 범위의 Δ를 비운다. */
  clear: (rule: ScopeRule) => void
  clearAll: () => void
  /** 저장된 Δ를 통째로 되돌린다. 자소 탭 Undo/Redo가 적용·지우기 앞뒤 스냅샷으로 부른다. */
  restore: (snapshot: LayoutDeltaSnapshot) => void
}

/** 저장되는 값 전부. 규칙식 키 → Δ. Δ가 작아서 Undo 기록에 통째로 넣는다. */
export interface LayoutDeltaSnapshot { rules: Record<string, ContextBoxDelta> }
export const layoutDeltaSnapshot = (): LayoutDeltaSnapshot => structuredClone({ rules: useLayoutDeltaStore.getState().rules })

/** 0(1e-12 아래)만 남은 부품·part 항목을 걷어 낸다. 비면 undefined. */
function pruned(delta: ContextBoxDelta): ContextBoxDelta | undefined {
  const faces: NonNullable<ContextBoxDelta['faces']> = {}
  for (const [part, offsets] of Object.entries(delta.faces ?? {})) {
    if (!offsets) continue
    // 고정(`{ at }`)은 늘 남기고, 더하기는 0이면 걷어 낸다.
    const kept = Object.fromEntries(Object.entries(offsets).filter(([, value]) => !isZeroFace(value as FaceDelta)))
    if (Object.keys(kept).length > 0) faces[part as keyof typeof faces] = kept
  }
  const medial: NonNullable<ContextBoxDelta['medial']> = {}
  for (const [part, rails] of Object.entries(delta.medial ?? {})) {
    if (!rails) continue
    const kept = Object.fromEntries(Object.entries(rails).filter(([, value]) => typeof value === 'number' && Math.abs(value) > 1e-12))
    if (Object.keys(kept).length > 0) medial[part as keyof typeof medial] = kept
  }
  const result: ContextBoxDelta = {}
  if (Object.keys(faces).length > 0) result.faces = faces
  if (Object.keys(medial).length > 0) result.medial = medial
  return Object.keys(result).length > 0 ? result : undefined
}

/** 맵에서 키 하나를 더하거나(빈 결과면 지우고) 돌려준다. 원본은 안 건드린다. */
function withEntry(map: Record<string, ContextBoxDelta>, key: string, next: ContextBoxDelta | undefined): Record<string, ContextBoxDelta> {
  const copy = { ...map }
  if (next) copy[key] = next
  else delete copy[key]
  return copy
}

export const useLayoutDeltaStore = create<LayoutDeltaState>()(persist((set) => ({
  rules: {},
  apply: (rule, delta) => set((state) => {
    const key = ruleKey(rule)
    return { rules: withEntry(state.rules, key, pruned(addContextBoxDelta(state.rules[key], delta))) }
  }),
  clear: (rule) => set((state) => ({ rules: withEntry(state.rules, ruleKey(rule), undefined) })),
  clearAll: () => set({ rules: {} }),
  restore: (snapshot) => set({ rules: structuredClone(snapshot.rules ?? {}) }),
}), {
  name: LAYOUT_DELTA_STORAGE_KEY,
  storage: createJSONStorage(() => localStorage),
  partialize: (state) => ({ rules: state.rules }),
  // 옛 저장분(`all` · `layers` · `jamo`)을 규칙식 자리로 옮긴다. 이미 옮긴 저장분은 그대로 읽는다.
  merge: (persisted, current) => ({ ...current, rules: rulesOfPersisted(persisted) }),
}))

/** localStorage에서 읽은 값 → 규칙식 맵. 옛 모양이면 옮기고, 같은 규칙으로 겹치면 더한다. */
export function rulesOfPersisted(persisted: unknown): Record<string, ContextBoxDelta> {
  const value = (persisted ?? {}) as Partial<LayoutDeltaSnapshot> & LegacySnapshot
  const rules: Record<string, ContextBoxDelta> = { ...(value.rules ?? {}) }
  const add = (rule: ScopeRule, delta: ContextBoxDelta | undefined) => {
    if (!delta || !hasContextBoxDelta(delta)) return
    const key = ruleKey(rule)
    const next = pruned(addContextBoxDelta(rules[key], delta))
    if (next) rules[key] = next
  }
  add({}, value.all)
  for (const [contextId, delta] of Object.entries(value.layers ?? {})) add(ruleOfLegacy('layer', contextId), delta)
  for (const [contextId, layer] of Object.entries(value.jamo ?? {})) {
    for (const [jamoKey, delta] of Object.entries(layer ?? {})) add(ruleOfLegacy('jamo', contextId, jamoKey), delta)
  }
  return rules
}
interface LegacySnapshot { all?: ContextBoxDelta; layers?: Record<string, ContextBoxDelta>; jamo?: Record<string, Record<string, ContextBoxDelta>> }

/** 저장된 규칙 전부를 넓은 것부터. 옵션 스택의 순서이자 Δ를 더하는 순서다. */
export function storedRules(snapshot: LayoutDeltaSnapshot): { rule: ScopeRule; key: string; delta: ContextBoxDelta }[] {
  return Object.entries(snapshot.rules)
    .map(([key, delta]) => ({ key, rule: ruleFromKey(key), delta }))
    .sort((a, b) => compareBreadth(a.rule, b.rule))
}

/** 글자 하나에 얹을 Δ = 닿는 규칙을 넓은 것부터 더한 것. 전부 비면 undefined. */
export function effectiveLayoutDelta(snapshot: LayoutDeltaSnapshot, identity: ModelIdentity | null | undefined): ContextBoxDelta | undefined {
  if (!identity?.contextId) return undefined
  // 누산 시작값은 undefined다 — `{}`부터 더하면 안 쓰는 `medial: {}`가 따라붙는다.
  const merged = storedRules(snapshot)
    .filter(({ rule }) => matchesRule(rule, identity))
    .reduce<ContextBoxDelta | undefined>((acc, { delta }) => addContextBoxDelta(acc, delta), undefined)
  return hasContextBoxDelta(merged) ? merged : undefined
}

/** 글자 하나의 유효 Δ를 구독한다. 스토어가 바뀔 때만 새 객체. */
export function useLayoutDelta(identity: ModelIdentity | null | undefined): ContextBoxDelta | undefined {
  const rules = useLayoutDeltaStore((state) => state.rules)
  return useMemo(() => effectiveLayoutDelta({ rules }, identity), [rules, identity])
}

/** 한 범위에 저장된 Δ. 옵션 박스의 `저장된 Δ` 표시용. */
export function useScopeDelta(rule: ScopeRule): ContextBoxDelta | undefined {
  const key = ruleKey(rule)
  const delta = useLayoutDeltaStore((state) => state.rules[key])
  return hasContextBoxDelta(delta) ? delta : undefined
}

/** 지금 저장소에 `전체`(조건 없는 규칙) Δ가 있나. 옛 저장분만 여기 온다. */
export const storedEmptyRuleDelta = (snapshot: LayoutDeltaSnapshot): ContextBoxDelta | undefined => {
  const delta = snapshot.rules[ruleKey({})]
  return hasContextBoxDelta(delta) ? delta : undefined
}

export { isEmptyRule, normalizeRule, ruleKey }
export type { ScopeRule }
