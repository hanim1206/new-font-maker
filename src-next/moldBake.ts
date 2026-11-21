import { addContextBoxDelta, boxToFaces, identityOfSyllable } from '../src/services/contextBoxResolver'
import type { ContextBoxDelta, FacesDelta } from '../src/services/contextBoxResolver'
import type { GlobalStyle } from '../src/stores/globalStyleStore'
import type { BoxConfig, DecomposedSyllable, LayoutSchema, Part } from '../src/types'
import { effectiveLayoutDelta, useLayoutDeltaStore } from './layoutDeltaStore'
import type { LayoutDeltaSnapshot } from './layoutDeltaStore'
import { contextPlacementOf } from './notoModel'
import type { NotoPresetModelBundle } from './notoPresetGlyphs'
import { ruleOfContext } from './scopeRule'
import type { ScopeRule } from './scopeRule'

/**
 * 빚기 → 버전 1 저장소에 써 넣기(하니무스 2026-11-21 "저장소에 써 넣기").
 * 칸: 짜임마다 대표 글자 하나의 빚은 칸을 목표로, 레이아웃 Δ(`layoutDeltaStore`, 사용자 전용)를 찾는다.
 * Δ와 칸 사이에는 홀자 rail 아핀 · 네모꼴 옮기기가 끼어 곧은 셈이 안 되므로, 배치를 다시 풀어 보며 남은 차이를 더해 간다(몇 번이면 닫힌다).
 * 같은 짜임의 다른 글자는 같은 Δ를 받는다 — 글자마다 다른 몫(윗선 들쭉날쭉 · 닿자 크기에 따른 밀림의 글자별 차이)은 안 넘어간다.
 */

export interface BakeTarget {
  char: string
  syllable: DecomposedSyllable
  schema: LayoutSchema
  /** 빚은 칸(그리는 칸 그대로). */
  target: Partial<Record<Part, BoxConfig>>
  /** 이 글자 칸의 가로 배율(자간으로 옮긴다). */
  sx: number
  /** 허리선이 곁줄기를 옮긴 양과 그때의 칸(획 고치기 `waistSyllable`가 쓴 그대로). */
  lift: number
  molded: Partial<Record<Part, BoxConfig>>
  /** 풍선 닿자 획 두께 배율(`strokeKey` 열쇠). */
  thick: Readonly<Record<string, number>>
}

export interface BakedLayout { rule: ScopeRule; delta: ContextBoxDelta; residual: number; char: string }

const SIDES = ['left', 'right', 'top', 'bottom'] as const

/** 한 글자의 빚은 칸을 레이아웃 Δ로 푼다. `residual`은 다 푼 뒤 남은 가장 큰 변 차이(em). */
export function bakeLayout(input: { bundle: NotoPresetModelBundle; snapshot: LayoutDeltaSnapshot; ends: Pick<GlobalStyle, 'linecap' | 'linejoin' | 'strokeStyle'>; item: BakeTarget; rounds?: number }): BakedLayout | null {
  const { bundle, snapshot, ends, item } = input
  const identity = identityOfSyllable(item.syllable)
  if (!identity) return null
  const base = effectiveLayoutDelta(snapshot, identity)
  const faces: Partial<Record<Part, FacesDelta>> = {}
  let residual = Infinity
  for (let round = 0; round < (input.rounds ?? 6); round++) {
    const delta = addContextBoxDelta(base, { faces })
    const { placement } = contextPlacementOf({ bundle, identity, syllable: item.syllable, schema: item.schema, ends, delta })
    if (placement.kind !== 'boxes') return null
    residual = 0
    for (const [part, want] of Object.entries(item.target) as [Part, BoxConfig][]) {
      const got = placement.boxes[part]
      if (!want || !got) continue
      const a = boxToFaces(want), b = boxToFaces(got)
      const next = (faces[part] ??= {})
      for (const side of SIDES) {
        const err = a[side] - b[side]
        residual = Math.max(residual, Math.abs(err))
        next[side] = ((next[side] as number | undefined) ?? 0) + err
      }
    }
    if (residual < 2e-4) break
  }
  // 마지막 더하기는 아직 안 풀어 봤으니, 남은 차이는 그 전 값으로 적는다(다음 판에서 더 줄어든다).
  return { rule: ruleOfContext(identity.contextId), delta: { faces }, residual, char: item.char }
}

/** 찾은 Δ를 저장소에 더한다(같은 범위에 다시 써 넣으면 더해진다 — 늘 지금 칸 기준 차이라서). */
export function applyBakedLayouts(list: readonly BakedLayout[]): void {
  const store = useLayoutDeltaStore.getState()
  for (const item of list) store.apply(item.rule, item.delta)
}
