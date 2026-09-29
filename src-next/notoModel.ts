import { useEffect, useMemo, useState } from 'react'
import { create } from 'zustand'
import { identityOfSyllable, resolveContextBoxes } from '../src/services/contextBoxResolver'
import type { ContextBoxDelta, ContextBoxResolution } from '../src/services/contextBoxResolver'
import { isReferenceBody, mapBoxToDesignBody, mapFacesToDesignBody } from '../src/services/designBodyPlacement'
import type { GlyphInkPlacement } from '../src/services/notoGlyphXor'
import type { ModelIdentity } from '../src/services/notoVariationModel'
import type { GlobalStyle } from '../src/stores/globalStyleStore'
import type { DecomposedSyllable, LayoutSchema } from '../src/types'
import { NOTO_FONT_PRESET } from '../src/types/database'
import type { FontPresetId } from '../src/types/database'
import { houseLayoutFile, isHouseLayoutModel, withHouseRepresentatives } from '../src/services/houseLayoutModel'
import type { HouseLayoutModel } from '../src/services/houseLayoutModel'
import { useFontPresetStore } from './fontPresetStore'
import { effectiveLayoutDelta, useLayoutDelta } from './layoutDeltaStore'
import type { LayoutDeltaSnapshot } from './layoutDeltaStore'
import { notoPresetGlyphs } from './notoPresetGlyphs'
import type { NotoPresetModelBundle } from './notoPresetGlyphs'

/**
 * 변화량 모델 묶음을 앱 전체가 나눠 쓴다. 읽기는 한 번(IndexedDB 캐시), 화면은 훅으로 구독한다.
 * 상자 배치(`useContextPlacement`)는 모델이 글자를 완전히 풀 때만 모델 상자를 주고,
 * 아니면 호출자가 split/padding 스키마로 돌아간다.
 */

/** 버전별로 한 번씩 읽는다. v1 = 노토 모델 그대로, 그 밖 = 노토 모델에 하우스 대푯값을 끼운 것. */
const shared = new Map<FontPresetId, Promise<NotoPresetModelBundle>>()
function sharedModel(preset: FontPresetId): Promise<NotoPresetModelBundle> {
  let pending = shared.get(preset)
  if (!pending) {
    pending = buildModel(preset).catch((error: unknown) => { shared.delete(preset); throw error })
    shared.set(preset, pending)
  }
  return pending
}

async function buildModel(preset: FontPresetId): Promise<NotoPresetModelBundle> {
  const noto = await notoPresetGlyphs.model()
  if (preset === NOTO_FONT_PRESET) return noto
  return withHouseLayout(noto, await fetchHouseLayout(preset))
}

/** 하우스 파일. 관리자가 고치면 바로 보여야 해서 HTTP 캐시를 다시 확인한다(파일이 작다). */
export async function fetchHouseLayout(preset: FontPresetId): Promise<HouseLayoutModel> {
  const response = await fetch(`${import.meta.env.BASE_URL}${houseLayoutFile(preset)}`, { cache: 'no-cache' })
  if (!response.ok) throw new Error(`프리셋 ${preset} 파일을 읽지 못했습니다(${response.status}).`)
  const value: unknown = await response.json()
  if (!isHouseLayoutModel(value) || value.preset !== preset) throw new Error(`프리셋 ${preset} 파일 형식이 다릅니다.`)
  return value
}

/** 노토 묶음에 하우스 대푯값을 끼운다. 두께 · 효과 · 짝 칸은 노토 것. */
export function withHouseLayout(noto: NotoPresetModelBundle, house: HouseLayoutModel): NotoPresetModelBundle {
  return { ...noto, model: withHouseRepresentatives(noto.model, house) as NotoPresetModelBundle['model'] }
}

/** 관리자가 하우스 파일을 저장한 뒤 부른다. 이 탭의 그 버전 모델을 새 값으로 바꾸고 구독자를 다시 그린다. */
export function replaceHouseModel(preset: FontPresetId, bundle: NotoPresetModelBundle): void {
  shared.set(preset, Promise.resolve(bundle))
  useModelRevision.setState((state) => ({ revision: state.revision + 1 }))
}
const useModelRevision = create<{ revision: number }>(() => ({ revision: 0 }))

/** 모델 출처: 없으면 연 폰트의 버전, 버전 id면 그 버전, 묶음이면 그 묶음(관리자 초안). */
export type ModelSource = FontPresetId | NotoPresetModelBundle | undefined

export function useNotoModel(source?: ModelSource): { bundle: NotoPresetModelBundle | null; error: string } {
  const active = useFontPresetStore((state) => state.preset)
  const revision = useModelRevision((state) => state.revision)
  const direct = typeof source === 'object' ? source : null
  const preset = typeof source === 'string' ? source : active
  const [state, setState] = useState<{ preset: FontPresetId | null; bundle: NotoPresetModelBundle | null; error: string }>({ preset: null, bundle: null, error: '' })
  useEffect(() => {
    if (direct) return
    let alive = true
    sharedModel(preset)
      .then((bundle) => { if (alive) setState({ preset, bundle, error: '' }) })
      .catch((failure: Error) => { if (alive) setState({ preset, bundle: null, error: failure.message }) })
    return () => { alive = false }
  }, [direct, preset, revision])
  if (direct) return { bundle: direct, error: '' }
  return state.preset === preset ? { bundle: state.bundle, error: state.error } : { bundle: null, error: '' }
}

export type GlyphPlacement = GlyphInkPlacement

/** 모델 묶음을 기다린다. OTF 추출처럼 훅 밖에서 화면과 같은 상자가 필요한 곳이 쓴다. 버전을 안 주면 연 폰트의 버전. */
export const loadNotoModel = (preset: FontPresetId = useFontPresetStore.getState().preset): Promise<NotoPresetModelBundle> => sharedModel(preset)

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
export function useContextPlacement(syllable: DecomposedSyllable, schema: LayoutSchema, globalStyle: Pick<GlobalStyle, 'linecap' | 'linejoin'>, deltaSource?: LayoutDeltaSnapshot, modelSource?: ModelSource): PlacementResult {
  const { bundle } = useNotoModel(modelSource)
  const { char, choseong, jungseong, jongseong, layoutType } = syllable
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 내용이 같으면 같은 글자다(위 설명).
  const stableSyllable = useMemo(() => syllable, [char, choseong, jungseong, jongseong, layoutType])
  const padding = schema.padding
  const paddingKey = padding ? `${padding.left}|${padding.right}|${padding.top}|${padding.bottom}` : ''
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 여백은 네 값이 같으면 같다.
  const stablePadding = useMemo(() => padding, [paddingKey])
  const identity = useMemo(() => bundle ? identityOfSyllable(stableSyllable) : null, [bundle, stableSyllable])
  const storedDelta = useLayoutDelta(identity)
  // `deltaSource`를 주면 이 기기 저장소 대신 그 폰트의 Δ를 쓴다(관리자 미리보기).
  const delta = useMemo(() => deltaSource ? effectiveLayoutDelta(deltaSource, identity) : storedDelta, [deltaSource, identity, storedDelta])
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

