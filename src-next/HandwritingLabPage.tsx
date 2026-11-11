import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { Dices, Eraser, PenLine, RotateCcw } from 'lucide-react'
import { readSyllable } from '../src/services/handwritingRead'
import type { SyllableRead } from '../src/services/handwritingRead'
import {
  applyChoices, chartStats, CHART_SYLLABLES, emptyBank, exampleOf, FIRST_TYPES, gather, hasSlot, layoutGain, LAYOUT_KEYS, newJamoIn, phaseOf, pickSentence,
  placeSyllable, planSyllable, progressOf, recommendSentences, SEED_SENTENCE, sentenceFor, TYPE_NAME,
} from '../src/services/handwritingBank'
import type { Bank, CardChoices, Gathered, JamoChoice, LayoutKey, SampleType, TypedSample } from '../src/services/handwritingBank'
import { composeChar, HANDWRITING_THICKNESS } from '../src/services/handwritingRead'
import { fitPenStroke, PEN_FIT_EPSILON } from '../src/services/penStrokeFit'
import { strokeToRenderInkGroups } from '../src/services/strokeRenderGeometry'
import { brushInkGroupsToSvgPaths } from '../src/services/brushGeometry'
import { miterLimitOf } from '../src/services/strokeJoin'
import { weightToMultiplier } from '../src/utils/globalStyleUtils'
import type { JamoData, StrokeDataV2 } from '../src/types'
import type { Slot } from '../src/services/handwritingRead'
import { CHOSEONG_LIST, JONGSEONG_LIST, JUNGSEONG_LIST } from '../src/data/Hangul'
import type { PenPoint } from '../src/services/penStrokeFit'
import { getBaseJamo, useJamoStore } from '../src/stores/jamoStore'
import { mergePadding, useLayoutStore } from '../src/stores/layoutStore'
import { useContextPlacement } from './notoModel'
import { DEFAULT_STYLE } from '../src/stores/globalStyleStore'
import type { GlobalStyle } from '../src/stores/globalStyleStore'
import { SvgRenderer } from '../src/renderers/SvgRenderer'
import type { BoxConfig, Part } from '../src/types'
import { decomposeSyllable } from '../src/utils/hangulUtils'
import { pointsToSvgD } from '../src/utils/pathUtils'
import { Button } from './components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from './components/ui/dialog'
import { Input } from './components/ui/input'
import { Field, RangeBar } from './components/ui/range'
import { Switch } from './components/ui/switch'
import { EDIT_COLOR } from './editColors'
import { HandwritingAnatomy, jamoScopeKeys, sampleChar } from './HandwritingAnatomy'
import { JamoGlyph } from './DashboardLabPage'
import { ChoiceGroup, ChoiceItem } from './components/ui/choice-group'
import { Pressable } from './components/ui/pressable'
import { beakResolverOf, buildPartIndexes, cutResolverOf, kindOf, masterResolverOf, loadPartRules, newRule, PartRuleDialog, RULE_TARGET, ruleReach, ruleSentence, savePartRules, sortRules, stemsOf } from './HandwritingPartRules'
import { usePartRuleInk } from './HandwritingStemMaster'
import type { StemMasterResolver } from './HandwritingStemMaster'
import type { CutAngleResolver } from './HandwritingTailCut'
import type { PartRule } from './HandwritingPartRules'
import { HandwritingPartDictionary } from './HandwritingPartDictionary'
import ruleStyles from './HandwritingPartRules.module.css'
import type { GroupBeakResolver } from '../src/stores/jamoGroupStore'
import type { PartScope, Slot as AnatomySlot } from './HandwritingAnatomy'
import styles from './HandwritingLabPage.module.css'

/**
 * 손글씨 수집 실험실(플랜 `2026-11-09_손글씨-수집-실험실.md`). 시안(구간별 보선 결속)의 수집 흐름을 제품 획 모델과 렌더러 위에 올린 것.
 * 문장을 칸에 쓰면 칸마다 정답 글자로 자리를 묶어 읽고(`readSyllable`), 확인 카드에서 ㅇㅋ한 것만 은행(`handwritingBank`)에 들어간다.
 * 1단계는 씨앗 문장으로 배치 6종을 잡고, 2단계는 주사위가 새 자모가 많은 문장을 준다. 왼쪽 글자표 2,350자는 은행만으로 제품 렌더러(`SvgRenderer`)가 그린다.
 * 저장은 브라우저(localStorage)뿐. 제품 화면 · 프리셋 · 저장 데이터는 건드리지 않는다.
 */

const STORAGE_KEY = 'handwriting-lab-v1'
const CELL = 100
const MAX_CELLS = 15
const READ_DELAY = 900
const CHART_COLS = 10
const CHART_CELL = 40
/** 확인 카드 · 자모 고르기의 세 컬럼. */
const JAMO_COLUMNS: readonly { name: string; slot: Slot; list: readonly string[] }[] = [
  { name: '첫닿자', slot: 0, list: CHOSEONG_LIST },
  { name: '홀자', slot: 1, list: JUNGSEONG_LIST },
  { name: '받침', slot: 2, list: (JONGSEONG_LIST as readonly string[]).filter(Boolean) },
]
/** 자모 하나만 고칠 때 쓸 본보기 글자. 홀자는 ㅇ 옆에. */
const exampleFor = (L: string, slot: Slot, type: SampleType): string | null => slot === 1 ? composeChar('ㅇ', L, null) : exampleOf(L, slot === 2 ? 'J' : type)

type CellRaws = PenPoint[][]

/** 펜을 뗀 획마다 한 번만 벡터로 맞춘다. 읽기(`readSyllable`)와 같은 허용오차 · 굵기. */
const fitCache = new WeakMap<PenPoint[], StrokeDataV2 | null>()
const fittedOf = (raw: PenPoint[]): StrokeDataV2 | null => {
  if (!fitCache.has(raw)) fitCache.set(raw, fitPenStroke(raw, { epsilon: PEN_FIT_EPSILON, thickness: HANDWRITING_THICKNESS })?.stroke ?? null)
  return fitCache.get(raw) ?? null
}
const UNIT_BOX = { x: 0, y: 0, width: 1, height: 1 }

const lettersOf = (text: string) => [...text.replace(/\s+/g, '')].filter((ch) => /[가-힣]/.test(ch)).slice(0, MAX_CELLS)
const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

function loadBank(): Bank {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyBank()
    const parsed = JSON.parse(raw) as Partial<Bank>
    return { lay: parsed.lay ?? {}, jamo: parsed.jamo ?? {}, history: parsed.history ?? [] }
  } catch { return emptyBank() }
}
function saveBank(bank: Bank) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(bank)) } catch { /* 저장 못 해도 화면은 돈다 */ } }

const rawPath = (points: PenPoint[], ox: number, oy: number) => points.map((p, i) => `${i ? 'L' : 'M'}${(ox + p.x * CELL).toFixed(1)} ${(oy + p.y * CELL).toFixed(1)}`).join(' ')

/** 자모 견본 하나의 작은 그림. 섞임홀자는 가로부 · 세로부를 제 자리에. */
const SampleThumb = memo(function SampleThumb({ sample, size = 40, color = EDIT_COLOR.foreground }: { sample: TypedSample; size?: number; color?: string }) {
  const V = 100, pad = 14
  const a = Math.min(4, Math.max(0.25, sample.asp))
  let w = V - 2 * pad, h = V - 2 * pad
  if (a > 1) h = w / a; else w = h * a
  const box: BoxConfig = { x: (V - w) / 2 / V, y: (V - h) / 2 / V, width: w / V, height: h / V }
  const sub = (r: { x0: number; y0: number; x1: number; y1: number }): BoxConfig => ({ x: box.x + r.x0 * box.width, y: box.y + r.y0 * box.height, width: (r.x1 - r.x0) * box.width, height: (r.y1 - r.y0) * box.height })
  const groups: { strokes: typeof sample.strokes; box: BoxConfig }[] = sample.mixedBoxes
    ? [{ strokes: sample.horizontalStrokes ?? [], box: sub(sample.mixedBoxes.JU_H) }, { strokes: sample.verticalStrokes ?? [], box: sub(sample.mixedBoxes.JU_V) }]
    : [{ strokes: sample.strokes, box }]
  return <svg viewBox={`0 0 ${V} ${V}`} width={size} height={size} className={styles.thumb} aria-hidden>
    {groups.flatMap((g, gi) => g.strokes.map((s, i) => <path key={`${gi}-${i}`} d={pointsToSvgD(s.points, s.closed, g.box, V)} fill="none" stroke={color} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />))}
  </svg>
})

/** 은행으로 글자 하나를 제품 렌더러로 그린다. 견본이 빈 자리는 점선 상자, 배치가 없으면 글자만 연하게. */
const BankGlyph = memo(function BankGlyph({ bank, char, size, style, override, faintMissing = true }: { bank: Bank; char: string; size: number; style: GlobalStyle; override?: Record<string, TypedSample>; faintMissing?: boolean }) {
  const placed = useMemo(() => placeSyllable(bank, char, override), [bank, char, override])
  const syllable = useMemo(() => placed ? decomposeSyllable(char, placed.choseongMap, placed.jungseongMap, placed.jongseongMap) : null, [placed, char])
  if (!placed || !syllable) return <span className={styles.emptyGlyph} style={{ width: size, height: size, fontSize: size * 0.4 }}>{char}</span>
  const partial = placed.plan.partial
  const V = 100
  const missing = Object.entries(placed.missingBoxes) as [Part, BoxConfig][]
  return <SvgRenderer syllable={syllable} boxes={placed.boxes} size={size} globalStyle={style} fillColor={partial && faintMissing ? EDIT_COLOR.editGuide : EDIT_COLOR.foreground}
    underlay={missing.length ? missing.map(([part, b]) => <rect key={part} x={b.x * V} y={b.y * V} width={b.width * V} height={b.height * V} fill="none" stroke={EDIT_COLOR.text5} strokeWidth={1.2} strokeDasharray="3 2" rx={1} />) : undefined} />
})

/** 제품 프리셋(자모 저장소 + 배치)으로 글자 하나. AppGlyph와 같지만 전역 스타일은 실험실 슬라이더 값을 받는다 — 은행이 비어도 스타일 변화를 2,350자로 본다. */
const PresetGlyph = memo(function PresetGlyph({ char, size, style, groupBeakOf, cutAngleOf, masterOf }: { char: string; size: number; style: GlobalStyle; groupBeakOf?: GroupBeakResolver; cutAngleOf?: CutAngleResolver | null; masterOf?: StemMasterResolver | null }) {
  const choseong = useJamoStore((state) => state.choseong)
  const jungseong = useJamoStore((state) => state.jungseong)
  const jongseong = useJamoStore((state) => state.jongseong)
  const schemas = useLayoutStore((state) => state.layoutSchemas)
  const globalPadding = useLayoutStore((state) => state.globalPadding)
  const paddingOverrides = useLayoutStore((state) => state.paddingOverrides)
  const syllable = useMemo(() => decomposeSyllable(char, choseong, jungseong, jongseong), [char, choseong, jungseong, jongseong])
  const schema = useMemo(() => {
    const padding = mergePadding(globalPadding, paddingOverrides[syllable.layoutType])
    return { ...schemas[syllable.layoutType], padding, designBodyPadding: padding }
  }, [schemas, globalPadding, paddingOverrides, syllable.layoutType])
  const { placement } = useContextPlacement(syllable, schema, style)
  const ruleInk = usePartRuleInk(syllable, placement, style, cutAngleOf, masterOf)
  return <SvgRenderer syllable={syllable} schema={placement.kind === 'schema' ? placement.schema : undefined} boxes={placement.kind === 'boxes' ? placement.boxes : undefined} size={size} globalStyle={style} overflow="visible" clipGlyphs={false} groupBeakOf={groupBeakOf} partStyles={ruleInk.partStyles}>{ruleInk.overlay()}</SvgRenderer>
})

/** 글자표 줄들. 확인 카드를 만질 때 다시 그리지 않게 따로 묶는다(iPad 개발 서버에서 토글이 느렸다). */
const ChartRows = memo(function ChartRows({ bank, style, picked, highlight, firstRow, lastRow, onPick, source, groupBeakOf, cutAngleOf, masterOf }: { bank: Bank; style: GlobalStyle; picked: string | null; highlight: Set<string> | null; firstRow: number; lastRow: number; onPick: (ch: string) => void; source: 'bank' | 'preset'; groupBeakOf?: GroupBeakResolver; cutAngleOf?: CutAngleResolver | null; masterOf?: StemMasterResolver | null }) {
  const chartRows = Math.ceil(CHART_SYLLABLES.length / CHART_COLS)
  return <div style={{ height: chartRows * CHART_CELL, position: 'relative' }}>
    {Array.from({ length: Math.max(0, lastRow - firstRow) }, (_, k) => firstRow + k).map((row) => <div key={row} className={styles.chartRow} style={{ top: row * CHART_CELL, height: CHART_CELL }}>
      {CHART_SYLLABLES.slice(row * CHART_COLS, row * CHART_COLS + CHART_COLS).map((ch) => <button key={ch} type="button" className={`${styles.chartCell}${picked === ch ? ` ${styles.chartPicked}` : ''}${highlight?.has(ch) ? ` ${styles.chartNew}` : ''}`} style={{ width: CHART_CELL, height: CHART_CELL }} onClick={() => onPick(ch)} title={ch}>
        {source === 'preset' ? <PresetGlyph char={ch} size={CHART_CELL - 6} style={style} groupBeakOf={groupBeakOf} cutAngleOf={cutAngleOf} masterOf={masterOf} /> : <BankGlyph bank={bank} char={ch} size={CHART_CELL - 6} style={style} />}
      </button>)}
    </div>)}
  </div>
})

type CellState = 'none' | 'have' | 'new' | 'skip' | 'dup' | 'dupOn'
interface CellInfo { state: CellState; sample?: TypedSample }

/** 첫닿자 · 홀자 · 받침 세 컬럼에 전체 자모를 깔고, 칸마다 상태를 보여 준다. 새 · 덮 칸은 손글씨 조각 그대로. */
function JamoGrid({ cellOf, onTap, focus }: { cellOf: (L: string, slot: Slot) => CellInfo; onTap: (L: string, slot: Slot) => void; focus?: { L: string; slot: Slot } | null }) {
  return <div className={styles.jcols}>
    {JAMO_COLUMNS.map((col) => <div key={col.name} className={styles.jcol}>
      <b>{col.name}</b>
      <div className={styles.jlist}>
        {col.list.map((L) => {
          const info = cellOf(L, col.slot)
          const focused = focus?.L === L && focus.slot === col.slot
          return <button key={L} type="button" className={`${styles.jcell} ${styles[`j_${info.state}`]}${focused ? ` ${styles.jfocus}` : ''}`} onClick={() => onTap(L, col.slot)} data-testid={`jamo-${col.slot}-${L}`} title={L}>
            {info.sample ? <SampleThumb sample={info.sample} size={30} /> : L}
            {(info.state === 'new' || info.state === 'skip') && <i className={styles.jbadge}>{info.state === 'new' ? '새' : '뺌'}</i>}
            {(info.state === 'dup' || info.state === 'dupOn') && <i className={styles.jbadge}>{info.state === 'dupOn' ? '✓' : '덮'}</i>}
          </button>
        })}
      </div>
    </div>)}
  </div>
}

/** 전 → 후 글자 한 쌍. */
function BeforeAfter({ before, after, char, style, size = 72, override, active }: { before: Bank | null; after: Bank; char: string; style: GlobalStyle; size?: number; override?: Record<string, TypedSample>; active?: 'before' | 'after' }) {
  // 처음 들어오는 것은 비교할 전이 없다 — 후 하나만
  if (!before) return <div className={styles.pair}><span className={styles.pairNew}><BankGlyph bank={after} char={char} size={size} style={style} override={override} faintMissing={false} /></span></div>
  return <div className={`${styles.pair}${active ? ` ${active === 'after' ? styles.pairAfter : styles.pairBefore}` : ''}`}>
    <span className={styles.pairOld}>{before ? <BankGlyph bank={before} char={char} size={size} style={style} faintMissing={false} /> : <span className={styles.emptyGlyph} style={{ width: size, height: size, fontSize: size * 0.4 }}>새</span>}</span>
    <span className={styles.pairArrow}>→</span>
    <span className={styles.pairNew}><BankGlyph bank={after} char={char} size={size} style={style} override={override} faintMissing={false} /></span>
  </div>
}

interface CardState { open: boolean; step: 1 | 2; then: 'roll' | null; gathered: Gathered; choices: CardChoices; focus: { L: string; slot: Slot } | null }

export function HandwritingLabPage() {
  const [bank, setBank] = useState<Bank>(loadBank)
  const [text, setText] = useState(SEED_SENTENCE)
  const [raws, setRaws] = useState<CellRaws[]>(() => Array.from({ length: MAX_CELLS }, () => []))
  const [current, setCurrent] = useState<{ cell: number; points: PenPoint[] } | null>(null)
  const [reads, setReads] = useState<(SyllableRead | null)[]>(() => Array(MAX_CELLS).fill(null))
  const [dirty, setDirty] = useState<Set<number>>(() => new Set())
  const [message, setMessage] = useState('씨앗 문장 아홉 자를 칸에 써 주세요. 여섯 가지 배치가 다 들어 있어요. 다 쓰고 확인 카드를 누르면 읽은 것을 보여 줘요.')
  const [card, setCard] = useState<CardState | null>(null)
  const [rewrite, setRewrite] = useState<{ L: string; type: SampleType } | null>(null)
  const [picker, setPicker] = useState<{ open: boolean; L: string | null; slot: Slot }>({ open: false, L: null, slot: 0 })
  const [weight, setWeight] = useState(400)
  const [roundJoins, setRoundJoins] = useState(false)
  /** 전역 둥글기 0~1(제품 strokeStyle.roundness). 끝 · 꺾임 모서리를 둥글기 × 반폭으로 굴린다. */
  const [roundness, setRoundness] = useState(0)
  /** 글자표를 은행으로 그릴지 제품 프리셋으로 그릴지. 프리셋이면 스타일 변화가 2,350자 전부에서 보인다. */
  const [chartSource, setChartSource] = useState<'bank' | 'preset'>('preset')
  /** 오른쪽: 고른 글자 해부(기본) · 손글씨 수집. */
  const [view, setView] = useState<'anatomy' | 'collect' | 'dictionary'>('anatomy')
  const [picked, setPicked] = useState<string | null>(null)
  const [highlight, setHighlight] = useState<Set<string> | null>(null)
  /** 해부 패널에서 고른 부위 묶음 — 글자표에 같은 묶음 글자를 칠한다. */
  const [partScope, setPartScope] = useState<PartScope | null>(null)
  /** 글자표 탭: 글자 2,350 또는 첫닿자 · 홀자 · 받침 자소 카드(앱 대시보드의 그 카드). */
  const [chartTab, setChartTab] = useState<'glyph' | AnatomySlot>('glyph')
  const [focusRequest, setFocusRequest] = useState<{ char: string; slot: AnatomySlot; at: number } | null>(null)
  const [focusSlot, setFocusSlot] = useState<AnatomySlot | null>(null)
  const pickJamo = (slot: AnatomySlot, ch: string) => {
    const sample = sampleChar(slot, ch)
    if (!sample) return
    setPicked(sample)
    setFocusRequest({ char: sample, slot, at: Date.now() })
  }
  const jamoCho = useJamoStore((state) => state.choseong)
  const jamoJung = useJamoStore((state) => state.jungseong)
  const jamoJong = useJamoStore((state) => state.jongseong)
  /** 부위 스타일 규칙(세로줄기 머리의 부리). 그릴 때만 입힌다. */
  const [partRules, setPartRules] = useState<PartRule[]>(loadPartRules)
  const [ruleDraft, setRuleDraft] = useState<{ rule: PartRule; isNew: boolean } | null>(null)
  const partIndexes = useMemo(() => buildPartIndexes({ CH: jamoCho, JU: jamoJung, JO: jamoJong }), [jamoCho, jamoJung, jamoJong])
  const ruleStems = useMemo(() => ({ beak: stemsOf(partIndexes.beak), cut: stemsOf(partIndexes.cut), master: stemsOf(partIndexes.master) }), [partIndexes])
  const sortedRules = useMemo(() => sortRules(partRules, partIndexes), [partRules, partIndexes])
  const ruleBeakOf = useMemo(() => beakResolverOf(sortedRules, partIndexes.beak), [sortedRules, partIndexes])
  const ruleCutOf = useMemo(() => cutResolverOf(sortedRules, partIndexes.cut), [sortedRules, partIndexes])
  const ruleMasterOf = useMemo(() => masterResolverOf(sortedRules, partIndexes.master), [sortedRules, partIndexes])
  const commitRules = (next: PartRule[]) => { setPartRules(next); savePartRules(next) }
  const addStyle = useCallback(({ kind }: { kind: 'beak' | 'cut' | 'master' }) => setRuleDraft({ rule: newRule(kind, ruleStems[kind]), isNew: true }), [ruleStems])
  /** 묶음이 든 자모 — 묶음은 자모의 성질이라 자모로 센다. */
  const scopeJamo = useMemo(() => {
    if (!partScope) return undefined
    const lists: [AnatomySlot, readonly string[], Record<string, JamoData>][] = [['CH', CHOSEONG_LIST, jamoCho], ['JU', JUNGSEONG_LIST, jamoJung], ['JO', (JONGSEONG_LIST as readonly string[]).filter(Boolean), jamoJong]]
    return lists.map(([slot, list, map]) => ({ slot, total: list.length, hits: list.filter((L) => !!map[L] && jamoScopeKeys(map[L], slot).has(partScope.key)) })).filter((g) => g.hits.length > 0)
  }, [partScope, jamoCho, jamoJung, jamoJong])
  const scopeHits = useMemo(() => {
    if (!partScope) return null
    const cache = new Map<string, boolean>()
    const has = (slot: AnatomySlot, L: string) => {
      const k = `${slot}${L}`
      if (!cache.has(k)) {
        const jamo = (slot === 'CH' ? jamoCho : slot === 'JU' ? jamoJung : jamoJong)[L]
        cache.set(k, !!jamo && jamoScopeKeys(jamo, slot).has(partScope.key))
      }
      return cache.get(k)!
    }
    return new Set(CHART_SYLLABLES.filter((ch) => {
      const c = ch.charCodeAt(0) - 0xAC00
      const jong = JONGSEONG_LIST[c % 28]
      return has('CH', CHOSEONG_LIST[Math.floor(c / 588)]) || has('JU', JUNGSEONG_LIST[Math.floor((c % 588) / 28)]) || (!!jong && has('JO', jong))
    }))
  }, [partScope, jamoCho, jamoJung, jamoJong])
  const [scroll, setScroll] = useState({ top: 0, height: 600 })

  const drawing = useRef<{ cell: number; points: PenPoint[] } | null>(null)
  const activePointer = useRef<number | null>(null)
  const penSeen = useRef(false)
  const canvasRef = useRef<SVGSVGElement>(null)
  const chartRef = useRef<HTMLDivElement>(null)
  const timer = useRef<number | null>(null)

  const letters = useMemo(() => lettersOf(text), [text])
  const cols = Math.min(letters.length || 1, 5)
  const rows = Math.max(1, Math.ceil(letters.length / cols))
  const style = useMemo<GlobalStyle>(() => ({
    ...DEFAULT_STYLE, weight, linejoin: roundJoins ? 'round' : 'miter', linecap: roundJoins ? 'round' : 'butt',
    strokeStyle: { mode: 'brush', brush: { tip: 'round', aspectRatio: 1, angle: 0 }, ...(roundness > 0 ? { roundness } : {}) },
  }), [weight, roundJoins, roundness])
  /** 글자표 2,350자는 슬라이더를 놓은 뒤에 따라온다. 쓰기 칸 · 카드는 바로 바뀐다. */
  const chartStyle = useDeferredValue(style)
  const phase = phaseOf(bank)
  const progress = progressOf(bank)
  const stats = useMemo(() => chartStats(bank), [bank])
  /** 지금 은행 기준 추천 문장 셋. ㅇㅋ로 은행이 바뀌면 따라 바뀐다. */
  const recommended = useMemo(() => recommendSentences(bank, text, 3), [bank, text])

  useEffect(() => { saveBank(bank) }, [bank])

  // iOS Safari는 SVG의 touch-action을 건너뛰기도 한다. 터치 이동을 직접 막는다.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const block = (event: TouchEvent) => { if (event.cancelable) event.preventDefault() }
    canvas.addEventListener('touchstart', block, { passive: false })
    canvas.addEventListener('touchmove', block, { passive: false })
    return () => { canvas.removeEventListener('touchstart', block); canvas.removeEventListener('touchmove', block) }
  }, [])

  // 그은 뒤 잠깐 멈추면 바뀐 칸만 읽는다
  useEffect(() => {
    if (dirty.size === 0) return
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      setReads((prev) => {
        const next = [...prev]
        dirty.forEach((i) => { next[i] = letters[i] && raws[i].length ? readSyllable(letters[i], raws[i], { preset: getBaseJamo }) : null })
        return next
      })
      setDirty(new Set())
    }, READ_DELAY)
    return () => { if (timer.current) window.clearTimeout(timer.current) }
  }, [dirty, raws, letters])

  const clearAll = useCallback(() => {
    setRaws(Array.from({ length: MAX_CELLS }, () => []))
    setReads(Array(MAX_CELLS).fill(null))
    setDirty(new Set())
  }, [])
  const setSentence = useCallback((next: string, why?: string) => {
    setText(next)
    clearAll()
    setCard(null)
    if (why) setMessage(why)
  }, [clearAll])
  const clearCell = (i: number) => {
    setRaws((prev) => prev.map((cell, k) => (k === i ? [] : cell)))
    setReads((prev) => prev.map((r, k) => (k === i ? null : r)))
    setCard(null)
    setMessage(`${letters[i] ?? '그'} 칸을 지웠어요. 다시 써 주세요.`)
  }

  // ----- 긋기 -----
  const toCell = (event: ReactPointerEvent<SVGSVGElement>, cell: number): PenPoint => {
    const rect = event.currentTarget.getBoundingClientRect()
    const x = (event.clientX - rect.left) / rect.width * cols * CELL, y = (event.clientY - rect.top) / rect.height * rows * CELL
    return { x: clamp01((x - (cell % cols) * CELL) / CELL), y: clamp01((y - Math.floor(cell / cols) * CELL) / CELL) }
  }
  const cellAt = (event: ReactPointerEvent<SVGSVGElement>): number => {
    const rect = event.currentTarget.getBoundingClientRect()
    const c = Math.min(cols - 1, Math.max(0, Math.floor((event.clientX - rect.left) / rect.width * cols)))
    const r = Math.min(rows - 1, Math.max(0, Math.floor((event.clientY - rect.top) / rect.height * rows)))
    return r * cols + c
  }
  const pointsOf = (event: ReactPointerEvent<SVGSVGElement>, cell: number): PenPoint[] => {
    const native = event.nativeEvent as globalThis.PointerEvent & { getCoalescedEvents?: () => globalThis.PointerEvent[] }
    const events = native.getCoalescedEvents?.() ?? []
    if (events.length === 0) return [toCell(event, cell)]
    const rect = event.currentTarget.getBoundingClientRect()
    return events.map((item) => {
      const x = (item.clientX - rect.left) / rect.width * cols * CELL, y = (item.clientY - rect.top) / rect.height * rows * CELL
      return { x: clamp01((x - (cell % cols) * CELL) / CELL), y: clamp01((y - Math.floor(cell / cols) * CELL) / CELL) }
    })
  }
  const begin = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    // 펜을 한 번 썼으면 손가락(손바닥)은 긋지 않는다
    if (event.pointerType === 'pen') penSeen.current = true
    if (event.pointerType === 'touch' && penSeen.current) return
    if (activePointer.current !== null) return
    const cell = cellAt(event)
    if (!letters[cell]) return
    event.currentTarget.setPointerCapture(event.pointerId)
    activePointer.current = event.pointerId
    drawing.current = { cell, points: [toCell(event, cell)] }
    setCurrent(drawing.current)
  }
  const move = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!drawing.current || event.pointerId !== activePointer.current) return
    drawing.current = { cell: drawing.current.cell, points: [...drawing.current.points, ...pointsOf(event, drawing.current.cell)] }
    setCurrent(drawing.current)
  }
  const finish = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.pointerId !== activePointer.current) return
    activePointer.current = null
    const done = drawing.current
    drawing.current = null
    setCurrent(null)
    if (!done || done.points.length < 2) return
    setRaws((prev) => prev.map((cell, k) => (k === done.cell ? [...cell, done.points] : cell)))
    setDirty((prev) => new Set(prev).add(done.cell))
  }

  // ----- 확인 카드 -----
  const openCard = (then: 'roll' | null) => {
    const gathered = gather(reads.slice(0, letters.length))
    const choices: CardChoices = { jamo: {}, layout: 'keep', mix: {} }
    let focus: CardState['focus'] = null
    for (const L of Object.keys(gathered.jamo)) {
      const samples = gathered.jamo[L]
      const target = rewrite && rewrite.L === L
      if (target && samples.some((s) => s.slot === 0 && s.type === rewrite.type)) choices.jamo[L] = { kind: 'slot', type: rewrite.type }
      else if (target && bank.jamo[L]) choices.jamo[L] = { kind: 'swap' }
      else choices.jamo[L] = bank.jamo[L] ? { kind: 'keep' } : { kind: 'new' }
      const dup = samples.find((s) => hasSlot(bank.jamo[L], s.slot))
      if (target || (dup && !focus)) focus = { L, slot: (dup ?? samples[0]).slot }
    }
    if (!focus) { const L = Object.keys(gathered.jamo)[0]; if (L) focus = { L, slot: gathered.jamo[L][0].slot } }
    // 배치: 1단계에선 이미 있는 배치도 섞는 게 기본, 2단계는 두기가 기본
    for (const key of Object.keys(gathered.lay) as LayoutKey[]) if (bank.lay[key]) choices.mix![key] = phase === 1 && !rewrite
    setCard({ open: true, step: 1, then, gathered, choices, focus })
  }
  const previewBank = useMemo(() => card ? applyChoices(bank, card.gathered, card.choices) : null, [bank, card])
  /** 2단계 전 → 후: 1단계 고른 자모는 그대로 두고 배치만 안 섞은 것 / 섞은 것. */
  const layoutPair = useMemo(() => {
    if (!card) return null
    const keys = Object.keys(card.gathered.lay) as LayoutKey[]
    const none = Object.fromEntries(keys.map((k) => [k, false])), all = Object.fromEntries(keys.map((k) => [k, true]))
    return { before: applyChoices(bank, card.gathered, { ...card.choices, mix: none }), after: applyChoices(bank, card.gathered, { ...card.choices, mix: all }) }
  }, [bank, card])

  const setChoice = (L: string, choice: JamoChoice) => setCard((c) => c && { ...c, choices: { ...c.choices, jamo: { ...c.choices.jamo, [L]: choice } } })
  /** 카드 격자에서 칸 하나의 상태. */
  const cardCell = (L: string, slot: Slot): CellInfo => {
    const have = hasSlot(bank.jamo[L], slot)
    const got = card?.gathered.jamo[L]?.filter((s) => s.slot === slot)
    if (!card || !got?.length) return { state: have ? 'have' : 'none' }
    const choice = card.choices.jamo[L]
    const sample = choice?.kind === 'slot' && slot === 0 ? (got.filter((s) => s.type === choice.type).pop() ?? got[got.length - 1]) : got[got.length - 1]
    if (choice?.kind === 'skip') return { state: 'skip', sample }
    if (!have) return { state: 'new', sample }
    return { state: choice?.kind === 'swap' || choice?.kind === 'slot' ? 'dupOn' : 'dup', sample }
  }
  const tapCardCell = (L: string, slot: Slot) => {
    const info = cardCell(L, slot)
    if (info.state === 'none' || info.state === 'have') return
    setCard((c) => c && { ...c, focus: { L, slot } })
    if (info.state === 'new') setChoice(L, { kind: 'skip' })
    else if (info.state === 'skip') setChoice(L, bank.jamo[L] ? { kind: 'keep' } : { kind: 'new' })
    else if (info.state === 'dup') setChoice(L, { kind: 'swap' })
    else setChoice(L, { kind: 'keep' })
  }
  const applyCard = (): Bank | null => {
    if (!card || !previewBank) return null
    const before = stats.okSet
    setBank(previewBank)
    setRewrite(null)
    setCard(null)
    clearAll()
    const after = chartStats(previewBank)
    const fresh = new Set([...after.okSet].filter((ch) => !before.has(ch)))
    setHighlight(fresh)
    window.setTimeout(() => setHighlight(null), 2500)
    const got = card.gathered.reads.map((r) => r.char).join('')
    const layouts = LAYOUT_KEYS.filter((k) => previewBank.lay[k]).length
    setMessage(phaseOf(previewBank) === 1 || layouts < 6
      ? `${got}을(를) 반영했어요. 배치 ${layouts}/6. 주사위를 누르면 다음 문장을 줘요.`
      : `${got}을(를) 반영했어요. 글자표에 ${fresh.size}자가 새로 채워졌어요${after.partial ? `, 반쯤 찬 글자 ${after.partial}자` : ''}. 주사위를 누르면 다음 문장을 줘요.`)
    return previewBank
  }
  const rollDice = (from: Bank = bank) => {
    if (reads.some((r) => r) && from === bank) { openCard('roll'); return }
    const pick = pickSentence(from, text)
    if (!pick) { setMessage(phaseOf(from) === 1 ? '준비된 문장으로는 남은 배치를 못 채워요. 직접 문장을 쳐 보세요.' : '자모를 다 모았어요. 2,350자가 모두 채워졌을 거예요.'); return }
    const why = phaseOf(from) === 1
      ? `먼저 배치부터 잡아요. 이 문장에 아직 없는 배치 ${layoutGain(from, pick)}가지가 들어 있어요. 다 쓰고 확인 카드를 눌러 주세요.`
      : `이 문장을 반영하면 글자표에 ${recommendSentences(from, text, 1)[0]?.fills ?? 0}자가 새로 차요. 새 자모: ${newJamoIn(from, pick).join(' ')}. 다 쓰고 확인 카드를 눌러 주세요.`
    setSentence(pick, why)
  }
  /** 자모 하나만 고치기: 본보기 글자 한 칸만 쓰게 한다. */
  const startRewrite = (L: string, slot: Slot, type: SampleType) => {
    const ex = exampleFor(L, slot, type)
    if (!ex) return
    setPicker({ open: false, L: null, slot: 0 })
    setRewrite({ L, type: slot === 2 ? 'J' : type })
    setSentence(ex, `${ex} 한 자만 써 주세요. 여기서 ${slot === 2 ? '받침 ' : ''}${L}만 가져가요${slot === 0 ? `(${TYPE_NAME[type]} 자리 꼴)` : ''}.`)
  }
  const pickerCell = (L: string, slot: Slot): CellInfo => {
    const entry = bank.jamo[L]
    if (!hasSlot(entry, slot)) return { state: 'none' }
    const sample = slot === 2 ? entry!.by.J ?? entry!.rep : slot === 0 ? FIRST_TYPES.map((t) => entry!.by[t]).find(Boolean) ?? entry!.rep : entry!.rep
    return { state: 'have', sample }
  }
  const resetAll = () => {
    if (!window.confirm('모은 배치와 자모를 모두 지울까요? 되돌릴 수 없어요.')) return
    setBank(emptyBank())
    setRewrite(null)
    setSentence(SEED_SENTENCE, '처음부터예요. 씨앗 문장을 써 주세요.')
  }

  // ----- 글자표 -----
  const chartRows = Math.ceil(CHART_SYLLABLES.length / CHART_COLS)
  const firstRow = Math.max(0, Math.floor(scroll.top / CHART_CELL) - 2)
  const lastRow = Math.min(chartRows, Math.ceil((scroll.top + scroll.height) / CHART_CELL) + 2)
  useEffect(() => {
    const el = chartRef.current
    if (!el) return
    const update = () => setScroll({ top: el.scrollTop, height: el.clientHeight })
    update()
    el.addEventListener('scroll', update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => { el.removeEventListener('scroll', update); ro.disconnect() }
  }, [])
  const pickedInfo = useMemo(() => {
    if (!picked) return null
    const plan = planSyllable(bank, picked)
    if (!plan) return null
    if (!plan.layout) {
      const s = layoutGain(bank, SEED_SENTENCE) ? SEED_SENTENCE : pickSentence(bank, text)
      return { title: `${picked} — 배치(${plan.key})가 아직 없어요`, body: s ? `이 문장을 쓰면 잡혀요: ${s}` : '', sentence: s }
    }
    if (plan.ok) return { title: `${picked} — 다 찼어요`, body: plan.parts.map((p) => `${p.char} ← ${p.sample!.from}(${TYPE_NAME[p.sample!.type]})`).join(' · '), sentence: null }
    const s = sentenceFor(plan.missing)
    return { title: `${picked} — ${plan.missing.join(' ')}이(가) 없어요`, body: s ? `이 문장에 들어 있어요: ${s}` : '준비된 문장에는 없어요. 직접 쳐 보세요.', sentence: s }
  }, [picked, bank, text])

  // 쓰기 칸의 글자 · 획 · 벡터. 긋는 중(current)이나 확인 카드를 만질 때 다시 만들지 않는다
  const boardInk = useMemo(() => <>
          {letters.map((ch, i) => {
            const ox = (i % cols) * CELL, oy = Math.floor(i / cols) * CELL
            const read = reads[i]
            const has = raws[i].length > 0
            return <g key={i}>
              <rect x={ox + 1} y={oy + 1} width={CELL - 2} height={CELL - 2} fill={EDIT_COLOR.surface} stroke={EDIT_COLOR.editGuide} rx={4} />
              <text x={ox + 6} y={oy + 14} fontSize={11} fill={EDIT_COLOR.editGuide} fontWeight={700}>{ch}</text>
              {read && <text x={ox + CELL / 2} y={oy + CELL - 5} fontSize={9} textAnchor="middle" fill={read.state === 'ok' ? EDIT_COLOR.editSelect : EDIT_COLOR.destructive}>{read.state === 'ok' ? '✓ 읽었어요' : read.notes[0]}</text>}
              {/* 그은 날 선은 연하게 밑에, 맞춘 벡터는 위에 — 어떻게 펴졌는지 바로 보이게 */}
              {raws[i].map((pts, k) => <path key={k} d={rawPath(pts, ox, oy)} fill="none" stroke={EDIT_COLOR.editGuide} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />)}
              <g transform={`translate(${ox} ${oy})`} pointerEvents="none" data-testid={`handwriting-vector-${i}`}>
                {raws[i].map((pts, k) => {
                  const st = fittedOf(pts)
                  if (!st) return null
                  return <g key={k}>
                    {brushInkGroupsToSvgPaths(strokeToRenderInkGroups({ ...st, thickness: HANDWRITING_THICKNESS }, UNIT_BOX, weightToMultiplier(weight), style.strokeStyle!, { join: { linejoin: roundJoins ? 'round' : 'miter', miterLimit: miterLimitOf(style.strokeStyle) } }), CELL)
                      .map((d, m) => <path key={m} d={d} fill={EDIT_COLOR.foreground} fillRule="evenodd" />)}
                    {st.points.map((p, n) => <circle key={n} cx={p.x * CELL} cy={p.y * CELL} r={1.6} fill={EDIT_COLOR.editSelect} />)}
                  </g>
                })}
              </g>
              {has && <g className={styles.eraser} onPointerDown={(e) => { e.stopPropagation(); clearCell(i) }} data-testid={`handwriting-erase-${i}`}>
                <circle cx={ox + CELL - 11} cy={oy + 11} r={8} fill={EDIT_COLOR.surface} stroke={EDIT_COLOR.editGuide} />
                <text x={ox + CELL - 11} y={oy + 14.5} fontSize={10} textAnchor="middle" fill={EDIT_COLOR.foreground}>✕</text>
              </g>}
            </g>
          })}
  </>, [letters, raws, reads, cols, roundJoins, style, weight]) // eslint-disable-line react-hooks/exhaustive-deps
  const imitateGlyphs = useMemo(() => letters.map((ch, i) => chartSource === 'preset' ? <PresetGlyph key={`${ch}-${i}`} char={ch} size={56} style={style} /> : <BankGlyph key={`${ch}-${i}`} bank={bank} char={ch} size={56} style={style} />), [letters, bank, style, chartSource])
  const badCells = letters.map((_, i) => reads[i]).filter((r): r is SyllableRead => !!r && r.state === 'bad')
  const readCount = letters.filter((_, i) => reads[i]?.state === 'ok').length

  return <div className={styles.page}>
    <aside className={styles.chartPane}>
      <div className={styles.chartHead}>
        <strong>{chartSource === 'preset' ? '프리셋 글자표' : '내 글자표'}</strong>
        <span>{chartSource === 'preset' ? '제품 프리셋 2,350자' : `${stats.ok}/${CHART_SYLLABLES.length} 다 참${stats.partial ? ` · 반쯤 ${stats.partial}` : ''}`}</span>
      </div>
      {view === 'anatomy' && <ChoiceGroup variant="segment" aria-label="글자표 보기" data-testid="handwriting-chart-tabs">
        {([['glyph', '글자'], ['CH', '첫닿자'], ['JU', '홀자'], ['JO', '받침']] as const).map(([id, label]) => <ChoiceItem key={id} checked={chartTab === id} onClick={() => setChartTab(id)}>{label}</ChoiceItem>)}
      </ChoiceGroup>}
      {view === 'anatomy' && chartTab !== 'glyph' && <div className={styles.chart} data-testid="handwriting-jamo-cards">
        <div className={styles.jamoCards}>
          {(chartTab === 'CH' ? CHOSEONG_LIST : chartTab === 'JU' ? JUNGSEONG_LIST : (JONGSEONG_LIST as readonly string[]).filter(Boolean)).map((ch) => {
            const inScope = !!scopeJamo?.some((g) => g.slot === chartTab && g.hits.includes(ch))
            const on = focusSlot === chartTab && !!picked && sampleChar(chartTab, ch) === picked
            return <Pressable key={ch} type="button" className={styles.jamoCard} data-on={on || undefined} data-scope={inScope || undefined} aria-label={ch} aria-pressed={on} onClick={() => pickJamo(chartTab, ch)} data-testid={`handwriting-jamo-card-${ch}`}>
              <span className={styles.jamoInk}><JamoGlyph type={chartTab === 'CH' ? 'choseong' : chartTab === 'JU' ? 'jungseong' : 'jongseong'} char={ch} size={52} /></span>
            </Pressable>
          })}
        </div>
      </div>}
      <div ref={chartRef} className={styles.chart} hidden={view === 'anatomy' && chartTab !== 'glyph'} data-testid="handwriting-chart">
        <ChartRows bank={bank} style={chartStyle} picked={picked} highlight={view === 'anatomy' ? scopeHits : highlight} firstRow={firstRow} lastRow={lastRow} onPick={setPicked} source={chartSource} groupBeakOf={ruleBeakOf} cutAngleOf={ruleCutOf} masterOf={ruleMasterOf} />
      </div>
      {pickedInfo && view === 'collect' && <div className={styles.pickedInfo}>
        <b>{pickedInfo.title}</b>
        <p>{pickedInfo.body}</p>
        {pickedInfo.sentence && <Button size="sm" onClick={() => setSentence(pickedInfo.sentence!, `${pickedInfo.sentence}를 써 주세요.`)}>이 문장 쓰기</Button>}
      </div>}
      <div className={styles.styleBox}>
        <label className={styles.switchRow}>프리셋으로 보기<Switch checked={chartSource === 'preset'} onCheckedChange={(on) => setChartSource(on ? 'preset' : 'bank')} data-testid="handwriting-preset-view" /></label>
        <Field label="굵기" value={weight}><RangeBar min={100} max={900} step={100} value={weight} onChange={(e) => setWeight(Number(e.target.value))} /></Field>
        <Field label="둥글기" value={`${Math.round(roundness * 100)}%`}><RangeBar min={0} max={100} step={5} value={Math.round(roundness * 100)} onChange={(e) => setRoundness(Number(e.target.value) / 100)} data-testid="handwriting-roundness" /></Field>
        <label className={styles.switchRow}>꺾임 모두 굴리기<Switch checked={roundJoins} onCheckedChange={setRoundJoins} /></label>
      </div>
      {view === 'anatomy' && <div className={ruleStyles.list} data-testid="part-rule-list">
        <h4>걸려 있는 부위 스타일 (좁은 규칙이 이겨요)</h4>
        <Button size="sm" onClick={() => addStyle({ kind: 'master' })} data-testid="stem-master-open">줄기마스터 빚기</Button>
        {sortedRules.length === 0 && <p className={ruleStyles.empty}>아직 없어요. 세로줄기의 머리나 맺음을 고르고 스타일 추가하기를 눌러 보세요.</p>}
        {sortedRules.map((rule) => { const reach = ruleReach(rule, partIndexes[kindOf(rule)]); return <Pressable key={rule.id} type="button" className={ruleStyles.rule} onClick={() => setRuleDraft({ rule, isNew: false })}>
          <b>{RULE_TARGET[kindOf(rule)]}</b><span>{ruleSentence(rule, ruleStems[kindOf(rule)])}</span>
          <small>{([['CH', '첫닿자'], ['JU', '홀자'], ['JO', '받침']] as const).filter(([k]) => reach[k].length).map(([k, label]) => `${label} ${reach[k].length}`).join(' · ') || '해당 없음'}</small>
        </Pressable> })}
      </div>}
      <PartRuleDialog draft={ruleDraft?.rule ?? null} isNew={!!ruleDraft?.isNew} indexes={partIndexes} others={sortedRules.filter((r) => r.id !== ruleDraft?.rule.id)} style={style}
        onChange={(rule) => setRuleDraft((d) => d && { ...d, rule })}
        onSave={() => { if (ruleDraft) commitRules([...partRules.filter((r) => r.id !== ruleDraft.rule.id), ruleDraft.rule]); setRuleDraft(null) }}
        onDelete={() => { if (ruleDraft) commitRules(partRules.filter((r) => r.id !== ruleDraft.rule.id)); setRuleDraft(null) }}
        onClose={() => setRuleDraft(null)} />
    </aside>

    {view === 'anatomy' ? <main className={styles.work}>
      <header className={styles.header}>
        <span>Handwriting Lab</span>
        <div className={styles.titleRow}><h1>글자 해부</h1><span className={styles.titleButtons}><Button size="sm" onClick={() => setView('dictionary')} data-testid="handwriting-view-dictionary">부위 사전</Button><Button size="sm" onClick={() => setView('collect')} data-testid="handwriting-view-collect">손글씨 수집으로</Button></span></div>
        <p>왼쪽 글자표에서 글자를 누르면 크게 보여요. 자모를 누르면 그 자모의 줄기 · 꺾임 · 머리 · 맺음이 번호로 펼쳐져요.</p>
      </header>
      <HandwritingAnatomy char={picked ?? '각'} style={style} onScope={setPartScope} scopeJamo={scopeJamo} focusRequest={focusRequest} onFocusSlot={setFocusSlot} groupBeakOf={ruleBeakOf} cutAngleOf={ruleCutOf} masterOf={ruleMasterOf} onAddStyle={addStyle} />
    </main> : view === 'dictionary' ? <main className={styles.work}>
      <header className={styles.header}>
        <span>Handwriting Lab</span>
        <div className={styles.titleRow}><h1>부위 사전</h1><Button size="sm" onClick={() => setView('anatomy')} data-testid="handwriting-view-anatomy">글자 해부로</Button></div>
        <p>부위마다 뜻 · 성립 조건 · 엔진이 읽는 법을 적고, 지금 프리셋에서 그 부위가 있는 자모를 그려요. 작은 자모를 누르면 글자 해부에서 열려요.</p>
      </header>
      <HandwritingPartDictionary style={style} onPick={(slot, ch) => { pickJamo(slot, ch); setView('anatomy') }} />
    </main> : <main className={styles.work}>
      <header className={styles.header}>
        <span>Handwriting Lab</span>
        <div className={styles.titleRow}><h1>손글씨 수집</h1><Button size="sm" onClick={() => setView('anatomy')} data-testid="handwriting-view-anatomy">글자 해부로</Button></div>
        <p>{phase === 1 ? '1단계 · 배치 6종 잡기' : '2단계 · 자모 모으기'} — 문장을 칸에 쓰고 확인 카드에서 ㅇㅋ하면 은행에 들어가요. 저장은 이 브라우저에만.</p>
      </header>

      <div className={styles.prog}>
        {[['배치', progress.layouts, 6], ['첫닿자', progress.choseong, 19], ['홀자', progress.jungseong, 21], ['받침', progress.jongseong, 27]].map(([name, a, b]) => <div key={name} className={styles.progRow}>
          <span>{name}</span><i><b style={{ width: `${Math.round(Number(a) / Number(b) * 100)}%` }} /></i><em>{a}/{b}</em>
        </div>)}
      </div>

      <div className={styles.controls}>
        <Input value={text} onChange={(e) => { setText(e.target.value); clearAll(); setRewrite(null) }} className={styles.sentence} aria-label="문장" />
        <Button size="sm" onClick={() => rollDice()} data-testid="handwriting-dice"><Dices />주사위</Button>
        <Button size="sm" variant="primary" onClick={() => openCard(null)} disabled={readCount === 0} data-testid="handwriting-card">확인 카드{readCount ? ` (${readCount})` : ''}</Button>
        <Button size="sm" onClick={() => setPicker({ open: true, L: null, slot: 0 })} data-testid="handwriting-pick-jamo"><PenLine />자모 하나 고치기</Button>
        <Button size="sm" onClick={clearAll} disabled={raws.every((c) => c.length === 0)}><Eraser />다 지우기</Button>
        <Button size="sm" onClick={resetAll}><RotateCcw />처음부터</Button>
      </div>
      <p className={styles.message} data-testid="handwriting-message">{message}</p>
      {recommended.length > 0 && <div className={styles.recs} data-testid="handwriting-recs">
        <span>{phase === 1 ? '배치를 잡는 문장' : '안 채워진 글자를 채우는 문장'}</span>
        {recommended.map((r) => <Button key={r.text} size="sm" onClick={() => setSentence(r.text, phase === 1
          ? `이 문장에 아직 없는 배치 ${r.layouts}가지가 들어 있어요. 다 쓰고 확인 카드를 눌러 주세요.`
          : `이 문장을 반영하면 글자표에 ${r.fills}자가 새로 차요. 새 자모: ${r.newJamo.join(' ')}. 다 쓰고 확인 카드를 눌러 주세요.`)}>
          {r.text}<em>{phase === 1 ? `배치 +${r.layouts}` : `+${r.fills}자${r.halfFills ? ` · 반쯤 +${r.halfFills}` : ''}`}</em>
        </Button>)}
      </div>}

      <figure className={styles.board}>
        <svg ref={canvasRef} viewBox={`0 0 ${cols * CELL} ${rows * CELL}`} className={styles.canvas} style={{ aspectRatio: `${cols} / ${rows}` }} data-testid="handwriting-canvas"
          onPointerDown={begin} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish}>
          {boardInk}
          {current && <path d={rawPath(current.points, (current.cell % cols) * CELL, Math.floor(current.cell / cols) * CELL)} fill="none" stroke={EDIT_COLOR.editSelect} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />}
        </svg>
        <figcaption>칸마다 글자 하나. 오른쪽 위 ✕로 그 칸만 지워요.{badCells.length ? ` 못 읽은 칸: ${badCells.map((r) => r.char).join(', ')}` : ''}</figcaption>
      </figure>

      <section className={styles.panel}>
        <h2>{chartSource === 'preset' ? '프리셋으로 그린 이 문장' : '지금 은행으로 그린 이 문장'}</h2>
        <div className={styles.imitate}>
          {imitateGlyphs}
        </div>
        <p className={styles.note}>배운 것만 흉내 내요. 빈 자리는 점선 상자, 배치가 없는 글자는 글자만.</p>
      </section>
    </main>}

    <Dialog open={!!card?.open} onOpenChange={(open) => { if (!open) setCard(null) }}>
      <DialogContent className={styles.card}>
        {card && <>
          <DialogHeader>
            <div className={styles.cardHead}>
              <div><DialogTitle>{card.step === 1 ? '이번 문장에서 모은 것' : '이번 글씨의 배치 버릇'}</DialogTitle>
                <p className={styles.sub}>{card.step === 1 ? `${card.gathered.reads.map((r) => r.char).join('')} · ${card.gathered.reads.length}자 읽음` : ((Object.keys(card.gathered.lay) as LayoutKey[]).some((k) => bank.lay[k]) ? '이미 있는 배치는 누르면 이번 글씨를 섞어요' : '처음 잡는 배치예요. 반영하면 이대로 들어가요')}</p></div>
              {!rewrite && <div className={styles.steps}><span className={card.step === 1 ? styles.stepOn : ''}>1 글자</span>›<span className={card.step === 2 ? styles.stepOn : ''}>2 레이아웃</span></div>}
            </div>
          </DialogHeader>
          {card.gathered.bad.length > 0 && <p className={styles.warn}>못 읽은 칸: {card.gathered.bad.join(', ')} — 넣지 않아요.</p>}
          {card.gathered.reads.length === 0 && <p>아직 읽은 글자가 없어요. 칸에 글자를 쓰고 잠깐 기다리면 읽어요.</p>}

          {card.step === 1 && card.gathered.reads.length > 0 && <>
            {(() => {
              const cells = Object.entries(card.gathered.jamo).flatMap(([L, ss]) => [...new Set(ss.map((s) => s.slot))].map((slot) => cardCell(L, slot)))
              const nNew = cells.filter((c) => c.state === 'new').length, nDup = cells.filter((c) => c.state === 'dup' || c.state === 'dupOn').length
              return <div className={styles.secHead}><b>이번에 모은 글자</b><span className={styles.badgeNew}>새로 {nNew}</span>{nDup > 0 && <span className={styles.badgeDup}>겹침 {nDup}</span>}<span className={styles.sub}>새것은 그대로 올라가요. 겹치는 건 누르면 이번 글씨로 덮어요</span></div>
            })()}
            <JamoGrid cellOf={cardCell} onTap={tapCardCell} focus={card.focus} />
            {card.focus && previewBank && (() => {
              const { L, slot } = card.focus
              const got = card.gathered.jamo[L]?.filter((s) => s.slot === slot) ?? []
              const sample = got[got.length - 1]
              if (!sample) return null
              return <div className={styles.detail} data-testid="handwriting-detail">
                {(() => {
                  // 다른 자모는 지금 고른 대로 두고 이 자모만 끈 것 / 켠 것. 지금 고른 쪽에 테두리 — 토글하면 같이 옮겨 간다
                  const on = ['new', 'dupOn'].includes(cardCell(L, slot).state)
                  const had = !!bank.jamo[L], cur = card.choices.jamo[L]
                  const offChoice: JamoChoice = had ? { kind: 'keep' } : { kind: 'skip' }
                  const onChoice: JamoChoice = had ? (cur?.kind === 'slot' ? cur : { kind: 'swap' }) : { kind: 'new' }
                  const withL = (c: JamoChoice) => applyChoices(bank, card.gathered, { ...card.choices, jamo: { ...card.choices.jamo, [L]: c } })
                  return <>
                    <BeforeAfter before={withL(offChoice)} after={withL(onChoice)} char={sample.from} style={style} active={on ? 'after' : 'before'} />
                    <small className={on ? styles.detailOn : undefined}>{slot === 2 ? '받침 ' : ''}{L} · {on ? '반영해요' : '그대로 둬요'}</small>
                  </>
                })()}
              </div>
            })()}
          </>}

          {card.step === 2 && layoutPair && <>
            <div className={styles.layGrid}>
              {(Object.keys(card.gathered.lay) as LayoutKey[]).map((k) => {
                const char = card.gathered.lay[k]![0].char
                const isNew = !bank.lay[k]
                const on = isNew || !!card.choices.mix?.[k]
                return <button key={k} type="button" className={`${styles.layTile}${on ? ` ${styles.layOn}` : ''}`} disabled={isNew} data-testid={`handwriting-lay-${k}`}
                  onClick={() => setCard((c) => c && { ...c, choices: { ...c.choices, mix: { ...c.choices.mix, [k]: !c.choices.mix?.[k] } } })}>
                  <i className={styles.layChk}>{isNew ? '새' : on ? '✓' : ''}</i>
                  <BeforeAfter before={isNew ? null : layoutPair.before} after={layoutPair.after} char={char} style={style} size={64} />
                  <small>{k}</small>
                </button>
              })}
            </div>
            {phase === 1 && (() => {
              const missing = LAYOUT_KEYS.filter((k) => !bank.lay[k] && !card.gathered.lay[k])
              return <p className={styles.sub}>{missing.length ? `반영하면 배치 ${6 - missing.length}/6. 아직 없는 배치: ${missing.join(', ')}` : '반영하면 배치 여섯 가지가 다 모여요.'}</p>
            })()}
          </>}

          <DialogFooter>
            {card.step === 1 && rewrite
              // 자모 하나 고치기는 레이아웃 단계 없이 바로 반영
              ? <><Button onClick={() => setCard(null)}>아직</Button>
                <Button variant="primary" disabled={card.gathered.reads.length === 0} onClick={() => applyCard()} data-testid="handwriting-ok">ㅇㅋ, 반영</Button></>
              : card.step === 1
              ? <><Button onClick={() => setCard(null)}>아직</Button>
                <Button variant="primary" disabled={card.gathered.reads.length === 0} onClick={() => setCard((c) => c && { ...c, step: 2 })} data-testid="handwriting-next">다음 › 레이아웃</Button></>
              : <><Button onClick={() => setCard((c) => c && { ...c, step: 1 })}>‹ 이전</Button>
                <Button variant="primary" onClick={() => { const then = card.then; const next = applyCard(); if (then === 'roll' && next) window.setTimeout(() => rollDice(next), 50) }} data-testid="handwriting-ok">ㅇㅋ, 반영</Button></>}
          </DialogFooter>
        </>}
      </DialogContent>
    </Dialog>

    <Dialog open={picker.open} onOpenChange={(open) => { if (!open) setPicker({ open: false, L: null, slot: 0 }) }}>
      <DialogContent className={styles.card}>
        <DialogHeader><DialogTitle>자모 하나 고치기</DialogTitle><p className={styles.sub}>고칠 자모를 누르면 그 자모가 든 글자 한 자만 쓰게 해요.</p></DialogHeader>
        <JamoGrid cellOf={pickerCell} focus={picker.L ? { L: picker.L, slot: picker.slot } : null} onTap={(L, slot) => slot === 0 ? setPicker({ open: true, L, slot }) : startRewrite(L, slot, 'J')} />
        {picker.L && picker.slot === 0 && <div className={styles.slotRow} data-testid="handwriting-slot-row">
          <small>{picker.L}를 어느 자리 꼴로 쓸까요?</small>
          {FIRST_TYPES.map((t) => <Button key={t} size="sm" onClick={() => startRewrite(picker.L!, 0, t)}>{exampleOf(picker.L!, t)}<em>{TYPE_NAME[t]}</em></Button>)}
        </div>}
      </DialogContent>
    </Dialog>
  </div>
}
