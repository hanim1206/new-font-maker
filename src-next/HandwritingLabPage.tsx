import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { Dices, Eraser, RotateCcw } from 'lucide-react'
import { readSyllable } from '../src/services/handwritingRead'
import type { SyllableRead } from '../src/services/handwritingRead'
import {
  applyChoices, chartStats, CHART_SYLLABLES, emptyBank, exampleOf, FIRST_TYPES, gather, layoutGain, LAYOUT_KEYS, newJamoIn, phaseOf, pickSentence,
  placeSyllable, planSyllable, progressOf, SEED_SENTENCE, sentenceFor, TYPE_NAME, averageLayout, blendLayout,
} from '../src/services/handwritingBank'
import type { Bank, CardChoices, Gathered, JamoChoice, LayoutEntry, SampleType, TypedSample } from '../src/services/handwritingBank'
import type { PenPoint } from '../src/services/penStrokeFit'
import { getBaseJamo } from '../src/stores/jamoStore'
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
const CHOICE_ORDER: readonly SampleType[] = [...FIRST_TYPES, 'J']

type CellRaws = PenPoint[][]

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
function SampleThumb({ sample, size = 40, color = EDIT_COLOR.foreground }: { sample: TypedSample; size?: number; color?: string }) {
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
}

/** 배치 한 벌의 작은 그림: 부품 상자만. */
function LayoutThumb({ entry, size = 72 }: { entry: LayoutEntry; size?: number }) {
  const V = 100
  const colors: Record<Part, string> = { CH: EDIT_COLOR.editSlotCh, JU: EDIT_COLOR.editSlotJu, JU_H: EDIT_COLOR.editSlotJu, JU_V: EDIT_COLOR.editSlotJu, JO: EDIT_COLOR.editSlotJo }
  return <svg viewBox={`-3 -3 ${V + 6} ${V + 6}`} width={size} height={size} className={styles.thumb} aria-hidden>
    <rect x={0} y={0} width={V} height={V} fill="none" stroke={EDIT_COLOR.editGuide} />
    {(Object.keys(entry.boxes) as Part[]).map((part) => {
      const r = entry.boxes[part]!
      return <rect key={part} x={r.x0 * V} y={r.y0 * V} width={(r.x1 - r.x0) * V} height={(r.y1 - r.y0) * V} fill={colors[part]} fillOpacity={0.28} stroke={colors[part]} strokeWidth={1.5} />
    })}
  </svg>
}

/** 은행으로 글자 하나를 제품 렌더러로 그린다. 견본이 빈 자리는 점선 상자, 배치가 없으면 글자만 연하게. */
function BankGlyph({ bank, char, size, style, override, faintMissing = true }: { bank: Bank; char: string; size: number; style: GlobalStyle; override?: Record<string, TypedSample>; faintMissing?: boolean }) {
  const placed = useMemo(() => placeSyllable(bank, char, override), [bank, char, override])
  const syllable = useMemo(() => placed ? decomposeSyllable(char, placed.choseongMap, placed.jungseongMap, placed.jongseongMap) : null, [placed, char])
  if (!placed || !syllable) return <span className={styles.emptyGlyph} style={{ width: size, height: size, fontSize: size * 0.4 }}>{char}</span>
  const partial = placed.plan.partial
  const V = 100
  const missing = Object.entries(placed.missingBoxes) as [Part, BoxConfig][]
  return <SvgRenderer syllable={syllable} boxes={placed.boxes} size={size} globalStyle={style} fillColor={partial && faintMissing ? EDIT_COLOR.editGuide : EDIT_COLOR.foreground}
    underlay={missing.length ? missing.map(([part, b]) => <rect key={part} x={b.x * V} y={b.y * V} width={b.width * V} height={b.height * V} fill="none" stroke={EDIT_COLOR.text5} strokeWidth={1.2} strokeDasharray="3 2" rx={1} />) : undefined} />
}

interface CardState { open: boolean; then: 'roll' | null; gathered: Gathered; choices: CardChoices }

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
  const [weight, setWeight] = useState(400)
  const [roundJoins, setRoundJoins] = useState(false)
  const [picked, setPicked] = useState<string | null>(null)
  const [highlight, setHighlight] = useState<Set<string> | null>(null)
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
  const style = useMemo<GlobalStyle>(() => ({ ...DEFAULT_STYLE, weight, linejoin: roundJoins ? 'round' : 'miter', linecap: roundJoins ? 'round' : 'butt' }), [weight, roundJoins])
  const phase = phaseOf(bank)
  const progress = progressOf(bank)
  const stats = useMemo(() => chartStats(bank), [bank])

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
    const choices: CardChoices = { jamo: {}, layout: 'keep' }
    for (const L of Object.keys(gathered.jamo)) {
      const samples = gathered.jamo[L]
      if (rewrite && rewrite.L === L && samples.some((s) => s.type === rewrite.type)) choices.jamo[L] = { kind: 'slot', type: rewrite.type }
      else choices.jamo[L] = bank.jamo[L] ? { kind: 'keep' } : { kind: 'new' }
    }
    setCard({ open: true, then, gathered, choices })
  }
  const previewBank = useMemo(() => card ? applyChoices(bank, card.gathered, card.choices) : null, [bank, card])
  const previewStats = useMemo(() => previewBank ? chartStats(previewBank) : null, [previewBank])
  const added = useMemo(() => previewStats ? [...previewStats.okSet].filter((ch) => !stats.okSet.has(ch)) : [], [previewStats, stats])

  const setChoice = (L: string, choice: JamoChoice) => setCard((c) => c && { ...c, choices: { ...c.choices, jamo: { ...c.choices.jamo, [L]: choice } } })
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
      : `이 문장에서 새로 모을 자모: ${newJamoIn(from, pick).join(' ')}. 다 쓰고 확인 카드를 눌러 주세요.`
    setSentence(pick, why)
  }
  const rewriteSlot = (L: string, type: SampleType) => {
    const next = applyCard()
    const ex = exampleOf(L, type)
    if (!ex) return
    setRewrite({ L, type })
    setSentence(ex, `${ex}를 써 주세요. 여기서 ${L}만 ${TYPE_NAME[type]} 자리 꼴로 가져가요.`)
    void next
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

  const badCells = letters.map((_, i) => reads[i]).filter((r): r is SyllableRead => !!r && r.state === 'bad')
  const readCount = letters.filter((_, i) => reads[i]?.state === 'ok').length

  return <div className={styles.page}>
    <aside className={styles.chartPane}>
      <div className={styles.chartHead}>
        <strong>내 글자표</strong>
        <span>{stats.ok}/{CHART_SYLLABLES.length} 다 참{stats.partial ? ` · 반쯤 ${stats.partial}` : ''}</span>
      </div>
      <div ref={chartRef} className={styles.chart} data-testid="handwriting-chart">
        <div style={{ height: chartRows * CHART_CELL, position: 'relative' }}>
          {Array.from({ length: Math.max(0, lastRow - firstRow) }, (_, k) => firstRow + k).map((row) => <div key={row} className={styles.chartRow} style={{ top: row * CHART_CELL, height: CHART_CELL }}>
            {CHART_SYLLABLES.slice(row * CHART_COLS, row * CHART_COLS + CHART_COLS).map((ch) => <button key={ch} type="button" className={`${styles.chartCell}${picked === ch ? ` ${styles.chartPicked}` : ''}${highlight?.has(ch) ? ` ${styles.chartNew}` : ''}`} style={{ width: CHART_CELL, height: CHART_CELL }} onClick={() => setPicked(ch)} title={ch}>
              <BankGlyph bank={bank} char={ch} size={CHART_CELL - 6} style={style} />
            </button>)}
          </div>)}
        </div>
      </div>
      {pickedInfo && <div className={styles.pickedInfo}>
        <b>{pickedInfo.title}</b>
        <p>{pickedInfo.body}</p>
        {pickedInfo.sentence && <Button size="sm" onClick={() => setSentence(pickedInfo.sentence!, `${pickedInfo.sentence}를 써 주세요.`)}>이 문장 쓰기</Button>}
      </div>}
      <div className={styles.styleBox}>
        <Field label="굵기" value={weight}><RangeBar min={100} max={900} step={100} value={weight} onChange={(e) => setWeight(Number(e.target.value))} /></Field>
        <label className={styles.switchRow}>꺾임 모두 굴리기<Switch checked={roundJoins} onCheckedChange={setRoundJoins} /></label>
      </div>
    </aside>

    <main className={styles.work}>
      <header className={styles.header}>
        <span>Handwriting Lab</span>
        <h1>손글씨 수집</h1>
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
        <Button size="sm" onClick={clearAll} disabled={raws.every((c) => c.length === 0)}><Eraser />다 지우기</Button>
        <Button size="sm" onClick={resetAll}><RotateCcw />처음부터</Button>
      </div>
      <p className={styles.message} data-testid="handwriting-message">{message}</p>

      <figure className={styles.board}>
        <svg ref={canvasRef} viewBox={`0 0 ${cols * CELL} ${rows * CELL}`} className={styles.canvas} style={{ aspectRatio: `${cols} / ${rows}` }} data-testid="handwriting-canvas"
          onPointerDown={begin} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish}>
          {letters.map((ch, i) => {
            const ox = (i % cols) * CELL, oy = Math.floor(i / cols) * CELL
            const read = reads[i]
            const has = raws[i].length > 0
            return <g key={i}>
              <rect x={ox + 1} y={oy + 1} width={CELL - 2} height={CELL - 2} fill={EDIT_COLOR.surface} stroke={EDIT_COLOR.editGuide} rx={4} />
              <text x={ox + 6} y={oy + 14} fontSize={11} fill={EDIT_COLOR.editGuide} fontWeight={700}>{ch}</text>
              {read && <text x={ox + CELL / 2} y={oy + CELL - 5} fontSize={9} textAnchor="middle" fill={read.state === 'ok' ? EDIT_COLOR.editSelect : EDIT_COLOR.destructive}>{read.state === 'ok' ? '✓ 읽었어요' : read.notes[0]}</text>}
              {raws[i].map((pts, k) => <path key={k} d={rawPath(pts, ox, oy)} fill="none" stroke={EDIT_COLOR.foreground} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />)}
              {has && <g className={styles.eraser} onPointerDown={(e) => { e.stopPropagation(); clearCell(i) }} data-testid={`handwriting-erase-${i}`}>
                <circle cx={ox + CELL - 11} cy={oy + 11} r={8} fill={EDIT_COLOR.surface} stroke={EDIT_COLOR.editGuide} />
                <text x={ox + CELL - 11} y={oy + 14.5} fontSize={10} textAnchor="middle" fill={EDIT_COLOR.foreground}>✕</text>
              </g>}
            </g>
          })}
          {current && <path d={rawPath(current.points, (current.cell % cols) * CELL, Math.floor(current.cell / cols) * CELL)} fill="none" stroke={EDIT_COLOR.editSelect} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />}
        </svg>
        <figcaption>칸마다 글자 하나. 오른쪽 위 ✕로 그 칸만 지워요.{badCells.length ? ` 못 읽은 칸: ${badCells.map((r) => r.char).join(', ')}` : ''}</figcaption>
      </figure>

      <section className={styles.panel}>
        <h2>지금 은행으로 그린 이 문장</h2>
        <div className={styles.imitate}>
          {letters.map((ch, i) => <BankGlyph key={`${ch}-${i}`} bank={bank} char={ch} size={56} style={style} />)}
        </div>
        <p className={styles.note}>배운 것만 흉내 내요. 빈 자리는 점선 상자, 배치가 없는 글자는 글자만.</p>
      </section>
    </main>

    <Dialog open={!!card?.open} onOpenChange={(open) => { if (!open) setCard(null) }}>
      <DialogContent className={styles.card}>
        {card && <>
          <DialogHeader><DialogTitle>{phase === 1 ? '이번 문장에서 읽은 배치' : '이번 문장에서 모은 것'}</DialogTitle></DialogHeader>
          {card.gathered.reads.length === 0
            ? <p>아직 읽은 글자가 없어요. 칸에 글자를 쓰고 잠깐 기다리면 읽어요.{card.gathered.bad.length ? ` 못 읽은 칸: ${card.gathered.bad.join(', ')}` : ''}</p>
            : <>
              {card.gathered.bad.length > 0 && <p className={styles.warn}>못 읽은 칸이 있어요: {card.gathered.bad.join(', ')} — 이 글자는 넣지 않아요. 그 칸만 지우고 다시 쓸 수 있어요.</p>}
              <div className={styles.chips}>{card.gathered.reads.map((r) => <span key={r.char + letters.indexOf(r.char)} className={styles.chip}>{r.char}<button type="button" className={styles.chipX} title="이 글자만 다시 쓰기" onClick={() => clearCell(reads.indexOf(r))}>✕</button></span>)}</div>

              {phase === 1 && <>
                <div className={styles.layRow}>
                  {LAYOUT_KEYS.map((k) => {
                    const rs = card.gathered.lay[k]
                    return <div key={k} className={styles.layCell}>
                      {rs ? <><LayoutThumb entry={averageLayout(rs)} /><div><b>{k}</b><br />{rs.map((r) => r.char).join(', ')}{bank.lay[k] ? <><br /><small>이미 있어요 → 섞어요</small></> : null}</div></>
                        : <div className={styles.layMiss}>{k}<br /><small>{bank.lay[k] ? '이미 있음' : '아직'}</small></div>}
                    </div>
                  })}
                </div>
                <p>배치 {Object.keys(card.gathered.lay).length}가지를 읽었어요.{(() => { const missing = LAYOUT_KEYS.filter((k) => !bank.lay[k] && !card.gathered.lay[k]); return missing.length ? ` 아직 없는 배치: ${missing.join(', ')}. 확정한 뒤 주사위를 누르면 나머지를 채우는 문장을 줘요.` : ' 여섯 가지가 다 모였어요.' })()}</p>
                <div className={styles.bonus}>덤으로 모은 자모 {Object.keys(card.gathered.jamo).length}개: {Object.entries(card.gathered.jamo).map(([L, samples]) => <span key={L}><SampleThumb sample={samples[0]} size={30} /> {L}</span>)}</div>
              </>}

              {phase === 2 && <>
                {Object.entries(card.gathered.jamo).map(([L, samples]) => {
                  const choice = card.choices.jamo[L]
                  const sample = choice?.kind === 'slot' ? (samples.filter((s) => s.type === choice.type).pop() ?? samples[samples.length - 1]) : samples[samples.length - 1]
                  const had = bank.jamo[L]
                  const isCho = sample.slot === 0
                  const old = had ? (isCho ? had.by[sample.type] ?? had.rep : had.rep) : null
                  return <div key={L} className={styles.jamoRow}>
                    <div className={styles.jamoHead}>
                      <SampleThumb sample={sample} /><b>{L}</b>
                      {choice?.kind === 'slot' && <><span className={styles.tag}>{TYPE_NAME[sample.type]} 자리 꼴</span><small>이 자리 꼴로 넣어요</small></>}
                      {choice?.kind !== 'slot' && !had && <><span className={`${styles.tag} ${styles.tagNew}`}>새로</span>
                        <label className={styles.inl}><input type="checkbox" checked={choice?.kind !== 'skip'} onChange={(e) => setChoice(L, { kind: e.target.checked ? 'new' : 'skip' })} /> 넣기</label></>}
                      {choice?.kind !== 'slot' && had && old && <><span className={styles.tag}>이미 있음</span><small>지금 것</small><SampleThumb sample={old} />
                        <span>→</span>
                        <label className={styles.inl}><input type="radio" name={`k-${L}`} checked={choice?.kind !== 'swap'} onChange={() => setChoice(L, { kind: 'keep' })} /> 두기</label>
                        <label className={styles.inl}><input type="radio" name={`k-${L}`} checked={choice?.kind === 'swap'} onChange={() => setChoice(L, { kind: 'swap' })} /> {isCho ? `${TYPE_NAME[sample.type]} 자리는 ` : ''}이걸로 바꾸기</label></>}
                    </div>
                    {isCho && !had && <div className={styles.varRow}>
                      <small>다른 자리에 놓으면:</small>
                      {CHOICE_ORDER.map((tp) => {
                        const ex = exampleOf(L, tp)
                        if (!ex || !previewBank) return null
                        return <span key={tp} className={styles.varCell}>
                          <BankGlyph bank={previewBank} char={ex} size={56} style={style} override={{ [L]: sample }} faintMissing={false} />
                          <small>{ex}{tp === sample.type ? ' (쓴 자리)' : ''}</small>
                          {tp !== sample.type && <Button size="sm" onClick={() => rewriteSlot(L, tp)}>이 자리 다시 쓰기</Button>}
                        </span>
                      })}
                    </div>}
                  </div>
                })}
                {Object.keys(card.gathered.jamo).length === 0 && <p>읽힌 자모가 없어요.</p>}
                {Object.keys(card.gathered.lay).length > 0 && <div className={styles.layQ}>
                  <p>배치는 이미 확정돼 있어요. 이번 글씨의 배치 버릇을 중간값에 섞을까요?</p>
                  <div className={styles.layRow}>
                    {(Object.keys(card.gathered.lay) as typeof LAYOUT_KEYS[number][]).map((k) => {
                      const fresh = averageLayout(card.gathered.lay[k]!), have = bank.lay[k]!
                      const pct = (e: LayoutEntry) => e.boxes.CH ? Math.round((e.boxes.CH.x1 - e.boxes.CH.x0) * 100) : 0
                      return <div key={k} className={styles.layCell}><LayoutThumb entry={have} size={56} /><LayoutThumb entry={fresh} size={56} />
                        <div><b>{k}</b> · {card.gathered.lay[k]!.map((r) => r.char).join(', ')}<br /><small>첫닿자 너비 {pct(have)}% → 섞으면 {pct(blendLayout(have, fresh))}% (이번 글씨 {pct(fresh)}%)</small></div></div>
                    })}
                  </div>
                  <label className={styles.inl}><input type="radio" name="lmix" checked={card.choices.layout === 'keep'} onChange={() => setCard((c) => c && { ...c, choices: { ...c.choices, layout: 'keep' } })} /> 두기</label>
                  <label className={styles.inl}><input type="radio" name="lmix" checked={card.choices.layout === 'mix'} onChange={() => setCard((c) => c && { ...c, choices: { ...c.choices, layout: 'mix' } })} /> 섞기</label>
                </div>}
              </>}

              <p className={styles.preview} data-testid="handwriting-preview">
                {previewBank && phaseOf(previewBank) === 1
                  ? `반영하면 배치 ${LAYOUT_KEYS.filter((k) => previewBank.lay[k]).length}/6. 여섯이 다 모이면 글자표가 차기 시작해요.`
                  : <>반영하면 글자표에 <b>+{added.length}자</b>가 새로 채워져요{previewStats && previewStats.partial - stats.partial > 0 ? `, 반쯤 찬 글자 +${previewStats.partial - stats.partial}` : ''}.{added.length ? ` 예: ${added.slice(0, 12).join(' ')}` : ''}</>}
              </p>
            </>}
          <DialogFooter>
            <Button onClick={() => setCard(null)}>아직</Button>
            <Button variant="primary" disabled={card.gathered.reads.length === 0} onClick={() => { const then = card.then; const next = applyCard(); if (then === 'roll' && next) window.setTimeout(() => rollDice(next), 50) }} data-testid="handwriting-ok">ㅇㅋ, 이대로 반영</Button>
          </DialogFooter>
        </>}
      </DialogContent>
    </Dialog>
  </div>
}
