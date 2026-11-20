import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react'
import { Check, ChevronRight, Dices, RotateCcw } from 'lucide-react'
import { SvgRenderer } from '../src/renderers/SvgRenderer'
import { resolveGlyphInkPrimitives } from '../src/services/glyphInkResolver'
import type { PenPoint } from '../src/services/penStrokeFit'
import { useEffectiveGlobalStyle } from '../src/stores/globalStyleStore'
import { useJamoStore } from '../src/stores/jamoStore'
import { mergePadding, useLayoutStore } from '../src/stores/layoutStore'
import { propagatedJungseong } from '../src/stores/stemMasterStore'
import type { DecomposedSyllable, JamoData, LayoutType, Part, ResolvedStrokeInkSource } from '../src/types'
import { weightToMultiplier } from '../src/utils/globalStyleUtils'
import { decomposeSyllable } from '../src/utils/hangulUtils'
import { pointsToSvgD } from '../src/utils/pathUtils'
import { Badge } from './components/ui/badge'
import { Button } from './components/ui/button'
import { ChoiceGroup, ChoiceItem } from './components/ui/choice-group'
import { Pressable } from './components/ui/pressable'
import { EDIT_COLOR } from './editColors'
import { BIG, bigBoxes, gapCapMultiplier, bigText, breathOf, dragValue, groupOfPart, GROUPS, groupsOfSyllable, inSafe, moldBoxes, partAt, positionOf, presetOf, scaledWeight, stanceName, valueText, type BigKey, type BigValues, type GapStroke, type GroupId, type MoldValues, type Preset, type Range } from './moldLab'
import { useContextPlacement } from './notoModel'
import { SAMPLE_SENTENCES } from './sampleSentences'
import { consonantBoxesOf, consonantShapesOf, drawnStem, LAYOUTS, mastersOf, shapeConsonants, STEMS, stemInfo, type DrawnStem, type StemKind } from './strokeLab'
import styles from './MoldLabPage.module.css'

/**
 * 빚기 시험판(학습 프로토타입). 세 단계를 한 화면에서 오간다.
 * 1) 긋기 — 줄기 여섯을 한 번씩 긋는다(획 긋기 시험판과 같은 엔진 `strokeLab.ts`).
 * 2) 빚기 — 내 선 위에서 글줄 전체를 바꾸는 큰 손잡이 셋(크기 · 틀 · 숨). 폭은 한계선 가까이까지.
 * 3) 더 다듬기 — 글자의 어디를 잡았는지로 갈래를 정하고(홀자 → 홀자 갈래, 첫닿자 · 받침 → 짜임) 좁게 · 보통 · 넓게를 고른 뒤 끌어서 다듬는다.
 * 저장하지 않고 제품 값(자모 · 배치)도 안 바꾼다. 계산은 `moldLab.ts`. 기획: 고양이 `학습-단계-뼈대-2026-11-20.md` 빚기 절들.
 */

const FIRST_SENTENCE = '아버지가 바다 너머 저기 산다'
type Step = 'draw' | 'mold' | 'refine'
const STEP_NAMES: Record<Step, string> = { draw: '긋기', mold: '빚기', refine: '더 다듬기' }
const STEP_ORDER: readonly Step[] = ['draw', 'mold', 'refine']

interface Pick { group: GroupId; char: string }
/** 그은 줄기를 자모에 입힌 것. 닿자는 짜임마다 칸 비율이 달라 짜임별로 따로. */
interface Drawn {
  jungseong?: Readonly<Record<string, JamoData>>
  consonants: Record<LayoutType, { choseong: Record<string, JamoData>; jongseong: Record<string, JamoData> }>
}

/** 이 글자의 부위가 고른 갈래에 드는가(색 칠하기). */
function partInGroup(part: Part, syllable: DecomposedSyllable, group: GroupId | undefined): boolean {
  if (!group) return false
  return groupOfPart(part === 'JU_H' || part === 'JU_V' ? 'JU' : part, syllable.layoutType, syllable.jungseong?.char) === group
}

/**
 * 빚은 글자 하나. `AppGlyph`와 같은 길(자모 + 칸 해석 + 전역 스타일)로 상자를 풀고, 그은 줄기 · 큰 빚기 · 갈래 값을 차례로 입혀 그린다.
 * 누르면 누른 자리의 부위로 갈래를 알린다.
 */
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

function MoldGlyph({ char, size, values, big, drawn, highlight, onPick, testId, weightCap = Infinity, onCap }: { char: string; size: number; values: MoldValues; big: BigValues; drawn?: Drawn; highlight?: GroupId; onPick?: (pick: Pick) => void; testId?: string; weightCap?: number; onCap?: (ratio: number) => void }) {
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
  const breath = breathOf(big.breath)
  const padding = mergePadding(globalPadding, paddingOverrides[syllable.layoutType])
  const schema = { ...schemas[syllable.layoutType], padding, designBodyPadding: padding }
  // 상자는 처음 굵기로 푼다(굵기를 바꿔도 상자가 따라 흔들리지 않게).
  const { placement } = useContextPlacement(syllable, schema, effective)
  const vowelChar = syllable.jungseong?.char
  const boxes = useMemo(() => placement.kind === 'boxes' ? moldBoxes(bigBoxes(placement.boxes, big), syllable.layoutType, vowelChar, values) : undefined, [placement, big, syllable.layoutType, vowelChar, values])

  // 획 사이 최소 틈: 이 글자가 버틸 수 있는 굵기 비율을 재서 올린다. 글줄은 가장 작은 비율을 다 같이 쓴다.
  const capRatio = useMemo(() => {
    if (!onCap || placement.kind !== 'boxes' || !boxes) return Infinity
    const ref = gapStrokesOf(syllable, placement, effective.linecap, effective.linejoin)
    const cur = gapStrokesOf(syllable, { kind: 'boxes', boxes }, effective.linecap, effective.linejoin)
    const capM = gapCapMultiplier(ref, cur, weightToMultiplier(effective.weight))
    return capM === Infinity ? Infinity : weightUnder(capM, 100) / effective.weight
  }, [onCap, placement, boxes, syllable, effective])
  useEffect(() => { onCap?.(capRatio) }, [onCap, capRatio])
  // 틈이 바닥 아래로 가지 않는 데까지만 굵게 한다. 크기 · 틀로 칸이 좁아져 처음 굵기로도 붙으면 그만큼 가늘게 한다.
  const ratio = Math.min(breath.weight, weightCap)
  const globalStyle = useMemo(() => ratio === 1 ? effective : { ...effective, weight: scaledWeight(effective.weight, ratio) }, [effective, ratio])
  const colorOf = useCallback((source: ResolvedStrokeInkSource) => partInGroup(source.part, syllable, highlight) ? EDIT_COLOR.editSelect : undefined, [syllable, highlight])

  // 틀이 좁아지면 글자 칸도 같이 좁힌다(글자 사이가 그대로 남지 않게). 숨은 글자 사이를 더하거나 뺀다.
  const frame = big.frame ?? 1
  const slot = { width: size * frame + size * breath.tracking, marginInline: 0 }

  const pick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    if (!onPick || !boxes) return
    const svg = event.currentTarget.querySelector('svg')
    const rect = (svg ?? event.currentTarget).getBoundingClientRect()
    // 글자 칸은 가로 0–1, 세로도 같은 눈금(높이 비율만 다르다).
    const x = (event.clientX - rect.left) / rect.width
    const y = (event.clientY - rect.top) / rect.width
    const present = { CH: !!syllable.choseong, JU: !!syllable.jungseong, JU_H: !!syllable.jungseong, JU_V: !!syllable.jungseong, JO: !!syllable.jongseong }
    const part = partAt(boxes, x, y, present)
    const group = part && groupOfPart(part === 'JU_H' || part === 'JU_V' ? 'JU' : part, syllable.layoutType, vowelChar)
    if (group) onPick({ group, char })
  }

  const glyph = <SvgRenderer
    syllable={syllable}
    schema={placement.kind === 'schema' ? placement.schema : undefined}
    boxes={boxes}
    size={size}
    globalStyle={globalStyle}
    overflow="visible"
    clipGlyphs={false}
    strokeColorOf={highlight ? colorOf : undefined}
  />
  if (!onPick) return <span className={styles.glyph} style={slot} data-testid={testId}>{glyph}</span>
  return <Pressable className={styles.glyph} style={slot} onClick={pick} aria-label={`${char} 잡기`} data-testid={testId}>{glyph}</Pressable>
}

/** 안전선 · 한계선 띠. 끌어서 값을 다듬는다. 양 끝은 벽(한계선). */
function Ruler({ range, value, onChange, left, right, testId }: { range: Range; value: number | undefined; onChange: (value: number) => void; left?: string; right?: string; testId: string }) {
  const drag = useRef<{ x: number; start: number } | null>(null)
  const current = value ?? range.engine
  const at = (v: number) => `${(positionOf(range, v) * 100).toFixed(2)}%`
  return <div className={styles.rulerWrap}>
    <div
      className={styles.ruler}
      data-testid={testId}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId)
        // 띠를 누른 자리로 바로 옮기고, 거기서부터 끈다.
        const rect = event.currentTarget.getBoundingClientRect()
        const start = range.wall[0] + (event.clientX - rect.left) / rect.width * (range.wall[1] - range.wall[0])
        drag.current = { x: event.clientX, start }
        onChange(dragValue(range, start, 0, rect.width))
      }}
      onPointerMove={(event) => {
        if (!drag.current) return
        onChange(dragValue(range, drag.current.start, event.clientX - drag.current.x, event.currentTarget.getBoundingClientRect().width))
      }}
      onPointerUp={() => { drag.current = null }}
      onPointerCancel={() => { drag.current = null }}
    >
      <span className={styles.rulerTrack} />
      <span className={styles.rulerSafe} style={{ left: at(range.safe[0]), width: `calc(${at(range.safe[1])} - ${at(range.safe[0])})` }} />
      <span className={styles.rulerEngine} style={{ left: at(range.engine) }} />
      <span className={styles.rulerThumb} style={{ left: at(current) }} data-out={!inSafe(range, current) || undefined} />
    </div>
    <div className={styles.rulerEnds}><span>{left ?? '벽'}</span><span>{right ?? '벽'}</span></div>
  </div>
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

/** 2단계: 큰 손잡이 셋. */
function BigStep({ big, setBig, weightCap, onNext }: { big: BigValues; setBig: (key: BigKey, value: number | undefined) => void; weightCap: number; onNext: () => void }) {
  const wanted = breathOf(big.breath).weight
  const held = weightCap < wanted
  return <section className={styles.panel} aria-label="빚기">
    {BIG.map((info) => {
      const value = big[info.key]
      return <div key={info.key} className={styles.big} data-testid={`mold-big-${info.key}`}>
        <div className={styles.bigHead}>
          <h2>{info.name}</h2>
          <span data-out={value !== undefined && !inSafe(info.range, value) || undefined} data-testid={`mold-big-${info.key}-value`}>{bigText(info, value, info.key === 'breath' ? weightCap : undefined)}</span>
          {value !== undefined && <Button variant="ghost" size="chip-sm" onClick={() => setBig(info.key, undefined)} aria-label={`${info.name} 처음대로`}><RotateCcw aria-hidden="true" /></Button>}
        </div>
        <Ruler range={info.range} value={value} onChange={(next) => setBig(info.key, next)} left={info.left} right={info.right} testId={`mold-big-${info.key}-ruler`} />
        <p className={styles.note}>{info.what}</p>
        {info.key === 'breath' && held && <p className={styles.hold} data-testid="mold-gap-hold">{weightCap < 1 ? `칸이 좁아져 획 사이 틈을 지키려고 굵기를 ×${weightCap.toFixed(2)}로 가늘게 했어요.` : `획 사이 틈을 지키려고 굵기 ×${weightCap.toFixed(2)}에서 멈췄어요.`} 틈은 그 굵기에서 기대하는 틈의 70%까지예요.</p>}
      </div>
    })}
    <p className={styles.note}>가운데 초록 칸은 보통 폭, 양 끝은 넘지 못하는 벽이에요. 셋 다 아직 폰트에서 잰 폭이 없어 임시값이에요.</p>
    <Button size="block" onClick={onNext} data-testid="mold-to-refine">더 다듬기<ChevronRight aria-hidden="true" /></Button>
  </section>
}

export function MoldLabPage() {
  const [step, setStep] = useState<Step>('draw')
  // `?s=문장`으로 처음 문장을 정할 수 있다(확인용).
  const [sentence, setSentence] = useState(() => new URLSearchParams(window.location.search).get('s')?.trim() || FIRST_SENTENCE)
  const [raws, setRaws] = useState<Partial<Record<StemKind, PenPoint[]>>>({})
  const [big, setBigValues] = useState<BigValues>({})
  const [pick, setPick] = useState<Pick | null>(null)
  const [values, setValues] = useState<MoldValues>({})
  const [compare, setCompare] = useState(false)
  const [seed, setSeed] = useState(0)
  // 글자마다 버틸 수 있는 굵기 비율(획 사이 최소 틈). 글줄은 가장 작은 것을 다 같이 쓴다.
  const [caps, setCaps] = useState<Record<string, number>>({})
  const capReporters = useMemo(() => {
    const out: Record<number, (ratio: number) => void> = {}
    ;[...sentence].forEach((_, at) => { out[at] = (ratio: number) => setCaps((all) => (all[`${sentence}-${at}`] === ratio ? all : { ...all, [`${sentence}-${at}`]: ratio })) })
    return out
  }, [sentence])
  const weightCap = Math.min(Infinity, ...[...sentence].map((char, at) => (char === ' ' ? Infinity : caps[`${sentence}-${at}`] ?? Infinity)))
  const focusDrag = useRef<{ x: number; start: number; width: number } | null>(null)

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

  const group = step === 'refine' ? pick?.group : undefined
  const info = group ? GROUPS[group] : undefined
  const range = info?.range ?? null
  const value = group ? values[group] : undefined

  const groupsOf = useCallback((char: string) => {
    const syllable = decomposeSyllable(char, choseong, jungseong, jongseong)
    return groupsOfSyllable(syllable.layoutType, syllable.jungseong?.char)
  }, [choseong, jungseong, jongseong])

  // 주사위: 같은 갈래 글자를 예시 문장들에서 모아 몇 개 뽑는다.
  const siblings = useMemo(() => {
    if (!group) return []
    const pool = [...new Set(SAMPLE_SENTENCES.join('').replace(/\s/g, ''))].filter((char) => groupsOf(char).includes(group))
    const out: string[] = []
    let s = seed * 7919 + 17
    while (out.length < Math.min(6, pool.length)) {
      s = (s * 1103515245 + 12345) % 2147483648
      const char = pool[s % pool.length]
      if (!out.includes(char)) out.push(char)
    }
    return out
  }, [group, groupsOf, seed])

  const roll = () => {
    setSeed((now) => now + 1)
    const candidates = group ? SAMPLE_SENTENCES.filter((line) => [...line].some((char) => char !== ' ' && groupsOf(char).includes(group))) : SAMPLE_SENTENCES
    const others = candidates.filter((line) => line !== sentence)
    if (others.length) setSentence(others[Math.floor(Math.random() * others.length)])
  }

  const setBig = (key: BigKey, next: number | undefined) => setBigValues((now) => {
    const copy = { ...now }
    if (next === undefined) delete copy[key]
    else copy[key] = next
    return copy
  })
  const setValue = (next: number) => { if (group) setValues((now) => ({ ...now, [group]: next })) }
  const resetGroup = () => { if (group) setValues((now) => { const copy = { ...now }; delete copy[group]; return copy }) }

  const NONE: MoldValues = useMemo(() => ({}), [])
  const NO_BIG: BigValues = useMemo(() => ({}), [])
  const lineValues = compare ? NONE : values
  const lineBig = compare ? NO_BIG : big
  const lineDrawn = compare ? undefined : drawn
  const stepIndex = STEP_ORDER.indexOf(step)
  const changed = Object.keys(values).length + Object.keys(big).length + Object.keys(raws).filter((key) => raws[key as StemKind]).length

  return <main className={styles.page}>
    <header className={styles.header}>
      <span className={styles.eyebrow}>빚기 시험판 · {stepIndex + 1}/{STEP_ORDER.length} {STEP_NAMES[step]}</span>
      <ChoiceGroup variant="segment" aria-label="단계" className={styles.steps}>
        {STEP_ORDER.map((key, at) => <ChoiceItem key={key} checked={step === key} onClick={() => setStep(key)} data-testid={`mold-step-${key}`}>{at + 1} {STEP_NAMES[key]}</ChoiceItem>)}
      </ChoiceGroup>
    </header>

    <section className={styles.card} aria-label="예시 글줄">
      <div className={styles.line} data-testid="mold-line">
        {[...sentence].map((char, at) => char === ' '
          ? <span key={at} className={styles.space} />
          : <MoldGlyph key={`${sentence}-${at}`} char={char} size={42} values={lineValues} big={lineBig} drawn={lineDrawn} highlight={group} onPick={step === 'refine' ? setPick : undefined} testId={`mold-char-${at}`} weightCap={weightCap} onCap={compare ? undefined : capReporters[at]} />)}
      </div>
      <div className={styles.lineActions}>
        <Button variant="ghost" size="sm" onClick={roll} data-testid="mold-dice"><Dices aria-hidden="true" />다른 문장</Button>
        <Button variant="chip" size="chip-sm" aria-pressed={compare} disabled={changed === 0}
          onPointerDown={() => setCompare(true)} onPointerUp={() => setCompare(false)} onPointerLeave={() => setCompare(false)} onPointerCancel={() => setCompare(false)}
          data-testid="mold-compare">{compare ? '처음 모습' : '누르는 동안 처음과 견주기'}</Button>
      </div>
    </section>

    {step === 'draw' && <DrawStep raws={raws} setRaws={setRaws} stems={stems} onDone={() => setStep('mold')} />}
    {step === 'mold' && <BigStep big={big} setBig={setBig} weightCap={weightCap} onNext={() => setStep('refine')} />}

    {step === 'refine' && (info && pick ? <section className={styles.panel} aria-label="갈래" data-testid="mold-panel">
      <nav className={styles.crumbs} aria-label="범위">
        <span>전체</span>
        <ChevronRight aria-hidden="true" />
        <span data-on={info.layer === '짜임' || undefined}>{stanceName(info.stance)}</span>
        {info.layer === '갈래' && <><ChevronRight aria-hidden="true" /><span data-on>{info.name.split(' · ')[1]}</span></>}
      </nav>
      <div className={styles.groupHead}>
        <div>
          <h2 data-testid="mold-group-name">{info.name}</h2>
          <span className={styles.members}>{info.members}{info.handle ? ` · ${info.handleName}` : ''}</span>
        </div>
        <Badge variant={info.source === 'measured' ? 'default' : 'muted'} data-testid="mold-source">{info.source === 'measured' ? '실측' : info.source === 'none' ? '손잡이 없음' : '임시값'}</Badge>
      </div>

      <div className={styles.focusRow}>
        <div
          className={styles.focus}
          data-testid="mold-focus"
          onPointerDown={(event) => {
            if (!range) return
            event.currentTarget.setPointerCapture(event.pointerId)
            focusDrag.current = { x: event.clientX, start: value ?? range.engine, width: event.currentTarget.getBoundingClientRect().width }
          }}
          onPointerMove={(event) => { if (range && focusDrag.current) setValue(dragValue(range, focusDrag.current.start, event.clientX - focusDrag.current.x, focusDrag.current.width * 1.5)) }}
          onPointerUp={() => { focusDrag.current = null }}
          onPointerCancel={() => { focusDrag.current = null }}
        >
          <MoldGlyph char={pick.char} size={128} values={values} big={big} drawn={drawn} highlight={group} weightCap={weightCap} />
          {range && <span className={styles.focusHint}>← 좌우로 끌기 →</span>}
        </div>
        <div className={styles.siblings}>
          <span className={styles.siblingsLabel}>같은 갈래</span>
          <div className={styles.siblingGrid} data-testid="mold-siblings">
            {siblings.map((char) => <MoldGlyph key={`${seed}-${char}`} char={char} size={36} values={values} big={big} drawn={drawn} highlight={group} onPick={setPick} weightCap={weightCap} />)}
          </div>
          <Button variant="outline" size="chip-sm" onClick={() => setSeed((now) => now + 1)} data-testid="mold-sibling-dice"><Dices aria-hidden="true" />주사위</Button>
        </div>
      </div>

      {range ? <>
        <ChoiceGroup variant="segment" aria-label="프리셋" className={styles.presets}>
          {(Object.keys(range.presets) as Preset[]).map((key) => <ChoiceItem key={key} checked={presetOf(range, value) === key} onClick={() => setValue(range.presets[key])} data-testid={`mold-preset-${key}`}>{info.presetNames[key]}</ChoiceItem>)}
        </ChoiceGroup>
        <Ruler range={range} value={value} onChange={setValue} testId="mold-ruler" />
        <div className={styles.readout}>
          <strong data-testid="mold-value">{value === undefined ? '처음 값' : presetOf(range, value) ? info.presetNames[presetOf(range, value)!] : valueText(info, value)}</strong>
          <span data-out={value !== undefined && !inSafe(range, value) || undefined}>{value === undefined ? '아직 안 바꿈' : inSafe(range, value) ? '안전선 안' : '안전선 밖 · 개성 (벽까지)'}</span>
        </div>
        <p className={styles.note}>{info.note}</p>
        <Button variant="outline" size="block" onClick={resetGroup} disabled={value === undefined} data-testid="mold-reset"><RotateCcw aria-hidden="true" />이 갈래 처음대로</Button>
      </> : <p className={styles.note}>{info.note}</p>}
    </section> : <p className={styles.ask}>글줄에서 글자 한 곳(홀자 · 첫닿자 · 받침)을 눌러 보세요. 같은 갈래 글자가 함께 바뀌어요.</p>)}

    {changed > 0 && <Button variant="ghost" size="sm" className={styles.center} onClick={() => { setValues({}); setBigValues({}); setRaws({}); setStep('draw') }} data-testid="mold-reset-all"><RotateCcw aria-hidden="true" />모두 처음대로</Button>}
  </main>
}
