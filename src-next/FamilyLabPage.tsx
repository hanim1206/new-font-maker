import { useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { ChevronLeft, ChevronRight, Link2, RotateCcw, Trash2, Undo2, Unlink } from 'lucide-react'
import { getBaseJamo } from '../src/stores/jamoStore'
import { FAMILY_STORE_KEY, loadFamilyEdits } from './familyEditsStore'
import type { StrokeDataV2 } from '../src/types'
import {
  cutFamilyStroke, FAMILY_STAGES, familyStrokes, findFamilyLinks, linkOf, moveFamilyPoint,
  presetConsonantStrokes, relinkFamilyStroke,
} from '../src/services/jamoFamily'
import type { FamilyEdits, FamilyLinks, XY } from '../src/services/jamoFamily'
import {
  addCircle, addLine, boxToS, CANVAS_PAD, dragPathEnd, drawFreehand, emptyDrawn, magnetOf, nibCandidate, nibCommit, nibTrail,
  cellRect, eraseRect, pathAt, pathEnds, pathToStroke, projOn, removePath, removeRuler, rulerHit, snapPoint,
} from '../src/services/rulerPen'
import type { DrawnJamo, NibCandidate, NibTrail, V } from '../src/services/rulerPen'
import { Button } from './components/ui/button'
import { Pressable } from './components/ui/pressable'
import { EDIT_COLOR } from './editColors'
import styles from './FamilyLabPage.module.css'

/** 캔버스 칸 수. 점은 이 칸에 붙는다. */
const GRID = 20
const CANVAS = 440
/** 자모 상자를 캔버스 안에 놓는 여백(캔버스 비율). */
const PAD = CANVAS_PAD

/** 상자 좌표(0~1) → 캔버스 좌표. */
const toCanvas = (p: XY, size: number): XY => ({ x: (PAD + p.x * (1 - 2 * PAD)) * size, y: (PAD + p.y * (1 - 2 * PAD)) * size })
const fromCanvas = (p: XY, size: number): XY => ({ x: (p.x / size - PAD) / (1 - 2 * PAD), y: (p.y / size - PAD) / (1 - 2 * PAD) })
/** 상자 좌표를 캔버스 칸에 붙인다. */
const snap = (p: XY): XY => {
  const c = toCanvas(p, GRID)
  return fromCanvas({ x: Math.round(c.x), y: Math.round(c.y) }, GRID)
}

/** 캔버스 S 좌표 u 가까이 지나는 프리셋 획(그은 선 d… 은 뺀다). 곡선은 잘게 나눠 잰다. */
function presetStrokeAt(strokes: StrokeDataV2[], u: V): string | null {
  let best: string | null = null, bd = Infinity
  for (const s of strokes) {
    if (s.id.startsWith('d')) continue
    const tol = Math.max(2, s.thickness * 100 * (1 - 2 * PAD) / 2 + 1)
    const pts = s.points, segs: [typeof pts[number], typeof pts[number]][] = []
    for (let i = 1; i < pts.length; i++) segs.push([pts[i - 1], pts[i]])
    if (s.closed && pts.length > 1) segs.push([pts[pts.length - 1], pts[0]])
    for (const [a, b] of segs) {
      const c0 = a.handleOut ?? a, c1 = b.handleIn ?? b
      for (let k = 0; k <= 24; k++) {
        const t = k / 24, m = 1 - t
        const x = m * m * m * a.x + 3 * m * m * t * c0.x + 3 * m * t * t * c1.x + t * t * t * b.x
        const y = m * m * m * a.y + 3 * m * m * t * c0.y + 3 * m * t * t * c1.y + t * t * t * b.y
        const q = boxToS({ x, y }), d = Math.hypot(q[0] - u[0], q[1] - u[1])
        if (d < tol && d < bd) { bd = d; best = s.id }
      }
    }
  }
  return best
}

function strokeD(s: StrokeDataV2, size: number): string {
  const pts = s.points
  if (!pts.length) return ''
  const P = (p: XY) => { const c = toCanvas(p, size); return `${c.x.toFixed(2)} ${c.y.toFixed(2)}` }
  let d = `M${P(pts[0])}`
  const seg = (a: typeof pts[number], b: typeof pts[number]) => {
    d += a.handleOut || b.handleIn ? ` C${P(a.handleOut ?? a)} ${P(b.handleIn ?? b)} ${P(b)}` : ` L${P(b)}`
  }
  for (let i = 1; i < pts.length; i++) seg(pts[i - 1], pts[i])
  if (s.closed) { seg(pts[pts.length - 1], pts[0]); d += ' Z' }
  return d
}

type StrokeTie = 'own' | 'linked' | 'mixed'
const tieOf = (links: FamilyLinks, edits: FamilyEdits, ch: string, s: StrokeDataV2): StrokeTie => {
  const n = s.points.filter((_, i) => linkOf(links, edits, ch, s.id, i)).length
  return n === 0 ? 'own' : n === s.points.length ? 'linked' : 'mixed'
}

/** 작은 자모 그림(가족 띠 · 전체 지도). */
function JamoThumb({ strokes, size, faint }: { strokes: StrokeDataV2[]; size: number; faint?: boolean }) {
  return <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden>
    {strokes.map((s) => <path key={s.id} d={strokeD(s, size)} fill="none" stroke={faint ? EDIT_COLOR.text5 : EDIT_COLOR.foreground} strokeWidth={s.thickness * size * (1 - 2 * PAD)} strokeLinejoin="miter" strokeLinecap="butt" />)}
  </svg>
}

export function FamilyLabPage() {
  return <div className={styles.page}>
    <header className={styles.header}>
      <span>Family Lab</span>
      <h1>닿자 가족 캔버스</h1>
      <p>가족마다 맨 앞 자모를 먼저 만든다. 옆으로 넘기면 다음 자모가 앞 꼴을 이어받은 채로 열린다. 파란 점은 앞 자모를 가리켜서 여기선 못 움직이고, 앞을 고치면 같이 바뀐다. 따로 가려면 획을 고르고 끊는다. 점은 칸에 붙는다. 저장은 이 브라우저에만.</p>
    </header>
    <FamilyCanvas />
  </div>
}

/** 단계 띠 + 편집 캔버스 + 가족 띠 · 전체 지도. 실험실 페이지와 글자 해부 팝업이 같이 쓴다. */
export function FamilyCanvas({ start, compact }: { start?: string; compact?: boolean }) {
  const presets = useMemo(() => presetConsonantStrokes((ch) => getBaseJamo('choseong', ch)), [])
  const links = useMemo(() => findFamilyLinks(presets), [presets])
  const [edits, setEdits] = useState<FamilyEdits>(loadFamilyEdits)
  const startAt = start ? FAMILY_STAGES.findIndex((s) => s.members.includes(start)) : -1
  const [stageIdx, setStageIdx] = useState(Math.max(0, startAt))
  const [memberIdx, setMemberIdx] = useState(startAt >= 0 ? FAMILY_STAGES[startAt].members.indexOf(start!) : 0)
  const [picked, setPicked] = useState<string | null>(null)
  const [drag, setDrag] = useState<{ stroke: string; index: number } | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  /* 자와 펜 */
  type Tool = 'edit' | 'circle' | 'line' | 'pen' | 'erase'
  const [tool, setToolState] = useState<Tool>('edit')
  const [circleR, setCircleR] = useState(10)
  const [hoverS, setHoverS] = useState<V | null>(null)
  const [lineA, setLineA] = useState<V | null>(null)
  const [sketch, setSketch] = useState<{ pts: V[]; disp: V[]; mk: string | null; lock: boolean; moved: boolean } | null>(null)
  const [nib, setNib] = useState<{ A: V; pathId: number | null; after: string | null; trail: NibTrail | null; cand: NibCandidate | null } | null>(null)
  const [endDrag, setEndDrag] = useState<{ pathId: number; which: 'start' | 'end' } | null>(null)
  const [rulerSel, setRulerSel] = useState<{ type: 'c' | 'l'; id: number } | null>(null)
  /* 되돌리기 — 자모마다 (그은 선, 뺀 프리셋 획) 한 벌씩 */
  type Snap = { drawn: DrawnJamo; hidden: string[] }
  const histRef = useRef<Record<string, Snap[]>>({})
  const lastTap = useRef<{ t: number; u: V } | null>(null)
  const [eraseDrag, setEraseDrag] = useState<{ a: V; b: V } | null>(null)
  const lastErase = useRef<{ t: number; u: V; changed: boolean } | null>(null)

  useEffect(() => { localStorage.setItem(FAMILY_STORE_KEY, JSON.stringify(edits)) }, [edits])

  const stage = FAMILY_STAGES[stageIdx]
  const ch = stage.members[memberIdx]
  const strokes = familyStrokes(presets, links, edits, ch)
  const touched = (c: string) => Object.values(edits.moves[c] ?? {}).some((pts) => Object.values(pts).some((d) => d.x || d.y)) || !!edits.drawn?.[c]?.paths.length || !!edits.hidden?.[c]?.length
  const inherits = (c: string) => Object.values(links[c] ?? {}).some((row) => row.some(Boolean))
  const parentsOf = (c: string) => [...new Set(Object.values(links[c] ?? {}).flatMap((row) => row.filter(Boolean).map((l) => l!.parent)))]
  const affected = (c: string, depth = 0): boolean => touched(c) || (depth < 6 && parentsOf(c).some((p) => affected(p, depth + 1)))
  const pickedStroke = picked ? strokes.find((s) => s.id === picked) : undefined
  const pickedTie = pickedStroke ? tieOf(links, edits, ch, pickedStroke) : null
  const pickedCut = !!picked && !!edits.cut[ch]?.includes(picked)

  const drawn: DrawnJamo = edits.drawn?.[ch] ?? emptyDrawn()
  const thickness = presets[ch]?.[0]?.thickness ?? 0.08
  const hiddenOwn = edits.hidden?.[ch] ?? []
  const snapNow = (): Snap => ({ drawn, hidden: hiddenOwn })
  const presetIds = (presets[ch] ?? []).map((s) => s.id)
  const allPresetsOut = presetIds.length > 0 && presetIds.every((id) => hiddenOwn.includes(id))
  const setDrawn = (next: DrawnJamo) => {
    if (next === drawn) return
    ;(histRef.current[ch] ??= []).push(snapNow())
    setEdits((ed) => ({ ...ed, drawn: { ...ed.drawn, [ch]: next } }))
  }
  const setHidden = (next: string[]) => {
    ;(histRef.current[ch] ??= []).push(snapNow())
    setEdits((ed) => ({ ...ed, hidden: { ...ed.hidden, [ch]: next } }))
  }
  /* 전체 지우기 — 프리셋 획 · 자 · 펜 선을 한 번에 비운다. 되돌리기 한 번이나 '이 자모 처음으로'로 돌아온다 */
  const isBlank = allPresetsOut && !drawn.circles.length && !drawn.lines.length && !drawn.paths.length
  const clearAll = () => {
    if (isBlank) return
    ;(histRef.current[ch] ??= []).push(snapNow())
    clearTransient(); setPicked(null)
    setEdits((ed) => ({ ...ed, drawn: { ...ed.drawn, [ch]: { ...emptyDrawn(), nid: drawn.nid } }, hidden: { ...ed.hidden, [ch]: presetIds } }))
  }
  const undoDrawn = () => {
    const prev = histRef.current[ch]?.pop()
    if (prev) setEdits((ed) => ({ ...ed, drawn: { ...ed.drawn, [ch]: prev.drawn }, hidden: { ...ed.hidden, [ch]: prev.hidden } }))
  }
  const clearTransient = () => { setEraseDrag(null); setLineA(null); setSketch(null); setNib(null); setEndDrag(null); setRulerSel(null) }
  const setTool = (t: Tool) => { clearTransient(); setToolState(t) }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tg = e.target as HTMLElement | null
      if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA')) return
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undoDrawn(); return }
      if (e.key === 'Escape') { setNib(null); setLineA(null); setRulerSel(null) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const go = (stage: number, member: number) => { setStageIdx(stage); setMemberIdx(member); setPicked(null); clearTransient() }
  const step = (dir: 1 | -1) => {
    const m = memberIdx + dir
    if (m >= 0 && m < stage.members.length) return go(stageIdx, m)
    const s = stageIdx + dir
    if (s < 0 || s >= FAMILY_STAGES.length) return
    go(s, dir === 1 ? 0 : FAMILY_STAGES[s].members.length - 1)
  }

  const pointer = (e: ReactPointerEvent): XY | null => {
    const svg = svgRef.current
    if (!svg) return null
    const r = svg.getBoundingClientRect()
    return fromCanvas({ x: (e.clientX - r.left) / r.width * CANVAS, y: (e.clientY - r.top) / r.height * CANVAS }, CANVAS)
  }
  const sOf = (e: ReactPointerEvent): V | null => {
    const svg = svgRef.current
    if (!svg) return null
    const r = svg.getBoundingClientRect()
    return [(e.clientX - r.left) / r.width * 100, (e.clientY - r.top) / r.height * 100]
  }
  const toolDown = (e: ReactPointerEvent) => {
    const u = sOf(e)
    if (!u) return
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    if (tool === 'circle') {
      const hit = rulerHit(drawn, u)
      if (hit) { setRulerSel(hit); return }
      setRulerSel(null); setDrawn(addCircle(drawn, u, circleR)); return
    }
    if (tool === 'line') {
      const q = snapPoint(drawn, u)
      if (!lineA) { const hit = rulerHit(drawn, u); if (hit) { setRulerSel(hit); return } setRulerSel(null); setLineA(q); return }
      setDrawn(addLine(drawn, lineA, q)); setLineA(null); return
    }
    if (tool === 'erase') { setEraseDrag({ a: u, b: u }); return }
    if (tool === 'pen') {
      const m = magnetOf(drawn, u)
      setSketch({ pts: [u], disp: [m ? m.proj : u], mk: m ? m.r.k : null, lock: !!m, moved: false })
    }
  }
  const toolMove = (e: ReactPointerEvent) => {
    const u = sOf(e)
    if (!u) return
    setHoverS(u)
    if (tool === 'erase' && eraseDrag) { setEraseDrag({ ...eraseDrag, b: u }); return }
    if (tool === 'pen' && sketch) {
      const L = sketch.pts[sketch.pts.length - 1]
      if (Math.hypot(u[0] - L[0], u[1] - L[1]) < 0.3) return
      const first = sketch.pts[0]
      if (sketch.lock) {
        const m = magnetOf(drawn, first, 3)
        setSketch({ ...sketch, pts: [...sketch.pts, u], disp: [...sketch.disp, m ? projOn(m.r, u) : u], moved: sketch.moved || Math.hypot(u[0] - first[0], u[1] - first[1]) > 2 })
      } else {
        const m = magnetOf(drawn, u, 2.2, sketch.mk)
        setSketch({ ...sketch, pts: [...sketch.pts, u], disp: [...sketch.disp, m ? m.proj : u], mk: m ? m.r.k : null, moved: sketch.moved || Math.hypot(u[0] - first[0], u[1] - first[1]) > 2 })
      }
      return
    }
    if (tool === 'pen' && nib) {
      const trail = nibTrail(drawn, nib.A, u, nib.trail)
      setNib({ ...nib, trail, cand: nibCandidate(drawn, nib.A, u, trail, nib.after) })
    }
  }
  const toolUp = (e: ReactPointerEvent) => {
    const u = sOf(e)
    if (tool === 'erase' && eraseDrag && u) { eraseUp(eraseDrag.a, u); return }
    if (tool !== 'pen' || !sketch || !u) return
    const sk = sketch
    setSketch(null)
    if (sk.moved) { setNib(null); setDrawn(drawFreehand(drawn, sk.pts)); return }
    /* 톡: 펜촉. 첫 톡은 시작, 다음 톡마다 마디를 놓는다. 같은 자리 두 번이면 끝 */
    const now = Date.now(), lt = lastTap.current
    lastTap.current = { t: now, u }
    const dbl = !!lt && now - lt.t < 400 && Math.hypot(lt.u[0] - u[0], lt.u[1] - u[1]) < 2
    if (nib) {
      if (dbl) { setNib(null); lastTap.current = null; return }
      const cand = nibCandidate(drawn, nib.A, u, nib.trail, nib.after)
      if (!cand) return
      const res = nibCommit(drawn, cand, nib.pathId)
      setDrawn(res.d)
      setNib(cand.locked && nib.after === null ? null : { A: cand.B, pathId: res.pathId, after: res.k, trail: null, cand: null })
      return
    }
    if (!dbl) setNib({ A: snapPoint(drawn, u), pathId: null, after: null, trail: null, cand: null })
  }

  /* 지우개: 칸 하나 · 끈 네모만큼 펜 선을 잘라 낸다. 같은 자리 두 번 톡이면 그 선을 통째로 */
  const eraseUp = (a: V, b: V) => {
    setEraseDrag(null)
    const ca = cellRect(a), cb = cellRect(b)
    const tap = ca.x0 === cb.x0 && ca.y0 === cb.y0 && Math.hypot(a[0] - b[0], a[1] - b[1]) < 2
    const now = Date.now(), lt = lastErase.current
    if (tap && lt && now - lt.t < 400 && Math.hypot(lt.u[0] - a[0], lt.u[1] - a[1]) < 2) {
      lastErase.current = null
      const hist = (histRef.current[ch] ??= [])
      const base = lt.changed && hist.length ? hist[hist.length - 1].drawn : drawn
      const hit = pathAt(base, a)
      const preset = hit ? null : presetStrokeAt(strokes, a)
      if (hit || preset) {
        if (lt.changed) hist.pop()
        hist.push({ drawn: base, hidden: hiddenOwn })
        /* 그은 선이면 통째로 지우고, 프리셋 획이면 숨긴다(이어받던 뒤 자모 획도 같이 빠진다) */
        setEdits((ed) => hit
          ? { ...ed, drawn: { ...ed.drawn, [ch]: removePath(base, hit.id) } }
          : { ...ed, drawn: { ...ed.drawn, [ch]: base }, hidden: { ...ed.hidden, [ch]: [...hiddenOwn, preset!] } })
        if (picked === preset) setPicked(null)
        return
      }
    }
    const next = eraseRect(drawn, cellRect(a, b))
    lastErase.current = tap ? { t: now, u: a, changed: next !== drawn } : null
    setDrawn(next)
  }

  const onMove = (e: ReactPointerEvent) => {
    if (endDrag) { const u = sOf(e); if (u) setEdits((ed) => ({ ...ed, drawn: { ...ed.drawn, [ch]: dragPathEnd(ed.drawn?.[ch] ?? emptyDrawn(), endDrag.pathId, endDrag.which, u) } })); return }
    if (!drag) return
    const at = pointer(e)
    const s = strokes.find((t) => t.id === drag.stroke)
    if (!at || !s) return
    const target = snap(at), now = s.points[drag.index]
    const by = { x: target.x - now.x, y: target.y - now.y }
    if (Math.abs(by.x) < 1e-6 && Math.abs(by.y) < 1e-6) return
    setEdits((ed) => moveFamilyPoint(links, ed, ch, drag.stroke, drag.index, by))
  }

  const resetJamo = () => setEdits((ed) => {
    const moves = { ...ed.moves }; delete moves[ch]
    const cut = { ...ed.cut }; delete cut[ch]
    const drawnAll = { ...ed.drawn }; delete drawnAll[ch]
    const hidden = { ...ed.hidden }; delete hidden[ch]
    return { moves, cut, drawn: drawnAll, hidden }
  })

  const unit = CANVAS / GRID
  return <div className={styles.body} data-compact={compact || undefined}>
    <nav className={styles.stages} aria-label="단계">
      {FAMILY_STAGES.map((s, i) => <Pressable key={s.id} type="button" className={styles.stage} data-on={i === stageIdx || undefined} onClick={() => go(i, 0)} data-testid={`family-stage-${s.id}`}>
        <small>{i + 1}단계{s.members.some(touched) ? ' · 손댐' : ''}</small>
        <b>{s.members.join(' ')}</b>
      </Pressable>)}
    </nav>

    <div className={styles.work}>
      <section className={styles.canvasCard}>
        <div className={styles.canvasHead}>
          <b data-testid="family-current">{ch}</b>
          <span>{!inherits(ch) ? (memberIdx === 0 ? '가족의 첫 자모 · 여기서 시작' : '따로 시작 · 앞 자모를 잇지 않음') : `${parentsOf(ch).join(' · ')}에서 이어받아 열림`}</span>
        </div>
        <svg ref={svgRef} viewBox={`0 0 ${CANVAS} ${CANVAS}`} className={styles.canvas} data-testid="family-canvas"
          onPointerMove={onMove} onPointerUp={() => { setDrag(null); setEndDrag(null) }} onPointerLeave={() => { setDrag(null); setEndDrag(null); setHoverS(null) }}
          onPointerDown={(e) => { if (e.target === e.currentTarget) setPicked(null) }}>
          {Array.from({ length: GRID + 1 }, (_, i) => <g key={i} pointerEvents="none">
            <line x1={i * unit} y1={0} x2={i * unit} y2={CANVAS} stroke={EDIT_COLOR.border} strokeWidth={i % 5 === 0 ? 1 : 0.5} />
            <line x1={0} y1={i * unit} x2={CANVAS} y2={i * unit} stroke={EDIT_COLOR.border} strokeWidth={i % 5 === 0 ? 1 : 0.5} />
          </g>)}
          {strokes.map((s) => {
            const tie = tieOf(links, edits, ch, s)
            return <path key={s.id} d={strokeD(s, CANVAS)} fill="none" strokeLinejoin="miter" strokeLinecap="butt"
              stroke={tie === 'linked' ? EDIT_COLOR.editSelect : EDIT_COLOR.foreground} strokeOpacity={picked && picked !== s.id ? 0.55 : 1}
              strokeWidth={s.thickness * CANVAS * (1 - 2 * PAD)} onPointerDown={() => setPicked(s.id)} data-testid={`family-stroke-${s.id}`} />
          })}
          {picked && <path d={strokeD(strokes.find((s) => s.id === picked)!, CANVAS)} fill="none" stroke={EDIT_COLOR.editSlotCh} strokeWidth={2} pointerEvents="none" />}
          {/* 놓은 자 */}
          <g pointerEvents="none">
            {drawn.circles.map((c) => { const on = rulerSel?.type === 'c' && rulerSel.id === c.id; return <g key={`c${c.id}`}>
              <circle cx={c.x * CANVAS / 100} cy={c.y * CANVAS / 100} r={c.r * CANVAS / 100} fill="none" stroke={EDIT_COLOR.editSelect} strokeWidth={on ? 2.5 : 1} strokeOpacity={tool === 'edit' ? 0.35 : 0.8} />
              <circle cx={c.x * CANVAS / 100} cy={c.y * CANVAS / 100} r={2.5} fill={EDIT_COLOR.editSelect} fillOpacity={tool === 'edit' ? 0.35 : 0.8} />
            </g> })}
            {drawn.lines.map((l) => { const on = rulerSel?.type === 'l' && rulerSel.id === l.id; return <line key={`l${l.id}`} x1={l.a[0] * CANVAS / 100} y1={l.a[1] * CANVAS / 100} x2={l.b[0] * CANVAS / 100} y2={l.b[1] * CANVAS / 100} stroke={EDIT_COLOR.editSelect} strokeWidth={on ? 2.5 : 1} strokeOpacity={tool === 'edit' ? 0.35 : 0.8} /> })}
          </g>
          {strokes.filter((s) => !s.id.startsWith('d')).flatMap((s) => s.points.map((p, i) => {
            const c = toCanvas(p, CANVAS)
            const linked = !!linkOf(links, edits, ch, s.id, i)
            return <circle key={`${s.id}-${i}`} cx={c.x} cy={c.y} r={linked ? 5 : 7}
              fill={linked ? EDIT_COLOR.editSelect : EDIT_COLOR.surface} stroke={linked ? EDIT_COLOR.surface : EDIT_COLOR.editSlotCh} strokeWidth={2.5}
              style={{ cursor: linked ? 'not-allowed' : 'grab' }} data-testid={`family-point-${s.id}-${i}`}
              onPointerDown={(e) => {
                e.stopPropagation(); setPicked(s.id)
                if (linked) return
                ;(e.currentTarget.ownerSVGElement as SVGSVGElement).setPointerCapture(e.pointerId)
                setDrag({ stroke: s.id, index: i })
              }} />
          }))}
          {tool === 'edit' && drawn.paths.flatMap((p) => {
            const e = pathEnds(drawn, p)
            return (['start', 'end'] as const).map((which) => {
              const q = which === 'start' ? e.start : e.end
              if (!q) return null
              return <circle key={`e${p.id}${which}`} cx={q[0] * CANVAS / 100} cy={q[1] * CANVAS / 100} r={7} fill={EDIT_COLOR.surface} stroke={EDIT_COLOR.editSlotCh} strokeWidth={2.5}
                style={{ cursor: 'grab' }} data-testid={`family-drawn-end-${p.id}-${which}`}
                onPointerDown={(ev) => { ev.stopPropagation(); setPicked(`d${p.id}`); (ev.currentTarget.ownerSVGElement as SVGSVGElement).setPointerCapture(ev.pointerId); (histRef.current[ch] ??= []).push(snapNow()); setEndDrag({ pathId: p.id, which }) }} />
            })
          })}
          {/* 미리보기 */}
          <g pointerEvents="none">
            {tool === 'circle' && hoverS && !rulerSel && <circle cx={Math.round(hoverS[0] / 5) * 5 * CANVAS / 100} cy={Math.round(hoverS[1] / 5) * 5 * CANVAS / 100} r={circleR * CANVAS / 100} fill="none" stroke={EDIT_COLOR.editSelect} strokeDasharray="4 3" />}
            {tool === 'line' && lineA && hoverS && (() => { const q = snapPoint(drawn, hoverS); return <line x1={lineA[0] * CANVAS / 100} y1={lineA[1] * CANVAS / 100} x2={q[0] * CANVAS / 100} y2={q[1] * CANVAS / 100} stroke={EDIT_COLOR.editSelect} strokeDasharray="4 3" /> })()}
            {sketch && sketch.disp.length > 1 && <path d={'M' + sketch.disp.map((q) => `${(q[0] * CANVAS / 100).toFixed(1)} ${(q[1] * CANVAS / 100).toFixed(1)}`).join('L')} fill="none" stroke={EDIT_COLOR.editSelect} strokeOpacity={0.45} strokeLinecap="round" strokeLinejoin="round" strokeWidth={thickness * CANVAS * (1 - 2 * PAD)} />}
            {tool === 'erase' && (eraseDrag || hoverS) && (() => { const r = eraseDrag ? cellRect(eraseDrag.a, eraseDrag.b) : cellRect(hoverS!); return <rect x={r.x0 * CANVAS / 100} y={r.y0 * CANVAS / 100} width={(r.x1 - r.x0) * CANVAS / 100} height={(r.y1 - r.y0) * CANVAS / 100} fill={EDIT_COLOR.editSelect} fillOpacity={0.12} stroke={EDIT_COLOR.editSelect} strokeDasharray="4 3" data-testid="family-erase-rect" /> })()}
            {nib && <circle cx={nib.A[0] * CANVAS / 100} cy={nib.A[1] * CANVAS / 100} r={4} fill={EDIT_COLOR.editSelect} />}
            {nib?.cand && (() => {
              const tmp = nibCommit(drawn, nib.cand, null)
              const p = tmp.d.paths.find((x) => x.id === tmp.pathId)
              const st = p && pathToStroke(tmp.d, p, thickness)
              return st ? <path d={strokeD(st, CANVAS)} fill="none" stroke={EDIT_COLOR.editSelect} strokeOpacity={0.45} strokeWidth={thickness * CANVAS * (1 - 2 * PAD)} /> : null
            })()}
          </g>
          {tool !== 'edit' && <rect x={0} y={0} width={CANVAS} height={CANVAS} fill="transparent" style={{ cursor: tool === 'erase' ? 'cell' : 'crosshair' }} data-testid="family-tool-layer"
            onPointerDown={toolDown} onPointerMove={toolMove} onPointerUp={toolUp} onPointerLeave={() => setHoverS(null)} />}
        </svg>
        <div className={styles.tools} data-testid="family-tools">
          {([['edit', '고치기'], ['circle', '◯ 원 자'], ['line', '╱ 직선 자'], ['pen', '✏️ 펜'], ['erase', '🧽 지우개']] as const).map(([k, label]) =>
            <Button key={k} size="sm" variant="chip" aria-pressed={tool === k} onClick={() => setTool(k)} data-testid={`family-tool-${k}`}>{label}</Button>)}
          <Button size="sm" variant="outline" onClick={undoDrawn} disabled={!histRef.current[ch]?.length} data-testid="family-undo"><Undo2 />되돌리기</Button>
          <Button size="sm" variant="outline" onClick={clearAll} disabled={isBlank} data-testid="family-clear-all"><Trash2 />전체 지우기</Button>
        </div>
        {/* 크기 줄은 늘 자리를 잡아 둔다 — 도구를 바꿀 때 팝업이 들썩이지 않게 */}
        {<div className={styles.tools} data-hidden={tool !== 'circle' || undefined}>
          {[5, 7.5, 10, 15, 20].map((r) => <Button key={r} size="sm" variant="chip" aria-pressed={circleR === r} onClick={() => setCircleR(r)}>지름 {r * 2 / 5}칸</Button>)}
        </div>}
        <p className={styles.toolHint}>{tool === 'edit' ? '점을 끌어 고친다. 그은 선의 주황 끝점은 그 선의 자를 따라 늘고 준다.'
          : tool === 'circle' ? '누른 칸 자리에 원 자를 놓는다. 놓인 자를 누르면 고른다.'
          : tool === 'line' ? '점 두 개를 찍어 직선 자를 놓는다. 자끼리 만나는 점 · 칸 자리에 붙는다.'
          : tool === 'erase' ? '칸을 누르면 그 칸 안의 펜 선이 잘려 나가고, 끌면 네모만큼 한꺼번에. 선을 두 번 톡 누르면 통째로 지운다. 프리셋 획은 두 번 톡으로 그 획만 빠진다(이어받던 뒤 자모 획도 같이). 되돌리기나 \'이 자모 처음으로\'로 살아난다.'
          : '누르고 끌면 손 긋기, 톡 누르면 펜촉(다음 톡마다 마디, 두 번 톡이나 Esc로 끝). 자 위에서 시작하면 그 자를 벗어나지 않고, 자 밖에서 시작하면 자 가까이서 붙는다. 자 없는 곳엔 칸에 맞는 자가 새로 생긴다.'}</p>
        <div className={styles.legend}><span><i data-k="linked" />앞 자모에서 이어 옴</span><span><i data-k="own" />이 자모 것 · 끌어서 고침</span></div>
        <div className={styles.actions}>
          <Button size="sm" onClick={() => step(-1)} disabled={stageIdx === 0 && memberIdx === 0} data-testid="family-prev"><ChevronLeft />앞</Button>
          {pickedStroke && pickedTie !== 'own' && <Button size="sm" onClick={() => setEdits((ed) => cutFamilyStroke(presets, links, ed, ch, pickedStroke.id))} data-testid="family-cut"><Unlink />이 획만 따로(끊기)</Button>}
          {pickedCut && <Button size="sm" onClick={() => setEdits((ed) => relinkFamilyStroke(ed, ch, picked!))} data-testid="family-relink"><Link2 />다시 잇기</Button>}
          {rulerSel && <Button size="sm" onClick={() => { setDrawn(removeRuler(drawn, rulerSel)); setRulerSel(null) }} data-testid="family-ruler-remove"><Trash2 />이 자 빼기</Button>}
          {presetIds.length > 0 && <Button size="sm" onClick={() => { setHidden(allPresetsOut ? [] : presetIds); setPicked(null) }} data-testid="family-presets-toggle"><Trash2 />{allPresetsOut ? '프리셋 다시 넣기' : '프리셋 다 빼기'}</Button>}
          <Button size="sm" onClick={resetJamo} disabled={!touched(ch) && !edits.cut[ch]?.length && !drawn.circles.length && !drawn.lines.length}><RotateCcw />이 자모 처음으로</Button>
          <Button size="sm" variant="primary" onClick={() => step(1)} disabled={stageIdx === FAMILY_STAGES.length - 1 && memberIdx === stage.members.length - 1} data-testid="family-next">다음<ChevronRight /></Button>
        </div>
      </section>

      <aside className={styles.side}>
        <h2>{stage.name}</h2>
        <p>앞에서 고친 것이 뒤로 퍼지는지 여기서 본다.</p>
        <div className={styles.strip}>
          {stage.members.map((m, i) => <Pressable key={m} type="button" className={styles.member} data-on={i === memberIdx || undefined} onClick={() => go(stageIdx, i)} data-testid={`family-member-${m}`}>
            <JamoThumb strokes={familyStrokes(presets, links, edits, m)} size={76} />
            <small>{m} · {touched(m) ? '손댐' : inherits(m) ? '이어받음' : '프리셋'}</small>
          </Pressable>)}
        </div>
        <h2>전체 단계</h2>
        <div className={styles.map}>
          {FAMILY_STAGES.map((s, si) => <div key={s.id} className={styles.mapRow}>
            {s.members.map((m, mi) => <Pressable key={m} type="button" className={styles.mapCell} data-on={si === stageIdx && mi === memberIdx || undefined} onClick={() => go(si, mi)} aria-label={m}>
              <JamoThumb strokes={familyStrokes(presets, links, edits, m)} size={40} faint={!affected(m)} />
            </Pressable>)}
          </div>)}
        </div>
        <p className={styles.note}>ㅁ · ㅂ · ㅍ과 ㅊ 꼭지는 따로 시작한다. 옅은 회색은 아직 아무도 손대지 않은 자모.</p>
      </aside>
    </div>
  </div>
}
