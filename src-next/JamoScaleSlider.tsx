import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'
import styles from './JamoScaleSlider.module.css'

/** 막대 끝까지 끌었을 때 바뀌는 비율. 한 번에 ±30%, 더 키우려면 놓고 다시 끈다. */
const SCALE_RANGE = .3
/** 방향키 한 번. */
const KEY_STEP = .02

/**
 * 트랙패드 왼쪽 세로 막대. 올리면 자소가 커지고 내리면 작아진다.
 * 조그다 — 끄는 만큼 바뀌고, 손을 떼면 손잡이가 가운데로 돌아온다. 끌었다 놓은 한 번이 되돌리기 한 번이다.
 */
export function JamoScaleSlider({ disabled, onStart, onChange, onCommit, onCancel }: {
  disabled: boolean
  onStart: () => void
  onChange: (factor: number) => void
  onCommit: (factor: number) => void
  onCancel: () => void
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ pointerId: number; startY: number; half: number; ratio: number } | null>(null)
  const [ratio, setRatio] = useState<number | null>(null)
  const factorOf = (value: number) => 1 + value * SCALE_RANGE

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (disabled || drag.current) return
    const track = trackRef.current
    if (!track) return
    event.preventDefault()
    track.setPointerCapture(event.pointerId)
    drag.current = { pointerId: event.pointerId, startY: event.clientY, half: Math.max(1, track.clientHeight / 2), ratio: 0 }
    setRatio(0)
    onStart()
  }
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current
    if (!current || current.pointerId !== event.pointerId) return
    const next = Math.max(-1, Math.min(1, (current.startY - event.clientY) / current.half))
    current.ratio = next
    setRatio(next)
    onChange(factorOf(next))
  }
  const finish = (event: PointerEvent<HTMLDivElement>, commit: boolean) => {
    const current = drag.current
    if (!current || current.pointerId !== event.pointerId) return
    drag.current = null
    const last = current.ratio
    setRatio(null)
    if (commit && Math.abs(last) > 1e-4) onCommit(factorOf(last))
    else onCancel()
  }
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled || drag.current) return
    const step = event.key === 'ArrowUp' ? KEY_STEP : event.key === 'ArrowDown' ? -KEY_STEP : 0
    if (!step) return
    event.preventDefault()
    event.stopPropagation()
    onStart()
    onCommit(1 + step)
  }

  const active = ratio !== null
  return (
    <div
      ref={trackRef}
      className={styles.track}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label="자소 크기"
      aria-orientation="vertical"
      aria-disabled={disabled}
      aria-valuemin={Math.round(factorOf(-1) * 100)}
      aria-valuemax={Math.round(factorOf(1) * 100)}
      aria-valuenow={Math.round(factorOf(ratio ?? 0) * 100)}
      aria-valuetext={`${Math.round(factorOf(ratio ?? 0) * 100)}%`}
      data-active={active}
      style={{ '--ratio': ratio ?? 0 } as CSSProperties}
      data-testid="jamo-scale-slider"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(event) => finish(event, true)}
      onPointerCancel={(event) => finish(event, false)}
      onKeyDown={onKeyDown}
    >
      <span className={styles.rail} aria-hidden="true" />
      <span className={styles.thumb} aria-hidden="true" />
      {active && <output className={styles.value}>{Math.round(factorOf(ratio) * 100)}%</output>}
    </div>
  )
}
