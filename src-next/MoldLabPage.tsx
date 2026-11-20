import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { Check, ChevronRight, Dices, RotateCcw, Undo2 } from 'lucide-react'
import { SvgRenderer } from '../src/renderers/SvgRenderer'
import { resolveGlyphInkPrimitives } from '../src/services/glyphInkResolver'
import type { PenPoint } from '../src/services/penStrokeFit'
import { useEffectiveGlobalStyle } from '../src/stores/globalStyleStore'
import { useJamoStore } from '../src/stores/jamoStore'
import { mergePadding, useLayoutStore } from '../src/stores/layoutStore'
import { propagatedJungseong } from '../src/stores/stemMasterStore'
import type { BoxConfig, JamoData, LayoutType, Part, ResolvedStrokeInkSource } from '../src/types'
import type { DecomposedSyllable } from '../src/types'
import { weightToMultiplier } from '../src/utils/globalStyleUtils'
import { decomposeSyllable } from '../src/utils/hangulUtils'
import { pointsToSvgD } from '../src/utils/pathUtils'
import { Button } from './components/ui/button'
import { ChoiceGroup, ChoiceItem } from './components/ui/choice-group'
import { Pressable } from './components/ui/pressable'
import { EDIT_COLOR } from './editColors'
import { applyPartEdits, bigBoxes, dirOf, dragLook, dragPart, editsBetween, gapCapMultiplier, lookOf, regionLabels, scaledWeight, simsBoxes, simsPartOf, type Dir, type GapStroke, type LayoutEdits, type Look, type Region, type SimsPart } from './moldLab'
import { useContextPlacement } from './notoModel'
import { SAMPLE_SENTENCES } from './sampleSentences'
import { consonantBoxesOf, consonantShapesOf, drawnStem, LAYOUTS, mastersOf, shapeConsonants, STEMS, stemInfo, type DrawnStem, type StemKind } from './strokeLab'
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
type Step = 'draw' | 'mold'
const STEP_NAMES: Record<Step, string> = { draw: '긋기', mold: '빚기' }
const STEP_ORDER: readonly Step[] = ['draw', 'mold']

/** 그은 줄기를 자모에 입힌 것. 닿자는 짜임마다 칸 비율이 달라 짜임별로 따로. */
interface Drawn {
  jungseong?: Readonly<Record<string, JamoData>>
  consonants: Record<LayoutType, { choseong: Record<string, JamoData>; jongseong: Record<string, JamoData> }>
}

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
  const padding = mergePadding(globalPadding, paddingOverrides[syllable.layoutType])
  const schema = { ...schemas[syllable.layoutType], padding, designBodyPadding: padding }
  const { placement } = useContextPlacement(syllable, schema, effective)
  return { syllable, effective, placement }
}

/** 칸 편집(짜임) → 폭(전체) 순서로 입힌 칸. 편집은 폭을 뺀 글자 단위다. */
function moldedBoxes(boxes: Partial<Record<Part, BoxConfig>>, layout: LayoutType, edits: LayoutEdits, look: Look) {
  return bigBoxes(applyPartEdits(boxes, edits[layout]), { frame: lookOf(look, 'frame') })
}

/**
 * 빚은 글자 하나. 칸을 풀고, 짜임 편집 · 폭 · 굵기 · 끝 모양을 차례로 입혀 그린다.
 * `sel`이 있으면 고른 부위만 제 색으로, 나머지는 옅게 그린다.
 */
function MoldGlyph({ char, size, edits, look, drawn, sel, testId, weightCap = Infinity, onCap }: { char: string; size: number; edits: LayoutEdits; look: Look; drawn?: Drawn; sel?: Region | null; testId?: string; weightCap?: number; onCap?: (ratio: number) => void }) {
  const { syllable, effective, placement } = useGlyphBase(char, drawn)
  const boxes = useMemo(() => placement.kind === 'boxes' ? moldedBoxes(placement.boxes, syllable.layoutType, edits, look) : undefined, [placement, syllable.layoutType, edits, look])

  // 획 사이 최소 틈: 이 글자가 버틸 수 있는 굵기 비율을 재서 올린다. 글줄은 가장 작은 비율을 다 같이 쓴다.
  const capRatio = useMemo(() => {
    if (!onCap || placement.kind !== 'boxes' || !boxes) return Infinity
    const ref = gapStrokesOf(syllable, placement, effective.linecap, effective.linejoin)
    const cur = gapStrokesOf(syllable, { kind: 'boxes', boxes }, effective.linecap, effective.linejoin)
    const capM = gapCapMultiplier(ref, cur, weightToMultiplier(effective.weight))
    return capM === Infinity ? Infinity : weightUnder(capM, 100) / effective.weight
  }, [onCap, placement, boxes, syllable, effective])
  useEffect(() => { onCap?.(capRatio) }, [onCap, capRatio])
  // 틈이 바닥 아래로 가지 않는 데까지만 굵게 한다. 칸이 좁아져 처음 굵기로도 붙으면 그만큼 가늘게 한다.
  const ratio = Math.min(lookOf(look, 'weight'), weightCap)
  const soft = lookOf(look, 'soft') > 0.5
  const globalStyle = useMemo(() => {
    const weighted = ratio === 1 ? effective : { ...effective, weight: scaledWeight(effective.weight, ratio) }
    return soft ? { ...weighted, linecap: 'round' as const, linejoin: 'round' as const } : weighted
  }, [effective, ratio, soft])
  const colorOf = useCallback((source: ResolvedStrokeInkSource) => {
    if (sel === 'STROKE') return EDIT_COLOR.editSelect
    if (sel === 'CH' || sel === 'JU' || sel === 'JO') return simsPartOf(source.part) === sel ? SLOT_COLOR[sel] : EDIT_COLOR.editSlotOff
    return undefined
  }, [sel])

  // 폭이 좁아지면 글자 칸도 같이 좁힌다. 자간은 글자 사이를 더하거나 뺀다.
  const slot = { width: size * lookOf(look, 'frame') + size * lookOf(look, 'tracking'), marginInline: 0 }
  return <span className={styles.glyph} style={slot} data-testid={testId}>
    <SvgRenderer
      syllable={syllable}
      schema={placement.kind === 'schema' ? placement.schema : undefined}
      boxes={boxes}
      size={size}
      globalStyle={globalStyle}
      overflow="visible"
      clipGlyphs={false}
      strokeColorOf={sel && sel !== 'WHOLE' ? colorOf : undefined}
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
  useEffect(() => () => { if (frame.current !== null) cancelAnimationFrame(frame.current) }, [])
  return cur.current
}

const PARTS: readonly SimsPart[] = ['CH', 'JU', 'JO']
const LOOK_KEYS = ['weight', 'soft', 'frame', 'tracking'] as const
const ZERO_EDIT = [0, 0, 0, 0] as const
const STAGE = 220
const DIRS: readonly { dir: Dir; x: number; y: number; arrow: string }[] = [
  { dir: 'up', x: 50, y: 6, arrow: '↑' }, { dir: 'down', x: 50, y: 94, arrow: '↓' },
  { dir: 'left', x: 12, y: 50, arrow: '←' }, { dir: 'right', x: 88, y: 50, arrow: '→' },
  { dir: 'ul', x: 18, y: 17, arrow: '↖' }, { dir: 'ur', x: 82, y: 17, arrow: '↗' },
  { dir: 'dl', x: 18, y: 83, arrow: '↙' }, { dir: 'dr', x: 82, y: 83, arrow: '↘' },
]
const REGION_BUTTONS: readonly { region: Region; name: string; color: string }[] = [
  { region: 'CH', name: '첫닿자', color: EDIT_COLOR.editSlotCh }, { region: 'JU', name: '홀자', color: EDIT_COLOR.editSlotJu },
  { region: 'JO', name: '받침', color: EDIT_COLOR.editSlotJo }, { region: 'STROKE', name: '획', color: EDIT_COLOR.editSelect },
  { region: 'WHOLE', name: '전체', color: EDIT_COLOR.text5 },
]

function labelOf(dir: Dir, labels: { up: string; down: string; left: string; right: string }): string {
  if (dir === 'up' || dir === 'down' || dir === 'left' || dir === 'right') return labels[dir]
  return `${labels[dir[0] === 'u' ? 'up' : 'down']} · ${labels[dir[1] === 'l' ? 'left' : 'right']}`
}

/** 2단계: 심즈처럼 빚기. 큰 글자에서 부위를 콕 고르고 어디서든 여덟 방향으로 끈다. */
function SimsStep({ char, drawn, edits, setEdits, look, setLook, weightCap, sel, setSel, onBegin }: {
  char: string; drawn?: Drawn; edits: LayoutEdits; setEdits: (update: (now: LayoutEdits) => LayoutEdits) => void
  look: Look; setLook: (next: Look) => void; weightCap: number; sel: Region | null; setSel: (region: Region | null) => void; onBegin: () => void
}) {
  const { syllable, placement } = useGlyphBase(char, drawn)
  const layout = syllable.layoutType
  const origin = useMemo(() => placement.kind === 'boxes' ? simsBoxes(placement.boxes) : {}, [placement])
  const present: Record<SimsPart, boolean> = { CH: !!syllable.choseong, JU: !!syllable.jungseong, JO: !!syllable.jongseong }
  const [dir, setDir] = useState<Dir | null>(null)
  const [pressing, setPressing] = useState(false)
  const grab = useRef<{ x0: number; y0: number; moved: boolean; start: Partial<Record<SimsPart, BoxConfig>>; look: Look } | null>(null)
  const svgHost = useRef<HTMLDivElement>(null)

  // 큰 글자만 젤리로 따라온다(글줄은 손 그대로).
  const target = useMemo(() => {
    const out: Record<string, number> = { press: pressing ? 0.96 : 1 }
    for (const part of PARTS) (edits[layout]?.[part] ?? ZERO_EDIT).forEach((value, i) => { out[`${part}${i}`] = value })
    for (const key of LOOK_KEYS) out[key] = lookOf(look, key)
    return out
  }, [edits, layout, look, pressing])
  const shown = useSpring(target)
  // shown은 같은 객체를 고쳐 쓰므로 매번 새로 만든다(스프링이 돌 때마다 다시 그린다).
  const shownEdits: LayoutEdits = { [layout]: Object.fromEntries(PARTS.map((part) => [part, [0, 1, 2, 3].map((i) => shown[`${part}${i}`] ?? 0)])) }
  const shownLook: Look = { weight: shown.weight, soft: shown.soft, frame: shown.frame, tracking: shown.tracking }

  const frame = lookOf(look, 'frame')
  const begin = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (placement.kind !== 'boxes') return
    event.currentTarget.setPointerCapture(event.pointerId)
    grab.current = { x0: event.clientX, y0: event.clientY, moved: false, start: simsBoxes(applyPartEdits(placement.boxes, edits[layout])), look }
  }
  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    const g = grab.current
    if (!g) return
    let dx = event.clientX - g.x0, dy = event.clientY - g.y0
    if (!g.moved) {
      const len = Math.hypot(dx, dy)
      if (len < 8) return
      if (!sel) { grab.current = null; return }
      // 문턱(8px)만큼 툭 뛰지 않게 기준점을 옮긴다.
      g.moved = true; g.x0 += dx * 8 / len; g.y0 += dy * 8 / len
      dx = event.clientX - g.x0; dy = event.clientY - g.y0
      onBegin(); setPressing(true)
    }
    setDir(dirOf(dx, dy))
    const du = dx / STAGE * 0.8, dv = dy / STAGE * 0.8
    if (sel === 'CH' || sel === 'JU' || sel === 'JO') {
      if (!present[sel]) return
      const next = dragPart(g.start, origin, sel, du / frame, dv, layout)
      setEdits((now) => ({ ...now, [layout]: editsBetween(origin, next) }))
    } else if (sel) setLook(dragLook(g.look, sel, du, dv))
  }
  const end = (event: ReactPointerEvent<HTMLDivElement>) => {
    const g = grab.current
    grab.current = null
    setDir(null); setPressing(false)
    if (!g || g.moved || placement.kind !== 'boxes') return
    // 콕: 누른 자리의 부위를 고른다. 칸에서 멀면 글자 전체.
    const svg = svgHost.current?.querySelector('svg')
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const x = (event.clientX - rect.left) / rect.width, y = (event.clientY - rect.top) / rect.width
    const boxes = simsBoxes(moldedBoxes(placement.boxes, layout, edits, look))
    let best: { part: SimsPart; d: number } | null = null
    for (const part of PARTS) {
      const box = boxes[part]
      if (!box || !present[part]) continue
      const ddx = Math.max(box.x - x, 0, x - box.x - box.width), ddy = Math.max(box.y - y, 0, y - box.y - box.height)
      const d = Math.hypot(ddx, ddy) - (ddx === 0 && ddy === 0 ? box.width * box.height : 0) // 겹치면 작은 칸 먼저
      if (!best || d < best.d) best = { part, d }
    }
    setSel(best && best.d < 0.06 ? best.part : 'WHOLE')
  }

  const labels = sel ? regionLabels(sel, layout) : null
  const now = sel === 'CH' || sel === 'JU' || sel === 'JO'
    ? (() => { const box = placement.kind === 'boxes' ? simsBoxes(applyPartEdits(placement.boxes, edits[layout]))[sel] : undefined; return box ? `가로 ${Math.round(box.width * 100)} · 세로 ${Math.round(box.height * 100)}` : '이 글자엔 없어요' })()
    : sel === 'STROKE' ? `굵기 ×${Math.min(lookOf(look, 'weight'), weightCap).toFixed(2)} · 끝 ${lookOf(look, 'soft') > 0.5 ? '흐물' : '또렷'}${weightCap < lookOf(look, 'weight') ? ' · 틈 지키려고 멈춤' : ''}`
      : sel === 'WHOLE' ? `폭 ×${frame.toFixed(2)} · 자간 ${lookOf(look, 'tracking') >= 0 ? '+' : ''}${Math.round(lookOf(look, 'tracking') * 100)}%` : ''

  return <section className={styles.panel} aria-label="빚기">
    <div className={styles.stage} onPointerDown={begin} onPointerMove={move} onPointerUp={end} onPointerCancel={end} data-testid="mold-stage">
      <div ref={svgHost} className={styles.stageGlyph} style={{ transform: `scale(${(shown.press ?? 1).toFixed(4)})` }}>
        <MoldGlyph char={char} size={STAGE} edits={shownEdits} look={shownLook} drawn={drawn} sel={sel} weightCap={weightCap} testId="mold-focus" />
      </div>
      {labels ? DIRS.map(({ dir: d, x, y, arrow }) => <span key={d} className={styles.arrow} data-corner={d.length === 2 || undefined} data-on={dir === d || undefined} data-off={(dir && dir !== d) || undefined} style={{ left: `${x}%`, top: `${y}%` }} data-testid={`mold-arrow-${d}`}>
        {x < 50 ? `${arrow} ${labelOf(d, labels)}` : x > 50 ? `${labelOf(d, labels)} ${arrow}` : `${arrow} ${labelOf(d, labels)}`}
      </span>) : <span className={styles.tapNote}>만질 곳을 콕 누르세요</span>}
    </div>
    <p className={styles.simsReadout} data-testid="mold-readout">{labels ? <><strong>{labels.name}</strong> {now}</> : ' '}</p>
    <ChoiceGroup variant="segment" aria-label="부위" className={styles.regions}>
      {REGION_BUTTONS.map(({ region, name, color }) => <ChoiceItem key={region} checked={sel === region} disabled={(region === 'CH' || region === 'JU' || region === 'JO') && !present[region]} onClick={() => setSel(region)} data-testid={`mold-region-${region}`}>
        <span className={styles.dot} style={{ background: color }} aria-hidden="true" />{name}
      </ChoiceItem>)}
    </ChoiceGroup>
    <p className={styles.note}>글자에서 첫닿자 · 홀자 · 받침을 콕 누르면 그 부위가 빛나고, 둘레에 끌 방향과 바뀌는 것이 떠요. 어디서든 끌면 돼요. 대각선이면 두 가지가 같이 바뀌어요. 같은 짜임의 글자가 글줄에서 같이 바뀌어요. 값은 아직 임시예요.</p>
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
  // 글자마다 버틸 수 있는 굵기 비율(획 사이 최소 틈). 글줄은 가장 작은 것을 다 같이 쓴다.
  const [caps, setCaps] = useState<Record<string, number>>({})
  const capReporters = useMemo(() => {
    const out: Record<number, (ratio: number) => void> = {}
    ;[...sentence].forEach((_, at) => { out[at] = (ratio: number) => setCaps((all) => (all[`${sentence}-${at}`] === ratio ? all : { ...all, [`${sentence}-${at}`]: ratio })) })
    return out
  }, [sentence])
  const weightCap = Math.min(Infinity, ...[...sentence].map((char, at) => (char === ' ' ? Infinity : caps[`${sentence}-${at}`] ?? Infinity)))

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
    if (!sel) return
    remember()
    // 칸은 서로 맞물려 있어 짜임째로 되돌린다.
    if (sel === 'CH' || sel === 'JU' || sel === 'JO') setEdits((now) => { const copy = { ...now }; delete copy[layoutOfFocus]; return copy })
    else if (sel === 'STROKE') setLook((now) => ({ ...now, weight: undefined, soft: undefined }))
    else setLook((now) => ({ ...now, frame: undefined, tracking: undefined }))
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
      <div className={styles.line} data-testid="mold-line">
        {chars.map((char, at) => char === ' '
          ? <span key={at} className={styles.space} />
          : <Pressable key={`${sentence}-${at}`} className={styles.lineChar} data-on={(step === 'mold' && at === focusIndex) || undefined} onClick={() => { setFocusAt(at); setStep('mold') }} aria-label={`${char} 크게 빚기`} data-testid={`mold-pick-${at}`}>
            <MoldGlyph char={char} size={42} edits={lineEdits} look={lineLook} drawn={lineDrawn} testId={`mold-char-${at}`} weightCap={weightCap} onCap={compare ? undefined : capReporters[at]} />
          </Pressable>)}
      </div>
      <div className={styles.lineActions}>
        <Button variant="ghost" size="sm" onClick={roll} data-testid="mold-dice"><Dices aria-hidden="true" />다른 문장</Button>
        <Button variant="chip" size="chip-sm" aria-pressed={compare} disabled={changed === 0}
          onPointerDown={() => setCompare(true)} onPointerUp={() => setCompare(false)} onPointerLeave={() => setCompare(false)} onPointerCancel={() => setCompare(false)}
          data-testid="mold-compare">{compare ? '처음 모습' : '누르는 동안 처음과 견주기'}</Button>
      </div>
    </section>

    {step === 'draw' && <DrawStep raws={raws} setRaws={setRaws} stems={stems} onDone={() => setStep('mold')} />}
    {step === 'mold' && <>
      <SimsStep char={focusChar} drawn={drawn} edits={edits} setEdits={setEdits} look={look} setLook={setLook} weightCap={weightCap} sel={sel} setSel={setSel} onBegin={remember} />
      <div className={styles.moldActions}>
        <Button variant="outline" size="sm" onClick={undo} disabled={!history.length} data-testid="mold-undo"><Undo2 aria-hidden="true" />되돌리기</Button>
        <Button variant="outline" size="sm" onClick={resetRegion} disabled={!sel} data-testid="mold-reset-region"><RotateCcw aria-hidden="true" />부위 처음대로</Button>
      </div>
    </>}

    {changed > 0 && <Button variant="ghost" size="sm" className={styles.center} onClick={() => { remember(); setEdits({}); setLook({}); setRaws({}); setStep('draw') }} data-testid="mold-reset-all"><RotateCcw aria-hidden="true" />모두 처음대로</Button>}
  </main>
}
