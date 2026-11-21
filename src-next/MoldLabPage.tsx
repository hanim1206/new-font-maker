import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { Check, ChevronRight, Dices, RotateCcw, Undo2 } from 'lucide-react'
import { SvgRenderer } from '../src/renderers/SvgRenderer'
import { resolveGlyphInkPrimitives } from '../src/services/glyphInkResolver'
import type { PenPoint } from '../src/services/penStrokeFit'
import { useEffectiveGlobalStyle, useGlobalStyleStore } from '../src/stores/globalStyleStore'
import { flattenStrokeCenterline } from '../src/services/brushGeometry'
import { useJamoStore } from '../src/stores/jamoStore'
import { DEFAULT_GLOBAL_PADDING, mergePadding, useLayoutStore } from '../src/stores/layoutStore'
import type { GlobalStyle } from '../src/stores/globalStyleStore'
import { propagatedJungseong } from '../src/stores/stemMasterStore'
import { baseOf, JAMO_CHANNELS, masterNameOf, type StemBase } from '../src/services/stemMaster'
import type { BoxConfig, GlyphInkPlacement, JamoData, LayoutType, Padding, Part, ResolvedStrokeInkSource } from '../src/types'
import type { DecomposedSyllable, StrokeDataV2 } from '../src/types'
import { weightToMultiplier } from '../src/utils/globalStyleUtils'
import { decomposeSyllable } from '../src/utils/hangulUtils'
import { pointsToSvgD } from '../src/utils/pathUtils'
import { Button } from './components/ui/button'
import { ChoiceGroup, ChoiceItem } from './components/ui/choice-group'
import { Pressable } from './components/ui/pressable'
import { Field, RangeBar } from './components/ui/range'
import { EDIT_COLOR } from './editColors'
import { clearanceRatio, correctGlyph, GOTHIC_FENCE, measureGlyph, movedBoxes, partClearances, pickJamoScale, scaledBoxes, type Clearances, type FenceLine, type FencePull, type PartPair, nearestBetweenParts } from './fenceBand'
import { HEAVY_HORIZONTAL_SHARE, heavyThicknessOf, inkLookOf, moldBaseStyle, MOLD_BASE_WEIGHT, stemSyllable, STEM_KEYS, STEM_TUNE, type StemKey, applyPartEdits, appliedWeight, balloonOk, branchSyllable, growSides, GAP_FLOOR, lookScale, serifSyllable, waistLift, moldInk, inflateSyllable, dotToLook, FRAME_KEYS, INK_KEYS, waistSyllable,  dragSeam, lookBoxes, gapCapMultiplier, lookOf, LOOK_ENGINE, LOOK_WALL, moveApart, movePartEdit, scaledWeight, seamPos, seamRange, seamsOf, SEAM_HARD_FLOOR, type SeamWall, simsPartOf, type GapStroke, type LayoutEdits, type Look, type PartEdits, type Region, type SimsPart } from './moldLab'
import { useContextPlacement, useNotoModel } from './notoModel'
import { balloonGroupOf, endReachOf, inkOfThick, solveBalloon, type BalloonGroup, type BalloonStroke } from './moldBalloon'
import { applyBakedLayouts, bakedConsonants, bakedResidual, bakedVowels, bakeLayout, jagRules, meanThick, type BakeTarget, type BakedLayout } from './moldBake'
import { layoutDeltaSnapshot } from './layoutDeltaStore'
import { captureOrigin, dropOrigin, MoldOriginContext, readOrigin, restoreOrigin, storesStamp, useMoldOrigin, writeOrigin, type MoldOrigin } from './moldOrigin'
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
// 다섯 걸음(고양이 흐름 다시 보기, 하니무스 2026-11-21 19:18 승인): 긋기 → 인상 잡기 → 부위 다듬기 → 획 다듬기 → 마무리.
// 뒤 걸음은 "다음"으로만 가고, 앞 걸음으로는 언제든 돌아간다.
type Step = 'draw' | 'shape' | 'part' | 'stroke' | 'finish'
const STEP_NAMES: Record<Step, string> = { draw: '긋기', shape: '인상 잡기', part: '부위 다듬기', stroke: '획 다듬기', finish: '마무리' }
const STEP_ORDER: readonly Step[] = ['draw', 'shape', 'part', 'stroke', 'finish']
type Plate = 'frame' | 'ink'
const PLATE_NAMES: Record<Plate, string> = { ink: '획', frame: '틀' }
/**
 * 획 다듬기(C): 줄기 다섯 중 하나를 골라 휨 · 길이 · 틈. 같은 이름 줄기는 모든 글자에서 함께 바뀐다(엔진 줄기 마스터).
 * 값 0~100으로 보이고, 안에서는 벽 사이로 잇는다. 손 떨림 값은 두지 않는다(정할 것 5). 부리 묶음은 출시 뒤(하니무스 2026-11-21).
 */
const STEM_PICKS = Object.keys(STEM_TUNE) as StemBase[]
const STROKE_KEYS = ['branch', 'serif', ...STEM_KEYS] as const
const STROKE_LATER = ['부리 묶음 여섯 · 출시 뒤'] as const
const stemBarsOf = (base: StemBase): { key: StemKey | 'branch'; name: string }[] => {
  const tune = STEM_TUNE[base]
  return [{ key: tune.bend, name: '휨' }, ...(tune.reach ? [{ key: tune.reach, name: '길이' }] : []), ...(tune.gap ? [{ key: tune.gap, name: '틈' }] : [])]
}

/** 그은 줄기를 자모에 입힌 것. 닿자는 짜임마다 칸 비율이 달라 짜임별로 따로. */
interface Drawn {
  jungseong?: Readonly<Record<string, JamoData>>
  consonants: Record<LayoutType, { choseong: Record<string, JamoData>; jongseong: Record<string, JamoData> }>
}

/**
 * 풍선 굵기(플랜 `docs/plans/2026-11-21_풍선-굵기.md`): 굵기 400 위는 글줄째 멈추지 않고 자소마다 제 칸을 채우다 멈춘다(`moldBalloon.ts`).
 * 끄면 예전 길(획이 붙기 직전에 글줄 전체가 멈춤, 엔진 900까지).
 */
const BALLOON_WEIGHT = true

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
  // 써 넣은 적이 있으면 원본(처음 써 넣기 직전 저장소)으로 그린다 — 판 값이 저장된 모양 위에 또 얹히지 않게.
  const origin = useMoldOrigin()
  const liveChoseong = useJamoStore((state) => state.choseong)
  const liveJungseong = useJamoStore((state) => state.jungseong)
  const liveJongseong = useJamoStore((state) => state.jongseong)
  const storedChoseong = origin?.choseong ?? liveChoseong
  const storedJungseong = origin?.jungseong ?? liveJungseong
  const storedJongseong = origin?.jongseong ?? liveJongseong
  const baseLayout = useMemo(() => decomposeSyllable(char, storedChoseong, storedJungseong, storedJongseong).layoutType, [char, storedChoseong, storedJungseong, storedJongseong])
  const consonants = drawn?.consonants[baseLayout]
  const choseong = useMemo(() => consonants ? { ...storedChoseong, ...consonants.choseong } : storedChoseong, [storedChoseong, consonants])
  const jungseong = useMemo(() => drawn?.jungseong ? { ...storedJungseong, ...drawn.jungseong } : storedJungseong, [storedJungseong, drawn?.jungseong])
  const jongseong = useMemo(() => consonants ? { ...storedJongseong, ...consonants.jongseong } : storedJongseong, [storedJongseong, consonants])
  const schemas = useLayoutStore((state) => state.layoutSchemas)
  const globalPadding = useLayoutStore((state) => state.globalPadding)
  const paddingOverrides = useLayoutStore((state) => state.paddingOverrides)
  const syllable = useMemo(() => decomposeSyllable(char, choseong, jungseong, jongseong), [char, choseong, jungseong, jongseong])
  const live = useEffectiveGlobalStyle(syllable.layoutType)
  const stored = useMemo(() => (origin ? { ...live, ...origin.style } : live), [live, origin])
  // 저장된 굵기 · 붓 값은 판(`inkLookOf`)이 들고 있으니 바탕에서 뺀다(두 번 얹히지 않게).
  const effective = useMemo(() => moldBaseStyle(stored), [stored])
  const padding = useMemo(() => mergePadding(globalPadding, paddingOverrides[syllable.layoutType]), [globalPadding, paddingOverrides, syllable.layoutType])
  const schema = useMemo(() => ({ ...schemas[syllable.layoutType], padding, designBodyPadding: padding }), [schemas, syllable.layoutType, padding])
  const { placement } = useContextPlacement(syllable, schema, effective, origin?.layout)
  return { syllable, effective, placement, padding, schema }
}

// ── 울타리 보정(획 긋기 시험판과 같은 계산 `fenceBand.ts`) ──

/** 울타리 켬 · 선. 자소 줄이는 비율은 글줄 전체가 같이 쓴다(가장 많이 줄여야 하는 글자의 것). */
interface MoldFence { on: boolean; line: FenceLine; scale: number }

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
function moldedBoxes(boxes: Partial<Record<Part, BoxConfig>>, layout: LayoutType, edits: LayoutEdits, look: Look, char?: string) {
  return lookBoxes(applyPartEdits(boxes, edits[layout]), look, layout, char)
}

/**
 * 빚은 글자 하나. 칸을 풀고, 짜임 편집 · 폭 · 굵기 · 끝 모양을 차례로 입혀 그린다.
 * `sel`이 있으면 고른 부위만 제 색으로, 나머지는 옅게 그린다.
 */
/** 한 자소만 남긴 글자(풍선 굵기에서 자소마다 따로 그릴 때). 짜임은 그대로 둬 칸 열쇠가 안 바뀐다. */
function onlyGroup(syllable: DecomposedSyllable, group: BalloonGroup): DecomposedSyllable {
  return { ...syllable, choseong: group === 'CH' ? syllable.choseong : null, jungseong: group === 'JU' ? syllable.jungseong : null, jongseong: group === 'JO' ? syllable.jongseong : null }
}
/**
 * 굵어질 때 글자 잉크 폭이 바깥으로 넓어지는 양(세로줄기 굵어진 em 1당). 거북이 넓어짐 공식 1절(폰트 집안 21개 가운데값).
 * 오른끝: 곁줄기로 끝나면 0.10, 기둥 0.37, 섞임 0.49, 기둥 둘 0.35(쌍닿자와 만나면 0.55). 가로 짜임 0.20.
 * 왼끝: ㄱ · 쌍닿자 0.43, ㅇ ㅁ ㅂ 0.27, 가로 짜임 0.15, 그 밖 0.29.
 */
function outerWidenOf(syllable: DecomposedSyllable): { left: number; right: number } {
  const initial = syllable.choseong?.char ?? '', medial = syllable.jungseong?.char ?? ''
  const doubled = 'ㄲㄸㅃㅆㅉ'.includes(initial) && initial !== ''
  const horizontal = 'ㅗㅛㅜㅠㅡ'.includes(medial) && medial !== ''
  const right = horizontal ? 0.2 : 'ㅘㅙㅚㅝㅞㅟㅢ'.includes(medial) ? 0.49 : 'ㅐㅔㅒㅖ'.includes(medial) ? (doubled ? 0.55 : 0.35) : 'ㅏㅑ'.includes(medial) ? 0.1 : 0.37
  const left = initial === 'ㄱ' || doubled ? 0.43 : 'ㅇㅁㅂ'.includes(initial) && initial !== '' ? 0.27 : horizontal ? 0.15 : 0.29
  return { left, right }
}
type Pt2 = { x: number; y: number }
/** 획 고치기: 열린 끝 옮김(자소 칸 좌표) 또는 토막으로 나눈 획들. */
type StrokeReshape = { start: Pt2; end: Pt2 } | { pieces: StrokeDataV2[] }
/** 획 열린 끝을 옮기거나 토막으로 나눈 글자(부위|획 id로). 손잡이도 같이 옮긴다. */
function stretchedSyllable(syllable: DecomposedSyllable, reaches: ReadonlyMap<string, StrokeReshape>): DecomposedSyllable {
  const moveStrokes = (parts: readonly Part[], list: StrokeDataV2[] | undefined) => list?.flatMap((stroke) => {
    const reach = parts.map((part) => reaches.get(`${part}|${stroke.id}`)).find(Boolean)
    if (!reach) return [stroke]
    if ('pieces' in reach) return reach.pieces
    if (stroke.closed || stroke.points.length < 2) return [stroke]
    const shift = (point: StrokeDataV2['points'][number], by: Pt2) => ({ ...point, x: point.x + by.x, y: point.y + by.y, ...(point.handleIn ? { handleIn: { x: point.handleIn.x + by.x, y: point.handleIn.y + by.y } } : {}), ...(point.handleOut ? { handleOut: { x: point.handleOut.x + by.x, y: point.handleOut.y + by.y } } : {}) })
    const points = [...stroke.points]
    points[0] = shift(points[0], reach.start); points[points.length - 1] = shift(points[points.length - 1], reach.end)
    return [{ ...stroke, points }]
  })
  const moveJamo = (jamo: JamoData | null | undefined, parts: readonly Part[]) => jamo && {
    ...jamo, strokes: moveStrokes(parts, jamo.strokes), horizontalStrokes: moveStrokes(parts, jamo.horizontalStrokes), verticalStrokes: moveStrokes(parts, jamo.verticalStrokes),
    contextStrokes: jamo.contextStrokes && Object.fromEntries(Object.entries(jamo.contextStrokes).map(([family, list]) => [family, moveStrokes(parts, list) ?? list])),
  }
  return { ...syllable, choseong: moveJamo(syllable.choseong, ['CH']) ?? syllable.choseong, jungseong: moveJamo(syllable.jungseong, ['JU', 'JU_H', 'JU_V']) ?? syllable.jungseong, jongseong: moveJamo(syllable.jongseong, ['JO']) ?? syllable.jongseong }
}
/** 붓 스타일의 대비만 바꾼다(0이면 뺀다). */
// 풍선 굵기는 칸을 잉크로 풀어 0~1 안에 둔다. 엔진의 칸 밀기(중심선이 가장 굵은 반 두께 안쪽)는 가로획 열린 끝을 잉크로 안 쳐
// 「깨」 ㄲ을 통째 오른쪽으로 밀어 ㅐ에 붙였다 — 그래서 끈다.
const HEAVY_INK_BOUNDS = { min: -1, max: 2 } as const

function heavyStrokeStyle(style: GlobalStyle['strokeStyle'], contrast: number): GlobalStyle['strokeStyle'] {
  if (style.mode !== 'brush') return style
  const rest = { ...style }
  delete rest.contrast
  return Math.abs(contrast) < 1e-4 ? rest : { ...rest, contrast }
}

function MoldGlyph({ char, size, edits, look, drawn, sel, highlight, shownStroke, testId, weightCap = Infinity, onCap, fence, onFence, onBake }: { char: string; size: number; edits: LayoutEdits; look: Look; drawn?: Drawn; sel?: Region | null; highlight?: readonly Part[]; shownStroke?: (key: string) => boolean; testId?: string; weightCap?: number; onCap?: (ratio: number) => void; fence?: MoldFence; onFence?: (need: number, pulls: readonly FencePull[]) => void; onBake?: (item: BakeTarget) => void }) {
  const { syllable: raw, effective, placement, padding, schema } = useGlyphBase(char, drawn)
  const base = useGlyphBase(char, undefined)
  // 무게중심(거북이 A안): ㅏ · ㅓ 곁줄기 높이는 획에서, 첫닿자 밑변 · 보는 칸에서(`impressBoxes`) 옮긴다.
  // 닿자 크기 1 아래는 칸을 줄이기만 한다. 1 위는 풍선 닿자 — 칸은 그대로 두고 맨 끝(울타리까지 입힌 뒤)에서 부풀린다.
  const heavyOn = BALLOON_WEIGHT && lookOf(look, 'weight') > 1
  const shaped = useMemo(() => {
    if (placement.kind !== 'boxes') return { syllable: raw, boxes: undefined }
    // 풍선 굵기는 자소마다 안으로 당기므로(`solveBalloon`), 글자 통째로 안으로 당기는 셈(`lookScale`)에는 굵기를 안 넣는다.
    const boxes = moldedBoxes(placement.boxes, raw.layoutType, edits, { ...look, jamo: Math.min(1, lookOf(look, 'jamo')), ...(heavyOn ? { weight: 1, weightBase: 1 } : {}) }, char)
    // 허리선 → 곁줄기 길이 → 줄기마다(휨 · 길이 · 틈) → 부리 → 붓촉 순서로 획을 고친다(획 다듬기 값은 획 모양만 바꾸고 칸은 두지 않는다).
    const waisted = waistSyllable(raw, waistLift(look, placement.boxes, raw.layoutType), boxes)
    const stroked = serifSyllable(stemSyllable(branchSyllable(waisted, lookOf(look, 'branch'), { boxes, ink: weightToMultiplier(MOLD_BASE_WEIGHT), linecap: effective.linecap }), look), lookOf(look, 'serif'), boxes)
    return { boxes, syllable: stroked }
  }, [placement, raw, edits, look, char, heavyOn, effective.linecap])
  const syllable = shaped.syllable
  const molded = shaped.boxes

  // 굵기는 글줄 전체가 같다(다람쥐 검수 1번). 글자마다 "자소를 끝까지 키워도 획이 안 붙는 가장 굵은 비율"을 올리고, 글줄은 가장 작은 것을 다 같이 쓴다.
  // 그 굵기 안에서 획이 붙을 자리(ㄹ 가로 사이 등)가 생기는 글자만 자소 칸을 조금 키워 틈을 낸다 — 굵은 폰트도 자소가 줄지 않고 조금 커진다(거북이 자소별 표 2절).
  const wanted = lookOf(look, 'weight')
  // 상한은 굵기 값과 따로 잰다(하니무스 2026-11-21 "굵기 올리면 깜빡이며 튕김"): 굵기가 안쪽으로 굵어지며 칸을 줄이므로(`lookScale`),
  // 지금 굵기의 칸으로 재면 굵기 → 칸 → 상한 → 잠금 → 굵기가 서로 물려 값이 오락가락한다. 그래서 굵기 끝(가장 줄어든 칸)으로 한 번만 잰다.
  const capRatio = useMemo(() => {
    if (BALLOON_WEIGHT || !onCap || placement.kind !== 'boxes') return Infinity
    const ref = gapStrokesOf(syllable, placement, effective.linecap, effective.linejoin)
    const last = JAMO_GROWS[JAMO_GROWS.length - 1]
    const capAt = (weight: number) => {
      const boxes = moldedBoxes(placement.boxes, raw.layoutType, edits, { ...look, weight, jamo: Math.min(1, lookOf(look, 'jamo')) }, char)
      const capM = gapCapMultiplier(ref, gapStrokesOf(syllable, { kind: 'boxes', boxes: scaledBoxes(boxes, last) }, effective.linecap, effective.linejoin), weightToMultiplier(effective.weight), 0)
      return capM === Infinity ? Infinity : Math.max(1, weightUnder(capM, 100) / effective.weight)
    }
    // 굵기 끝의 칸에서 시작해, 그 상한에서의 칸으로 몇 번 다시 잰다(지금 굵기와 무관해서 끄는 동안 흔들리지 않는다).
    let cap = capAt(LOOK_WALL.weight[1])
    for (let i = 0; i < 3 && cap !== Infinity; i++) cap = Math.min(capAt(cap), LOOK_WALL.weight[1])
    return cap
  }, [onCap, placement, raw.layoutType, edits, look.frame, look.size, look.height, look.jamo, look.center, look.open, look.jag, syllable, effective, char]) // eslint-disable-line react-hooks/exhaustive-deps -- 굵기 값은 일부러 뺀다
  useEffect(() => { onCap?.(capRatio) }, [onCap, capRatio])
  // 풍선 굵기: 여기서부터(자소 키우기 · 울타리 · 풍선 닿자)는 처음 굵기로 재고, 굵기는 맨 끝에서 자소마다 푼다.
  const ratio = heavyOn ? 1 : appliedWeight(wanted, BALLOON_WEIGHT ? Infinity : weightCap)
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
  const wantJamo = lookOf(look, 'jamo')
  const balloon = useMemo(() => {
    if (!fencedOut || wantJamo <= 1) return { syllable, boxes: fencedOut, thick: {} as Record<string, number> }
    const multiplier = weightToMultiplier(ratio === 1 ? effective.weight : scaledWeight(effective.weight, ratio))
    const startInk = inkStrokes(syllable, fencedOut, effective, multiplier)
    const target: Partial<Record<PartPair, number>> = {}
    // 바닥(거북이 2차): 틈이 획 굵기의 0.7배에 닿으면 그 변은 멈춘다. 처음부터 더 좁은 쌍은 처음 틈을 지킨다.
    const thicks = startInk.map((stroke) => stroke.thickness ?? 0).filter((t) => t > 0).sort((a, b) => a - b)
    const floor = GAP_FLOOR * (thicks[Math.floor(thicks.length / 2)] ?? 0.07)
    for (const [pair, near] of Object.entries(nearestBetweenParts(startInk)) as [PartPair, { gap: number }][]) target[pair] = Math.min(floor, near.gap)
    const edge = inkReach(startInk)
    const lo = Math.min(-BALLOON_EDGE, edge.lo), hi = Math.max(1 + BALLOON_EDGE, edge.hi)
    // 닿자 굵기는 닿자 크기에서 뗀다(다람쥐 세 번째 맞추기 3번: 홀자와 굵기가 따로 놂). 칸만 부풀고 획 두께는 글줄 굵기 그대로.
    const out = growSides(fencedOut, wantJamo, {}, (trial, thick) => {
      const ink = inkStrokes(inflateSyllable(syllable, thick), trial, effective, multiplier)
      const r = inkReach(ink)
      return r.lo >= lo - 1e-6 && r.hi <= hi + 1e-6 && balloonOk(nearestBetweenParts(ink), target)
    }, 8, syllable.layoutType)
    return { syllable: inflateSyllable(syllable, out.thick), boxes: out.boxes, thick: out.thick }
  }, [fencedOut, wantJamo, syllable, effective, ratio])
  const boxes = balloon.boxes
  const round = lookOf(look, 'round'), contrast = lookOf(look, 'contrast'), nib = lookOf(look, 'nib')
  // 풍선 굵기: 보이는 글자 그대로(풍선 닿자까지 입힌 뒤)의 중심선으로 자소마다 칸 · 굵기를 푼다. 납작 붓은 방향별 굵기가 없어 가는 쪽 하나로.
  const heavy = useMemo(() => {
    if (!heavyOn || !boxes) return null
    const result = resolveGlyphInkPrimitives({ syllable: balloon.syllable, placement: { kind: 'boxes', boxes }, weightMultiplier: 1, globalLinecap: effective.linecap, globalLinejoin: effective.linejoin, horizontalInkBounds: { min: 0, max: 1 } })
    const strokes: BalloonStroke[] = result.primitives.map((primitive) => ({ part: primitive.source.part, points: flattenStrokeCenterline(primitive.stroke as StrokeDataV2, primitive.box), closed: primitive.stroke.closed, thickness: primitive.stroke.thickness }))
    // 칸은 획이 실제로 놓인 상자로(엔진이 부위 칸 안에서 다시 놓을 수 있다). 한 부위에 상자가 여럿이면 합친다.
    const placed: Partial<Record<Part, BoxConfig>> = {}
    for (const primitive of result.primitives) {
      const part = primitive.source.part, old = placed[part], b = primitive.box
      placed[part] = old ? { x: Math.min(old.x, b.x), y: Math.min(old.y, b.y), width: Math.max(old.x + old.width, b.x + b.width) - Math.min(old.x, b.x), height: Math.max(old.y + old.height, b.y + b.height) - Math.min(old.y, b.y) } : { ...b }
    }
    const base = { v: contrast >= 0 ? 1 + 0.8 * contrast : 1 + 0.5 * contrast, h: contrast >= 0 ? 1 - 0.45 * contrast : 1 - 0.5 * contrast }
    const k = heavyThicknessOf(wanted)
    const solved = solveBalloon({ strokes, boxes: placed, base, want: { v: base.v * k, h: base.h * (1 + (k - 1) * HEAVY_HORIZONTAL_SHARE) }, outer: outerWidenOf(balloon.syllable) })
    // 푼 칸(획 상자 기준)의 바뀐 만큼을 부위 칸에 그대로 옮긴다.
    const out: Partial<Record<Part, BoxConfig>> = { ...boxes }
    for (const [part, next] of Object.entries(solved.boxes) as [Part, BoxConfig][]) {
      const from = placed[part], box = boxes[part]
      if (!from || !box || !next) continue
      const kx = from.width > 1e-6 ? next.width / from.width : 1, ky = from.height > 1e-6 ? next.height / from.height : 1
      out[part] = { ...box, x: next.x + (box.x - from.x) * kx, y: next.y + (box.y - from.y) * ky, width: box.width * kx, height: box.height * ky }
    }
    // 열린 끝 늘이기(푼 셈과 같은 값): 가로가 덜 굵어진 만큼 가로획 열린 끝을 늘여 세로줄기 바깥선과 맞춘다(「른」 ㄹ).
    // 꺾인 곧은 획(ㄹ · ㄱ · ㄴ)은 토막마다 따로 그린다 — 한 획으로 그리면 가로 · 세로 굵기가 다른 두 토막의 꺾임에서
    // 안쪽 윤곽이 엇갈려 꺾인 곳이 덩어리가 됐다(하니무스 2026-11-21 「른」). 토막 끝은 이웃 토막 반 두께만큼 늘여 모서리를 채운다.
    const reaches = new Map<string, StrokeReshape>()
    const squareCap = effective.linecap === 'square'
    // 끝선 맞춤: 열린 끝이 같은 자소의 수직인 토막 중심선 위에 있으면(ㄹ 윗 가로 왼끝 ↔ 아래 세로) 그 토막 바깥선까지 늘인다.
    const axisSegs = result.primitives.flatMap((primitive, index) => {
      const stroke = strokes[index], part = primitive.source.part, thick = solved.thick[balloonGroupOf(part)]
      return stroke.points.slice(1).map((b, at) => {
        const a = stroke.points[at], l = Math.hypot(b.x - a.x, b.y - a.y), u = l < 1e-9 ? 0.5 : ((b.y - a.y) / l) ** 2
        return { part, a, b, u, half: stroke.thickness / 2 * (u > 0.5 ? thick.v : thick.h) }
      })
    })
    const alignReach = (part: Part, end: Pt2, inward: Pt2, own: number) => {
      const horizontal = Math.abs(inward.x) > Math.abs(inward.y)
      let best = -1
      for (const seg of axisSegs) {
        if (seg.part !== part || (horizontal ? seg.u < 0.97 : seg.u > 0.03)) continue
        const off = horizontal ? Math.abs(seg.a.x - end.x) : Math.abs(seg.a.y - end.y)
        const lo = horizontal ? Math.min(seg.a.y, seg.b.y) : Math.min(seg.a.x, seg.b.x), hi = horizontal ? Math.max(seg.a.y, seg.b.y) : Math.max(seg.a.x, seg.b.x)
        const across = horizontal ? end.y : end.x
        if (off > 0.25 * own + 0.012 || across < lo - 0.3 || across > hi + 0.3) continue
        best = Math.max(best, seg.half)
      }
      return best
    }
    result.primitives.forEach((primitive, index) => {
      const stroke = strokes[index], part = primitive.source.part, thick = solved.thick[balloonGroupOf(part)]
      if (stroke.closed) return
      const from = placed[part], next = solved.boxes[part]
      const kx = from && next && from.width > 1e-6 ? next.width / from.width : 1, ky = from && next && from.height > 1e-6 ? next.height / from.height : 1
      const bw = primitive.box.width * kx, bh = primitive.box.height * ky
      if (bw < 1e-9 || bh < 1e-9) return
      const reach = endReachOf(stroke.points, stroke.thickness, thick, base)
      const raw = primitive.stroke as StrokeDataV2
      const anchors = raw.points
      const straight = anchors.length >= 3 && anchors.every((point) => !point.handleIn && !point.handleOut)
      const em = anchors.map((point) => ({ x: primitive.box.x + point.x * primitive.box.width, y: primitive.box.y + point.y * primitive.box.height }))
      const upright = (a: Pt2, b: Pt2) => { const l = Math.hypot(b.x - a.x, b.y - a.y); return l < 1e-9 ? 0 : ((b.y - a.y) / l) ** 2 }
      const axisAligned = straight && em.slice(1).every((point, at) => { const u = upright(em[at], point); return u < 0.03 || u > 0.97 })
      // 끝을 em 길이 `by`만큼 a → b 바깥쪽(a 쪽)으로 옮기는 자소 칸 좌표.
      const local = (a: Pt2, b: Pt2, by: number): Pt2 => { const l = Math.hypot(b.x - a.x, b.y - a.y); return l < 1e-9 ? { x: 0, y: 0 } : { x: (a.x - b.x) / l * by / bw, y: (a.y - b.y) / l * by / bh } }
      if (axisAligned) {
        const half = em.slice(1).map((point, at) => stroke.thickness / 2 * (upright(em[at], point) > 0.5 ? thick.v : thick.h))
        const last = em.length - 2
        const pieces = em.slice(1).map((point, at) => {
          const a = em[at], b = point
          const openBy = (end: Pt2, other: Pt2, fallback: number) => {
            const aligned = alignReach(part, end, { x: other.x - end.x, y: other.y - end.y }, half[at])
            return aligned >= 0 ? aligned : (squareCap ? half[at] : 0) + fallback
          }
          const startBy = at > 0 ? half[at - 1] : openBy(a, b, reach.start)
          const endBy = at < last ? half[at + 1] : openBy(b, a, reach.end)
          const ds = local(a, b, startBy), de = local(b, a, endBy)
          return { ...raw, id: `${raw.id}~${at}`, linecap: 'butt' as const, points: [{ x: anchors[at].x + ds.x, y: anchors[at].y + ds.y }, { x: anchors[at + 1].x + de.x, y: anchors[at + 1].y + de.y }] }
        })
        reaches.set(`${part}|${primitive.source.strokeId}`, { pieces })
        return
      }
      if (reach.start < 1e-6 && reach.end < 1e-6) return
      const pts = stroke.points, n = pts.length
      reaches.set(`${part}|${primitive.source.strokeId}`, { start: local(pts[0], pts[1], reach.start), end: local(pts[n - 1], pts[n - 2], reach.end) })
    })
    return { boxes: out, thick: solved.thick, syllable: reaches.size ? stretchedSyllable(balloon.syllable, reaches) : balloon.syllable }
  }, [heavyOn, boxes, balloon.syllable, effective.linecap, effective.linejoin, contrast, wanted])
  const globalStyle = useMemo(() => {
    const weighted = ratio === 1 ? effective : { ...effective, weight: scaledWeight(effective.weight, ratio) }
    // 획 끝 · 꺾임은 둥글기 하나가 맡는다(거북이 방향안 4차). 둥글기 · 대비 · 붓촉은 엔진의 붓 값에 얹는다(`moldInk`).
    return moldInk(weighted, { round, contrast, nib })
  }, [effective, ratio, round, contrast, nib])
  const colorOf = useCallback((source: ResolvedStrokeInkSource) => {
    if (shownStroke) return shownStroke(`${simsPartOf(source.part)}:${source.jamoId}:${source.strokeId}`) ? undefined : 'transparent'
    // 잡은 보선 양쪽 부위만 제 색(선 이름 대신).
    if (highlight) return highlight.includes(source.part) ? SLOT_COLOR[simsPartOf(source.part)] : EDIT_COLOR.editSlotOff
    if (sel === 'STROKE') return EDIT_COLOR.editSelect
    if (sel === 'CH' || sel === 'JU' || sel === 'JO') return simsPartOf(source.part) === sel ? SLOT_COLOR[sel] : EDIT_COLOR.editSlotOff
    return undefined
  }, [sel, shownStroke, highlight])

  // 폭이 좁아지면 글자 칸도 같이 좁힌다. 자간은 글자 사이를 더하거나 뺀다.
  // 칸 셈과 같은 값으로(풍선 굵기는 글자 통째 당김이 없다). 다르면 써 넣을 때마다 자간이 줄어든다(다람쥐 D 검수 2번).
  const scale = placement.kind === 'boxes' ? lookScale(placement.boxes, heavyOn ? { ...look, weight: 1, weightBase: 1 } : look).sx : lookOf(look, 'frame') * lookOf(look, 'size')
  // 저장소의 자간(써 넣은 값 포함)도 얹는다 — 써 넣은 뒤 화면 값을 처음으로 돌려도 글줄 간격이 그대로다.
  const slot = { width: size * scale + size * (lookOf(look, 'tracking') + effective.letterSpacing), marginInline: 0 }
  // 저장소에 써 넣기: 그리는 칸 그대로를 목표로 넘긴다(긋기 · 획 다듬기 획은 아직 안 넘어감).
  const lift = placement.kind === 'boxes' ? waistLift(look, placement.boxes, raw.layoutType) : 0
  const heavyBake = useMemo(() => {
    if (!heavy) return undefined
    const ink: NonNullable<BakeTarget['heavy']>['ink'] = {}
    for (const group of ['CH', 'JU', 'JO'] as const) {
      const jamo = group === 'CH' ? heavy.syllable.choseong : group === 'JU' ? heavy.syllable.jungseong : heavy.syllable.jongseong
      const list = jamo ? [...(jamo.strokes ?? []), ...(jamo.horizontalStrokes ?? []), ...(jamo.verticalStrokes ?? [])].map((stroke) => stroke.thickness).sort((a, b) => a - b) : []
      if (!list.length) continue
      const t = list[Math.floor(list.length / 2)] * weightToMultiplier(MOLD_BASE_WEIGHT)
      ink[group] = { v: t * heavy.thick[group].v, h: t * heavy.thick[group].h, t: list[Math.floor(list.length / 2)] }
    }
    return { boxes: heavy.boxes, ink }
  }, [heavy])
  useEffect(() => { if (onBake && boxes && molded) onBake({ char, syllable: raw, schema, target: boxes, sx: scale, lift, molded, thick: balloon.thick, heavy: heavyBake }) }, [onBake, boxes, char, raw, schema, scale, lift, molded, balloon.thick, heavyBake])
  const strokeColorOf = shownStroke || highlight || (sel && sel !== 'WHOLE') ? colorOf : undefined
  if (heavy) {
    // 자소마다 가로 · 세로 굵기가 다르다. 엔진의 대비(토막 방향별 두께)를 자소마다 따로 줘서 겹쳐 그린다.
    const flat = globalStyle.strokeStyle.mode !== 'brush' || globalStyle.strokeStyle.brush.tip !== 'round'
    const layers = (['CH', 'JU', 'JO'] as const).filter((group) => (group === 'CH' ? balloon.syllable.choseong : group === 'JU' ? balloon.syllable.jungseong : balloon.syllable.jongseong))
    return <span className={styles.glyph} style={slot} data-testid={testId} data-char={char} data-heavy={layers.map((group) => `${group}:${heavy.thick[group].v.toFixed(3)}/${heavy.thick[group].h.toFixed(3)}`).join(' ')}>
      {layers.map((group, at) => {
        const ink = flat ? { multiplier: Math.min(heavy.thick[group].v, heavy.thick[group].h), contrast: 0 } : inkOfThick(heavy.thick[group])
        const style = flat || globalStyle.strokeStyle.mode !== 'brush' ? globalStyle : { ...globalStyle, strokeStyle: heavyStrokeStyle(globalStyle.strokeStyle, ink.contrast) }
        return <span key={group} className={at === 0 ? undefined : styles.glyphLayer}>
          <SvgRenderer
            syllable={onlyGroup(heavy.syllable, group)}
            boxes={heavy.boxes}
            size={size}
            globalStyle={style}
            weightMultiplier={weightToMultiplier(MOLD_BASE_WEIGHT) * ink.multiplier}
            overflow="visible"
            clipGlyphs={false}
            strokeColorOf={strokeColorOf}
            horizontalInkBounds={HEAVY_INK_BOUNDS}
          />
        </span>
      })}
    </span>
  }
  return <span className={styles.glyph} style={slot} data-testid={testId} data-char={char}>
    <SvgRenderer
      syllable={balloon.syllable}
      schema={placement.kind === 'schema' ? placement.schema : undefined}
      boxes={boxes}
      size={size}
      globalStyle={globalStyle}
      overflow="visible"
      clipGlyphs={false}
      strokeColorOf={strokeColorOf}
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

const LOOK_KEYS = ['weight', 'frame', 'tracking', 'size', 'height', 'jamo', 'center', 'round', 'contrast', 'balloon', 'open', 'branch', 'serif', 'nib', 'jag'] as const
const STAGE = 220
const ALL_PARTS: readonly Part[] = ['CH', 'JU', 'JU_H', 'JU_V', 'JO']
/** 선 · 손잡이 잡는 폭(px). 폰 손가락 크기. */
const GRAB_PX = 14
const HANDLE = { long: 20, short: 11 }
const RULER = 14

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
  /** 글자 단위 1이 보이는 글자에서 얼마인가(옮긴 양을 u로 읽을 때) */
  scale: number
  /** 잡은 뒤 d(보이는 글자 단위)만큼 끌었을 때 벽 상태 */
  drag: (d: number) => SeamWall
}
type Grab =
  | { kind: 'line'; line: GuideLine; x0: number; y0: number; moved: boolean; last?: number }
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
const BALLOON_EDGE = 0
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

/**
 * 부위 다듬기 무대(보선 끌기). 상자 없이 화면 끝까지 가는 선을 끈다.
 * 부위 사이 보선(양쪽 부위가 나눠 쓴다)을 끌거나, 부위를 끌어 다른 부위와 겹치지 않는 데까지 통째로 옮긴다.
 * 바깥 틀 · 굵기 · 크기는 인상 잡기 몫이라 여기서는 안 바뀐다. 조작은 한 손가락만(R034) — 두 손가락 · Ctrl + 휠은 쓰지 않는다.
 * 왼쪽(가로선) · 아래(세로선) 눈금자에 지금 자리, 처음 자리(점선), 움직일 수 있는 범위(옅은 띠). 선은 여섯 개 이하, 잡은 선만 진하게.
 */
function SimsStep({ char, drawn, edits, setEdits, look, weightCap, sel, setSel, onBegin, fence }: {
  fence?: MoldFence
  char: string; drawn?: Drawn; edits: LayoutEdits; setEdits: (update: (now: LayoutEdits) => LayoutEdits) => void
  look: Look; weightCap: number; sel: Region | null; setSel: (region: Region | null) => void; onBegin: () => void
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
  const [wall, setWall] = useState<SeamWall>('free')
  const lastBump = useRef(0)
  const bumpWall = () => { const now = Date.now(); if (now - lastBump.current > 450) { lastBump.current = now; setBump((n) => n + 1) } }
  const grab = useRef<Grab | null>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())

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
  const { sx, sy } = lookScale(now, look)
  const tx = (u: number) => 0.5 + (u - 0.5) * sx, ty = (v: number) => 0.5 + (v - 0.5) * sy
  const ratio = appliedWeight(lookOf(look, 'weight'), weightCap)
  const multiplier = weightToMultiplier(scaledWeight(effective.weight, ratio))

  // ── 선 만들기(지금 값으로. 끌기는 잡은 때의 값에서 셈한다) ──
  const lines: GuideLine[] = []
  {
    seamsOf(layout, origin).forEach((seam, i) => {
      const v = seam.axis === 'v', scale = v ? sx : sy, t = v ? tx : ty
      const startEdits = edits[layout] ?? {}
      const pre = seamPos(seam, now)
      const [lo, hi] = seamRange(seam, origin, now, SEAM_HARD_FLOOR)
      const color = seam.b.includes('JO') ? SLOT_COLOR.JO : SLOT_COLOR.JU
      lines.push({
        id: `seam${i}`, axis: seam.axis, pos: t(pre), color, end: 'end', lo: t(pre + lo), hi: t(pre + hi), origin: t(seamPos(seam, origin)), parts: [...seam.a, ...seam.b], scale,
        drag: (d) => {
          // 넘어가도 획이 서로 겹치기 전에서 멈춘다(하니무스 2026-11-21 "당긴다": 「가」가 「기」로 보이면 안 됨). 처음부터 겹친 쌍은 더 겹치지만 않게.
          const want = d / scale, out = dragSeam(seam, origin, startEdits, want)
          if (out.wall === 'past' || out.wall === 'hard') {
            const inkOf = (partEdits: PartEdits) => inkStrokes(syllable, moldedBoxes(origin, layout, { ...edits, [layout]: partEdits }, { ...look, jamo: Math.min(1, lookOf(look, 'jamo')) }), effective, multiplier)
            // 보이는 길이: 획 길이(em)에서 붙은 끝이 이웃 줄기에 묻히는 두께만큼 뺀다. 짧은 곁줄기가 줄기 속으로 사라지는 것을 잡는다.
            const seen = (ink: ReturnType<typeof inkOf>) => ink.map((stroke) => { const a = stroke.points[0], z = stroke.points[stroke.points.length - 1]; return Math.hypot((z.x - a.x) * stroke.box.width, (z.y - a.y) * stroke.box.height) - (stroke.thickness ?? 0) })
            const startInk = inkOf(startEdits), base = nearestBetweenParts(startInk), baseSeen = seen(startInk)
            const ok = (partEdits: PartEdits) => {
              const ink = inkOf(partEdits)
              if (!Object.entries(nearestBetweenParts(ink)).every(([pair, near]) => near.gap >= Math.min(0, base[pair as PartPair]?.gap ?? 0) - 1e-4)) return false
              const now = seen(ink)
              return ink.length !== startInk.length || now.every((length, i) => baseSeen[i] < 0.02 || length >= 0.5 * baseSeen[i])
            }
            if (!ok(out.edits)) {
              let good = 0, bad = want
              for (let i = 0; i < 14; i++) { const mid = (good + bad) / 2; if (ok(dragSeam(seam, origin, startEdits, mid).edits)) good = mid; else bad = mid }
              const stop = dragSeam(seam, origin, startEdits, good)
              setEdits((all) => ({ ...all, [layout]: stop.edits }))
              return 'hard'
            }
          }
          setEdits((all) => ({ ...all, [layout]: out.edits })); return out.wall
        },
      })
    })
  }
  const shownLines = lines.slice(0, 6)

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
    // 한 손가락만(R034). 두 번째 손가락은 무시한다 — 글자 크기는 인상 잡기에서만 바뀐다.
    if (pointers.current.size > 1) return
    let hit: GuideLine | null = null, best = GRAB_PX
    for (const line of shownLines) {
      const h = handleAt(line)
      // 손잡이는 넉넉히, 선 몸통은 좁게(선이 획 위를 지나도 획을 누를 수 있게). 끌지 않고 떼면 그 자리 부위를 고른다.
      const d = Math.min(Math.hypot(at.x - h.x, at.y - h.y) * 0.6, (line.axis === 'h' ? Math.abs(at.y - px(line.pos)) : Math.abs(at.x - px(line.pos))) * 1.6)
      if (d < best) { best = d; hit = line }
    }
    if (hit) { grab.current = { kind: 'line', line: hit, x0: at.x, y0: at.y, moved: false }; setActive(hit); return }
    const part = partAt(at.x, at.y)
    if (part) { grab.current = { kind: 'move', part, x0: at.x, y0: at.y, moved: false, edits: edits[layout] ?? {} }; return }
    grab.current = { kind: 'tap', x0: at.x, y0: at.y, moved: false }
  }
  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) return
    const at = local(event)
    pointers.current.set(event.pointerId, at)
    if (pointers.current.size > 1) return
    const g = grab.current
    if (!g) return
    const dx = at.x - g.x0, dy = at.y - g.y0
    if (!g.moved) { if (Math.hypot(dx, dy) < 4) return; g.moved = true; onBegin() }
    let ok = true
    if (g.kind === 'line') {
      const now = g.line.drag((g.line.axis === 'h' ? dy : dx) / STAGE)
      // 최소 간격에서 한 번 붙들 때 툭 튕겨 알린다. 넘어간 뒤에는 읽기 줄로만.
      if (now === 'held' && wall !== 'held') bumpWall()
      setWall(now); ok = now !== 'hard'
    }
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
    const g = grab.current
    grab.current = null
    setActive(null)
    setWall('free')
    if (!g || g.moved) return
    if (g.kind === 'tap' || g.kind === 'move' || g.kind === 'line') { const part = partAt(g.x0, g.y0); setSel(part ? simsPartOf(part) : null) }
  }
  // 잡은 보선의 양쪽 부위에만 색. 부위를 골랐으면 그 부위.
  const highlight = active?.parts ?? (sel && sel !== 'STROKE' && sel !== 'WHOLE' ? ALL_PARTS.filter((part) => simsPartOf(part) === sel) : undefined)
  const activeNow = active ? shownLines.find((line) => line.id === active.id) ?? null : null
  const sizeText = (part: Part) => { const b = now[part]; return b ? `${Math.round(b.width * 100)}×${Math.round(b.height * 100)}` : '' }
  const WALL_NOTE: Record<SeamWall, string> = { free: '', held: '최소 간격, 더 끌면 넘어감', past: '최소 간격보다 좁음', hard: '더는 못 감' }
  const readout = [WALL_NOTE[wall], ...(activeNow?.parts ?? (highlight ?? [])).filter((part) => now[part]).map((part) => `${PART_NAMES[part]} ${sizeText(part)}`)].filter(Boolean).join(' · ')

  return <section className={styles.panel} aria-label="부위 다듬기">
    <div ref={stageRef} className={styles.stage} onPointerDown={begin} onPointerMove={move} onPointerUp={end} onPointerCancel={end} data-active={active?.id} data-testid="mold-stage">
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
            {(() => {
              // 옮긴 양(u = 글자 칸의 1/1000). 정밀하게 깎는 느낌(버전 1 부위 다듬기).
              const u = Math.round((line.pos - line.origin) / line.scale * 1000)
              if (u === 0) return null
              const text = `${u > 0 ? '+' : ''}${u}u`
              return line.axis === 'h'
                ? <text x={h.x - HANDLE.long / 2 - 4} y={h.y - 6} textAnchor="end" fontSize={11} fontWeight={600} fill={line.color} className={styles.dotNum} data-testid={`mold-moved-${line.id}`}>{text}</text>
                : <text x={h.x + HANDLE.short / 2 + 4} y={h.y - 4} fontSize={11} fontWeight={600} fill={line.color} className={styles.dotNum} data-testid={`mold-moved-${line.id}`}>{text}</text>
            })()}
          </g>
        })}
      </svg>
      {!sel && !active && <span className={styles.tapNote}>부위를 끌면 옮김 · 선을 끌면 양쪽이 같이</span>}
    </div>
    <p className={styles.simsReadout} data-testid="mold-readout" data-wall={wall === 'free' ? undefined : wall}>{readout || ' '}</p>
    <p className={styles.note}>선을 끌면 양쪽 부위가 나눠 가짐. 부위를 끌면 다른 부위에 닿기 전까지 통째로 옮김. 바깥 틀 · 굵기 · 크기는 그대로. 같은 짜임 글자가 다 같이 바뀜.</p>
  </section>
}

/**
 * 윤곽 내보내기(다람쥐 자로 재기 검수용). 글줄에 그려진 글자마다 잉크 윤곽을 글자 칸(em) 좌표로 모은다.
 * 렌더러의 viewBox는 글자 칸 1em = 100이라 숫자를 0.01배 한다(호 명령이 있으면 그대로 두고 scale을 단다).
 * 화면에 그린 그대로라 노토 바탕 · 지금 값 · 울타리까지 다 든다.
 */
interface OutlinePath { d: string; fill?: true; stroke?: { width: number; linecap: string; linejoin: string } }
interface OutlineGlyph { index: number; char: string; em: { width: number; height: number }; advance: number; paths: OutlinePath[] }
/** 렌더러 좌표(1em = 100) → em. 호(A) 명령은 반지름 · 깃발이 섞여 숫자를 그대로 못 줄이므로 없다고 본다(엔진 윤곽에는 없다). */
const toEm = (d: string) => d.replace(/-?\d*\.?\d+(?:e-?\d+)?/g, (n) => String(Math.round(Number(n) * 1e5) / 1e7))
function outlineOf(): OutlineGlyph[] {
  return [...document.querySelectorAll<HTMLElement>('span[data-testid^="mold-char-"]')].map((el) => {
    const index = Number(el.dataset.testid!.slice('mold-char-'.length))
    // 풍선 굵기는 첫닿자 · 홀자 · 받침을 자소마다 따로 그려 겹친다(같은 칸 좌표). 그래서 svg를 모두 모은다(다람쥐 재검수 2번).
    const svgs = [...el.querySelectorAll('svg')]
    const px = svgs[0] ? Number(svgs[0].getAttribute('width')) || 1 : 1
    const paths: OutlinePath[] = []
    for (const path of svgs.flatMap((svg) => [...svg.querySelectorAll('path')])) {
      const fill = path.getAttribute('fill'), stroke = path.getAttribute('stroke'), d = path.getAttribute('d')
      if (!d || fill === 'transparent' || stroke === 'transparent') continue
      // 화면은 붓 모양에 따라 채운 윤곽(둥글기 · 대비)이나 중심선 + 굵기(stroke)로 그린다. 둘 다 그린 그대로 넘긴다.
      if (fill && fill !== 'none') paths.push({ d: toEm(d), fill: true })
      else if (stroke && stroke !== 'none') paths.push({ d: toEm(d), stroke: { width: Number(path.getAttribute('stroke-width')) / 100, linecap: path.getAttribute('stroke-linecap') ?? 'butt', linejoin: path.getAttribute('stroke-linejoin') ?? 'miter' } })
    }
    return { index, char: el.dataset.char ?? '', em: { width: 1, height: 1 }, advance: el.getBoundingClientRect().width / px, paths }
  })
}
function outlineSvg(glyphs: readonly OutlineGlyph[], meta: unknown): string {
  let x = 0
  const one = (p: OutlinePath) => p.fill ? `<path d="${p.d}" fill="#000" fill-rule="evenodd"/>` : `<path d="${p.d}" fill="none" stroke="#000" stroke-width="${p.stroke!.width}" stroke-linecap="${p.stroke!.linecap}" stroke-linejoin="${p.stroke!.linejoin}"/>`
  const groups = glyphs.map((g) => { const out = `<g data-index="${g.index}" data-char="${g.char}" data-advance="${g.advance.toFixed(4)}" transform="translate(${x.toFixed(4)} 0)">${g.paths.map(one).join('')}</g>`; x += g.advance; return out })
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${x.toFixed(4)} 1"><metadata>${JSON.stringify(meta).replace(/</g, '\\u003c')}</metadata>${groups.join('')}</svg>`
}

/** 부위 다듬기의 짜임 여섯과 예시 글자(글줄에 그 짜임이 없을 때). */
const PART_LAYOUTS: readonly { layout: LayoutType; name: string; sample: string }[] = [
  { layout: 'choseong-jungseong-vertical', name: '세로', sample: '가' },
  { layout: 'choseong-jungseong-vertical-jongseong', name: '세로 받침', sample: '각' },
  { layout: 'choseong-jungseong-horizontal', name: '가로', sample: '고' },
  { layout: 'choseong-jungseong-horizontal-jongseong', name: '가로 받침', sample: '곡' },
  { layout: 'choseong-jungseong-mixed', name: '섞임', sample: '과' },
  { layout: 'choseong-jungseong-mixed-jongseong', name: '섞임 받침', sample: '곽' },
]
/** 써 넣을 때 칸을 재는 글자: 홀자 스물하나 × 받침 없음 · 있음(첫닿자 · 받침 ㄱ). 짜임 × 홀자마다 Δ 하나. */
const BAKE_SAMPLES: readonly string[] = Array.from({ length: 21 }, (_, medial) => [String.fromCharCode(0xac00 + medial * 28), String.fromCharCode(0xac00 + medial * 28 + 1)]).flat()
/** 닿는 글자를 고를 때 보태는 자주 쓰는 글자. */
const COMMON_CHARS = '가나다라마바사아자차카타파하각간감강갈같개거건것게겠경고공과관교구국군그근글기길김까나남내너는니다단달당대더도동되된될두들등때또로를리마만말매먹면명모목무문물미민바반발밤방배번보본부분불비사산살상새생서선설성세소속손수술시신실심아안않알앞애야약양어언얼업없었에여역연열영예오온올와외요용우운울원월위유으은을음의이인일입있자작잘장저전점정제조좀종주준중지직진질집짓차참창책처천철청초최추출치친큰타터토통투트파판편평포표품하학한할함해했행허현형호화확환활회후희'

const PART_NAMES: Record<Part, string> = { CH: '첫닿자', JU: '홀자', JU_H: '가로홀자', JU_V: '세로홀자', JO: '받침' }

interface Snapshot { edits: LayoutEdits; look: Look }

export function MoldLabPage() {
  const [step, setStep] = useState<Step>('draw')
  // `?s=문장`으로 처음 문장을 정할 수 있다(확인용).
  const [sentence, setSentence] = useState(() => new URLSearchParams(window.location.search).get('s')?.trim() || FIRST_SENTENCE)
  // 원본(`moldOrigin.ts`): 써 넣은 적이 있으면 화면은 원본 + 판 값, 판은 마지막으로 써 넣은 값에서 시작한다.
  const [origin, setOrigin] = useState<MoldOrigin | null>(() => readOrigin())
  const [raws, setRaws] = useState<Partial<Record<StemKind, PenPoint[]>>>(() => origin?.saved.raws ?? {})
  const [edits, setEdits] = useState<LayoutEdits>(() => origin?.saved.edits ?? {})
  const [look, setLook] = useState<Look>(() => origin?.saved.look ?? inkLookOf(useGlobalStyleStore.getState().style))
  const storeStyle = useGlobalStyleStore((state) => state.style)
  // 판의 처음 값: 원본(없으면 저장소) 굵기 · 붓 + 엔진 그대로. 그 칸으로 돌아오면 처음 값 그대로 쓴다.
  const homeStyle = origin?.style ?? storeStyle
  const homeLook = useMemo(() => inkLookOf(homeStyle), [homeStyle])
  // 저장소가 늦게 불려 오면(새로 고침) 아직 안 만진 판만 저장된 값으로 맞춘다.
  const styleHydrated = useGlobalStyleStore((state) => state._hydrated)
  const jamoHydrated = useJamoStore((state) => state._hydrated)
  useEffect(() => { if (styleHydrated && !origin) setLook((now) => (Object.keys(now).every((key) => key === 'weightBase') ? inkLookOf(useGlobalStyleStore.getState().style) : now)) }, [styleHydrated]) // eslint-disable-line react-hooks/exhaustive-deps -- 불려 온 때 한 번
  // 써 넣은 뒤 다른 화면에서 저장소를 고쳤으면 원본은 버린다(그 고침을 다음 써 넣기가 덮지 않게). 판도 처음으로.
  useEffect(() => {
    if (!styleHydrated || !jamoHydrated || !origin || origin.stamp === storesStamp()) return
    dropOrigin(); setOrigin(null)
    setLook(inkLookOf(useGlobalStyleStore.getState().style)); setEdits({}); setRaws({})
  }, [styleHydrated, jamoHydrated]) // eslint-disable-line react-hooks/exhaustive-deps -- 불려 온 때 한 번
  const [sel, setSel] = useState<Region | null>(null)
  const [focusAt, setFocusAt] = useState(0)
  const [history, setHistory] = useState<Snapshot[]>([])
  const [stemPick, setStemPick] = useState<StemBase>('gidung')
  const storedVowels = useJamoStore((state) => state.jungseong)
  // 같은 이름 줄기가 몇 개인지(모든 홀자, 채널마다). 고르면 이 수만큼 함께 바뀐다.
  const stemCount = useMemo(() => {
    const count = Object.fromEntries(STEM_PICKS.map((base) => [base, 0])) as Record<StemBase, number>
    for (const jamo of Object.values(storedVowels)) for (const channel of JAMO_CHANNELS) {
      const strokes = jamo[channel] ?? []
      for (const stroke of strokes) { const name = masterNameOf(jamo, strokes, stroke.id); if (name) count[baseOf(name)]++ }
    }
    return count
  }, [storedVowels])
  const [compare, setCompare] = useState(false)
  const [plate, setPlate] = useState<Plate>('ink')
  const [plateSay, setPlateSay] = useState('판을 가로질러 한 번에 그어 보기')
  const [askReset, setAskReset] = useState(false)
  // 글자마다 버틸 수 있는 가장 굵은 비율(자소를 끝까지 키워도 획이 안 붙는 데까지). 글줄은 가장 작은 것을 다 같이 쓴다 — 굵기는 글줄 전체가 같다.
  const [caps, setCaps] = useState<Record<string, number>>({})
  const capReporters = useMemo(() => {
    const out: Record<number, (ratio: number) => void> = {}
    ;[...sentence].forEach((_, at) => { out[at] = (ratio: number) => setCaps((all) => (all[`${sentence}-${at}`] === ratio ? all : { ...all, [`${sentence}-${at}`]: ratio })) })
    return out
  }, [sentence])
  const weightCap = Math.min(Infinity, ...[...sentence].map((char, at) => (char === ' ' ? Infinity : caps[`${sentence}-${at}`] ?? Infinity)))
  const weightNote = appliedWeight(lookOf(look, 'weight'), weightCap) < lookOf(look, 'weight') ? '획이 붙기 직전이라 글줄 전체가 여기서 멈춤' : ''
  // 굵기 줄에서 더 가면 획이 붙는 칸은 잠근다(그림이 안 바뀌는데 값만 오르는 일이 없게).
  const weightLock = weightCap === Infinity ? undefined : Math.max(0, ...Array.from({ length: 21 }, (_, k) => k).filter((k) => dotToLook('weight', k) <= Math.max(1, weightCap) + 1e-6))
  // 울타리 보정과 획 사이 최소 틈은 사용자 값이 아니라 서비스가 지킬 기준이라 화면에서 뺐다(고양이 흐름 다시 보기 7번). 늘 안전선으로 켜 둔다.
  const fenceOn = true
  const fenceLine: FenceLine = 'safe'
  const [fenceReports, setFenceReports] = useState<Record<string, { need: number; pulls: readonly FencePull[] }>>({})
  const fenceReporters = useMemo(() => {
    const out: Record<number, (need: number, pulls: readonly FencePull[]) => void> = {}
    ;[...sentence].forEach((_, at) => { out[at] = (need, pulls) => setFenceReports((all) => { const key = `${sentence}-${at}`; const old = all[key]; return old && old.need === need && JSON.stringify(old.pulls) === JSON.stringify(pulls) ? all : { ...all, [key]: { need, pulls } } }) })
    return out
  }, [sentence])
  // 저장소에 써 넣기(PR D): 짜임마다 대표 글자 하나를 안 보이게 그려 빚은 칸을 받아 둔다. 윗선 들쭉날쭉은 글자마다 달라서 뺀다.
  const { bundle } = useNotoModel()
  const bakeItems = useRef<Record<string, BakeTarget>>({})
  const bakeReporters = useMemo(() => Object.fromEntries(BAKE_SAMPLES.map((sample) => [sample, (item: BakeTarget) => { bakeItems.current[sample] = item }])), [])
  const bakeLook = useMemo(() => ({ ...look, jag: LOOK_ENGINE.jag }), [look])
  const [bakeAsk, setBakeAsk] = useState(false)
  const [baked, setBaked] = useState<{ layouts: number; residual: number; worst: string; heavy: boolean; jamo: number } | null>(null)
  // 글줄 글자도 빚은 칸을 받아 둔다 — 써 넣은 뒤 대표 글자 말고 글줄 전체에서 남은 차이를 잰다.
  const lineBakeItems = useRef<Record<string, BakeTarget>>({})
  const lineBakeReporters = useMemo(() => Object.fromEntries([...sentence].map((_, at) => [at, (item: BakeTarget) => { lineBakeItems.current[`${sentence}-${at}`] = item }])) as Record<number, (item: BakeTarget) => void>, [sentence])
  const writeStore = () => {
    const items = BAKE_SAMPLES.map((sample) => bakeItems.current[sample]).filter((item): item is BakeTarget => !!item)
    if (!bundle || items.length === 0) return
    // 절댓값으로 써 넣기: 저장소를 원본(처음 써 넣기 직전)으로 되돌리고 판 값을 한 번만 얹는다. 화면도 원본으로 그렸다.
    const base = origin ?? captureOrigin()
    restoreOrigin(base)
    const store = useGlobalStyleStore.getState()
    const baseStyle = { ...store.style, ...base.style }
    // 획 판 → 전역 스타일. 굵기는 글줄이 실제로 쓴 값(막힌 데서 멈춘 값), 자간은 비율로 좁아진 폭 + 자간 줄.
    const inked = moldInk({ ...moldBaseStyle(baseStyle), weight: scaledWeight(MOLD_BASE_WEIGHT, appliedWeight(lookOf(look, 'weight'), weightCap)) }, look)
    const sx = items.reduce((sum, item) => sum + item.sx, 0) / items.length
    const letterSpacing = Math.round((base.style.letterSpacing + sx - 1 + lookOf(look, 'tracking')) * 1000) / 1000
    // 칸 → 레이아웃 Δ. 새 스타일의 끝 모양으로 풀어 본다.
    const snapshot = layoutDeltaSnapshot()
    const ends = { linecap: inked.linecap, linejoin: inked.linejoin, strokeStyle: inked.strokeStyle }
    const layouts = items.map((item) => bakeLayout({ bundle, snapshot, ends, item })).filter((item): item is BakedLayout => !!item)
    // 윗선 들쭉날쭉: 첫닿자 × 짜임 규칙(칸 Δ 위에 더한다).
    const jag = lookOf(look, 'jag')
    applyBakedLayouts(jag > LOOK_ENGINE.jag + 1e-6 ? [...layouts, ...jagRules(items, jag)] : layouts)
    // 획: 긋기 · 허리선 곁줄기 · 곁줄기 길이 · 닿자 획 두께 → 자모 저장소.
    const jamo = useJamoStore.getState()
    const choseongOut = bakedConsonants(jamo.choseong, drawn?.consonants, 'choseong', meanThick(items, 'CH'))
    const jongseongOut = bakedConsonants(jamo.jongseong, drawn?.consonants, 'jongseong', meanThick(items, 'JO'))
    const jungseongOut = bakedVowels(jamo.jungseong, drawn?.jungseong, items, look, { ink: weightToMultiplier(MOLD_BASE_WEIGHT), linecap: inked.linecap })
    for (const [char, data] of Object.entries(choseongOut)) jamo.updateChoseong(char, data)
    for (const [char, data] of Object.entries(jungseongOut)) jamo.updateJungseong(char, data)
    for (const [char, data] of Object.entries(jongseongOut)) jamo.updateJongseong(char, data)
    store.updateStyle('weight', inked.weight)
    store.updateStyle('letterSpacing', letterSpacing)
    store.setBrushStyle(inked.brush)
    store.setStrokeRenderStyle(inked.strokeStyle)
    // 판은 제자리에 둔다. 화면은 원본 + 판 값이라 저장소에 쓴 것과 같은 그림이고, 다시 써 넣어도 원본에서 다시 푼다.
    const next: MoldOrigin = { ...base, saved: structuredClone({ look, edits, raws }), stamp: storesStamp() }
    writeOrigin(next); setOrigin(next)
    setBakeAsk(false)
    // 남은 차이: 대표 글자만이 아니라 글줄 글자마다, 써 넣은 저장소로 다시 풀어 빚은 칸과 잰다.
    const after = layoutDeltaSnapshot()
    let residual = Math.max(0, ...layouts.map((item) => item.residual)), worst = '', heavyLeft = false
    ;[...sentence].forEach((char, at) => {
      const item = char === ' ' ? undefined : lineBakeItems.current[`${sentence}-${at}`]
      let r = item ? bakedResidual({ bundle, snapshot: after, ends, item: item.heavy ? { ...item, target: item.heavy.boxes } : item }) : null
      // 풍선 굵기: 버전 1은 글줄 한 굵기(저장소 굵기 × 닿자 두께 배율)로 그린다. 화면의 자소마다 세로 · 가로 두께와의 차이도 남은 차이다.
      if (item?.heavy) {
        const storeM = weightToMultiplier(inked.weight)
        for (const [group, ink] of Object.entries(item.heavy.ink) as ['CH' | 'JU' | 'JO', { v: number; h: number; t: number }][]) {
          const scale = group === 'CH' ? meanThick(items, 'CH') : group === 'JO' ? meanThick(items, 'JO') : 1
          const store = ink.t * scale * storeM
          r = Math.max(r ?? 0, Math.abs(ink.v - store), Math.abs(ink.h - store))
        }
        heavyLeft = true
      }
      if (r !== null && r > residual) { residual = r; worst = char }
    })
    setBaked({ layouts: layouts.length, residual, worst, heavy: heavyLeft, jamo: Object.keys(choseongOut).length + Object.keys(jungseongOut).length + Object.keys(jongseongOut).length })
  }
  const fenceReportsNow = [...sentence].flatMap((char, at) => (char === ' ' ? [] : fenceReports[`${sentence}-${at}`] ? [fenceReports[`${sentence}-${at}`]] : []))
  const jamoScale = Math.min(1, ...fenceReportsNow.map((report) => report.need))
  const fence = useMemo<MoldFence>(() => ({ on: fenceOn, line: fenceLine, scale: jamoScale }), [fenceOn, fenceLine, jamoScale])

  const liveChoseong = useJamoStore((state) => state.choseong)
  const liveJungseong = useJamoStore((state) => state.jungseong)
  const liveJongseong = useJamoStore((state) => state.jongseong)
  const choseong = origin?.choseong ?? liveChoseong, jungseong = origin?.jungseong ?? liveJungseong, jongseong = origin?.jongseong ?? liveJongseong

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
  // 부위 다듬기에서 짜임 칸 · 닿는 글자를 눌러 고른 글자. 글줄 글자를 누르면 풀린다.
  const [partChar, setPartChar] = useState<string | null>(null)
  const workChar = step === 'part' && partChar ? partChar : focusChar
  const layoutOf = useCallback((char: string) => decomposeSyllable(char, choseong, jungseong, jongseong).layoutType, [choseong, jungseong, jongseong])
  const layoutOfFocus = layoutOf(workChar)
  // 같은 짜임 글자 여덟(버전 1 부위 다듬기의 "닿는 글자"). 글줄 · 예문 · 자주 쓰는 글자에서.
  const touched = useMemo(() => {
    const pool = [...new Set([...sentence, ...SAMPLE_SENTENCES.join(''), ...COMMON_CHARS].filter((char) => /[가-힣]/.test(char)))]
    return pool.filter((char) => char !== workChar && layoutOf(char) === layoutOfFocus).slice(0, 8)
  }, [sentence, workChar, layoutOf, layoutOfFocus])
  const resetRegion = () => {
    remember()
    // 인상은 통째로, 칸은 서로 맞물려 있어 짜임째로 되돌린다.
    if (step === 'shape') setLook((now) => Object.fromEntries([...STROKE_KEYS, 'tracking' as const].map((key) => [key, now[key]])))
    else if (step === 'finish') setLook((now) => ({ ...now, tracking: undefined }))
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

  // 윤곽 내보내기: 다람쥐가 Playwright로 `window.__moldExport()`를 부르거나, 마무리의 단추로 SVG를 받는다.
  const exportMeta = useMemo(() => ({ sentence, look, edits, drawn: Object.keys(raws).filter((key) => raws[key as StemKind]), unit: '글자 칸 1em', at: new Date().toISOString() }), [sentence, look, edits, raws])
  useEffect(() => {
    const target = window as unknown as { __moldExport?: () => { meta: unknown; glyphs: OutlineGlyph[]; svg: string } }
    target.__moldExport = () => { const glyphs = outlineOf(); return { meta: exportMeta, glyphs, svg: outlineSvg(glyphs, exportMeta) } }
    return () => { delete target.__moldExport }
  }, [exportMeta])
  const downloadOutline = () => {
    const glyphs = outlineOf()
    const url = URL.createObjectURL(new Blob([outlineSvg(glyphs, exportMeta)], { type: 'image/svg+xml' }))
    const a = document.createElement('a'); a.href = url; a.download = 'mold-outline.svg'; a.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const goNext = () => { const next = STEP_ORDER[stepIndex + 1]; if (next) setStep(next) }
  const NEXT_LABEL: Partial<Record<Step, string>> = { shape: '부위 다듬기로', part: '획 다듬기로', stroke: '마무리로' }
  const tracking = lookOf(look, 'tracking'), [t0, t1] = LOOK_WALL.tracking, trackingPct = Math.round((tracking - t0) / (t1 - t0) * 100)

  return <MoldOriginContext.Provider value={origin}><main className={styles.page}>
    <header className={styles.header}>
      <span className={styles.eyebrow}>빚기 시험판 · {stepIndex + 1}/{STEP_ORDER.length} {STEP_NAMES[step]}</span>
      <ChoiceGroup variant="segment" aria-label="단계" className={styles.steps}>
        {STEP_ORDER.map((key, at) => <ChoiceItem key={key} checked={step === key} onClick={() => setStep(key)} data-testid={`mold-step-${key}`}>{at + 1} {STEP_NAMES[key]}</ChoiceItem>)}
      </ChoiceGroup>
    </header>

    <section className={styles.card} aria-label="예시 글줄">
      <div className={styles.line} data-testid="mold-line" data-compact={step === 'shape' || undefined}>
        {chars.map((char, at) => char === ' '
          ? <span key={at} className={styles.space} />
          : <Pressable key={`${sentence}-${at}`} className={styles.lineChar} data-on={(step === 'part' && (partChar ? char === partChar : at === focusIndex)) || undefined} onClick={() => { setFocusAt(at); setPartChar(null) }} aria-label={`${char} 크게 보기`} data-testid={`mold-pick-${at}`}>
            <MoldGlyph char={char} size={42} edits={lineEdits} look={lineLook} drawn={lineDrawn} shownStroke={step === 'draw' && !compare ? shownStroke : undefined} testId={`mold-char-${at}`} weightCap={weightCap} onCap={compare ? undefined : capReporters[at]} onBake={compare ? undefined : lineBakeReporters[at]} fence={compare ? undefined : fence} onFence={compare ? undefined : fenceReporters[at]} />
          </Pressable>)}
      </div>
      <div className={styles.lineActions}>
        <Button variant="ghost" size="sm" onClick={roll} data-testid="mold-dice"><Dices aria-hidden="true" />다른 문장</Button>
        <Button variant="chip" size="chip-sm" aria-pressed={compare} disabled={changed === 0}
          onPointerDown={() => setCompare(true)} onPointerUp={() => setCompare(false)} onPointerLeave={() => setCompare(false)} onPointerCancel={() => setCompare(false)}
          data-testid="mold-compare">{compare ? '처음 모습' : '누르는 동안 처음과 견주기'}</Button>
      </div>
    </section>

    {step === 'draw' && <DrawStep raws={raws} setRaws={setRaws} stems={stems} onDone={() => setStep('shape')} />}
    {step !== 'draw' && <>
      {step === 'shape' && <section className={styles.panel} aria-label="인상 잡기">
        <ChoiceGroup variant="segment" aria-label="판" className={styles.plates}>
          {(['ink', 'frame'] as const).map((key) => <ChoiceItem key={key} checked={plate === key} onClick={() => setPlate(key)} data-testid={`mold-plate-${key}`}>{PLATE_NAMES[key]}</ChoiceItem>)}
        </ChoiceGroup>
        <MoldDotPlate key={plate} keys={plate === 'frame' ? FRAME_KEYS : INK_KEYS} locks={plate === 'ink' && weightLock !== undefined ? { weight: weightLock } : undefined} look={look} home={homeLook} setLook={setLook} onBegin={remember} onSay={setPlateSay} />
        <p className={styles.simsReadout} data-testid="mold-readout">{plateSay}{weightNote ? <><br />{weightNote}</> : null}</p>
        <p className={styles.skipNote}>점선 · 폰트들의 가운데 / 검은 눈금 · 지금 바탕(노토)</p>
      </section>}
      {step === 'part' && <>
        <nav className={styles.layouts} aria-label="짜임" data-testid="mold-layouts">
          <span className={styles.layoutCount}>짜임 {PART_LAYOUTS.findIndex((item) => item.layout === layoutOfFocus) + 1}/6</span>
          {PART_LAYOUTS.map((item) => <Button key={item.layout} variant="chip" size="chip-sm" aria-selected={item.layout === layoutOfFocus} data-done={edits[item.layout] && Object.keys(edits[item.layout]!).length ? true : undefined}
            onClick={() => { const inLine = chars.find((char) => char !== ' ' && layoutOf(char) === item.layout); setPartChar(inLine ?? item.sample) }} data-testid={`mold-layout-${item.layout}`}>
            {edits[item.layout] && Object.keys(edits[item.layout]!).length ? <Check aria-hidden="true" /> : null}{item.name}
          </Button>)}
        </nav>
        <SimsStep fence={compare ? undefined : fence} char={workChar} drawn={drawn} edits={edits} setEdits={setEdits} look={look} weightCap={weightCap} sel={sel} setSel={setSel} onBegin={remember} />
        <section className={styles.touched} aria-label="닿는 글자" data-testid="mold-touched">
          <span className={styles.layoutCount}>닿는 글자 · 같은 짜임은 다 같이 바뀜(옅은 것은 처음 모습)</span>
          <div className={styles.touchedRow}>
            {touched.map((char) => <Pressable key={char} className={styles.touchedChar} onClick={() => setPartChar(char)} aria-label={`${char} 크게 보기`} data-testid={`mold-touched-${char}`}>
              <span className={styles.touchedGhost} aria-hidden="true"><MoldGlyph char={char} size={34} edits={NO_EDITS} look={look} drawn={drawn} weightCap={weightCap} /></span>
              <MoldGlyph char={char} size={34} edits={edits} look={look} drawn={drawn} weightCap={weightCap} fence={fence} />
            </Pressable>)}
          </div>
        </section>
      </>}
      {step === 'stroke' && <section className={styles.panel} aria-label="획 다듬기" data-testid="mold-stroke-step">
        <ChoiceGroup variant="segment" aria-label="줄기 고르기" className={styles.plates} data-testid="mold-stem-picks">
          {STEM_PICKS.map((base) => <ChoiceItem key={base} checked={stemPick === base} onClick={() => setStemPick(base)} data-testid={`mold-stem-${base}`}>{STEM_TUNE[base].name}</ChoiceItem>)}
        </ChoiceGroup>
        {[...stemBarsOf(stemPick), { key: 'serif' as const, name: '부리' }].map((bar) => {
          const [lo, hi] = LOOK_WALL[bar.key], value = lookOf(look, bar.key), pct = Math.round((value - lo) / (hi - lo) * 100)
          return <Field key={bar.key} label={bar.name} value={pct}>
            <RangeBar min={0} max={100} value={pct} onPointerDown={remember} onKeyDown={remember} onChange={(event) => setLook({ ...look, [bar.key]: lo + (hi - lo) * Number(event.currentTarget.value) / 100 })} aria-label={`${bar.key === 'serif' ? '' : `${STEM_TUNE[stemPick].name} `}${bar.name}`} data-testid={`stroke-${bar.key}`} />
          </Field>
        })}
        <div className={styles.fenceLine} data-testid="mold-stem-count"><span>같은 이름 줄기</span><span>{stemCount[stemPick]}개 함께 바뀜</span></div>
        {STROKE_LATER.map((name) => <div key={name} className={styles.fenceLine}><span>{name}</span></div>)}
      </section>}
      {step === 'finish' && <section className={styles.panel} aria-label="마무리" data-testid="mold-finish-step">
        <Field label="자간" value={`${tracking >= 0 ? '+' : ''}${Math.round(tracking * 100)}%`}>
          <RangeBar min={0} max={100} value={trackingPct} onPointerDown={remember} onKeyDown={remember} onChange={(event) => setLook({ ...look, tracking: t0 + (t1 - t0) * Number(event.currentTarget.value) / 100 })} aria-label="자간" data-testid="finish-tracking" />
        </Field>
        <p className={styles.note}>자간은 글자 모양이 다 정해진 뒤 글줄에서 맞춤. 써 넣으면 지금 연 폰트의 전역 스타일과 레이아웃에 들어가고, 폰트 탭 · 추출 · 검수 격자에서 그대로 보임.</p>
        {bakeAsk
          ? <div className={styles.moldActions} data-testid="mold-bake-ask">
            <span className={styles.skipNote}>지금 연 폰트에 빚은 값을 써 넣음</span>
            <Button variant="outline" size="sm" onClick={() => setBakeAsk(false)} data-testid="mold-bake-no">취소</Button>
            <Button size="sm" onClick={writeStore} disabled={!bundle} data-testid="mold-bake-yes">써 넣기</Button>
          </div>
          : <Button size="sm" onClick={() => { setBaked(null); setBakeAsk(true) }} data-testid="mold-bake">저장소에 써 넣기</Button>}
        {baked && <p className={styles.note} data-testid="mold-baked">써 넣음 · 짜임×홀자 {baked.layouts} · 자모 {baked.jamo} · 남은 차이 {Math.round(baked.residual * 1000)}u{baked.worst ? `(가장 큰 글자 「${baked.worst}」 — 같은 짜임 · 홀자는 첫닿자 ㄱ 글자의 칸을 같이 받는다)` : ''}.{baked.heavy ? ' 굵기 풍선(자소마다 굵기 · 넓힘 · 열린 끝)은 저장소에 아직 다 안 들어감 — 버전 1은 글줄 한 굵기로 그림.' : ''} 부리는 출시 뒤</p>}
        {baked && <div className={styles.moldActions}>
          <Button variant="outline" size="sm" onClick={() => window.location.assign('/workspace/font')} data-testid="mold-go-font">폰트 탭에서 보기</Button>
          <Button variant="outline" size="sm" onClick={() => window.location.assign('/dashboard')} data-testid="mold-go-dashboard">이어서 깎기</Button>
        </div>}
        <div className={styles.bakeHidden} aria-hidden="true">
          {BAKE_SAMPLES.map((sample) => <MoldGlyph key={sample} char={sample} size={20} edits={edits} look={bakeLook} drawn={drawn} weightCap={weightCap} fence={fence} onBake={bakeReporters[sample]} />)}
        </div>
        <Button variant="outline" size="sm" onClick={downloadOutline} data-testid="mold-export">윤곽 내보내기(SVG)</Button>
      </section>}
      <div className={styles.moldActions}>
        <Button variant="outline" size="sm" onClick={undo} disabled={!history.length} data-testid="mold-undo"><Undo2 aria-hidden="true" />되돌리기</Button>
        <Button variant="outline" size="sm" onClick={resetRegion} disabled={step === 'part' && !edits[layoutOfFocus]} data-testid="mold-reset-region"><RotateCcw aria-hidden="true" />{step === 'shape' ? '처음 값' : step === 'stroke' ? '획 처음대로' : step === 'finish' ? '자간 처음대로' : '이 짜임 처음대로'}</Button>
      </div>
      {NEXT_LABEL[step] && <Button size="block" onClick={goNext} data-testid={`mold-next-${step}`}>{NEXT_LABEL[step]}<ChevronRight aria-hidden="true" /></Button>}
      {step === 'shape' && <p className={styles.skipNote}>부위 다듬기는 건너뛰어도 돼요.</p>}
    </>}

    {changed > 0 && (askReset
      ? <div className={styles.moldActions} data-testid="mold-reset-ask">
        <span className={styles.skipNote}>그은 획까지 모두 지움</span>
        <Button variant="outline" size="sm" onClick={() => setAskReset(false)} data-testid="mold-reset-no">취소</Button>
        <Button variant="destructive" size="sm" onClick={() => { remember(); setEdits({}); setLook(homeLook); setRaws({}); setStep('draw'); setAskReset(false) }} data-testid="mold-reset-yes">지우기</Button>
      </div>
      : <Button variant="ghost" size="sm" className={styles.center} onClick={() => setAskReset(true)} data-testid="mold-reset-all"><RotateCcw aria-hidden="true" />모두 처음대로</Button>)}
  </main></MoldOriginContext.Provider>
}
