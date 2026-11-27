import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { Dices, ZoomOut } from 'lucide-react'
import { Button } from './components/ui/button'
import { PagerBar } from './components/ui/pager-bar'
import { TickTape } from './components/ui/tick-tape'
import { WheelPicker } from './components/ui/wheel-picker'
import type { Look } from './moldLab'
import {
  batchCols, clamp, EDGE_PULL, edgeOver, rollRub, RUB_BATCHES, RUB_ENDS, RUB_KEYS, RUB_NAMES, RUB_ROWS, rubOf, rubView, setRub, settle, soft, tapZoom, zoomAround, ZOOM_MAX, ZOOM_MIN, type RubKey,
} from './moldRub'
import styles from './MoldLabPage.module.css'

/**
 * 글자 문지르기 판(하니무스 2026-11-27, 인상 잡기 도트판 대신 · 시안 study/font-key/rub/).
 * - 왼쪽 세로 휠 = 속성 고르기(고른 줄이 맨 위, 이름 밑에 값).
 * - 아래 눈금 섬 = 값 바꾸기. 값은 여기서만 바뀐다.
 * - 글자 판 = 묶음의 고정 격자를 보는 창. 한 손 밀기 = 옆 열 · 아래 행 넘기기(빨리 밀면 여러 칸, 놓으면 칸에 앉음, 격자 끝에서 멈춤),
 *   톡 = 한 단계 확대(4 → 1열), 두 손 오므리기 = 축소, 오른쪽 아래 단추 = 한 손 축소.
 * - 묶음 바꾸기 = 위 좌우 단추, 또는 좌우 끝에서 더 당겼다 놓기.
 * 글자는 빚기 엔진 그대로(`renderGlyph` = MoldLabPage의 MoldGlyph).
 */

/** 격자 한 칸의 바탕 크기(px). 확대는 이 판을 통째로 늘린다(글자는 SVG라 흐려지지 않는다). */
const BASE = 120
const GLYPH = 78
const GAP = 0
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

interface Cam { zoom: number; x: number; y: number }
type Gesture =
  | { kind: 'pan'; x0: number; y0: number; cx: number; cy: number; moved: boolean; t: number; lx: number; ly: number; vx: number; vy: number }
  | { kind: 'pinch'; d0: number; z0: number; c: number; r: number }

/** 시간 재기(하니무스 주문: 휠 미는 동안 계산 속도). 값이 바뀐 때부터 판 글자를 다 그린 다음 프레임까지. */
declare global { interface Window { __rubTimes?: number[] } }

const RubCell = memo(function RubCell({ char, render }: { char: string; render: (char: string, size: number) => ReactNode }) {
  return <>{render(char, GLYPH)}</>
})

export function MoldRubPlate({ look, home, setLook, onBegin, renderGlyph, locks, note }: {
  look: Look
  home: Look
  setLook: (next: Look) => void
  onBegin: () => void
  renderGlyph: (char: string, size: number) => ReactNode
  locks?: Partial<Record<RubKey, number>>
  /** 판 아래 작은 알림(굵기 멈춤 · 넓어짐 등). */
  note?: string
}) {
  const [sel, setSel] = useState(0)
  const key = RUB_KEYS[sel]
  const [batchAt, setBatchAt] = useState(0)
  const batch = RUB_BATCHES[batchAt]
  const cols = batchCols(batch), rows = batch.rows.length
  const [cam, setCam] = useState<Cam>({ zoom: 2, x: 0, y: 0 })
  const [size, setSize] = useState({ w: 260, h: 300 })
  const [edge, setEdge] = useState(0)
  const stageRef = useRef<HTMLDivElement>(null)
  const layerRef = useRef<HTMLDivElement>(null)
  const pts = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<Gesture | null>(null)
  /** 손으로 끄는 동안의 창(리액트 상태 밖). 놓을 때 여기서 앉힌다. */
  const liveRef = useRef<Cam | null>(null)
  const view = rubView(cols, rows, cam.zoom, size.w, size.h)

  // 판 크기 재기
  useLayoutEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const measure = () => setSize({ w: stage.clientWidth, h: stage.clientHeight })
    measure()
    const watch = new ResizeObserver(measure)
    watch.observe(stage)
    return () => watch.disconnect()
  }, [])

  /** 창을 그린다. 손으로 끄는 동안은 리액트를 거치지 않고 바로(animate 없음), 놓으면 미끄러져 앉는다. */
  const place = useCallback((zoom: number, x: number, y: number, animate: boolean) => {
    const layer = layerRef.current
    if (!layer) return
    const cell = size.w / zoom
    layer.style.transition = animate && !reduceMotion() ? 'transform 260ms cubic-bezier(.2,.8,.2,1)' : 'none'
    layer.style.transform = `translate(${(-x * cell).toFixed(2)}px, ${(-y * cell).toFixed(2)}px) scale(${(cell / BASE).toFixed(4)})`
  }, [size.w])
  useLayoutEffect(() => { place(cam.zoom, cam.x, cam.y, true) }, [cam, place])

  // 보이는 열 · 행만 엔진으로 그린다(창 ±1). 나머지 칸은 빈 카드.
  const near = (c: number, r: number) => c >= Math.floor(cam.x) - 1 && c <= Math.ceil(cam.x + cam.zoom) && r >= Math.floor(cam.y) - 1 && r <= Math.ceil(cam.y + view.visRows)

  const goBatch = (at: number, dir: number) => {
    if (!RUB_BATCHES[at]) return
    const next = RUB_BATCHES[at], v = rubView(batchCols(next), next.rows.length, cam.zoom, size.w, size.h)
    setBatchAt(at)
    setCam({ zoom: cam.zoom, x: dir < 0 ? v.maxX : 0, y: 0 })
  }

  const cellAt = (event: { clientX: number; clientY: number }) => {
    const box = stageRef.current!.getBoundingClientRect(), cell = size.w / cam.zoom
    return { c: Math.floor((event.clientX - box.left) / cell + cam.x), r: Math.floor((event.clientY - box.top) / cell + cam.y) }
  }
  const centre = () => ({ c: cam.x + cam.zoom / 2, r: cam.y + view.visRows / 2 })

  const down = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    pts.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pts.current.size === 2) {
      const [a, b] = [...pts.current.values()], c = centre()
      gesture.current = { kind: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y), z0: cam.zoom, c: c.c, r: c.r }
    } else if (pts.current.size === 1) {
      gesture.current = { kind: 'pan', x0: event.clientX, y0: event.clientY, cx: cam.x, cy: cam.y, moved: false, t: performance.now(), lx: event.clientX, ly: event.clientY, vx: 0, vy: 0 }
    }
  }
  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current
    if (!g || !pts.current.has(event.pointerId)) return
    pts.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (g.kind === 'pinch' && pts.current.size >= 2) {
      const [a, b] = [...pts.current.values()]
      const zoom = clamp(g.z0 * g.d0 / Math.max(20, Math.hypot(a.x - b.x, a.y - b.y)), ZOOM_MIN - 0.2, ZOOM_MAX + 0.3)
      const v = rubView(cols, rows, zoom, size.w, size.h)
      place(zoom, clamp(g.c - zoom / 2, 0, v.maxX), clamp(g.r - v.visRows / 2, 0, v.maxY), false)
      liveRef.current = { zoom, x: clamp(g.c - zoom / 2, 0, v.maxX), y: clamp(g.r - v.visRows / 2, 0, v.maxY) }
    } else if (g.kind === 'pan') {
      const dx = event.clientX - g.x0, dy = event.clientY - g.y0, cell = size.w / cam.zoom
      if (Math.hypot(dx, dy) > 7) g.moved = true
      if (!g.moved) return
      const rawX = g.cx - dx / cell
      // 옆으로 미는 손짓일 때만 끝 당기기를 센다.
      const over = Math.abs(dx) > Math.abs(dy) * 1.2 ? edgeOver(rawX, g.cx, view.maxX) : 0
      setEdge((now) => (Math.abs(now - over) > 0.02 || (over === 0) !== (now === 0) ? over : now))
      const x = soft(rawX, 0, view.maxX), y = view.maxY > 0 ? soft(g.cy - dy / cell, 0, view.maxY) : 0
      place(cam.zoom, x, y, false)
      liveRef.current = { zoom: cam.zoom, x, y }
      const now = performance.now(), k = Math.max(8, now - g.t)
      g.vx = 0.6 * g.vx + 0.4 * (-(event.clientX - g.lx) / cell / k * 1000)
      g.vy = 0.6 * g.vy + 0.4 * (-(event.clientY - g.ly) / cell / k * 1000)
      g.t = now; g.lx = event.clientX; g.ly = event.clientY
    }
  }
  const up = (event: ReactPointerEvent<HTMLDivElement>) => {
    pts.current.delete(event.pointerId)
    const g = gesture.current
    if (!g) return
    if (g.kind === 'pinch' && pts.current.size >= 2) return
    gesture.current = null
    const liveNow = liveRef.current
    liveRef.current = null
    if (g.kind === 'pinch') {
      pts.current.clear()
      const next = zoomAround((liveNow ?? cam).zoom, { c: g.c, r: g.r }, cols, rows, size.w, size.h)
      setCam({ zoom: next.zoom, ...next.cam })
      return
    }
    setEdge(0)
    if (!g.moved) {
      const next = tapZoom(cam.zoom, cam, cellAt(event), cols, rows, size.w, size.h)
      if (next) setCam({ zoom: next.zoom, ...next.cam })
      return
    }
    if (Math.abs(edge) >= EDGE_PULL && RUB_BATCHES[batchAt + Math.sign(edge)]) { goBatch(batchAt + Math.sign(edge), Math.sign(edge)); return }
    const still = performance.now() - g.t > 90, live = liveNow ?? cam
    setCam({ zoom: cam.zoom, x: settle(live.x, g.vx, view.maxX, still), y: settle(live.y, g.vy, view.maxY, still) })
    // 같은 칸에 다시 앉으면 상태가 안 바뀌어 그리기가 안 돈다 — 바로 제자리로.
    place(cam.zoom, settle(live.x, g.vx, view.maxX, still), settle(live.y, g.vy, view.maxY, still), true)
  }
  const zoomBy = (step: number) => {
    const next = zoomAround(cam.zoom + step, centre(), cols, rows, size.w, size.h)
    setCam({ zoom: next.zoom, ...next.cam })
  }
  // 마우스 휠: 위로 확대, 아래로 축소(passive 아니게).
  const wheelRef = useRef<(event: WheelEvent) => void>(() => {})
  wheelRef.current = (event: WheelEvent) => { event.preventDefault(); zoomBy(event.deltaY > 0 ? 1 : -1) }
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const on = (event: WheelEvent) => wheelRef.current(event)
    stage.addEventListener('wheel', on, { passive: false })
    return () => stage.removeEventListener('wheel', on)
  }, [])

  // ── 값 ──
  const vals = useMemo(() => RUB_KEYS.map((k) => rubOf(look, k)), [look])
  const wheelItems = useMemo(() => RUB_KEYS.map((k, i) => ({ id: k, label: RUB_NAMES[k], detail: vals[i] })), [vals])
  const lookRef = useRef(look)
  lookRef.current = look
  const t0 = useRef<number | null>(null)
  const [lastMs, setLastMs] = useState<number | null>(null)
  const change = (k: number) => {
    t0.current = performance.now()
    const next = setRub(lookRef.current, home, key, k)
    lookRef.current = next
    setLook(next)
  }
  useLayoutEffect(() => {
    const start = t0.current
    if (start === null) return
    t0.current = null
    const raf = requestAnimationFrame(() => {
      const ms = performance.now() - start
      ;(window.__rubTimes ??= []).push(ms)
      if (window.__rubTimes.length > 200) window.__rubTimes.shift()
      setLastMs(Math.round(ms))
    })
    return () => cancelAnimationFrame(raf)
  }, [look])
  const lock = locks?.[key]
  const value = vals[sel]

  const edgeTo = edge !== 0 ? RUB_BATCHES[batchAt + Math.sign(edge)] : undefined
  const zoomText = cam.zoom <= 1 ? '한 열' : `${cam.zoom}열`

  return <section className={styles.rub} aria-label="글자 문지르기" data-testid="mold-rub" data-render-ms={lastMs ?? undefined}>
    <div className={styles.rubWheel}>
      <WheelPicker items={wheelItems} value={sel} onValueChange={setSel} aria-label="속성 고르기" data-testid="rub-wheel" />
    </div>
    <div className={styles.rubMain}>
      <PagerBar index={batchAt} count={RUB_BATCHES.length} label={batch.name} onPrev={() => goBatch(batchAt - 1, -1)} onNext={() => goBatch(batchAt + 1, 1)} data-testid="rub-pager" />
      <div
        ref={stageRef}
        className={styles.rubStage}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        role="group"
        aria-label={`${batch.name} 묶음, ${zoomText} 보기`}
        data-testid="rub-stage"
        data-zoom={cam.zoom}
        data-cam={`${cam.x},${cam.y}`}
        data-batch={batch.id}
      >
        <div ref={layerRef} className={styles.rubLayer} style={{ width: cols * BASE, height: rows * BASE }}>
          {batch.rows.map((row, r) => row.map((char, c) => <div key={`${batch.id}-${r}-${c}`} className={styles.rubCell} style={{ left: c * BASE + GAP / 2, top: r * BASE + GAP / 2, width: BASE - GAP, height: BASE - GAP }} data-testid={`rub-cell-${r}-${c}`} data-char={char}>
            {near(c, r) ? <RubCell char={char} render={renderGlyph} /> : null}
          </div>))}
        </div>
        {edgeTo && <span className={styles.rubEdge} data-side={edge > 0 ? 'right' : 'left'} data-go={Math.abs(edge) >= EDGE_PULL || undefined} data-testid="rub-edge">
          {Math.abs(edge) >= EDGE_PULL ? '놓으면 ' : '더 당기면 '}{edgeTo.name}
        </span>}
        <Button variant="outline" size="icon" className={styles.rubZoomOut} onPointerDown={(event) => event.stopPropagation()} onClick={() => zoomBy(1)} disabled={cam.zoom >= ZOOM_MAX} aria-label="작게 보기" data-testid="rub-zoom-out"><ZoomOut aria-hidden="true" /></Button>
      </div>
    </div>
    <div className={styles.rubTapeRow}>
      <div className={styles.rubRead}>
        <strong data-testid="rub-name">{RUB_NAMES[key]}</strong>
        <span className={styles.rubEnds}>{RUB_ENDS[key][0]} ↔ {RUB_ENDS[key][1]}{lock !== undefined && value >= lock && lock < RUB_ROWS ? ' · 더 가면 획이 붙어요' : ''}</span>
        <Button variant="ghost" size="icon" onClick={() => { onBegin(); t0.current = performance.now(); setLook(rollRub(lookRef.current, home, Math.random, locks)) }} aria-label="주사위 · 아홉 값 아무렇게나" data-testid="rub-dice"><Dices aria-hidden="true" /></Button>
        <output className={styles.rubValue} data-testid="rub-value">{value}</output>
      </div>
      {note && <p className={styles.rubNote} data-testid="mold-readout">{note}</p>}
      <TickTape value={value} max={RUB_ROWS} lock={lock} onValueChange={change} onBegin={onBegin} label={`${RUB_NAMES[key]} 값`} valueText={`${RUB_NAMES[key]} ${value}`} data-testid="rub-tape" />
    </div>
  </section>
}
