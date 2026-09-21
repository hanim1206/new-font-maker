import { useEffect, useMemo, useState } from 'react'
import { identityOfSyllable, resolveContextBoxes } from '../src/services/contextBoxResolver'
import type { ContextBoxDelta, ContextBoxResolution } from '../src/services/contextBoxResolver'
import type { GlyphInkPlacement } from '../src/services/notoGlyphXor'
import type { ModelIdentity } from '../src/services/notoVariationModel'
import type { GlobalStyle } from '../src/stores/globalStyleStore'
import type { DecomposedSyllable, LayoutSchema } from '../src/types'
import { useLayoutDelta } from './layoutDeltaStore'
import { notoPresetGlyphs } from './notoPresetGlyphs'
import type { NotoPresetModelBundle } from './notoPresetGlyphs'

/**
 * 변화량 모델 묶음을 앱 전체가 나눠 쓴다. 읽기는 한 번(IndexedDB 캐시), 화면은 훅으로 구독한다.
 * 상자 배치(`useContextPlacement`)는 모델이 글자를 완전히 풀 때만 모델 상자를 주고,
 * 아니면 호출자가 split/padding 스키마로 돌아간다.
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

export type GlyphPlacement = GlyphInkPlacement

/** 모델 묶음을 기다린다. OTF 추출처럼 훅 밖에서 화면과 같은 상자가 필요한 곳이 쓴다. */
export const loadNotoModel = (): Promise<NotoPresetModelBundle> => sharedModel()

/**
 * 한 글자의 배치 규칙 하나. 모델 상자가 완전히 풀리면 boxes, 아니면 schema.
 * 화면(`useContextPlacement`)과 OTF 추출(`fontExportStore`)이 이 함수를 같이 써서 둘이 갈라지지 않는다.
 */
export function contextPlacementOf(input: {
  bundle: NotoPresetModelBundle | null
  identity: ModelIdentity | null
  syllable: DecomposedSyllable
  schema: LayoutSchema
  ends: Pick<GlobalStyle, 'linecap' | 'linejoin'>
  delta: ContextBoxDelta | undefined
}): { placement: GlyphPlacement; resolution: ContextBoxResolution | null } {
  const { bundle, identity, syllable, schema, ends, delta } = input
  const resolution = identity && bundle ? resolveContextBoxes({ identity, model: bundle, syllable, ends: { linecap: ends.linecap, linejoin: ends.linejoin }, delta }) : null
  if (resolution?.complete) return { placement: { kind: 'boxes', boxes: resolution.boxes }, resolution }
  return { placement: { kind: 'schema', schema }, resolution }
}

/**
 * 한 글자의 배치를 구독한다.
 * 모델 상자는 획 두께(전역 캡)에 맞춰 다듬으므로 전역 스타일을 받고,
 * 레이아웃 모드에서 저장한 배치 Δ(`layoutDeltaStore`, 전체 + 이 레이아웃 + 자모 층)를 글자별로 얹는다.
 */
export function useContextPlacement(syllable: DecomposedSyllable, schema: LayoutSchema, globalStyle: Pick<GlobalStyle, 'linecap' | 'linejoin'>): { placement: GlyphPlacement; resolution: ContextBoxResolution | null } {
  const { bundle } = useNotoModel()
  const identity = useMemo(() => bundle ? identityOfSyllable(syllable) : null, [bundle, syllable])
  const delta = useLayoutDelta(identity)
  return useMemo(
    () => contextPlacementOf({ bundle, identity, syllable, schema, ends: { linecap: globalStyle.linecap, linejoin: globalStyle.linejoin }, delta }),
    [bundle, identity, syllable, schema, globalStyle.linecap, globalStyle.linejoin, delta],
  )
}
