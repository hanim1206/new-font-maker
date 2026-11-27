import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { Check, ChevronRight, Dices, RotateCcw, Undo2 } from 'lucide-react'
import { SvgRenderer } from '../src/renderers/SvgRenderer'
import { resolveGlyphInkPrimitives } from '../src/services/glyphInkResolver'
import type { PenPoint } from '../src/services/penStrokeFit'
import { useEffectiveGlobalStyle, useGlobalStyleStore } from '../src/stores/globalStyleStore'
import { flattenStrokeCenterline } from '../src/services/brushGeometry'
import { contrastWidthOf } from '../src/services/flatStrokeGeometry'
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
import { clearanceRatio, correctGlyph, GOTHIC_FENCE, measureGlyph, movedBoxes, partClearances, pickJamoScale, scaledBoxes, type FenceLine, type FencePull, type PartPair, nearestBetweenParts } from './fenceBand'
import { nibStemFactor, openFactorOf, BLACK_CENTER, BLACK_RATIO, CONTRAST_PATTERN_RANGE, patternWeightRatio, HEAVY_HORIZONTAL_SHARE, heavyThicknessOf, inkLookOf, moldBaseStyle, MOLD_BASE_WEIGHT, stemSyllable, STEM_KEYS, STEM_TUNE, type StemKey, applyPartEdits, appliedWeight, balloonOk, branchSyllable, growSides, GAP_FLOOR, lookScale, serifSyllable, waistLift, moldInk, inflateSyllable, dotToLook, waistSyllable, armSyllable, dragSeam, lookBoxes, gapCapMultiplier, lookOf, LOOK_ENGINE, LOOK_WALL, scaledWeight, seamPos, seamRange, seamsOf, SEAM_HARD_FLOOR, type SeamWall, simsPartOf, type GapStroke, type LayoutEdits, type Look, type PartEdits, type Region, type SimsPart } from './moldLab'
import { useContextPlacement, useNotoModel } from './notoModel'
import { stackColumns, stackLay } from './moldStack'
import { balloonGroupOf, endReachOf, inkOfThick, solveBalloon, type BalloonGroup, type BalloonStroke, type Thick } from './moldBalloon'
import { inkHeightOf, isOpenSyllable, solveStack900, type StackStroke } from './moldStack900'
import { applyBakedLayouts, bakedConsonants, bakedResidual, bakedVowels, bakeLayout, jagRules, meanThick, type BakeTarget, type BakedLayout } from './moldBake'
import { layoutDeltaSnapshot } from './layoutDeltaStore'
import { captureOrigin, dropOrigin, MoldOriginContext, readOrigin, restoreOrigin, storesStamp, useMoldOrigin, writeOrigin, type MoldOrigin } from './moldOrigin'
import { SAMPLE_SENTENCES } from './sampleSentences'
import { consonantBoxesOf, consonantShapesOf, drawnStem, LAYOUTS, mastersOf, penThicknessOf, shapeConsonants, shownRunsOf, STEMS, stemInfo, type ShownRuns, vowelStemKeys, withPenThicknessVowels, type DrawnStem, type StemKind } from './strokeLab'
import { MoldRubPlate } from './MoldRubPlate'
import { thinBudget, thinSyllable, type BudgetStroke } from './moldBudget'
import { engineGapOf } from './moldGap'
import { kkokjiSyllable } from './moldKkokji'
import { finalBoxes, finalEaseOf, HALO_ENGINE, haloBoxes, haloCorrect, haloFinalFit, haloFit, haloSideOf, haloTopFit, haloTopOf, topBoxes, type HaloFit, type HaloStroke } from './moldHalo'
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
/** 굵을 때 900 쌓임 규칙(`moldStack900.ts`)으로 푼다. 끄면 예전 풍선 · 쌓인 획 법칙 셈. */
const STACK_900 = true
/** 고른 틈을 그린 가로획 두께에서 셈(`evenGapOfBar`, 2026-11-27). 실험실 주소에 `?evenGap=stem`이면 옛 식(기둥, C029 스위치). */
const EVEN_GAP_FROM_BAR = typeof window === 'undefined' || new URLSearchParams(window.location.search).get('evenGap') !== 'stem'

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
/** 긋기 단계: 닿자 획을 보이는 토막만 남긴 획들로 나눈다(그리기만, 칸 · 굵기 셈은 온 획으로 한다). */
const SHOWN_CUT = '#'
/** 굵을 때 곧은 닿자 획은 마디마다 조각(`id~마디`)으로 나뉘어 온다(`heavy` 끝 늘이기). 조각의 본 획 id와 마디 번호. */
const PIECE = /^(.*)~(\d+)$/
const pieceOf = (id: string) => { const m = PIECE.exec(id); return m ? { id: m[1], at: Number(m[2]) } : null }
const runHas = (runs: readonly number[][], at: number) => runs.some((run) => run.some((index, k) => k > 0 && run[k - 1] === at && index === at + 1))
function shownCut(syllable: DecomposedSyllable, shownStroke: ((key: string) => ShownRuns) | undefined): DecomposedSyllable {
  if (!shownStroke) return syllable
  const cut = (jamo: JamoData | null | undefined, family: 'CH' | 'JO'): JamoData | null | undefined => {
    if (!jamo) return jamo
    let changed = false
    const cutList = (list: StrokeDataV2[]) => list.flatMap((stroke) => {
      const piece = pieceOf(stroke.id)
      if (piece) {
        // 마디 조각: 보이는 토막 안의 마디만 남긴다.
        const whole = shownStroke(`${family}:${jamo.char}:${piece.id}`)
        if (typeof whole === 'string') return [stroke]
        changed = true
        return runHas(whole.runs, piece.at) ? [stroke] : []
      }
      const shown = shownStroke(`${family}:${jamo.char}:${stroke.id}`)
      if (typeof shown === 'string') return [stroke]
      // 입힌 뒤 앵커 수가 셈과 다르면(엔진이 점을 보탠 경우) 나누지 않고 온 획을 보인다.
      if (stroke.points.length !== shown.total) return [stroke]
      changed = true
      return shown.runs.map((run, at) => ({
        ...stroke,
        id: `${stroke.id}${SHOWN_CUT}${at}`,
        closed: false,
        points: run.map((index, k) => {
          const { handleIn, handleOut, ...point } = stroke.points[index]
          return { ...point, ...(k > 0 && handleIn ? { handleIn } : {}), ...(k < run.length - 1 && handleOut ? { handleOut } : {}) }
        }),
      }))
    })
    // 문맥 계열 획(`contextStrokes`)도 같은 id면 같이 나눈다(앵커 수가 다르면 온 획).
    const strokes = jamo.strokes && cutList(jamo.strokes)
    const contextStrokes = jamo.contextStrokes && Object.fromEntries(Object.entries(jamo.contextStrokes).map(([family, list]) => [family, list && cutList(list)]))
    return changed ? { ...jamo, strokes, contextStrokes } : jamo
  }
  const choseong = cut(syllable.choseong, 'CH'), jongseong = cut(syllable.jongseong, 'JO')
  return choseong === syllable.choseong && jongseong === syllable.jongseong ? syllable : { ...syllable, choseong: choseong ?? null, jongseong: jongseong ?? null }
}
function onlyGroup(syllable: DecomposedSyllable, group: BalloonGroup): DecomposedSyllable {
  return { ...syllable, choseong: group === 'CH' ? syllable.choseong : null, jungseong: group === 'JU' ? syllable.jungseong : null, jongseong: group === 'JO' ? syllable.jongseong : null }
}
/**
 * 굵어질 때 글자 잉크 폭이 바깥으로 넓어지는 양(세로줄기 굵어진 em 1당). 거북이 넓어짐 공식 1절(폰트 집안 21개 가운데값).
 * 오른끝: 곁줄기로 끝나면 0.10, 기둥 0.37, 섞임 0.49, 기둥 둘 0.35(쌍닿자와 만나면 0.55). 가로 짜임 0.20.
 * 왼끝: ㄱ · 쌍닿자 0.43, ㅇ ㅁ ㅂ 0.27, 가로 짜임 0.15, 그 밖 0.29.
 */
type Room = { left: number; right: number; up: number; down: number }
/**
 * 자소 칸마다 옆 · 위아래 빈 자리(글자 칸 0~1 끝까지). 그쪽에 마주 선 다른 자소 칸이 있으면 0 — 자소 사이 칸 틈은 자소 사이 틈이라
 * 넓힘이 먹으면 안 된다(지키는 순서 틈 → 굵기 → 칸). 예전엔 그 틈까지 넓혀 닿자 크기 0에서 ㅆ이 ㅐ 기둥에 닿았다(다람쥐 극단 검수 2026-11-27).
 */
function roomsOf(boxes: Partial<Record<Part, BoxConfig>>): Partial<Record<Part, Room>> {
  const out: Partial<Record<Part, Room>> = {}
  const all = Object.entries(boxes).filter(([, box]) => box) as [Part, BoxConfig][]
  for (const [part, b] of all) {
    let left = b.x, right = 1 - b.x - b.width, up = b.y, down = 1 - b.y - b.height
    for (const [other, o] of all) {
      if (other === part) continue
      const rowOverlap = o.y < b.y + b.height - 1e-6 && o.y + o.height > b.y + 1e-6, colOverlap = o.x < b.x + b.width - 1e-6 && o.x + o.width > b.x + 1e-6
      if (rowOverlap) {
        if (o.x + o.width <= b.x + 1e-6) left = 0
        else if (o.x >= b.x + b.width - 1e-6) right = 0
        else if (colOverlap) { if (o.x + o.width / 2 < b.x + b.width / 2) left = 0; else right = 0 }
      }
      if (colOverlap) {
        if (o.y + o.height <= b.y + 1e-6) up = 0
        else if (o.y >= b.y + b.height - 1e-6) down = 0
        else if (rowOverlap) { if (o.y + o.height / 2 < b.y + b.height / 2) up = 0; else down = 0 }
      }
    }
    out[part] = { left: Math.max(0, left), right: Math.max(0, right), up: Math.max(0, up), down: Math.max(0, down) }
  }
  return out
}
/** 넓힘 배율만큼 칸을 키운다. 늘어난 몫은 양쪽 빈 자리 비율대로 나눈다. */
function widenedBoxes(boxes: Partial<Record<Part, BoxConfig>>, widen: Partial<Record<Part, { x: number; y: number }>>, rooms: Partial<Record<Part, Room>>): Partial<Record<Part, BoxConfig>> {
  const parts = Object.keys(widen) as Part[]
  if (!parts.length) return boxes
  const out = { ...boxes }
  for (const part of parts) {
    const box = boxes[part], w = widen[part]!, r = rooms[part]
    if (!box || !r) continue
    const gx = box.width * (w.x - 1), gy = box.height * (w.y - 1)
    const sx = r.left + r.right, sy = r.up + r.down
    out[part] = { ...box, x: box.x - (sx > 0 ? gx * r.left / sx : 0), width: box.width + gx, y: box.y - (sy > 0 ? gy * r.up / sy : 0), height: box.height + gy }
  }
  return out
}
/**
 * 글자 바닥(거북이 굵을-때-획-균형.md ② · ③, 완료 기준): 굵을 때 어느 글자든 가장 가는 획 ≥ 글줄 기준 T(바라는 세로줄기)의 이 비율.
 * 폰트 패턴: 검은고딕(T 0.19em) 글자마다 가장 가는 획 ÷ 「이」 기둥의 가장 낮은 값 0.50, 노토 900 가운데 0.78.
 */
const GLYPH_FLOOR = 0.5
/** 쌓인 획 법칙에서 앞 걸음 굵기를 볼 때 굵기 1 ~ 지금을 나눈 칸 수. */
const STACK_STEPS = 8
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

/** 흐림 선 재기에 넣을 잉크(중심선 + 두께). `thickOf`가 있으면 자소마다 세로 · 가로 배율을 준다(풍선 굵기). */
/** 글자에 든 획(자소 데이터 그대로)을 id로 찾는다. */
function strokeOfSyllable(syllable: DecomposedSyllable, part: Part, id: string): StrokeDataV2 | undefined {
  const jamo = part === 'CH' ? syllable.choseong : part === 'JU' || part === 'JU_H' || part === 'JU_V' ? syllable.jungseong : syllable.jongseong
  if (!jamo) return undefined
  return [...(jamo.strokes ?? []), ...(jamo.horizontalStrokes ?? []), ...(jamo.verticalStrokes ?? [])].find((stroke) => stroke.id === id) as StrokeDataV2 | undefined
}

function haloStrokesOf(syllable: DecomposedSyllable, boxes: Partial<Record<Part, BoxConfig>>, style: { linecap: GlobalStyle['linecap']; linejoin: GlobalStyle['linejoin'] }, multiplier: number, thickOf?: (part: Part) => { v: number; h: number }): HaloStroke[] {
  return resolveGlyphInkPrimitives({ syllable, placement: { kind: 'boxes', boxes }, weightMultiplier: 1, globalLinecap: style.linecap, globalLinejoin: style.linejoin, horizontalInkBounds: { min: 0, max: 1 } })
    .primitives.map((primitive) => ({ part: primitive.source.part, points: flattenStrokeCenterline(primitive.stroke as StrokeDataV2, primitive.box), thickness: primitive.stroke.thickness * multiplier, closed: primitive.stroke.closed, cap: (primitive.stroke as StrokeDataV2).linecap ?? style.linecap, ...(thickOf ? { thick: thickOf(primitive.source.part) } : {}) }))
}
const haloAttr = (fit: HaloFit | null) => fit ? `${fit.err.toFixed(4)} ${fit.ease.toFixed(4)} ${fit.widen.toFixed(3)} ${fit.push.toFixed(4)} ${fit.stem.toFixed(4)} ${fit.gap.toFixed(4)}` : undefined

/** 글자 잉크의 가로 끝(글자 칸 0~1). 중심선 ± 반 두께로 잰다(자간 바닥용, 대비 · 붓은 굵은 쪽으로 넉넉히). */
function inkSpanOf(syllable: DecomposedSyllable, boxes: Partial<Record<Part, BoxConfig>>, halfOf: (part: Part, thickness: number) => number, linecap: StrokeDataV2['linecap'], linejoin: StrokeDataV2['linejoin']): { left: number; right: number; stroke: number } | null {
  const result = resolveGlyphInkPrimitives({ syllable, placement: { kind: 'boxes', boxes }, weightMultiplier: 1, globalLinecap: linecap, globalLinejoin: linejoin, horizontalInkBounds: { min: -1, max: 2 } })
  let left = Infinity, right = -Infinity, stroke = 0
  for (const primitive of result.primitives) {
    const half = halfOf(primitive.source.part, primitive.stroke.thickness)
    stroke = Math.max(stroke, half * 2)
    for (const p of flattenStrokeCenterline(primitive.stroke as StrokeDataV2, primitive.box)) { left = Math.min(left, p.x - half); right = Math.max(right, p.x + half) }
  }
  return Number.isFinite(left) ? { left, right, stroke } : null
}
/** 확인용 `?look=` 판 값. 벽 밖 값은 벽으로 자른다. */
function urlLook(): Look | null {
  try {
    const raw = new URLSearchParams(window.location.search).get('look')
    if (!raw) return null
    const value = JSON.parse(raw) as Record<string, unknown>
    const out: Look = {}
    for (const [key, v] of Object.entries(value)) {
      if (!(key in LOOK_WALL) || typeof v !== 'number') continue
      const [lo, hi] = LOOK_WALL[key as keyof typeof LOOK_WALL]
      ;(out as Record<string, number>)[key] = Math.max(lo, Math.min(hi, v))
    }
    return out
  } catch { return null }
}
function MoldGlyph({ char, size, edits, look, drawn, sel, highlight, shownStroke, testId, weightCap = Infinity, onCap, fence, onFence, onBake, onHalo, stackHeight, onStart }: { onHalo?: (push: number) => void; stackHeight?: number; onStart?: (height: number) => void; char: string; size: number; edits: LayoutEdits; look: Look; drawn?: Drawn; sel?: Region | null; highlight?: readonly Part[]; shownStroke?: (key: string) => ShownRuns; testId?: string; weightCap?: number; onCap?: (ratio: number) => void; fence?: MoldFence; onFence?: (need: number, pulls: readonly FencePull[]) => void; onBake?: (item: BakeTarget) => void }) {
  const { syllable: raw, effective, placement, padding, schema } = useGlyphBase(char, drawn)
  const base = useGlyphBase(char, undefined)
  // 무게중심(거북이 A안): ㅏ · ㅓ 곁줄기 높이는 획에서, 첫닿자 밑변 · 보는 칸에서(`impressBoxes`) 옮긴다.
  // 닿자 크기 1 아래는 칸을 줄이기만 한다. 1 위는 풍선 닿자 — 칸은 그대로 두고 맨 끝(울타리까지 입힌 뒤)에서 부풀린다.
  const heavyOn = BALLOON_WEIGHT && lookOf(look, 'weight') > 1
  // 닿자 100 쪽(줄 끝 균형 규칙 ③): 닿자가 큰 폰트(닿자 ≥ 0.79)는 글자 크기가 전체의 0.93배다(폰트 156벌, 거북이 끝에서도-균형.md). 닿자 크기 1 → 끝으로 가며 크기를 0.93배까지.
  const sizedLook = useMemo(() => {
    const t = Math.max(0, (lookOf(look, 'jamo') - 1) / (LOOK_WALL.jamo[1] - 1))
    return t > 0 ? { ...look, size: lookOf(look, 'size') * (1 - (1 - JAMO_BIG_SIZE) * t) } : look
  }, [look])
  const shaped = useMemo(() => {
    if (placement.kind !== 'boxes') return { syllable: raw, boxes: undefined }
    // 풍선 굵기는 자소마다 안으로 당기므로(`solveBalloon`), 글자 통째로 안으로 당기는 셈(`lookScale`)에는 굵기를 안 넣는다.
    const boxes = moldedBoxes(placement.boxes, raw.layoutType, edits, { ...sizedLook, jamo: Math.min(1, lookOf(look, 'jamo')), ...(heavyOn ? { weight: 1, weightBase: 1 } : {}) }, char)
    // 허리선 → 곁줄기 길이 → 줄기마다(휨 · 길이 · 틈) → 부리 → 붓촉 순서로 획을 고친다(획 다듬기 값은 획 모양만 바꾸고 칸은 두지 않는다).
    const waisted = armSyllable(waistSyllable(raw, waistLift(look, placement.boxes, raw.layoutType), boxes), boxes)
    const stroked = serifSyllable(stemSyllable(branchSyllable(waisted, lookOf(look, 'branch'), { boxes, ink: weightToMultiplier(MOLD_BASE_WEIGHT), linecap: effective.linecap }), look), lookOf(look, 'serif'), boxes)
    return { boxes, syllable: stroked }
  }, [placement, raw, edits, look, sizedLook, char, heavyOn, effective.linecap])
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
  // 울타리는 글줄 공통으로 자소를 줄이지 않는다(휜 획 자리 맞추기 = 배치 값 당기기는 그대로).
  // - 굵을 때: 글줄에서 가장 많이 줄여야 하는 글자에 맞춰 모두 줄이면 굵어질 자리가 없어 ㅏ · ㅐ 곁줄기가 기둥에 묻혔다(다람쥐 검수 2026-11-24).
  // - 처음 굵기 이하: 그은 획이 조금만 휘어도 틈 비율이 기본 획보다 낮아 거의 늘 끝(0.8배)까지 줄었다. 글자가 굵기 1에서 1.5로 넘어갈 때
  //   잉크 키 0.76 → 0.98로 튀었다(자동 검사 2026-11-24). 줄이지 않아도 하니무스 모양 글줄에서 자소가 안 닿는다.
  const fenceNow = useMemo(() => fence && STACK_900 ? { ...fence, scale: 1 } : fence, [fence])
  const fenced = useMemo(() => fenceNow && grown.boxes ? fencedBoxes({ syllable, baseSyllable: drawn ? base.syllable : syllable, boxes: grown.boxes, style: effective, padding, fence: fenceNow }) : null, [fenceNow, grown.boxes, syllable, base.syllable, drawn, effective, padding])
  useEffect(() => { if (fenced) onFence?.(fenced.need, fenced.pulls) }, [onFence, fenced])
  const fencedOut = fenced?.boxes ?? grown.boxes
  // 굵기 예산의 기준 칸: 엔진 처음 칸에 같은 울타리를 입힌 것. 울타리가 그은 획 때문에 자소를 줄인 것은 처음 모습이다 —
  // 기준을 울타리 전 칸으로 두면 처음 굵기에서도 틈이 줄었다고 보고 ㄹ · ㅇ · ㅍ 같은 획을 바닥(0.69배)까지 깎았다(하니무스 2026-11-24 9:04 진단).
  // 굵기 줄이 칸을 옮긴 것(얇으면 획이 가늘어진 반만큼 칸이 밖으로 — `lookScale`)도 처음 모습이다. 이걸 빼고 재면 얇게 갈수록
  // ㅅ · ㅌ · ㅗ 같은 획만 0.69배로 깎여 대비가 커졌다(하니무스 2026-11-24 9:11 "얇아질 때 대비가 이렇게 안 커도 되잖아").
  const startBoxes = useMemo(() => placement.kind === 'boxes' && placement.boxes ? moldedBoxes(placement.boxes, raw.layoutType, {}, heavyOn ? {} : { weight: lookOf(look, 'weight'), weightBase: lookOf(look, 'weightBase') }, char) : null, [placement, raw.layoutType, heavyOn, look, char])
  const fencedStart = useMemo(() => startBoxes ? (fenceNow ? fencedBoxes({ syllable, baseSyllable: drawn ? base.syllable : syllable, boxes: startBoxes, style: effective, padding, fence: fenceNow })?.boxes : undefined) ?? startBoxes : null, [fenceNow, startBoxes, syllable, base.syllable, drawn, effective, padding])
  // 풍선 닿자(하니무스 2026-11-21): 보이는 글자 그대로(굵기 · 울타리까지 입힌 뒤) 잰다. 닿자 칸의 변과 획 하나하나가 같이 부풀고,
  // 잉크가 옆 자소와 최소 틈에 닿은 변 · 획만 멈춘다. 처음부터 그보다 가까운 쌍은 처음 틈을 지킨다. 글자 칸(0~1) 밖으로는 잉크가 안 나간다.
  const wantJamo = lookOf(look, 'jamo')
  const balloon = useMemo(() => {
    if (!fencedOut || wantJamo <= 1) return { syllable, boxes: fencedOut, thick: {} as Record<string, number>, spread: NO_SPREAD }
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
    // 글자 자리가 잉크를 따라간다(규칙 ③ ⓑ): 부푼 잉크가 처음 잉크보다 옆으로 나간 만큼 자리를 넓힌다 — 옆 여백은 처음 그대로.
    const grownSyllable = inflateSyllable(syllable, out.thick)
    const before = inkSpanX(startInk), after = out.boxes ? inkSpanX(inkStrokes(grownSyllable, out.boxes, effective, multiplier)) : before
    const spread = { left: Math.max(0, before.lo - after.lo), right: Math.max(0, after.hi - before.hi) }
    return { syllable: grownSyllable, boxes: out.boxes, thick: out.thick, spread }
  }, [fencedOut, wantJamo, syllable, effective, ratio])
  const boxes = balloon.boxes
  // 대비를 안 만졌으면 폰트 패턴(`contrastPatternOf`). 굵을 때는 바탕을 대비 0으로 두고 900 쌓임이 패턴 대비를 맡는다(`contrastRange`).
  const patternContrast = look.contrast === undefined
  const round = lookOf(look, 'round'), contrast = heavyOn && patternContrast ? 0 : lookOf(look, 'contrast'), nib = lookOf(look, 'nib')
  // 좁은 칸 굵기 예산(줄 끝 균형 규칙 ①, `moldBudget.ts`): 자소 칸이 작아져 한 자소 안 나란한 획 틈이 바닥 아래로 가면 그 획부터 가늘어진다.
  // 기준은 엔진 처음 칸(대비 0)의 틈 — 처음 모습은 그대로다. 풍선 굵기도 이 가늘어진 획에서 시작한다.
  const budget = useMemo(() => {
    if (placement.kind !== 'boxes' || !boxes) return { syllable: balloon.syllable, factors: {} as Record<string, number>, boxes }
    const m = weightToMultiplier(ratio === 1 ? effective.weight : scaledWeight(effective.weight, ratio))
    const strokesOn = (on: Partial<Record<Part, BoxConfig>>): BudgetStroke[] => resolveGlyphInkPrimitives({ syllable: balloon.syllable, placement: { kind: 'boxes', boxes: on }, weightMultiplier: 1, globalLinecap: effective.linecap, globalLinejoin: effective.linejoin, horizontalInkBounds: { min: 0, max: 1 } })
      .primitives.map((primitive) => ({ part: primitive.source.part, id: primitive.source.strokeId, points: flattenStrokeCenterline(primitive.stroke as StrokeDataV2, primitive.box), closed: primitive.stroke.closed, thickness: primitive.stroke.thickness * m }))
    // 먼저 넓힌다(하니무스 2026-11-22): 자소 칸이 옆 자소 칸 · 글자 칸 끝까지 빈 자리만큼.
    const rooms = roomsOf(boxes)
    const room = Object.fromEntries(Object.entries(rooms).map(([part, r]) => [part, { x: 1 + (r.left + r.right) / Math.max(boxes[part as Part]!.width, 1e-6), y: 1 + (r.up + r.down) / Math.max(boxes[part as Part]!.height, 1e-6) }]))
    const { factors, widen } = thinBudget(strokesOn(boxes), strokesOn(fencedStart ?? placement.boxes), contrast, room)
    return { syllable: thinSyllable(balloon.syllable, factors), factors, boxes: widenedBoxes(boxes, widen, rooms) }
  }, [placement, boxes, balloon.syllable, effective, ratio, contrast, fencedStart])
  const budgetBoxes = budget.boxes
  // 900 쌓임 규칙은 틈을 규칙(머리 → 가로획 → 속 → 틈 순서)으로 낸다. 붙을 획을 미리 가늘게 하는 예산(`thinBudget`)을 거치면 그은 획처럼 넓은 획에서 글자마다 두께가 달라진다(하니무스 2026-11-24).
  const heavyBase = STACK_900 ? balloon.syllable : budget.syllable
  // 흐림 선(새 틈 규칙 1단계, `moldHalo.ts`): 처음 굵기 이하는 그리는 칸 그대로 재서 닿자 뼈대를 넓히거나 기둥을 민다.
  const halo = useMemo(() => {
    if (heavyOn || placement.kind !== 'boxes' || !budgetBoxes) return null
    const weighted = ratio === 1 ? effective.weight : scaledWeight(effective.weight, ratio)
    const m = weightToMultiplier(weighted)
    // 흐림은 그려질 모양 그대로 칠한다(고양이 ③ "잴 때는 대비 없이, 엔진은 실제 대비 모양으로"): 가로 · 세로 두께는 대비가 정한 배율, 굵기는 패턴 대비가 덜어 준 만큼.
    const inkRatio = nib <= 0 ? patternWeightRatio(ratio, contrast) : ratio
    const mInk = weightToMultiplier(inkRatio === 1 ? effective.weight : scaledWeight(effective.weight, inkRatio))
    const widthOf = contrastWidthOf(contrast), shape = contrast === 0 ? undefined : () => ({ v: widthOf({ x: 0, y: 1 }, false), h: widthOf({ x: 1, y: 0 }, false) })
    // 받침 위(흐림 선 셋째 방향)까지 `haloCorrect` 하나로. 내보내기(`haloPlacement.ts`)도 같은 함수를 지난다.
    // 닿자를 줄였으면(jamo < 1) 줄이기 전 모양의 넓힘까지만 넓힌다 — 「가」 ㄱ 납작 막기(2026-11-27).
    return haloCorrect({ syllable: budget.syllable, boxes: budgetBoxes, strokesOn: (on) => haloStrokesOf(budget.syllable, on, effective, mInk, shape), rule: { ease: lookOf(look, 'ease'), spread: lookOf(look, 'spread'), grown: m / weightToMultiplier(MOLD_BASE_WEIGHT) }, jamo: lookOf(look, 'jamo') })
  }, [heavyOn, placement.kind, budgetBoxes, ratio, effective, budget.syllable, look, contrast, nib])
  // 풍선 굵기: 보이는 글자 그대로(풍선 닿자까지 입힌 뒤)의 중심선으로 자소마다 칸 · 굵기를 푼다. 납작 붓은 방향별 굵기가 없어 가는 쪽 하나로.
  // 풍선에 넣을 획 · 칸(굵기 값과 무관 — 글줄 멈춤을 잴 때도 같이 쓴다).
  const heavyInput = useMemo(() => {
    if (!heavyOn || !budgetBoxes) return null
    const result = resolveGlyphInkPrimitives({ syllable: heavyBase, placement: { kind: 'boxes', boxes: budgetBoxes }, weightMultiplier: 1, globalLinecap: effective.linecap, globalLinejoin: effective.linejoin, horizontalInkBounds: { min: 0, max: 1 } })
    const strokes: BalloonStroke[] = result.primitives.map((primitive) => ({ part: primitive.source.part, points: flattenStrokeCenterline(primitive.stroke as StrokeDataV2, primitive.box), closed: primitive.stroke.closed, thickness: primitive.stroke.thickness }))
    // 칸은 획이 실제로 놓인 상자로(엔진이 부위 칸 안에서 다시 놓을 수 있다). 한 부위에 상자가 여럿이면 합친다.
    const placed: Partial<Record<Part, BoxConfig>> = {}
    for (const primitive of result.primitives) {
      const part = primitive.source.part, old = placed[part], b = primitive.box
      placed[part] = old ? { x: Math.min(old.x, b.x), y: Math.min(old.y, b.y), width: Math.max(old.x + old.width, b.x + b.width) - Math.min(old.x, b.x), height: Math.max(old.y + old.height, b.y + b.height) - Math.min(old.y, b.y) } : { ...b }
    }
    const base = { v: contrast >= 0 ? 1 + 0.8 * contrast : 1 + 0.5 * contrast, h: contrast >= 0 ? 1 - 0.45 * contrast : 1 - 0.5 * contrast }
    // 대비를 올리면 세로 기둥은 굵기 막대 끝(노토 700 수준)을 넘지 않고 가로만 가늘어진다(하니무스 2026-11-22 "ㅇㅇ").
    // 대비가 세로를 굵히는 몫(base.v)에 굵기 배율을 또 곱하면 대비 끝 · 굵기 끝에서 기둥이 3.3배(0.23em)까지 가 「습」 ㅂ이 막혔다.
    const wantOf = (weight: number) => {
      const k = heavyThicknessOf(weight), v = contrast > 0 ? Math.max(base.v, k) : base.v * k, grown = v / base.v
      return { v, h: base.h * (1 + (grown - 1) * HEAVY_HORIZONTAL_SHARE) }
    }
    // 넓어짐 표는 2단계에서 뺀다. 1단계는 표로 푼 뒤에도 흐림 선이 기둥을 넘는 만큼만 기둥을 더 민다(아래 `heavy`).
    const outer = outerWidenOf(heavyBase)
    // 쌓인 획 법칙(거북이 ①): 칸을 글자 기둥 전체로 먼저 다시 나누고, 풍선은 그 칸 · 그 굵기에서 출발한다. 앞 걸음들의 굵기를 바닥으로 넘겨 굵기를 올려도 획이 안 가늘어진다.
    const columns = stackColumns(strokes, base)
    const solveAt = (weight: number) => {
      const wants = Array.from({ length: STACK_STEPS + 1 }, (_, i) => wantOf(1 + (weight - 1) * i / STACK_STEPS))
      const lay = stackLay(columns, strokes, placed, base, wants, outer)
      return solveBalloon({ strokes: lay.strokes, boxes: lay.boxes, base, start: lay.start, want: wantOf(weight), outer })
    }
    return { result, strokes, placed, base, wantOf, solveAt }
  }, [heavyOn, budgetBoxes, heavyBase, effective.linecap, effective.linejoin, contrast])
  // 글줄 바닥 · 같이 멈춤(거북이 굵을-때-획-균형.md ② · ③, 하니무스 2026-11-22 "넣어"): 이 글자를 풀었을 때 가장 가는 몫이
  // 글줄 기준 굵기(T = 바라는 세로줄기)의 바닥(`heavyFloorOf`) 아래로 가면, 이 글자를 처음 굵기로 떨어뜨리지 않고 글줄 굵기를 그 바닥에 닿는 데까지만 올린다.
  // 굵기 값과 무관하게 한 번 잰다(굵기 끝까지 걸음으로 훑어 바닥을 지키는 가장 굵은 값) — 지금 굵기로 재면 멈춤 → 굵기 → 멈춤이 물린다.
  const heavyCap = useMemo(() => {
    // 900 쌓임 규칙(`moldStack900.ts`)은 넘치면 글자 안에서 양보 순서대로 받는다 — 글줄을 멈추지 않는다.
    if (!heavyInput || !onCap || STACK_900) return Infinity
    const { strokes, solveAt, wantOf } = heavyInput
    // 닫힌 획만 있는 자소(ㅇ)는 뺀다 — 고리 두께는 속이 정한다(거북이 자도 ㅇ은 기울기 45° 안쪽만 재고 기준에 안 넣었다).
    const present = (['CH', 'JU', 'JO'] as const).filter((g) => strokes.some((stroke) => balloonGroupOf(stroke.part) === g && !stroke.closed))
    const holds = (weight: number) => {
      const want = wantOf(weight), thick = solveAt(weight).thick
      // 결마다 제 바라는 굵기에 잰다 — 가로를 세로 기준으로 재면 대비를 올려 일부러 가늘게 한 가로가 늘 바닥 아래라 글줄이 굵기 1에서 멈췄다.
      return present.every((g) => thick[g].v >= GLYPH_FLOOR * want.v - 1e-6 && thick[g].h >= GLYPH_FLOOR * want.h - 1e-6)
    }
    const top = LOOK_WALL.weight[1]
    if (holds(top)) return Infinity
    let lo = 1, hi = top
    for (let i = 0; i < 9; i++) { const mid = (lo + hi) / 2; if (holds(mid)) lo = mid; else hi = mid }
    return lo
  }, [heavyInput, onCap])
  useEffect(() => { onCap?.(heavyOn ? heavyCap : capRatio) }, [onCap, heavyOn, heavyCap, capRatio])
  // 900 쌓임 규칙(하니무스 2026-11-24): 상자를 안 거친 처음 잉크 뼈대에서. 노토 700 수준 두께까지는 중심선 그대로 굵히고, 그 위는 세로만 안쪽으로.
  const stackStart = useMemo(() => {
    if (!STACK_900 || !heavyInput) return null
    const k = heavyThicknessOf(Math.min(wanted, Math.max(1, weightCap)))
    const center = Math.min(k, BLACK_CENTER), m = weightToMultiplier(MOLD_BASE_WEIGHT)
    const strokes: StackStroke[] = heavyInput.result.primitives.map((primitive, index) => {
      const box = primitive.box, raw = primitive.stroke as StrokeDataV2
      const em = (p: { x: number; y: number }) => ({ x: box.x + p.x * box.width, y: box.y + p.y * box.height })
      return { part: primitive.source.part, points: heavyInput.strokes[index].points.map((p) => ({ x: p.x, y: p.y })), closed: primitive.stroke.closed, thickness: heavyInput.strokes[index].thickness * m * center,
        anchors: raw.points.map((p) => ({ ...em(p), ...(p.handleIn ? { handleIn: em(p.handleIn) } : {}), ...(p.handleOut ? { handleOut: em(p.handleOut) } : {}) })) }
    })
    return { strokes, k, center, height: inkHeightOf(strokes) }
  }, [heavyInput, wanted, weightCap])
  // 글줄 키는 네모일 때의 받침 없는 글자 키로 알린다. 탈네모로 줄인 키를 알리면 받침 글자까지 같이 낮아져 글줄이 지그재그가 된다(고양이 점검 2026-11-27).
  const openFactor = openFactorOf(lookOf(look, 'open'), raw.layoutType)
  useEffect(() => { if (stackStart && isOpenSyllable(char)) onStart?.(stackStart.height / openFactor) }, [onStart, stackStart, char, openFactor])
  const stacked = useMemo(() => {
    if (!stackStart || !heavyInput || !budgetBoxes) return null
    const { k, center } = stackStart
    // 고른 틈은 그릴 가로획에서: 만진 대비는 가로 ÷ 세로에 (base.h ÷ base.v, `hScale`) × (붓 대비 가로 ÷ 세로)를 더 곱한다. 고딕 비율은 굵기마다 폰트 패턴.
    const ib = heavyInput.base, widthOf = contrastWidthOf(contrast), hScale = ib.h / ib.v
    const barScale = contrast === 0 ? 1 : hScale * (widthOf({ x: 1, y: 0 }, false) / widthOf({ x: 0, y: 1 }, false))
    const out = solveStack900({ char, strokes: stackStart.strokes, height: stackHeight, inward: k / center, reach: Math.max(0, Math.min(1, (k - 1) / (BLACK_RATIO - 1))), ...(patternContrast ? { contrastRange: CONTRAST_PATTERN_RANGE } : {}), hScale,
      gapFromBar: EVEN_GAP_FROM_BAR, barScale, gothicRange: CONTRAST_PATTERN_RANGE })
    // 옮긴 꼭짓점을 자소 칸 좌표로 돌려 획을 바꿔 끼운다(id 그대로).
    // 한 줄짜리 칸(ㅡ의 키, ㅣ의 너비)은 칸 좌표로 못 옮긴다 — 그 축은 칸을 통째로 옮긴다(그 부위 점들의 평균 이동).
    const THIN_BOX = 0.02
    const boxes: Partial<Record<Part, BoxConfig>> = { ...budgetBoxes }
    const moved = new Map<Part, { dx: number; dy: number; n: number }>()
    heavyInput.result.primitives.forEach((primitive, index) => {
      const m0 = moved.get(primitive.source.part) ?? { dx: 0, dy: 0, n: 0 }
      stackStart.strokes[index].anchors.forEach((a, at) => { const b = out.strokes[index].anchors[at]; m0.dx += b.x - a.x; m0.dy += b.y - a.y; m0.n++ })
      moved.set(primitive.source.part, m0)
    })
    const shiftOf = (part: Part) => { const m0 = moved.get(part); return m0 && m0.n ? { dx: m0.dx / m0.n, dy: m0.dy / m0.n } : { dx: 0, dy: 0 } }
    for (const part of moved.keys()) {
      const box = boxes[part]
      if (!box) continue
      const { dx, dy } = shiftOf(part)
      boxes[part] = { ...box, ...(box.width < THIN_BOX ? { x: box.x + dx } : {}), ...(box.height < THIN_BOX ? { y: box.y + dy } : {}) }
    }
    const reshape = new Map<string, StrokeReshape>()
    heavyInput.result.primitives.forEach((primitive, index) => {
      const box = primitive.box, raw = primitive.stroke as StrokeDataV2, next = out.strokes[index], part = primitive.source.part
      if (box.width < 1e-9 || box.height < 1e-9) return
      const { dx, dy } = shiftOf(part), thinX = box.width < THIN_BOX, thinY = box.height < THIN_BOX
      // 엔진이 그릴 때 손본 획(primitive)이 아니라 글자에 든 획에 옮긴 만큼만 더한다. 손본 획을 다시 넣으면 엔진이 한 번 더 손봐 그은 획(곡선)이 틀어진다.
      const own = strokeOfSyllable(heavyBase, part, primitive.source.strokeId)
      const base = own && own.points.length === raw.points.length ? own : raw
      const before = stackStart.strokes[index].anchors
      const step = (a: { x: number; y: number }, b: { x: number; y: number }) => ({ x: (a.x - b.x - (thinX ? dx : 0)) / box.width, y: (a.y - b.y - (thinY ? dy : 0)) / box.height })
      const plus = (p: { x: number; y: number }, m: { x: number; y: number }) => ({ x: p.x + m.x, y: p.y + m.y })
      let still = true
      const points = base.points.map((p, at) => {
        const a = next.anchors[at], b = before[at], m = step(a, b)
        if (Math.abs(m.x) > 1e-9 || Math.abs(m.y) > 1e-9) still = false
        return { ...p, ...plus(p, m), ...(p.handleIn && a.handleIn && b.handleIn ? { handleIn: plus(p.handleIn, step(a.handleIn, b.handleIn)) } : {}), ...(p.handleOut && a.handleOut && b.handleOut ? { handleOut: plus(p.handleOut, step(a.handleOut, b.handleOut)) } : {}) }
      })
      if (!still) reshape.set(`${part}|${primitive.source.strokeId}`, { pieces: [{ ...base, points }] })
    })
    const syllable = stretchedSyllable(heavyBase, reshape)
    const result = resolveGlyphInkPrimitives({ syllable, placement: { kind: 'boxes', boxes }, weightMultiplier: 1, globalLinecap: effective.linecap, globalLinejoin: effective.linejoin, horizontalInkBounds: { min: 0, max: 1 } })
    const strokes: BalloonStroke[] = result.primitives.map((primitive) => ({ part: primitive.source.part, points: flattenStrokeCenterline(primitive.stroke as StrokeDataV2, primitive.box), closed: primitive.stroke.closed, thickness: primitive.stroke.thickness }))
    const placed: Partial<Record<Part, BoxConfig>> = {}
    for (const primitive of result.primitives) {
      const part = primitive.source.part, old = placed[part], b = primitive.box
      placed[part] = old ? { x: Math.min(old.x, b.x), y: Math.min(old.y, b.y), width: Math.max(old.x + old.width, b.x + b.width) - Math.min(old.x, b.x), height: Math.max(old.y + old.height, b.y + b.height) - Math.min(old.y, b.y) } : { ...b }
    }
    // 만진 대비도 가로만 가늘게: 기둥은 굵기 값 그대로(세로 몫 base.v로 나눈다). 세로까지 굵히면 900 + 대비 끝에서 깨 · 괘 · 절 속이 막혔다.
    // 만진 대비의 가로 배율(`hScale`)은 쌓임 안에서 이미 들어갔다 — 가로 굵게 쪽이면 쌓임 배율을 넘지 않게 잘라서.
    const thick = { v: center * out.thick.v, h: center * out.thick.h }
    // 속을 지키려 더 가늘게 한 자소(세로 `yieldV` · 가로 `yieldH`)만 그 묶음에 곱한다.
    const groupThick = (g: BalloonGroup): Thick => ({ v: thick.v * (out.yieldV?.[g] ?? 1), h: thick.h * (out.yieldH?.[g] ?? 1) })
    return { syllable, result, strokes, boxes, placed, thick: { CH: groupThick('CH'), JU: groupThick('JU'), JO: groupThick('JO') } as Record<BalloonGroup, Thick>, gap: out.gap, widenEm: out.widenEm ?? 0 }
  }, [stackStart, heavyInput, budgetBoxes, char, stackHeight, heavyBase, effective.linecap, effective.linejoin, patternContrast, contrast])
  const heavy = useMemo(() => {
    if (!heavyInput || !budgetBoxes) return null
    const { solveAt, base } = heavyInput
    const result = stacked ? stacked.result : heavyInput.result, strokes = stacked ? stacked.strokes : heavyInput.strokes, placed = stacked ? stacked.placed : heavyInput.placed
    const startBoxes = stacked ? stacked.boxes : budgetBoxes
    const startSyllable = stacked ? stacked.syllable : heavyBase
    const solved = stacked ? { boxes: placed, thick: stacked.thick } : solveAt(Math.min(wanted, Math.max(1, weightCap)))
    // 푼 칸(획 상자 기준)의 바뀐 만큼을 부위 칸에 그대로 옮긴다.
    const out: Partial<Record<Part, BoxConfig>> = { ...startBoxes }
    for (const [part, next] of Object.entries(solved.boxes) as [Part, BoxConfig][]) {
      const from = placed[part], box = startBoxes[part]
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
      // 같은 자소 수직 줄기 한가운데서 시작하는 끝(ㅏ 곁줄기 왼끝)은 줄기 속이라 늘이지 않는다.
      // 늘이면 납작 붓(타원 끝)에서 줄기 밖으로 혹이 나왔다(하니무스 2026-11-27 "붓촉쪽도 이상한거").
      const own = stroke.thickness / 2 * thick.h, ne = em.length
      const inside = (end: Pt2, other: Pt2) => ne >= 2 && alignReach(part, end, { x: other.x - end.x, y: other.y - end.y }, own) >= 0
      const startBy = inside(em[0], em[1]) ? 0 : reach.start, endBy = inside(em[ne - 1], em[ne - 2]) ? 0 : reach.end
      if (startBy < 1e-6 && endBy < 1e-6) return
      const pts = stroke.points, n = pts.length
      reaches.set(`${part}|${primitive.source.strokeId}`, { start: local(pts[0], pts[1], startBy), end: local(pts[n - 1], pts[n - 2], endBy) })
    })
    const syllableOut = reaches.size ? stretchedSyllable(startSyllable, reaches) : startSyllable
    // 흐림 선(굵기 끝): 자소마다 푼 굵기로 다시 재서, 선이 기둥을 넘으면 기둥이 밖으로 나가고 자리가 남으면 닿자 뼈대가 넓어진다.
    // 조건 없이 모든 짜임: 위(첫닿자 → 보)를 먼저, 그다음 옆(첫닿자 → 오른쪽 홀자). 여유는 짜임마다(`HALO_SIDE_BY` · `HALO_TOP_BY`).
    const m = weightToMultiplier(MOLD_BASE_WEIGHT), thickOf = (part: Part) => solved.thick[balloonGroupOf(part)]
    const rule = { ease: lookOf(look, 'ease'), spread: lookOf(look, 'spread'), grown: solved.thick.JU.v / base.v }
    const side = haloSideOf(budget.syllable), above = haloTopOf(budget.syllable)
    const topFit = above ? haloTopFit(haloStrokesOf(syllableOut, out, effective, m, thickOf), rule, above) : null
    const topped = topBoxes(out, topFit)
    const fit: HaloFit | null = side ? haloFit(haloStrokesOf(syllableOut, topped, effective, m, thickOf), rule, side) : null
    const pillarBoxes = haloBoxes(topped, fit)
    const top = syllableOut.jongseong && pillarBoxes.JO ? haloFinalFit(haloStrokesOf(syllableOut, pillarBoxes, effective, weightToMultiplier(MOLD_BASE_WEIGHT), (part) => solved.thick[balloonGroupOf(part)]), finalEaseOf(syllableOut)) : null
    return { boxes: finalBoxes(pillarBoxes, top), thick: solved.thick, syllable: syllableOut, halo: fit, final: top }
  }, [heavyInput, stacked, budgetBoxes, heavyBase, effective, contrast, wanted, weightCap, look])
  const globalStyle = useMemo(() => {
    // 패턴 대비는 가로만 가늘게 — 대비가 세로를 굵히는 몫만큼 굵기를 덜어 기둥 두께는 굵기 값 그대로다.
    // 대비는 가로만 가늘게 — 만진 대비도 세로를 굵히는 몫만큼 굵기를 덜어 기둥 두께는 굵기 값 그대로(다람쥐 모순 1). 납작 붓은 대비를 안 쓴다.
    const inkRatio = !heavyOn && nib <= 0 ? patternWeightRatio(ratio, contrast) : ratio
    const weighted = inkRatio === 1 ? effective : { ...effective, weight: scaledWeight(effective.weight, inkRatio) }
    // 획 끝 · 꺾임은 둥글기 하나가 맡는다(거북이 방향안 4차). 둥글기 · 대비 · 붓촉은 엔진의 붓 값에 얹는다(`moldInk`).
    return moldInk(weighted, { round, contrast, nib })
  }, [effective, ratio, round, contrast, nib, patternContrast, heavyOn])
  // ㅗ 꼭지는 그릴 칸이 다 정해진 뒤, 꼭지 높이의 닿자 밑 흰 넓이 가운데로(C026). 기둥 · 보는 그대로.
  const kkokji = useMemo(() => {
    if (placement.kind !== 'boxes' || !budgetBoxes) return heavy ? kkokjiSyllable(heavy.syllable, heavy.boxes, effective, weightToMultiplier(MOLD_BASE_WEIGHT) * heavy.thick.CH.v) : null
    // 굵을 때는 처음 굵기 그림에서 잰 꼭지 자리(닿자 잉크 폭의 몫)를 굵은 닿자에 옮긴다.
    const base = kkokjiSyllable(budget.syllable, halo?.boxes ?? budgetBoxes, globalStyle, weightToMultiplier(heavy ? MOLD_BASE_WEIGHT : globalStyle.weight))
    if (!heavy) return base
    return kkokjiSyllable(heavy.syllable, heavy.boxes, effective, weightToMultiplier(MOLD_BASE_WEIGHT) * heavy.thick.CH.v, base.fit?.rel)
  }, [heavy, placement.kind, budgetBoxes, budget.syllable, halo, globalStyle, effective])
  const colorOf = useCallback((source: ResolvedStrokeInkSource) => {
    // 토막으로 나눈 획(`#`)은 보이는 토막만 남긴 것이다.
    if (shownStroke) return source.strokeId.includes(SHOWN_CUT) || shownStroke(`${simsPartOf(source.part)}:${source.jamoId}:${pieceOf(source.strokeId)?.id ?? source.strokeId}`) !== 'none' ? undefined : 'transparent'
    // 잡은 보선 양쪽 부위만 제 색(선 이름 대신).
    if (highlight) return highlight.includes(source.part) ? SLOT_COLOR[simsPartOf(source.part)] : EDIT_COLOR.editSlotOff
    if (sel === 'STROKE') return EDIT_COLOR.editSelect
    if (sel === 'CH' || sel === 'JU' || sel === 'JO') return simsPartOf(source.part) === sel ? SLOT_COLOR[sel] : EDIT_COLOR.editSlotOff
    return undefined
  }, [sel, shownStroke, highlight])

  // 폭이 좁아지면 글자 칸도 같이 좁힌다. 자간은 글자 사이를 더하거나 뺀다.
  // 칸 셈과 같은 값으로(풍선 굵기는 글자 통째 당김이 없다). 다르면 써 넣을 때마다 자간이 줄어든다(다람쥐 D 검수 2번).
  const scale = placement.kind === 'boxes' ? lookScale(placement.boxes, heavyOn ? { ...sizedLook, weight: 1, weightBase: 1 } : sizedLook).sx : lookOf(sizedLook, 'frame') * lookOf(sizedLook, 'size')
  // 저장소의 자간(써 넣은 값 포함)도 얹는다 — 써 넣은 뒤 화면 값을 처음으로 돌려도 글줄 간격이 그대로다.
  // 흐림 선이 기둥을 민 만큼 글자 자리가 오른쪽으로 넓어진다(써 넣기에는 아직 안 들어감 — 첫닿자마다 달라서 다음 단계).
  const haloFitNow = heavy ? heavy.halo : halo?.fit ?? null
  const finalNow = heavy ? heavy.final : halo?.final ?? null
  const spreadRight = balloon.spread.right + (haloFitNow?.push ?? 0)
  useEffect(() => { onHalo?.(haloFitNow?.push ?? 0) }, [onHalo, haloFitNow])
  // 굵기 끝에서 속을 지키려 넓힌 잉크 폭(`solveStack900` 칸 양보)만큼 자리도 넓힌다 — 안 넓히면 이웃 글자와 닿는다(다람쥐 극단 검수 2026-11-27).
  const stackWiden = heavyOn && stacked ? scale * stacked.widenEm : 0
  // 자간 바닥(지키는 순서 틈 → 굵기 → 칸): 자간을 줄여도 글자 자리는 「잉크 폭 + 엔진 틈」 아래로 안 간다 — 이웃 글자 잉크와 안 닿게.
  // 자간 0 이상의 자리는 그대로다(줄일 때만 막는다). 예전엔 자간 끝에서 쌔 · 깨가 붙었다(다람쥐 극단 검수 2026-11-27).
  const inkSpan = useMemo(() => {
    if (placement.kind !== 'boxes') return null
    if (heavy) return inkSpanOf(heavy.syllable, heavy.boxes, (part, t) => t * weightToMultiplier(MOLD_BASE_WEIGHT) * Math.max(heavy.thick[balloonGroupOf(part)].v, heavy.thick[balloonGroupOf(part)].h) / 2, effective.linecap, effective.linejoin)
    const boxesNow = halo?.boxes ?? budgetBoxes
    if (!boxesNow) return null
    const m = weightToMultiplier(globalStyle.weight) * Math.max(1, 1 + 0.8 * contrast)
    return inkSpanOf(budget.syllable, boxesNow, (_, t) => t * m / 2, effective.linecap, effective.linejoin)
  }, [placement.kind, heavy, halo, budgetBoxes, budget.syllable, globalStyle.weight, contrast, effective.linecap, effective.linejoin])
  const room = scale + balloon.spread.left + spreadRight + stackWiden
  const tracked = room + lookOf(look, 'tracking') + effective.letterSpacing
  const inkFloor = inkSpan ? 2 * Math.max(0.5 - inkSpan.left, inkSpan.right - 0.5) + engineGapOf(inkSpan.stroke) : 0
  const slotEm = tracked >= room ? tracked : Math.max(tracked, Math.min(room, inkFloor))
  const slot = { width: size * slotEm, marginInline: 0, // 가운데 맞춤이라 왼쪽 · 오른쪽 넓힘의 차이만큼 한쪽에 여백을 두어 글자를 그 쪽으로 민다.
    paddingLeft: Math.max(0, size * (balloon.spread.left - spreadRight)), paddingRight: Math.max(0, size * (spreadRight - balloon.spread.left)), boxSizing: 'border-box' as const }
  // 저장소에 써 넣기: 그리는 칸 그대로를 목표로 넘긴다(긋기 · 획 다듬기 획은 아직 안 넘어감).
  const lift = placement.kind === 'boxes' ? waistLift(look, placement.boxes, raw.layoutType) : 0
  // 닿자 획 두께: 풍선 닿자 배율 × 좁은 칸 예산 배율(첫닿자 · 받침만 저장소에 들어간다. 홀자 가늘어짐은 아직 화면에만).
  const bakeThick = useMemo(() => {
    const keys = new Set([...Object.keys(balloon.thick), ...Object.keys(budget.factors).filter((key) => key.startsWith('CH:') || key.startsWith('JO:'))])
    return Object.fromEntries([...keys].map((key) => [key, (balloon.thick[key] ?? 1) * (budget.factors[key] ?? 1)]))
  }, [balloon.thick, budget.factors])
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
  useEffect(() => { if (onBake && budgetBoxes && molded) onBake({ char, syllable: raw, schema, target: budgetBoxes, sx: scale + balloon.spread.left + balloon.spread.right, lift, molded, thick: bakeThick, heavy: heavyBake }) }, [onBake, budgetBoxes, char, raw, schema, scale, lift, molded, bakeThick, balloon.spread, heavyBake])
  const strokeColorOf = shownStroke || highlight || (sel && sel !== 'WHOLE') ? colorOf : undefined
  if (heavy) {
    // 자소마다 가로 · 세로 굵기가 다르다. 엔진의 대비(토막 방향별 두께)를 자소마다 따로 줘서 겹쳐 그린다.
    const flat = globalStyle.strokeStyle.mode !== 'brush' || globalStyle.strokeStyle.brush.tip !== 'round'
    const layers = (['CH', 'JU', 'JO'] as const).filter((group) => (group === 'CH' ? budget.syllable.choseong : group === 'JU' ? budget.syllable.jungseong : budget.syllable.jongseong))
    return <span className={styles.glyph} style={slot} data-testid={testId} data-char={char} data-halo={haloAttr(haloFitNow)} data-final={finalNow ? `${finalNow.err.toFixed(4)} ${finalNow.move.toFixed(4)}` : undefined} data-fence={fenced ? fenced.need.toFixed(3) : undefined} data-kkokji={kkokji?.fit ? kkokji.fit.shift.toFixed(4) : undefined} data-heavy={layers.map((group) => `${group}:${heavy.thick[group].v.toFixed(3)}/${heavy.thick[group].h.toFixed(3)}`).join(' ')}>
      {layers.map((group, at) => {
        // 납작 붓: 기둥은 세로 두께 그대로(타원 가로 폭 몫만큼 붓을 키운다), 가로는 붓 각도가 저절로 가늘게 한다.
        const brush = globalStyle.strokeStyle.mode === 'brush' ? globalStyle.strokeStyle.brush : null
        const ink = brush?.tip === 'ellipse' ? { multiplier: heavy.thick[group].v / nibStemFactor(brush), contrast: 0 } : flat ? { multiplier: Math.min(heavy.thick[group].v, heavy.thick[group].h), contrast: 0 } : inkOfThick(heavy.thick[group])
        const style = flat || globalStyle.strokeStyle.mode !== 'brush' ? globalStyle : { ...globalStyle, strokeStyle: heavyStrokeStyle(globalStyle.strokeStyle, ink.contrast) }
        return <span key={group} className={at === 0 ? undefined : styles.glyphLayer}>
          <SvgRenderer
            syllable={shownCut(onlyGroup(kkokji?.syllable ?? heavy.syllable, group), shownStroke)}
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
  return <span className={styles.glyph} style={slot} data-testid={testId} data-char={char} data-halo={haloAttr(haloFitNow)} data-final={finalNow ? `${finalNow.err.toFixed(4)} ${finalNow.move.toFixed(4)}` : undefined} data-fence={fenced ? fenced.need.toFixed(3) : undefined} data-kkokji={kkokji?.fit ? kkokji.fit.shift.toFixed(4) : undefined} data-budget={Object.entries(budget.factors).map(([key, f]) => `${key}:${f.toFixed(2)}`).join(' ') || undefined}>
    <SvgRenderer
      syllable={shownCut(kkokji?.syllable ?? budget.syllable, shownStroke)}
      schema={placement.kind === 'schema' ? placement.schema : undefined}
      boxes={halo?.boxes ?? budgetBoxes}
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
  | { kind: 'tap'; x0: number; y0: number; moved: boolean }

function inkStrokes(syllable: DecomposedSyllable, boxes: Partial<Record<Part, BoxConfig>>, style: GlobalStyle, multiplier: number) {
  const result = resolveGlyphInkPrimitives({ syllable, placement: { kind: 'boxes', boxes }, weightMultiplier: multiplier, globalLinecap: style.linecap, globalLinejoin: style.linejoin, horizontalInkBounds: { min: 0, max: 1 } })
  return result.primitives.map((primitive) => ({ part: primitive.source.part, box: primitive.box, points: primitive.stroke.points, closed: primitive.stroke.closed, thickness: primitive.stroke.thickness * primitive.weightMultiplier }))
}

/** 닿자 끝에서 글자 크기 배율: 닿자 큰 폰트 0.855 ÷ 전체 0.917(폰트 156벌, 거북이 끝에서도-균형.md 규칙 ③). */
const JAMO_BIG_SIZE = 0.93
const NO_SPREAD = { left: 0, right: 0 } as const
/** 잉크의 가로 끝(em). */
function inkSpanX(strokes: ReturnType<typeof inkStrokes>): { lo: number; hi: number } {
  let lo = Infinity, hi = -Infinity
  for (const s of strokes) {
    const half = (s.thickness ?? 0) / 2
    for (const q of s.points) { const x = s.box.x + q.x * s.box.width; lo = Math.min(lo, x - half); hi = Math.max(hi, x + half) }
  }
  return Number.isFinite(lo) ? { lo, hi } : { lo: 0, hi: 0 }
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
 * 부위 사이 보선(양쪽 부위가 나눠 쓴다)을 끈다. 부위 통째로 옮기기는 뺐다(틈은 엔진 몫).
 * 바깥 틀 · 굵기 · 크기는 인상 잡기 몫이라 여기서는 안 바뀐다. 조작은 한 손가락만(R034) — 두 손가락 · Ctrl + 휠은 쓰지 않는다.
 * 왼쪽(가로선) · 아래(세로선) 눈금자에 지금 자리, 처음 자리(점선), 움직일 수 있는 범위(옅은 띠). 선은 여섯 개 이하, 잡은 선만 진하게.
 */
function SimsStep({ char, drawn, edits, setEdits, look, weightCap, stackHeight, sel, setSel, onBegin, fence }: {
  fence?: MoldFence
  char: string; drawn?: Drawn; edits: LayoutEdits; setEdits: (update: (now: LayoutEdits) => LayoutEdits) => void
  look: Look; weightCap: number; stackHeight?: number; sel: Region | null; setSel: (region: Region | null) => void; onBegin: () => void
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

  // 큰 글자도 손 그대로 따라온다(젤리 움직임은 뺌, 하니무스 2026-11-27 "그 이상한 애니메이션 지금 없애자. 레이아웃 수정시.").
  const target = useMemo(() => {
    const out: Record<string, number> = {}
    const mine = edits[layout] ?? {}
    for (const key of ['CH', 'JU', 'JU_H', 'JU_V', 'JO'] as const) (mine[key] ?? [0, 0, 0, 0]).forEach((value, i) => { out[`${key}${i}`] = value })
    return out
  }, [edits, layout])
  const shown = target
  const shownEdits: LayoutEdits = { [layout]: Object.fromEntries((['CH', 'JU', 'JU_H', 'JU_V', 'JO'] as const).filter((key) => edits[layout]?.[key]).map((key) => [key, [0, 1, 2, 3].map((i) => shown[`${key}${i}`] ?? 0)])) }
  // 큰 글자는 글줄과 같은 판 값 그대로(값을 전부 채워 넘기면 대비가 "만진 것"이 되어 기둥이 14% 굵었고 획 다듬기 휨 · 틈이 빠졌다, 다람쥐 모순 5).
  const shownLook = look

  // 지금(보이기 전) 칸 · 보이는 칸
  const now = applyPartEdits(origin, edits[layout])
  const { sx, sy } = lookScale(now, look)
  const tx = (u: number) => 0.5 + (u - 0.5) * sx, ty = (v: number) => 0.5 + (v - 0.5) * sy
  const ratio = appliedWeight(lookOf(look, 'weight'), weightCap)
  const multiplier = weightToMultiplier(scaledWeight(effective.weight, ratio))

  // ── 선 만들기(지금 값으로. 끌기는 잡은 때의 값에서 셈한다) ──
  const lines: GuideLine[] = []
  {
    // 선은 틀 값(닿자 크기 · 탈네모 · 윗선 …)까지 입힌 칸 위에 그린다. 부위 값만 입힌 칸에 그리면 닿자 작게 + 탈네모에서 선이 ㅏ 기둥 위에 떴다(다람쥐 모순 6).
    const lookedNow = moldedBoxes(origin, layout, edits, look, char), lookedOrigin = moldedBoxes(origin, layout, {}, look, char)
    seamsOf(layout, origin).forEach((seam, i) => {
      const v = seam.axis === 'v', scale = v ? sx : sy, t = v ? tx : ty
      const startEdits = edits[layout] ?? {}
      const pre = seamPos(seam, now)
      const [lo, hi] = seamRange(seam, origin, now, SEAM_HARD_FLOOR)
      const color = seam.b.includes('JO') ? SLOT_COLOR.JO : SLOT_COLOR.JU
      lines.push({
        id: `seam${i}`, axis: seam.axis, pos: seamPos(seam, lookedNow), color, end: 'end', lo: seamPos(seam, lookedNow) + (t(pre + lo) - t(pre)), hi: seamPos(seam, lookedNow) + (t(pre + hi) - t(pre)), origin: seamPos(seam, lookedOrigin), parts: [...seam.a, ...seam.b], scale,
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
    const shownBoxes = placement.kind === 'boxes' ? moldedBoxes(placement.boxes, layout, edits, look, char) : {}
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
    // 부위 통째로 옮기기는 뺐다(하니무스 2026-11-27 카드 "보선 끌기만 남김"): 틈은 엔진 몫, 부위를 누르면 고르기만.
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
    if (!ok) bumpWall()
  }
  const end = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId)
    const g = grab.current
    grab.current = null
    setActive(null)
    setWall('free')
    if (!g || g.moved) return
    if (g.kind === 'tap' || g.kind === 'line') { const part = partAt(g.x0, g.y0); setSel(part ? simsPartOf(part) : null) }
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
          <MoldGlyph char={char} size={STAGE} edits={shownEdits} look={shownLook} drawn={drawn} highlight={highlight} weightCap={weightCap} stackHeight={stackHeight} fence={fence} testId="mold-focus" />
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
      {!sel && !active && <span className={styles.tapNote}>선을 끌면 양쪽이 나눠 가짐</span>}
    </div>
    <p className={styles.simsReadout} data-testid="mold-readout" data-wall={wall === 'free' ? undefined : wall}>{readout || ' '}</p>
    <p className={styles.note}>선을 끌면 양쪽 부위가 나눠 가짐. 부위를 누르면 고르기. 바깥 틀 · 굵기 · 크기는 그대로. 같은 짜임 글자가 다 같이 바뀜.</p>
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
  // `?look={"weight":2.25}`으로 판 값을 정해 열 수 있다(극단 확인용, `?s=`와 같은 쓰임).
  const [look, setLook] = useState<Look>(() => urlLook() ?? origin?.saved.look ?? inkLookOf(useGlobalStyleStore.getState().style))
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
  const [askReset, setAskReset] = useState(false)
  // 글자마다 버틸 수 있는 가장 굵은 비율(자소를 끝까지 키워도 획이 안 붙는 데까지). 글줄은 가장 작은 것을 다 같이 쓴다 — 굵기는 글줄 전체가 같다.
  const [caps, setCaps] = useState<Record<string, number>>({})
  const capReporters = useMemo(() => {
    const out: Record<number, (ratio: number) => void> = {}
    ;[...sentence].forEach((_, at) => { out[at] = (ratio: number) => setCaps((all) => (all[`${sentence}-${at}`] === ratio ? all : { ...all, [`${sentence}-${at}`]: ratio })) })
    return out
  }, [sentence])
  // 흐림 선이 기둥을 민 양(글자마다). 글줄 평균을 굵기 줄 아래에 작게 보인다(굵어질 때 넓어짐).
  const [pushes, setPushes] = useState<Record<string, number>>({})
  const haloReporters = useMemo(() => {
    const out: Record<number, (push: number) => void> = {}
    ;[...sentence].forEach((_, at) => { out[at] = (push: number) => setPushes((all) => (all[`${sentence}-${at}`] === push ? all : { ...all, [`${sentence}-${at}`]: push })) })
    return out
  }, [sentence])
  // 900 쌓임 규칙의 글자 키 기준(규칙 6): 받침 없는 글자들의 처음 잉크 키 가운데값. 받침 · 쌓인 글자는 이 키 안에서 푼다.
  const [heights, setHeights] = useState<Record<string, number>>({})
  const startReporters = useMemo(() => {
    const out: Record<number, (height: number) => void> = {}
    ;[...sentence].forEach((_, at) => { out[at] = (height: number) => setHeights((all) => (Math.abs((all[`${sentence}-${at}`] ?? -1) - height) < 1e-6 ? all : { ...all, [`${sentence}-${at}`]: height })) })
    return out
  }, [sentence])
  const stackHeight = useMemo(() => {
    const list = [...sentence].map((_, at) => heights[`${sentence}-${at}`]).filter((h): h is number => h !== undefined).sort((a, b) => a - b)
    return list.length ? list[Math.floor(list.length / 2)] : undefined
  }, [heights, sentence])
  const lineChars = [...sentence].map((char, at) => [char, at] as const).filter(([char]) => char !== ' ')
  const widenPct = lineChars.length ? Math.round(lineChars.reduce((sum, [, at]) => sum + (pushes[`${sentence}-${at}`] ?? 0), 0) / lineChars.length * 1000) / 10 : 0
  // 1단계 흐림 선이 아직 안 맡는 글자(쌍닿자 · ㅍ). 예전 셈 그대로라고 작게 알린다(고양이 제안, 하니무스 2026-11-23 "ㅇㅇ").
  const oldRule = [...new Set(lineChars.map(([char]) => char).filter((char) => { const code = char.charCodeAt(0) - 0xac00; return code >= 0 && code < 11172 && [1, 4, 8, 10, 13, 17].includes(Math.floor(code / 588)) /* ㄲ ㄸ ㅃ ㅆ ㅉ ㅍ */ }))]
  const weightCap = Math.min(Infinity, ...[...sentence].map((char, at) => (char === ' ' ? Infinity : caps[`${sentence}-${at}`] ?? Infinity)))
  const weightNote = appliedWeight(lookOf(look, 'weight'), weightCap) < lookOf(look, 'weight') ? (lookOf(look, 'weight') > 1 ? '가장 빽빽한 글자의 가는 획이 글자 바닥(기준 세로줄기의 0.5배)에 닿아 글줄 굵기가 여기서 멈춤' : '획이 붙기 직전이라 글줄 전체가 여기서 멈춤') : ''
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
    // 패턴 대비(대비를 안 만짐)는 화면처럼 기둥 두께를 그대로 두고 가로만 가늘게(`patternWeightRatio`). 굵을 때는 900 쌓임이 따로 굽는다.
    const bakeWeight = appliedWeight(lookOf(look, 'weight'), weightCap)
    const inkWeight = bakeWeight <= 1 && lookOf(look, 'nib') <= 0 ? patternWeightRatio(bakeWeight, lookOf(look, 'contrast')) : bakeWeight
    const inked = moldInk({ ...moldBaseStyle(baseStyle), weight: scaledWeight(MOLD_BASE_WEIGHT, inkWeight) }, look.contrast === undefined && bakeWeight > 1 ? { ...look, contrast: 0 } : look)
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
    // 흐림 선 손잡이: 칸은 흐림 선 전 칸으로 굽고, 화면 · OTF가 이 값으로 글자마다 다시 센다(`haloPlacement.ts`). 처음 값이면 키를 안 둔다.
    // 닿자 크기(jamo < 1)도 같이 둔다: 줄인 닿자는 줄이기 전 모양만큼만 넓혀야 화면과 같은 그림이 나온다.
    const ease = lookOf(look, 'ease'), spread = lookOf(look, 'spread'), jamoK = lookOf(look, 'jamo')
    store.setHalo(ease === HALO_ENGINE.ease && spread === HALO_ENGINE.spread && jamoK >= 1 ? undefined : { ease, spread, ...(jamoK < 1 ? { jamo: jamoK } : {}) })
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
    // 한 펜으로 그었으니 그은 획은 두께 하나 — 저장소 획마다 다른 두께를 물려받지 않는다(`penThicknessOf`).
    const pen = penThicknessOf(jungseong)
    const drawnKinds = new Set(STEMS.filter((info) => stems[info.kind]?.ok).map((info) => info.kind))
    const consonants = Object.fromEntries(LAYOUTS.map((layout) => {
      const box = consonantBoxesOf(layout)
      return [layout, { choseong: shapeConsonants(choseong, shapes, box.CH, pen).changed, jongseong: shapeConsonants(jongseong, shapes, box.JO, pen).changed }]
    })) as Drawn['consonants']
    return { jungseong: Object.keys(masters).length ? withPenThicknessVowels(propagatedJungseong(jungseong, {}, masters), drawnKinds, pen) : undefined, consonants }
  }, [stems, choseong, jungseong, jongseong])

  // 긋기 단계 글줄: 내가 그은 줄기 종류가 쓰인 획만 보인다(그을 때마다 글자가 조금씩 채워진다).
  // 닿자는 ㄷ · ㄹ · ㄴ처럼 세로 + 가로가 한 획으로 이어진 것이 있어, 그은 종류의 마디만 보인다(`shownRunsOf`).
  const stemKeys = useMemo(() => ({ JU: vowelStemKeys(jungseong) }), [jungseong])
  const drawnShapes = useMemo(() => consonantShapesOf(stems), [stems])
  const shownStroke = useCallback((key: string): ShownRuns => {
    const [family, char, ...rest] = key.split(':')
    const id = rest.join(':')
    if (family === 'JU') { const kind = stemKeys.JU.get(`${char}:${id}`); return kind && stems[kind]?.ok ? 'all' : 'none' }
    const stroke = (family === 'CH' ? choseong : jongseong)[char]?.strokes?.find((item) => item.id === id)
    return stroke ? shownRunsOf(stroke, drawnShapes) : 'none'
  }, [stemKeys, stems, drawnShapes, choseong, jongseong])

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
    // 처음 값 = 판의 처음 칸(원본 · 저장소 굵기 · 붓, `homeLook`). 써 넣은 굵기(`weightBase`)를 지우면 그 당김이 두 번 들어간다(다람쥐 2026-11-22).
    // 판 읽기 줄은 마지막으로 끈 값을 그대로 들고 있다 — 처음 값으로 돌렸다고 바꿔 쓴다(다람쥐 극단 검수 2026-11-27: 「굵기 100」이 남아 값이 안 돌아간 것처럼 보임).
    if (step === 'shape') setLook((now) => ({ ...homeLook, ...Object.fromEntries([...STROKE_KEYS, 'tracking' as const].map((key) => [key, now[key]])) }))
    else if (step === 'finish') setLook((now) => ({ ...now, tracking: undefined }))
    else if (step === 'stroke') setLook((now) => ({ ...now, ...Object.fromEntries(STROKE_KEYS.map((key) => [key, undefined])) }))
    else setEdits((now) => { const copy = { ...now }; delete copy[layoutOfFocus]; return copy })
  }

  const NO_EDITS: LayoutEdits = useMemo(() => ({}), [])
  const NO_LOOK: Look = useMemo(() => ({}), [])
  // 부위를 끄는 동안도 글줄은 한 박자 늦게(하니무스 2026-11-22 "부위 옮길 때 버벅임"): 큰 판의 글자가 먼저 따라오고 글줄은 뒤따른다.
  const lazyEdits = useDeferredValue(edits)
  const lineEdits = compare ? NO_EDITS : lazyEdits
  // 글줄은 판 값을 한 박자 늦게 따른다(useDeferredValue): 굵기 줄을 끄는 동안 판 막대가 먼저 움직이고 글줄은 따라온다(하니무스 2026-11-22 버벅임, 거북이 느려진 곳 5번).
  const lazyLook = useDeferredValue(look)
  const lineLook = compare ? NO_LOOK : lazyLook
  const lineDrawn = compare ? undefined : drawn
  // 글자 문지르기 판의 글자(빚기 엔진 그대로).
  // 눈금을 미는 동안 버벅임(하니무스 2026-11-27 "랜더를 우선으로"): 눈금 · 휠 숫자는 바로, 판 글자는 한 박자 늦게(끊어 그려 손을 안 막는다).
  const rubLook = useDeferredValue(look)
  const rubGlyph = useCallback((char: string, size: number) => <MoldGlyph char={char} size={size} edits={compare ? NO_EDITS : edits} look={compare ? NO_LOOK : rubLook} drawn={compare ? undefined : drawn} weightCap={weightCap} stackHeight={stackHeight} fence={compare ? undefined : fence} />, [compare, NO_EDITS, NO_LOOK, edits, rubLook, drawn, weightCap, stackHeight, fence])
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

  // 인상 잡기는 판이 화면 전체(하니무스 2026-11-27 "인상잡기 예시문장 말고 전체화묜을 쟤가 잡아야해. 스크롤없게").
  // 예시 글줄은 숨겨만 둔다 — 글줄 글자가 굵기 상한 · 쌓임 키를 재서 판 글자에 넘겨 준다.
  const full = step === 'shape'
  const rubNote = [weightNote, widenPct > 0 ? `굵어져 넓어짐 +${widenPct}%` : '', oldRule.length > 0 ? `아직 예전 셈 · ${oldRule.join(' ')}` : ''].filter(Boolean).join(' · ')
  return <MoldOriginContext.Provider value={origin}><main className={styles.page} data-full={full || undefined}>
    <header className={styles.header}>
      <span className={styles.eyebrow}>빚기 시험판 · {stepIndex + 1}/{STEP_ORDER.length} {STEP_NAMES[step]}</span>
      <ChoiceGroup variant="segment" aria-label="단계" className={styles.steps}>
        {STEP_ORDER.map((key, at) => <ChoiceItem key={key} checked={step === key} onClick={() => setStep(key)} data-testid={`mold-step-${key}`}>{at + 1} {STEP_NAMES[key]}</ChoiceItem>)}
      </ChoiceGroup>
    </header>

    <section className={full ? styles.bakeHidden : styles.card} aria-label="예시 글줄" aria-hidden={full || undefined}>
      <div className={styles.line} data-testid="mold-line" data-compact={step === 'shape' || undefined}>
        {chars.map((char, at) => char === ' '
          ? <span key={at} className={styles.space} />
          : <Pressable key={`${sentence}-${at}`} className={styles.lineChar} data-on={(step === 'part' && (partChar ? char === partChar : at === focusIndex)) || undefined} onClick={() => { setFocusAt(at); setPartChar(null) }} aria-label={`${char} 크게 보기`} data-testid={`mold-pick-${at}`}>
            <MoldGlyph char={char} size={42} edits={lineEdits} look={lineLook} drawn={lineDrawn} shownStroke={step === 'draw' && !compare ? shownStroke : undefined} testId={`mold-char-${at}`} weightCap={weightCap} stackHeight={stackHeight} onStart={compare ? undefined : startReporters[at]} onCap={compare ? undefined : capReporters[at]} onHalo={compare ? undefined : haloReporters[at]} onBake={compare ? undefined : lineBakeReporters[at]} fence={compare ? undefined : fence} onFence={compare ? undefined : fenceReporters[at]} />
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
      {step === 'shape' && <MoldRubPlate locks={weightLock !== undefined ? { weight: weightLock } : undefined} look={look} home={homeLook} setLook={setLook} onBegin={remember} renderGlyph={rubGlyph} note={rubNote} />}
      {step === 'part' && <>
        <nav className={styles.layouts} aria-label="짜임" data-testid="mold-layouts">
          <span className={styles.layoutCount}>짜임 {PART_LAYOUTS.findIndex((item) => item.layout === layoutOfFocus) + 1}/6</span>
          {PART_LAYOUTS.map((item) => <Button key={item.layout} variant="chip" size="chip-sm" aria-selected={item.layout === layoutOfFocus} data-done={edits[item.layout] && Object.keys(edits[item.layout]!).length ? true : undefined}
            onClick={() => { const inLine = chars.find((char) => char !== ' ' && layoutOf(char) === item.layout); setPartChar(inLine ?? item.sample) }} data-testid={`mold-layout-${item.layout}`}>
            {edits[item.layout] && Object.keys(edits[item.layout]!).length ? <Check aria-hidden="true" /> : null}{item.name}
          </Button>)}
        </nav>
        <SimsStep fence={compare ? undefined : fence} char={workChar} drawn={drawn} edits={edits} setEdits={setEdits} look={look} weightCap={weightCap} stackHeight={stackHeight} sel={sel} setSel={setSel} onBegin={remember} />
        <section className={styles.touched} aria-label="닿는 글자" data-testid="mold-touched">
          <span className={styles.layoutCount}>닿는 글자 · 같은 짜임은 다 같이 바뀜(옅은 것은 처음 모습)</span>
          <div className={styles.touchedRow}>
            {touched.map((char) => <Pressable key={char} className={styles.touchedChar} onClick={() => setPartChar(char)} aria-label={`${char} 크게 보기`} data-testid={`mold-touched-${char}`}>
              <span className={styles.touchedGhost} aria-hidden="true"><MoldGlyph char={char} size={34} edits={NO_EDITS} look={look} drawn={drawn} weightCap={weightCap} stackHeight={stackHeight} /></span>
              <MoldGlyph char={char} size={34} edits={edits} look={look} drawn={drawn} weightCap={weightCap} stackHeight={stackHeight} fence={fence} />
            </Pressable>)}
          </div>
        </section>
      </>}
      {step === 'stroke' && <section className={styles.panel} aria-label="획 다듬기" data-testid="mold-stroke-step">
        <ChoiceGroup variant="segment" aria-label="줄기 고르기" className={styles.plates} data-testid="mold-stem-picks">
          {STEM_PICKS.map((base) => <ChoiceItem key={base} checked={stemPick === base} onClick={() => setStemPick(base)} data-testid={`mold-stem-${base}`}>{STEM_TUNE[base].name}</ChoiceItem>)}
        </ChoiceGroup>
        {[...stemBarsOf(stemPick), { key: 'serif' as const, name: '부리 · 미리보기만' }].map((bar) => {
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
      <div className={styles.moldActions} data-row={full || undefined}>
        <Button variant="outline" size="sm" onClick={undo} disabled={!history.length} data-testid="mold-undo"><Undo2 aria-hidden="true" />되돌리기</Button>
        <Button variant="outline" size="sm" onClick={resetRegion} disabled={step === 'part' && !edits[layoutOfFocus]} data-testid="mold-reset-region"><RotateCcw aria-hidden="true" />{step === 'shape' ? '처음 값' : step === 'stroke' ? '획 처음대로' : step === 'finish' ? '자간 처음대로' : '이 짜임 처음대로'}</Button>
        {full && <Button size="sm" onClick={goNext} data-testid="mold-next-shape">{NEXT_LABEL.shape}<ChevronRight aria-hidden="true" /></Button>}
      </div>
      {!full && NEXT_LABEL[step] && <Button size="block" onClick={goNext} data-testid={`mold-next-${step}`}>{NEXT_LABEL[step]}<ChevronRight aria-hidden="true" /></Button>}
    </>}

    {!full && changed > 0 && (askReset
      ? <div className={styles.moldActions} data-testid="mold-reset-ask">
        <span className={styles.skipNote}>그은 획까지 모두 지움</span>
        <Button variant="outline" size="sm" onClick={() => setAskReset(false)} data-testid="mold-reset-no">취소</Button>
        <Button variant="destructive" size="sm" onClick={() => { remember(); setEdits({}); setLook(homeLook); setRaws({}); setStep('draw'); setAskReset(false) }} data-testid="mold-reset-yes">지우기</Button>
      </div>
      : <Button variant="ghost" size="sm" className={styles.center} onClick={() => setAskReset(true)} data-testid="mold-reset-all"><RotateCcw aria-hidden="true" />모두 처음대로</Button>)}
  </main></MoldOriginContext.Provider>
}
