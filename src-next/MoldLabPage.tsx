import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { Check, ChevronRight, Dices, RotateCcw, Undo2 } from 'lucide-react'
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
import { Switch } from './components/ui/switch'
import { EDIT_COLOR } from './editColors'
import { clearanceRatio, correctGlyph, GOTHIC_FENCE, measureGlyph, movedBoxes, partClearances, pickJamoScale, scaledBoxes, type FenceLine, type FencePull } from './fenceBand'
import { applyPartEdits, appliedWeight, dirOf, dragGrip, dragLook, dragWhole, editsBetween, gripAt, lookBoxes, lookRect, wholeGripAt, type BoxGrip, type Rect, type WholeGrip, gapCapMultiplier, lookOf, regionLabels, scaledWeight, simsBoxes, simsPartOf, type Dir, type GapStroke, type LayoutEdits, type Look, type Region, type SimsPart } from './moldLab'
import { useContextPlacement } from './notoModel'
import { SAMPLE_SENTENCES } from './sampleSentences'
import { consonantBoxesOf, consonantShapesOf, consonantStemKeys, drawnStem, LAYOUTS, mastersOf, shapeConsonants, STEMS, stemInfo, vowelStemKeys, type DrawnStem, type StemKind } from './strokeLab'
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
type Step = 'draw' | 'shape' | 'part'
const STEP_NAMES: Record<Step, string> = { draw: '긋기', shape: '인상 잡기', part: '부위 다듬기' }
const STEP_ORDER: readonly Step[] = ['draw', 'shape', 'part']

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
  return result.primitives.map((primitive) => ({ points: primitive.stroke.points, closed: primitive.stroke.closed, box: primitive.box, thickness: primitive.stroke.thickness, part: primitive.source.part.startsWith('JU') ? 'JU' : primitive.source.part }))
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
  return lookBoxes(applyPartEdits(boxes, edits[layout]), look)
}

/**
 * 빚은 글자 하나. 칸을 풀고, 짜임 편집 · 폭 · 굵기 · 끝 모양을 차례로 입혀 그린다.
 * `sel`이 있으면 고른 부위만 제 색으로, 나머지는 옅게 그린다.
 */
function MoldGlyph({ char, size, edits, look, drawn, sel, shownStroke, testId, onCap, fence, onFence }: { char: string; size: number; edits: LayoutEdits; look: Look; drawn?: Drawn; sel?: Region | null; shownStroke?: (key: string) => boolean; testId?: string; weightCap?: number; onCap?: (grow: number, limited: boolean) => void; fence?: MoldFence; onFence?: (need: number, pulls: readonly FencePull[]) => void }) {
  const { syllable, effective, placement, padding } = useGlyphBase(char, drawn)
  const base = useGlyphBase(char, undefined)
  const molded = useMemo(() => placement.kind === 'boxes' ? moldedBoxes(placement.boxes, syllable.layoutType, edits, look) : undefined, [placement, syllable.layoutType, edits, look])

  // 굵게 해도 멈추지 않는다. 획이 붙을 자리(ㄹ 가로 사이 등)가 생기면 자소 칸을 조금씩 키워 그 안의 틈을 낸다 —
  // 굵은 폰트도 자소가 줄지 않고 조금 커지며, 자소 사이 틈이 대신 준다(거북이 자소별 표 2절). 키워도 모자라면 그 글자만 그 자리에서 멈춘다.
  const wanted = lookOf(look, 'weight')
  const grown = useMemo(() => {
    if (!molded || placement.kind !== 'boxes' || wanted <= 1) return { boxes: molded, grow: 1, ratio: wanted }
    const ref = gapStrokesOf(syllable, placement, effective.linecap, effective.linejoin)
    const baseM = weightToMultiplier(effective.weight)
    const wantedM = weightToMultiplier(scaledWeight(effective.weight, wanted))
    let capM = Infinity
    for (const grow of JAMO_GROWS) {
      const candidate = grow === 1 ? molded : scaledBoxes(molded, grow)
      capM = gapCapMultiplier(ref, gapStrokesOf(syllable, { kind: 'boxes', boxes: candidate }, effective.linecap, effective.linejoin), baseM, 0)
      if (capM >= wantedM) return { boxes: candidate, grow, ratio: wanted }
    }
    const last = JAMO_GROWS[JAMO_GROWS.length - 1]
    return { boxes: scaledBoxes(molded, last), grow: last, ratio: Math.max(1, weightUnder(capM, 100) / effective.weight) }
  }, [molded, placement, wanted, syllable, effective])
  useEffect(() => { onCap?.(grown.grow, grown.ratio < wanted) }, [onCap, grown, wanted])

  // 울타리: 그은 획 때문에 칸 밖으로 나간 것을 당긴다. 기준 글자는 그은 게 없을 때 같은 칸의 모습.
  const fenced = useMemo(() => fence && grown.boxes ? fencedBoxes({ syllable, baseSyllable: drawn ? base.syllable : syllable, boxes: grown.boxes, style: effective, padding, fence }) : null, [fence, grown.boxes, syllable, base.syllable, drawn, effective, padding])
  useEffect(() => { if (fenced) onFence?.(fenced.need, fenced.pulls) }, [onFence, fenced])
  const boxes = fenced?.boxes ?? grown.boxes
  const ratio = grown.ratio
  const soft = lookOf(look, 'soft') > 0.5
  const globalStyle = useMemo(() => {
    const weighted = ratio === 1 ? effective : { ...effective, weight: scaledWeight(effective.weight, ratio) }
    return soft ? { ...weighted, linecap: 'round' as const, linejoin: 'round' as const } : weighted
  }, [effective, ratio, soft])
  const colorOf = useCallback((source: ResolvedStrokeInkSource) => {
    if (shownStroke) return shownStroke(`${simsPartOf(source.part)}:${source.jamoId}:${source.strokeId}`) ? undefined : 'transparent'
    if (sel === 'STROKE') return EDIT_COLOR.editSelect
    if (sel === 'CH' || sel === 'JU' || sel === 'JO') return simsPartOf(source.part) === sel ? SLOT_COLOR[sel] : EDIT_COLOR.editSlotOff
    return undefined
  }, [sel, shownStroke])

  // 폭이 좁아지면 글자 칸도 같이 좁힌다. 자간은 글자 사이를 더하거나 뺀다.
  const slot = { width: size * lookOf(look, 'frame') * lookOf(look, 'size') + size * lookOf(look, 'tracking'), marginInline: 0 }
  return <span className={styles.glyph} style={slot} data-testid={testId}>
    <SvgRenderer
      syllable={syllable}
      schema={placement.kind === 'schema' ? placement.schema : undefined}
      boxes={boxes}
      size={size}
      globalStyle={globalStyle}
      overflow="visible"
      clipGlyphs={false}
      strokeColorOf={shownStroke || (sel && sel !== 'WHOLE') ? colorOf : undefined}
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

const PARTS: readonly SimsPart[] = ['CH', 'JU', 'JO']
const LOOK_KEYS = ['weight', 'soft', 'frame', 'tracking', 'size', 'height'] as const
const ZERO_EDIT = [0, 0, 0, 0] as const
const STAGE = 220
const DIRS: readonly { dir: Dir; x: number; y: number; arrow: string }[] = [
  { dir: 'up', x: 50, y: 6, arrow: '↑' }, { dir: 'down', x: 50, y: 94, arrow: '↓' },
  { dir: 'left', x: 12, y: 50, arrow: '←' }, { dir: 'right', x: 88, y: 50, arrow: '→' },
  { dir: 'ul', x: 18, y: 17, arrow: '↖' }, { dir: 'ur', x: 82, y: 17, arrow: '↗' },
  { dir: 'dl', x: 18, y: 83, arrow: '↙' }, { dir: 'dr', x: 82, y: 83, arrow: '↘' },
]
const REGION_BUTTONS: readonly { region: SimsPart; name: string; color: string }[] = [
  { region: 'CH', name: '첫닿자', color: EDIT_COLOR.editSlotCh }, { region: 'JU', name: '홀자', color: EDIT_COLOR.editSlotJu },
  { region: 'JO', name: '받침', color: EDIT_COLOR.editSlotJo },
]
/** 손잡이 잡는 폭(px). 폰 손가락 크기. */
const GRIP_PX = 16
const pct = (value: number) => `${(value * 100).toFixed(2)}%`
const signed = (value: number) => `${value >= 0 ? '+' : ''}${Math.round(value * 100)}%`

function labelOf(dir: Dir, labels: { up: string; down: string; left: string; right: string }): string {
  if (dir === 'up' || dir === 'down' || dir === 'left' || dir === 'right') return labels[dir]
  return [labels[dir[0] === 'u' ? 'up' : 'down'], labels[dir[1] === 'l' ? 'left' : 'right']].filter(Boolean).join(' · ')
}

type Mode = 'shape' | 'part'
type Grab = { x0: number; y0: number; moved: boolean; start: Partial<Record<SimsPart, BoxConfig>>; look: Look; grip?: BoxGrip; whole?: WholeGrip; last?: string; lastX?: number; lastY?: number }

/**
 * 빚기 무대. 두 걸음이 같은 큰 글자를 쓴다.
 * - 인상 잡기(shape): 네모꼴 테두리 — 모서리 = 크기, 위 · 아래 변 = 키, 왼 · 오른 변 = 폭. 글자 안쪽을 위아래로 끌면 굵기, 좌우로 끌면 끝 둥글기.
 * - 부위 다듬기(part): 부위를 콕 골라 칸 상자의 네 변 · 가운데를 끌거나(기존 한글칸글 상자 조절처럼), 상자 밖에서 여덟 방향으로 끈다(심즈 방식).
 */
function SimsStep({ mode, char, drawn, edits, setEdits, look, setLook, weightCap, weightNote, sel, setSel, onBegin, fence }: {
  mode: Mode
  fence?: MoldFence
  char: string; drawn?: Drawn; edits: LayoutEdits; setEdits: (update: (now: LayoutEdits) => LayoutEdits) => void
  look: Look; setLook: (next: Look) => void; weightCap: number; weightNote?: string; sel: Region | null; setSel: (region: Region | null) => void; onBegin: () => void
}) {
  const { syllable, placement, padding, effective } = useGlyphBase(char, drawn)
  const layout = syllable.layoutType
  const origin = useMemo(() => placement.kind === 'boxes' ? simsBoxes(placement.boxes) : {}, [placement])
  const present: Record<SimsPart, boolean> = { CH: !!syllable.choseong, JU: !!syllable.jungseong, JO: !!syllable.jongseong }
  const part: SimsPart | null = mode === 'part' && (sel === 'CH' || sel === 'JU' || sel === 'JO') && present[sel] ? sel : null
  const body: Rect = useMemo(() => [padding.left, padding.top, 1 - padding.right, 1 - padding.bottom], [padding])
  const [dir, setDir] = useState<Dir | null>(null)
  const [pressing, setPressing] = useState(false)
  const [gripOn, setGripOn] = useState<string | null>(null)
  const grab = useRef<Grab | null>(null)
  const [bump, setBump] = useState(0)
  const lastBump = useRef(0)
  const bumpWall = () => { const now = Date.now(); if (now - lastBump.current > 450) { lastBump.current = now; setBump((n) => n + 1) } }
  const svgHost = useRef<HTMLDivElement>(null)

  // 큰 글자만 젤리로 따라온다(글줄은 손 그대로).
  const target = useMemo(() => {
    const out: Record<string, number> = { press: pressing ? 0.96 : 1 }
    for (const one of PARTS) (edits[layout]?.[one] ?? ZERO_EDIT).forEach((value, i) => { out[`${one}${i}`] = value })
    for (const key of LOOK_KEYS) out[key] = lookOf(look, key)
    return out
  }, [edits, layout, look, pressing])
  const shown = useSpring(target)
  // shown은 같은 객체를 고쳐 쓰므로 매번 새로 만든다(스프링이 돌 때마다 다시 그린다).
  const shownEdits: LayoutEdits = { [layout]: Object.fromEntries(PARTS.map((one) => [one, [0, 1, 2, 3].map((i) => shown[`${one}${i}`] ?? 0)])) }
  const shownLook: Look = Object.fromEntries(LOOK_KEYS.map((key) => [key, shown[key]]))

  /** 화면 좌표 → 글자 단위(큰 글자 svg 기준). */
  const glyphPoint = (clientX: number, clientY: number) => {
    const svg = svgHost.current?.querySelector('svg')
    if (!svg) return null
    const rect = svg.getBoundingClientRect()
    return { x: (clientX - rect.left) / rect.width, y: (clientY - rect.top) / rect.width, unit: rect.width }
  }
  const nowBoxes = () => placement.kind === 'boxes' ? simsBoxes(moldedBoxes(placement.boxes, layout, edits, look)) : {}

  const begin = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (placement.kind !== 'boxes') return
    event.currentTarget.setPointerCapture(event.pointerId)
    const at = glyphPoint(event.clientX, event.clientY)
    const tol = at ? GRIP_PX / at.unit : 0
    let grip: BoxGrip | undefined, whole: WholeGrip | undefined
    if (at && mode === 'shape') whole = wholeGripAt(lookRect(body, look), at.x, at.y, tol)
    if (at && part) { const box = nowBoxes()[part]; if (box) grip = gripAt(box, at.x, at.y, tol) }
    grab.current = { x0: event.clientX, y0: event.clientY, moved: false, start: simsBoxes(applyPartEdits(placement.boxes, edits[layout])), look, grip, whole }
    setGripOn(whole ?? grip ?? null)
  }
  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    const g = grab.current
    if (!g) return
    let dx = event.clientX - g.x0, dy = event.clientY - g.y0
    if (!g.moved) {
      const len = Math.hypot(dx, dy)
      if (len < 6) return
      // 부위 다듬기의 끌기는 하나: 변은 그 변만, 가운데(칸 안)는 자리 옮기기. 칸 밖에서 끌면 아무것도 안 한다.
      if (mode === 'part' && (!part || !g.grip)) { grab.current = null; setGripOn(null); return }
      // 문턱만큼 툭 뛰지 않게 기준점을 옮긴다.
      g.moved = true; g.x0 += dx * 6 / len; g.y0 += dy * 6 / len
      dx = event.clientX - g.x0; dy = event.clientY - g.y0
      onBegin(); setPressing(!g.grip && !g.whole)
    }
    const unit = glyphPoint(0, 0)?.unit ?? STAGE
    // 손잡이는 손 그대로(1:1), 어디서든 끌기는 조금 느리게.
    // 벽: 손은 더 갔는데 값이 그대로면 젤리로 툭 튕겨 알린다.
    const wall = (out: unknown) => {
      const key = JSON.stringify(out)
      if (g.last === key && Math.hypot(event.clientX - (g.lastX ?? event.clientX), event.clientY - (g.lastY ?? event.clientY)) > 3) bumpWall()
      if (g.last !== key) { g.last = key; g.lastX = event.clientX; g.lastY = event.clientY }
    }
    if (g.whole) { const next = dragWhole(g.look, body, g.whole, dx / unit, dy / unit); wall(next); setLook(next); return }
    const frameX = lookOf(look, 'frame') * lookOf(look, 'size'), frameY = lookOf(look, 'height') * lookOf(look, 'size')
    if (g.grip && part) {
      const next = dragGrip(g.start, origin, part, g.grip, dx / unit / frameX, dy / unit / frameY)
      wall(next[part])
      setEdits((now) => ({ ...now, [layout]: editsBetween(origin, next) }))
      return
    }
    setDir(dirOf(dx, dy))
    const du = dx / STAGE * 0.8, dv = dy / STAGE * 0.8
    if (mode === 'shape') { const next = dragLook(g.look, 'STROKE', du, dv); wall(next); setLook(next) }
  }
  const end = (event: ReactPointerEvent<HTMLDivElement>) => {
    const g = grab.current
    grab.current = null
    setDir(null); setPressing(false); setGripOn(null)
    if (!g || g.moved || placement.kind !== 'boxes' || mode !== 'part') return
    // 콕: 누른 자리의 부위를 고른다. 칸 상자 손잡이를 콕 누른 것은 고르기가 아니다.
    if (g.grip) return
    const at = glyphPoint(event.clientX, event.clientY)
    if (!at) return
    const boxes = nowBoxes()
    let best: { part: SimsPart; d: number } | null = null
    for (const one of PARTS) {
      const box = boxes[one]
      if (!box || !present[one]) continue
      const ddx = Math.max(box.x - at.x, 0, at.x - box.x - box.width), ddy = Math.max(box.y - at.y, 0, at.y - box.y - box.height)
      const d = Math.hypot(ddx, ddy) - (ddx === 0 && ddy === 0 ? box.width * box.height : 0) // 겹치면 작은 칸 먼저
      if (!best || d < best.d) best = { part: one, d }
    }
    if (best && best.d < 0.06) setSel(best.part)
  }

  // 무대 위 손잡이 그림. 큰 글자 svg와 같은 자리(무대 가운데 STAGE px 네모)에 깐다.
  const overlay = (() => {
    if (mode === 'shape') {
      const [x0, y0, x1, y1] = lookRect(body, shownLook)
      return <div className={styles.frameBox} style={{ left: pct(x0), top: pct(y0), width: pct(x1 - x0), height: pct(y1 - y0) }} data-testid="mold-frame">
        {(['t', 'b', 'l', 'r', 'tl', 'tr', 'bl', 'br'] as const).map((grip) => <span key={grip} className={styles.grip} data-grip={grip} data-on={gripOn === grip || undefined} />)}
      </div>
    }
    if (!part || placement.kind !== 'boxes') return null
    const box = simsBoxes(moldedBoxes(placement.boxes, layout, shownEdits, shownLook))[part]
    if (!box) return null
    return <div className={styles.partBox} style={{ left: pct(box.x), top: pct(box.y), width: pct(box.width), height: pct(box.height), borderColor: SLOT_COLOR[part] }} data-testid="mold-partbox">
      {(['t', 'b', 'l', 'r', 'move'] as const).map((grip) => <span key={grip} className={styles.grip} data-grip={grip} data-on={gripOn === grip || undefined} style={{ background: SLOT_COLOR[part] }} />)}
    </div>
  })()

  // 여덟 방향 알약은 인상 잡기(굵기 · 끝 둥글기)에만. 부위 다듬기는 칸 상자 손잡이 하나로.
  const showArrows = !gripOn && mode === 'shape'
  const labels = mode === 'shape' ? regionLabels('STROKE', layout) : null
  const weightNow = scaledWeight(effective.weight, appliedWeight(lookOf(look, 'weight'), weightCap))
  const readout = mode === 'shape'
    ? `크기 ×${lookOf(look, 'size').toFixed(2)} · 키 ×${lookOf(look, 'height').toFixed(2)} · 폭 ×${lookOf(look, 'frame').toFixed(2)} · 굵기 ${weightNow} · 끝 ${lookOf(look, 'soft') > 0.5 ? '둥긂' : '또렷'} · 자간 ${signed(lookOf(look, 'tracking'))}`
    : part ? (() => { const box = placement.kind === 'boxes' ? simsBoxes(applyPartEdits(placement.boxes, edits[layout]))[part] : undefined; return box ? `가로 ${Math.round(box.width * 100)} · 세로 ${Math.round(box.height * 100)}` : '' })() : ''

  return <section className={styles.panel} aria-label={mode === 'shape' ? '인상 잡기' : '부위 다듬기'}>
    <div className={styles.stage} onPointerDown={begin} onPointerMove={move} onPointerUp={end} onPointerCancel={end} data-grip={gripOn ?? undefined} data-testid="mold-stage">
      <div className={styles.bumper} data-bump={bump === 0 ? undefined : bump % 2 ? 'a' : 'b'} data-testid="mold-bumper">
      <div ref={svgHost} className={styles.stageGlyph} style={{ transform: `scale(${(shown.press ?? 1).toFixed(4)})` }}>
        <MoldGlyph char={char} size={STAGE} edits={shownEdits} look={shownLook} drawn={drawn} sel={mode === 'part' ? part : null} weightCap={weightCap} fence={fence} testId="mold-focus" />
      </div>
      <div className={styles.handles} data-mode={mode} style={{ width: STAGE, height: STAGE }}>{overlay}</div>
      </div>
      {labels && showArrows ? DIRS.map(({ dir: d, x, y, arrow }) => {
        const text = labelOf(d, labels)
        if (!text) return null
        return <span key={d} className={styles.arrow} data-corner={d.length === 2 || undefined} data-on={dir === d || undefined} data-off={(dir && dir !== d) || undefined} style={{ left: `${x}%`, top: `${y}%` }} data-testid={`mold-arrow-${d}`}>
          {x < 50 ? `${arrow} ${text}` : x > 50 ? `${text} ${arrow}` : `${arrow} ${text}`}
        </span>
      }) : mode === 'part' && !part && <span className={styles.tapNote}>다듬을 부위를 콕 누르세요</span>}
    </div>
    <p className={styles.simsReadout} data-testid="mold-readout">{mode === 'shape' ? <><strong>인상</strong> {readout}{weightNote ? <><br />{weightNote}</> : null}</> : part ? <><strong>{regionLabels(part, layout).name}</strong> {readout}</> : ' '}</p>
    {mode === 'part' && <ChoiceGroup variant="segment" aria-label="부위" className={styles.regions}>
      {REGION_BUTTONS.map(({ region, name, color }) => <ChoiceItem key={region} checked={part === region} disabled={!present[region]} onClick={() => setSel(region)} data-testid={`mold-region-${region}`}>
        <span className={styles.dot} style={{ background: color }} aria-hidden="true" />{name}
      </ChoiceItem>)}
    </ChoiceGroup>}
    <p className={styles.note}>{mode === 'shape'
      ? '네모 테두리의 모서리를 끌면 크기, 위 · 아래 변은 키, 왼 · 오른 변은 폭이 바뀌어요. 글자 안쪽을 위아래로 끌면 굵기, 좌우로 끌면 끝 둥글기. 자간은 위 글줄에서 좌우로 끌어요. 벽에 닿으면 글자가 툭 튕겨요. 값은 아직 임시예요.'
      : '부위를 콕 누르면 칸 상자가 떠요. 변을 끌면 그 변만, 칸 안을 끌면 자리를 옮겨요. 이웃 부위는 처음 크기의 70%까지만 눌리고, 그다음엔 밀려나다 글자 끝에서 멈춰요. 벽에 닿으면 글자가 툭 튕겨요. 이 걸음은 건너뛰어도 돼요.'}</p>
  </section>
}

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
  // 굵게 할 때 글자마다 자소를 얼마나 키웠나 · 키워도 모자라 멈췄나(안내에만 쓴다).
  const [caps, setCaps] = useState<Record<string, { grow: number; limited: boolean }>>({})
  const capReporters = useMemo(() => {
    const out: Record<number, (grow: number, limited: boolean) => void> = {}
    ;[...sentence].forEach((_, at) => { out[at] = (grow, limited) => setCaps((all) => { const key = `${sentence}-${at}`; const old = all[key]; return old && old.grow === grow && old.limited === limited ? all : { ...all, [key]: { grow, limited } } }) })
    return out
  }, [sentence])
  const capsNow = [...sentence].flatMap((char, at) => (char === ' ' || !caps[`${sentence}-${at}`] ? [] : [caps[`${sentence}-${at}`]]))
  const weightNote = [capsNow.some((cap) => cap.grow > 1) ? `${capsNow.filter((cap) => cap.grow > 1).length}자는 자소를 키워 틈을 냄` : '', capsNow.some((cap) => cap.limited) ? `${capsNow.filter((cap) => cap.limited).length}자는 획이 붙기 직전에 멈춤` : ''].filter(Boolean).join(' · ')
  const weightCap = Infinity
  // 울타리 보정(획 긋기 시험판에서 가져옴). 켜면 그은 획 때문에 울타리 밖으로 나간 글자를 당긴다.
  const [fenceOn, setFenceOn] = useState(true)
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
    if (step === 'shape') setLook({})
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
      <div className={styles.line} data-testid="mold-line" data-drag={step === 'shape' || undefined}
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
          data-testid="mold-compare">{compare ? '처음 모습' : '누르는 동안 처음과 견주기'}</Button>
      </div>
      <div className={styles.fence} data-testid="fence-card">
        <div className={styles.fenceHead}>
          <span className={styles.fenceTitle}><strong>울타리 보정</strong><span data-testid="fence-count">{fenceNote}</span></span>
          <Switch checked={fenceOn} onCheckedChange={setFenceOn} aria-label="울타리 보정" data-testid="fence-switch" />
        </div>
        <div className={styles.fenceLine}>
          <span>세기 · 안전선이 더 세게 당김</span>
          <ChoiceGroup variant="segment" aria-label="울타리 선" className={styles.fenceLineSwitch}>
            {(['safe', 'limit'] as const).map((line) => <ChoiceItem key={line} checked={fenceLine === line} disabled={!fenceOn} onClick={() => setFenceLine(line)} data-testid={`fence-line-${line}`}>{FENCE_LINE_NAMES[line]}</ChoiceItem>)}
          </ChoiceGroup>
        </div>
      </div>
    </section>

    {step === 'draw' && <DrawStep raws={raws} setRaws={setRaws} stems={stems} onDone={() => setStep('shape')} />}
    {step !== 'draw' && <>
      <SimsStep mode={step} weightNote={weightNote} fence={compare ? undefined : fence} char={focusChar} drawn={drawn} edits={edits} setEdits={setEdits} look={look} setLook={setLook} weightCap={weightCap} sel={sel} setSel={setSel} onBegin={remember} />
      <div className={styles.moldActions}>
        <Button variant="outline" size="sm" onClick={undo} disabled={!history.length} data-testid="mold-undo"><Undo2 aria-hidden="true" />되돌리기</Button>
        <Button variant="outline" size="sm" onClick={resetRegion} disabled={step === 'part' && !sel} data-testid="mold-reset-region"><RotateCcw aria-hidden="true" />{step === 'shape' ? '인상 처음대로' : '부위 처음대로'}</Button>
      </div>
      {step === 'shape' && <Button size="block" onClick={() => setStep('part')} data-testid="mold-to-part">부위 다듬기로<ChevronRight aria-hidden="true" /></Button>}
      {step === 'shape' && <p className={styles.skipNote}>부위 다듬기는 건너뛰어도 돼요.</p>}
    </>}

    {changed > 0 && <Button variant="ghost" size="sm" className={styles.center} onClick={() => { remember(); setEdits({}); setLook({}); setRaws({}); setStep('draw') }} data-testid="mold-reset-all"><RotateCcw aria-hidden="true" />모두 처음대로</Button>}
  </main>
}
