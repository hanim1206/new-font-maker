import { useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { X } from 'lucide-react'
import type { BrushTip, StrokeRenderStyle } from '../src/types'
import styles from './CalibrationSentenceEditor.module.css'

const TIP_OPTIONS: Array<{ tip: BrushTip; label: string }> = [
  { tip: 'round', label: '원형' }, { tip: 'ellipse', label: '납작형' }, { tip: 'rectangle', label: '네모형' },
]
const DEFAULTS: Record<StrokeRenderStyle['mode'], StrokeRenderStyle> = {
  brush: { mode: 'brush', brush: { tip: 'round', aspectRatio: 0.5, angle: 0 } },
  'angled-area': { mode: 'angled-area', cutAngle: 35, cornerRadius: 0.2 },
  'dot-pattern': { mode: 'dot-pattern', dotSize: 1, gap: 0.5, rows: 1, stagger: false, omitEvery: 0 },
  'legacy-snapped-centerline': { mode: 'legacy-snapped-centerline' },
}
function clamp(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, Math.round(value))) }
function clampCutAngle(value: number, preferredSign = 1): number {
  const limited = clamp(value, -60, 60)
  if (Math.abs(limited) >= 15) return limited
  return (limited === 0 ? preferredSign : Math.sign(limited)) * 15
}
function aspectRatioToFlatness(value: number): number { return Math.round((1 - value) / 0.8 * 100) }
function flatnessToAspectRatio(value: number): number { return Math.max(0.2, Math.min(1, 1 - value / 100 * 0.8)) }

export function BrushStyleTrackpad({ committed, draft, onDraftChange, onCommit, onClose, renderPreview, embedded = false }: {
  committed: StrokeRenderStyle
  draft: StrokeRenderStyle | null
  onDraftChange: (style: StrokeRenderStyle | null) => void
  onCommit: (before: StrokeRenderStyle, after: StrokeRenderStyle) => void
  onClose?: () => void
  renderPreview: (style: StrokeRenderStyle) => ReactNode
  embedded?: boolean
}) {
  const current = draft ?? committed
  const beforeRef = useRef<StrokeRenderStyle | null>(null)
  const latestRef = useRef(current)
  const angleGesture = useRef<{ before: StrokeRenderStyle; startX: number; startAngle: number } | null>(null)
  const [activeValue, setActiveValue] = useState<string | null>(null)
  latestRef.current = current

  const preview = (next: StrokeRenderStyle) => { latestRef.current = next; onDraftChange(next) }
  const begin = (name: string) => { if (!beforeRef.current) beforeRef.current = committed; setActiveValue(name) }
  const finish = () => { if (beforeRef.current) onCommit(beforeRef.current, latestRef.current); beforeRef.current = null; setActiveValue(null) }
  const cancel = () => {
    const before = beforeRef.current
    beforeRef.current = null
    setActiveValue(null)
    if (!before) return
    latestRef.current = before
    onDraftChange(null)
  }
  const selectMode = (mode: StrokeRenderStyle['mode']) => {
    if (mode === current.mode) return
    const next = DEFAULTS[mode]
    preview(next); onCommit(committed, next)
  }
  const selectTip = (tip: BrushTip) => {
    if (current.mode !== 'brush' || tip === current.brush.tip) return
    const next: StrokeRenderStyle = { ...current, brush: { ...current.brush, tip } }
    preview(next); onCommit(committed, next)
  }
  const handleRangeKeys = (event: KeyboardEvent<HTMLInputElement>, name: string) => {
    if (event.key.startsWith('Arrow') || event.key === 'Home' || event.key === 'End') begin(name)
  }
  const handleAnglePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const angle = current.mode === 'angled-area' ? current.cutAngle : current.mode === 'brush' ? current.brush.angle : 0
    event.currentTarget.setPointerCapture(event.pointerId)
    angleGesture.current = { before: committed, startX: event.clientX, startAngle: angle }
    setActiveValue('angle')
  }
  const handleAnglePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!angleGesture.current || !event.currentTarget.hasPointerCapture(event.pointerId)) return
    const limit = current.mode === 'angled-area' ? 60 : 90
    const sensitivity = limit * 2 / Math.max(event.currentTarget.clientWidth, 1)
    const rawAngle = angleGesture.current.startAngle + (event.clientX - angleGesture.current.startX) * sensitivity
    const angle = current.mode === 'angled-area' ? clampCutAngle(rawAngle, Math.sign(angleGesture.current.startAngle)) : clamp(rawAngle, -limit, limit)
    if (current.mode === 'angled-area') preview({ ...current, cutAngle: angle })
    else if (current.mode === 'brush') preview({ ...current, brush: { ...current.brush, angle } })
  }
  const finishAngle = (event: PointerEvent<HTMLDivElement>) => {
    if (!angleGesture.current) return
    const before = angleGesture.current.before
    angleGesture.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    setActiveValue(null)
    onCommit(before, latestRef.current)
  }
  const cancelAngle = (event: PointerEvent<HTMLDivElement>) => {
    if (!angleGesture.current) return
    const before = angleGesture.current.before
    angleGesture.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    latestRef.current = before
    setActiveValue(null)
    onDraftChange(null)
  }
  const range = (label: string, value: number, min: number, max: number, step: number, update: (value: number) => StrokeRenderStyle, output: string) => <label className={styles.ruleControl}>
    <span>{label} {activeValue === label && <output>{output}</output>}</span>
    <input type="range" min={min} max={max} step={step} value={value} onPointerDown={() => begin(label)}
      onChange={(event) => { begin(label); preview(update(Number(event.target.value))) }} onPointerUp={finish} onPointerCancel={cancel} onLostPointerCapture={cancel}
      onKeyDown={(event) => handleRangeKeys(event, label)} onKeyUp={finish} aria-label={label === '납작함' ? '붓촉 납작함' : label} />
  </label>
  const angle = current.mode === 'angled-area' ? current.cutAngle : current.mode === 'brush' ? current.brush.angle : 0
  const angleLimit = current.mode === 'angled-area' ? 60 : 90
  const renderAnglePad = () => <div className={styles.brushAnglePad} role="slider" tabIndex={0} aria-label={current.mode === 'angled-area' ? '절단각' : '붓촉 각도'}
    aria-valuemin={-angleLimit} aria-valuemax={angleLimit} aria-valuenow={angle} onPointerDown={handleAnglePointerDown}
    onPointerMove={handleAnglePointerMove} onPointerUp={finishAngle} onPointerCancel={cancelAngle} onLostPointerCapture={cancelAngle} onKeyDown={(event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      event.preventDefault()
      const delta = event.key === 'ArrowRight' ? 1 : -1
      const nextAngle = current.mode === 'angled-area'
        ? (angle === -15 && delta > 0 ? 15 : angle === 15 && delta < 0 ? -15 : clampCutAngle(angle + delta, Math.sign(angle)))
        : clamp(angle + delta, -angleLimit, angleLimit)
      const next = current.mode === 'angled-area' ? { ...current, cutAngle: nextAngle } : current.mode === 'brush' ? { ...current, brush: { ...current.brush, angle: nextAngle } } : current
      preview(next); onCommit(committed, next)
    }}>
    <span className={styles.brushAngleGuide} style={{ rotate: `${angle}deg` }} aria-hidden="true" />
    {current.mode === 'angled-area' && <span className={styles.brushAngleDeadZone} aria-hidden="true" />}
    <span className={styles.brushAnglePuck} style={{ width: 72, height: current.mode === 'angled-area' ? 8 : 22, rotate: `${angle}deg` }} aria-hidden="true" />
    {activeValue === 'angle' && <output>{current.mode === 'angled-area' ? '절단각' : '각도'} {angle > 0 ? '+' : ''}{angle}°</output>}
  </div>

  const controls = <div className={styles.brushControls} role={embedded ? 'tabpanel' : undefined} aria-label={embedded ? '획 스타일' : undefined}>
    <div className={styles.strokeRuleModes} role="radiogroup" aria-label="획 생성 규칙">
      {([['brush', '붓촉형'], ['angled-area', '절단 끝'], ['legacy-snapped-centerline', '레거시 스냅 획']] as const).map(([mode, label]) => <button key={mode} type="button" role="radio" aria-checked={current.mode === mode} onClick={() => selectMode(mode)}>{label}</button>)}
    </div>
    {current.mode === 'brush' && <>
      <div className={styles.brushTips} role="radiogroup" aria-label="붓촉 모양">{TIP_OPTIONS.map(({ tip, label }) => {
        const previewStyle: StrokeRenderStyle = { ...current, brush: { ...current.brush, tip } }
        return <button key={tip} type="button" role="radio" aria-checked={current.brush.tip === tip} onClick={() => selectTip(tip)}>
          <span className={styles.brushTipPreview}>{renderPreview(previewStyle)}</span><span className={`${styles.brushTipIcon} ${styles[`brushTipIcon_${tip}`]}`} aria-hidden="true" /><strong>{label}</strong>
        </button>
      })}</div>
      {current.brush.tip !== 'round' && <div className={styles.brushControlGrid}>{range('납작함', aspectRatioToFlatness(current.brush.aspectRatio), 0, 100, 1, (value) => ({ ...current, brush: { ...current.brush, aspectRatio: flatnessToAspectRatio(value) } }), `${aspectRatioToFlatness(current.brush.aspectRatio)}%`)}{renderAnglePad()}</div>}
      {current.brush.tip === 'round' && <p className={styles.roundBrushMessage}>원형은 모든 방향에서 같은 굵기로 그려집니다.</p>}
    </>}
    {current.mode === 'angled-area' && <div className={styles.ruleControlGrid}>{renderAnglePad()}{range('모서리 곡률', Math.round(current.cornerRadius * 100), 0, 100, 1, (value) => ({ ...current, cornerRadius: value / 100 }), `${Math.round(current.cornerRadius * 100)}%`)}</div>}
    {current.mode === 'legacy-snapped-centerline' && <div className={styles.constructionRuleMessage}>
      <strong>레거시 격자 중심선</strong>
      <span>25-unit 스냅 · 75-unit 획 · 35° 절단</span>
      <small>형태 그리드 Grid Lab과 다른 기존 렌더 실험입니다.</small>
      <a className={styles.constructionRuleLink} href="/grid-lab">형태 그리드 편집 열기</a>
    </div>}
    {current.mode === 'dot-pattern' && <div className={styles.constructionRuleMessage}><strong>점 반복 · 보류</strong><span>규칙과 교차부 품질을 다시 설계한 뒤 재개합니다.</span></div>}
  </div>
  if (embedded) return controls
  return <section className={styles.brushSection} aria-label="획 스타일"><div className={styles.brushDrawer}><header className={styles.brushHeader}><div><strong>획 스타일</strong><span>폰트 전체에 적용</span></div><button type="button" onClick={onClose} aria-label="획 스타일 닫기"><X size={17} /></button></header>{controls}</div></section>
}
