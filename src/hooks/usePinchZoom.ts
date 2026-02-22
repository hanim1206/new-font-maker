import { useRef, useCallback, useEffect } from 'react'
import { useUIStore } from '../stores/uiStore'

interface PinchZoomOptions {
  enabled?: boolean
  minZoom?: number
  maxZoom?: number
}

export function usePinchZoom(
  svgRef: React.RefObject<SVGSVGElement | null>,
  options: PinchZoomOptions = {}
) {
  const { enabled = true, minZoom = 0.5, maxZoom = 5 } = options
  const { canvasZoom, canvasPan, setCanvasZoom, setCanvasPan, resetCanvasView } = useUIStore()

  const initialDistance = useRef(0)
  const initialZoom = useRef(1)
  const initialPan = useRef({ x: 0, y: 0 })
  const initialMidpoint = useRef({ x: 0, y: 0 })
  const isPinching = useRef(false)
  const isPanning = useRef(false)
  const lastTouchPos = useRef({ x: 0, y: 0 })
  const lastDoubleTapTime = useRef(0)

  const getDistance = (t1: Touch, t2: Touch) => {
    const dx = t1.clientX - t2.clientX
    const dy = t1.clientY - t2.clientY
    return Math.sqrt(dx * dx + dy * dy)
  }

  const getMidpoint = (t1: Touch, t2: Touch) => ({
    x: (t1.clientX + t2.clientX) / 2,
    y: (t1.clientY + t2.clientY) / 2,
  })

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (!enabled) return

    if (e.touches.length === 2) {
      // 핀치 시작
      e.preventDefault()
      isPinching.current = true
      isPanning.current = false
      initialDistance.current = getDistance(e.touches[0], e.touches[1])
      initialZoom.current = canvasZoom
      initialPan.current = { ...canvasPan }
      initialMidpoint.current = getMidpoint(e.touches[0], e.touches[1])
    } else if (e.touches.length === 1 && canvasZoom > 1) {
      // 줌 상태에서 한 손가락 패닝
      isPanning.current = true
      lastTouchPos.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
      }
    }
  }, [enabled, canvasZoom, canvasPan])

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!enabled) return

    if (isPinching.current && e.touches.length === 2) {
      e.preventDefault()
      const dist = getDistance(e.touches[0], e.touches[1])
      const scale = dist / initialDistance.current
      const newZoom = Math.max(minZoom, Math.min(maxZoom, initialZoom.current * scale))
      setCanvasZoom(newZoom)

      // 핀치 중심 기준 패닝
      const mid = getMidpoint(e.touches[0], e.touches[1])
      const dx = mid.x - initialMidpoint.current.x
      const dy = mid.y - initialMidpoint.current.y
      setCanvasPan({
        x: initialPan.current.x + dx,
        y: initialPan.current.y + dy,
      })
    } else if (isPanning.current && e.touches.length === 1) {
      e.preventDefault()
      const dx = e.touches[0].clientX - lastTouchPos.current.x
      const dy = e.touches[0].clientY - lastTouchPos.current.y
      lastTouchPos.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
      }
      setCanvasPan({
        x: canvasPan.x + dx,
        y: canvasPan.y + dy,
      })
    }
  }, [enabled, minZoom, maxZoom, canvasPan, setCanvasZoom, setCanvasPan])

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    if (e.touches.length < 2) {
      isPinching.current = false
    }
    if (e.touches.length === 0) {
      isPanning.current = false

      // 더블탭 감지 → 줌 리셋/줌인
      const now = Date.now()
      if (now - lastDoubleTapTime.current < 300) {
        if (canvasZoom > 1) {
          resetCanvasView()
        } else {
          setCanvasZoom(2.5)
        }
        lastDoubleTapTime.current = 0
      } else {
        lastDoubleTapTime.current = now
      }
    }
  }, [canvasZoom, resetCanvasView, setCanvasZoom])

  useEffect(() => {
    const svg = svgRef.current
    if (!svg || !enabled) return

    const opts = { passive: false } as AddEventListenerOptions
    svg.addEventListener('touchstart', handleTouchStart, opts)
    svg.addEventListener('touchmove', handleTouchMove, opts)
    svg.addEventListener('touchend', handleTouchEnd)

    return () => {
      svg.removeEventListener('touchstart', handleTouchStart)
      svg.removeEventListener('touchmove', handleTouchMove)
      svg.removeEventListener('touchend', handleTouchEnd)
    }
  }, [svgRef, enabled, handleTouchStart, handleTouchMove, handleTouchEnd])

  return { zoom: canvasZoom, pan: canvasPan, resetView: resetCanvasView }
}
