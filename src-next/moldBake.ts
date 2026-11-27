import { addContextBoxDelta, boxToFaces, identityOfSyllable } from '../src/services/contextBoxResolver'
import type { ContextBoxDelta, FacesDelta } from '../src/services/contextBoxResolver'
import type { GlobalStyle } from '../src/stores/globalStyleStore'
import type { BoxConfig, DecomposedSyllable, JamoData, LayoutSchema, LayoutType, Part, StrokeDataV2 } from '../src/types'
import { medialFamilyOf } from '../src/utils/jamoContextStrokes'
import { branchSyllable, jagBoxes, JAG_INITIALS, lookOf, stemSyllable, waistSyllable, type Look } from './moldLab'
import { effectiveLayoutDelta, useLayoutDeltaStore } from './layoutDeltaStore'
import type { LayoutDeltaSnapshot } from './layoutDeltaStore'
import { contextPlacementOf } from './notoModel'
import type { NotoPresetModelBundle } from './notoPresetGlyphs'
import { ruleOfContext } from './scopeRule'
import type { ScopeRule } from './scopeRule'

/**
 * 빚기 → 버전 1 저장소에 써 넣기(하니무스 2026-11-21 "저장소에 써 넣기").
 * 칸: 짜임 × 홀자마다 글자 하나(첫닿자 ㄱ, 받침 ㄱ)의 빚은 칸을 목표로, 레이아웃 Δ(`layoutDeltaStore`, 사용자 전용)를 찾는다.
 * Δ와 칸 사이에는 홀자 rail 아핀 · 네모꼴 옮기기가 끼어 곧은 셈이 안 되므로, 배치를 다시 풀어 보며 남은 차이를 더해 간다(몇 번이면 닫힌다).
 * 같은 짜임 · 홀자의 다른 글자는 같은 Δ를 받는다 — 첫닿자 · 받침마다 다른 몫(닿자 크기에 따른 밀림의 글자별 차이)은 안 넘어간다.
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
  /**
   * 풍선 굵기(굵기 칸 55 위)로 그린 글자: 화면이 실제로 쓴 칸(넓힘까지)과 자소 묶음마다 세로 · 가로 획 두께(em, 가운데 획 기준).
   * 버전 1은 글줄 한 굵기로 그려 이 그림을 다 못 받는다 — 남은 차이에 넣어 숨기지 않는다(다람쥐 재검수 1번).
   */
  heavy?: { boxes: Partial<Record<Part, BoxConfig>>; ink: Partial<Record<'CH' | 'JU' | 'JO', { v: number; h: number; t: number }>> }
}

/**
 * 써 넣는 범위: 짜임 × 홀자 하나(다람쥐 D 검수 1번 · 윗선 검수 3번). 짜임마다 대표 글자 하나의 Δ를 같이 주면
 * 홀자가 다른 글자(「늬」「원」, ㅜ · ㅡ + 받침)는 빚은 칸과 달라지고, 윗선을 내리면 홀자와 받침이 겹쳤다.
 */
export const medialRuleOf = (identity: { contextId: string; medialJamo: string }): ScopeRule => ({ ...ruleOfContext(identity.contextId), medial: [identity.medialJamo] })

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
  // 엔진이 안 따르는 변(섞임홀자의 가로 · 세로 칸처럼 rail에 묶인 변)은 더해도 안 움직인다. 그런 변에 계속 더하면
  // 저장소에 쌓여 다시 써 넣을 때마다 커진다(「원」이 써 넣을 때마다 좁아짐). 더했는데 차이가 반도 안 줄면 그 몫을 빼고 멈춘다.
  const lastErr: Partial<Record<string, number>> = {}
  const lastAdd: Partial<Record<string, number>> = {}
  const frozen = new Set<string>()
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
        const key = `${part}:${side}`
        const err = a[side] - b[side]
        residual = Math.max(residual, Math.abs(err))
        if (frozen.has(key)) continue
        const before = lastErr[key]
        if (before !== undefined && Math.abs(before) > 2e-4 && Math.abs(err) > Math.abs(before) * 0.5) {
          next[side] = ((next[side] as number | undefined) ?? 0) - (lastAdd[key] ?? 0)
          frozen.add(key)
          continue
        }
        next[side] = ((next[side] as number | undefined) ?? 0) + err
        lastErr[key] = err
        lastAdd[key] = err
      }
    }
    if (residual < 2e-4) break
  }
  // 마지막 더하기는 아직 안 풀어 봤으니, 남은 차이는 그 전 값으로 적는다(다음 판에서 더 줄어든다).
  return { rule: medialRuleOf(identity), delta: { faces }, residual, char: item.char }
}

/**
 * 써 넣은 뒤 한 글자가 빚은 칸과 얼마나 다른가(em, 변 차이의 가장 큰 값). 같은 짜임은 대표 글자 하나의 Δ를 같이 받으므로,
 * 대표가 아닌 글자(「늬」「원」처럼 홀자가 다른 글자)는 여기서만 차이가 드러난다(다람쥐 D 검수 1번: "남은 차이 0u"인데 그림이 다름).
 */
export function bakedResidual(input: { bundle: NotoPresetModelBundle; snapshot: LayoutDeltaSnapshot; ends: Pick<GlobalStyle, 'linecap' | 'linejoin' | 'strokeStyle'>; item: BakeTarget }): number | null {
  const { bundle, snapshot, ends, item } = input
  const identity = identityOfSyllable(item.syllable)
  if (!identity) return null
  const { placement } = contextPlacementOf({ bundle, identity, syllable: item.syllable, schema: item.schema, ends, delta: effectiveLayoutDelta(snapshot, identity) })
  if (placement.kind !== 'boxes') return null
  let residual = 0
  for (const [part, want] of Object.entries(item.target) as [Part, BoxConfig][]) {
    const got = placement.boxes[part]
    if (!want || !got) continue
    const a = boxToFaces(want), b = boxToFaces(got)
    for (const side of SIDES) residual = Math.max(residual, Math.abs(a[side] - b[side]))
  }
  return residual
}

/** 찾은 Δ를 저장소에 더한다(같은 범위에 다시 써 넣으면 더해진다 — 늘 지금 칸 기준 차이라서). */
export function applyBakedLayouts(list: readonly BakedLayout[]): void {
  const store = useLayoutDeltaStore.getState()
  for (const item of list) store.apply(item.rule, item.delta)
}

// ── D-2: 획을 자모 저장소에 써 넣기 ──

type MedialFamilyKey = 'right' | 'bottom' | 'mixed'
const FAMILY_LAYOUT: Record<MedialFamilyKey, { open: LayoutType; closed: LayoutType }> = {
  right: { open: 'choseong-jungseong-vertical', closed: 'choseong-jungseong-vertical-jongseong' },
  bottom: { open: 'choseong-jungseong-horizontal', closed: 'choseong-jungseong-horizontal-jongseong' },
  mixed: { open: 'choseong-jungseong-mixed', closed: 'choseong-jungseong-mixed-jongseong' },
}
const FAMILIES = Object.keys(FAMILY_LAYOUT) as MedialFamilyKey[]
type JamoMap = Readonly<Record<string, JamoData>>
type DrawnConsonants = Partial<Record<LayoutType, { choseong: JamoMap; jongseong: JamoMap }>>

const scaleThickness = (strokes: StrokeDataV2[] | undefined, k: number) => (k === 1 || !strokes ? strokes : strokes.map((stroke) => ({ ...stroke, thickness: stroke.thickness * k })))
function thickenJamo(jamo: JamoData, k: number): JamoData {
  if (k === 1) return jamo
  return {
    ...jamo, strokes: scaleThickness(jamo.strokes, k), horizontalStrokes: scaleThickness(jamo.horizontalStrokes, k), verticalStrokes: scaleThickness(jamo.verticalStrokes, k),
    contextStrokes: jamo.contextStrokes && Object.fromEntries(Object.entries(jamo.contextStrokes).map(([family, strokes]) => [family, scaleThickness(strokes, k)])),
  }
}
/** 풍선 닿자 획 두께: 대표 글자들의 획 배율 평균(부위별). 획 id가 자모마다 달라 글자별로는 못 옮긴다. */
export function meanThick(items: readonly BakeTarget[], part: 'CH' | 'JO'): number {
  const values = items.flatMap((item) => Object.entries(item.thick).filter(([key]) => key.startsWith(`${part}:`)).map(([, value]) => value))
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 1
}

/**
 * 닿자: 긋기로 바뀐 획은 짜임마다 다르다(칸 비율이 달라서). 저장소의 닿자는 홀자 계열 셋(`contextStrokes`)만 가르므로,
 * 첫닿자는 받침 없는 짜임, 받침은 받침 있는 짜임의 모양을 그 계열에 넣는다. 원래 계열 획이 있던 자리는 화면도 그걸 그렸으니 그대로 둔다.
 */
export function bakedConsonants(stored: JamoMap, drawn: DrawnConsonants | undefined, kind: 'choseong' | 'jongseong', thick: number): Record<string, JamoData> {
  const out: Record<string, JamoData> = {}
  for (const [char, base] of Object.entries(stored)) {
    const byFamily = Object.fromEntries(FAMILIES.map((family) => {
      const layout = FAMILY_LAYOUT[family][kind === 'choseong' ? 'open' : 'closed']
      return [family, drawn?.[layout]?.[kind]?.[char]?.strokes]
    })) as Record<MedialFamilyKey, StrokeDataV2[] | undefined>
    let next = base
    if (FAMILIES.some((family) => byFamily[family])) {
      const contextStrokes = Object.fromEntries(FAMILIES.map((family) => [family, base.contextStrokes?.[family] ?? byFamily[family] ?? base.strokes ?? []]))
      next = { ...base, strokes: byFamily.right ?? base.strokes, contextStrokes }
    }
    next = thickenJamo(next, thick)
    if (next !== base) out[char] = next
  }
  return out
}

/** 홀자: 긋기 마스터 → 허리선(곁줄기 높이, 계열 대표 글자의 칸 기준) → 곁줄기 길이 → 줄기마다 휨 · 길이 · 틈. 화면(`MoldGlyph`)과 같은 순서. */
export function bakedVowels(stored: JamoMap, drawn: JamoMap | undefined, items: readonly BakeTarget[], look: Look, ends?: { ink: number; linecap?: string }): Record<string, JamoData> {
  const out: Record<string, JamoData> = {}
  const repOf = (family: MedialFamilyKey) => items.find((item) => item.syllable.layoutType === FAMILY_LAYOUT[family].open)
  for (const [char, base] of Object.entries(stored)) {
    const start = drawn?.[char] ?? base
    const family = medialFamilyOf(char) ?? 'right'
    const rep = repOf(family)
    let syllable: DecomposedSyllable = { char, choseong: null, jongseong: null, jungseong: start, layoutType: FAMILY_LAYOUT[family].open }
    if (rep) syllable = waistSyllable(syllable, rep.lift, rep.molded)
    syllable = stemSyllable(branchSyllable(syllable, lookOf(look, 'branch'), rep && ends ? { boxes: rep.molded, ...ends } : undefined), look)
    let next = syllable.jungseong!
    // 곁줄기 길이 · 허리선은 칸에 놓은 뒤 획만 고친 것이라, 틀(`frame`)을 고치기 전 획으로 둔다. 안 그러면 짧아진 곁줄기 범위로 자소를 다시 늘려 맞춘다.
    if (next !== start) next = { ...next, frame: start.frame ?? { strokes: start.strokes, horizontalStrokes: start.horizontalStrokes, verticalStrokes: start.verticalStrokes } }
    if (next !== base) out[char] = next
  }
  return out
}

/**
 * 윗선 들쭉날쭉: 첫닿자 × 짜임마다 규칙 하나. 대표 글자의 빚은 칸에 같은 첫닿자 씨앗으로 윗선을 흔든 차이를 그대로 Δ로 둔다.
 * (홀자 칸은 엔진이 rail로 다시 놓으므로 조금 어긋날 수 있다. 크기는 글자 키의 몇 %라 눈으로는 같다.)
 */
export function jagRules(items: readonly BakeTarget[], jag: number): BakedLayout[] {
  const out: BakedLayout[] = []
  for (const item of items) {
    const identity = identityOfSyllable(item.syllable)
    if (!identity) continue
    const base = medialRuleOf(identity)
    for (const initial of JAG_INITIALS) {
      const moved = jagBoxes(item.target, jag, initial)
      if (moved === item.target) continue
      const faces: Partial<Record<Part, FacesDelta>> = {}
      for (const [part, box] of Object.entries(item.target) as [Part, BoxConfig][]) {
        const next = moved[part]
        if (!box || !next) continue
        const a = boxToFaces(box), b = boxToFaces(next)
        faces[part] = { top: b.top - a.top, bottom: b.bottom - a.bottom }
      }
      out.push({ rule: { ...base, initial: [initial] }, delta: { faces }, residual: 0, char: item.char })
    }
  }
  return out
}
