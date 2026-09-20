import { useMemo } from 'react'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { addContextBoxDelta, hasContextBoxDelta } from '../src/services/contextBoxResolver'
import type { ContextBoxDelta } from '../src/services/contextBoxResolver'
import type { PropagationScope } from './reviewPropagation'

/**
 * 배치 Δ 저장소. 검수 글자 화면에서 옮긴 기준선을 `적용`하면 여기 쌓이고,
 * 칸 해석(`useContextPlacement` → `resolveContextBoxes`)이 글자마다 읽어 모델 상자에 얹는다.
 *
 * 저장은 Δ만이다. 상자·rail 값은 모델 예측 + Δ의 파생값이라 저장하지 않는다.
 * 범위 둘: `all`(전체 글자), `layers[contextId]`(이 레이아웃 = 홀자 계열 right/bottom/mixed × 받침 유무, 6종).
 * 글자 하나의 유효 Δ = all + layers[contextId]. 같은 범위에 다시 적용하면 더해진다(편집은 늘 현재 상자 기준 차이라서).
 */

export const LAYOUT_DELTA_STORAGE_KEY = 'noto-layout-delta-v1'

interface LayoutDeltaState {
  all: ContextBoxDelta
  layers: Record<string, ContextBoxDelta>
  /** Δ를 범위에 더한다. 0만 남는 항목은 지운다. */
  apply: (scope: PropagationScope, contextId: string, delta: ContextBoxDelta) => void
  /** 한 범위의 Δ를 비운다. */
  clear: (scope: PropagationScope, contextId: string) => void
  clearAll: () => void
  /** 저장된 Δ를 통째로 되돌린다. 자소 탭 Undo/Redo가 적용·지우기 앞뒤 스냅샷으로 부른다. */
  restore: (snapshot: LayoutDeltaSnapshot) => void
}

/** 저장되는 값 전부. Δ가 작아서 Undo 기록에 통째로 넣는다. */
export interface LayoutDeltaSnapshot { all: ContextBoxDelta; layers: Record<string, ContextBoxDelta> }
export const layoutDeltaSnapshot = (): LayoutDeltaSnapshot => { const { all, layers } = useLayoutDeltaStore.getState(); return structuredClone({ all, layers }) }

/** 0(1e-12 아래)만 남은 부품·part 항목을 걷어 낸다. 비면 undefined. */
function pruned(delta: ContextBoxDelta): ContextBoxDelta | undefined {
  const faces: NonNullable<ContextBoxDelta['faces']> = {}
  for (const [part, offsets] of Object.entries(delta.faces ?? {})) {
    if (!offsets) continue
    const kept = Object.fromEntries(Object.entries(offsets).filter(([, value]) => typeof value === 'number' && Math.abs(value) > 1e-12))
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

export const useLayoutDeltaStore = create<LayoutDeltaState>()(persist((set) => ({
  all: {},
  layers: {},
  apply: (scope, contextId, delta) => set((state) => {
    if (scope === 'all') return { all: pruned(addContextBoxDelta(state.all, delta)) ?? {} }
    const next = pruned(addContextBoxDelta(state.layers[contextId], delta))
    const layers = { ...state.layers }
    if (next) layers[contextId] = next
    else delete layers[contextId]
    return { layers }
  }),
  clear: (scope, contextId) => set((state) => {
    if (scope === 'all') return { all: {} }
    const layers = { ...state.layers }
    delete layers[contextId]
    return { layers }
  }),
  clearAll: () => set({ all: {}, layers: {} }),
  restore: (snapshot) => set({ all: structuredClone(snapshot.all), layers: structuredClone(snapshot.layers) }),
}), {
  name: LAYOUT_DELTA_STORAGE_KEY,
  storage: createJSONStorage(() => localStorage),
  partialize: (state) => ({ all: state.all, layers: state.layers }),
}))

/** 글자 하나에 얹을 Δ = 전체 + 이 레이아웃. 둘 다 비면 undefined. */
export function effectiveLayoutDelta(state: Pick<LayoutDeltaState, 'all' | 'layers'>, contextId: string | null | undefined): ContextBoxDelta | undefined {
  if (!contextId) return undefined
  const merged = addContextBoxDelta(state.all, state.layers[contextId])
  return hasContextBoxDelta(merged) ? merged : undefined
}

/** 문맥 하나의 유효 Δ를 구독한다. 스토어가 바뀔 때만 새 객체. */
export function useLayoutDelta(contextId: string | null | undefined): ContextBoxDelta | undefined {
  const all = useLayoutDeltaStore((state) => state.all)
  const layers = useLayoutDeltaStore((state) => state.layers)
  return useMemo(() => effectiveLayoutDelta({ all, layers }, contextId), [all, layers, contextId])
}

/** 범위 하나에 저장된 Δ. 카드 머리의 `저장된 Δ` 표시용. */
export function useScopeDelta(scope: PropagationScope, contextId: string): ContextBoxDelta | undefined {
  const delta = useLayoutDeltaStore((state) => scope === 'all' ? state.all : state.layers[contextId])
  return hasContextBoxDelta(delta) ? delta : undefined
}
