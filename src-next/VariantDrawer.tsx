import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import styles from './VariantDrawer.module.css'

/** 이만큼 끌어 내리면 닫힌다(px). 덜 끌면 제자리로 튄다. */
const CLOSE_DISTANCE = 90
/** 이만큼 움직여야 끌기로 친다. 그 안이면 안의 단추가 눌린다. */
const DRAG_SLOP = 6
/** 내려가는 움직임 길이. CSS `.drawer` transition과 같다. 다 내려간 뒤 안의 것을 비운다. */
const CLOSE_MS = 280

/**
 * 조절판 자리를 덮는 하단 드로어. 위에 손잡이가 있고, 끌어 내리면 닫힌다. 캔버스 아래를 조금 덮어도 된다(10-06 사용자).
 * 늘 붙어 있고 `open`으로 올라왔다 내려간다 — 그래야 여닫는 움직임이 산다. 닫혀 있으면 `inert`.
 */
export function VariantDrawer({ open, onClose, title, description, children }: { open: boolean; onClose: () => void; title: string; description?: string; children: ReactNode }) {
  const [drag, setDrag] = useState<{ startY: number; dy: number; active: boolean } | null>(null)
  const panel = useRef<HTMLDivElement>(null)
  // 닫히면 끌던 것도 버리고, 다 내려간 뒤 안의 것을 비운다(테스트와 읽기 도구가 "트리 없음"을 보게).
  const [shown, setShown] = useState(open)
  useEffect(() => {
    if (open) { setShown(true); return }
    setDrag(null)
    const timer = window.setTimeout(() => setShown(false), CLOSE_MS)
    return () => window.clearTimeout(timer)
  }, [open])
  const down = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!open || event.button !== 0) return
    setDrag({ startY: event.clientY, dy: 0, active: false })
  }
  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag) return
    const dy = Math.max(0, event.clientY - drag.startY)
    if (!drag.active) {
      if (Math.abs(event.clientY - drag.startY) < DRAG_SLOP) return
      panel.current?.setPointerCapture(event.pointerId)
    }
    setDrag({ ...drag, dy, active: true })
  }
  const up = () => {
    if (!drag) return
    const shouldClose = drag.active && drag.dy > CLOSE_DISTANCE
    setDrag(null)
    if (shouldClose) onClose()
  }
  return <>
    {/* 뒤를 어둡게. 누르면 닫힌다. */}
    <div className={styles.scrim} data-open={open || undefined} onClick={onClose} aria-hidden="true" data-testid="variant-drawer-scrim" />
    <div ref={panel} className={styles.drawer} role="dialog" aria-label={title} data-open={open || undefined} data-dragging={drag?.active || undefined} inert={!open}
      style={drag?.active ? { transform: `translateY(${drag.dy}px)` } : undefined}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} data-testid="variant-drawer">
      <div className={styles.handle} aria-hidden="true" />
      <h2 className={styles.title} data-testid="variant-drawer-title">{title}</h2>
      {description && <p className={styles.description} data-testid="variant-drawer-description">{description}</p>}
      {shown && children}
    </div>
  </>
}
