import { useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { X } from 'lucide-react'
import type { BrushStyle, BrushTip } from '../src/types'
import styles from './CalibrationSentenceEditor.module.css'

const TIP_OPTIONS: Array<{ tip: BrushTip; label: string }> = [
  { tip: 'round', label: '원형' },
  { tip: 'ellipse', label: '납작형' },
  { tip: 'rectangle', label: '네모형' },
]

function clampAngle(value: number): number {
  return Math.max(-90, Math.min(90, Math.round(value)))
}

function aspectRatioToFlatness(value: number): number {
  return Math.round((1 - value) / 0.8 * 100)
}

function flatnessToAspectRatio(value: number): number {
  return Math.max(0.2, Math.min(1, 1 - value / 100 * 0.8))
}

export function BrushStyleTrackpad({
  committed,
  draft,
  onDraftChange,
  onCommit,
  onClose,
  renderPreview,
  embedded = false,
}: {
  committed: BrushStyle
  draft: BrushStyle | null
  onDraftChange: (style: BrushStyle | null) => void
  onCommit: (before: BrushStyle, after: BrushStyle) => void
  onClose?: () => void
  renderPreview: (style: BrushStyle) => ReactNode
  embedded?: boolean
}) {
  const current = draft ?? committed
  const gesture = useRef<{ before: BrushStyle; startX: number; startAngle: number } | null>(null)
  const sliderBefore = useRef<BrushStyle | null>(null)
  const latestStyle = useRef(current)
  const [isFlatnessActive, setIsFlatnessActive] = useState(false)
  const [isAngleActive, setIsAngleActive] = useState(false)
  latestStyle.current = current

  const previewStyle = (next: BrushStyle) => {
    latestStyle.current = next
    onDraftChange(next)
  }

  const commitDraft = (before: BrushStyle | null = sliderBefore.current) => {
    const after = latestStyle.current
    if (before) onCommit(before, after)
    sliderBefore.current = null
    gesture.current = null
    setIsFlatnessActive(false)
  }

  const selectTip = (tip: BrushTip) => {
    if (tip === current.tip) return
    const next = { ...current, tip }
    previewStyle(next)
    onCommit(committed, next)
  }

  const beginSlider = () => {
    if (!sliderBefore.current) sliderBefore.current = committed
    setIsFlatnessActive(true)
  }
  const handleSliderChange = (flatness: number) => {
    beginSlider()
    previewStyle({ ...latestStyle.current, aspectRatio: flatnessToAspectRatio(flatness) })
  }
  const handleSliderKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key.startsWith('Arrow') || event.key === 'Home' || event.key === 'End') beginSlider()
  }
  const handleSliderKeyUp = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key.startsWith('Arrow') || event.key === 'Home' || event.key === 'End') commitDraft()
  }

  const handleAnglePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    gesture.current = { before: committed, startX: event.clientX, startAngle: current.angle }
    setIsAngleActive(true)
  }
  const handleAnglePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!gesture.current || !event.currentTarget.hasPointerCapture(event.pointerId)) return
    const sensitivity = 180 / Math.max(event.currentTarget.clientWidth, 1)
    const angle = clampAngle(gesture.current.startAngle + (event.clientX - gesture.current.startX) * sensitivity)
    previewStyle({ ...latestStyle.current, angle })
  }
  const finishAngle = (event: PointerEvent<HTMLDivElement>) => {
    if (!gesture.current) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    const before = gesture.current.before
    gesture.current = null
    setIsAngleActive(false)
    onCommit(before, latestStyle.current)
  }

  const controls = (
    <div className={styles.brushControls} role={embedded ? 'tabpanel' : undefined} aria-label={embedded ? '획 스타일' : undefined}>
      <div className={styles.brushTips} role="radiogroup" aria-label="붓촉 모양">
          {TIP_OPTIONS.map(({ tip, label }) => {
            const previewStyle = { ...current, tip }
            return <button key={tip} type="button" role="radio" aria-checked={current.tip === tip} onClick={() => selectTip(tip)}>
              <span className={styles.brushTipPreview}>{renderPreview(previewStyle)}</span>
              <span className={`${styles.brushTipIcon} ${styles[`brushTipIcon_${tip}`]}`} aria-hidden="true" />
              <strong>{label}</strong>
            </button>
          })}
      </div>

      {current.tip !== 'round' && <div className={styles.brushControlGrid}>
          <label className={styles.flatnessControl}>
            <span>납작함 {isFlatnessActive && <output>{aspectRatioToFlatness(current.aspectRatio)}%</output>}</span>
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={aspectRatioToFlatness(current.aspectRatio)}
              onPointerDown={beginSlider}
              onChange={(event) => handleSliderChange(Number(event.target.value))}
              onPointerUp={() => commitDraft()}
              onPointerCancel={() => commitDraft()}
              onKeyDown={handleSliderKeyDown}
              onKeyUp={handleSliderKeyUp}
              aria-label="붓촉 납작함"
            />
          </label>

          <div
            className={styles.brushAnglePad}
            role="slider"
            tabIndex={0}
            aria-label="붓촉 각도"
            aria-valuemin={-90}
            aria-valuemax={90}
            aria-valuenow={current.angle}
            onPointerDown={handleAnglePointerDown}
            onPointerMove={handleAnglePointerMove}
            onPointerUp={finishAngle}
            onPointerCancel={finishAngle}
            onKeyDown={(event) => {
              if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
              event.preventDefault()
              setIsAngleActive(true)
              const next = { ...current, angle: clampAngle(current.angle + (event.key === 'ArrowRight' ? 1 : -1)) }
              previewStyle(next)
              onCommit(committed, next)
            }}
            onKeyUp={() => setIsAngleActive(false)}
          >
            <span className={styles.brushAngleGuide} style={{ rotate: `${current.angle}deg` }} aria-hidden="true" />
            <span
              className={`${styles.brushAnglePuck} ${current.tip === 'rectangle' ? styles.brushAnglePuckRectangle : ''}`}
              style={{ width: 72, height: Math.max(14.4, 72 * current.aspectRatio), rotate: `${current.angle}deg` }}
              aria-hidden="true"
            />
            {isAngleActive && <output>각도 {current.angle > 0 ? '+' : ''}{current.angle}°</output>}
          </div>
      </div>}

      {current.tip === 'round' && <p className={styles.roundBrushMessage}>원형은 모든 방향에서 같은 굵기로 그려집니다.</p>}
    </div>
  )

  if (embedded) return controls

  return (
    <section className={styles.brushSection} aria-label="획 스타일">
      <div className={styles.brushDrawer}>
        <header className={styles.brushHeader}>
          <div><strong>획 스타일</strong><span>폰트 전체에 적용</span></div>
          <button type="button" onClick={onClose} aria-label="획 스타일 닫기"><X size={17} /></button>
        </header>
        {controls}
      </div>
    </section>
  )
}
