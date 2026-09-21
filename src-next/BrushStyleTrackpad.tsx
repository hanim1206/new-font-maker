import { useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { X } from 'lucide-react'
import type { BrushTip, StrokeLinecap, StrokeLinejoin, StrokeRenderStyle } from '../src/types'
import { endRangeDrag, moveRangeDrag, startRangeDrag } from './rangeDrag'
import styles from './CalibrationSentenceEditor.module.css'

const TIP_OPTIONS: Array<{ tip: BrushTip; label: string }> = [
  { tip: 'round', label: '원형' }, { tip: 'ellipse', label: '납작형' }, { tip: 'rectangle', label: '네모형' },
]
export type StrokeEnds = { linecap: StrokeLinecap; linejoin: StrokeLinejoin }
/**
 * 제품 화면의 고르기는 붓촉 이름이 아니라 **글자에 나오는 결과**로 부른다.
 * 둥근 붓촉은 끝 모양(linecap)에 따라 각진 끝(기본, Noto 고딕처럼)도 둥근 끝도 되므로 둘을 따로 내놓는다. 납작 붓은 붓촉이 끝을 만든다.
 */
const END_CHOICES: Array<{ id: 'square' | 'round' | 'flat'; label: string; tip: BrushTip; ends: StrokeEnds | null }> = [
  { id: 'square', label: '각진 끝', tip: 'round', ends: { linecap: 'butt', linejoin: 'miter' } },
  { id: 'round', label: '둥근 끝', tip: 'round', ends: { linecap: 'round', linejoin: 'round' } },
  { id: 'flat', label: '납작 붓', tip: 'ellipse', ends: null },
]
const DEFAULTS: Record<StrokeRenderStyle['mode'], StrokeRenderStyle> = {
  brush: { mode: 'brush', brush: { tip: 'round', aspectRatio: 0.5, angle: 0 } },
  'angled-area': { mode: 'angled-area', cutAngle: 35, cornerRadius: 0.2 },
  'dot-pattern': { mode: 'dot-pattern', dotSize: 1, gap: 0.5, rows: 1, stagger: false, omitEvery: 0 },
  'legacy-snapped-centerline': { mode: 'legacy-snapped-centerline' },
}
/** 각도판 가운데에서 이 거리(px) 밖을 잡으면 돌리기, 안을 잡으면 밀기다. 막대 길이의 절반이 36px이다. */
const ANGLE_PAD_TURN_RADIUS = 24
/** 돌리는 중 가운데에서 이 거리(px) 안은 방향을 읽지 않는다. */
const ANGLE_PAD_DEAD_RADIUS = 10
function clamp(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, Math.round(value))) }
function clampCutAngle(value: number, preferredSign = 1): number {
  const limited = clamp(value, -60, 60)
  if (Math.abs(limited) >= 15) return limited
  return (limited === 0 ? preferredSign : Math.sign(limited)) * 15
}
function aspectRatioToFlatness(value: number): number { return Math.round((1 - value) / 0.8 * 100) }
function flatnessToAspectRatio(value: number): number { return Math.max(0.2, Math.min(1, 1 - value / 100 * 0.8)) }

export function BrushStyleTrackpad({ committed, draft, onDraftChange, onCommit, onClose, renderPreview, embedded = false, productOptions = false, ends }: {
  committed: StrokeRenderStyle
  draft: StrokeRenderStyle | null
  onDraftChange: (style: StrokeRenderStyle | null) => void
  onCommit: (before: StrokeRenderStyle, after: StrokeRenderStyle, ends?: { before: StrokeEnds; after: StrokeEnds }) => void
  onClose?: () => void
  renderPreview: (style: StrokeRenderStyle, ends?: StrokeEnds) => ReactNode
  embedded?: boolean
  /** 제품 화면용 선택지: 네모형 붓촉과 레거시 스냅 획을 뺀다. 이미 그 값으로 저장된 폰트는 그대로 그려지고, 다른 것을 고르면 바뀐다. */
  productOptions?: boolean
  /** 지금 저장된 끝 모양. 제품 화면의 `각진 끝 / 둥근 끝`을 가르는 데 쓴다. */
  ends?: StrokeEnds
}) {
  const current = draft ?? committed
  const beforeRef = useRef<StrokeRenderStyle | null>(null)
  const latestRef = useRef(current)
  // 각도판은 두 가지로 잡힌다. 막대 끝 · 바깥을 잡으면 `turn`: 손가락이 가운데를 중심으로 돈 만큼 각도가 돈다.
  // 막대 가운데를 잡으면 `slide`: 돌릴 중심이 손가락 밑이라 방향을 못 읽으므로, 오른쪽 · 아래로 끈 만큼 시계 방향으로 돈다.
  const angleGesture = useRef<{ before: StrokeRenderStyle; startAngle: number; mode: 'turn' | 'slide'; turned: number; pointerAngle: number; startX: number; startY: number } | null>(null)
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
  const endChoice = current.mode !== 'brush' ? null : current.brush.tip === 'ellipse' ? 'flat' : current.brush.tip === 'round' ? (ends?.linecap === 'round' ? 'round' : 'square') : null
  const selectEndChoice = (choice: typeof END_CHOICES[number]) => {
    if (current.mode !== 'brush' || choice.id === endChoice) return
    const next: StrokeRenderStyle = { ...current, brush: { ...current.brush, tip: choice.tip } }
    preview(next)
    onCommit(committed, next, choice.ends && ends ? { before: ends, after: choice.ends } : undefined)
  }
  const handleRangeKeys = (event: KeyboardEvent<HTMLInputElement>, name: string) => {
    if (event.key.startsWith('Arrow') || event.key === 'Home' || event.key === 'End') begin(name)
  }
  /** 각도판 가운데에서 본 손가락의 방향(도, 화면 시계 방향이 +)과 거리(px). */
  const pointerFromCenter = (event: PointerEvent<HTMLDivElement>): { angle: number; radius: number } => {
    const rect = event.currentTarget.getBoundingClientRect()
    const dx = event.clientX - (rect.left + rect.width / 2)
    const dy = event.clientY - (rect.top + rect.height / 2)
    return { angle: Math.atan2(dy, dx) * 180 / Math.PI, radius: Math.hypot(dx, dy) }
  }
  const handleAnglePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const angle = current.mode === 'angled-area' ? current.cutAngle : current.mode === 'brush' ? current.brush.angle : 0
    event.currentTarget.setPointerCapture(event.pointerId)
    const pointer = pointerFromCenter(event)
    angleGesture.current = { before: committed, startAngle: angle, mode: pointer.radius >= ANGLE_PAD_TURN_RADIUS ? 'turn' : 'slide', turned: 0, pointerAngle: pointer.angle, startX: event.clientX, startY: event.clientY }
    setActiveValue('angle')
  }
  const handleAnglePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const gesture = angleGesture.current
    if (!gesture || !event.currentTarget.hasPointerCapture(event.pointerId)) return
    const limit = current.mode === 'angled-area' ? 60 : 90
    if (gesture.mode === 'turn') {
      const pointer = pointerFromCenter(event)
      // 가운데를 스치는 동안은 방향이 흔들리므로 건너뛴다. 한 걸음씩 돈 양을 쌓아 ±180° 경계를 넘어도 안 튄다.
      if (pointer.radius < ANGLE_PAD_DEAD_RADIUS) return
      let step = pointer.angle - gesture.pointerAngle
      if (step > 180) step -= 360
      if (step < -180) step += 360
      gesture.turned += step
      gesture.pointerAngle = pointer.angle
    } else {
      const sensitivity = limit * 2 / Math.max(event.currentTarget.clientWidth, 1)
      gesture.turned = (event.clientX - gesture.startX + event.clientY - gesture.startY) * sensitivity
    }
    const rawAngle = gesture.startAngle + gesture.turned
    // 납작 붓은 반 바퀴 돌리면 같은 모양이라 돌릴 때는 −90~90 안으로 접는다. 밀 때와 절단각은 끝에서 멈춘다.
    const angle = current.mode === 'angled-area'
      ? clampCutAngle(rawAngle, Math.sign(gesture.startAngle))
      : gesture.mode === 'turn' ? Math.round(((rawAngle + 90) % 180 + 180) % 180 - 90) : clamp(rawAngle, -limit, limit)
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
    <input type="range" min={min} max={max} step={step} value={value}
      onPointerDown={(event) => { begin(label); const next = startRangeDrag(event); if (next !== null && next !== value) preview(update(next)) }}
      onPointerMove={(event) => { const next = moveRangeDrag(event); if (next !== null && next !== value) preview(update(next)) }}
      onChange={(event) => { begin(label); preview(update(Number(event.target.value))) }} onPointerUp={(event) => { endRangeDrag(event); finish() }} onPointerCancel={(event) => { endRangeDrag(event); cancel() }}
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
    <div className={styles.strokeRuleModes} style={productOptions ? { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' } : undefined} role="radiogroup" aria-label="획 생성 규칙">
      {([['brush', '붓촉형'], ['angled-area', '절단 끝'], ['legacy-snapped-centerline', '레거시 스냅 획']] as const).filter(([mode]) => !productOptions || mode !== 'legacy-snapped-centerline').map(([mode, label]) => <button key={mode} type="button" role="radio" aria-checked={current.mode === mode} onClick={() => selectMode(mode)}>{label}</button>)}
    </div>
    {current.mode === 'brush' && <>
      {productOptions
        ? <div className={styles.brushTips} style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }} role="radiogroup" aria-label="획 끝 모양">{END_CHOICES.map((choice) => {
          const previewStyle: StrokeRenderStyle = { ...current, brush: { ...current.brush, tip: choice.tip } }
          return <button key={choice.id} type="button" role="radio" aria-checked={endChoice === choice.id} data-end-choice={choice.id} onClick={() => selectEndChoice(choice)}>
            <span className={styles.brushTipPreview}>{renderPreview(previewStyle, choice.ends ?? ends)}</span><span className={`${styles.brushTipIcon} ${styles[`brushTipIcon_${choice.tip}`]}`} style={choice.id === 'square' ? { borderRadius: 3, rotate: '0deg' } : undefined} aria-hidden="true" /><strong>{choice.label}</strong>
          </button>
        })}</div>
        : <div className={styles.brushTips} role="radiogroup" aria-label="붓촉 모양">{TIP_OPTIONS.map(({ tip, label }) => {
        const previewStyle: StrokeRenderStyle = { ...current, brush: { ...current.brush, tip } }
        return <button key={tip} type="button" role="radio" aria-checked={current.brush.tip === tip} onClick={() => selectTip(tip)}>
          <span className={styles.brushTipPreview}>{renderPreview(previewStyle)}</span><span className={`${styles.brushTipIcon} ${styles[`brushTipIcon_${tip}`]}`} aria-hidden="true" /><strong>{label}</strong>
        </button>
      })}</div>}
      {current.brush.tip !== 'round' && <div className={styles.brushControlGrid}>{range('납작함', aspectRatioToFlatness(current.brush.aspectRatio), 0, 100, 1, (value) => ({ ...current, brush: { ...current.brush, aspectRatio: flatnessToAspectRatio(value) } }), `${aspectRatioToFlatness(current.brush.aspectRatio)}%`)}{renderAnglePad()}</div>}
      {current.brush.tip === 'round' && <p className={styles.roundBrushMessage}>{productOptions ? '끝 모양만 다르고, 굵기는 어느 방향이든 같습니다.' : '원형은 모든 방향에서 같은 굵기로 그려집니다.'}</p>}
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
