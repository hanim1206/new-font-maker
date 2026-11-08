import { materializeFinalGlyphInk } from '../src/services/finalGlyphInk'
import { resolveGlyphInkPrimitives } from '../src/services/glyphInkResolver'
import { applyLayoutRules, bodyOfPadding, RULE_PARTS } from '../src/services/layoutRules'
import type { InkBounds, LayoutRuleParams, LayoutRuleStep, RuleBoxes, RuleInk, RuleMeasure, RulePart } from '../src/services/layoutRules'
import { appGlyphInkRegions, ghostXorRatio, glyphPlacementOf } from '../src/services/notoGlyphXor'
import type { GlyphInkPlacement } from '../src/services/notoGlyphXor'
import type { ContextModel } from '../src/services/contextBoxResolver'
import { notoOutlineToInkRegions } from '../src/services/notoOutlineInk'
import type { NotoOutline } from '../src/services/notoOutlineInk'
import type { GlobalStyle } from '../src/stores/globalStyleStore'
import type { BoxConfig, DecomposedSyllable, DeepReadonly, InkRegion, JamoData, Part } from '../src/types'
import { CHOSEONG_LIST, JONGSEONG_LIST } from '../src/data/Hangul'
import { weightToMultiplier } from '../src/utils/globalStyleUtils'
import { decomposeSyllable } from '../src/utils/hangulUtils'
import { calculateBoxes, DEFAULT_LAYOUT_SCHEMAS } from '../src/utils/layoutCalculator'
import { REFERENCE_BODY_PADDING } from '../src/services/designBodyPlacement'
import type { LayoutSchema } from '../src/types'

/**
 * 배치 규칙 채점. 한 글자를 세 가지 자리에 그려 노토와 견준다 —
 * 모델(지금 엔진) · 스키마(Split + Padding 그대로, 규칙 끔) · 규칙(스키마에서 출발해 규칙을 먹인 것).
 * 잉크 그리기와 xor는 제품 · 격자 리포트와 같은 함수(`appGlyphInkRegions` · `ghostXorRatio`)를 쓴다.
 */

const INK_OPTIONS = { unitsPerEm: 1000, maxCurveErrorFontUnits: 0.5 }
const HORIZONTAL_INK_BOUNDS = { min: 0, max: 1 } as const
/** 이 실험의 레이아웃: 첫닿자 + 오른홀자 + 받침. 받침 없는 오른홀자(가)도 대표 글자라 함께 받는다. */
export const RULE_LAYOUTS = ['choseong-jungseong-vertical-jongseong', 'choseong-jungseong-vertical'] as const
/** 제품이 Split + Padding 스키마에 얹는 기본 네모꼴(노토 몸통 840 × 910). 규칙의 글자 몸도 이것이다. */
const START_PADDING = REFERENCE_BODY_PADDING
/** 오른홀자(세로홀자) 아홉. */
export const RIGHT_VOWELS = ['ㅏ', 'ㅐ', 'ㅑ', 'ㅒ', 'ㅓ', 'ㅔ', 'ㅕ', 'ㅖ', 'ㅣ'] as const
/** 받침 27(빈 받침 제외). */
const FINALS: readonly string[] = JONGSEONG_LIST.filter((jong) => jong !== '')

export interface JamoMaps {
  choseong: Record<string, JamoData>
  jungseong: Record<string, JamoData>
  jongseong: Record<string, JamoData>
}

export interface ScoredGlyph {
  char: string
  ok: boolean
  message?: string
  /** 노토 대비 xor. 모델은 모델이 없거나 못 풀면 null. */
  xor: { model: number | null; schema: number; rule: number }
  boxes: { schema: RuleBoxes; rule: RuleBoxes; model: RuleBoxes | null }
  /** 1차 채점: 부품별 잉크 바깥 네모(네 변)의 규칙 − 모델 차이. 모델이 없으면 null. */
  box: BoxScore | null
  steps: LayoutRuleStep[]
  limited: boolean
  /** 그림용(em 0~1). 규칙 자리의 앱 잉크와 노토 고스트. */
  ink: { rule: readonly DeepReadonly<InkRegion>[]; ghost: readonly DeepReadonly<InkRegion>[] }
}

export const NOTO_DELTA_TOLERANCE = 0.02
/** 1차 게이트: 네 변 차이가 전부 이 안이면 "박스 일치". */
export const BOX_TOLERANCE = 0.02

export type Edge = 'left' | 'right' | 'top' | 'bottom'
export const EDGES: readonly Edge[] = ['left', 'right', 'top', 'bottom']
export const EDGE_LABEL: Record<Edge, string> = { left: '왼', right: '오른', top: '위', bottom: '아래' }
export interface PartBoxScore { rule: InkBounds; model: InkBounds; diff: Record<Edge, number>; maxAbs: number }
export interface BoxScore {
  parts: Partial<Record<RulePart, PartBoxScore>>
  /** 모든 부품 · 변 중 가장 큰 |차이|. */
  maxAbs: number
  /** 모든 변 |차이|의 평균. */
  meanAbs: number
  /** 가장 많이 어긋난 자리. */
  worst: { part: RulePart; edge: Edge; diff: number } | null
  /** 규칙 끔(스키마) 상자의 같은 값. */
  schemaMaxAbs: number
}

export function boxScoreOf(rule: RuleInk, model: RuleInk, schema: RuleInk): BoxScore {
  const parts: BoxScore['parts'] = {}
  let maxAbs = 0, sum = 0, count = 0, schemaMaxAbs = 0
  let worst: BoxScore['worst'] = null
  for (const part of RULE_PARTS) {
    const r = rule[part], m = model[part], sc = schema[part]
    if (!r || !m) continue
    const diff = { left: 0, right: 0, top: 0, bottom: 0 } as Record<Edge, number>
    let partMax = 0
    for (const edge of EDGES) {
      diff[edge] = r.bounds[edge] - m.bounds[edge]
      const abs = Math.abs(diff[edge])
      partMax = Math.max(partMax, abs); sum += abs; count += 1
      if (abs > maxAbs) { maxAbs = abs; worst = { part, edge, diff: diff[edge] } }
      if (sc) schemaMaxAbs = Math.max(schemaMaxAbs, Math.abs(sc.bounds[edge] - m.bounds[edge]))
    }
    parts[part] = { rule: r.bounds, model: m.bounds, diff, maxAbs: partMax }
  }
  return { parts, maxAbs, meanAbs: count ? sum / count : 0, worst, schemaMaxAbs }
}

function boundsOfRegions(regions: readonly DeepReadonly<InkRegion>[]): InkBounds | null {
  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity
  for (const region of regions) for (const point of region.outer) {
    if (point.x < left) left = point.x
    if (point.x > right) right = point.x
    if (point.y < top) top = point.y
    if (point.y > bottom) bottom = point.y
  }
  return Number.isFinite(left) ? { left, right, top, bottom } : null
}

/** 부품별 잉크를 재는 자. 상자를 받아 그 자리에 실제로 그린 뒤 바깥면과 줄기 두께를 돌려준다. */
export function partInkMeasure(syllable: DecomposedSyllable, style: GlobalStyle): RuleMeasure {
  const weightMultiplier = weightToMultiplier(style.weight)
  return (boxes) => {
    const resolved = resolveGlyphInkPrimitives({
      syllable,
      placement: { kind: 'boxes', boxes: boxes as Partial<Record<Part, BoxConfig>> },
      weightMultiplier,
      globalLinecap: style.linecap,
      globalLinejoin: style.linejoin,
      horizontalInkBounds: HORIZONTAL_INK_BOUNDS,
    })
    const ink: RuleInk = {}
    for (const part of RULE_PARTS) {
      const primitives = resolved.primitives.filter((primitive) => primitive.source.part === part)
      if (!primitives.length) continue
      const materialized = materializeFinalGlyphInk(primitives, style.strokeStyle, INK_OPTIONS)
      if (!materialized.ok) continue
      const bounds = boundsOfRegions(materialized.ink.regions)
      if (!bounds) continue
      const thickness = Math.max(...primitives.map((primitive) => primitive.stroke.thickness * weightMultiplier))
      ink[part] = { bounds, thickness }
    }
    return ink
  }
}

export const pickRuleBoxes = (boxes: Partial<Record<Part, BoxConfig>>): RuleBoxes => {
  const result: RuleBoxes = {}
  for (const part of RULE_PARTS) if (boxes[part]) result[part] = { ...boxes[part]! }
  return result
}

function xorOf(syllable: DecomposedSyllable, placement: GlyphInkPlacement, style: GlobalStyle, ghost: readonly DeepReadonly<InkRegion>[]): { xor: number; regions: readonly DeepReadonly<InkRegion>[] } | { message: string } {
  const app = appGlyphInkRegions(syllable, placement, style)
  if (!app.ok) return { message: app.message }
  const value = ghostXorRatio(app.regions, ghost, placement.kind)
  return value ? { xor: value.xorRatio, regions: app.regions } : { message: 'Noto 고스트 면적이 0입니다.' }
}

/**
 * 줄기 목표(칸 안 비율)를 em 자리 그대로 다른 칸으로 옮긴다. 비율을 그대로 복사하면 칸 높이가 다를 때 곁줄기가 엉뚱한 높이에 선다.
 * "홀자 안쪽 줄기를 노토 보선에 맞춤"의 뜻은 보선의 em 자리를 따르는 것이다.
 */
function railsInBox(from: BoxConfig, to: BoxConfig): NonNullable<BoxConfig['stems']> {
  const y = (ratio: number | undefined) => ratio === undefined ? undefined : (from.y + ratio * from.height - to.y) / to.height
  const result: Record<string, NonNullable<BoxConfig['stems']>[string]> = {}
  for (const [id, rail] of Object.entries(from.stems ?? {})) {
    result[id] = {
      ...rail,
      ...(rail.top !== undefined ? { top: y(rail.top) } : {}),
      ...(rail.bottom !== undefined ? { bottom: y(rail.bottom) } : {}),
      ...(rail.center !== undefined ? { center: y(rail.center) } : {}),
      ...(rail.dx !== undefined ? { dx: rail.dx * from.width / to.width } : {}),
    }
  }
  return result
}

export interface ScoreInput {
  char: string
  maps: JamoMaps
  style: GlobalStyle
  model: ContextModel | null
  outline: DeepReadonly<NotoOutline>
  params: LayoutRuleParams
  /** 홀자 안쪽 줄기(곁줄기 등)를 모델이 푼 노토 보선에 맞춘다. 끄면 자모 원형 비율 그대로. */
  snapStems: boolean
}

export function scoreGlyph(input: ScoreInput): ScoredGlyph {
  const { char, maps, style, model, params } = input
  const failed = (message: string): ScoredGlyph => ({ char, ok: false, message, xor: { model: null, schema: 0, rule: 0 }, boxes: { schema: {}, rule: {}, model: null }, box: null, steps: [], limited: false, ink: { rule: [], ghost: [] } })
  let syllable: DecomposedSyllable
  try { syllable = decomposeSyllable(char, maps.choseong, maps.jungseong, maps.jongseong) }
  catch (failure) { return failed(failure instanceof Error ? failure.message : '분해 실패') }
  if (!(RULE_LAYOUTS as readonly string[]).includes(syllable.layoutType)) return failed(`이 실험의 레이아웃이 아닙니다(${syllable.layoutType}).`)
  const schema: LayoutSchema = { ...DEFAULT_LAYOUT_SCHEMAS[syllable.layoutType], padding: START_PADDING, designBodyPadding: START_PADDING }
  const ghost = notoOutlineToInkRegions(input.outline)
  if (!ghost.ok) return failed(ghost.message)

  // 모델(지금 엔진)
  const modelPlacement = model ? glyphPlacementOf(syllable, schema, style, model) : null
  const modelBoxes = modelPlacement?.kind === 'boxes' ? pickRuleBoxes(modelPlacement.boxes) : null
  const modelXor = modelPlacement?.kind === 'boxes' ? xorOf(syllable, modelPlacement, style, ghost.regions) : null

  // 스키마(규칙 끔) — Split + Padding 상자 그대로.
  const schemaBoxes = pickRuleBoxes(calculateBoxes(schema, { cho: syllable.choseong?.char ?? '', jung: syllable.jungseong?.char ?? '', jong: syllable.jongseong?.char ?? '' }))
  if (input.snapStems && modelBoxes?.JU?.stems && schemaBoxes.JU) schemaBoxes.JU = { ...schemaBoxes.JU, stems: modelBoxes.JU.stems }
  const schemaXor = xorOf(syllable, { kind: 'boxes', boxes: schemaBoxes }, style, ghost.regions)
  if ('message' in schemaXor) return failed(schemaXor.message)

  // 규칙
  const jamo = { cho: syllable.choseong?.char ?? '', jung: syllable.jungseong?.char ?? '', jong: syllable.jongseong?.char ?? '' }
  const ruled = applyLayoutRules({ boxes: schemaBoxes, body: bodyOfPadding(START_PADDING), params, measure: partInkMeasure(syllable, style), jamo })
  if (input.snapStems && modelBoxes?.JU?.stems && ruled.boxes.JU) ruled.boxes.JU = { ...ruled.boxes.JU, stems: railsInBox(modelBoxes.JU, ruled.boxes.JU) }
  const ruleXor = xorOf(syllable, { kind: 'boxes', boxes: ruled.boxes }, style, ghost.regions)
  if ('message' in ruleXor) return failed(ruleXor.message)

  const measure = partInkMeasure(syllable, style)
  const box = modelBoxes ? boxScoreOf(measure(ruled.boxes), measure(modelBoxes), measure(schemaBoxes)) : null

  return {
    char, ok: true,
    xor: { model: modelXor && 'xor' in modelXor ? modelXor.xor : null, schema: schemaXor.xor, rule: ruleXor.xor },
    boxes: { schema: schemaBoxes, rule: ruled.boxes, model: modelBoxes },
    box,
    steps: ruled.steps,
    limited: ruled.limited,
    ink: { rule: ruleXor.regions, ghost: ghost.regions },
  }
}

const compose = (cho: string, jung: string, jong: string): string => {
  const choIndex = (CHOSEONG_LIST as readonly string[]).indexOf(cho)
  const jungIndex = (RIGHT_VOWELS as readonly string[]).indexOf(jung)
  const jongIndex = (JONGSEONG_LIST as readonly string[]).indexOf(jong)
  // 오른홀자 아홉의 유니코드 중성 순번: ㅏ0 ㅐ1 ㅑ2 ㅒ3 ㅓ4 ㅔ5 ㅕ6 ㅖ7 … ㅣ20
  const jungCode = jung === 'ㅣ' ? 20 : jungIndex
  return String.fromCodePoint(0xac00 + (choIndex * 21 + jungCode) * 28 + jongIndex)
}

/** G0 대표 여섯. */
export const REPRESENTATIVE_CHARS = ['가', '각', '갈', '날', '말', '할'] as const

/**
 * 전수 표본 588자. 첫닿자 19 × 오른홀자 9 = 171짝마다 받침 셋(받침 27을 돌려가며) = 513자,
 * 거기에 홀드아웃(G1) 받침 ㄴ · ㄹ · ㅄ × 첫닿자 ㄱ ㅁ ㅇ ㅆ ㅎ × 홀자 ㅏ ㅐ ㅓ ㅕ ㅣ = 75자.
 */
export function sampleChars(): string[] {
  const chars = new Set<string>()
  let pair = 0
  for (const cho of CHOSEONG_LIST) for (const jung of RIGHT_VOWELS) {
    for (let j = 0; j < 3; j += 1) chars.add(compose(cho, jung, FINALS[(pair * 7 + j * 9) % FINALS.length]))
    pair += 1
  }
  for (const jong of ['ㄴ', 'ㄹ', 'ㅄ']) for (const cho of ['ㄱ', 'ㅁ', 'ㅇ', 'ㅆ', 'ㅎ']) for (const jung of ['ㅏ', 'ㅐ', 'ㅓ', 'ㅕ', 'ㅣ']) {
    const char = compose(cho, jung, jong)
    if (chars.has(char)) {
      // 겹치면 다음 받침으로 바꿔 넣어 수를 맞춘다.
      let shift = 1
      while (chars.has(compose(cho, jung, FINALS[(FINALS.indexOf(jong) + shift) % FINALS.length]))) shift += 1
      chars.add(compose(cho, jung, FINALS[(FINALS.indexOf(jong) + shift) % FINALS.length]))
    } else chars.add(char)
  }
  return [...chars]
}

/** 가운데값. 빈 목록은 null. */
export function medianOf(values: readonly number[]): number | null {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

/** 잉크 영역 → SVG path(evenodd). scale은 em → 화면 배율. */
export function regionsToPath(regions: readonly DeepReadonly<InkRegion>[], scale: number): string {
  const ring = (points: readonly DeepReadonly<{ x: number; y: number }>[]) => points.length
    ? `M${points.map((point) => `${(point.x * scale).toFixed(2)} ${(point.y * scale).toFixed(2)}`).join('L')}Z`
    : ''
  return regions.map((region) => ring(region.outer) + region.holes.map(ring).join('')).join('')
}

export type { RulePart }
