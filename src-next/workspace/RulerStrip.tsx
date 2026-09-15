import { useRef } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'
import styles from './RulerStrip.module.css'

/**
 * 기준선용 자 도구. 눈금은 고정, 표시자가 움직인다.
 * 눈금 창 = 허용 범위(min~max) 전체라 범위 표시가 따로 없고, 원본(base) 자리에 기준 눈금을 둔다.
 * 탭 = 그 자리로, 끌기 = 상대 이동(1u 스냅). 값은 호출자 단위(0~1) 그대로 받고 `unitScale`로 표시한다.
 */
export interface RulerStripProps {
  value: number
  min: number
  max: number
  step: number
  base?: number
  baseLabel?: string
  unitScale?: number
  unit?: string
  /** 기준선 축. 가로 자 하나로 두 축을 다루므로 방향 안내만 바뀐다. */
  axis: 'x' | 'y'
  label: string
  onChange: (value: number) => void
}

const WIDTH = 340
const HEIGHT = 64
const PAD = 14
const TRACK_Y = 40
const TAP_SLOP = 3

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function snap(value: number, min: number, step: number): number {
  return min + Math.round((value - min) / step) * step
}

export function RulerStrip({ value, min, max, step, base, baseLabel = 'Noto', unitScale = 1, unit = '', axis, label, onChange }: RulerStripProps) {
  const gesture = useRef<{ pointerId: number; startX: number; startValue: number; moved: boolean } | null>(null)
  const span = max - min
  const xOf = (raw: number) => PAD + (raw - min) / span * (WIDTH - PAD * 2)
  const rawAtX = (x: number) => min + (x - PAD) / (WIDTH - PAD * 2) * span
  const toUnits = (raw: number) => raw * unitScale

  const commit = (raw: number) => {
    const next = clamp(snap(raw, min, step), min, max)
    if (Math.abs(next - value) > 1e-12) onChange(next)
  }
  const localX = (event: PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return (event.clientX - rect.left) * (WIDTH / rect.width)
  }
  const onPointerDown = (event: PointerEvent<SVGSVGElement>) => {
    gesture.current = { pointerId: event.pointerId, startX: localX(event), startValue: value, moved: false }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const current = gesture.current
    if (!current || current.pointerId !== event.pointerId) return
    const dx = localX(event) - current.startX
    if (!current.moved && Math.abs(dx) < TAP_SLOP) return
    current.moved = true
    commit(current.startValue + dx / (WIDTH - PAD * 2) * span)
  }
  const onPointerUp = (event: PointerEvent<SVGSVGElement>) => {
    const current = gesture.current
    if (!current || current.pointerId !== event.pointerId) return
    gesture.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    if (!current.moved) commit(rawAtX(localX(event)))
  }
  const onKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    const big = event.shiftKey ? 10 : 1
    const delta = event.key === 'ArrowRight' || event.key === 'ArrowUp' ? step * big : event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -step * big : event.key === 'Home' ? min - value : event.key === 'End' ? max - value : null
    if (delta === null) return
    event.preventDefault()
    commit(value + delta)
  }

  const ticks: { raw: number; major: boolean }[] = []
  const unitStep = 1 / unitScale
  for (let units = Math.ceil(toUnits(min)); units <= Math.floor(toUnits(max)); units += 1) ticks.push({ raw: units * unitStep, major: units % 10 === 0 })
  const shown = toUnits(value)
  const markerX = xOf(value)

  return (
    <svg
      className={styles.ruler}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-orientation="horizontal"
      aria-valuemin={Number(toUnits(min).toFixed(3))}
      aria-valuemax={Number(toUnits(max).toFixed(3))}
      aria-valuenow={Number(shown.toFixed(3))}
      aria-valuetext={`${shown.toFixed(1)} ${unit}`.trim()}
      data-testid="ruler-strip"
      data-axis={axis}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onLostPointerCapture={() => { gesture.current = null }}
      onKeyDown={onKeyDown}
    >
      <rect className={styles.track} x={0} y={0} width={WIDTH} height={HEIGHT} rx={10} />
      <text className={styles.direction} x={PAD} y={12}>{axis === 'x' ? '← 왼쪽' : '← 위'}</text>
      <text className={`${styles.direction} ${styles.directionEnd}`} x={WIDTH - PAD} y={12}>{axis === 'x' ? '오른쪽 →' : '아래 →'}</text>
      <g className={styles.ticks}>
        {ticks.map((tick) => <line key={tick.raw} x1={xOf(tick.raw)} x2={xOf(tick.raw)} y1={TRACK_Y} y2={TRACK_Y + (tick.major ? 14 : 7)} className={tick.major ? styles.major : undefined} />)}
        {ticks.filter((tick) => tick.major).map((tick) => <text key={`n${tick.raw}`} x={xOf(tick.raw)} y={TRACK_Y - 6} className={styles.number}>{Math.round(toUnits(tick.raw))}</text>)}
      </g>
      {base !== undefined && base >= min && base <= max && <g className={styles.base}>
        <line x1={xOf(base)} x2={xOf(base)} y1={TRACK_Y - 16} y2={HEIGHT} />
        <text x={xOf(base)} y={TRACK_Y - 20}>{baseLabel}</text>
      </g>}
      <line className={styles.marker} x1={markerX} x2={markerX} y1={18} y2={HEIGHT} />
      <rect className={styles.thumb} x={markerX - 9} y={22} width={18} height={30} rx={9} />
    </svg>
  )
}
