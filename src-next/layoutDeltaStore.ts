import { useMemo } from 'react'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { addContextBoxDelta, hasContextBoxDelta, isZeroFace } from '../src/services/contextBoxResolver'
import type { ContextBoxDelta, FaceDelta } from '../src/services/contextBoxResolver'
import type { ModelIdentity } from '../src/services/notoVariationModel'
import type { Part } from '../src/types'

/**
 * 배치 Δ 저장소. 자소 탭 레이아웃 모드에서 옮긴 기준선을 `적용`하면 여기 쌓이고,
 * 칸 해석(`useContextPlacement` → `resolveContextBoxes`)이 글자마다 읽어 모델 상자에 얹는다.
 *
 * **사용자 전용이다.** 프리셋이 자동으로 넣는 오버라이드(모델 예측, 승인 입력, 자모 `layoutIs`)는 여기 오지 않는다.
 * 키 모양은 같아도 저장은 따로 — 프리셋이 바뀌어도 사용자 Δ는 남고, 사용자 Δ가 프리셋으로 올라가지 않는다.
 *
 * 저장은 Δ만이다. 상자·rail 값은 모델 예측 + Δ의 파생값이라 저장하지 않는다.
 * 범위 셋(넓은 것부터):
 * - `all` 전체 글자
 * - `layers[contextId]` 이 레이아웃 = 홀자 계열 right/bottom/mixed × 받침 유무, 6종
 * - `jamo[contextId][part:자모]` 이 레이아웃에서 그 부품이 그 자모인 글자. 예 `right-final` → `CH:ㄱ`
 * 글자 하나의 유효 Δ = 셋을 넓은 것부터 합친 것. 더하기는 순서가 없지만 변 고정(`{ at }`)은 좁은 층이 넓은 층 값을 교체한다.
 * 같은 범위에 다시 적용하면 더해진다(편집은 늘 현재 상자 기준 차이라서).
 */

export const LAYOUT_DELTA_STORAGE_KEY = 'noto-layout-delta-v1'

/** 배치 Δ를 퍼뜨릴 범위. 기본 `이 레이아웃`, `이 자모만`은 좁힐 때, `전체`는 일부러 넓힐 때. */
export type PropagationScope = 'layer' | 'jamo' | 'all'

/** 자모 층 키. 부품 묶음(CH/JU/JO)과 자모. 혼합 홀자도 홀자 하나로 본다(`JU:ㅘ`). */
export type JamoKey = `${'CH' | 'JU' | 'JO'}:${string}`
export const jamoPartOf = (part: Part): 'CH' | 'JU' | 'JO' => part === 'CH' ? 'CH' : part === 'JO' ? 'JO' : 'JU'
export const jamoKeyOf = (part: Part, jamo: string): JamoKey => `${jamoPartOf(part)}:${jamo}`
/** 글자 하나가 받는 자모 층 키. 받침 없으면 둘. */
export const jamoKeysOf = (identity: Pick<ModelIdentity, 'initialJamo' | 'medialJamo' | 'finalJamo'>): JamoKey[] => [
  jamoKeyOf('CH', identity.initialJamo), jamoKeyOf('JU', identity.medialJamo), ...(identity.finalJamo ? [jamoKeyOf('JO', identity.finalJamo)] : []),
]

/** 적용·지우기가 가리키는 자리. `jamo`는 여러 키에 같은 Δ를 각각 쓴다(나중에 하나만 지울 수 있게). */
export type LayoutDeltaTarget =
  | { scope: 'all' }
  | { scope: 'layer'; contextId: string }
  | { scope: 'jamo'; contextId: string; jamos: JamoKey[] }

interface LayoutDeltaState extends LayoutDeltaSnapshot {
  /** Δ를 범위에 더한다. 0만 남는 항목은 지운다. */
  apply: (target: LayoutDeltaTarget, delta: ContextBoxDelta) => void
  /** 한 범위의 Δ를 비운다. */
  clear: (target: LayoutDeltaTarget) => void
  clearAll: () => void
  /** 저장된 Δ를 통째로 되돌린다. 자소 탭 Undo/Redo가 적용·지우기 앞뒤 스냅샷으로 부른다. */
  restore: (snapshot: LayoutDeltaSnapshot) => void
}

/** 저장되는 값 전부. Δ가 작아서 Undo 기록에 통째로 넣는다. */
export interface LayoutDeltaSnapshot { all: ContextBoxDelta; layers: Record<string, ContextBoxDelta>; jamo: Record<string, Record<string, ContextBoxDelta>> }
export const layoutDeltaSnapshot = (): LayoutDeltaSnapshot => { const { all, layers, jamo } = useLayoutDeltaStore.getState(); return structuredClone({ all, layers, jamo }) }

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

/** 문맥 하나의 자모 층을 바꾼다. 비면 문맥 항목째 지운다. */
function withJamoLayer(jamo: LayoutDeltaSnapshot['jamo'], contextId: string, change: (layer: Record<string, ContextBoxDelta>) => Record<string, ContextBoxDelta>): LayoutDeltaSnapshot['jamo'] {
  const next = change(jamo[contextId] ?? {})
  const copy = { ...jamo }
  if (Object.keys(next).length > 0) copy[contextId] = next
  else delete copy[contextId]
  return copy
}

export const useLayoutDeltaStore = create<LayoutDeltaState>()(persist((set) => ({
  all: {},
  layers: {},
  jamo: {},
  apply: (target, delta) => set((state) => {
    if (target.scope === 'all') return { all: pruned(addContextBoxDelta(state.all, delta)) ?? {} }
    if (target.scope === 'layer') return { layers: withEntry(state.layers, target.contextId, pruned(addContextBoxDelta(state.layers[target.contextId], delta))) }
    return { jamo: withJamoLayer(state.jamo, target.contextId, (layer) => target.jamos.reduce((acc, key) => withEntry(acc, key, pruned(addContextBoxDelta(acc[key], delta))), layer)) }
  }),
  clear: (target) => set((state) => {
    if (target.scope === 'all') return { all: {} }
    if (target.scope === 'layer') return { layers: withEntry(state.layers, target.contextId, undefined) }
    return { jamo: withJamoLayer(state.jamo, target.contextId, (layer) => target.jamos.reduce((acc, key) => withEntry(acc, key, undefined), layer)) }
  }),
  clearAll: () => set({ all: {}, layers: {}, jamo: {} }),
  restore: (snapshot) => set({ all: structuredClone(snapshot.all), layers: structuredClone(snapshot.layers), jamo: structuredClone(snapshot.jamo ?? {}) }),
}), {
  name: LAYOUT_DELTA_STORAGE_KEY,
  storage: createJSONStorage(() => localStorage),
  partialize: (state) => ({ all: state.all, layers: state.layers, jamo: state.jamo }),
  // 자모 층이 생기기 전 저장분(`jamo` 없음)도 그대로 읽는다.
  merge: (persisted, current) => ({ ...current, ...(persisted as Partial<LayoutDeltaSnapshot>), jamo: (persisted as Partial<LayoutDeltaSnapshot>)?.jamo ?? {} }),
}))

/** 글자 하나에 얹을 Δ = 전체 + 이 레이아웃 + 부품별 자모 층. 전부 비면 undefined. */
export function effectiveLayoutDelta(state: Pick<LayoutDeltaState, 'all' | 'layers' | 'jamo'>, identity: ModelIdentity | null | undefined): ContextBoxDelta | undefined {
  if (!identity?.contextId) return undefined
  const jamoLayer = state.jamo[identity.contextId]
  const merged = jamoKeysOf(identity).reduce((acc, key) => addContextBoxDelta(acc, jamoLayer?.[key]), addContextBoxDelta(state.all, state.layers[identity.contextId]))
  return hasContextBoxDelta(merged) ? merged : undefined
}

/** 글자 하나의 유효 Δ를 구독한다. 스토어가 바뀔 때만 새 객체. */
export function useLayoutDelta(identity: ModelIdentity | null | undefined): ContextBoxDelta | undefined {
  const all = useLayoutDeltaStore((state) => state.all)
  const layers = useLayoutDeltaStore((state) => state.layers)
  const jamo = useLayoutDeltaStore((state) => state.jamo)
  return useMemo(() => effectiveLayoutDelta({ all, layers, jamo }, identity), [all, layers, jamo, identity])
}

/** 한 자리에 저장된 Δ. 카드 머리의 `저장된 Δ` 표시용. 자모 범위는 고른 자모 중 하나라도 있으면. */
export function useScopeDelta(target: LayoutDeltaTarget): ContextBoxDelta | undefined {
  const delta = useLayoutDeltaStore((state) => target.scope === 'all' ? state.all : target.scope === 'layer' ? state.layers[target.contextId] : target.jamos.map((key) => state.jamo[target.contextId]?.[key]).find(hasContextBoxDelta))
  return hasContextBoxDelta(delta) ? delta : undefined
}
