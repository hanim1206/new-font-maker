import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { StrokeMoveDelta, StrokeScale } from '../../types'

export type ScaleAxis = 'x' | 'y' | null

interface Point { x: number; y: number }
type GestureMode = 'pending' | 'move' | 'scale' | 'finished'

export function detectScaleAxis(deltaX: number, deltaY: number, deadzone: number, dominance = 1.2): ScaleAxis {
  const x = Math.abs(deltaX)
  const y = Math.abs(deltaY)
  if (Math.max(x, y) < deadzone) return null
  if (x >= y * dominance) return 'x'
  if (y >= x * dominance) return 'y'
  return Math.hypot(x, y) >= deadzone * 2 ? (x >= y ? 'x' : 'y') : null
}

interface UnifiedTrackpadOptions {
  enabled: boolean
  scaleEnabled: boolean
  moveAxisLock?: boolean
  moveDeadzone?: number
  scaleDeadzone?: number
  scaleSensitivity?: number
  onMoveStart: () => void
  onMoveChange: (movement: StrokeMoveDelta, point: Point) => void
  onMoveCommit: () => void
  onScaleStart: () => void
  onScaleChange: (scale: StrokeScale, axis: Exclude<ScaleAxis, null>) => void
  onScaleCommit: () => void
  onCancel: () => void
}

export function useUnifiedTrackpad({
  enabled,
  scaleEnabled,
  moveAxisLock = false,
  moveDeadzone = 8,
  scaleDeadzone = 8,
  scaleSensitivity = 2,
  onMoveStart,
  onMoveChange,
  onMoveCommit,
  onScaleStart,
  onScaleChange,
  onScaleCommit,
  onCancel,
}: UnifiedTrackpadOptions) {
  const pointers = useRef(new Map<number, Point>())
  const firstPointerId = useRef<number | null>(null)
  const origin = useRef<Point | null>(null)
  const startGap = useRef<Point | null>(null)
  const mode = useRef<GestureMode>('pending')
  const scaleAxis = useRef<ScaleAxis>(null)
  const [visualState, setVisualState] = useState<{ mode: GestureMode; points: Point[]; axis: ScaleAxis }>({ mode: 'pending', points: [], axis: null })

  const publish = (element: HTMLElement) => {
    const rect = element.getBoundingClientRect()
    const points = [...pointers.current.values()].map((point) => ({ x: point.x - rect.left, y: point.y - rect.top }))
    if (points.length === 2 && scaleAxis.current === 'x') {
      const centerY = (points[0].y + points[1].y) / 2
      points.forEach((point) => { point.y = centerY })
    } else if (points.length === 2 && scaleAxis.current === 'y') {
      const centerX = (points[0].x + points[1].x) / 2
      points.forEach((point) => { point.x = centerX })
    }
    setVisualState({ mode: mode.current, points, axis: scaleAxis.current })
  }
  const reset = () => {
    pointers.current.clear()
    firstPointerId.current = null
    origin.current = null
    startGap.current = null
    mode.current = 'pending'
    scaleAxis.current = null
    setVisualState({ mode: 'pending', points: [], axis: null })
  }
  const currentGap = (): Point | null => {
    const points = [...pointers.current.values()]
    return points.length === 2
      ? { x: Math.abs(points[0].x - points[1].x), y: Math.abs(points[0].y - points[1].y) }
      : null
  }
  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (!enabled || pointers.current.size >= 2 || mode.current === 'finished') return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointers.current.size === 1) {
      firstPointerId.current = event.pointerId
      origin.current = { x: event.clientX, y: event.clientY }
      mode.current = 'pending'
    } else if (scaleEnabled && mode.current === 'pending') {
      startGap.current = currentGap()
      mode.current = 'scale'
      onScaleStart()
    }
    publish(event.currentTarget)
  }
  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (!pointers.current.has(event.pointerId) || mode.current === 'finished') return
    event.preventDefault()
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    const rect = event.currentTarget.getBoundingClientRect()
    if ((mode.current === 'pending' || mode.current === 'move') && event.pointerId === firstPointerId.current && origin.current) {
      const movement = { x: event.clientX - origin.current.x, y: event.clientY - origin.current.y }
      if (mode.current === 'pending') {
        if (moveAxisLock) scaleAxis.current ??= detectScaleAxis(movement.x, movement.y, moveDeadzone)
        if ((!moveAxisLock && Math.hypot(movement.x, movement.y) >= moveDeadzone) || scaleAxis.current) {
          mode.current = 'move'
          onMoveStart()
        }
      }
      if (mode.current === 'move') {
        const lockedMovement = {
          x: scaleAxis.current === 'y' ? 0 : movement.x,
          y: scaleAxis.current === 'x' ? 0 : movement.y,
        }
        const point = {
          x: scaleAxis.current === 'y' ? origin.current.x - rect.left : event.clientX - rect.left,
          y: scaleAxis.current === 'x' ? origin.current.y - rect.top : event.clientY - rect.top,
        }
        onMoveChange(lockedMovement, point)
      }
    } else if (mode.current === 'scale' && startGap.current) {
      const gap = currentGap()
      if (gap) {
        const delta = { x: gap.x - startGap.current.x, y: gap.y - startGap.current.y }
        scaleAxis.current ??= detectScaleAxis(delta.x, delta.y, scaleDeadzone)
        if (scaleAxis.current) {
          const axis = scaleAxis.current
          const normalized = axis === 'x' ? delta.x / rect.width : delta.y / rect.height
          onScaleChange({ x: axis === 'x' ? 1 + normalized * scaleSensitivity : 1, y: axis === 'y' ? 1 + normalized * scaleSensitivity : 1 }, axis)
        }
      }
    }
    publish(event.currentTarget)
  }
  const onPointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    if (!pointers.current.has(event.pointerId)) return
    event.preventDefault()
    const endedMode = mode.current
    pointers.current.delete(event.pointerId)
    if (endedMode === 'move' && event.pointerId === firstPointerId.current) {
      onMoveCommit()
      mode.current = 'finished'
    } else if (endedMode === 'scale') {
      onScaleCommit()
      mode.current = 'finished'
    }
    if (pointers.current.size === 0) reset()
    else publish(event.currentTarget)
  }
  const onPointerCancel = (event: ReactPointerEvent<HTMLElement>) => {
    if (!pointers.current.has(event.pointerId)) return
    if (mode.current === 'move' || mode.current === 'scale') onCancel()
    reset()
  }

  return { visualState, handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onLostPointerCapture: onPointerCancel } }
}
