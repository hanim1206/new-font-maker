import { useEffect, useMemo, useState } from 'react'
import { identityOfSyllable, resolveContextBoxes } from '../src/services/contextBoxResolver'
import type { ContextBoxDelta, ContextBoxResolution } from '../src/services/contextBoxResolver'
import { isReferenceBody, mapBoxToDesignBody, mapFacesToDesignBody } from '../src/services/designBodyPlacement'
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

/** 무거운 쪽: 모델 상자를 풀고 획에 맞춰 다듬는다(잉크 합치기 여러 번). 기본 네모꼴(850) 기준 좌표이고 네모꼴 여백과는 무관하다. */
function resolveReferenceBoxes(input: {
  bundle: NotoPresetModelBundle | null
  identity: ModelIdentity | null
  syllable: DecomposedSyllable
  ends: Pick<GlobalStyle, 'linecap' | 'linejoin'>
  delta: ContextBoxDelta | undefined
}): ContextBoxResolution | null {
  const { bundle, identity, syllable, ends, delta } = input
  return identity && bundle ? resolveContextBoxes({ identity, model: bundle, syllable, ends: { linecap: ends.linecap, linejoin: ends.linejoin }, delta }) : null
}

/** 가벼운 쪽: 모델 상자와 레이아웃 Δ는 기본 네모꼴 기준이라, 사용자 네모꼴은 맨 끝에 한 번 얹는다(선형 변환). 화면과 OTF가 여기를 같이 지나므로 둘이 안 갈라진다. */
function resolvePlacementBoxes(reference: ContextBoxResolution | null, padding: LayoutSchema['padding'] | undefined): { reference: ContextBoxResolution | null; resolution: ContextBoxResolution | null } {
  return { reference, resolution: reference && !isReferenceBody(padding) ? inDesignBody(reference, padding) : reference }
}

type PlacementResult = { placement: GlyphPlacement; resolution: ContextBoxResolution | null; referencePlacement: GlyphPlacement }

/** 가벼운 쪽: 풀린 상자를 렌더러가 받는 모양으로 싼다. `referencePlacement`는 네모꼴을 얹기 전 자리다 — Noto 고스트(기준 틀 좌표)와 견줄 때만 쓴다. */
function placementResultOf(resolved: ReturnType<typeof resolvePlacementBoxes>, schema: LayoutSchema): PlacementResult {
  const { reference, resolution } = resolved
  if (resolution?.complete && reference) return { placement: { kind: 'boxes', boxes: resolution.boxes }, resolution, referencePlacement: { kind: 'boxes', boxes: reference.boxes } }
  return { placement: { kind: 'schema', schema }, resolution, referencePlacement: { kind: 'schema', schema } }
}

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
}): PlacementResult {
  return placementResultOf(resolvePlacementBoxes(resolveReferenceBoxes(input), input.schema.padding), input.schema)
}

/**
 * 한 글자의 배치를 구독한다.
 * 모델 상자는 획 두께(전역 캡)에 맞춰 다듬으므로 전역 스타일을 받고,
 * 레이아웃 모드에서 저장한 배치 Δ(`layoutDeltaStore`, 전체 + 이 레이아웃 + 자모 층)를 글자별로 얹는다.
 *
 * 부르는 쪽은 `syllable`과 `schema`를 렌더마다 새 객체로 만들어 넘긴다(분해 · 여백 얹기). 객체 자체를 기억의 열쇠로 쓰면
 * 다시 그릴 때마다 상자 다듬기(글자당 잉크 합치기 여러 번)가 처음부터 돈다 — 문장 11자면 조작 한 번에 수십 ms다(폰에서는 100ms 안팎).
 * 그래서 열쇠는 내용으로 잡는다: 글자 · 자모 객체 셋(저장소의 것이라 안 바뀌면 같은 객체다) · 여백 네 값.
 */
export function useContextPlacement(syllable: DecomposedSyllable, schema: LayoutSchema, globalStyle: Pick<GlobalStyle, 'linecap' | 'linejoin'>): PlacementResult {
  const { bundle } = useNotoModel()
  const { char, choseong, jungseong, jongseong, layoutType } = syllable
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 내용이 같으면 같은 글자다(위 설명).
  const stableSyllable = useMemo(() => syllable, [char, choseong, jungseong, jongseong, layoutType])
  const padding = schema.padding
  const paddingKey = padding ? `${padding.left}|${padding.right}|${padding.top}|${padding.bottom}` : ''
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 여백은 네 값이 같으면 같다.
  const stablePadding = useMemo(() => padding, [paddingKey])
  const identity = useMemo(() => bundle ? identityOfSyllable(stableSyllable) : null, [bundle, stableSyllable])
  const delta = useLayoutDelta(identity)
  // 다듬기는 네모꼴과 무관하므로 네모꼴을 끄는 동안에도 다시 돌지 않는다. 얹는 변환만 다시 한다.
  const reference = useMemo(
    () => resolveReferenceBoxes({ bundle, identity, syllable: stableSyllable, ends: { linecap: globalStyle.linecap, linejoin: globalStyle.linejoin }, delta }),
    [bundle, identity, stableSyllable, globalStyle.linecap, globalStyle.linejoin, delta],
  )
  const resolved = useMemo(() => resolvePlacementBoxes(reference, stablePadding), [reference, stablePadding])
  // 상자로 풀렸으면 스키마는 결과에 안 들어간다. 스키마 객체가 렌더마다 새것이어도 결과 객체는 그대로다.
  const schemaIfNeeded = resolved.resolution?.complete && resolved.reference ? null : schema
  return useMemo(() => placementResultOf(resolved, schemaIfNeeded ?? schema), [resolved, schemaIfNeeded]) // eslint-disable-line react-hooks/exhaustive-deps
}

function inDesignBody(resolution: ContextBoxResolution, padding: LayoutSchema['padding']): ContextBoxResolution {
  return {
    ...resolution,
    parts: resolution.parts.map((part) => ({ ...part, faces: mapFacesToDesignBody(part.faces, padding), box: mapBoxToDesignBody(part.box, padding) })),
    boxes: Object.fromEntries(Object.entries(resolution.boxes).map(([part, box]) => [part, mapBoxToDesignBody(box, padding)])) as ContextBoxResolution['boxes'],
  }
}

