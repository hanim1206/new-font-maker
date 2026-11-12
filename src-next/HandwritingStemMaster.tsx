import { useEffect, useMemo, useRef, useState } from 'react'
import { resolveGlyphInkPrimitives } from '../src/services/glyphInkResolver'
import { describeStrokeGeometry, STEM_SHAPE_LABEL } from '../src/services/strokeGrammar'
import type { GlobalStyle } from '../src/stores/globalStyleStore'
import type { PartStyle } from '../src/renderers/SvgRenderer'
import type { DecomposedSyllable, GlyphInkPlacement, Part, ResolvedStrokeInkSource, StrokeDataV2 } from '../src/types'
import { weightToMultiplier } from '../src/utils/globalStyleUtils'
import { Button } from './components/ui/button'
import { ChoiceGroup, ChoiceItem } from './components/ui/choice-group'
import { EDIT_COLOR } from './editColors'
import { tailCutsOf, tailIsOpen, useTailCutMask } from './HandwritingTailCut'
import type { CutAngleResolver, TailCut } from './HandwritingTailCut'
import styles from './HandwritingStemMaster.module.css'

/**
 * 줄기마스터(손글씨 실험실, 곧은 세로줄기만). 선 하나의 윤곽을 머리 구간 · 맺음 구간으로 빚어 두고 같은 묶음의 줄기에 입힌다.
 * 머리 · 맺음 구간은 길이가 고정이고 몸통(굵기 그대로인 막대)만 줄기 길이만큼 늘어난다. 그래서 엔진이 그린 줄기는 그대로 두고
 * 열린 머리 · 열린 맺음 자리만 가림판으로 지운 뒤 그 자리에 빚은 꼴을 덧그린다 — 닿은 끝(ㅁ의 귀, ㅗ의 짧은기둥 아래)은 안 건드린다.
 * 좌표는 굵기 배수다: x는 줄기 가운데가 0(몸통은 −0.5~0.5), 머리의 y는 줄기 윗끝이 0(아래로 +), 맺음의 y는 아랫끝이 0(위로 −).
 */
export interface MasterPoint { x: number; y: number; in?: { x: number; y: number }; out?: { x: number; y: number } }
export interface StemMasterShape {
  /** 프리셋 이름. 손으로 고치면 `custom`. */
  preset: string
  /** 머리 구간 길이. 머리 길은 (−0.5, headLen)에서 시작해 (0.5, headLen)에서 끝난다. */
  headLen: number
  /** 맺음 구간 길이. 맺음 길은 (0.5, −tailLen)에서 시작해 (−0.5, −tailLen)에서 끝난다. */
  tailLen: number
  head: MasterPoint[]
  tail: MasterPoint[]
}
export type StemMasterResolver = (source: ResolvedStrokeInkSource, shapeLabel: string) => StemMasterShape | undefined

const J = (headLen: number, tailLen: number) => ({ hl: { x: -0.5, y: headLen }, hr: { x: 0.5, y: headLen }, tr: { x: 0.5, y: -tailLen }, tl: { x: -0.5, y: -tailLen } })
const straight = (preset: string, headLen: number, tailLen: number, headMid: MasterPoint[], tailMid: MasterPoint[]): StemMasterShape => {
  const j = J(headLen, tailLen)
  return { preset, headLen, tailLen, head: [j.hl, ...headMid, j.hr], tail: [j.tr, ...tailMid, j.tl] }
}
export const STEM_MASTER_PRESETS: { id: string; label: string; make: () => StemMasterShape }[] = [
  { id: 'gothic', label: '고딕', make: () => straight('gothic', 1, 1, [{ x: -0.5, y: 0 }, { x: 0.5, y: 0 }], [{ x: 0.5, y: 0 }, { x: -0.5, y: 0 }]) },
  { id: 'myeongjo', label: '명조', make: () => straight('myeongjo', 1.4, 1.6, [{ x: -1.15, y: -0.3 }, { x: 0.5, y: 0.25 }], [{ x: 0.5, y: -0.15 }, { x: 0.3, y: 0 }, { x: -0.3, y: -0.4 }]) },
  // 붓: 둥글게 맺힌 부리, 맺음은 왼쪽 면이 굽어 들며 가늘어진다.
  { id: 'brush', label: '붓', make: () => { const j = J(1.6, 2.4); return { preset: 'brush', headLen: 1.6, tailLen: 2.4,
    head: [j.hl, { x: -1.15, y: 0.75, in: { x: -1.0, y: 1.3 }, out: { x: -1.3, y: 0.25 } }, { x: -0.3, y: -0.1, in: { x: -0.9, y: -0.1 }, out: { x: 0.1, y: -0.1 } }, { x: 0.5, y: 0.2, in: { x: 0.4, y: 0 } }, j.hr],
    tail: [j.tr, { x: 0.5, y: -0.1 }, { x: 0.35, y: 0, out: { x: 0, y: -0.5 } }, { ...j.tl, in: { x: -0.5, y: -1.1 } }] } } },
  // 둥근: 접합점에서 곧게 가다 반원으로 닫힌다.
  { id: 'round', label: '둥근', make: () => { const j = J(0.5, 0.5); return { preset: 'round', headLen: 0.5, tailLen: 0.5,
    head: [{ ...j.hl, out: { x: -0.5, y: 0.22 } }, { x: 0, y: 0, in: { x: -0.28, y: 0 }, out: { x: 0.28, y: 0 } }, { ...j.hr, in: { x: 0.5, y: 0.22 } }],
    tail: [{ ...j.tr, out: { x: 0.5, y: -0.22 } }, { x: 0, y: 0, in: { x: 0.28, y: 0 }, out: { x: -0.28, y: 0 } }, { ...j.tl, in: { x: -0.5, y: -0.22 } }] } } },
  { id: 'flare', label: '나팔', make: () => straight('flare', 1.3, 1.3, [{ x: -0.9, y: 0 }, { x: 0.9, y: 0 }], [{ x: 0.9, y: 0 }, { x: -0.9, y: 0 }]) },
  { id: 'slant', label: '비스듬', make: () => straight('slant', 0.9, 0.9, [{ x: -0.5, y: 0.45 }, { x: 0.5, y: 0 }], [{ x: 0.5, y: 0 }, { x: -0.5, y: -0.45 }]) },
]
export const defaultStemMaster = (): StemMasterShape => STEM_MASTER_PRESETS.find((p) => p.id === 'brush')!.make()
export const stemMasterLabel = (master: StemMasterShape) => STEM_MASTER_PRESETS.find((p) => p.id === master.preset)?.label ?? '직접 빚은 꼴'
export function isStemMasterShape(value: unknown): value is StemMasterShape {
  const v = value as StemMasterShape | undefined
  return !!v && typeof v.headLen === 'number' && typeof v.tailLen === 'number' && Array.isArray(v.head) && Array.isArray(v.tail) && v.head.length >= 2 && v.tail.length >= 2
}

type XY = { x: number; y: number }
/** 점 목록 → SVG 길(M 없이 이어 붙일 수 있게 첫 점은 따로). 손잡이가 있으면 곡선. */
function segmentsD(points: readonly MasterPoint[], map: (p: XY) => XY): string {
  const f = (p: XY) => { const q = map(p); return `${q.x.toFixed(2)} ${q.y.toFixed(2)}` }
  return points.slice(1).map((cur, i) => {
    const prev = points[i]
    return prev.out || cur.in ? `C ${f(prev.out ?? prev)} ${f(cur.in ?? cur)} ${f(cur)}` : `L ${f(cur)}`
  }).join(' ')
}

export interface MasterPiece { source: ResolvedStrokeInkSource; d: string }
type Prim = Parameters<typeof tailCutsOf>[0][number]
const V = 100

/** 글자 하나에서 마스터가 입혀질 자리: 덧그릴 꼴(`pieces`)과 그 자리의 원래 잉크를 지울 가림판(`masks`). */
export function stemMasterInkOf(primitives: readonly Prim[], masterOf: StemMasterResolver): { pieces: MasterPiece[]; masks: TailCut[] } {
  const pieces: MasterPiece[] = [], masks: TailCut[] = []
  for (const prim of primitives) {
    const { stroke, box, source } = prim
    if (stroke.closed || stroke.points.length < 2) continue
    const others = primitives.filter((p) => p.source.part === source.part && p.source.channel === source.channel && p.stroke.id !== stroke.id).map((p) => p.stroke)
    const view = (p: XY) => ({ x: (box.x + p.x * box.width) * V, y: (box.y + p.y * box.height) * V })
    const t = stroke.thickness * prim.weightMultiplier * V
    if (t <= 0) continue
    for (const seg of describeStrokeGeometry(stroke, others).segments) {
      if (seg.shape !== 'serojulgi' || !seg.head || !seg.tail) continue
      const a = stroke.points[seg.fromPoint], b = stroke.points[seg.toPoint]
      // 곧은 마디만(이 실험의 범위). 휜 줄기는 엔진 꼴 그대로 둔다.
      if (a.handleOut || b.handleIn) continue
      const master = masterOf(source, STEM_SHAPE_LABEL[seg.shape])
      if (!master) continue
      const top = view(stroke.points[seg.head.point]), bottom = view(stroke.points[seg.tail.point])
      const length = Math.hypot(bottom.x - top.x, bottom.y - top.y)
      if (!length) continue
      const along = { x: (bottom.x - top.x) / length, y: (bottom.y - top.y) / length }
      const right = { x: along.y, y: -along.x }
      const headOpen = seg.head.kind === 'end' && seg.head.open
      const tailOpen = seg.tail.kind === 'end' && (seg.tail.open || tailIsOpen(stroke, seg.tail.point, others))
      // 짧은 줄기: 머리 + 맺음 구간이 줄기보다 길면 세로로만 줄인다.
      const want = (headOpen ? master.headLen : 0) + (tailOpen ? master.tailLen : 0)
      const k = want > 0 ? Math.min(1, length / (want * t)) : 1
      const put = (origin: XY) => (p: XY) => ({ x: origin.x + right.x * p.x * t + along.x * p.y * t * k, y: origin.y + right.y * p.x * t + along.y * p.y * t * k })
      const rect = (origin: XY, from: number, to: number) => [[-0.56, from], [0.56, from], [0.56, to], [-0.56, to]].map(([x, y]) => { const q = put(origin)({ x, y }); return `${q.x.toFixed(2)},${q.y.toFixed(2)}` }).join(' ')
      const pt = (p: XY) => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`
      if (headOpen) {
        const map = put(top)
        // 몸통과 틈이 안 보이게 구간 선 아래로 조금 겹친다.
        const lap = [map({ x: 0.5, y: master.headLen + 0.12 }), map({ x: -0.5, y: master.headLen + 0.12 })]
        pieces.push({ source, d: `M ${pt(map(master.head[0]))} ${segmentsD(master.head, map)} L ${pt(lap[0])} L ${pt(lap[1])} Z` })
        masks.push({ source, points: rect(top, -1.3 / k, master.headLen) })
      }
      if (tailOpen) {
        const map = put(bottom)
        const lap = [map({ x: -0.5, y: -master.tailLen - 0.12 }), map({ x: 0.5, y: -master.tailLen - 0.12 })]
        pieces.push({ source, d: `M ${pt(map(master.tail[0]))} ${segmentsD(master.tail, map)} L ${pt(lap[0])} L ${pt(lap[1])} Z` })
        masks.push({ source, points: rect(bottom, -master.tailLen, 1.3 / k) })
      }
    }
  }
  return { pieces, masks }
}

/**
 * 부위 스타일 규칙이 그리는 것 전부(맺음 깎기 + 줄기마스터)를 한 번에. `partStyles`는 렌더러에 넘기고 `overlay`는 `children` 맨 앞에 넣는다.
 * 규칙이 하나도 없으면 획을 풀지 않는다.
 */
export function usePartRuleInk(
  syllable: DecomposedSyllable, placement: GlyphInkPlacement, style: GlobalStyle,
  cutAngleOf: CutAngleResolver | null | undefined, masterOf: StemMasterResolver | null | undefined,
  base?: Partial<Record<Part, PartStyle>>,
) {
  const made = useMemo(() => {
    if (!cutAngleOf && !masterOf) return { cuts: [] as TailCut[], pieces: [] as MasterPiece[], masks: [] as TailCut[] }
    const resolved = resolveGlyphInkPrimitives({ syllable, placement, weightMultiplier: weightToMultiplier(style.weight), globalLinecap: style.linecap, globalLinejoin: style.linejoin, horizontalInkBounds: { min: 0, max: 1 } })
    const prims = resolved.primitives.map((p) => ({ stroke: p.stroke as StrokeDataV2, box: p.box, source: p.source, weightMultiplier: p.weightMultiplier, effectiveLinecap: p.effectiveLinecap }))
    const master = masterOf ? stemMasterInkOf(prims, masterOf) : { pieces: [], masks: [] }
    return { cuts: cutAngleOf ? tailCutsOf(prims, cutAngleOf) : [], ...master }
  }, [syllable, placement, style.weight, style.linecap, style.linejoin, cutAngleOf, masterOf])
  const allMasks = useMemo(() => [...made.cuts, ...made.masks], [made])
  const mask = useTailCutMask(allMasks, base)
  /** 덧그릴 것. `colorOf`는 그 획의 색(강조 · 자리 색), `only`는 그릴 파트 거름. */
  const overlay = (colorOf?: (source: ResolvedStrokeInkSource) => string | undefined, only?: (source: ResolvedStrokeInkSource) => boolean) => <>
    {mask.defs}
    {made.pieces.filter((piece) => !only || only(piece.source)).map((piece, i) => <path key={`master-${i}`} d={piece.d} fill={colorOf?.(piece.source) ?? EDIT_COLOR.foreground} pointerEvents="none" data-stem-master="true" />)}
  </>
  return { partStyles: mask.partStyles, overlay, cuts: made.cuts, pieces: made.pieces }
}

// ── 빚는 캔버스 ─────────────────────────────────────────────────────────────────────────────────

const CANVAS = { w: 300, h: 420, unit: 44, stem: 6.4 }
/** 빚는 도구. `point`는 점 · 손잡이 편집, 나머지는 덩어리를 눌러 빚는다. */
type SculptTool = 'point' | 'inflate' | 'pinch'
const TOOL_LABEL: Record<SculptTool, string> = { point: '점 고치기', inflate: '부풀리기', pinch: '조이기' }
const TOOL_HINT: Record<SculptTool, string> = {
  point: '점과 손잡이를 끌어 윤곽을 고쳐요.',
  inflate: '머리나 맺음을 누르고 있으면 한 칸씩 커져요.',
  pinch: '머리나 맺음 위에서 좌우로 쓸면 한 칸씩 줄어요. 두 손가락 쓸기도 돼요.',
}
/** 붓이 닿는 반지름 · 한 번에 움직이는 칸(굵기 배수). 결과는 늘 0.05 칸에 붙는다. */
const BRUSH = 0.9, STEP = 0.1, HOLD_MS = 220, SWIPE_PX = 26
const snap = (v: number) => Math.round(v * 20) / 20

/** 붓 자리(`at`, 구역 좌표) 안의 점을 구역 뿌리(접합선 가운데)에서 멀어지게 · 가까워지게 한 칸 옮긴다. 접합점은 그대로. */
export function sculptZone(points: readonly MasterPoint[], zone: 'head' | 'tail', len: number, at: XY, tool: 'inflate' | 'pinch'): MasterPoint[] | null {
  const root = { x: 0, y: zone === 'head' ? len : -len }
  let changed = false
  const next = points.map((p, i) => {
    if (i === 0 || i === points.length - 1 || Math.hypot(p.x - at.x, p.y - at.y) > BRUSH) return p
    const dx = p.x - root.x, dy = p.y - root.y
    const d = Math.hypot(dx, dy)
    if (tool === 'pinch' ? d <= 0.3 : d >= 3.2) return p
    const s = tool === 'inflate' ? STEP : -STEP
    const x = snap(p.x + (d ? dx / d : 0) * s), y = snap(p.y + (d ? dy / d : zone === 'head' ? -1 : 1) * s)
    const mx = x - p.x, my = y - p.y
    if (!mx && !my) return p
    changed = true
    return { ...p, x, y, ...(p.in ? { in: { x: p.in.x + mx, y: p.in.y + my } } : {}), ...(p.out ? { out: { x: p.out.x + mx, y: p.out.y + my } } : {}) }
  })
  return changed ? next : null
}

type Sel = { zone: 'head' | 'tail'; i: number; part: 'p' | 'in' | 'out' } | { line: 'head' | 'tail' }

/** 선 하나를 빚는 캔버스. 점 · 손잡이 · 구간 선을 끈다. 접합점(구간 선 위 두 점)은 구간 선을 따라 움직인다. */
export function StemMasterCanvas({ master, onChange }: { master: StemMasterShape; onChange: (next: StemMasterShape) => void }) {
  const svgRef = useRef<SVGSVGElement>(null)
  const drag = useRef<Sel | null>(null)
  const [picked, setPicked] = useState<{ zone: 'head' | 'tail'; i: number } | null>(null)
  const [tool, setTool] = useState<SculptTool>('point')
  const [brush, setBrush] = useState<{ x: number; y: number; down: boolean } | null>(null)
  const { w, h, unit, stem } = CANVAS
  const x0 = w / 2, yTop = (h - stem * unit) / 2, yBottom = yTop + stem * unit
  // 누르고 있는 동안 도는 타이머와 휠이 늘 지금 꼴을 보게 한다.
  const live = useRef({ master, onChange, tool })
  live.current = { master, onChange, tool }
  const hold = useRef<{ timer: number | null; at: { x: number; y: number }; lastX: number; swipe: number; fast: boolean }>({ timer: null, at: { x: 0, y: 0 }, lastX: 0, swipe: 0, fast: false })
  const viewAt = (e: { clientX: number; clientY: number }) => {
    const box = svgRef.current!.getBoundingClientRect()
    return { x: (e.clientX - box.left) * w / box.width, y: (e.clientY - box.top) * h / box.height }
  }
  const sculpt = (kind: 'inflate' | 'pinch', at: { x: number; y: number }) => {
    const m = live.current.master
    const head = sculptZone(m.head, 'head', m.headLen, { x: (at.x - x0) / unit, y: (at.y - yTop) / unit }, kind)
    const tail = sculptZone(m.tail, 'tail', m.tailLen, { x: (at.x - x0) / unit, y: (at.y - yBottom) / unit }, kind)
    if (head || tail) live.current.onChange({ ...m, head: head ?? m.head, tail: tail ?? m.tail, preset: 'custom' })
  }
  const stopHold = () => { if (hold.current.timer !== null) { window.clearInterval(hold.current.timer); hold.current.timer = null } }
  useEffect(() => stopHold, [])
  // 두 손가락 좌우 쓸기(휠 가로). 화면이 같이 밀리지 않게 막아야 해서 직접 건다.
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    let acc = 0
    const onWheel = (e: WheelEvent) => {
      if (live.current.tool !== 'pinch' || Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return
      e.preventDefault()
      acc += Math.abs(e.deltaX)
      while (acc >= SWIPE_PX * 2) { acc -= SWIPE_PX * 2; sculpt('pinch', viewAt(e)) }
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const toolDown = (e: React.PointerEvent) => {
    const at = viewAt(e)
    hold.current = { timer: null, at, lastX: at.x, swipe: 0, fast: e.pressure > 0.6 }
    setBrush({ ...at, down: true })
    svgRef.current?.setPointerCapture(e.pointerId)
    if (tool === 'inflate') {
      sculpt('inflate', at)
      // 세기를 읽는 기기(펜슬)는 세게 누르면 더 빨리 커진다.
      hold.current.timer = window.setInterval(() => sculpt('inflate', hold.current.at), hold.current.fast ? HOLD_MS / 2 : HOLD_MS)
    }
  }
  const toolMove = (e: React.PointerEvent) => {
    const at = viewAt(e)
    setBrush((b) => ({ ...at, down: b?.down ?? false }))
    if (!brush?.down) return
    hold.current.at = at
    if (tool === 'pinch') {
      hold.current.swipe += Math.abs(at.x - hold.current.lastX)
      hold.current.lastX = at.x
      while (hold.current.swipe >= SWIPE_PX) { hold.current.swipe -= SWIPE_PX; sculpt('pinch', at) }
    }
  }
  const toolUp = () => { stopHold(); setBrush((b) => (b ? { ...b, down: false } : b)) }
  const toView = (zone: 'head' | 'tail') => (p: XY) => ({ x: x0 + p.x * unit, y: (zone === 'head' ? yTop : yBottom) + p.y * unit })
  const fromEvent = (e: React.PointerEvent, zone: 'head' | 'tail'): XY => {
    const box = svgRef.current!.getBoundingClientRect()
    const vx = (e.clientX - box.left) * w / box.width, vy = (e.clientY - box.top) * h / box.height
    return { x: Math.round((vx - x0) / unit * 20) / 20, y: Math.round((vy - (zone === 'head' ? yTop : yBottom)) / unit * 20) / 20 }
  }
  const outline = `M ${(() => { const q = toView('head')(master.head[0]); return `${q.x} ${q.y}` })()} ${segmentsD(master.head, toView('head'))} L ${(() => { const q = toView('tail')(master.tail[0]); return `${q.x} ${q.y}` })()} ${segmentsD(master.tail, toView('tail'))} Z`
  const setPoints = (zone: 'head' | 'tail', points: MasterPoint[], extra?: Partial<StemMasterShape>) => onChange({ ...master, ...extra, [zone]: points, preset: 'custom' })
  const start = (sel: Sel) => (e: React.PointerEvent) => {
    e.stopPropagation(); drag.current = sel
    if ('zone' in sel) setPicked({ zone: sel.zone, i: sel.i })
    svgRef.current?.setPointerCapture(e.pointerId)
  }
  const move = (e: React.PointerEvent) => {
    const sel = drag.current
    if (!sel) return
    if ('line' in sel) {
      // 구간 선: 길이를 바꾸고 접합점 둘을 같이 옮긴다.
      const zone = sel.line
      const at = fromEvent(e, zone)
      const len = Math.max(0.2, Math.min(stem / 2 - 0.2, zone === 'head' ? at.y : -at.y))
      const points = master[zone].map((p, i, all) => (i === 0 || i === all.length - 1 ? { ...p, y: zone === 'head' ? len : -len } : p))
      setPoints(zone, points, zone === 'head' ? { headLen: len } : { tailLen: len })
      return
    }
    const at = fromEvent(e, sel.zone)
    const points = master[sel.zone].map((p, i) => {
      if (i !== sel.i) return p
      if (sel.part === 'in') return { ...p, in: at }
      if (sel.part === 'out') return { ...p, out: at }
      const dx = at.x - p.x, dy = at.y - p.y
      return { ...p, x: at.x, y: at.y, ...(p.in ? { in: { x: p.in.x + dx, y: p.in.y + dy } } : {}), ...(p.out ? { out: { x: p.out.x + dx, y: p.out.y + dy } } : {}) }
    })
    setPoints(sel.zone, points)
  }
  const end = () => { drag.current = null }
  const cur = picked ? master[picked.zone][picked.i] : null
  const isJoint = (zone: 'head' | 'tail', i: number) => i === 0 || i === master[zone].length - 1
  const addPoint = () => {
    if (!picked) return
    const list = master[picked.zone]
    const i = Math.min(picked.i, list.length - 2)
    const a = list[i], b = list[i + 1]
    const next = [...list.slice(0, i + 1), { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, ...list.slice(i + 1)]
    setPoints(picked.zone, next); setPicked({ zone: picked.zone, i: i + 1 })
  }
  const removePoint = () => {
    if (!picked || isJoint(picked.zone, picked.i)) return
    setPoints(picked.zone, master[picked.zone].filter((_, i) => i !== picked.i)); setPicked(null)
  }
  const toggleCurve = () => {
    if (!picked || !cur) return
    const list = master[picked.zone]
    const prev = list[picked.i - 1], next = list[picked.i + 1]
    const curved = !!(cur.in || cur.out)
    // 굽히기: 앞뒤 점을 잇는 방향으로 손잡이를 낸다.
    const dir = prev && next ? { x: (next.x - prev.x) / 4, y: (next.y - prev.y) / 4 } : { x: 0, y: 0 }
    const point: MasterPoint = curved ? { x: cur.x, y: cur.y } : { x: cur.x, y: cur.y, ...(prev ? { in: { x: cur.x - dir.x, y: cur.y - dir.y } } : {}), ...(next ? { out: { x: cur.x + dir.x, y: cur.y + dir.y } } : {}) }
    setPoints(picked.zone, list.map((p, i) => (i === picked.i ? point : p)))
  }
  const sculpting = tool !== 'point'
  const zoneY = { head: yTop + master.headLen * unit, tail: yBottom - master.tailLen * unit }
  return <div className={styles.canvasWrap}>
    <div className={styles.toolPick}><ChoiceGroup variant="segment" aria-label="빚는 도구">
      {(Object.keys(TOOL_LABEL) as SculptTool[]).map((id) => <ChoiceItem key={id} checked={tool === id} onClick={() => { stopHold(); setTool(id); setPicked(null); setBrush(null) }} data-testid={`stem-master-tool-${id}`}>{TOOL_LABEL[id]}</ChoiceItem>)}
    </ChoiceGroup></div>
    <svg ref={svgRef} viewBox={`0 0 ${w} ${h}`} className={sculpting ? `${styles.canvas} ${styles.sculpt}` : styles.canvas} onPointerMove={sculpting ? toolMove : move} onPointerUp={sculpting ? toolUp : end} onPointerCancel={sculpting ? toolUp : end} onPointerLeave={sculpting ? () => { if (!brush?.down) setBrush(null) } : undefined} onPointerDown={sculpting ? toolDown : () => setPicked(null)} data-testid="stem-master-canvas">
      <path d={outline} fill={EDIT_COLOR.foreground} />
      <line x1={x0} y1={yTop} x2={x0} y2={yBottom} stroke={EDIT_COLOR.surface} strokeOpacity={0.5} strokeWidth={1.5} strokeDasharray="5 5" pointerEvents="none" />
      {(['head', 'tail'] as const).map((zone) => <g key={zone}>
        <line x1={12} y1={zoneY[zone]} x2={w - 12} y2={zoneY[zone]} stroke={EDIT_COLOR.editSelect} strokeWidth={1.2} strokeDasharray="5 4" pointerEvents="none" />
        <line x1={12} y1={zoneY[zone]} x2={w - 12} y2={zoneY[zone]} stroke="transparent" strokeWidth={14} className={styles.zoneLine} pointerEvents={sculpting ? 'none' : undefined} onPointerDown={start({ line: zone })} data-testid={`stem-master-line-${zone}`} />
        <text x={14} y={zone === 'head' ? zoneY[zone] - 6 : zoneY[zone] + 14} fontSize={11} fill={EDIT_COLOR.editSelect}>{zone === 'head' ? '머리 구간' : '맺음 구간'}</text>
      </g>)}
      {sculpting && (['head', 'tail'] as const).flatMap((zone) => master[zone].slice(1, -1).map((p, i) => { const q = toView(zone)(p); return <circle key={`${zone}-${i}`} cx={q.x} cy={q.y} r={2.5} fill={EDIT_COLOR.editSelect} pointerEvents="none" /> }))}
      {sculpting && brush && <circle cx={brush.x} cy={brush.y} r={BRUSH * unit} fill={EDIT_COLOR.editSelect} fillOpacity={brush.down ? 0.22 : 0.1} stroke={EDIT_COLOR.editSelect} strokeWidth={1.2} pointerEvents="none" data-testid="stem-master-brush" />}
      {!sculpting && cur && picked && (['in', 'out'] as const).map((part) => { const hp = cur[part]; if (!hp) return null; const a = toView(picked.zone)(cur), b = toView(picked.zone)(hp); return <g key={part}>
        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={EDIT_COLOR.editHandle} strokeWidth={1} pointerEvents="none" />
        <rect x={b.x - 4.5} y={b.y - 4.5} width={9} height={9} fill={EDIT_COLOR.surface} stroke={EDIT_COLOR.editHandle} strokeWidth={1.5} className={styles.grab} onPointerDown={start({ zone: picked.zone, i: picked.i, part })} />
      </g> })}
      {!sculpting && (['head', 'tail'] as const).flatMap((zone) => master[zone].map((p, i) => {
        const q = toView(zone)(p)
        const on = picked?.zone === zone && picked.i === i
        // 접합점은 구간 선으로만 움직인다.
        return isJoint(zone, i)
          ? <circle key={`${zone}-${i}`} cx={q.x} cy={q.y} r={4} fill={EDIT_COLOR.editSelect} onPointerDown={start({ line: zone })} className={styles.zoneLine} />
          : <circle key={`${zone}-${i}`} cx={q.x} cy={q.y} r={on ? 7 : 6} fill={on ? EDIT_COLOR.editSelect : EDIT_COLOR.surface} stroke={EDIT_COLOR.editSelect} strokeWidth={2} className={styles.grab} onPointerDown={start({ zone, i, part: 'p' })} data-testid={`stem-master-point-${zone}-${i}`} />
      }))}
    </svg>
    <p className={styles.hint}>{TOOL_HINT[tool]}</p>
    {!sculpting && <div className={styles.tools}>
      <Button size="sm" disabled={!picked} onClick={addPoint}>점 더하기</Button>
      <Button size="sm" disabled={!picked || isJoint(picked.zone, picked.i)} onClick={removePoint}>점 지우기</Button>
      <Button size="sm" disabled={!picked || isJoint(picked.zone, picked.i)} onClick={toggleCurve}>{cur && (cur.in || cur.out) ? '펴기' : '굽히기'}</Button>
    </div>}
  </div>
}
