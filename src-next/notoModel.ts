import { useEffect, useMemo, useState } from 'react'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { identityOfSyllable, resolveContextBoxes } from '../src/services/contextBoxResolver'
import type { ContextBoxResolution } from '../src/services/contextBoxResolver'
import type { GlyphInkPlacement } from '../src/services/notoGlyphXor'
import type { GlobalStyle } from '../src/stores/globalStyleStore'
import type { DecomposedSyllable, LayoutSchema } from '../src/types'
import { useLayoutDelta } from './layoutDeltaStore'
import { notoPresetGlyphs } from './notoPresetGlyphs'
import type { NotoPresetModelBundle } from './notoPresetGlyphs'

/**
 * 변화량 모델 묶음을 앱 전체가 나눠 쓴다. 읽기는 한 번(IndexedDB 캐시), 화면은 훅으로 구독한다.
 * 상자 배치(`useContextPlacement`)는 모델이 있고 스위치가 켜져 있을 때만 모델 상자를 주고,
 * 아니면 null을 주어 호출자가 split/padding 스키마로 돌아간다.
 */

let shared: Promise<NotoPresetModelBundle> | undefined
function sharedModel(): Promise<NotoPresetModelBundle> {
  shared ??= notoPresetGlyphs.model().catch((error: unknown) => { shared = undefined; throw error })
  return shared
}

export function useNotoModel(): { bundle: NotoPresetModelBundle | null; error: string } {
  const [state, setState] = useState<{ bundle: NotoPresetModelBundle | null; error: string }>({ bundle: null, error: '' })
  useEffect(() => {
    let alive = true
    sharedModel()
      .then((bundle) => { if (alive) setState({ bundle, error: '' }) })
      .catch((failure: Error) => { if (alive) setState({ bundle: null, error: failure.message }) })
    return () => { alive = false }
  }, [])
  return state
}

interface PlacementState {
  /** Noto 모델 상자로 글자를 배치할지. 끄면 split/padding 스키마. */
  notoPlacement: boolean
  setNotoPlacement: (value: boolean) => void
}

export const usePlacementStore = create<PlacementState>()(persist((set) => ({
  notoPlacement: true,
  setNotoPlacement: (value) => set({ notoPlacement: value }),
}), { name: 'noto-placement-v1', storage: createJSONStorage(() => localStorage) }))

export type GlyphPlacement = GlyphInkPlacement

/**
 * 한 글자의 배치. 모델 상자가 완전히 풀리면 boxes, 아니면 schema.
 * 모델 상자는 획 두께(전역 캡)에 맞춰 다듬으므로 전역 스타일을 받고,
 * 검수 화면에서 저장한 배치 Δ(`layoutDeltaStore`, 전체 + 이 레이아웃)를 문맥별로 얹는다.
 */
export function useContextPlacement(syllable: DecomposedSyllable, schema: LayoutSchema, globalStyle: Pick<GlobalStyle, 'linecap' | 'linejoin'>): { placement: GlyphPlacement; resolution: ContextBoxResolution | null } {
  const { bundle } = useNotoModel()
  const enabled = usePlacementStore((state) => state.notoPlacement)
  const identity = useMemo(() => enabled && bundle ? identityOfSyllable(syllable) : null, [enabled, bundle, syllable])
  const delta = useLayoutDelta(identity?.contextId)
  return useMemo(() => {
    const resolution = identity && bundle ? resolveContextBoxes({ identity, model: bundle, syllable, ends: { linecap: globalStyle.linecap, linejoin: globalStyle.linejoin }, delta }) : null
    if (resolution?.complete) return { placement: { kind: 'boxes', boxes: resolution.boxes }, resolution }
    return { placement: { kind: 'schema', schema }, resolution }
  }, [bundle, identity, syllable, schema, globalStyle.linecap, globalStyle.linejoin, delta])
}
