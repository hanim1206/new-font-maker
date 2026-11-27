import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * 눈금 섬(글자 문지르기 판의 값 바꾸기). 가운데 바늘은 서 있고 눈금 띠가 손 따라 옆으로 간다.
 * 눈금 한 칸 16px, 손은 10px에 한 칸(띠가 손보다 빨리 민다). 값은 정수 칸으로만 알린다 — 그 사이는 띠만 미끄러진다.
 * 놓으면 가까운 칸에 앉는다. 좌우 화살표 키 · 휠로도 한 칸씩.
 */
const TICK = 16
const HAND = 10

export function TickTape({ value, max, onValueChange, onBegin, onEnd, label, valueText, lock, className, ...props }: {
  value: number
  max: number
  onValueChange: (value: number) => void
  onBegin?: () => void
  onEnd?: () => void
  label: string
  valueText?: string
  /** 이 칸 위로는 못 간다(더 가면 획이 붙는 칸). */
  lock?: number
  className?: string
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'>) {
  const top = Math.min(max, lock ?? max)
  const [live, setLive] = React.useState<number | null>(null)
  const drag = React.useRef<{ x: number; v: number; id: number } | null>(null)
  const sent = React.useRef(value)
  sent.current = live === null ? value : sent.current
  const shown = live ?? value
  const send = (v: number) => {
    const k = Math.max(0, Math.min(top, Math.round(v)))
    if (k !== sent.current) { sent.current = k; onValueChange(k) }
  }
  const down = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { x: event.clientX, v: value, id: event.pointerId }
    sent.current = value
    setLive(value)
    onBegin?.()
  }
  const move = (event: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || d.id !== event.pointerId) return
    const v = Math.max(-0.4, Math.min(top + 0.4, d.v - (event.clientX - d.x) / HAND))
    setLive(v)
    send(v)
  }
  const up = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current || drag.current.id !== event.pointerId) return
    drag.current = null
    setLive(null)
    onEnd?.()
  }
  const wheelTimer = React.useRef(0)
  React.useEffect(() => () => window.clearTimeout(wheelTimer.current), [])
  const boxRef = React.useRef<HTMLDivElement>(null)
  // 휠은 passive가 아니어야 페이지가 안 굴러간다.
  const wheelRef = React.useRef<(event: WheelEvent) => void>(() => {})
  wheelRef.current = (event: WheelEvent) => {
    event.preventDefault()
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
    const v = Math.max(0, Math.min(top, (live ?? value) + delta / 40))
    if (live === null) onBegin?.()
    setLive(v); send(v)
    window.clearTimeout(wheelTimer.current)
    wheelTimer.current = window.setTimeout(() => { setLive(null); onEnd?.() }, 160)
  }
  React.useEffect(() => {
    const box = boxRef.current
    if (!box) return
    const on = (event: WheelEvent) => wheelRef.current(event)
    box.addEventListener('wheel', on, { passive: false })
    return () => box.removeEventListener('wheel', on)
  }, [])
  const onKeyDown = (event: React.KeyboardEvent) => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (!step) return
    event.preventDefault()
    const k = Math.max(0, Math.min(top, value + step))
    if (k !== value) { onBegin?.(); onValueChange(k) }
  }
  const settled = live === null
  return <div
    ref={boxRef}
    data-slot="tick-tape"
    role="slider"
    tabIndex={0}
    aria-label={label}
    aria-valuemin={0}
    aria-valuemax={max}
    aria-valuenow={Math.round(shown)}
    aria-valuetext={valueText}
    onPointerDown={down}
    onPointerMove={move}
    onPointerUp={up}
    onPointerCancel={up}
    onKeyDown={onKeyDown}
    className={cn('relative h-16 cursor-ew-resize select-none overflow-hidden rounded-lg bg-surface shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30', className)}
    style={{ touchAction: 'none' }}
    {...props}
  >
    <div
      aria-hidden="true"
      className={cn('absolute bottom-2 top-1 flex items-end', settled && 'transition-transform duration-150 ease-out')}
      style={{ left: `calc(50% - ${TICK / 2}px)`, transform: `translateX(${(-shown * TICK).toFixed(2)}px)` }}
    >
      {Array.from({ length: max + 1 }, (_, k) => {
        const five = k % 5 === 0, on = k <= Math.round(shown), locked = k > top
        return <span key={k} className="relative flex h-full shrink-0 items-end justify-center" style={{ width: TICK }}>
          {five && <span className="absolute left-1/2 top-0 -translate-x-1/2 text-10 font-medium tabular-nums text-text-dim-4">{k}</span>}
          <span className={cn('w-px rounded-full', five ? 'h-7 bg-text-dim-4' : 'h-4 bg-surface-4', on && 'w-0.5 bg-primary', locked && 'opacity-30')} />
        </span>
      })}
    </div>
    {/* 가운데 바늘 */}
    <span aria-hidden="true" className="pointer-events-none absolute bottom-2 left-1/2 top-4 w-0.5 -translate-x-1/2 rounded-full bg-foreground" />
  </div>
}
