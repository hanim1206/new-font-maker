import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react'
import { Check, ChevronDown, ChevronRight, Dices, RotateCcw, Undo2 } from 'lucide-react'
import { SvgRenderer } from '../src/renderers/SvgRenderer'
import { resolveGlyphInkPrimitives } from '../src/services/glyphInkResolver'
import type { PenPoint } from '../src/services/penStrokeFit'
import { useEffectiveGlobalStyle } from '../src/stores/globalStyleStore'
import { useJamoStore } from '../src/stores/jamoStore'
import { DEFAULT_GLOBAL_PADDING, mergePadding, useLayoutStore } from '../src/stores/layoutStore'
import type { GlobalStyle } from '../src/stores/globalStyleStore'
import { propagatedJungseong } from '../src/stores/stemMasterStore'
import type { BoxConfig, GlyphInkPlacement, JamoData, LayoutType, Padding, Part, ResolvedStrokeInkSource } from '../src/types'
import type { DecomposedSyllable } from '../src/types'
import { weightToMultiplier } from '../src/utils/globalStyleUtils'
import { decomposeSyllable } from '../src/utils/hangulUtils'
import { pointsToSvgD } from '../src/utils/pathUtils'
import { Button } from './components/ui/button'
import { ChoiceGroup, ChoiceItem } from './components/ui/choice-group'
import { Pressable } from './components/ui/pressable'
import { Field, RangeBar } from './components/ui/range'
import { Switch } from './components/ui/switch'
import { EDIT_COLOR } from './editColors'
import { clearanceRatio, correctGlyph, GOTHIC_FENCE, measureGlyph, movedBoxes, partClearances, pickJamoScale, scaledBoxes, type Clearances, type FenceLine, type FencePull, type PartPair, nearestBetweenParts } from './fenceBand'
import { applyPartEdits, appliedWeight, balloonOk, branchSyllable, growSides, lookScale, serifSyllable, waistLift, wobbleSyllable, inflateSyllable, waistSyllable, BALLOON_GAPS, type BalloonGap, dragLook, dragSeam, lookBoxes, gapCapMultiplier, lookOf, LOOK_WALL, moveApart, movePartEdit, scaledWeight, seamPos, seamRange, seamsOf, simsPartOf, type GapStroke, type LayoutEdits, type Look, type PartEdits, type Region, type SimsPart } from './moldLab'
import { useContextPlacement } from './notoModel'
import { SAMPLE_SENTENCES } from './sampleSentences'
import { consonantBoxesOf, consonantShapesOf, consonantStemKeys, drawnStem, LAYOUTS, mastersOf, shapeConsonants, STEMS, stemInfo, vowelStemKeys, type DrawnStem, type StemKind } from './strokeLab'
import { MoldDotPlate } from './MoldDotPlate'
import styles from './MoldLabPage.module.css'

/**
 * 빚기 시험판(학습 프로토타입). 두 단계를 한 화면에서 오간다.
 * 1) 긋기 — 줄기 여섯을 한 번씩 긋는다(획 긋기 시험판과 같은 엔진 `strokeLab.ts`).
 * 2) 빚기 — 심즈 얼굴 만들기처럼 글자에서 부위(첫닿자 · 홀자 · 받침)를 콕 눌러 고르고, 어디서든 여덟 방향으로 끈다.
 *    네 변 · 네 모서리에 그 방향으로 무엇이 바뀌는지 뜬다. 칸 편집은 짜임마다 같이 바뀐다. 획 · 전체는 단추로 고른다.
 *    큰 글자는 젤리처럼 늦게 따라오고 놓으면 출렁인다. 획 사이 최소 틈(굵기선 70%)은 그대로 지킨다.
 * 저장하지 않고 제품 값(자모 · 배치)도 안 바꾼다. 계산은 `moldLab.ts`.
 */

const FIRST_SENTENCE = '아버지가 바다 너머 저기 산다'
// 빚기는 두 걸음: 인상 잡기(전체 먼저) → 부위 다듬기(다람쥐 검수 10번, 하니무스 2026-11-21 승인).
type Step = 'draw' | 'shape' | 'part' | 'stroke'
const STEP_NAMES: Record<Step, string> = { draw: '긋기', shape: '인상 잡기', part: '부위 다듬기', stroke: '획 다듬기' }
const STEP_ORDER: readonly Step[] = ['draw', 'shape', 'part', 'stroke']
/** 획 다듬기(하니무스 2026-11-21 "인상 → 부위 → 획"). 이번엔 자리와 뼈대만 — 획 끝 하나, 부리 · 꺾임은 다음에. */
const STROKE_ENDS = [{ key: 'sharp', name: '또렷', soft: 0 }, { key: 'round', name: '둥긂', soft: 1 }] as const
/** 획 다듬기 막대 셋. 값 0~100으로 보이고, 안에서는 벽 사이로 잇는다. */
const STROKE_BARS = [{ key: 'branch', name: '곁줄기 길이' }, { key: 'serif', name: '부리' }, { key: 'wobble', name: '손글씨 흔들림' }] as const
const STROKE_KEYS = ['soft', 'branch', 'serif', 'wobble'] as const
const STROKE_LATER = ['꺾임'] as const

/** 그은 줄기를 자모에 입힌 것. 닿자는 짜임마다 칸 비율이 달라 짜임별로 따로. */
interface Drawn {
  jungseong?: Readonly<Record<string, JamoData>>
  consonants: Record<LayoutType, { choseong: Record<string, JamoData>; jongseong: Record<string, JamoData> }>
}

/** 굵게 할 때 자소 칸을 키워 보는 비율(작은 것부터). 거북이 표: 굵기 1%p마다 자소가 0.3~0.6% 커진다 — 900(두께 ×1.95)이면 4%쯤, 넉넉히 12%까지. */
const JAMO_GROWS: readonly number[] = [1, 1.03, 1.06, 1.09, 1.12]

const SLOT_COLOR: Record<SimsPart, string> = { CH: EDIT_COLOR.editSlotCh, JU: EDIT_COLOR.editSlotJu, JO: EDIT_COLOR.editSlotJo }

/** 풀린 상자로 중심선을 얻는다(굵기 배율 1). 틈 재기용. */
function gapStrokesOf(syllable: DecomposedSyllable, boxes: NonNullable<Parameters<typeof resolveGlyphInkPrimitives>[0]['placement']>, linecap: Parameters<typeof resolveGlyphInkPrimitives>[0]['globalLinecap'], linejoin: Parameters<typeof resolveGlyphInkPrimitives>[0]['globalLinejoin']): GapStroke[] {
  const result = resolveGlyphInkPrimitives({ syllable, placement: boxes, weightMultiplier: 1, globalLinecap: linecap, globalLinejoin: linejoin, horizontalInkBounds: { min: 0, max: 1 } })
  return result.primitives.map((primitive) => ({ points: primitive.stroke.points, closed: primitive.stroke.closed, box: primitive.box, thickness: primitive.stroke.thickness, part: primitive.source.part }))
}

/** 굵기 배율 상한 → 그 아래에서 가장 굵은 굵기 값(100–900). */
function weightUnder(multiplier: number, from: number): number {
  let weight = from
  while (weight + 5 <= 900 && weightToMultiplier(weight + 5) <= multiplier) weight += 5
  return weight
}


/** 글자 하나의 자모(그은 줄기 입힘) · 칸 해석. `AppGlyph`와 같은 길. */
function useGlyphBase(char: string, drawn: Drawn | undefined) {
  const storedChoseong = useJamoStore((state) => state.choseong)
  const storedJungseong = useJamoStore((state) => state.jungseong)
  const storedJongseong = useJamoStore((state) => state.jongseong)
  const baseLayout = useMemo(() => decomposeSyllable(char, storedChoseong, storedJungseong, storedJongseong).layoutType, [char, storedChoseong, storedJungseong, storedJongseong])
  const consonants = drawn?.consonants[baseLayout]
  const choseong = useMemo(() => consonants ? { ...storedChoseong, ...consonants.choseong } : storedChoseong, [storedChoseong, consonants])
  const jungseong = useMemo(() => drawn?.jungseong ? { ...storedJungseong, ...drawn.jungseong } : storedJungseong, [storedJungseong, drawn?.jungseong])
  const jongseong = useMemo(() => consonants ? { ...storedJongseong, ...consonants.jongseong } : storedJongseong, [storedJongseong, consonants])
  const schemas = useLayoutStore((state) => state.layoutSchemas)
  const globalPadding = useLayoutStore((state) => state.globalPadding)
  const paddingOverrides = useLayoutStore((state) => state.paddingOverrides)
  const syllable = useMemo(() => decomposeSyllable(char, choseong, jungseong, jongseong), [char, choseong, jungseong, jongseong])
  const effective = useEffectiveGlobalStyle(syllable.layoutType)
  const padding = useMemo(() => mergePadding(globalPadding, paddingOverrides[syllable.layoutType]), [globalPadding, paddingOverrides, syllable.layoutType])
  const schema = useMemo(() => ({ ...schemas[syllable.layoutType], padding, designBodyPadding: padding }), [schemas, syllable.layoutType, padding])
  const { placement } = useContextPlacement(syllable, schema, effective)
  return { syllable, effective, placement, padding }
}

// ── 울타리 보정(획 긋기 시험판과 같은 계산 `fenceBand.ts`) ──

/** 울타리 켬 · 선. 자소 줄이는 비율은 글줄 전체가 같이 쓴다(가장 많이 줄여야 하는 글자의 것). */
interface MoldFence { on: boolean; line: FenceLine; scale: number }
const FENCE_LINE_NAMES: Record<FenceLine, string> = { safe: '안전선', limit: '한계선' }
const BALLOON_NAMES: Record<BalloonGap, string> = { narrow: '좁게', normal: '보통', wide: '넓게' }

/** 렌더러와 같은 입구로 풀어 잰다(획 긋기 시험판의 `FencedGlyph`와 같은 길). */
function fenceMeasured(syllable: DecomposedSyllable, placement: GlyphInkPlacement, style: GlobalStyle) {
  const result = resolveGlyphInkPrimitives({ syllable, placement, weightMultiplier: weightToMultiplier(style.weight), globalLinecap: style.linecap, globalLinejoin: style.linejoin, horizontalInkBounds: { min: 0, max: 1 } })
  const strokes = result.primitives.map((primitive) => ({ part: primitive.source.part, box: primitive.box, points: primitive.stroke.points, closed: primitive.stroke.closed, thickness: primitive.stroke.thickness * primitive.weightMultiplier }))
  return { measure: measureGlyph(strokes), clearances: partClearances(strokes) }
}
const fenceBody = (padding: Padding) => GOTHIC_FENCE.engine.body * Math.max(0.5, 1 - padding.top - padding.bottom) / (1 - DEFAULT_GLOBAL_PADDING.top - DEFAULT_GLOBAL_PADDING.bottom)

/**
 * 빚은 칸에 울타리를 얹는다. 기준은 같은 글자를 기본 획(저장소) + 지금 빚은 칸으로 푼 것 — 빚은 칸은 사용자 것이라 그대로 두고,
 * 그은 획 때문에 생긴 것(휜 획이 닿음 · 받침 밑선 · 틈 · 윗선 · 무게중심)만 당긴다.
 * 1) 휜 획이 옆 자소에 닿으면 자소를 모두 같은 비율로 줄인다(비율은 `onNeed`로 올리고 글줄 공통 `fence.scale`로 받는다). 2) 배치 값 넷을 울타리 끝까지 당긴다.
 */
function fencedBoxes(input: { syllable: DecomposedSyllable; baseSyllable: DecomposedSyllable; boxes: Partial<Record<Part, BoxConfig>>; style: GlobalStyle; padding: Padding; fence: MoldFence }) {
  const { syllable, baseSyllable, boxes, style, padding, fence } = input
  const at = (target: DecomposedSyllable, ratio: number) => fenceMeasured(target, { kind: 'boxes', boxes: ratio === 1 ? boxes : scaledBoxes(boxes, ratio) }, style)
  const reference = at(baseSyllable, 1)
  const placed = at(syllable, 1)
  const floor = GOTHIC_FENCE.lines[fence.line].clearanceFloor
  const pulls: FencePull[] = []
  let need = 1
  let current = boxes
  let now = placed
  if (floor !== undefined && syllable !== baseSyllable) {
    need = pickJamoScale((ratio) => clearanceRatio(at(syllable, ratio).clearances, reference.clearances), floor)
    const fitted = at(syllable, fence.scale)
    const before = clearanceRatio(placed.clearances, reference.clearances), after = clearanceRatio(fitted.clearances, reference.clearances)
    pulls.push({ value: 'clearance', before, after, band: { lo: floor, hi: Infinity }, pulled: fence.scale - 1, left: after >= floor - 1e-3 ? 0 : floor - after })
    if (fence.on && fence.scale < 1) { current = scaledBoxes(boxes, fence.scale); now = fitted }
  }
  const scaledReference = fence.on && fence.scale < 1 ? at(baseSyllable, fence.scale) : reference
  if (!now.measure || !scaledReference.measure) return { boxes: current, pulls, need }
  const correction = correctGlyph({ layout: syllable.layoutType, now: now.measure, reference: scaledReference.measure, line: fence.line, body: fenceBody(padding) })
  return { boxes: fence.on ? movedBoxes(current, correction.moves) : current, pulls: [...pulls, ...correction.pulls], need }
}

/** 칸 편집(짜임) → 크기 · 키 · 폭(전체) 순서로 입힌 칸. 편집은 폭을 뺀 글자 단위다. */
function moldedBoxes(boxes: Partial<Record<Part, BoxConfig>>, layout: LayoutType, edits: LayoutEdits, look: Look) {
  return lookBoxes(applyPartEdits(boxes, edits[layout]), look, layout)
}

/**
 * 빚은 글자 하나. 칸을 풀고, 짜임 편집 · 폭 · 굵기 · 끝 모양을 차례로 입혀 그린다.
 * `sel`이 있으면 고른 부위만 제 색으로, 나머지는 옅게 그린다.
 */
function MoldGlyph({ char, size, edits, look, drawn, sel, highlight, shownStroke, testId, weightCap = Infinity, onCap, fence, onFence }: { char: string; size: number; edits: LayoutEdits; look: Look; drawn?: Drawn; sel?: Region | null; highlight?: readonly Part[]; shownStroke?: (key: string) => boolean; testId?: string; weightCap?: number; onCap?: (ratio: number) => void; fence?: MoldFence; onFence?: (need: number, pulls: readonly FencePull[]) => void }) {
  const { syllable: raw, effective, placement, padding } = useGlyphBase(char, drawn)
  const base = useGlyphBase(char, undefined)
  // 무게중심(거북이 A안): ㅏ · ㅓ 곁줄기 높이는 획에서, 첫닿자 밑변 · 보는 칸에서(`impressBoxes`) 옮긴다.
  // 닿자 크기 1 아래는 칸을 줄이기만 한다. 1 위는 풍선 닿자 — 칸은 그대로 두고 맨 끝(울타리까지 입힌 뒤)에서 부풀린다.
  const shaped = useMemo(() => {
    if (placement.kind !== 'boxes') return { syllable: raw, boxes: undefined }
    const boxes = moldedBoxes(placement.boxes, raw.layoutType, edits, { ...look, jamo: Math.min(1, lookOf(look, 'jamo')) })
    // 허리선 → 곁줄기 길이 → 손글씨 흔들림 → 부리 순서로(부리는 흔든 획 끝에 붙는다) 획을 고친다(획 다듬기 값은 획 모양만 바꾸고 칸은 두지 않는다).
    const waisted = waistSyllable(raw, waistLift(look, boxes), boxes)
    const stroked = serifSyllable(wobbleSyllable(branchSyllable(waisted, lookOf(look, 'branch')), lookOf(look, 'wobble'), boxes), lookOf(look, 'serif'), boxes)
    return { boxes, syllable: stroked }
  }, [placement, raw, edits, look])
  const syllable = shaped.syllable
  const molded = shaped.boxes

  // 굵기는 글줄 전체가 같다(다람쥐 검수 1번). 글자마다 "자소를 끝까지 키워도 획이 안 붙는 가장 굵은 비율"을 올리고, 글줄은 가장 작은 것을 다 같이 쓴다.
  // 그 굵기 안에서 획이 붙을 자리(ㄹ 가로 사이 등)가 생기는 글자만 자소 칸을 조금 키워 틈을 낸다 — 굵은 폰트도 자소가 줄지 않고 조금 커진다(거북이 자소별 표 2절).
  const wanted = lookOf(look, 'weight')
  const capRatio = useMemo(() => {
    if (!onCap || !molded || placement.kind !== 'boxes' || wanted <= 1) return Infinity
    const ref = gapStrokesOf(syllable, placement, effective.linecap, effective.linejoin)
    const last = JAMO_GROWS[JAMO_GROWS.length - 1]
    const capM = gapCapMultiplier(ref, gapStrokesOf(syllable, { kind: 'boxes', boxes: scaledBoxes(molded, last) }, effective.linecap, effective.linejoin), weightToMultiplier(effective.weight), 0)
    return capM === Infinity ? Infinity : Math.max(1, weightUnder(capM, 100) / effective.weight)
  }, [onCap, molded, placement, wanted, syllable, effective])
  useEffect(() => { onCap?.(capRatio) }, [onCap, capRatio])
  const ratio = appliedWeight(wanted, weightCap)
  const grown = useMemo(() => {
    if (!molded || placement.kind !== 'boxes' || ratio <= 1) return { boxes: molded, grow: 1 }
    const ref = gapStrokesOf(syllable, placement, effective.linecap, effective.linejoin)
    const baseM = weightToMultiplier(effective.weight)
    const needM = weightToMultiplier(scaledWeight(effective.weight, ratio))
    for (const grow of JAMO_GROWS) {
      const candidate = grow === 1 ? molded : scaledBoxes(molded, grow)
      if (gapCapMultiplier(ref, gapStrokesOf(syllable, { kind: 'boxes', boxes: candidate }, effective.linecap, effective.linejoin), baseM, 0) >= needM) return { boxes: candidate, grow }
    }
    const last = JAMO_GROWS[JAMO_GROWS.length - 1]
    return { boxes: scaledBoxes(molded, last), grow: last }
  }, [molded, placement, ratio, syllable, effective])

  // 울타리: 그은 획 때문에 칸 밖으로 나간 것을 당긴다. 기준 글자는 그은 게 없을 때 같은 칸의 모습.
  const fenced = useMemo(() => fence && grown.boxes ? fencedBoxes({ syllable, baseSyllable: drawn ? base.syllable : syllable, boxes: grown.boxes, style: effective, padding, fence }) : null, [fence, grown.boxes, syllable, base.syllable, drawn, effective, padding])
  useEffect(() => { if (fenced) onFence?.(fenced.need, fenced.pulls) }, [onFence, fenced])
  const fencedOut = fenced?.boxes ?? grown.boxes
  // 풍선 닿자(하니무스 2026-11-21): 보이는 글자 그대로(굵기 · 울타리까지 입힌 뒤) 잰다. 닿자 칸의 변과 획 하나하나가 같이 부풀고,
  // 잉크가 옆 자소와 최소 틈에 닿은 변 · 획만 멈춘다. 처음부터 그보다 가까운 쌍은 처음 틈을 지킨다. 글자 칸(0~1) 밖으로는 잉크가 안 나간다.
  const wantJamo = lookOf(look, 'jamo'), wantGap = lookOf(look, 'balloon')
  const balloon = useMemo(() => {
    if (!fencedOut || wantJamo <= 1) return { syllable, boxes: fencedOut }
    const multiplier = weightToMultiplier(ratio === 1 ? effective.weight : scaledWeight(effective.weight, ratio))
    const startInk = inkStrokes(syllable, fencedOut, effective, multiplier)
    const target: Partial<Record<PartPair, number>> = {}
    for (const [pair, near] of Object.entries(nearestBetweenParts(startInk)) as [PartPair, { gap: number }][]) target[pair] = Math.min(wantGap, near.gap)
    const edge = inkReach(startInk)
    const lo = Math.min(-BALLOON_EDGE, edge.lo), hi = Math.max(1 + BALLOON_EDGE, edge.hi)
    // 닿자 굵기는 닿자 크기에서 뗀다(다람쥐 세 번째 맞추기 3번: 홀자와 굵기가 따로 놂). 칸만 부풀고 획 두께는 글줄 굵기 그대로.
    const out = growSides(fencedOut, wantJamo, {}, (trial, thick) => {
      const ink = inkStrokes(inflateSyllable(syllable, thick), trial, effective, multiplier)
      const r = inkReach(ink)
      return r.lo >= lo - 1e-6 && r.hi <= hi + 1e-6 && balloonOk(nearestBetweenParts(ink), target)
    })
    return { syllable: inflateSyllable(syllable, out.thick), boxes: out.boxes }
  }, [fencedOut, wantJamo, wantGap, syllable, effective, ratio])
  const boxes = balloon.boxes
  const soft = lookOf(look, 'soft') > 0.5
  const round = lookOf(look, 'round'), contrast = lookOf(look, 'contrast')
  const globalStyle = useMemo(() => {
    const weighted = ratio === 1 ? effective : { ...effective, weight: scaledWeight(effective.weight, ratio) }
    const softened = soft ? { ...weighted, linecap: 'round' as const, linejoin: 'round' as const } : weighted
    // 둥글기 · 획 대비는 엔진의 붓 값(둥근 붓촉에서만 뜻이 있다)에 그대로 얹는다.
    if ((round === 0 && contrast === 0) || softened.strokeStyle.mode !== 'brush') return softened
    return { ...softened, strokeStyle: { ...softened.strokeStyle, ...(round > 0 ? { roundness: round, innerRoundness: round * 2 } : {}), ...(contrast !== 0 ? { contrast } : {}) } }
  }, [effective, ratio, soft, round, contrast])
  const colorOf = useCallback((source: ResolvedStrokeInkSource) => {
    if (shownStroke) return shownStroke(`${simsPartOf(source.part)}:${source.jamoId}:${source.strokeId}`) ? undefined : 'transparent'
    // 잡은 보선 양쪽 부위만 제 색(선 이름 대신).
    if (highlight) return highlight.includes(source.part) ? SLOT_COLOR[simsPartOf(source.part)] : EDIT_COLOR.editSlotOff
    if (sel === 'STROKE') return EDIT_COLOR.editSelect
    if (sel === 'CH' || sel === 'JU' || sel === 'JO') return simsPartOf(source.part) === sel ? SLOT_COLOR[sel] : EDIT_COLOR.editSlotOff
    return undefined
  }, [sel, shownStroke, highlight])

  // 폭이 좁아지면 글자 칸도 같이 좁힌다. 자간은 글자 사이를 더하거나 뺀다.
  const scale = placement.kind === 'boxes' ? lookScale(placement.boxes, look).sx : lookOf(look, 'frame') * lookOf(look, 'size')
  const slot = { width: size * scale + size * lookOf(look, 'tracking'), marginInline: 0 }
  return <span className={styles.glyph} style={slot} data-testid={testId}>
    <SvgRenderer
      syllable={balloon.syllable}
      schema={placement.kind === 'schema' ? placement.schema : undefined}
      boxes={boxes}
      size={size}
      globalStyle={globalStyle}
      overflow="visible"
      clipGlyphs={false}
      strokeColorOf={shownStroke || highlight || (sel && sel !== 'WHOLE') ? colorOf : undefined}
    />
  </span>
}

/** 판에 까는 점선 길잡이(획 긋기 시험판과 같은 모양). */
const PAD_W = 0.75
const VIEW = 1000
const PAD_INK = 0.06
const UNIT_BOX = { x: 0, y: 0, width: 1, height: 1 }
function Guide({ kind }: { kind: StemKind }) {
  const props = { fill: 'none', stroke: EDIT_COLOR.editGuide, strokeWidth: 4, strokeDasharray: '12 16', strokeLinecap: 'round' as const }
  const cx = PAD_W * VIEW / 2
  if (kind === 'vertical') return <line x1={cx} y1={150} x2={cx} y2={850} {...props} />
  if (kind === 'shortVertical') return <line x1={cx} y1={340} x2={cx} y2={660} {...props} />
  if (kind === 'horizontal') return <line x1={cx - 150} y1={500} x2={cx + 150} y2={500} {...props} />
  if (kind === 'longHorizontal') return <line x1={70} y1={500} x2={PAD_W * VIEW - 70} y2={500} {...props} />
  if (kind === 'diagonal') return <line x1={cx + 200} y1={240} x2={cx - 200} y2={760} {...props} />
  return <circle cx={cx} cy={500} r={240} {...props} />
}
const clamp01 = (value: number, max: number) => Math.max(0, Math.min(max, value))
function pointsOf(event: ReactPointerEvent<SVGSVGElement>): PenPoint[] {
  const rect = event.currentTarget.getBoundingClientRect()
  const native = event.nativeEvent as globalThis.PointerEvent & { getCoalescedEvents?: () => globalThis.PointerEvent[] }
  const list = native.getCoalescedEvents?.() ?? []
  const one = (x: number, y: number) => ({ x: clamp01((x - rect.left) / rect.width * PAD_W, PAD_W), y: clamp01((y - rect.top) / rect.height, 1) })
  return list.length ? list.map((item) => one(item.clientX, item.clientY)) : [one(event.clientX, event.clientY)]
}
const rawPath = (raw: readonly PenPoint[]) => raw.map((point, i) => `${i === 0 ? 'M' : 'L'}${(point.x * VIEW).toFixed(1)} ${(point.y * VIEW).toFixed(1)}`).join(' ')

/** 1단계: 줄기 여섯 긋기. 줄기 하나에 한 번, 다시 그으면 바뀐다. */
function DrawStep({ raws, setRaws, stems, onDone }: { raws: Partial<Record<StemKind, PenPoint[]>>; setRaws: (update: (all: Partial<Record<StemKind, PenPoint[]>>) => Partial<Record<StemKind, PenPoint[]>>) => void; stems: Partial<Record<StemKind, DrawnStem>>; onDone: () => void }) {
  const [kind, setKind] = useState<StemKind>('vertical')
  const [current, setCurrent] = useState<PenPoint[] | null>(null)
  const drawing = useRef<PenPoint[] | null>(null)
  const active = useRef<number | null>(null)
  const padRef = useRef<SVGSVGElement>(null)
  // iOS Safari는 SVG의 `touch-action: none`을 건너뛰기도 한다. 터치 이동을 직접 막는다.
  useEffect(() => {
    const pad = padRef.current
    if (!pad) return
    const block = (event: TouchEvent) => { if (event.cancelable) event.preventDefault() }
    pad.addEventListener('touchstart', block, { passive: false })
    pad.addEventListener('touchmove', block, { passive: false })
    return () => { pad.removeEventListener('touchstart', block); pad.removeEventListener('touchmove', block) }
  }, [])
  const stem = stems[kind]
  const info = stemInfo(kind)
  const index = STEMS.findIndex((item) => item.kind === kind)
  const next = STEMS[index + 1]
  const done = STEMS.filter((item) => stems[item.kind]?.ok).length
  const note = stem && !stem.ok ? '다시 한 번 그어 주세요' : stem?.ok ? `${info.term}로 받았어요. 길이와 자리는 우리가 맞췄어요.` : info.hint

  return <section className={styles.panel} aria-label="긋기">
    <nav className={styles.stems} aria-label="줄기">
      {STEMS.map((item, at) => <Button key={item.kind} variant="chip" size="chip" aria-selected={item.kind === kind} data-done={stems[item.kind]?.ok || undefined} onClick={() => setKind(item.kind)} data-testid={`mold-stem-${item.kind}`}>
        {stems[item.kind]?.ok ? <Check aria-hidden="true" /> : <span className={styles.stemNo}>{at + 1}</span>}{item.label}
      </Button>)}
    </nav>
    <svg ref={padRef} viewBox={`0 0 ${PAD_W * VIEW} ${VIEW}`} className={styles.pad} data-testid="mold-pad"
      onPointerDown={(event) => {
        if ((event.pointerType === 'mouse' && event.button !== 0) || active.current !== null) return
        event.currentTarget.setPointerCapture(event.pointerId)
        active.current = event.pointerId
        drawing.current = pointsOf(event)
        setCurrent(drawing.current)
      }}
      onPointerMove={(event) => {
        if (!drawing.current || event.pointerId !== active.current) return
        drawing.current = [...drawing.current, ...pointsOf(event)]
        setCurrent(drawing.current)
      }}
      onPointerUp={(event) => {
        if (event.pointerId !== active.current) return
        active.current = null
        const points = drawing.current
        drawing.current = null
        setCurrent(null)
        if (points && points.length >= 2) setRaws((all) => ({ ...all, [kind]: points }))
      }}
      onPointerCancel={() => { active.current = null; drawing.current = null; setCurrent(null) }}>
      <Guide kind={kind} />
      {!current && stem?.ok && <path d={pointsToSvgD(stem.fit.stroke.points, kind === 'circle', UNIT_BOX, VIEW)} fill="none" stroke={EDIT_COLOR.foreground} strokeWidth={PAD_INK * VIEW} strokeLinecap="round" strokeLinejoin="round" />}
      {current && <path d={rawPath(current)} fill="none" stroke={EDIT_COLOR.foreground} strokeWidth={PAD_INK * VIEW} strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
    <p className={styles.padNote} data-state={stem && !stem.ok ? 'warn' : stem?.ok ? 'done' : undefined}>{note}</p>
    <div className={styles.actions}>
      <Button variant="outline" size="block" disabled={!raws[kind]} onClick={() => setRaws((all) => ({ ...all, [kind]: undefined }))}><RotateCcw aria-hidden="true" />다시 긋기</Button>
      {next
        ? <Button variant={stem?.ok ? 'default' : 'outline'} size="block" onClick={() => setKind(next.kind)} data-testid="mold-stem-next">{next.label}<ChevronRight aria-hidden="true" /></Button>
        : <Button size="block" onClick={onDone} data-testid="mold-to-mold">빚기로<ChevronRight aria-hidden="true" /></Button>}
    </div>
    {done < STEMS.length && <Button variant="ghost" size="sm" className={styles.center} onClick={onDone} data-testid="mold-skip-draw">{done ? `${done}개만 긋고 빚기로` : '기본 획으로 빚기로'}</Button>}
  </section>
}


/** 젤리: 보이는 값이 목표 값을 스프링으로 따라가 살짝 넘쳤다 돌아온다. */
function useSpring(target: Record<string, number>): Record<string, number> {
  const cur = useRef<Record<string, number>>({ ...target })
  const vel = useRef<Record<string, number>>({})
  const goal = useRef(target)
  const frame = useRef<number | null>(null)
  const [, setTick] = useState(0)
  goal.current = target
  const key = JSON.stringify(target)
  useEffect(() => {
    if (frame.current !== null) return
    const step = () => {
      let moving = false
      for (const [name, aim] of Object.entries(goal.current)) {
        const now = cur.current[name] ?? aim
        const v = ((vel.current[name] ?? 0) + (aim - now) * 0.22) * 0.68
        const next = now + v
        if (Math.abs(aim - next) > 1e-4 || Math.abs(v) > 1e-4) { moving = true; cur.current[name] = next; vel.current[name] = v }
        else { cur.current[name] = aim; vel.current[name] = 0 }
      }
      setTick((n) => n + 1)
      frame.current = moving ? requestAnimationFrame(step) : null
    }
    frame.current = requestAnimationFrame(step)
  }, [key])
  // 개발 모드(StrictMode)는 효과를 한 번 껐다 켠다. 끌 때 표시를 지워야 다시 켤 때 스프링이 돈다.
  useEffect(() => () => { if (frame.current !== null) cancelAnimationFrame(frame.current); frame.current = null }, [])
  return cur.current
}

const LOOK_KEYS = ['weight', 'soft', 'frame', 'tracking', 'size', 'height', 'jamo', 'center', 'round', 'contrast', 'balloon', 'open', 'branch', 'serif', 'wobble'] as const
const STAGE = 220
const ALL_PARTS: readonly Part[] = ['CH', 'JU', 'JU_H', 'JU_V', 'JO']
/** 기둥 선을 1(글자 단위) 끌면 굵기 비율이 이만큼 바뀐다. 끝에서 끝(0.25~2.25)까지 무대의 2/3쯤 — 조금 끌어 최대로 튀지 않게(하니무스 2026-11-21). */
const STEM_GAIN = 3
/** 선 · 손잡이 잡는 폭(px). 폰 손가락 크기. */
const GRAB_PX = 14
const HANDLE = { long: 20, short: 11 }
const RULER = 14

type Mode = 'shape' | 'part'
/** 무대에 까는 선 하나. 자리는 보이는 글자 단위(전체 값까지 입힌 것). */
interface GuideLine {
  id: string
  axis: 'h' | 'v'
  pos: number
  color: string
  dashed?: boolean
  /** 손잡이를 선의 어느 끝에(가로선은 오른쪽, 세로선은 아래 · 위) */
  end: 'start' | 'end'
  /** 눈금자: 움직일 수 있는 범위와 처음 자리 */
  lo: number; hi: number; origin: number
  /** 잡으면 제 색을 입힐 부위(보선의 양쪽) */
  parts?: readonly Part[]
  /** 잡은 뒤 d(보이는 글자 단위)만큼 끌었을 때. 벽에 막혔으면 false */
  drag: (d: number) => boolean
}
type Grab =
  | { kind: 'line'; line: GuideLine; x0: number; y0: number; moved: boolean; last?: number }
  | { kind: 'tip'; x0: number; y0: number; moved: boolean; soft: number; dir: [number, number] }
  | { kind: 'move'; part: Part; x0: number; y0: number; moved: boolean; edits: PartEdits; gaps?: Clearances }
  | { kind: 'tap'; x0: number; y0: number; moved: boolean }

/** 부위를 옮길 때 획끼리 지킬 틈(em). 처음부터 이보다 가까웠으면 그 틈을 지킨다. */
const INK_GAP = 0.02
const groupOf = (part: Part): 'CH' | 'JU' | 'JO' => (part === 'CH' ? 'CH' : part === 'JO' ? 'JO' : 'JU')
function inkStrokes(syllable: DecomposedSyllable, boxes: Partial<Record<Part, BoxConfig>>, style: GlobalStyle, multiplier: number) {
  const result = resolveGlyphInkPrimitives({ syllable, placement: { kind: 'boxes', boxes }, weightMultiplier: multiplier, globalLinecap: style.linecap, globalLinejoin: style.linejoin, horizontalInkBounds: { min: 0, max: 1 } })
  return result.primitives.map((primitive) => ({ part: primitive.source.part, box: primitive.box, points: primitive.stroke.points, closed: primitive.stroke.closed, thickness: primitive.stroke.thickness * primitive.weightMultiplier }))
}

/** 풍선 닿자 잉크가 글자 칸 밖으로 나가도 되는 만큼(em). 옆 글자와 닿지 않을 만큼만. */
const BALLOON_EDGE = 0.01
/** 첫닿자 · 받침 잉크가 닿는 가장 바깥(글자 단위, 가로 · 세로 같이). 풍선 닿자가 글자 칸 밖으로 안 나가게. */
function inkReach(strokes: ReturnType<typeof inkStrokes>) {
  let lo = Infinity, hi = -Infinity
  for (const s of strokes) {
    if (s.part !== 'CH' && s.part !== 'JO') continue
    const half = (s.thickness ?? 0) / 2
    for (const q of s.points) {
      const x = s.box.x + q.x * s.box.width, y = s.box.y + q.y * s.box.height
      lo = Math.min(lo, x - half, y - half); hi = Math.max(hi, x + half, y + half)
    }
  }
  return { lo, hi }
}

/** 홀자 기둥(가장 긴 곧은 줄기)과 곁줄기 끝. 보이는 글자 단위. */
function stemOf(syllable: DecomposedSyllable, boxes: Partial<Record<Part, BoxConfig>>, style: GlobalStyle, multiplier: number) {
  const result = resolveGlyphInkPrimitives({ syllable, placement: { kind: 'boxes', boxes }, weightMultiplier: multiplier, globalLinecap: style.linecap, globalLinejoin: style.linejoin, horizontalInkBounds: { min: 0, max: 1 } })
  const lines = result.primitives.filter((p) => p.source.part.startsWith('JU') && p.stroke.points.length === 2 && !p.stroke.closed).map((p) => {
    const at = (q: { x: number; y: number }) => ({ x: p.box.x + q.x * p.box.width, y: p.box.y + q.y * p.box.height })
    const a = at(p.stroke.points[0]), z = at(p.stroke.points[1])
    return { a, z, len: Math.hypot(z.x - a.x, z.y - a.y), thick: p.stroke.thickness * p.weightMultiplier }
  })
  if (!lines.length) return null
  const vertical = lines.filter((l) => Math.abs(l.z.x - l.a.x) < 0.01)
  const stem = [...(vertical.length ? vertical : lines)].sort((p, q) => q.len - p.len)[0]
  const axis: 'h' | 'v' = Math.abs(stem.z.x - stem.a.x) < 0.01 ? 'v' : 'h'
  const c = axis === 'v' ? stem.a.x : stem.a.y
  const branch = lines.filter((l) => l !== stem).sort((p, q) => p.len - q.len)[0]
  let tip: { x: number; y: number; dir: [number, number] } | null = null
  if (branch) {
    const da = Math.abs((axis === 'v' ? branch.a.x : branch.a.y) - c), dz = Math.abs((axis === 'v' ? branch.z.x : branch.z.y) - c)
    const end = dz > da ? branch.z : branch.a
    const sign = Math.sign((axis === 'v' ? end.x : end.y) - c) || 1
    tip = { x: end.x, y: end.y, dir: axis === 'v' ? [sign, 0] : [0, sign] }
  }
  return { axis, c, thick: stem.thick, tip }
}

/**
 * 빚기 무대(보선 끌기, A안). 상자 없이 화면 끝까지 가는 선을 끈다.
 * - 인상 잡기(shape): 바깥 파란 선 넷(위 · 아래 = 키, 왼 · 오른 = 폭), 기둥을 감싼 주황 두 선(벌리면 굵게), 곁줄기 끝 점(당기면 둥글게). 크기는 두 손가락.
 * - 부위 다듬기(part): 부위 사이 보선(양쪽 부위가 나눠 쓴다). 부위를 끌면 다른 부위와 겹치지 않는 데까지 통째로 옮긴다. 홀자를 누르면 기둥 두 선 · 끝 점도 뜬다.
 * 왼쪽(가로선) · 아래(세로선) 눈금자에 지금 자리, 처음 자리(점선), 움직일 수 있는 범위(옅은 띠). 선은 여섯 개 이하, 잡은 선만 진하게.
 */
function SimsStep({ mode, char, drawn, edits, setEdits, look, setLook, weightCap, weightNote, sel, setSel, onBegin, fence }: {
  mode: Mode
  fence?: MoldFence
  char: string; drawn?: Drawn; edits: LayoutEdits; setEdits: (update: (now: LayoutEdits) => LayoutEdits) => void
  look: Look; setLook: (next: Look) => void; weightCap: number; weightNote?: string; sel: Region | null; setSel: (region: Region | null) => void; onBegin: () => void
}) {
  const { syllable, placement, effective } = useGlyphBase(char, drawn)
  const layout = syllable.layoutType
  const origin = useMemo<Partial<Record<Part, BoxConfig>>>(() => placement.kind === 'boxes' ? placement.boxes : {}, [placement])
  const stageRef = useRef<HTMLDivElement>(null)
  const [stageW, setStageW] = useState(320)
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setStageW(el.clientWidth))
    ro.observe(el)
    setStageW(el.clientWidth)
    return () => ro.disconnect()
  }, [])
  const off = (stageW - STAGE) / 2
  const px = (u: number) => off + u * STAGE
  const [active, setActive] = useState<GuideLine | null>(null)
  const [bump, setBump] = useState(0)
  const lastBump = useRef(0)
  const bumpWall = () => { const now = Date.now(); if (now - lastBump.current > 450) { lastBump.current = now; setBump((n) => n + 1) } }
  const grab = useRef<Grab | null>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<{ d0: number; size: number } | null>(null)

  // 큰 글자만 젤리로 따라온다(글줄은 손 그대로).
  const target = useMemo(() => {
    const out: Record<string, number> = {}
    const mine = edits[layout] ?? {}
    for (const key of ['CH', 'JU', 'JU_H', 'JU_V', 'JO'] as const) (mine[key] ?? [0, 0, 0, 0]).forEach((value, i) => { out[`${key}${i}`] = value })
    for (const key of LOOK_KEYS) out[key] = lookOf(look, key)
    return out
  }, [edits, layout, look])
  const shown = useSpring(target)
  const shownEdits: LayoutEdits = { [layout]: Object.fromEntries((['CH', 'JU', 'JU_H', 'JU_V', 'JO'] as const).filter((key) => edits[layout]?.[key]).map((key) => [key, [0, 1, 2, 3].map((i) => shown[`${key}${i}`] ?? 0)])) }
  const shownLook: Look = Object.fromEntries(LOOK_KEYS.map((key) => [key, shown[key]]))

  // 지금(보이기 전) 칸 · 보이는 칸
  const now = applyPartEdits(origin, edits[layout])
  const sx = lookOf(look, 'frame') * lookOf(look, 'size'), sy = lookOf(look, 'height') * lookOf(look, 'size')
  const tx = (u: number) => 0.5 + (u - 0.5) * sx, ty = (v: number) => 0.5 + (v - 0.5) * sy
  const ratio = appliedWeight(lookOf(look, 'weight'), weightCap)
  const multiplier = weightToMultiplier(scaledWeight(effective.weight, ratio))
  const stem = useMemo(() => placement.kind === 'boxes' ? stemOf(syllable, moldedBoxes(placement.boxes, layout, edits, look), effective, multiplier) : null, [placement, syllable, layout, edits, look, effective, multiplier])

  // ── 선 만들기(지금 값으로. 끌기는 잡은 때의 값에서 셈한다) ──
  const lines: GuideLine[] = []
  const bounds = (() => {
    const all = Object.values(origin).filter((b): b is BoxConfig => !!b)
    if (!all.length) return [0, 0, 1, 1]
    return [Math.min(...all.map((b) => b.x)), Math.min(...all.map((b) => b.y)), Math.max(...all.map((b) => b.x + b.width)), Math.max(...all.map((b) => b.y + b.height))]
  })()
  if (mode === 'shape') {
    const outer = (id: string, axis: 'h' | 'v', base: number, key: 'height' | 'frame') => {
      const startLook = look
      const k0 = lookOf(look, key), size = lookOf(look, 'size')
      const posOf = (k: number) => 0.5 + (base - 0.5) * k * size
      const [w0, w1] = LOOK_WALL[key]
      lines.push({
        id, axis, pos: posOf(k0), color: EDIT_COLOR.editSelect, end: 'end', lo: Math.min(posOf(w0), posOf(w1)), hi: Math.max(posOf(w0), posOf(w1)), origin: 0.5 + (base - 0.5) * size,
        drag: (d) => { const want = (posOf(k0) + d - 0.5) / ((base - 0.5) * size); const k = Math.max(w0, Math.min(w1, want)); setLook({ ...startLook, [key]: k }); return k === want },
      })
    }
    outer('top', 'h', bounds[1], 'height'); outer('bottom', 'h', bounds[3], 'height'); outer('left', 'v', bounds[0], 'frame'); outer('right', 'v', bounds[2], 'frame')
  }
  if (stem && mode === 'shape') {
    const startLook = look, r0 = lookOf(look, 'weight')
    const half = stem.thick / 2
    const baseHalf = half / multiplier * weightToMultiplier(effective.weight)
    const [w0, w1] = LOOK_WALL.weight
    const halfAt = (r: number) => baseHalf / weightToMultiplier(effective.weight) * weightToMultiplier(scaledWeight(effective.weight, Math.min(r, weightCap)))
    for (const side of [-1, 1] as const) {
      lines.push({
        id: `stem${side}`, axis: stem.axis, pos: stem.c + side * half, color: SLOT_COLOR.CH, dashed: true, end: 'start',
        lo: Math.min(stem.c + side * halfAt(w0), stem.c + side * halfAt(w1)), hi: Math.max(stem.c + side * halfAt(w0), stem.c + side * halfAt(w1)), origin: stem.c + side * baseHalf,
        drag: (d) => { const want = r0 + side * d * STEM_GAIN; const r = Math.max(w0, Math.min(w1, want)); setLook({ ...startLook, weight: r }); return r === want && appliedWeight(r, weightCap) === r },
      })
    }
  }
  if (mode === 'part') {
    seamsOf(layout, origin).forEach((seam, i) => {
      const v = seam.axis === 'v', scale = v ? sx : sy, t = v ? tx : ty
      const startEdits = edits[layout] ?? {}
      const pre = seamPos(seam, now)
      const [lo, hi] = seamRange(seam, origin, now)
      const color = seam.b.includes('JO') ? SLOT_COLOR.JO : SLOT_COLOR.JU
      lines.push({
        id: `seam${i}`, axis: seam.axis, pos: t(pre), color, end: 'end', lo: t(pre + lo), hi: t(pre + hi), origin: t(seamPos(seam, origin)), parts: [...seam.a, ...seam.b],
        drag: (d) => { const out = dragSeam(seam, origin, startEdits, d / scale); setEdits((all) => ({ ...all, [layout]: out.edits })); return !out.clamped },
      })
    })
  }
  const shownLines = lines.slice(0, 6)
  // 굵기 · 획 끝은 인상 잡기(도트판)에서만 만진다(하니무스 2026-11-21). 부위 다듬기에는 자리 · 크기만.
  const tip = stem?.tip && mode === 'shape' ? stem.tip : null

  // ── 손 ──
  const local = (event: ReactPointerEvent<HTMLDivElement>) => { const r = event.currentTarget.getBoundingClientRect(); return { x: event.clientX - r.left, y: event.clientY - r.top } }
  const handleAt = (line: GuideLine) => line.axis === 'h' ? { x: stageW - HANDLE.long / 2 - 4, y: px(line.pos) } : { x: px(line.pos), y: line.end === 'start' ? HANDLE.long / 2 + 4 : stageW - RULER - HANDLE.long / 2 - 4 }
  const partAt = (x: number, y: number): Part | null => {
    const u = (x - off) / STAGE, v = (y - off) / STAGE
    const shownBoxes = placement.kind === 'boxes' ? moldedBoxes(placement.boxes, layout, edits, look) : {}
    let best: { part: Part; d: number } | null = null
    for (const part of ALL_PARTS) {
      const b = shownBoxes[part]
      if (!b) continue
      const dx = Math.max(b.x - u, 0, u - b.x - b.width), dy = Math.max(b.y - v, 0, v - b.y - b.height)
      const d = dx === 0 && dy === 0 ? -1 + b.width * b.height : Math.hypot(dx, dy) // 칸 안이면 작은 칸이 먼저(겹친 칸에서 홀자 · 받침을 잡기 쉽게)
      if (!best || d < best.d) best = { part, d }
    }
    return best && best.d < 0.05 ? best.part : null
  }
  const begin = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (placement.kind !== 'boxes') return
    event.currentTarget.setPointerCapture(event.pointerId)
    const at = local(event)
    pointers.current.set(event.pointerId, at)
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      pinch.current = { d0: Math.hypot(a.x - b.x, a.y - b.y), size: lookOf(look, 'size') }
      grab.current = null; onBegin(); return
    }
    if (tip && Math.hypot(at.x - px(tip.x), at.y - px(tip.y)) < GRAB_PX + 4) { grab.current = { kind: 'tip', x0: at.x, y0: at.y, moved: false, soft: lookOf(look, 'soft'), dir: tip.dir }; return }
    let hit: GuideLine | null = null, best = GRAB_PX
    for (const line of shownLines) {
      const h = handleAt(line)
      // 손잡이는 넉넉히, 선 몸통은 좁게(선이 획 위를 지나도 획을 누를 수 있게). 끌지 않고 떼면 그 자리 부위를 고른다.
      const d = Math.min(Math.hypot(at.x - h.x, at.y - h.y) * 0.6, (line.axis === 'h' ? Math.abs(at.y - px(line.pos)) : Math.abs(at.x - px(line.pos))) * 1.6)
      if (d < best) { best = d; hit = line }
    }
    if (hit) { grab.current = { kind: 'line', line: hit, x0: at.x, y0: at.y, moved: false }; setActive(hit); return }
    const part = mode === 'part' ? partAt(at.x, at.y) : null
    if (part) { grab.current = { kind: 'move', part, x0: at.x, y0: at.y, moved: false, edits: edits[layout] ?? {} }; return }
    grab.current = { kind: 'tap', x0: at.x, y0: at.y, moved: false }
  }
  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) return
    const at = local(event)
    pointers.current.set(event.pointerId, at)
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      const want = pinch.current.size * Math.hypot(a.x - b.x, a.y - b.y) / pinch.current.d0
      const size = Math.max(LOOK_WALL.size[0], Math.min(LOOK_WALL.size[1], want))
      if (size !== want) bumpWall()
      setLook({ ...look, size }); return
    }
    const g = grab.current
    if (!g) return
    const dx = at.x - g.x0, dy = at.y - g.y0
    if (!g.moved) { if (Math.hypot(dx, dy) < 4) return; g.moved = true; onBegin() }
    let ok = true
    if (g.kind === 'line') ok = g.line.drag((g.line.axis === 'h' ? dy : dx) / STAGE)
    else if (g.kind === 'tip') { const want = g.soft + (dx * g.dir[0] + dy * g.dir[1]) / STAGE * 8; const soft = Math.max(0, Math.min(1, want)); ok = soft === want; setLook({ ...look, soft }) }
    else if (g.kind === 'move') {
      if (sel !== simsPartOf(g.part)) setSel(simsPartOf(g.part))
      const startBoxes = applyPartEdits(origin, g.edits)
      const want = { du: dx / STAGE / sx, dv: dy / STAGE / sy }
      // 글자 끝(0.02~0.98)은 상자로, 다른 부위와는 획(잉크)끼리 닿기 전에 멈춘다 — 상자끼리는 원래 겹쳐 있어도 획은 떨어져 있다.
      const boxed = moveApart({ [g.part]: startBoxes[g.part] }, g.part, want.du, want.dv)
      const gapsAt = (du: number, dv: number) => partClearances(inkStrokes(syllable, applyPartEdits(origin, movePartEdit(g.edits, g.part, du, dv)), effective, multiplier))
      const start = g.gaps ?? (g.gaps = gapsAt(0, 0))
      const clear = (du: number, dv: number) => { const gaps = gapsAt(du, dv); return (Object.keys(start) as PartPair[]).every((pair) => !pair.includes(groupOf(g.part)) || (gaps[pair] ?? 1) >= Math.min(start[pair] ?? 1, INK_GAP) - 1e-4) }
      const furthest = (ok0: (t: number) => boolean) => { if (ok0(1)) return 1; let lo = 0, hi = 1; for (let i = 0; i < 10; i++) { const mid = (lo + hi) / 2; if (ok0(mid)) lo = mid; else hi = mid } return lo }
      const u = boxed.du * furthest((t) => clear(boxed.du * t, 0))
      const v = boxed.dv * furthest((t) => clear(u, boxed.dv * t))
      ok = Math.abs(u - want.du) < 1e-6 && Math.abs(v - want.dv) < 1e-6
      setEdits((all) => ({ ...all, [layout]: movePartEdit(g.edits, g.part, u, v) }))
    }
    if (!ok) bumpWall()
  }
  const end = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId)
    if (pointers.current.size < 2) pinch.current = null
    const g = grab.current
    grab.current = null
    setActive(null)
    if (!g || g.moved || mode !== 'part') return
    if (g.kind === 'tap' || g.kind === 'move' || g.kind === 'line') { const part = partAt(g.x0, g.y0); setSel(part ? simsPartOf(part) : null) }
  }
  const onWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey) return
    const size = Math.max(LOOK_WALL.size[0], Math.min(LOOK_WALL.size[1], lookOf(look, 'size') * Math.exp(-event.deltaY * 0.004)))
    setLook({ ...look, size })
  }
  // ctrl + 휠이 브라우저 확대로 새지 않게
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const block = (event: WheelEvent) => { if (event.ctrlKey) event.preventDefault() }
    el.addEventListener('wheel', block, { passive: false })
    return () => el.removeEventListener('wheel', block)
  }, [])

  // 잡은 보선의 양쪽 부위에만 색. 부위를 골랐으면 그 부위.
  const highlight = active?.parts ?? (mode === 'part' && sel && sel !== 'STROKE' && sel !== 'WHOLE' ? ALL_PARTS.filter((part) => simsPartOf(part) === sel) : undefined)
  const activeNow = active ? shownLines.find((line) => line.id === active.id) ?? null : null
  const sizeText = (part: Part) => { const b = now[part]; return b ? `${Math.round(b.width * 100)}×${Math.round(b.height * 100)}` : '' }
  const readout = mode === 'shape'
    ? `크기 ×${lookOf(look, 'size').toFixed(2)} · 키 ×${lookOf(look, 'height').toFixed(2)} · 폭 ×${lookOf(look, 'frame').toFixed(2)} · 굵기 ${scaledWeight(effective.weight, ratio)} · 끝 ${lookOf(look, 'soft') > 0.5 ? '둥긂' : '또렷'} · 자간 ${lookOf(look, 'tracking') >= 0 ? '+' : ''}${Math.round(lookOf(look, 'tracking') * 100)}%`
    : (activeNow?.parts ?? (highlight ?? [])).filter((part) => now[part]).map((part) => `${PART_NAMES[part]} ${sizeText(part)}`).join(' · ')

  return <section className={styles.panel} aria-label={mode === 'shape' ? '인상 잡기' : '부위 다듬기'}>
    <div ref={stageRef} className={styles.stage} onPointerDown={begin} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onWheel={onWheel} data-active={active?.id} data-testid="mold-stage">
      <div className={styles.bumper} data-bump={bump === 0 ? undefined : bump % 2 ? 'a' : 'b'} data-testid="mold-bumper">
        <div className={styles.stageGlyph}>
          <MoldGlyph char={char} size={STAGE} edits={shownEdits} look={shownLook} drawn={drawn} highlight={highlight} weightCap={weightCap} fence={fence} testId="mold-focus" />
        </div>
      </div>
      <svg className={styles.guides} width={stageW} height={stageW} aria-hidden="true">
        <rect x={0} y={0} width={RULER} height={stageW} fill={EDIT_COLOR.border} />
        <rect x={0} y={stageW - RULER} width={stageW} height={RULER} fill={EDIT_COLOR.border} />
        {Array.from({ length: 19 }, (_, i) => (i + 1) / 20).map((u) => <g key={u} stroke={EDIT_COLOR.editGuide} strokeWidth={1}>
          <line x1={0} y1={u * stageW} x2={u === 0.5 ? 8 : 4} y2={u * stageW} />
          <line x1={u * stageW} y1={stageW} x2={u * stageW} y2={stageW - (u === 0.5 ? 8 : 4)} />
        </g>)}
        {activeNow && (activeNow.axis === 'h'
          ? <g data-testid="mold-ruler"><rect x={0} y={px(activeNow.lo)} width={RULER} height={Math.max(2, px(activeNow.hi) - px(activeNow.lo))} fill={activeNow.color} opacity={0.2} />
            <line x1={0} x2={RULER} y1={px(activeNow.origin)} y2={px(activeNow.origin)} stroke={activeNow.color} strokeWidth={1.5} strokeDasharray="3 2" />
            <line x1={0} x2={RULER} y1={px(activeNow.pos)} y2={px(activeNow.pos)} stroke={activeNow.color} strokeWidth={3} /></g>
          : <g data-testid="mold-ruler"><rect y={stageW - RULER} x={px(activeNow.lo)} height={RULER} width={Math.max(2, px(activeNow.hi) - px(activeNow.lo))} fill={activeNow.color} opacity={0.2} />
            <line y1={stageW - RULER} y2={stageW} x1={px(activeNow.origin)} x2={px(activeNow.origin)} stroke={activeNow.color} strokeWidth={1.5} strokeDasharray="3 2" />
            <line y1={stageW - RULER} y2={stageW} x1={px(activeNow.pos)} x2={px(activeNow.pos)} stroke={activeNow.color} strokeWidth={3} /></g>)}
        {shownLines.map((line) => {
          const on = active?.id === line.id
          const p = px(line.pos), h = handleAt(line)
          return <g key={line.id} opacity={active && !on ? 0.35 : on ? 1 : 0.7} data-testid={`mold-line-${line.id}`}>
            {line.axis === 'h'
              ? <line x1={RULER} x2={stageW} y1={p} y2={p} stroke={line.color} strokeWidth={on ? 2 : 1.25} strokeDasharray={line.dashed ? '5 3' : undefined} />
              : <line y1={0} y2={stageW - RULER} x1={p} x2={p} stroke={line.color} strokeWidth={on ? 2 : 1.25} strokeDasharray={line.dashed ? '5 3' : undefined} />}
            <rect x={h.x - (line.axis === 'h' ? HANDLE.long : HANDLE.short) / 2} y={h.y - (line.axis === 'h' ? HANDLE.short : HANDLE.long) / 2} width={line.axis === 'h' ? HANDLE.long : HANDLE.short} height={line.axis === 'h' ? HANDLE.short : HANDLE.long} rx={HANDLE.short / 2} fill={line.color} />
          </g>
        })}
        {tip && <circle cx={px(tip.x)} cy={px(tip.y)} r={6} fill={lookOf(look, 'soft') > 0.5 ? SLOT_COLOR.CH : EDIT_COLOR.surface} stroke={SLOT_COLOR.CH} strokeWidth={2} data-testid="mold-tip" />}
      </svg>
      {mode === 'part' && !sel && !active && <span className={styles.tapNote}>부위를 끌면 옮기고, 선을 끌면 양쪽이 같이 바뀌어요</span>}
    </div>
    <p className={styles.simsReadout} data-testid="mold-readout">{mode === 'shape' ? <>{readout}{weightNote ? <><br />{weightNote}</> : null}</> : readout || ' '}</p>
    <p className={styles.note}>{mode === 'shape'
      ? '파란 선: 위 · 아래 = 키, 왼 · 오른 = 폭. 주황 두 선은 기둥을 감싼 선이라 벌리면 굵게, 좁히면 가늘게. 주황 점을 바깥으로 당기면 끝이 둥글어요. 크기는 두 손가락(컴퓨터는 Ctrl + 휠), 자간은 위 글줄에서 좌우로 끌어요.'
      : '부위 사이 선을 끌면 양쪽 부위가 같이 바뀌어요(한쪽이 넓어지면 한쪽이 좁아져요). 부위를 끌면 다른 부위에 닿기 전까지 통째로 옮겨요. 홀자를 누르면 기둥 선과 끝 점이 떠요. 벽에 닿으면 글자가 툭 튕겨요. 이 걸음은 건너뛰어도 돼요.'}</p>
  </section>
}

const PART_NAMES: Record<Part, string> = { CH: '첫닿자', JU: '홀자', JU_H: '가로홀자', JU_V: '세로홀자', JO: '받침' }

interface Snapshot { edits: LayoutEdits; look: Look }

export function MoldLabPage() {
  const [step, setStep] = useState<Step>('draw')
  // `?s=문장`으로 처음 문장을 정할 수 있다(확인용).
  const [sentence, setSentence] = useState(() => new URLSearchParams(window.location.search).get('s')?.trim() || FIRST_SENTENCE)
  const [raws, setRaws] = useState<Partial<Record<StemKind, PenPoint[]>>>({})
  const [edits, setEdits] = useState<LayoutEdits>({})
  const [look, setLook] = useState<Look>({})
  const [sel, setSel] = useState<Region | null>(null)
  const [focusAt, setFocusAt] = useState(0)
  const [history, setHistory] = useState<Snapshot[]>([])
  const [compare, setCompare] = useState(false)
  const lineDrag = useRef<{ x0: number; look: Look; moved: boolean; width: number } | null>(null)
  const [plateSay, setPlateSay] = useState('판을 가로질러 한 번에 그어 보기')
  // 글자마다 버틸 수 있는 가장 굵은 비율(자소를 끝까지 키워도 획이 안 붙는 데까지). 글줄은 가장 작은 것을 다 같이 쓴다 — 굵기는 글줄 전체가 같다.
  const [caps, setCaps] = useState<Record<string, number>>({})
  const capReporters = useMemo(() => {
    const out: Record<number, (ratio: number) => void> = {}
    ;[...sentence].forEach((_, at) => { out[at] = (ratio: number) => setCaps((all) => (all[`${sentence}-${at}`] === ratio ? all : { ...all, [`${sentence}-${at}`]: ratio })) })
    return out
  }, [sentence])
  const weightCap = Math.min(Infinity, ...[...sentence].map((char, at) => (char === ' ' ? Infinity : caps[`${sentence}-${at}`] ?? Infinity)))
  const weightNote = appliedWeight(lookOf(look, 'weight'), weightCap) < lookOf(look, 'weight') ? '획이 붙기 직전이라 글줄 전체가 여기서 멈춤' : ''
  // 울타리 보정(획 긋기 시험판에서 가져옴). 켜면 그은 획 때문에 울타리 밖으로 나간 글자를 당긴다.
  const [fenceOn, setFenceOn] = useState(true)
  // 인상 잡기에서는 울타리 카드를 접어 글줄과 도트판이 폰 한 화면에 들어오게(하니무스 2026-11-21).
  const [fenceOpen, setFenceOpen] = useState(false)
  const [fenceLine, setFenceLine] = useState<FenceLine>('safe')
  const [fenceReports, setFenceReports] = useState<Record<string, { need: number; pulls: readonly FencePull[] }>>({})
  const fenceReporters = useMemo(() => {
    const out: Record<number, (need: number, pulls: readonly FencePull[]) => void> = {}
    ;[...sentence].forEach((_, at) => { out[at] = (need, pulls) => setFenceReports((all) => { const key = `${sentence}-${at}`; const old = all[key]; return old && old.need === need && JSON.stringify(old.pulls) === JSON.stringify(pulls) ? all : { ...all, [key]: { need, pulls } } }) })
    return out
  }, [sentence])
  const fenceReportsNow = [...sentence].flatMap((char, at) => (char === ' ' ? [] : fenceReports[`${sentence}-${at}`] ? [fenceReports[`${sentence}-${at}`]] : []))
  const jamoScale = Math.min(1, ...fenceReportsNow.map((report) => report.need))
  const fence = useMemo<MoldFence>(() => ({ on: fenceOn, line: fenceLine, scale: jamoScale }), [fenceOn, fenceLine, jamoScale])
  const pulledCount = fenceReportsNow.filter((report) => report.pulls.some((item) => item.pulled !== 0)).length
  const stuckCount = fenceReportsNow.filter((report) => report.pulls.some((item) => item.left > 0)).length
  const fenceNote = [pulledCount > 0 ? `${fenceOn ? '' : '켜면 '}${pulledCount}자 당김` : '', stuckCount > 0 ? `${stuckCount}자는 다 못 당김` : ''].filter(Boolean).join(' · ') || '모두 울타리 안'

  const choseong = useJamoStore((state) => state.choseong)
  const jungseong = useJamoStore((state) => state.jungseong)
  const jongseong = useJamoStore((state) => state.jongseong)

  const stems = useMemo(() => Object.fromEntries(STEMS.flatMap((info) => {
    const raw = raws[info.kind]
    return raw ? [[info.kind, drawnStem(raw, info.kind)]] : []
  })) as Partial<Record<StemKind, DrawnStem>>, [raws])
  const drawn = useMemo<Drawn | undefined>(() => {
    if (!Object.values(stems).some((stem) => stem?.ok)) return undefined
    const masters = mastersOf(stems, jungseong)
    const shapes = consonantShapesOf(stems)
    const consonants = Object.fromEntries(LAYOUTS.map((layout) => {
      const box = consonantBoxesOf(layout)
      return [layout, { choseong: shapeConsonants(choseong, shapes, box.CH).changed, jongseong: shapeConsonants(jongseong, shapes, box.JO).changed }]
    })) as Drawn['consonants']
    return { jungseong: Object.keys(masters).length ? propagatedJungseong(jungseong, {}, masters) : undefined, consonants }
  }, [stems, choseong, jungseong, jongseong])

  // 긋기 단계 글줄: 내가 그은 줄기 종류가 쓰인 획만 보인다(그을 때마다 글자가 조금씩 채워진다).
  // 닿자는 ㄴ · ㅂ 밑처럼 세로 + 가로가 한 획으로 이어진 것이 있어, 그 획에 쓰인 줄기를 다 그어야 보인다.
  const stemKeys = useMemo(() => ({ CH: consonantStemKeys(choseong), JU: vowelStemKeys(jungseong), JO: consonantStemKeys(jongseong) }), [choseong, jungseong, jongseong])
  const shownStroke = useCallback((key: string) => {
    const [family, ...rest] = key.split(':')
    const id = rest.join(':')
    if (family === 'JU') { const kind = stemKeys.JU.get(id); return !!kind && !!stems[kind]?.ok }
    const kinds = (family === 'CH' ? stemKeys.CH : stemKeys.JO).get(id)
    return !!kinds && kinds.length > 0 && kinds.every((kind) => stems[kind]?.ok)
  }, [stemKeys, stems])

  const chars = [...sentence]
  const focusIndex = chars[focusAt] && chars[focusAt] !== ' ' ? focusAt : chars.findIndex((char) => char !== ' ')
  const focusChar = chars[focusIndex] ?? '빚'

  const roll = () => {
    const others = SAMPLE_SENTENCES.filter((line) => line !== sentence)
    if (others.length) { setSentence(others[Math.floor(Math.random() * others.length)]); setFocusAt(0) }
  }
  const remember = () => setHistory((all) => [...all.slice(-40), { edits, look }])
  const undo = () => setHistory((all) => {
    const last = all[all.length - 1]
    if (last) { setEdits(last.edits); setLook(last.look) }
    return all.slice(0, -1)
  })
  const layoutOfFocus = decomposeSyllable(focusChar, choseong, jungseong, jongseong).layoutType
  const resetRegion = () => {
    remember()
    // 인상은 통째로, 칸은 서로 맞물려 있어 짜임째로 되돌린다.
    if (step === 'shape') setLook((now) => Object.fromEntries(STROKE_KEYS.map((key) => [key, now[key]])))
    else if (step === 'stroke') setLook((now) => ({ ...now, ...Object.fromEntries(STROKE_KEYS.map((key) => [key, undefined])) }))
    else setEdits((now) => { const copy = { ...now }; delete copy[layoutOfFocus]; return copy })
  }

  const NO_EDITS: LayoutEdits = useMemo(() => ({}), [])
  const NO_LOOK: Look = useMemo(() => ({}), [])
  const lineEdits = compare ? NO_EDITS : edits
  const lineLook = compare ? NO_LOOK : look
  const lineDrawn = compare ? undefined : drawn
  const stepIndex = STEP_ORDER.indexOf(step)
  const changed = Object.keys(edits).length + Object.values(look).filter((value) => value !== undefined).length + Object.keys(raws).filter((key) => raws[key as StemKind]).length

  return <main className={styles.page}>
    <header className={styles.header}>
      <span className={styles.eyebrow}>빚기 시험판 · {stepIndex + 1}/{STEP_ORDER.length} {STEP_NAMES[step]}</span>
      <ChoiceGroup variant="segment" aria-label="단계" className={styles.steps}>
        {STEP_ORDER.map((key, at) => <ChoiceItem key={key} checked={step === key} onClick={() => setStep(key)} data-testid={`mold-step-${key}`}>{at + 1} {STEP_NAMES[key]}</ChoiceItem>)}
      </ChoiceGroup>
    </header>

    <section className={styles.card} aria-label="예시 글줄">
      <div className={styles.line} data-testid="mold-line" data-drag={step === 'shape' || undefined} data-compact={step === 'shape' || undefined}
        onPointerDown={(event) => { if (step !== 'shape') return; lineDrag.current = { x0: event.clientX, look, moved: false, width: event.currentTarget.getBoundingClientRect().width } }}
        onPointerMove={(event) => {
          const g = lineDrag.current
          if (!g) return
          const dx = event.clientX - g.x0
          if (!g.moved) { if (Math.abs(dx) < 8) return; g.moved = true; remember(); event.currentTarget.setPointerCapture(event.pointerId) }
          // 글줄에서 좌우로 끌면 자간. 글줄 폭만큼 끌면 자간이 50%쯤 바뀐다.
          setLook(dragLook(g.look, 'WHOLE', dx / g.width * 1.67, 0))
        }}
        onPointerUp={() => { const g = lineDrag.current; window.setTimeout(() => { if (lineDrag.current === g) lineDrag.current = null }, 0) }}
        onPointerCancel={() => { lineDrag.current = null }}>
        {chars.map((char, at) => char === ' '
          ? <span key={at} className={styles.space} />
          : <Pressable key={`${sentence}-${at}`} className={styles.lineChar} data-on={(step !== 'draw' && at === focusIndex) || undefined} onClick={() => { if (lineDrag.current?.moved) return; setFocusAt(at); if (step === 'draw') setStep('shape') }} aria-label={`${char} 크게 빚기`} data-testid={`mold-pick-${at}`}>
            <MoldGlyph char={char} size={42} edits={lineEdits} look={lineLook} drawn={lineDrawn} shownStroke={step === 'draw' && !compare ? shownStroke : undefined} testId={`mold-char-${at}`} weightCap={weightCap} onCap={compare ? undefined : capReporters[at]} fence={compare ? undefined : fence} onFence={compare ? undefined : fenceReporters[at]} />
          </Pressable>)}
      </div>
      <div className={styles.lineActions}>
        <Button variant="ghost" size="sm" onClick={roll} data-testid="mold-dice"><Dices aria-hidden="true" />다른 문장</Button>
        <Button variant="chip" size="chip-sm" aria-pressed={compare} disabled={changed === 0}
          onPointerDown={() => setCompare(true)} onPointerUp={() => setCompare(false)} onPointerLeave={() => setCompare(false)} onPointerCancel={() => setCompare(false)}
          data-testid="mold-compare">{compare ? '처음 모습' : step === 'shape' ? '처음과 견주기' : '누르는 동안 처음과 견주기'}</Button>
        {step === 'shape' && !fenceOpen && <span className={styles.fenceTools} data-testid="fence-card">
          <Button variant="ghost" size="sm" onClick={() => setFenceOpen(true)} aria-expanded={false} data-testid="fence-open">울타리<ChevronDown aria-hidden="true" className={styles.fenceChevron} /></Button>
          <Switch checked={fenceOn} onCheckedChange={setFenceOn} aria-label="울타리 보정" data-testid="fence-switch" />
        </span>}
      </div>
      {(step !== 'shape' || fenceOpen) && <div className={styles.fence} data-testid="fence-card">
        <div className={styles.fenceHead}>
          <span className={styles.fenceTitle}><strong>울타리 보정</strong><span data-testid="fence-count">{fenceNote}</span></span>
          <span className={styles.fenceTools}>
            {step === 'shape' && <Button variant="ghost" size="sm" onClick={() => setFenceOpen((open) => !open)} aria-expanded={fenceOpen} data-testid="fence-open">{fenceOpen ? '접기' : '펼치기'}<ChevronDown aria-hidden="true" data-open={fenceOpen || undefined} className={styles.fenceChevron} /></Button>}
            <Switch checked={fenceOn} onCheckedChange={setFenceOn} aria-label="울타리 보정" data-testid="fence-switch" />
          </span>
        </div>
        {(step !== 'shape' || fenceOpen) && <div className={styles.fenceLine}>
          <span>세기 · 안전선이 더 세게 당김</span>
          <ChoiceGroup variant="segment" aria-label="울타리 선" className={styles.fenceLineSwitch}>
            {(['safe', 'limit'] as const).map((line) => <ChoiceItem key={line} checked={fenceLine === line} disabled={!fenceOn} onClick={() => setFenceLine(line)} data-testid={`fence-line-${line}`}>{FENCE_LINE_NAMES[line]}</ChoiceItem>)}
          </ChoiceGroup>
        </div>}
      </div>}
    </section>

    {step === 'draw' && <DrawStep raws={raws} setRaws={setRaws} stems={stems} onDone={() => setStep('shape')} />}
    {step !== 'draw' && <>
      {step === 'shape'
        ? <section className={styles.panel} aria-label="인상 잡기">
          <MoldDotPlate look={look} setLook={setLook} onBegin={remember} onSay={setPlateSay} />
          <p className={styles.simsReadout} data-testid="mold-readout">{plateSay}{weightNote ? <><br />{weightNote}</> : null}</p>
          <div className={styles.fenceLine} data-testid="balloon-gap">
            <span>닿자를 키울 때 획 사이 최소 틈</span>
            <ChoiceGroup variant="segment" aria-label="획 사이 최소 틈" className={styles.fenceLineSwitch}>
              {(Object.keys(BALLOON_GAPS) as BalloonGap[]).map((key) => <ChoiceItem key={key} checked={Math.abs(lookOf(look, 'balloon') - BALLOON_GAPS[key]) < 1e-9} onClick={() => { remember(); setLook({ ...look, balloon: BALLOON_GAPS[key] }) }} data-testid={`balloon-${key}`}>{BALLOON_NAMES[key]}</ChoiceItem>)}
            </ChoiceGroup>
          </div>
        </section>
        : step === 'stroke'
        ? <section className={styles.panel} aria-label="획 다듬기" data-testid="mold-stroke-step">
          <div className={styles.fenceLine}>
            <span>획 끝</span>
            <ChoiceGroup variant="segment" aria-label="획 끝" className={styles.fenceLineSwitch}>
              {STROKE_ENDS.map((end) => <ChoiceItem key={end.key} checked={(lookOf(look, 'soft') > 0.5 ? 1 : 0) === end.soft} onClick={() => { remember(); setLook({ ...look, soft: end.soft }) }} data-testid={`stroke-end-${end.key}`}>{end.name}</ChoiceItem>)}
            </ChoiceGroup>
          </div>
          {STROKE_BARS.map((bar) => {
            const [lo, hi] = LOOK_WALL[bar.key], value = lookOf(look, bar.key), pct = Math.round((value - lo) / (hi - lo) * 100)
            return <Field key={bar.key} label={bar.name} value={pct}>
              <RangeBar min={0} max={100} value={pct} onPointerDown={remember} onKeyDown={remember} onChange={(event) => setLook({ ...look, [bar.key]: lo + (hi - lo) * Number(event.currentTarget.value) / 100 })} aria-label={bar.name} data-testid={`stroke-${bar.key}`} />
            </Field>
          })}
          {STROKE_LATER.map((name) => <div key={name} className={styles.fenceLine}><span>{name}</span><span className={styles.skipNote}>다음에 넣어요</span></div>)}
        </section>
        : <SimsStep mode={step} weightNote={weightNote} fence={compare ? undefined : fence} char={focusChar} drawn={drawn} edits={edits} setEdits={setEdits} look={look} setLook={setLook} weightCap={weightCap} sel={sel} setSel={setSel} onBegin={remember} />}
      <div className={styles.moldActions}>
        <Button variant="outline" size="sm" onClick={undo} disabled={!history.length} data-testid="mold-undo"><Undo2 aria-hidden="true" />되돌리기</Button>
        <Button variant="outline" size="sm" onClick={resetRegion} disabled={step === 'part' && !sel} data-testid="mold-reset-region"><RotateCcw aria-hidden="true" />{step === 'shape' ? '인상 처음대로' : step === 'stroke' ? '획 처음대로' : '부위 처음대로'}</Button>
      </div>
      {step === 'shape' && <Button size="block" onClick={() => setStep('part')} data-testid="mold-to-part">부위 다듬기로<ChevronRight aria-hidden="true" /></Button>}
      {step === 'shape' && <p className={styles.skipNote}>부위 다듬기는 건너뛰어도 돼요.</p>}
      {step === 'part' && <Button size="block" onClick={() => setStep('stroke')} data-testid="mold-to-stroke">획 다듬기로<ChevronRight aria-hidden="true" /></Button>}
    </>}

    {changed > 0 && <Button variant="ghost" size="sm" className={styles.center} onClick={() => { remember(); setEdits({}); setLook({}); setRaws({}); setStep('draw') }} data-testid="mold-reset-all"><RotateCcw aria-hidden="true" />모두 처음대로</Button>}
  </main>
}
