import { useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { X } from 'lucide-react'
import type { BrushTip, StrokeLinecap, StrokeLinejoin, StrokeRenderStyle } from '../src/types'
import { endRangeDrag, moveRangeDrag, startRangeDrag } from './rangeDrag'
import { RangeTicks, type RangeTick } from './RangeTicks'
import { BrushPicto } from './StylePicto'
import styles from './CalibrationSentenceEditor.module.css'
import { Button } from './components/ui/button'
import { ChoiceGroup, ChoiceItem } from './components/ui/choice-group'
import { Field, RangeBar } from './components/ui/range'
import { MITER_ANGLE_RANGE, miterAngleOf, miterLimitOf, miterLimitOfAngle } from '../src/services/strokeJoin'
import { JOIN_CHOICES } from './strokeJoinChoices'

const TIP_OPTIONS: Array<{ tip: BrushTip; label: string }> = [
  { tip: 'round', label: '원형' }, { tip: 'ellipse', label: '납작형' }, { tip: 'rectangle', label: '네모형' },
]
export type StrokeEnds = { linecap: StrokeLinecap; linejoin: StrokeLinejoin }
/**
 * 제품 화면의 고르기는 붓촉 이름이 아니라 **글자에 나오는 결과**로 부른다.
 * 일반 붓은 어느 방향이든 굵기가 같고 끝·꺾임의 둥글기를 막대로 준다(0 각짐 ~ 1 반원). 납작 붓은 붓촉이 끝을 만든다.
 * 옛 `각진 끝 / 둥근 끝` 두 고르기는 둥글기 막대가 대신한다 — `둥근 끝`으로 저장된 폰트는 막대를 움직이기 전까지 그대로 그려진다.
 */
const END_CHOICES: Array<{ id: 'plain' | 'flat'; label: string; tip: BrushTip }> = [
  { id: 'plain', label: '일반 붓', tip: 'round' },
  { id: 'flat', label: '납작 붓', tip: 'ellipse' },
]
/** 꺾임 그림. ㄱ 모서리 하나를 그 꺾임으로 그린 것 — 전역 `획` 탭과 획 편집 `스타일` 패널이 같이 쓴다. */
export function JoinPicto({ join }: { join: StrokeLinejoin }) {
  return <svg viewBox="0 0 64 52" aria-hidden="true"><path d="M12 14 H48 V44" fill="none" stroke="currentColor" strokeWidth="12" strokeLinejoin={join} strokeMiterlimit={4} /></svg>
}
/** `적용 안 함` 그림. 획 편집 `스타일` 패널의 줄마다 맨 앞 칸 — 이 획에 따로 정한 값이 없다는 뜻이다. 꺾임 그림과 같은 틀. */
export function NonePicto() {
  return <svg viewBox="0 0 64 52" aria-hidden="true"><circle cx="32" cy="27" r="15" fill="none" stroke="currentColor" strokeWidth="4" /><path d="M21.4 37.6 L42.6 16.4" fill="none" stroke="currentColor" strokeWidth="4" /></svg>
}
const roundnessOf = (style: StrokeRenderStyle): number => style.mode === 'brush' && style.brush.tip === 'round' ? Math.round((style.roundness ?? 0) * 100) : 0
/** 안쪽 둥글기(%). 따로 정하지 않았으면 바깥을 따른다(연결). */
const innerRoundnessOf = (style: StrokeRenderStyle): number => style.mode === 'brush' && style.brush.tip === 'round' && style.innerRoundness !== undefined ? Math.round(style.innerRoundness * 100) : roundnessOf(style)
const innerLinked = (style: StrokeRenderStyle): boolean => style.mode !== 'brush' || style.innerRoundness === undefined
/** 가로·세로 대비(%). + 는 세로 굵게 · 가로 얇게. */
const contrastOf = (style: StrokeRenderStyle): number => style.mode === 'brush' && style.brush.tip === 'round' ? Math.round((style.contrast ?? 0) * 100) : 0
const contrastLabel = (value: number): string => value === 0 ? '같음' : value > 0 ? `세로 +${value}%` : `가로 +${-value}%`
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

export function BrushStyleTrackpad({ committed, draft, onDraftChange, onCommit, onClose, renderPreview, embedded = false, productOptions = false, ends, leading, joinOverrides }: {
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
  /** 탭 안에서 붓보다 먼저 놓는 조절(`획` 탭의 굵기). */
  leading?: ReactNode
  /** 꺾임을 따로 정한 획 수와 `풀기`. 전역 꺾임을 바꿔도 그 획들은 안 바뀌므로 패널 안 한 줄로 알린다(팝업 없음). */
  joinOverrides?: { count: number; onRelease: () => void }
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
  const finish = () => {
    if (beforeRef.current) {
      const after = latestRef.current
      // 둥글기를 줬는데 저장된 끝 모양이 둥근 끝이면 각진 끝으로 같이 되돌린다(막대가 이긴다). 되돌리기 한 줄에 같이 실린다.
      // 꺾임은 막대와 독립이라 그대로 둔다.
      const squareEnds = ends && (Math.max(roundnessOf(after), innerRoundnessOf(after)) > 0 || contrastOf(after) !== 0) && ends.linecap !== 'butt'
      onCommit(beforeRef.current, after, squareEnds ? { before: ends, after: { ...ends, linecap: 'butt' } } : undefined)
    }
    beforeRef.current = null
    setActiveValue(null)
  }
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
  const endChoice = current.mode !== 'brush' ? null : current.brush.tip === 'ellipse' ? 'flat' : current.brush.tip === 'round' ? 'plain' : null
  /** 꺾임 종류는 붓 스타일이 아니라 끝 모양 묶음(`ends`)의 값이라, 스타일은 그대로 두고 끝 모양만 바꿔 한 줄의 되돌리기로 싣는다. */
  const selectJoin = (linejoin: StrokeLinejoin) => {
    if (!ends || ends.linejoin === linejoin) return
    onCommit(committed, committed, { before: ends, after: { ...ends, linejoin } })
  }
  const miterAngle = miterAngleOf(miterLimitOf(current))
  const selectEndChoice = (choice: typeof END_CHOICES[number]) => {
    if (current.mode !== 'brush' || choice.id === endChoice) return
    const next: StrokeRenderStyle = { ...current, brush: { ...current.brush, tip: choice.tip } }
    preview(next)
    onCommit(committed, next)
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
  const range = (label: string, value: number, min: number, max: number, step: number, update: (value: number) => StrokeRenderStyle, output: string, ticks?: readonly RangeTick[]) => <Field label={label} value={productOptions || activeValue === label ? output : undefined}>
    {/* 제품 화면은 값을 늘 보인다(제목 오른쪽). 옛 단독 화면은 끄는 동안만. */}
    <RangeBar min={min} max={max} step={step} value={value}
      onPointerDown={(event) => { begin(label); const next = startRangeDrag(event); if (next !== null && next !== value) preview(update(next)) }}
      onPointerMove={(event) => { const next = moveRangeDrag(event); if (next !== null && next !== value) preview(update(next)) }}
      onChange={(event) => { begin(label); preview(update(Number(event.target.value))) }} onPointerUp={(event) => { endRangeDrag(event); finish() }} onPointerCancel={(event) => { endRangeDrag(event); cancel() }}
      onKeyDown={(event) => handleRangeKeys(event, label)} onKeyUp={finish} aria-label={label === '납작함' ? '붓촉 납작함' : label} data-testid={label === '바깥 둥글기' ? 'style-roundness' : label === '안쪽 둥글기' ? 'style-inner-roundness' : label === '가로·세로 대비' ? 'style-contrast' : label === '뾰족 한계' ? 'style-miter-angle' : undefined} />
    {ticks && <RangeTicks min={min} max={max} ticks={ticks} />}
  </Field>
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
    {activeValue === 'angle' && !productOptions && <output>{current.mode === 'angled-area' ? '절단각' : '각도'} {angle > 0 ? '+' : ''}{angle}°</output>}
  </div>

  const controls = <div className={styles.brushControls} role={embedded ? 'tabpanel' : undefined} aria-label={embedded ? '획' : undefined}>
    {leading}
    {/* 제품 화면은 붓촉형만 쓴다(절단 끝 · 레거시는 뺐다, 09-25 사용자). 옛 저장분이 다른 규칙이면 붓촉형으로 돌아올 길만 남긴다. */}
    {(!productOptions || current.mode !== 'brush') && <ChoiceGroup variant="segment" aria-label="획 생성 규칙">
      {([['brush', '붓촉형'], ['angled-area', '절단 끝'], ['legacy-snapped-centerline', '레거시 스냅 획']] as const).filter(([mode]) => !productOptions || mode === 'brush' || mode === current.mode).map(([mode, label]) => <ChoiceItem key={mode} checked={current.mode === mode} onClick={() => selectMode(mode)}>{label}</ChoiceItem>)}
    </ChoiceGroup>}
    {current.mode === 'brush' && <>
      {productOptions
        ? <>
          <h3>붓</h3>
          {/* 붓은 글자 대신 그 붓으로 그은 물결 하나로 보인다. */}
          <ChoiceGroup variant="tile" className="grid grid-cols-2 gap-2" aria-label="획 끝 모양">{END_CHOICES.map((choice) => (
            <ChoiceItem key={choice.id} checked={endChoice === choice.id} data-end-choice={choice.id} onClick={() => selectEndChoice(choice)} className="[&_svg]:h-[52px] [&_svg]:w-16">
              <BrushPicto flat={choice.tip !== 'round'} /><strong>{choice.label}</strong>
            </ChoiceItem>
          ))}</ChoiceGroup>
        </>
        : <ChoiceGroup variant="tile" className="grid grid-cols-3 gap-1.5" aria-label="붓촉 모양">{TIP_OPTIONS.map(({ tip, label }) => {
        const previewStyle: StrokeRenderStyle = { ...current, brush: { ...current.brush, tip } }
        return <ChoiceItem key={tip} checked={current.brush.tip === tip} onClick={() => selectTip(tip)}>
          <span className={styles.brushTipPreview}>{renderPreview(previewStyle)}</span><span className={`${styles.brushTipIcon} ${styles[`brushTipIcon_${tip}`]}`} aria-hidden="true" /><strong>{label}</strong>
        </ChoiceItem>
      })}</ChoiceGroup>}
      {current.brush.tip !== 'round' && (() => {
        const flatness = range('납작함', aspectRatioToFlatness(current.brush.aspectRatio), 0, 100, 5, (value) => ({ ...current, brush: { ...current.brush, aspectRatio: flatnessToAspectRatio(value) } }), `${aspectRatioToFlatness(current.brush.aspectRatio)}%`, [{ at: 0, text: '0' }, { at: 50, text: '50' }, { at: 100, text: '100' }])
        // 제품 화면은 일반 붓처럼 한 줄에 하나씩 쌓는다. 각도판도 막대와 같은 제목 · 값 줄을 단다.
        return productOptions
          ? <div className={styles.brushControlGrid} style={{ gridTemplateColumns: 'minmax(0, 1fr)', minHeight: 0, gap: 0 }}>
            {flatness}
            <Field as="div" label="각도" value={`${angle > 0 ? '+' : ''}${angle}°`} data-style-row>{renderAnglePad()}</Field>
          </div>
          : <div className={styles.brushControlGrid}>{flatness}{renderAnglePad()}</div>
      })()}
      {current.brush.tip === 'round' && productOptions && ends && <>
        <h3>꺾임</h3>
        <ChoiceGroup variant="tile" className="grid grid-cols-3 gap-2" aria-label="획 꺾임 모양">{JOIN_CHOICES.map((choice) => (
          <ChoiceItem key={choice.id} checked={ends.linejoin === choice.id} data-join-choice={choice.id} onClick={() => selectJoin(choice.id)} className="[&_svg]:h-[44px] [&_svg]:w-14">
            <JoinPicto join={choice.id} /><strong>{choice.label}</strong>
          </ChoiceItem>
        ))}</ChoiceGroup>
        {/* 뾰족 한계는 안쪽 각으로 고른다 — 이 각보다 좁게 꺾이면 평평하게 깎인다. 기본 75도. */}
        {ends.linejoin === 'miter' && <div className={styles.brushControlGrid} style={{ gridTemplateColumns: 'minmax(0, 1fr)', minHeight: 0, gap: 0 }}>
          {range('뾰족 한계', miterAngle, MITER_ANGLE_RANGE.min, MITER_ANGLE_RANGE.max, 5, (value) => ({ ...current, miterLimit: miterLimitOfAngle(value) }), `${miterAngle}°보다 좁으면 깎음`, [{ at: MITER_ANGLE_RANGE.min, text: `${MITER_ANGLE_RANGE.min}°` }, { at: MITER_ANGLE_RANGE.default, text: `${MITER_ANGLE_RANGE.default}°` }, { at: MITER_ANGLE_RANGE.max, text: `${MITER_ANGLE_RANGE.max}°` }])}
        </div>}
        {/* `<p>`는 한 화면 스타일 페이지가 숨기므로(`GlobalStyleMode.module.css`) 줄 하나짜리 div. */}
        {joinOverrides && joinOverrides.count > 0 && <div className={styles.joinOverrideNote} data-testid="style-join-overrides">
          <span>획 {joinOverrides.count}개는 꺾임이 따로 정해져 있어요</span>
          <Button variant="link" size="sm" className="px-0" onClick={joinOverrides.onRelease} data-testid="style-join-release">풀기</Button>
        </div>}
      </>}
      {current.brush.tip === 'round' && productOptions && <div className={styles.brushControlGrid} style={{ gridTemplateColumns: 'minmax(0, 1fr)', minHeight: 0, gap: 0 }}>
        {/* 막대는 5 단위로 탁탁 걸린다(09-25 사용자). */}
        {/* 바깥 · 안쪽은 한 쌍이라 나란히 둔다. */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', alignItems: 'start', columnGap: 16 }}>
          {range('바깥 둥글기', roundnessOf(current), 0, 100, 5, (value) => ({ ...current, roundness: value / 100 }), `${roundnessOf(current)}%`, [{ at: 0 }, { at: 50 }, { at: 100, text: '반원' }])}
          {/* 안쪽은 반폭을 넘어 300%까지. 100에 눈금(바깥의 끝). */}
          <div>
            {range('안쪽 둥글기', innerRoundnessOf(current), 0, 300, 5, (value) => ({ ...current, innerRoundness: value / 100 }), `${innerRoundnessOf(current)}%`, [{ at: 0 }, { at: 100, text: '100' }, { at: 200, text: '200' }, { at: 300, text: '300' }])}
            {/* 안쪽을 따로 정하면 풀린다. `바깥과 같이`로 다시 바깥을 따르게 한다 — 안쪽 막대 바로 아래 작은 글자로. */}
            {!innerLinked(current) && <Button variant="link" size="sm" className="ml-auto mt-0.5 flex w-fit px-0" data-link-inner onClick={() => {
              const { innerRoundness: _dropped, ...rest } = current as Extract<StrokeRenderStyle, { mode: 'brush' }>
              void _dropped
              preview(rest); onCommit(committed, rest)
            }}>바깥과 같이</Button>}
          </div>
        </div>
        {/* 가로·세로 두께 대비. 가운데 0이 같은 굵기, 오른쪽은 세로 굵게 · 가로 얇게. */}
        {/* 세로 굵게(+) 쪽이 훨씬 깊다. 가로 굵게(−)는 −30까지만. 0에 눈금. */}
        <div>{range('가로·세로 대비', contrastOf(current), -30, 100, 5, (value) => ({ ...current, contrast: value / 100 }), contrastLabel(contrastOf(current)), [{ at: -30, text: '가로' }, { at: 0, text: '같음' }, { at: 25 }, { at: 50, text: '세로' }, { at: 75 }, { at: 100, text: '세로 최대' }])}</div>
      </div>}
      {current.brush.tip === 'round' && !productOptions && <p className={styles.roundBrushMessage}>원형은 모든 방향에서 같은 굵기로 그려집니다.</p>}
    </>}
    {current.mode === 'angled-area' && <div className={styles.ruleControlGrid}>{renderAnglePad()}{range('모서리 곡률', Math.round(current.cornerRadius * 100), 0, 100, 1, (value) => ({ ...current, cornerRadius: value / 100 }), `${Math.round(current.cornerRadius * 100)}%`)}</div>}
    {current.mode === 'legacy-snapped-centerline' && <div className={styles.constructionRuleMessage}>
      <strong>레거시 격자 중심선</strong>
      <span>25-unit 스냅 · 75-unit 획 · 35° 절단</span>
    </div>}
    {current.mode === 'dot-pattern' && <div className={styles.constructionRuleMessage}><strong>점 반복 · 보류</strong><span>규칙과 교차부 품질을 다시 설계한 뒤 재개합니다.</span></div>}
  </div>
  if (embedded) return controls
  return <section className={styles.brushSection} aria-label="획 스타일"><div className={styles.brushDrawer}><header className={styles.brushHeader}><div><strong>획 스타일</strong><span>폰트 전체에 적용</span></div><Button variant="quiet" size="icon" onClick={onClose} aria-label="획 스타일 닫기"><X /></Button></header>{controls}</div></section>
}
