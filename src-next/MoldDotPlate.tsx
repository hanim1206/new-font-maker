import { useEffect, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { DOT_KEYS, DOT_ROWS, dotsOf, dotToLook, type Look } from './moldLab'
import styles from './MoldLabPage.module.css'

/**
 * 인상 잡기 도트판(하니무스 2026-11-21, 고양이 와이어프레임 "다" 안 · 만져 본 목업 그대로).
 * 판 한 장에 20×20 둥근 점, 값마다 세 줄 폭(값 일곱: 굵기 · 폭 · 키 · 닿자 크기 · 무게중심 · 둥글기 · 획 대비), 세로 한 칸 = 5.
 * - 판을 가로로 한 번 그으면 지나간 값마다 손 높이를 잡는다.
 * - 한 색 위에서 위아래로 끌면 그 값만 잡은 자리에서 손이 간 만큼(툭 뛰지 않게).
 * - 톡 누르면 그 줄이 누른 높이로. 맨 아래 점 아래로 내리면 0.
 * 점 그림은 리액트를 거치지 않고 프레임마다 바로 고친다(점 400개 · 출렁임).
 */
const N = DOT_ROWS
const P = 16.6
const OX = 13
const OY = 44
const S = N * P
/** 값 수 · 값마다 세로줄 수 · 가로 칸 수. 판 너비는 그대로, 가로 칸 너비만 줄인다. */
const G = DOT_KEYS.length
const W = 3
const C = G * W
const PX = S / C
const NAMES = ['굵기', '폭', '키', '닿자 크기', '무게중심', '둥글기', '획 대비']
// 레퍼런스 점 판 색(이 화면에만 쓰는 외관 — 하니무스 결정 2026-11-21 "레퍼런스풍 외관은 이 화면에만").
const COL = ['#D8552B', '#7357C9', '#2E9BA6', '#5B93C4', '#C9A227', '#1F5B45', '#A9335C'] // style-guard: allow 도트판 전용 값 색
const OFF = '#bfc0c0' // style-guard: allow 도트판 꺼진 점
const PLATE = '#e7e8e8' // style-guard: allow 도트판 바탕
const INK = '#111111' // style-guard: allow 도트판 손 표시

const groupAt = (c: number) => Math.max(0, Math.min(G - 1, Math.floor(Math.max(0, Math.min(C - 1, Math.round(c))) / W)))
/** 값 b 가운데의 x. */
const chipX = (b: number) => OX + PX * (b * W + W / 2)
/** 몇 째 값인지 말로. */
const COUNT = ['', '한', '두', '세', '네', '다섯', '여섯', '일곱'][G] ?? String(G)
/** 손 높이(칸) → 칸 수 0~20. 맨 아래 점 아래로 내리면 0. */
const dotOfRow = (r: number) => Math.max(0, Math.min(N, Math.round(r + 0.5)))

interface Pulse { x: number; t0: number; amp: number; speed: number }
type Mode = 'sweep' | 'one' | null

export function MoldDotPlate({ look, setLook, onBegin, onSay }: { look: Look; setLook: (next: Look) => void; onBegin: () => void; onSay: (text: string) => void }) {
  const svgRef = useRef<SVGSVGElement>(null)
  const dotsRef = useRef<SVGCircleElement[][]>([])
  const chipRefs = useRef<{ g: SVGGElement | null; c: SVGGElement | null; t: SVGTextElement | null; z: number }[]>(DOT_KEYS.map(() => ({ g: null, c: null, t: null, z: 1 })))
  const fingerRef = useRef<SVGCircleElement>(null)
  const arrowsRef = useRef<SVGPathElement>(null)
  const hintRef = useRef<SVGGElement>(null)
  // 지금 값(칸 수). 손으로 바꾸는 동안 리액트 상태보다 먼저 여기 둔다.
  const vals = useRef<number[]>(dotsOf(look))
  const lookRef = useRef(look)
  lookRef.current = look
  useEffect(() => { vals.current = dotsOf(look) }, [look])

  const anim = useRef({
    hc: Array.from({ length: C }, (_, c) => dotsOf(look)[Math.floor(c / W)]), vc: new Array(C).fill(0) as number[],
    peak: new Array(C).fill(0) as number[], peakV: new Array(C).fill(0) as number[], wave: new Array(G).fill(0) as number[],
    pulses: [] as Pulse[], halo: 0, fx: null as number | null, fy: null as number | null, lastFx: 0, lastFy: 0,
    sel: null as number | null, grabbing: null as number | null,
  })
  const pulse = (x: number, amp: number, speed = 26) => { const a = anim.current; a.pulses.push({ x, t0: performance.now(), amp, speed }); if (a.pulses.length > 24) a.pulses.shift() }
  const kick = (b: number, amount: number) => { const a = anim.current; a.wave[b] = Math.max(a.wave[b], amount); pulse(b * W + (W - 1) / 2, amount * 0.9) }

  const commit = (next: number[]) => {
    vals.current = next
    const out: Look = { ...lookRef.current }
    DOT_KEYS.forEach((key, i) => { out[key] = dotToLook(key, next[i]) })
    setLook(out)
  }
  const setOne = (b: number, k: number, amount: number) => {
    if (vals.current[b] === k) return false
    const next = [...vals.current]; next[b] = k; commit(next); kick(b, amount); return true
  }

  // ── 그리기 ──
  useEffect(() => {
    let raf = 0, lastT = performance.now()
    const frame = (t: number) => {
      const a = anim.current, v = vals.current
      const dt = Math.min(0.033, (t - lastT) / 1000); lastT = t
      for (let i = a.pulses.length - 1; i >= 0; i--) if (t - a.pulses[i].t0 > 1600) a.pulses.splice(i, 1)
      const lift = new Array(C).fill(0) as number[]
      for (let c = 0; c < C; c++) {
        const b = Math.floor(c / W)
        for (const q of a.pulses) {
          const age = (t - q.t0) / 1000, d = Math.abs(c - q.x), k = age * q.speed - d
          if (k > 0 && k < 5) lift[c] += q.amp * Math.sin(Math.PI * k / 5) * Math.exp(-age * 1.6) * Math.exp(-d * 0.06)
        }
        lift[c] += a.wave[b] * (0.55 + 0.45 * Math.sin(t / 70 + c * 1.3))
        // 덜 눌러 둔 스프링(크게 튕김). 같은 값의 네 줄은 안쪽부터 조금씩 늦게.
        const lag = 1 - 0.13 * (c % W), acc = 300 * lag * (v[b] - a.hc[c]) - (10 + 3 * (c % W)) * a.vc[c]
        a.vc[c] += acc * dt; a.hc[c] += a.vc[c] * dt
        const now = a.hc[c] + lift[c]
        if (now > a.peak[c]) { a.peak[c] = now; a.peakV[c] = 0 } else { a.peakV[c] += 26 * dt; a.peak[c] = Math.max(now, a.peak[c] - a.peakV[c] * dt) }
      }
      for (let b = 0; b < G; b++) a.wave[b] *= Math.exp(-dt * 2.2)
      a.halo += ((a.fx != null ? 1 : 0) - a.halo) * Math.min(1, dt * 14)
      const dots = dotsRef.current
      for (let c = 0; c < C; c++) {
        const b = Math.floor(c / W), top = Math.round(a.hc[c]) - 1, up = lift[c], pk = Math.round(a.peak[c]) - 1
        for (let r = 0; r < N; r++) {
          let fill = OFF, d = 8.4, op = 1
          if (r <= top) { fill = COL[b]; d = r === top ? 13.6 : 11; if (a.sel != null && a.sel !== b) op = 0.28 }
          else if (r <= top + up) { fill = COL[b]; const k = (r - top) / Math.max(up, 1); op = 0.85 * (1 - k) + 0.15; d = 10.5 - 2 * k }
          else if (r === pk && pk > top + up) { fill = COL[b]; op = 0.55; d = 10 }
          if (a.fx != null || a.halo > 0.02) {
            const hx = a.fx ?? a.lastFx, hy = a.fy ?? a.lastFy, k = Math.hypot(c - hx, r - hy)
            if (k < 5) { const h = (1 - k / 5) * a.halo; d = Math.max(d, 8.4 + 10 * h * h + 3 * h); if (r > top) { fill = COL[b]; op = Math.max(op === 1 ? 0 : op, 0.2 + 0.8 * h) } }
          }
          const e = dots[c]?.[r]
          if (e) { e.setAttribute('r', (d / 2).toFixed(2)); e.setAttribute('fill', fill); e.setAttribute('opacity', op.toFixed(2)) }
        }
      }
      chipRefs.current.forEach((ch, i) => {
        if (!ch.g || !ch.c || !ch.t) return
        ch.t.textContent = String(v[i] * 5)
        ch.g.setAttribute('opacity', a.sel != null && a.sel !== i ? '0.35' : '1')
        // 잡는 값의 딱지는 크게(손가락에 가려진 값을 위에서 읽게)
        const want = a.grabbing === i ? 1.7 : 1; ch.z += (want - ch.z) * Math.min(1, dt * 16)
        const x = chipX(i)
        ch.c.setAttribute('transform', `translate(${x} 12) scale(${ch.z.toFixed(3)}) translate(${-x} -12)`)
        if (a.grabbing === i && fingerRef.current && ch.g.nextSibling !== fingerRef.current) ch.g.parentNode?.insertBefore(ch.g, fingerRef.current)
      })
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [])

  // ── 손 ──
  const grab = useRef<{ c: number; r: number; k0: number; mode: Mode; passed: Set<number>; lastB: number } | null>(null)
  const cellOf = (event: ReactPointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current!, pt = svg.createSVGPoint(); pt.x = event.clientX; pt.y = event.clientY
    const q = pt.matrixTransform(svg.getScreenCTM()!.inverse())
    return { c: (q.x - OX) / PX - 0.5, r: (OY + S - q.y) / P - 0.5, x: q.x, y: q.y }
  }
  const NAME = (b: number) => `${NAMES[b]} ${vals.current[b] * 5}`
  const down = (event: ReactPointerEvent<SVGSVGElement>) => {
    const q = cellOf(event)
    if (q.r < -1.5 || q.r > N || q.c < -1 || q.c > C) return
    event.currentTarget.setPointerCapture(event.pointerId)
    grab.current = { c: q.c, r: q.r, k0: 0, mode: null, passed: new Set(), lastB: groupAt(q.c) }
    const a = anim.current; a.fx = q.c; a.fy = q.r; a.lastFx = q.c; a.lastFy = q.r
    if (hintRef.current) hintRef.current.style.display = 'none'
    fingerRef.current?.setAttribute('cx', String(q.x)); fingerRef.current?.setAttribute('cy', String(q.y)); fingerRef.current?.setAttribute('opacity', '0.82')
    onBegin()
  }
  const move = (event: ReactPointerEvent<SVGSVGElement>) => {
    const g = grab.current
    if (!g) return
    const q = cellOf(event), a = anim.current
    a.fx = Math.max(0, Math.min(C - 1, q.c)); a.fy = Math.max(-1.5, Math.min(N - 1, q.r)); a.lastFx = a.fx; a.lastFy = a.fy
    fingerRef.current?.setAttribute('cx', String(q.x)); fingerRef.current?.setAttribute('cy', String(q.y))
    if (!g.mode) {
      const dx = Math.abs(q.c - g.c), dy = Math.abs(q.r - g.r)
      // 옆으로 1.2칸 넘게 가면 긋기. 위아래로 반 칸만 가도 바로 한 줄 다시 잡기.
      if (dx > 1.2 && dx * 2.5 >= dy) { g.mode = 'sweep'; onSay('긋는 중') }
      else if (dy > 0.5 && dx < 0.3 * dy) { g.mode = 'one'; a.sel = groupAt(g.c); a.grabbing = a.sel; g.k0 = vals.current[a.sel] }
      else return
    }
    // 한 줄을 잡았다가 옆으로 두 칸 넘게 가면 긋기로 바꾼다
    if (g.mode === 'one' && Math.abs(q.c - g.c) > 2) { g.mode = 'sweep'; g.passed = new Set([a.sel ?? 0]); g.lastB = a.sel ?? 0; a.sel = null; arrowsRef.current?.setAttribute('opacity', '0'); onSay('긋는 중') }
    if (g.mode === 'sweep') {
      const b = groupAt(a.fx); a.grabbing = b
      const k = dotOfRow(a.fy)
      for (let i = Math.min(g.lastB, b); i <= Math.max(g.lastB, b); i++) { if (!setOne(i, k, 4) && !g.passed.has(i)) kick(i, 4); g.passed.add(i) }
      if (Math.random() < 0.35) pulse(a.fx, 1.4, 34)
      g.lastB = b
    } else if (g.mode === 'one' && a.sel != null) {
      const b = a.sel
      setOne(b, Math.max(0, Math.min(N, Math.round(g.k0 + (q.r - g.r)))), 2.4)
      const x = chipX(b), y = OY + S - P * (a.fy + 0.5)
      arrowsRef.current?.setAttribute('d', `M ${x + 36} ${y - 30} v 60 M ${x + 31} ${y - 24} l 5 -7 l 5 7 M ${x + 31} ${y + 24} l 5 7 l 5 -7`)
      arrowsRef.current?.setAttribute('opacity', '1')
      onSay(NAME(b))
    }
  }
  const up = () => {
    const g = grab.current
    if (!g) return
    grab.current = null
    const a = anim.current
    if (!g.mode) { const b = groupAt(g.c); if (!setOne(b, dotOfRow(g.r), 3.2)) kick(b, 3.2); onSay(NAME(b)) }
    else if (g.mode === 'sweep') { pulse(-2, 3.2, 30); a.wave = a.wave.map((w) => Math.max(w, 1.4)); onSay(g.passed.size === G ? `${COUNT} 값을 한 번에 잡았어요 · 한 줄만 위아래로 다시 잡기` : `끝까지 그으면 ${COUNT} 값이 다 잡혀요`) }
    else if (a.sel != null) onSay(`${NAME(a.sel)} · 다른 줄도 위아래로`)
    a.fx = null; a.fy = null; a.sel = null; a.grabbing = null
    fingerRef.current?.setAttribute('opacity', '0'); arrowsRef.current?.setAttribute('opacity', '0')
  }

  const hintY = OY + S / 2 + P / 2
  return <svg ref={svgRef} className={styles.dotPlate} viewBox="0 -14 358 434" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} data-testid="mold-dotplate" role="img" aria-label="인상 도트판">
    <rect x={0} y={OY - 12} width={358} height={S + 24} rx={26} fill={PLATE} />
    {Array.from({ length: C }, (_, c) => Array.from({ length: N }, (_, r) => <circle key={`${c}-${r}`} ref={(el) => { if (!dotsRef.current[c]) dotsRef.current[c] = []; if (el) dotsRef.current[c][r] = el }} cx={OX + PX * (c + 0.5)} cy={OY + S - P * (r + 0.5)} r={4.2} fill={OFF} />))}
    <text x={OX - 9} y={OY + 4} fontSize={9} fill={OFF}>+</text>
    <text x={OX - 9} y={OY + S} fontSize={9} fill={OFF}>0</text>
    {DOT_KEYS.map((key, i) => {
      const x = chipX(i)
      return <g key={key} ref={(el) => { chipRefs.current[i].g = el }} data-testid={`mold-dot-${key}`}>
        <g ref={(el) => { chipRefs.current[i].c = el }}>
          <rect x={x - PX * W / 2 + 2.5} y={0} width={PX * W - 5} height={24} rx={7} fill={COL[i]} />
          <text ref={(el) => { chipRefs.current[i].t = el }} x={x} y={17} textAnchor="middle" fontSize={13} fontWeight={600} fill={COL[i] === '#C9A227' ? INK : PLATE} /* style-guard: allow 겨자색 딱지만 검은 글씨 */ className={styles.dotNum} />
        </g>
        <text x={x} y={OY + S + 34} textAnchor="middle" fontSize={NAMES[i].length > 3 ? 10 : 12} fontWeight={600} fill={INK}>{NAMES[i]}</text>
      </g>
    })}
    <g ref={hintRef} pointerEvents="none">
      <path d={`M ${OX + 30} ${hintY} H ${OX + S - 14}`} stroke={INK} strokeWidth={1.5} strokeDasharray="2 6" strokeLinecap="round" fill="none" />
      <path d={`M ${OX + S - 22} ${hintY - 6} l 9 6 l -9 6`} fill="none" stroke={INK} strokeWidth={1.5} />
      <circle cx={OX + 16} cy={hintY} r={22} fill={INK} opacity={0.85}><animate attributeName="cx" values={`${OX + 16};${OX + S - 30};${OX + 16}`} dur="2.4s" repeatCount="indefinite" /></circle>
    </g>
    <circle ref={fingerRef} cx={-99} cy={-99} r={22} fill={INK} opacity={0} pointerEvents="none" />
    <path ref={arrowsRef} d="" fill="none" stroke={INK} strokeWidth={1.5} opacity={0} pointerEvents="none" />
  </svg>
}
