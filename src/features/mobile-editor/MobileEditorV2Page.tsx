import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, ChevronLeft, ChevronRight, Clock3, Grid2X2, History, LockKeyhole, RotateCcw, Undo2 } from 'lucide-react'
import { SvgRenderer } from '../../renderers/SvgRenderer'
import { useJamoStore } from '../../stores/jamoStore'
import { useLayoutStore } from '../../stores/layoutStore'
import { useMobileEditorStore } from '../../stores/mobileEditorStore'
import { useEditorHistoryStore } from '../../stores/editorHistoryStore'
import { calculateBoxes, calculateRawBoxes } from '../../utils/layoutCalculator'
import { classifyJungseong, decomposeSyllable, decomposeSyllableWithOverrides, getLayoutsForJamoType, getSampleSyllableForLayout, LAYOUT_LABELS } from '../../utils/hangulUtils'
import { pointsToSvgD } from '../../utils/pathUtils'
import { formatMoveSummary, formatScaleSummary, moveHandle, movePoint, moveStroke, scaleStroke } from '../../services/editorCommands'
import { moveJamoPadding } from '../../services/jamoPaddingCommands'
import { applyRelativeJamoScale, DEFAULT_JAMO_TRANSFORM, getSyllableTransform, isDefaultJamoTransform, previewJamoTransform, resetJamoTransformPosition, resetJamoTransformScale, resetSyllableTransform, setSyllableTransform } from '../../services/syllableOverrideCommands'
import { getChJungVerticalGap, setChJungVerticalGap, supportsChJungVerticalGap } from '../../services/layoutGapCommands'
import { resizeLayoutPartEdge, type LayoutPartEdge } from '../../services/layoutPartEdgeCommands'
import { createAlignmentReferenceFromBounds, findSmartGuideSnap, getStrokeBoundsInGlyph } from '../../services/smartGuideUtils'
import { getAcceleratedQuickPickOffset, getActiveJamo, getCarouselSyllables, getJamoCandidates, getLayoutContextSyllables, getPartLabel, getRenderedStrokeTargets, getSyllableJamoChars, replaceSyllablePart } from '../../services/mobileEditorContext'
import { getBoxBoundsInNormalizedCoordinates, type NormalizedBounds } from '../../utils/containerBoxUtils'
import { resolveGapInsets } from '../../utils/layoutGapUtils'
import { addHandlesToPoint, mergeStrokes, pointHasHandles, removeHandlesFromPoint, splitStroke } from '../../utils/strokeEditUtils'
import { MERGE_PROXIMITY } from '../../utils/snapUtils'
import { applyAppRoute, pushAppRoute } from '../../utils/appRoutes'
import type { AlignmentReference, Axis, BoxConfig, DecomposedSyllable, EditorHistoryEntry, JamoData, JamoTransform, LayoutSchema, LayoutType, MobileEditorPart, MobileEditorSelection, Padding, Part, SmartGuide, StrokeDataV2, StrokeMoveDelta, StrokeScale } from '../../types'
import styles from './MobileEditorV2.module.css'
import { useUnifiedTrackpad } from './useUnifiedTrackpad'
import { StrokeToolRail } from './StrokeToolRail'

const MOVE_GRID_STEP = 0.005
const LAYOUT_SPLIT_STEP = 0.01
const SCALE_GRID_STEP = 0.01
const SMART_GUIDE_THRESHOLD = 0.018
const QUICK_PICK_DELAY = 360
const QUICK_PICK_DEAD_ZONE = 8
const QUICK_PICK_ENABLED = false

type JamoType = JamoData['type']
type EditMode = 'none' | 'part' | 'stroke' | 'point' | 'handle'

interface ActiveEditTarget {
  syllable: string
  layoutType: DecomposedSyllable['layoutType']
  editorPart: MobileEditorPart
  renderPart: Part
  layoutParts: Part[]
  jamo: JamoData
  rawSchema: LayoutSchema
  boxes: Partial<Record<Part, BoxConfig>>
  mode: EditMode
  strokeId: string | null
  pointIndex: number | null
  handleType: 'in' | 'out' | null
  strokeContainer: BoxConfig
  movementBounds: NormalizedBounds
  alignmentReferences: AlignmentReference[]
}

function getJamo(type: JamoType, char: string): JamoData | undefined {
  const state = useJamoStore.getState()
  if (type === 'choseong') return state.getChoseong(char)
  if (type === 'jungseong') return state.getJungseong(char)
  return state.getJongseong(char)
}

function updateJamo(type: JamoType, char: string, jamo: JamoData): void {
  const state = useJamoStore.getState()
  if (type === 'choseong') state.updateChoseong(char, jamo)
  else if (type === 'jungseong') state.updateJungseong(char, jamo)
  else state.updateJongseong(char, jamo)
}

function withPreviewJamo(syllable: DecomposedSyllable, part: MobileEditorPart, previewJamo?: JamoData | null): DecomposedSyllable {
  if (!previewJamo) return syllable
  if (part === 'CH') return { ...syllable, choseong: previewJamo }
  if (part === 'JU') return { ...syllable, jungseong: previewJamo }
  return { ...syllable, jongseong: previewJamo }
}

function withEffectivePadding(schema: LayoutSchema, padding: LayoutSchema['padding']): LayoutSchema {
  return { ...schema, padding }
}

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(iso))
}

function AppBar({ title, onBack, onHistory }: { title: string; onBack: () => void; onHistory?: () => void }) {
  return (
    <header className="flex h-16 items-center justify-between border-b border-border-subtle px-3 pt-safe-t">
      <button type="button" className="flex min-h-touch min-w-touch items-center justify-center rounded-lg text-text-dim-2 hover:bg-surface-hover" onClick={onBack} aria-label="뒤로"><ArrowLeft size={22} aria-hidden="true" /></button>
      <h1 className="text-base font-semibold tracking-tight">{title}</h1>
      {onHistory ? <button type="button" className="flex min-h-touch min-w-touch items-center justify-center rounded-lg text-text-dim-2 hover:bg-surface-hover" onClick={onHistory} aria-label="편집 히스토리"><History size={21} aria-hidden="true" /></button> : <span className="min-w-touch" aria-hidden="true" />}
    </header>
  )
}

function StaticGlyph({ syllableChar }: { syllableChar: string }) {
  const choseong = useJamoStore((state) => state.choseong)
  const jungseong = useJamoStore((state) => state.jungseong)
  const jongseong = useJamoStore((state) => state.jongseong)
  const layoutSchemas = useLayoutStore((state) => state.layoutSchemas)
  const globalPadding = useLayoutStore((state) => state.globalPadding)
  const paddingOverrides = useLayoutStore((state) => state.paddingOverrides)
  const syllable = decomposeSyllable(syllableChar, choseong, jungseong, jongseong)
  const schema = withEffectivePadding(layoutSchemas[syllable.layoutType], { ...globalPadding, ...paddingOverrides[syllable.layoutType] })
  return <GlyphPreview syllableChar={syllableChar} activePart="CH" schema={schema} selection={{ kind: 'none' }} highlightActivePart={false} />
}

function IntegratedCarousel({ syllable, activePart, children }: { syllable: string; activePart: MobileEditorPart; children: ReactNode }) {
  const items = getCarouselSyllables(syllable, activePart)
  const candidates = getJamoCandidates(activePart)
  const currentChars = getSyllableJamoChars(syllable)
  const currentJamo = activePart === 'CH' ? currentChars.choseong : activePart === 'JU' ? currentChars.jungseong : currentChars.jongseong
  const currentIndex = Math.max(0, candidates.indexOf(currentJamo))
  const [quickOpen, setQuickOpen] = useState(false)
  const [quickIndex, setQuickIndex] = useState(currentIndex)
  const [quickCancelled, setQuickCancelled] = useState(false)
  const quickRef = useRef({
    tracking: false,
    longPressEligible: false,
    active: false,
    cancelled: false,
    pointerId: -1,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
    startIndex: currentIndex,
    selectedIndex: currentIndex,
    dragSeen: false,
    timer: 0,
  })
  const choose = (next: string) => useMobileEditorStore.getState().setActiveSyllable(next)
  const clearQuickTimer = () => {
    if (quickRef.current.timer) window.clearTimeout(quickRef.current.timer)
    quickRef.current.timer = 0
  }
  const closeQuickPicker = () => {
    clearQuickTimer()
    quickRef.current.tracking = false
    quickRef.current.longPressEligible = false
    quickRef.current.active = false
    quickRef.current.cancelled = false
    setQuickOpen(false)
    setQuickCancelled(false)
  }
  const vibrate = () => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(8)
  }
  const handleQuickPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const target = event.target instanceof Element ? event.target : null
    if (target?.closest('button, [role="button"]')) return

    clearQuickTimer()
    event.currentTarget.setPointerCapture(event.pointerId)
    quickRef.current.tracking = true
    quickRef.current.longPressEligible = QUICK_PICK_ENABLED
    quickRef.current.active = false
    quickRef.current.cancelled = false
    quickRef.current.pointerId = event.pointerId
    quickRef.current.startX = event.clientX
    quickRef.current.startY = event.clientY
    quickRef.current.currentX = event.clientX
    quickRef.current.currentY = event.clientY
    quickRef.current.startIndex = currentIndex
    quickRef.current.selectedIndex = currentIndex
    quickRef.current.dragSeen = false
    setQuickIndex(currentIndex)
    if (QUICK_PICK_ENABLED) {
      quickRef.current.timer = window.setTimeout(() => {
        if (!quickRef.current.tracking || !quickRef.current.longPressEligible) return
        quickRef.current.active = true
        setQuickOpen(true)
        vibrate()
      }, QUICK_PICK_DELAY)
    }
  }
  const updateQuickSelection = (movementX: number, clientY: number) => {
    const offset = getAcceleratedQuickPickOffset(movementX)
    const nextIndex = Math.max(0, Math.min(candidates.length - 1, quickRef.current.startIndex + offset))
    const cancelled = clientY - quickRef.current.startY > 96
    if (nextIndex !== quickRef.current.selectedIndex) {
      quickRef.current.selectedIndex = nextIndex
      setQuickIndex(nextIndex)
      vibrate()
    }
    if (cancelled !== quickRef.current.cancelled) {
      quickRef.current.cancelled = cancelled
      setQuickCancelled(cancelled)
    }
  }
  const handleQuickPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!quickRef.current.tracking || event.pointerId !== quickRef.current.pointerId) return
    quickRef.current.currentX = event.clientX
    quickRef.current.currentY = event.clientY
    const movementX = event.clientX - quickRef.current.startX
    const movementY = event.clientY - quickRef.current.startY
    if (!quickRef.current.active && Math.hypot(movementX, movementY) > QUICK_PICK_DEAD_ZONE) {
      clearQuickTimer()
      quickRef.current.longPressEligible = false
      quickRef.current.dragSeen = true
      return
    }
    if (quickRef.current.active) updateQuickSelection(movementX, event.clientY)
  }
  const commitQuickSelection = () => {
    clearQuickTimer()
    if (!quickRef.current.active) return
    const selectedJamo = candidates[quickRef.current.selectedIndex]
    const shouldChoose = !quickRef.current.cancelled && selectedJamo !== currentJamo
    closeQuickPicker()
    if (shouldChoose) choose(replaceSyllablePart(syllable, activePart, selectedJamo))
  }
  const handleQuickPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!quickRef.current.tracking || event.pointerId !== quickRef.current.pointerId) return
    const movementX = event.clientX - quickRef.current.startX
    if (quickRef.current.active) commitQuickSelection()
    else {
      clearQuickTimer()
      closeQuickPicker()
      if (Math.abs(movementX) >= 28) choose(movementX < 0 ? items.next : items.previous)
    }
  }
  const handleQuickPointerCancel = () => closeQuickPicker()
  useEffect(() => () => clearQuickTimer(), [])

  const quickJamo = candidates[quickIndex]
  const quickSyllable = replaceSyllablePart(syllable, activePart, quickJamo)
  const quickWindow = Array.from({ length: 13 }, (_, index) => {
    const offset = index - 6
    const candidateIndex = quickIndex + offset
    return {
      offset,
      candidate: candidateIndex >= 0 && candidateIndex < candidates.length ? candidates[candidateIndex] : null,
      index: candidateIndex,
    }
  })
  return (
    <section aria-label={`${getPartLabel(activePart)} 문맥 캐러셀`} className={styles.carouselStage}>
      <div className={styles.carouselTrack}>
        <button type="button" className={`${styles.glyphCard} ${styles.sideCard}`} onClick={() => choose(items.previous)} aria-label={`이전 ${getPartLabel(activePart)} 글자 ${items.previous}`}>
          <ChevronLeft className={styles.sideArrowLeft} size={18} aria-hidden="true" />
          <StaticGlyph syllableChar={items.previous} />
        </button>
        <div
          className={`${styles.glyphCard} ${styles.activeCard} ${quickOpen ? styles.quickPickingCard : ''}`}
          aria-current="true"
          aria-label={`현재 글자 ${items.current}`}
          onPointerDown={handleQuickPointerDown}
          onPointerMove={handleQuickPointerMove}
          onPointerUp={handleQuickPointerUp}
          onPointerCancel={handleQuickPointerCancel}
          onClickCapture={(event) => {
            if (!quickRef.current.dragSeen) return
            event.preventDefault()
            event.stopPropagation()
            quickRef.current.dragSeen = false
          }}
          onContextMenu={(event) => event.preventDefault()}
        >
          {quickOpen ? <StaticGlyph syllableChar={quickSyllable} /> : children}
        </div>
        <button type="button" className={`${styles.glyphCard} ${styles.sideCard}`} onClick={() => choose(items.next)} aria-label={`다음 ${getPartLabel(activePart)} 글자 ${items.next}`}>
          <StaticGlyph syllableChar={items.next} />
          <ChevronRight className={styles.sideArrowRight} size={18} aria-hidden="true" />
        </button>
      </div>
      {QUICK_PICK_ENABLED && quickOpen && typeof document !== 'undefined' && createPortal(
        <div className={styles.quickPickerLayer} role="dialog" aria-modal="true" aria-label={`${getPartLabel(activePart)} 빠른 선택`}>
          <div className={styles.quickPickerDim} />
          <div className={`${styles.quickPickerDial} ${quickCancelled ? styles.quickPickerCancelled : ''}`}>
            <div className={styles.quickPickerRole}>{getPartLabel(activePart)}</div>
            <div className={styles.quickPickerCandidates}>
              {quickWindow.map(({ offset, candidate, index }) => (
                <span
                  key={`${offset}-${index}`}
                  className={`${styles.quickPickerCandidate} ${offset === 0 ? styles.quickPickerCandidateActive : ''} ${Math.abs(offset) === 1 ? styles.quickPickerCandidateNear : ''}`}
                  aria-current={offset === 0 ? 'true' : undefined}
                  aria-hidden={candidate === null ? 'true' : undefined}
                >
                  {candidate ?? ''}
                </span>
              ))}
            </div>
            <div className={styles.quickPickerStatus} role="status">{quickCancelled ? '선택 취소' : `${quickJamo || '받침 없음'} · ${quickSyllable}`}</div>
          </div>
        </div>,
        document.body
      )}
    </section>
  )
}

function pointLabel(index: number, length: number): string {
  if (index === 0) return '시작 꼭짓점'
  if (index === length - 1) return '끝 꼭짓점'
  return `${index + 1}번 꼭짓점`
}

function getJamoStrokes(jamo: JamoData) {
  return [...(jamo.strokes ?? []), ...(jamo.horizontalStrokes ?? []), ...(jamo.verticalStrokes ?? [])]
}

function getEndpointDistance(strokeA: StrokeDataV2, strokeB: StrokeDataV2) {
  const aEnds = [strokeA.points[0], strokeA.points[strokeA.points.length - 1]]
  const bEnds = [strokeB.points[0], strokeB.points[strokeB.points.length - 1]]
  return Math.min(...aEnds.flatMap((a) => bEnds.map((b) => Math.hypot(a.x - b.x, a.y - b.y))))
}

function updateJamoStroke(jamo: JamoData, strokeId: string, update: (stroke: StrokeDataV2) => StrokeDataV2 | null): JamoData {
  const updateCollection = (strokes?: StrokeDataV2[]) => strokes?.flatMap((stroke) => {
    if (stroke.id !== strokeId) return [stroke]
    const next = update(stroke)
    return next ? [next] : []
  })
  return {
    ...jamo,
    strokes: updateCollection(jamo.strokes),
    horizontalStrokes: updateCollection(jamo.horizontalStrokes),
    verticalStrokes: updateCollection(jamo.verticalStrokes),
  }
}

function addJamoStroke(jamo: JamoData, selectedStrokeId: string | null, stroke: StrokeDataV2): JamoData {
  if (jamo.horizontalStrokes?.some((item) => item.id === selectedStrokeId)) return { ...jamo, horizontalStrokes: [...jamo.horizontalStrokes, stroke] }
  if (jamo.verticalStrokes?.some((item) => item.id === selectedStrokeId)) return { ...jamo, verticalStrokes: [...jamo.verticalStrokes, stroke] }
  if (jamo.strokes) return { ...jamo, strokes: [...jamo.strokes, stroke] }
  if (jamo.horizontalStrokes) return { ...jamo, horizontalStrokes: [...jamo.horizontalStrokes, stroke] }
  if (jamo.verticalStrokes) return { ...jamo, verticalStrokes: [...jamo.verticalStrokes, stroke] }
  return { ...jamo, strokes: [stroke] }
}

function GlyphPreview({ syllableChar, previewJamo, activePart, schema, selection, smartGuides = [], viewportBox, highlightActivePart = true, onStrokePress, onPointPress, onHandlePress }: {
  syllableChar: string
  previewJamo?: JamoData | null
  activePart: MobileEditorPart
  schema: LayoutSchema
  selection: MobileEditorSelection
  smartGuides?: SmartGuide[]
  viewportBox?: BoxConfig
  highlightActivePart?: boolean
  onStrokePress?: (editorPart: MobileEditorPart, renderPart: Part, strokeId: string) => void
  onPointPress?: (renderPart: Part, strokeId: string, pointIndex: number) => void
  onHandlePress?: (renderPart: Part, strokeId: string, pointIndex: number, handle: 'in' | 'out') => void
}) {
  const choseong = useJamoStore((state) => state.choseong)
  const jungseong = useJamoStore((state) => state.jungseong)
  const jongseong = useJamoStore((state) => state.jongseong)
  const syllable = useMemo(() => withPreviewJamo(decomposeSyllableWithOverrides(syllableChar, choseong, jungseong, jongseong), activePart, previewJamo), [activePart, choseong, jongseong, jungseong, previewJamo, syllableChar])
  const chars = getSyllableJamoChars(syllableChar)
  const boxes = useMemo(() => calculateBoxes(schema, { cho: chars.choseong, jung: chars.jungseong, jong: chars.jongseong }), [chars.choseong, chars.jongseong, chars.jungseong, schema])
  const targets = useMemo(() => getRenderedStrokeTargets(syllable, boxes), [boxes, syllable])
  const selectedStrokeId = selection.kind === 'stroke' || selection.kind === 'point' || selection.kind === 'handle' ? selection.strokeId : null
  const selectedPart = selection.kind === 'stroke' || selection.kind === 'point' || selection.kind === 'handle' ? selection.part : null
  const selectedPoint = selection.kind === 'point' || selection.kind === 'handle' ? selection.pointIndex : null
  return (
    <SvgRenderer syllable={syllable} schema={schema} size={320} viewportBox={viewportBox} className="h-full w-full" overflow="hidden" fillColor="rgb(var(--color-foreground))">
      {smartGuides.map((guide) => <g key={`${guide.axis}-${guide.position}-${guide.label}`} pointerEvents="none" aria-hidden="true"><line x1={guide.axis === 'x' ? guide.position * 100 : 0} y1={guide.axis === 'y' ? guide.position * 100 : 0} x2={guide.axis === 'x' ? guide.position * 100 : 100} y2={guide.axis === 'y' ? guide.position * 100 : 100} stroke="rgb(var(--color-primary))" strokeWidth={0.55} /></g>)}
      {targets.map(({ editorPart, renderPart, jamo, stroke, box }) => {
        const d = pointsToSvgD(stroke.points, stroke.closed, box, 100)
        if (!d) return null
        const selected = selectedStrokeId === stroke.id && selectedPart === renderPart
        const partSelected = selection.kind === 'part' && editorPart === activePart
        const passiveActive = highlightActivePart && selection.kind === 'none' && editorPart === activePart
        return <g key={`${renderPart}-${stroke.id}`}>
          {selected && (() => {
            const xs = stroke.points.map((point) => (box.x + point.x * box.width) * 100)
            const ys = stroke.points.map((point) => (box.y + point.y * box.height) * 100)
            const minX = Math.min(...xs); const maxX = Math.max(...xs); const minY = Math.min(...ys); const maxY = Math.max(...ys)
            return <g pointerEvents="none" aria-hidden="true"><rect x={minX} y={minY} width={maxX - minX} height={maxY - minY} fill="none" stroke="rgb(var(--color-primary))" strokeWidth={0.45} strokeDasharray="1.5 1" /><circle cx={(minX + maxX) / 2} cy={(minY + maxY) / 2} r={1.1} fill="rgb(var(--color-primary))" /></g>
          })()}
          {(selected || partSelected || passiveActive) && <path d={d} fill="none" stroke="rgb(var(--color-primary))" strokeOpacity={selected ? 1 : partSelected ? 0.55 : 0.22} strokeWidth={stroke.thickness * 100} strokeLinecap={stroke.linecap ?? 'round'} strokeLinejoin={stroke.linejoin ?? 'round'} pointerEvents="none" />}
          <path className={styles.svgHitTarget} d={d} fill="none" stroke="transparent" strokeWidth={Math.max(stroke.thickness * 100 + 5, 14)} strokeLinecap="round" strokeLinejoin="round" pointerEvents={onStrokePress ? 'stroke' : 'none'} role={onStrokePress ? 'button' : undefined} tabIndex={onStrokePress ? 0 : -1} aria-pressed={onStrokePress ? selected : undefined} aria-label={onStrokePress ? `${jamo.char} ${stroke.id} 획 선택` : undefined} onClick={() => onStrokePress?.(editorPart, renderPart, stroke.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onStrokePress?.(editorPart, renderPart, stroke.id) } }} />
          {selected && stroke.points.map((point, index) => {
            const x = (box.x + point.x * box.width) * 100
            const y = (box.y + point.y * box.height) * 100
            const pointIsSelected = selectedPoint === index
            const endpoint = index === 0 || index === stroke.points.length - 1
            const handles = pointIsSelected
              ? ([['in', point.handleIn], ['out', point.handleOut]] as const).filter((item): item is readonly ['in' | 'out', NonNullable<typeof point.handleIn>] => Boolean(item[1]))
              : []
            return <g key={`${stroke.id}-point-${index}`}>
              {handles.map(([handleType, handle]) => {
                const handleX = (box.x + handle.x * box.width) * 100
                const handleY = (box.y + handle.y * box.height) * 100
                const handleSelected = selection.kind === 'handle' && selection.pointIndex === index && selection.handle === handleType
                const handleLabel = handleType === 'in' ? '들어오는 곡선 손잡이' : '나가는 곡선 손잡이'
                return <g key={`${stroke.id}-${index}-${handleType}`}>
                  <line x1={x} y1={y} x2={handleX} y2={handleY} stroke="rgb(var(--color-editor-point-selected))" strokeOpacity={0.72} strokeWidth={0.6} strokeDasharray="1.4 1.2" pointerEvents="none" />
                  <circle cx={handleX} cy={handleY} r={handleSelected ? 2.5 : 2.05} fill={handleSelected ? 'rgb(var(--color-editor-point-selected))' : 'rgb(var(--color-surface))'} stroke="rgb(var(--color-editor-point-selected))" strokeWidth={0.85} pointerEvents="none" />
                  <circle className={styles.svgHitTarget} cx={handleX} cy={handleY} r={7} fill="transparent" role="button" tabIndex={0} aria-pressed={handleSelected} aria-label={`${jamo.char} ${stroke.id} ${pointLabel(index, stroke.points.length)} ${handleLabel} 선택`} onClick={(event) => { event.stopPropagation(); onHandlePress?.(renderPart, stroke.id, index, handleType) }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onHandlePress?.(renderPart, stroke.id, index, handleType) } }} />
                </g>
              })}
              {pointIsSelected
                ? <><rect x={x - 3.15} y={y - 3.15} width={6.3} height={6.3} rx={0.8} fill="rgb(var(--color-surface))" transform={`rotate(45 ${x} ${y})`} pointerEvents="none" /><rect x={x - 2.35} y={y - 2.35} width={4.7} height={4.7} rx={0.55} fill="rgb(var(--color-editor-point-selected))" transform={`rotate(45 ${x} ${y})`} pointerEvents="none" /></>
                : <circle cx={x} cy={y} r={endpoint ? 2.15 : 1.8} fill="rgb(var(--color-surface))" stroke="rgb(var(--color-primary))" strokeWidth={endpoint ? 0.9 : 0.65} pointerEvents="none" />}
              {!pointIsSelected && (point.handleIn || point.handleOut) && <circle cx={x} cy={y} r={0.8} fill="rgb(var(--color-editor-point-selected))" pointerEvents="none" />}
              <circle className={styles.svgHitTarget} cx={x} cy={y} r={7.5} fill="transparent" role="button" tabIndex={0} aria-pressed={pointIsSelected} aria-label={`${jamo.char} ${stroke.id} ${pointLabel(index, stroke.points.length)} 선택`} onClick={(event) => { event.stopPropagation(); onPointPress?.(renderPart, stroke.id, index) }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onPointPress?.(renderPart, stroke.id, index) } }} />
            </g>
          })}
        </g>
      })}
    </SvgRenderer>
  )
}

function buildJamoHistoryEntry(args: {
  action: EditorHistoryEntry['action']
  target: Pick<ActiveEditTarget, 'syllable' | 'layoutType' | 'editorPart' | 'jamo'>
  strokeId: string
  pointIndex?: number
  delta: StrokeMoveDelta
  scale?: StrokeScale
  before: JamoData
  after: JamoData
  summary: string
  scope?: 'jamo-base' | 'syllable'
}): Omit<EditorHistoryEntry, 'id' | 'createdAt'> {
  const { target, ...rest } = args
  return { ...rest, targetKind: 'jamo', syllable: target.syllable, jamoType: target.jamo.type, jamoChar: target.jamo.char, part: target.editorPart, layoutType: target.layoutType }
}

function SelectionPath({ target }: { target: ActiveEditTarget }) {
  const phase = useMobileEditorStore((state) => state.phase)
  const strokes = getJamoStrokes(target.jamo)
  const selectedStrokeIndex = strokes.findIndex((stroke) => stroke.id === target.strokeId)
  const selectedStroke = selectedStrokeIndex >= 0 ? strokes[selectedStrokeIndex] : null
  const strokeName = selectedStrokeIndex >= 0 ? `${selectedStrokeIndex + 1}번 획` : '선택한 획'
  const pointName = (target.mode === 'point' || target.mode === 'handle') && target.pointIndex !== null
    ? pointLabel(target.pointIndex, selectedStroke?.points.length ?? 0)
    : null
  const handleName = target.mode === 'handle' ? target.handleType === 'in' ? '들어오는 곡선 손잡이' : '나가는 곡선 손잡이' : null
  const selectPartLevel = () => {
    if (phase !== 'active') useMobileEditorStore.getState().selectPart(target.renderPart)
  }
  const selectStrokeLevel = () => {
    if (phase !== 'active' && target.strokeId) useMobileEditorStore.getState().selectStroke(target.renderPart, target.strokeId)
  }

  return <div className={styles.initialSelectionRow}>
    {target.mode === 'none'
      ? <p className={styles.selectionPathEmpty}>글자 속 자소를 누르면 상세 편집으로 이동합니다</p>
      : <nav className={styles.selectionPath} aria-label="현재 선택 단계">
        {target.mode === 'part'
          ? <span className={styles.selectionPathCurrent}>{getPartLabel(target.editorPart)} {target.jamo.char} 전체</span>
          : <>
            <button type="button" className={styles.selectionPathButton} disabled={phase === 'active'} onClick={selectPartLevel}>{target.jamo.char} 전체</button>
            <ChevronRight className={styles.selectionPathSeparator} size={14} aria-hidden="true" />
            {target.mode === 'point' || target.mode === 'handle'
              ? <><button type="button" className={styles.selectionPathButton} disabled={phase === 'active'} onClick={selectStrokeLevel}>{strokeName}</button><ChevronRight className={styles.selectionPathSeparator} size={14} aria-hidden="true" />{target.mode === 'handle' ? <><button type="button" className={styles.selectionPathButton} disabled={phase === 'active'} onClick={() => target.strokeId && target.pointIndex !== null && useMobileEditorStore.getState().selectPoint(target.renderPart, target.strokeId, target.pointIndex)}>{pointName}</button><ChevronRight className={styles.selectionPathSeparator} size={14} aria-hidden="true" /><span className={styles.selectionPathCurrent}>{handleName}</span></> : <span className={styles.selectionPathCurrent}>{pointName}</span>}</>
              : <span className={styles.selectionPathCurrent}>{strokeName}</span>}
          </>}
      </nav>}
  </div>
}

function layoutContextLabel(schema: LayoutSchema): string {
  const hasFinal = schema.id.includes('jongseong')
  const shape = schema.id.includes('mixed') ? '혼합중성' : schema.id.includes('horizontal') ? '가로중성' : schema.id.includes('vertical') ? '세로중성' : '단독 자소'
  return hasFinal ? `${shape} + 받침` : shape
}

function SyllableComposition({ syllable, decomposed, activePart, schema }: { syllable: string; decomposed: DecomposedSyllable; activePart: MobileEditorPart; schema: LayoutSchema }) {
  const phase = useMobileEditorStore((state) => state.phase)
  const items: Array<{ part: MobileEditorPart; role: string; jamo: JamoData }> = []
  if (decomposed.choseong) items.push({ part: 'CH', role: '초성', jamo: decomposed.choseong })
  if (decomposed.jungseong) items.push({ part: 'JU', role: '중성', jamo: decomposed.jungseong })
  if (decomposed.jongseong) items.push({ part: 'JO', role: '종성', jamo: decomposed.jongseong })
  const chooseCarouselPart = (part: MobileEditorPart) => useMobileEditorStore.getState().setActivePart(part)

  return <section className={styles.compositionSection} aria-label={`${syllable} 구성`}>
    <div className={styles.compositionList}>
      {items.map(({ part, role, jamo }) => <button key={part} type="button" className={styles.compositionJamoCard} disabled={phase === 'active'} aria-current={activePart === part ? 'true' : undefined} aria-label={`${role} ${jamo.char} 캐러셀 기준으로 선택`} onClick={() => chooseCarouselPart(part)}>
        <strong>{jamo.char}</strong><span>{role}</span>
      </button>)}
      <button type="button" className={styles.compositionLayoutCard} disabled={phase === 'active'} aria-label="현재 글자의 레이아웃 편집 열기" onClick={() => useMobileEditorStore.getState().setScreen('layout')}>
        <Grid2X2 size={17} aria-hidden="true" /><strong>{layoutContextLabel(schema)}</strong><span>레이아웃</span>
      </button>
    </div>
  </section>
}

function LayoutContextStrip({ current, schema }: { current: string; schema: LayoutSchema }) {
  const syllables = useMemo(() => getLayoutContextSyllables(current, schema.id), [current, schema.id])
  return <section className={styles.layoutContextSection} aria-label={`${layoutContextLabel(schema)} 같은 레이아웃`}>
    <div className={styles.layoutContextHeader}><h2>같은 레이아웃</h2><span>{layoutContextLabel(schema)}</span></div>
    <div className={styles.layoutContextList} role="list">
      {syllables.map((syllable, index) => <article key={syllable} className={styles.layoutContextCard} aria-current={index === 0 ? 'true' : undefined} role="listitem" aria-label={`${syllable}${index === 0 ? ' 현재 글자' : ' 미리보기'}`}>
        <span className={styles.layoutContextPreview} aria-hidden="true"><GlyphPreview syllableChar={syllable} activePart="CH" schema={schema} selection={{ kind: 'none' }} highlightActivePart={false} /></span>
        <span className={styles.layoutContextLabel}>{index === 0 ? '현재' : syllable}</span>
      </article>)}
    </div>
  </section>
}

function LayoutPage({ syllable, schema, effectivePadding, jamo }: { syllable: string; schema: LayoutSchema; effectivePadding: Padding; jamo: JamoData }) {
  const [activeLayoutPart, setActiveLayoutPart] = useState<Part>('CH')
  const [previewGapSize, setPreviewGapSize] = useState<number | null>(null)
  const [previewSplit, setPreviewSplit] = useState<{ index: number; value: number } | null>(null)
  const [previewEdgeSchema, setPreviewEdgeSchema] = useState<LayoutSchema | null>(null)
  const [snapLabel, setSnapLabel] = useState<string | null>(null)
  const [activeEdge, setActiveEdge] = useState<'gap' | LayoutPartEdge | null>(null)
  const [gapDragging, setGapDragging] = useState(false)
  const [gapSnapActive, setGapSnapActive] = useState(false)
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const gapGestureRef = useRef({ active: false, pointerId: -1, startX: 0, startSize: 0, currentSize: 0, width: 1, fixedBefore: 0, fixedAfter: 0, snapTargets: [] as number[], snappedEdge: null as number | null })
  const splitGestureRef = useRef({ active: false, pointerId: -1, splitIndex: -1, axis: 'x' as Axis, startPosition: 0, startValue: 0, currentValue: 0, length: 1, snapTargets: [] as number[], snappedValue: null as number | null })
  const edgeGestureRef = useRef({ active: false, pointerId: -1, edge: 'top' as LayoutPartEdge, startPosition: 0, startBoundary: 0, currentDelta: 0, length: 1, startBox: { x: 0, y: 0, width: 1, height: 1 } as BoxConfig, snapTargets: [] as number[], snappedBoundary: null as number | null })
  const storedGap = getChJungVerticalGap(schema)
  const gapAnchor = activeLayoutPart === 'CH' ? 'after' : activeLayoutPart === 'JU' ? 'before' : storedGap.anchor
  const schemaWithGap = useMemo(() => {
    const anchored = setChJungVerticalGap(schema, { anchor: gapAnchor }, 0)
    return previewGapSize === null ? anchored : setChJungVerticalGap(anchored, { size: previewGapSize }, 0)
  }, [gapAnchor, previewGapSize, schema])
  const workingSchema = useMemo(() => {
    const base = previewEdgeSchema ?? schemaWithGap
    if (!previewSplit || !base.splits?.[previewSplit.index]) return base
    const next = structuredClone(base)
    next.splits![previewSplit.index].value = previewSplit.value
    return next
  }, [previewEdgeSchema, previewSplit, schemaWithGap])
  const displaySchema = useMemo(() => withEffectivePadding(workingSchema, effectivePadding), [effectivePadding, workingSchema])
  const boxes = useMemo(() => {
    const current = getSyllableJamoChars(syllable)
    return calculateBoxes(displaySchema, { cho: current.choseong, jung: current.jungseong, jong: current.jongseong })
  }, [displaySchema, syllable])
  const rawBoxes = useMemo(() => calculateRawBoxes(displaySchema), [displaySchema])
  const visibleParts = (['CH', 'JU', 'JU_H', 'JU_V', 'JO'] as Part[]).filter((part) => boxes[part])
  const supported = supportsChJungVerticalGap(schema)
  const gapEnabledForActivePart = supported && (activeLayoutPart === 'CH' || activeLayoutPart === 'JU')
  const gap = getChJungVerticalGap(workingSchema)
  const chars = getSyllableJamoChars(syllable)
  const leftLabel = chars.choseong || '초성'
  const rightLabel = chars.jungseong || '중성'
  const partLabel = (part: Part) => part === 'CH' ? leftLabel : part === 'JO' ? chars.jongseong || '종성' : part === 'JU_H' ? `${rightLabel} 가로부` : part === 'JU_V' ? `${rightLabel} 세로부` : rightLabel
  const historyPart = (part: Part): MobileEditorPart => part === 'CH' || part === 'JO' ? part : 'JU'
  const gapValueLabel = gap.size < 0 ? `${Math.round(gap.size * 100)}% · 중첩` : `간격 ${Math.round(gap.size * 100)}%`
  const latestUndoId = useEditorHistoryStore((state) => state.undoEntryIds[0])
  const latestUndoEntry = useEditorHistoryStore((state) => state.entries.find((entry) => entry.id === latestUndoId))

  const commitGap = (next: LayoutSchema, summary: string) => {
    useLayoutStore.getState().replaceLayoutSchema(schema.id, next)
    useEditorHistoryStore.getState().addEntry({ action: 'gap-change', targetKind: 'layout', syllable, jamoType: jamo.type, jamoChar: jamo.char, part: 'CH', layoutType: schema.id, strokeId: storedGap.id, delta: { x: getChJungVerticalGap(next).size - storedGap.size, y: 0 }, before: jamo, after: jamo, layoutBefore: schema, layoutAfter: next, summary })
  }
  useEffect(() => {
    const fallback = (['CH', 'JU', 'JU_H', 'JU_V', 'JO'] as Part[]).find((part) => boxes[part])
    if (!boxes[activeLayoutPart]) setActiveLayoutPart(fallback ?? 'CH')
  }, [activeLayoutPart, boxes])

  const selectLayoutPart = (part: Part) => {
    setActiveLayoutPart(part)
    setActiveEdge(null)
  }
  const vibrateSnap = () => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(10)
  }
  const beginGapGesture = (event: ReactPointerEvent<HTMLElement>) => {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    setActiveEdge('gap')
    setGapDragging(true)
    setGapSnapActive(false)
    const width = canvasRef.current?.getBoundingClientRect().width ?? event.currentTarget.getBoundingClientRect().width
    const opposite = activeLayoutPart === 'CH' ? boxes.JU : boxes.CH
    const startInsets = resolveGapInsets(gap)
    const snapTargets = [boundaryX, ...(opposite ? [opposite.x, opposite.x + opposite.width] : [])]
      .filter((target, index, values) => values.findIndex((value) => Math.abs(value - target) < 0.000001) === index)
    gapGestureRef.current = { active: true, pointerId: event.pointerId, startX: event.clientX, startSize: gap.size, currentSize: gap.size, width: Math.max(1, width), fixedBefore: startInsets.beforeInset, fixedAfter: startInsets.afterInset, snapTargets, snappedEdge: null }
  }
  const updateGapGesture = (event: ReactPointerEvent<HTMLElement>) => {
    const gesture = gapGestureRef.current
    if (!gesture.active || gesture.pointerId !== event.pointerId) return
    event.preventDefault()
    const direction = activeLayoutPart === 'CH' ? -1 : 1
    let requestedSize = gesture.startSize + ((event.clientX - gesture.startX) / gesture.width) * direction
    const currentBefore = gesture.fixedBefore
    const currentAfter = gesture.fixedAfter
    const rawMovingEdge = activeLayoutPart === 'CH'
      ? boundaryX - (requestedSize - currentAfter)
      : boundaryX + (requestedSize - currentBefore)
    if (gesture.snappedEdge !== null && Math.abs(rawMovingEdge - gesture.snappedEdge) > SMART_GUIDE_THRESHOLD * 1.8) gesture.snappedEdge = null
    if (gesture.snappedEdge === null) {
      const nearest = gesture.snapTargets.reduce<number | null>((best, target) => {
        if (Math.abs(target - rawMovingEdge) > SMART_GUIDE_THRESHOLD) return best
        return best === null || Math.abs(target - rawMovingEdge) < Math.abs(best - rawMovingEdge) ? target : best
      }, null)
      if (nearest !== null) {
        gesture.snappedEdge = nearest
        vibrateSnap()
      }
    }
    if (gesture.snappedEdge !== null) requestedSize = activeLayoutPart === 'CH' ? boundaryX - gesture.snappedEdge + currentAfter : gesture.snappedEdge - boundaryX + currentBefore
    const nextSnap = gesture.snappedEdge === null ? '' : Math.abs(gesture.snappedEdge - boundaryX) < 0.000001 ? '기준선' : `${activeLayoutPart === 'CH' ? rightLabel : leftLabel} 경계`
    setSnapLabel(nextSnap || null)
    setGapSnapActive(gesture.snappedEdge !== null)
    const next = setChJungVerticalGap(schema, { anchor: gapAnchor, size: requestedSize }, 0)
    gesture.currentSize = getChJungVerticalGap(next).size
    setPreviewGapSize(gesture.currentSize)
  }
  const finishGapGesture = (event: ReactPointerEvent<HTMLElement>, cancelled = false) => {
    const gesture = gapGestureRef.current
    if (!gesture.active || gesture.pointerId !== event.pointerId) return
    gapGestureRef.current.active = false
    const finalSize = gesture.currentSize
    setPreviewGapSize(null)
    setSnapLabel(null)
    setGapDragging(false)
    setGapSnapActive(false)
    if (cancelled || finalSize === null || Math.abs(finalSize - storedGap.size) < 0.000001) return
    const next = setChJungVerticalGap(schema, { anchor: gapAnchor, size: finalSize }, LAYOUT_SPLIT_STEP)
    commitGap(next, `${activeLayoutPart === 'CH' ? leftLabel : rightLabel} 경계 · ${getChJungVerticalGap(next).size < 0 ? '중첩' : '간격'} ${Math.round(Math.abs(getChJungVerticalGap(next).size * 100))}%`)
  }
  const beginSplitGesture = (event: ReactPointerEvent<HTMLButtonElement>, splitIndex: number, axis: Axis) => {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    const rect = canvasRef.current?.getBoundingClientRect()
    const split = schema.splits?.[splitIndex]
    if (!rect || !split) return
    const snapTargets = Object.values(boxes)
      .flatMap((box) => box ? (axis === 'x' ? [box.x, box.x + box.width] : [box.y, box.y + box.height]) : [])
      .filter((boundary, index, values) => Math.abs(boundary - split.value) > 0.02 && values.findIndex((value) => Math.abs(value - boundary) < 0.000001) === index)
    splitGestureRef.current = { active: true, pointerId: event.pointerId, splitIndex, axis, startPosition: axis === 'x' ? event.clientX : event.clientY, startValue: split.value, currentValue: split.value, length: Math.max(1, axis === 'x' ? rect.width : rect.height), snapTargets, snappedValue: null }
  }
  const updateSplitGesture = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const gesture = splitGestureRef.current
    if (!gesture.active || gesture.pointerId !== event.pointerId) return
    event.preventDefault()
    const position = gesture.axis === 'x' ? event.clientX : event.clientY
    const rawValue = Math.max(0.1, Math.min(0.9, gesture.startValue + (position - gesture.startPosition) / gesture.length))
    if (gesture.snappedValue !== null && Math.abs(rawValue - gesture.snappedValue) > SMART_GUIDE_THRESHOLD * 1.8) gesture.snappedValue = null
    if (gesture.snappedValue === null) {
      const nearest = gesture.snapTargets.reduce<number | null>((best, target) => {
        if (Math.abs(target - rawValue) > SMART_GUIDE_THRESHOLD) return best
        return best === null || Math.abs(target - rawValue) < Math.abs(best - rawValue) ? target : best
      }, null)
      if (nearest !== null) {
        gesture.snappedValue = nearest
        vibrateSnap()
      }
    }
    gesture.currentValue = gesture.snappedValue ?? rawValue
    const nextSnap = gesture.snappedValue === null ? '' : '반대편 박스 경계'
    setSnapLabel(nextSnap || null)
    setPreviewSplit({ index: gesture.splitIndex, value: gesture.currentValue })
  }
  const finishSplitGesture = (event: ReactPointerEvent<HTMLButtonElement>, cancelled = false) => {
    const gesture = splitGestureRef.current
    if (!gesture.active || gesture.pointerId !== event.pointerId) return
    gesture.active = false
    setPreviewSplit(null)
    setSnapLabel(null)
    if (cancelled || Math.abs(gesture.currentValue - gesture.startValue) < 0.000001) return
    const next = structuredClone(schema)
    if (!next.splits?.[gesture.splitIndex]) return
    const committedValue = Math.round(gesture.currentValue / LAYOUT_SPLIT_STEP) * LAYOUT_SPLIT_STEP
    next.splits[gesture.splitIndex].value = committedValue
    useLayoutStore.getState().replaceLayoutSchema(schema.id, next)
    useEditorHistoryStore.getState().addEntry({ action: 'split-change', targetKind: 'layout', syllable, jamoType: jamo.type, jamoChar: jamo.char, part: 'CH', layoutType: schema.id, strokeId: `split-${gesture.splitIndex}`, delta: gesture.axis === 'x' ? { x: committedValue - gesture.startValue, y: 0 } : { x: 0, y: committedValue - gesture.startValue }, before: jamo, after: jamo, layoutBefore: schema, layoutAfter: next, summary: `${gesture.axis === 'x' ? '세로' : '가로'} 기준선 ${Math.round(committedValue * 100)}%` })
  }
  const beginEdgeGesture = (event: ReactPointerEvent<HTMLButtonElement>, edge: LayoutPartEdge) => {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    const box = boxes[activeLayoutPart]
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!box || !rect) return
    const axis: Axis = edge === 'left' || edge === 'right' ? 'x' : 'y'
    const startBoundary = edge === 'left' ? box.x : edge === 'right' ? box.x + box.width : edge === 'top' ? box.y : box.y + box.height
    const rawBox = rawBoxes[activeLayoutPart]
    const rawBoundary = rawBox ? (edge === 'left' ? rawBox.x : edge === 'right' ? rawBox.x + rawBox.width : edge === 'top' ? rawBox.y : rawBox.y + rawBox.height) : startBoundary
    edgeGestureRef.current = { active: true, pointerId: event.pointerId, edge, startPosition: axis === 'x' ? event.clientX : event.clientY, startBoundary, currentDelta: 0, length: Math.max(1, axis === 'x' ? rect.width : rect.height), startBox: box, snapTargets: [rawBoundary, edge === 'left' || edge === 'top' ? 0 : 1], snappedBoundary: null }
    setActiveEdge(edge)
    setGapDragging(true)
    setGapSnapActive(false)
  }
  const updateEdgeGesture = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const gesture = edgeGestureRef.current
    if (!gesture.active || gesture.pointerId !== event.pointerId) return
    event.preventDefault()
    const axis: Axis = gesture.edge === 'left' || gesture.edge === 'right' ? 'x' : 'y'
    const position = axis === 'x' ? event.clientX : event.clientY
    const rawDelta = (position - gesture.startPosition) / gesture.length
    const rawBoundary = gesture.startBoundary + rawDelta
    if (gesture.snappedBoundary !== null && Math.abs(rawBoundary - gesture.snappedBoundary) > SMART_GUIDE_THRESHOLD * 1.8) gesture.snappedBoundary = null
    if (gesture.snappedBoundary === null) {
      const nearest = gesture.snapTargets.reduce<number | null>((best, target) => {
        if (Math.abs(target - rawBoundary) > SMART_GUIDE_THRESHOLD) return best
        return best === null || Math.abs(target - rawBoundary) < Math.abs(best - rawBoundary) ? target : best
      }, null)
      if (nearest !== null) {
        gesture.snappedBoundary = nearest
        vibrateSnap()
      }
    }
    const geometricDelta = (gesture.snappedBoundary ?? rawBoundary) - gesture.startBoundary
    const overrideDelta = gesture.edge === 'right' || gesture.edge === 'bottom' ? -geometricDelta : geometricDelta
    const next = resizeLayoutPartEdge(schema, activeLayoutPart, gesture.startBox, gesture.edge, overrideDelta)
    gesture.currentDelta = overrideDelta
    setPreviewEdgeSchema(next)
    setGapSnapActive(gesture.snappedBoundary !== null)
    setSnapLabel(gesture.snappedBoundary === null ? null : '기준 영역')
  }
  const finishEdgeGesture = (event: ReactPointerEvent<HTMLButtonElement>, cancelled = false) => {
    const gesture = edgeGestureRef.current
    if (!gesture.active || gesture.pointerId !== event.pointerId) return
    gesture.active = false
    const committed = resizeLayoutPartEdge(schema, activeLayoutPart, gesture.startBox, gesture.edge, gesture.currentDelta, LAYOUT_SPLIT_STEP)
    setPreviewEdgeSchema(null)
    setGapDragging(false)
    setGapSnapActive(false)
    setSnapLabel(null)
    if (cancelled || Math.abs(gesture.currentDelta) < 0.000001) return
    useLayoutStore.getState().replaceLayoutSchema(schema.id, committed)
    useEditorHistoryStore.getState().addEntry({ action: 'part-resize', targetKind: 'layout', syllable, jamoType: jamo.type, jamoChar: jamo.char, part: historyPart(activeLayoutPart), layoutType: schema.id, strokeId: `${activeLayoutPart}-${gesture.edge}`, delta: gesture.edge === 'left' || gesture.edge === 'right' ? { x: gesture.currentDelta, y: 0 } : { x: 0, y: gesture.currentDelta }, before: jamo, after: jamo, layoutBefore: schema, layoutAfter: committed, summary: `${partLabel(activeLayoutPart)} ${gesture.edge === 'top' ? '위' : gesture.edge === 'bottom' ? '아래' : gesture.edge === 'left' ? '왼쪽' : '오른쪽'} 여백` })
  }
  const undoLayout = () => {
    if (latestUndoEntry?.targetKind !== 'layout' || !latestUndoEntry.layoutBefore) return
    const entry = useEditorHistoryStore.getState().popUndoableEntry()
    if (!entry?.layoutBefore) return
    const current = structuredClone(useLayoutStore.getState().getLayoutSchema(entry.layoutType))
    useLayoutStore.getState().replaceLayoutSchema(entry.layoutType, entry.layoutBefore)
    useEditorHistoryStore.getState().addEntry({ ...entry, action: 'undo', delta: { x: 0, y: 0 }, layoutBefore: current, layoutAfter: entry.layoutBefore, summary: `되돌리기 · ${entry.summary}` }, { undoable: false })
  }
  const boundaryX = rawBoxes.CH ? rawBoxes.CH.x + rawBoxes.CH.width : 0.5
  const boundaryTop = rawBoxes.CH?.y ?? 0
  const boundaryHeight = rawBoxes.CH?.height ?? 1
  const { beforeInset, afterInset } = resolveGapInsets(gap)
  const gapLeft = boundaryX - beforeInset
  const gapRight = boundaryX + afterInset
  const handleX = activeLayoutPart === 'CH' ? gapLeft : gapRight
  const activeBox = boxes[activeLayoutPart]
  const editableEdges = (['top', 'bottom', 'left', 'right'] as LayoutPartEdge[]).filter((edge) => !(gapEnabledForActivePart && ((activeLayoutPart === 'CH' && edge === 'right') || (activeLayoutPart === 'JU' && edge === 'left'))))
  const edgeClassName = (edge: LayoutPartEdge) => `${styles.layoutBoxEdgeTarget} ${activeEdge === edge ? styles.layoutBoxEdgeActive : ''} ${activeEdge === edge && gapSnapActive ? styles.layoutBoxEdgeSnapped : ''}`
  return <div className={`${styles.shell} flex flex-col`}>
    <AppBar title={`${syllable} 레이아웃`} onBack={() => useMobileEditorStore.getState().setScreen('editor')} onHistory={() => useMobileEditorStore.getState().setScreen('history')} />
    <main className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4">
      <div className={styles.layoutScope}><strong>레이아웃 편집</strong><span>같은 구조의 모든 글자에 적용</span></div>
      <section className={styles.layoutCanvas} aria-label={`${syllable} 레이아웃 영역`}>
        <div ref={canvasRef} className={styles.layoutGeometry}>
          <GlyphPreview syllableChar={syllable} activePart="CH" schema={displaySchema} selection={{ kind: 'none' }} highlightActivePart={false} />
          <div className={styles.layoutRegionLayer} aria-hidden="true">
          {visibleParts.map((part) => {
            const box = boxes[part]!
            return <div key={part} className={styles.layoutRegion} style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.width * 100}%`, height: `${box.height * 100}%` }}><span>{getPartLabel(part === 'JU_H' || part === 'JU_V' ? 'JU' : part)}</span></div>
          })}
          </div>
          <>
            {visibleParts.map((part) => {
              const box = boxes[part]!
              return <button key={`select-${part}`} type="button" className={`${styles.layoutPartLockTarget} ${activeLayoutPart === part ? styles.layoutPartActive : ''}`} style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.width * 100}%`, height: `${box.height * 100}%` }} aria-pressed={activeLayoutPart === part} aria-label={`${partLabel(part)} 레이아웃 박스 활성`} onClick={() => selectLayoutPart(part)} />
            })}
          </>
          {supported && <>
            <div className={`${styles.layoutGapBand} ${gap.size < 0 ? styles.layoutGapOverlap : ''}`} style={{ left: `${Math.min(gapLeft, gapRight) * 100}%`, top: `${boundaryTop * 100}%`, width: `${Math.max(0.003, Math.abs(gapRight - gapLeft)) * 100}%`, height: `${boundaryHeight * 100}%` }} aria-hidden="true" />
          </>}
          {activeBox && editableEdges.map((edge) => {
            const horizontal = edge === 'top' || edge === 'bottom'
            const style = horizontal
              ? { left: `${activeBox.x * 100}%`, top: `${(edge === 'top' ? activeBox.y : activeBox.y + activeBox.height) * 100}%`, width: `${activeBox.width * 100}%` }
              : { left: `${(edge === 'left' ? activeBox.x : activeBox.x + activeBox.width) * 100}%`, top: `${activeBox.y * 100}%`, height: `${activeBox.height * 100}%` }
            const edgeName = edge === 'top' ? '위쪽' : edge === 'bottom' ? '아래쪽' : edge === 'left' ? '왼쪽' : '오른쪽'
            return <button key={edge} type="button" className={`${edgeClassName(edge)} ${horizontal ? styles.layoutBoxEdgeHorizontal : styles.layoutBoxEdgeVertical}`} style={style} aria-label={`${partLabel(activeLayoutPart)} ${edgeName} 여백 조절`} onPointerDown={(event) => beginEdgeGesture(event, edge)} onPointerMove={updateEdgeGesture} onPointerUp={finishEdgeGesture} onPointerCancel={(event) => finishEdgeGesture(event, true)} onLostPointerCapture={(event) => finishEdgeGesture(event, true)}><span aria-hidden="true" /></button>
          })}
          {gapEnabledForActivePart && <button type="button" className={`${styles.layoutGapTarget} ${styles.layoutGapTargetSelected} ${activeEdge === 'gap' ? styles.layoutGapTargetDragging : ''} ${activeEdge === 'gap' && gapSnapActive ? styles.layoutGapTargetSnapped : ''}`} style={{ left: `${handleX * 100}%`, top: `${boundaryTop * 100}%`, height: `${boundaryHeight * 100}%` }} aria-label={`${activeLayoutPart === 'CH' ? leftLabel : rightLabel} 박스 경계 갭 조절`} data-dragging={gapDragging ? 'true' : undefined} data-snapped={gapSnapActive ? 'true' : undefined} onPointerDown={beginGapGesture} onPointerMove={updateGapGesture} onPointerUp={finishGapGesture} onPointerCancel={(event) => finishGapGesture(event, true)} onLostPointerCapture={(event) => finishGapGesture(event, true)}><span aria-hidden="true" /></button>}
        </div>
        {workingSchema.splits?.map((split, index) => <button key={`${split.axis}-${index}`} type="button" className={`${styles.layoutSplitTarget} ${split.axis === 'x' ? styles.layoutSplitVertical : styles.layoutSplitHorizontal}`} style={split.axis === 'x' ? { left: `${5 + split.value * 90}%`, top: 22 } : { left: 22, top: `${5 + split.value * 90}%` }} aria-label={`${split.axis === 'x' ? '세로' : '가로'} 기준선 ${index + 1} 이동`} onPointerDown={(event) => beginSplitGesture(event, index, split.axis)} onPointerMove={updateSplitGesture} onPointerUp={finishSplitGesture} onPointerCancel={(event) => finishSplitGesture(event, true)} onLostPointerCapture={(event) => finishSplitGesture(event, true)}><span aria-hidden="true" /></button>)}
        {(previewGapSize !== null || previewSplit !== null) && <output className={styles.layoutDragStatus} aria-live="polite">{snapLabel ? `탁 · ${snapLabel}` : previewSplit ? `기준선 ${Math.round(previewSplit.value * 100)}%` : gapValueLabel}</output>}
      </section>
      <LayoutContextStrip current={syllable} schema={displaySchema} />
      <button type="button" className={styles.layoutUndoButton} onClick={undoLayout} disabled={latestUndoEntry?.targetKind !== 'layout'}><Undo2 size={18} aria-hidden="true" />되돌리기</button>
    </main>
  </div>
}

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step
}

function SyllableOverrideTrackpad({ target }: { target: ActiveEditTarget }) {
  const previewDelta = useMobileEditorStore((state) => state.previewDelta)
  const previewScale = useMobileEditorStore((state) => state.previewScale)
  const activeScaleAxes = useMobileEditorStore((state) => state.activeScaleAxes)
  const startTransform = useRef<JamoTransform>(DEFAULT_JAMO_TRANSFORM)
  const currentTransform = useRef<JamoTransform>(DEFAULT_JAMO_TRANSFORM)
  const gestureSource = useRef<JamoData>(target.jamo)

  const begin = (mode: 'move' | 'scale' = 'move') => {
    const latestJamo = getJamo(target.jamo.type, target.jamo.char) ?? target.jamo
    const transform = getSyllableTransform(latestJamo, target.syllable, target.editorPart)
    const transformedPreview = previewJamoTransform(latestJamo, transform)
    gestureSource.current = latestJamo
    startTransform.current = transform
    currentTransform.current = transform
    const editor = useMobileEditorStore.getState()
    editor.beginGesture(latestJamo, transformedPreview)
    if (mode === 'scale') {
      useMobileEditorStore.getState().updateScalePreview(transformedPreview, { x: transform.scaleX, y: transform.scaleY })
    } else {
      useMobileEditorStore.getState().updatePreview(transformedPreview, { x: transform.translateX, y: transform.translateY })
    }
  }
  const showPreview = (transform: JamoTransform, mode: 'move' | 'scale', axis?: 'x' | 'y') => {
    currentTransform.current = transform
    const preview = previewJamoTransform(gestureSource.current, transform)
    if (mode === 'scale') {
      useMobileEditorStore.getState().updateScalePreview(preview, { x: transform.scaleX, y: transform.scaleY }, { x: axis === 'x', y: axis === 'y' })
    } else {
      useMobileEditorStore.getState().updatePreview(preview, { x: transform.translateX, y: transform.translateY })
    }
  }
  const commit = (action: 'part-move' | 'part-resize') => {
    const before = useMobileEditorStore.getState().gestureStartJamo ?? target.jamo
    const previous = startTransform.current
    const next = currentTransform.current
    const changed = Math.abs(previous.translateX - next.translateX) > 0.000001
      || Math.abs(previous.translateY - next.translateY) > 0.000001
      || Math.abs(previous.scaleX - next.scaleX) > 0.000001
      || Math.abs(previous.scaleY - next.scaleY) > 0.000001
    if (!changed) {
      useMobileEditorStore.getState().finishGesture('idle')
      return
    }
    const state = useJamoStore.getState()
    const after = setSyllableTransform(before, target.syllable, target.editorPart, next, {
      choseong: state.choseong,
      jungseong: state.jungseong,
      jongseong: state.jongseong,
    })
    updateJamo(target.jamo.type, target.jamo.char, after)
    const delta = { x: next.translateX - previous.translateX, y: next.translateY - previous.translateY }
    useEditorHistoryStore.getState().addEntry(buildJamoHistoryEntry({
      action,
      target,
      strokeId: 'syllable-override',
      delta,
      scale: action === 'part-resize' ? { x: next.scaleX, y: next.scaleY } : undefined,
      before,
      after,
      scope: 'syllable',
      summary: action === 'part-resize'
        ? `${target.syllable}의 ${target.jamo.char} 비율 보정`
        : `${target.syllable}의 ${target.jamo.char} 위치 보정`,
    }))
    useMobileEditorStore.getState().finishGesture('saved')
  }

  const trackpad = useUnifiedTrackpad({
    enabled: true,
    scaleEnabled: true,
    onMoveStart: () => begin('move'),
    onMoveChange: (movement) => {
      const distance = Math.hypot(movement.x, movement.y)
      const sensitivity = 0.00035 + Math.min(distance / 180, 1) * 0.00065
      showPreview({
        ...startTransform.current,
        translateX: roundTo(startTransform.current.translateX + movement.x * sensitivity, MOVE_GRID_STEP),
        translateY: roundTo(startTransform.current.translateY + movement.y * sensitivity, MOVE_GRID_STEP),
      }, 'move')
    },
    onMoveCommit: () => commit('part-move'),
    onScaleStart: () => begin('scale'),
    onScaleChange: (scale, axis) => showPreview(applyRelativeJamoScale(startTransform.current, scale, SCALE_GRID_STEP), 'scale', axis),
    onScaleCommit: () => commit('part-resize'),
    onCancel: () => useMobileEditorStore.getState().cancelGesture(),
  })

  const handleKeyboardMove = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!event.key.startsWith('Arrow')) return
    event.preventDefault()
    begin('move')
    const step = (event.shiftKey ? 4 : 1) * MOVE_GRID_STEP
    const previous = startTransform.current
    currentTransform.current = {
      ...previous,
      translateX: previous.translateX + (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0),
      translateY: previous.translateY + (event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0),
    }
    commit('part-move')
  }

  return <section className="border-t border-border-subtle bg-surface px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3">
    <div {...trackpad.handlers} className={`${styles.trackpad} ${trackpad.visualState.mode === 'scale' ? styles.scaleActive : ''} ${trackpad.visualState.axis === 'x' ? styles.scaleAxisX : trackpad.visualState.axis === 'y' ? styles.scaleAxisY : ''} h-44 rounded-xl border border-text-dim-5`} role="group" aria-label="현재 글자의 자소 위치와 비율을 보정하는 트랙패드" tabIndex={0} onKeyDown={handleKeyboardMove}>
      <span className={styles.horizontalLane} aria-hidden="true" /><span className={styles.verticalLane} aria-hidden="true" />
      {trackpad.visualState.points.map((point, index) => <span key={index} className={styles.pinchPoint} style={{ left: point.x, top: point.y }} aria-hidden="true" />)}
      <span className="absolute left-3 top-3 z-10 rounded-md bg-surface/90 px-2 py-1 text-[11px] font-medium text-text-dim-3">현재 글자만 · 한 손가락 위치 · 두 손가락 비율</span>
      <span className="absolute bottom-3 right-3 z-10 rounded-md bg-surface/90 px-2 py-1 font-mono text-[11px] text-text-dim-3">{trackpad.visualState.mode === 'scale' ? `가로 ${Math.round(previewScale.x * 100)}%${activeScaleAxes.x ? ' ↔' : ''} · 세로 ${Math.round(previewScale.y * 100)}%${activeScaleAxes.y ? ' ↕' : ''}` : `x ${previewDelta.x.toFixed(3)} · y ${previewDelta.y.toFixed(3)}`}</span>
    </div>
  </section>
}

function SyllableOverrideSummary({ target }: { target: ActiveEditTarget }) {
  const transform = getSyllableTransform(target.jamo, target.syllable, target.editorPart)
  const hasPosition = transform.translateX !== 0 || transform.translateY !== 0
  const hasScale = transform.scaleX !== 1 || transform.scaleY !== 1
  const hasOverride = hasPosition || hasScale
  if (!hasOverride) return null
  const reset = (kind: 'position' | 'scale' | 'all') => {
    if (!hasOverride) return
    const before = getJamo(target.jamo.type, target.jamo.char) ?? target.jamo
    const current = getSyllableTransform(before, target.syllable, target.editorPart)
    const next = kind === 'position'
      ? resetJamoTransformPosition(current)
      : kind === 'scale' ? resetJamoTransformScale(current) : DEFAULT_JAMO_TRANSFORM
    const state = useJamoStore.getState()
    const after = isDefaultJamoTransform(next)
      ? resetSyllableTransform(before, target.syllable, target.editorPart)
      : setSyllableTransform(before, target.syllable, target.editorPart, next, { choseong: state.choseong, jungseong: state.jungseong, jongseong: state.jongseong })
    updateJamo(target.jamo.type, target.jamo.char, after)
    const label = kind === 'position' ? '위치' : kind === 'scale' ? '비율' : '전체 보정'
    useEditorHistoryStore.getState().addEntry(buildJamoHistoryEntry({ action: kind === 'scale' ? 'part-resize' : 'part-move', target, strokeId: 'syllable-override', delta: { x: 0, y: 0 }, before, after, scope: 'syllable', summary: `${target.syllable}의 ${target.jamo.char} ${label} 초기화` }))
  }
  return <section className={styles.overrideSummary} aria-label={`${target.syllable} 글자 보정 속성`}>
    <div><strong>현재 글자 보정</strong><span>{target.syllable}에서만 적용</span></div>
    <div className={styles.overrideValues}>
      <div><span>위치 x {transform.translateX.toFixed(3)} · y {transform.translateY.toFixed(3)}</span>{hasPosition && <button type="button" onClick={() => reset('position')}>위치 초기화</button>}</div>
      <div><span>비율 {Math.round(transform.scaleX * 100)}% × {Math.round(transform.scaleY * 100)}%</span>{hasScale && <button type="button" onClick={() => reset('scale')}>비율 초기화</button>}</div>
      <button type="button" className={styles.overrideResetAll} onClick={() => reset('all')}>모두 초기화</button>
    </div>
  </section>
}

function BaseJamoContextCards({ jamo, previewJamo, activePart }: { jamo: JamoData; previewJamo: JamoData | null; activePart: MobileEditorPart }) {
  const layoutSchemas = useLayoutStore((state) => state.layoutSchemas)
  const globalPadding = useLayoutStore((state) => state.globalPadding)
  const paddingOverrides = useLayoutStore((state) => state.paddingOverrides)
  const layouts = getLayoutsForJamoType(jamo.type, jamo.type === 'jungseong' ? classifyJungseong(jamo.char) : undefined)
  return <section className={styles.baseContextSection} aria-label={`${jamo.char} 레이아웃별 적용 미리보기`}>
    <div className={styles.baseContextCards}>
      {layouts.map((layoutType) => {
        const sample = getSampleSyllableForLayout(layoutType, jamo.type, jamo.char)
        const schema = withEffectivePadding(layoutSchemas[layoutType], { ...globalPadding, ...paddingOverrides[layoutType] })
        return <article key={layoutType} className={styles.baseContextCard} title={LAYOUT_LABELS[layoutType]}><div><GlyphPreview syllableChar={sample} previewJamo={previewJamo ?? jamo} activePart={activePart} schema={schema} selection={{ kind: 'none' }} highlightActivePart={false} /></div><span>{sample}</span></article>
      })}
    </div>
  </section>
}

function getStandaloneLayoutType(jamo: JamoData): LayoutType {
  if (jamo.type !== 'jungseong') return 'choseong-only'
  return `jungseong-${classifyJungseong(jamo.char)}-only`
}

function getJungseongViewport(boxes: Partial<Record<Part, BoxConfig>>): BoxConfig | undefined {
  if (boxes.JU) return boxes.JU
  const parts = [boxes.JU_H, boxes.JU_V].filter((box): box is BoxConfig => Boolean(box))
  if (parts.length === 0) return undefined
  const left = Math.min(...parts.map((box) => box.x))
  const top = Math.min(...parts.map((box) => box.y))
  const right = Math.max(...parts.map((box) => box.x + box.width))
  const bottom = Math.max(...parts.map((box) => box.y + box.height))
  return { x: left, y: top, width: right - left, height: bottom - top }
}

function addViewportBreathingRoom(box: BoxConfig, insetRatio = 0.18): BoxConfig {
  const horizontalInset = box.width * insetRatio
  const verticalInset = box.height * insetRatio
  return {
    x: box.x - horizontalInset,
    y: box.y - verticalInset,
    width: box.width + horizontalInset * 2,
    height: box.height + verticalInset * 2,
  }
}

function BaseJamoPage({ jamo, originalPart }: { jamo: JamoData; originalPart: MobileEditorPart }) {
  const selection = useMobileEditorStore((state) => state.selection)
  const previewJamo = useMobileEditorStore((state) => state.previewJamo)
  const smartGuides = useMobileEditorStore((state) => state.smartGuides)
  const layoutType = getStandaloneLayoutType(jamo)
  const rawSchema = useLayoutStore((state) => state.layoutSchemas[layoutType])
  const globalPadding = useLayoutStore((state) => state.globalPadding)
  const paddingOverride = useLayoutStore((state) => state.paddingOverrides[layoutType])
  const schema = useMemo(() => jamo.type === 'jungseong' ? rawSchema : withEffectivePadding(rawSchema, { ...globalPadding, ...paddingOverride }), [globalPadding, jamo.type, paddingOverride, rawSchema])
  const visualPart: MobileEditorPart = jamo.type === 'jungseong' ? 'JU' : 'CH'
  const visualJamo = useMemo(() => jamo.type === 'jongseong' ? { ...jamo, type: 'choseong' as const } : jamo, [jamo])
  const displayPreview = previewJamo ? (jamo.type === 'jongseong' ? { ...previewJamo, type: 'choseong' as const } : previewJamo) : visualJamo
  const boxes = useMemo(() => calculateBoxes(schema), [schema])
  const jamoViewport = useMemo(() => {
    const viewport = jamo.type === 'jungseong' ? getJungseongViewport(boxes) : undefined
    return viewport ? addViewportBreathingRoom(viewport) : undefined
  }, [boxes, jamo.type])
  const jamoViewportStyle = useMemo(() => {
    if (!jamoViewport) return undefined
    const ratio = jamoViewport.width / jamoViewport.height
    const longSide = 'min(72vw, 300px)'
    return ratio >= 1
      ? { width: longSide, height: `calc(${longSide} / ${ratio})` }
      : { width: `calc(${longSide} * ${ratio})`, height: longSide }
  }, [jamoViewport])
  const renderPart: Part = selection.kind === 'none' ? visualPart : selection.part
  const strokeId = selection.kind === 'stroke' || selection.kind === 'point' || selection.kind === 'handle' ? selection.strokeId : null
  const box = boxes[renderPart] ?? boxes[visualPart] ?? { x: 0, y: 0, width: 1, height: 1 }
  const target: ActiveEditTarget = { syllable: jamo.char, layoutType, editorPart: originalPart, renderPart, layoutParts: [renderPart], jamo, rawSchema, boxes, mode: selection.kind, strokeId, pointIndex: selection.kind === 'point' || selection.kind === 'handle' ? selection.pointIndex : null, handleType: selection.kind === 'handle' ? selection.handle : null, strokeContainer: box, movementBounds: getBoxBoundsInNormalizedCoordinates(box, { x: 0, y: 0, width: 1, height: 1 }), alignmentReferences: [] }
  const handleStroke = (_editorPart: MobileEditorPart, selectedPart: Part, selectedStrokeId: string) => {
    const editor = useMobileEditorStore.getState()
    if (editor.selection.kind === 'stroke' && editor.selection.strokeId === selectedStrokeId) editor.selectPart(selectedPart)
    else editor.selectStroke(selectedPart, selectedStrokeId)
  }
  const handlePoint = (selectedPart: Part, selectedStrokeId: string, pointIndex: number) => useMobileEditorStore.getState().selectPoint(selectedPart, selectedStrokeId, pointIndex)
  const handleCurveHandle = (selectedPart: Part, selectedStrokeId: string, pointIndex: number, handle: 'in' | 'out') => useMobileEditorStore.getState().selectHandle(selectedPart, selectedStrokeId, pointIndex, handle)
  const closeJamoEditor = () => {
    const editor = useMobileEditorStore.getState()
    editor.clearSelection()
    useMobileEditorStore.getState().setScreen('editor')
  }
  const role = getPartLabel(originalPart)
  return <div className={`${styles.shell} flex flex-col`}>
    <AppBar title={`${role} ${jamo.char} 편집`} onBack={closeJamoEditor} onHistory={() => useMobileEditorStore.getState().setScreen('history')} />
    <main className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pt-4">
      {selection.kind === 'none'
        ? <div className={styles.initialSelectionRow}><nav className={styles.selectionPath} aria-label="현재 선택 단계"><span className={styles.selectionPathCurrent}>{role} {jamo.char} 전체</span></nav></div>
        : <SelectionPath target={target} />}
      <BaseJamoContextCards jamo={jamo} previewJamo={previewJamo} activePart={originalPart} />
      <section className={`${styles.baseJamoCanvas} ${jamoViewport ? styles.baseJamoCanvasJungseong : ''}`} style={jamoViewportStyle} aria-label={`${jamo.char} 단독 미리보기`}>
        <GlyphPreview syllableChar={jamo.char} previewJamo={displayPreview} activePart={visualPart} schema={schema} selection={selection} smartGuides={smartGuides} viewportBox={jamoViewport} onStrokePress={handleStroke} onPointPress={handlePoint} onHandlePress={handleCurveHandle} />
      </section>
    </main>
    {selection.kind !== 'none' && <Trackpad target={target} />}
  </div>
}

function Trackpad({ target }: { target: ActiveEditTarget }) {
  const phase = useMobileEditorStore((state) => state.phase)
  const previewDelta = useMobileEditorStore((state) => state.previewDelta)
  const previewScale = useMobileEditorStore((state) => state.previewScale)
  const activeScaleAxes = useMobileEditorStore((state) => state.activeScaleAxes)
  const canUndo = useEditorHistoryStore((state) => state.undoEntryIds.length > 0)
  const enabled = target.mode !== 'none'
  const scaleEnabled = target.mode === 'stroke' && Boolean(target.strokeId)
  const [directionLockArmed, setDirectionLockArmed] = useState(false)
  const selectedStroke = target.strokeId ? getJamoStrokes(target.jamo).find((stroke) => stroke.id === target.strokeId) : undefined
  const mergeTarget = selectedStroke && !selectedStroke.closed
    ? getJamoStrokes(target.jamo)
        .filter((stroke) => stroke.id !== selectedStroke.id && !stroke.closed)
        .map((stroke) => ({ stroke, distance: getEndpointDistance(selectedStroke, stroke) }))
        .filter(({ distance }) => distance <= MERGE_PROXIMITY)
        .sort((a, b) => a.distance - b.distance)[0]?.stroke
    : undefined
  const selectedPointHasCurve = Boolean(selectedStroke && target.pointIndex !== null && pointHasHandles(selectedStroke, target.pointIndex))
  const canDisconnect = Boolean(selectedStroke && target.pointIndex !== null && (selectedStroke.closed || (target.pointIndex > 0 && target.pointIndex < selectedStroke.points.length - 1)))
  const showToolRail = target.mode === 'stroke' || target.mode === 'point' || target.mode === 'handle'
  const canDelete = target.mode === 'point' || target.mode === 'handle'
    ? Boolean(selectedStroke && selectedStroke.points.length > 2)
    : getJamoStrokes(target.jamo).length > 1

  const commitToolAction = (after: JamoData, summary: string, action: 'stroke-move' | 'point-move', strokeId: string, pointIndex?: number) => {
    const before = getJamo(target.jamo.type, target.jamo.char) ?? target.jamo
    updateJamo(target.jamo.type, target.jamo.char, after)
    useEditorHistoryStore.getState().addEntry(buildJamoHistoryEntry({ action, target: { ...target, jamo: before }, strokeId, pointIndex, delta: { x: 0, y: 0 }, before, after, summary }))
    useMobileEditorStore.getState().finishGesture('saved')
  }

  const handleAddStroke = () => {
    const before = getJamo(target.jamo.type, target.jamo.char) ?? target.jamo
    const strokeId = `stroke-${Date.now()}`
    const stroke: StrokeDataV2 = { id: strokeId, points: [{ x: 0.3, y: 0.5 }, { x: 0.7, y: 0.5 }], closed: false, thickness: selectedStroke?.thickness ?? 0.07 }
    const after = addJamoStroke(before, target.strokeId, stroke)
    commitToolAction(after, `${target.jamo.char} 선 추가`, 'stroke-move', strokeId)
    useMobileEditorStore.getState().selectStroke(target.renderPart, strokeId)
  }

  const handleToggleCurve = () => {
    if (!target.strokeId || target.pointIndex === null) return
    const before = getJamo(target.jamo.type, target.jamo.char) ?? target.jamo
    const hadCurve = selectedPointHasCurve
    const after = updateJamoStroke(before, target.strokeId, (stroke) => hadCurve ? removeHandlesFromPoint(stroke, target.pointIndex!) : addHandlesToPoint(stroke, target.pointIndex!))
    commitToolAction(after, `${target.jamo.char} 꼭짓점 ${hadCurve ? '직선화' : '곡선화'}`, 'point-move', target.strokeId, target.pointIndex)
    if (hadCurve) {
      useMobileEditorStore.getState().selectPoint(target.renderPart, target.strokeId, target.pointIndex)
    } else {
      const curvedStroke = getJamoStrokes(after).find((stroke) => stroke.id === target.strokeId)
      const curvedPoint = curvedStroke?.points[target.pointIndex]
      const handle = curvedPoint?.handleOut ? 'out' : curvedPoint?.handleIn ? 'in' : null
      if (handle) useMobileEditorStore.getState().selectHandle(target.renderPart, target.strokeId, target.pointIndex, handle)
    }
  }

  const handleConnect = () => {
    if (!selectedStroke || !mergeTarget) return
    const before = getJamo(target.jamo.type, target.jamo.char) ?? target.jamo
    const merged = mergeStrokes(selectedStroke, mergeTarget)
    if (!merged) return
    const after = updateJamoStroke(updateJamoStroke(before, selectedStroke.id, () => merged), mergeTarget.id, () => null)
    commitToolAction(after, `${target.jamo.char} 선 연결`, 'stroke-move', selectedStroke.id)
    useMobileEditorStore.getState().selectStroke(target.renderPart, selectedStroke.id)
  }

  const handleDisconnect = () => {
    if (!selectedStroke || target.pointIndex === null || !canDisconnect) return
    const before = getJamo(target.jamo.type, target.jamo.char) ?? target.jamo
    if (selectedStroke.closed) {
      const points = [...selectedStroke.points.slice(target.pointIndex), ...selectedStroke.points.slice(0, target.pointIndex)]
      const after = updateJamoStroke(before, selectedStroke.id, (stroke) => ({ ...stroke, points, closed: false }))
      commitToolAction(after, `${target.jamo.char} 닫힌 선 끊기`, 'point-move', selectedStroke.id, target.pointIndex)
      useMobileEditorStore.getState().selectPoint(target.renderPart, selectedStroke.id, 0)
      return
    }
    const halves = splitStroke(selectedStroke, target.pointIndex)
    if (!halves) return
    const [first, second] = halves
    const after = addJamoStroke(updateJamoStroke(before, selectedStroke.id, () => first), selectedStroke.id, second)
    commitToolAction(after, `${target.jamo.char} 선 끊기`, 'point-move', selectedStroke.id, target.pointIndex)
    useMobileEditorStore.getState().selectStroke(target.renderPart, second.id)
  }

  const handleDelete = () => {
    if (!target.strokeId || !canDelete) return
    const before = getJamo(target.jamo.type, target.jamo.char) ?? target.jamo
    if ((target.mode === 'point' || target.mode === 'handle') && target.pointIndex !== null) {
      const after = updateJamoStroke(before, target.strokeId, (stroke) => ({ ...stroke, points: stroke.points.filter((_, index) => index !== target.pointIndex) }))
      commitToolAction(after, `${target.jamo.char} 꼭짓점 삭제`, 'point-move', target.strokeId, target.pointIndex)
      useMobileEditorStore.getState().selectStroke(target.renderPart, target.strokeId)
      return
    }
    const after = updateJamoStroke(before, target.strokeId, () => null)
    commitToolAction(after, `${target.jamo.char} 획 삭제`, 'stroke-move', target.strokeId)
    useMobileEditorStore.getState().selectPart(target.renderPart)
  }

  const commitJamo = (before: JamoData, after: JamoData, delta: StrokeMoveDelta) => {
    if ((target.mode !== 'part' && !target.strokeId) || (Math.abs(delta.x) < 0.000001 && Math.abs(delta.y) < 0.000001)) { useMobileEditorStore.getState().finishGesture('idle'); return }
    updateJamo(target.jamo.type, target.jamo.char, after)
    const point = (target.mode === 'point' || target.mode === 'handle') && target.pointIndex !== null ? pointLabel(target.pointIndex, [ ...(after.strokes ?? []), ...(after.horizontalStrokes ?? []), ...(after.verticalStrokes ?? []) ].find((stroke) => stroke.id === target.strokeId)?.points.length ?? 0) : null
    const wholeJamo = target.mode === 'part'
    const handle = target.mode === 'handle' ? `${target.handleType === 'in' ? '들어오는' : '나가는'} 곡선 손잡이` : null
    useEditorHistoryStore.getState().addEntry(buildJamoHistoryEntry({ action: wholeJamo ? 'part-move' : target.mode === 'point' || target.mode === 'handle' ? 'point-move' : 'stroke-move', target, strokeId: wholeJamo ? 'jamo-padding' : target.strokeId ?? 'stroke', pointIndex: target.pointIndex ?? undefined, delta, before, after, summary: wholeJamo ? `${target.jamo.char} 기본형 위치 · ${formatMoveSummary(delta)}` : handle ? `${target.jamo.char} ${handle} · ${formatMoveSummary(delta)}` : point ? `${target.jamo.char} ${point} · ${formatMoveSummary(delta)}` : `${target.jamo.char} 획 · ${formatMoveSummary(delta)}` }))
    useMobileEditorStore.getState().finishGesture('saved')
  }

  const commitScale = (before: JamoData, after: JamoData, scale: StrokeScale) => {
    if (!target.strokeId || (Math.abs(scale.x - 1) < 0.000001 && Math.abs(scale.y - 1) < 0.000001)) { useMobileEditorStore.getState().finishGesture('idle'); return }
    updateJamo(target.jamo.type, target.jamo.char, after)
    useEditorHistoryStore.getState().addEntry(buildJamoHistoryEntry({ action: 'stroke-scale', target, strokeId: target.strokeId, delta: { x: 0, y: 0 }, scale, before, after, summary: `${target.jamo.char} 획 비율 · ${formatScaleSummary({ x: 1, y: 1 }, scale)}` }))
    useMobileEditorStore.getState().finishGesture('saved')
  }

  const moveJamoTarget = (source: JamoData, requested: StrokeMoveDelta, gridStep?: number) => {
    if (!target.strokeId) return moveStroke(source, '', requested, target.movementBounds, gridStep)
    if (target.mode === 'handle' && target.pointIndex !== null && target.handleType) return moveHandle(source, target.strokeId, target.pointIndex, target.handleType, requested, target.movementBounds, gridStep)
    return target.mode === 'point' && target.pointIndex !== null
      ? movePoint(source, target.strokeId, target.pointIndex, requested, target.movementBounds, gridStep)
      : moveStroke(source, target.strokeId, requested, target.movementBounds, gridStep)
  }

  const updateMovePreview = (movement: StrokeMoveDelta) => {
    const editor = useMobileEditorStore.getState()
    const distance = Math.hypot(movement.x, movement.y)
    const sensitivity = 0.00035 + Math.min(distance / 180, 1) * 0.00065
    const requested = { x: movement.x * sensitivity, y: movement.y * sensitivity }
    if (target.mode === 'part') {
      const start = editor.gestureStartJamo ?? target.jamo
      const result = moveJamoPadding(start, requested, MOVE_GRID_STEP)
      editor.updatePreview(result.jamo, result.delta)
    } else {
      const start = editor.gestureStartJamo ?? target.jamo
      const rawResult = moveJamoTarget(start, requested)
      const gridResult = moveJamoTarget(start, requested, MOVE_GRID_STEP)
      const rawBounds = target.mode === 'stroke' && target.strokeId ? getStrokeBoundsInGlyph(rawResult.jamo, target.strokeId, target.strokeContainer) : null
      const guideSnap = rawBounds ? findSmartGuideSnap(rawBounds, target.alignmentReferences, SMART_GUIDE_THRESHOLD) : { correctionX: null, correctionY: null, guides: [] }
      const smartRequested = {
        x: guideSnap.correctionX === null ? gridResult.delta.x : rawResult.delta.x + guideSnap.correctionX / target.strokeContainer.width,
        y: guideSnap.correctionY === null ? gridResult.delta.y : rawResult.delta.y + guideSnap.correctionY / target.strokeContainer.height,
      }
      const result = moveJamoTarget(start, smartRequested)
      editor.updatePreview(result.jamo, result.delta, guideSnap.guides)
    }
  }

  const trackpad = useUnifiedTrackpad({
    enabled,
    scaleEnabled,
    moveAxisLock: directionLockArmed && (target.mode === 'point' || target.mode === 'handle'),
    onMoveStart: () => useMobileEditorStore.getState().beginGesture(target.jamo),
    onMoveChange: (movement) => updateMovePreview(movement),
    onMoveCommit: () => {
      const editor = useMobileEditorStore.getState()
      if (editor.gestureStartJamo && editor.previewJamo) commitJamo(editor.gestureStartJamo, editor.previewJamo, editor.previewDelta)
    },
    onScaleStart: () => useMobileEditorStore.getState().beginGesture(target.jamo),
    onScaleChange: (requestedScale, axis) => {
      if (!target.strokeId) return
      const editor = useMobileEditorStore.getState()
      const start = editor.gestureStartJamo ?? target.jamo
      const result = scaleStroke(start, target.strokeId, requestedScale, target.movementBounds, SCALE_GRID_STEP)
      editor.updateScalePreview(result.jamo, result.scale, { x: axis === 'x', y: axis === 'y' })
    },
    onScaleCommit: () => {
      const editor = useMobileEditorStore.getState()
      const before = editor.gestureStartJamo
      const after = editor.previewJamo
      if (before && after) commitScale(before, after, editor.previewScale)
    },
    onCancel: () => useMobileEditorStore.getState().cancelGesture(),
  })

  const commitKeyboardMove = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!enabled || !event.key.startsWith('Arrow')) return
    event.preventDefault()
    const step = (event.shiftKey ? 4 : 1) * MOVE_GRID_STEP
    const delta = { x: event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0, y: event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0 }
    if (target.mode === 'part') {
      const result = moveJamoPadding(target.jamo, delta, MOVE_GRID_STEP)
      if (result.changed) commitJamo(target.jamo, result.jamo, result.delta)
    } else {
      const result = moveJamoTarget(target.jamo, delta, MOVE_GRID_STEP)
      if (result.changed) commitJamo(target.jamo, result.jamo, result.delta)
    }
  }

  const handleUndo = () => {
    if (phase === 'active') return
    const entry = useEditorHistoryStore.getState().popUndoableEntry()
    if (!entry) return
    if (entry.targetKind === 'layout' && entry.layoutBefore) {
      const current = structuredClone(useLayoutStore.getState().getLayoutSchema(entry.layoutType))
      const restored = structuredClone(entry.layoutBefore)
      useLayoutStore.getState().replaceLayoutSchema(entry.layoutType, restored)
      useEditorHistoryStore.getState().addEntry({ ...entry, action: 'undo', targetKind: 'layout', delta: { x: 0, y: 0 }, layoutBefore: current, layoutAfter: restored, summary: `실행 취소 · ${entry.summary}` }, { undoable: false })
    } else {
      const current = getJamo(entry.jamoType, entry.jamoChar)
      if (!current) return
      const restored = structuredClone(entry.before)
      updateJamo(entry.jamoType, entry.jamoChar, restored)
      useEditorHistoryStore.getState().addEntry({ ...entry, action: 'undo', targetKind: 'jamo', delta: { x: 0, y: 0 }, before: current, after: restored, summary: `실행 취소 · ${entry.summary}` }, { undoable: false })
    }
    useMobileEditorStore.getState().finishGesture('saved')
  }

  const scope = '자소 기본형'
  return (
    <section className="border-t border-border-subtle bg-surface px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3">
      <div className={`${styles.trackpadWithTools} ${showToolRail ? styles.trackpadWithToolsActive : ''}`}>
      {showToolRail && <StrokeToolRail
        onAdd={handleAddStroke}
        curveMode={target.mode === 'point' || target.mode === 'handle' ? selectedPointHasCurve ? 'line' : 'curve' : undefined}
        onToggleCurve={target.mode === 'point' || target.mode === 'handle' ? handleToggleCurve : undefined}
        onConnect={mergeTarget ? handleConnect : undefined}
        onDisconnect={canDisconnect ? handleDisconnect : undefined}
        deleteLabel={canDelete ? target.mode === 'point' || target.mode === 'handle' ? '꼭짓점 삭제' : '획 삭제' : undefined}
        onDelete={canDelete ? handleDelete : undefined}
      />}
      <div {...trackpad.handlers} className={`${styles.trackpad} ${trackpad.visualState.mode === 'scale' || directionLockArmed ? styles.scaleActive : ''} ${directionLockArmed ? styles.axisLockArmed : ''} ${trackpad.visualState.axis === 'x' ? styles.scaleAxisX : trackpad.visualState.axis === 'y' ? styles.scaleAxisY : ''} h-44 rounded-xl border ${enabled ? 'border-text-dim-5' : 'border-border-subtle opacity-60'}`} role="group" aria-label="한 손가락으로 이동하고 두 손가락으로 획 비율을 조절하는 트랙패드" aria-disabled={!enabled} tabIndex={enabled ? 0 : -1} onKeyDown={commitKeyboardMove}>
        <span className={styles.horizontalLane} aria-hidden="true" /><span className={styles.verticalLane} aria-hidden="true" />
        {trackpad.visualState.points.map((point, index) => <span key={index} className={styles.pinchPoint} style={{ left: point.x, top: point.y }} aria-hidden="true" />)}
        <span className="absolute left-3 top-3 z-10 rounded-md bg-surface/90 px-2 py-1 text-[11px] font-medium text-text-dim-3">{scope} · 한 손가락 이동{scaleEnabled ? ' · 두 손가락 비율' : ''}</span>
        <button type="button" disabled={!canUndo || phase === 'active'} className={styles.trackpadUndoButton} onPointerDown={(event) => event.stopPropagation()} onPointerUp={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); handleUndo() }} aria-label="마지막 편집 실행 취소"><Undo2 size={15} aria-hidden="true" /> 취소</button>
        {(target.mode === 'point' || target.mode === 'handle') && <button type="button" className={styles.directionLockButton} aria-pressed={directionLockArmed} aria-label={directionLockArmed ? '방향 잠금 해제' : '방향 잠금'} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); if (phase !== 'active') setDirectionLockArmed((armed) => !armed) }}><LockKeyhole size={17} aria-hidden="true" /><span>{directionLockArmed ? trackpad.visualState.axis === 'x' ? '가로' : trackpad.visualState.axis === 'y' ? '세로' : '잠금 중' : '잠금'}</span></button>}
        <span className="absolute bottom-3 right-3 z-10 rounded-md bg-surface/90 px-2 py-1 font-mono text-[11px] text-text-dim-3">{trackpad.visualState.mode === 'scale' ? `가로 ${Math.round(previewScale.x * 100)}%${activeScaleAxes.x ? ' ↔' : ''} · 세로 ${Math.round(previewScale.y * 100)}%${activeScaleAxes.y ? ' ↕' : ''}` : `x ${previewDelta.x.toFixed(3)} · y ${previewDelta.y.toFixed(3)}`}</span>
      </div>
      </div>
    </section>
  )
}

function HistoryPage() {
  const entries = useEditorHistoryStore((state) => state.entries)
  return <div className={`${styles.shell} flex flex-col`}><AppBar title="편집 히스토리" onBack={() => useMobileEditorStore.getState().setScreen('editor')} /><main className="flex-1 overflow-y-auto px-4 py-5"><p className="mb-4 text-sm text-text-dim-3">복원해도 이전 기록은 지워지지 않고 새 변경으로 남습니다.</p>{entries.length === 0 ? <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-text-dim-3">아직 저장된 변경이 없습니다.</div> : <ol className="space-y-3">{entries.map((entry) => <li key={entry.id}><button type="button" className="w-full rounded-xl border border-border bg-surface p-4 text-left shadow-sm transition-colors hover:bg-surface-hover" onClick={() => useMobileEditorStore.getState().compareHistory(entry.id)}><span className="flex items-center justify-between gap-3"><span className="text-sm font-semibold">{entry.action === 'restore' ? '과거 상태 복원' : entry.action === 'undo' ? '실행 취소' : entry.summary}</span><span className="flex shrink-0 items-center gap-1 text-xs text-text-dim-3"><Clock3 size={13} aria-hidden="true" />{formatTime(entry.createdAt)}</span></span><span className="mt-2 block text-xs text-text-dim-3">대상 {entry.syllable}의 {getPartLabel(entry.part)} {entry.jamoChar} · 범위 {entry.targetKind === 'layout' ? '현재 레이아웃' : entry.scope === 'syllable' ? `현재 글자 ${entry.syllable}` : '자소 기본형'}</span></button></li>)}</ol>}</main></div>
}

function ComparePage() {
  const historyId = useMobileEditorStore((state) => state.comparedHistoryId)
  const entry = useEditorHistoryStore((state) => state.entries.find((item) => item.id === historyId))
  const choseong = useJamoStore((state) => state.choseong)
  const jungseong = useJamoStore((state) => state.jungseong)
  const jongseong = useJamoStore((state) => state.jongseong)
  const layoutSchemas = useLayoutStore((state) => state.layoutSchemas)
  const globalPadding = useLayoutStore((state) => state.globalPadding)
  const paddingOverrides = useLayoutStore((state) => state.paddingOverrides)
  if (!entry) return <HistoryPage />
  const fallbackLayoutType = decomposeSyllable(entry.syllable, choseong, jungseong, jongseong).layoutType
  const layoutType = entry.layoutType ?? fallbackLayoutType
  const effectivePadding = { ...globalPadding, ...paddingOverrides[layoutType] }
  const currentSchema = withEffectivePadding(layoutSchemas[layoutType], effectivePadding)
  const beforeSchema = entry.targetKind === 'layout' && entry.layoutBefore ? withEffectivePadding(entry.layoutBefore, effectivePadding) : currentSchema
  const currentJamo = getJamo(entry.jamoType, entry.jamoChar) ?? entry.after
  const resolveSyllablePreview = (jamo: JamoData): JamoData => {
    const previewChoseong = entry.jamoType === 'choseong' ? { ...choseong, [entry.jamoChar]: jamo } : choseong
    const previewJungseong = entry.jamoType === 'jungseong' ? { ...jungseong, [entry.jamoChar]: jamo } : jungseong
    const previewJongseong = entry.jamoType === 'jongseong' ? { ...jongseong, [entry.jamoChar]: jamo } : jongseong
    return getActiveJamo(decomposeSyllableWithOverrides(entry.syllable, previewChoseong, previewJungseong, previewJongseong), entry.part) ?? jamo
  }
  const beforePreviewJamo = entry.scope === 'syllable' ? resolveSyllablePreview(entry.before) : entry.before
  const currentPreviewJamo = entry.scope === 'syllable' ? resolveSyllablePreview(currentJamo) : currentJamo
  const restore = () => {
    if (entry.targetKind === 'layout' && entry.layoutBefore) {
      const current = structuredClone(layoutSchemas[layoutType])
      const restored = structuredClone(entry.layoutBefore)
      useLayoutStore.getState().replaceLayoutSchema(layoutType, restored)
      useEditorHistoryStore.getState().addEntry({ ...entry, action: 'restore', targetKind: 'layout', delta: { x: 0, y: 0 }, layoutBefore: current, layoutAfter: restored, summary: `${formatTime(entry.createdAt)} 상태로 복원` })
    } else {
      const restored = structuredClone(entry.before)
      updateJamo(entry.jamoType, entry.jamoChar, restored)
      useEditorHistoryStore.getState().addEntry({ ...entry, action: 'restore', targetKind: 'jamo', delta: { x: 0, y: 0 }, before: currentJamo, after: restored, summary: `${formatTime(entry.createdAt)} 상태로 복원` })
    }
    useMobileEditorStore.getState().setScreen('editor')
  }
  return <div className={`${styles.shell} flex flex-col`}><AppBar title="변경 비교" onBack={() => useMobileEditorStore.getState().compareHistory(null)} /><main className="flex-1 overflow-y-auto px-4 py-5"><div className="grid grid-cols-2 gap-3"><section className="rounded-xl border-2 border-primary bg-primary-light/30 p-2"><p className="px-1 pb-2 text-xs font-semibold text-primary-dark">변경 전</p><div className="aspect-square rounded-lg bg-surface"><GlyphPreview syllableChar={entry.syllable} previewJamo={entry.targetKind === 'layout' ? null : beforePreviewJamo} activePart={entry.part} schema={beforeSchema} selection={{ kind: 'none' }} highlightActivePart={false} /></div></section><section className="rounded-xl border border-border bg-surface-2 p-2"><p className="px-1 pb-2 text-xs font-semibold text-text-dim-3">현재</p><div className="aspect-square rounded-lg bg-surface"><GlyphPreview syllableChar={entry.syllable} previewJamo={entry.targetKind === 'layout' ? null : currentPreviewJamo} activePart={entry.part} schema={currentSchema} selection={{ kind: 'none' }} highlightActivePart={false} /></div></section></div><div className="mt-4 rounded-xl border border-border-subtle bg-surface-2 p-4 text-sm"><p className="font-semibold">{entry.summary}</p><p className="mt-1 text-xs text-text-dim-3">{formatTime(entry.createdAt)} · {entry.syllable}의 {getPartLabel(entry.part)} {entry.jamoChar}</p></div></main><div className="border-t border-border-subtle p-4 pb-[calc(env(safe-area-inset-bottom)+16px)]"><button type="button" className="flex min-h-touch w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 font-semibold text-primary-foreground" onClick={restore}><RotateCcw size={18} aria-hidden="true" /> 변경 전으로 복원</button></div></div>
}

export function MobileEditorV2Page() {
  const [syllableTrackpadOpen, setSyllableTrackpadOpen] = useState(false)
  const activeSyllable = useMobileEditorStore((state) => state.activeSyllable)
  const activePart = useMobileEditorStore((state) => state.activePart)
  const selection = useMobileEditorStore((state) => state.selection)
  const previewJamo = useMobileEditorStore((state) => state.previewJamo)
  const previewSchema = useMobileEditorStore((state) => state.previewSchema)
  const smartGuides = useMobileEditorStore((state) => state.smartGuides)
  const screen = useMobileEditorStore((state) => state.screen)
  const choseong = useJamoStore((state) => state.choseong)
  const jungseong = useJamoStore((state) => state.jungseong)
  const jongseong = useJamoStore((state) => state.jongseong)
  const decomposed = useMemo(() => decomposeSyllable(activeSyllable, choseong, jungseong, jongseong), [activeSyllable, choseong, jongseong, jungseong])
  const layoutType = decomposed.layoutType
  const rawSchema = useLayoutStore((state) => state.layoutSchemas[layoutType])
  const globalPadding = useLayoutStore((state) => state.globalPadding)
  const paddingOverride = useLayoutStore((state) => state.paddingOverrides[layoutType])
  const effectivePadding = useMemo(() => ({ ...globalPadding, ...paddingOverride }), [globalPadding, paddingOverride])
  const confirmedSchema = useMemo(() => withEffectivePadding(rawSchema, effectivePadding), [effectivePadding, rawSchema])
  const displaySchema = useMemo(() => withEffectivePadding(previewSchema ?? rawSchema, effectivePadding), [effectivePadding, previewSchema, rawSchema])
  const chars = getSyllableJamoChars(activeSyllable)
  const confirmedBoxes = useMemo(() => calculateBoxes(confirmedSchema, { cho: chars.choseong, jung: chars.jungseong, jong: chars.jongseong }), [chars.choseong, chars.jongseong, chars.jungseong, confirmedSchema])
  const displayBoxes = useMemo(() => calculateBoxes(displaySchema, { cho: chars.choseong, jung: chars.jungseong, jong: chars.jongseong }), [chars.choseong, chars.jongseong, chars.jungseong, displaySchema])
  const displaySyllable = useMemo(() => withPreviewJamo(decomposed, activePart, previewJamo), [activePart, decomposed, previewJamo])
  const targets = useMemo(() => getRenderedStrokeTargets(displaySyllable, displayBoxes), [displayBoxes, displaySyllable])
  const activeJamo = getActiveJamo(decomposed, activePart)
  const selectedStrokeId = selection.kind === 'stroke' || selection.kind === 'point' || selection.kind === 'handle' ? selection.strokeId : null
  const selectedRenderPart = selection.kind === 'stroke' || selection.kind === 'point' || selection.kind === 'handle' ? selection.part : selection.kind === 'part' ? selection.part : activePart
  const selectedTarget = targets.find((item) => item.renderPart === selectedRenderPart && item.stroke.id === selectedStrokeId)
  const fallbackTarget = targets.find((item) => item.editorPart === activePart)
  const strokeContainer = useMemo(() => selectedTarget?.box ?? fallbackTarget?.box ?? { x: 0, y: 0, width: 1, height: 1 }, [fallbackTarget?.box, selectedTarget?.box])
  const movementBounds = useMemo(() => getBoxBoundsInNormalizedCoordinates(strokeContainer, { x: 0, y: 0, width: 1, height: 1 }), [strokeContainer])
  const alignmentReferences = useMemo(() => (['CH', 'JU', 'JO'] as MobileEditorPart[]).filter((part) => part !== activePart).map((part) => {
    const partTargets = targets.filter((item) => item.editorPart === part)
    const bounds = partTargets.map((item) => getStrokeBoundsInGlyph(item.jamo, item.stroke.id, item.box)).filter((value): value is NonNullable<typeof value> => value !== null)
    return createAlignmentReferenceFromBounds(bounds, partTargets[0]?.jamo.char ?? getPartLabel(part))
  }).filter((reference): reference is AlignmentReference => reference !== null), [activePart, targets])
  useEffect(() => setSyllableTrackpadOpen(false), [activePart, activeSyllable])
  if (screen === 'history') return <main className={styles.page}><HistoryPage /></main>
  if (screen === 'compare') return <main className={styles.page}><ComparePage /></main>
  if (!activeJamo) return null
  if (screen === 'layout') return <main className={styles.page}><LayoutPage syllable={activeSyllable} schema={rawSchema} effectivePadding={effectivePadding} jamo={activeJamo} /></main>
  if (screen === 'jamo-base') return <main className={styles.page}><BaseJamoPage jamo={activeJamo} originalPart={activePart} /></main>

  const handleStrokePress = (editorPart: MobileEditorPart) => {
    const editor = useMobileEditorStore.getState()
    editor.setActivePart(editorPart)
    useMobileEditorStore.getState().setScreen('jamo-base')
  }
  const layoutParts: Part[] = activePart === 'JU' && (confirmedBoxes.JU_H || confirmedBoxes.JU_V) ? ['JU_H', 'JU_V'] : [activePart]
  const mode: EditMode = selection.kind
  const editTarget: ActiveEditTarget = { syllable: activeSyllable, layoutType, editorPart: activePart, renderPart: selectedTarget?.renderPart ?? fallbackTarget?.renderPart ?? activePart, layoutParts, jamo: activeJamo, rawSchema, boxes: confirmedBoxes, mode, strokeId: selectedStrokeId, pointIndex: selection.kind === 'point' || selection.kind === 'handle' ? selection.pointIndex : null, handleType: selection.kind === 'handle' ? selection.handle : null, strokeContainer, movementBounds, alignmentReferences }
  const openSyllableTrackpad = () => {
    useMobileEditorStore.getState().selectPart(fallbackTarget?.renderPart ?? activePart)
    setSyllableTrackpadOpen(true)
  }
  return <main className={styles.page}><div className={`${styles.shell} flex flex-col`}>
    <AppBar title={`${activeSyllable} 편집`} onBack={() => { const route = { page: 'home' as const }; pushAppRoute(route); applyAppRoute(route) }} onHistory={() => useMobileEditorStore.getState().setScreen('history')} />
    <section className="flex min-h-0 flex-1 flex-col pt-2"><div className="mb-1 px-4"><SelectionPath target={editTarget} /></div>
      <IntegratedCarousel syllable={activeSyllable} activePart={activePart}><GlyphPreview syllableChar={activeSyllable} previewJamo={previewJamo} activePart={activePart} schema={displaySchema} selection={selection} smartGuides={smartGuides} onStrokePress={handleStrokePress} /></IntegratedCarousel>
      <SyllableComposition syllable={activeSyllable} decomposed={decomposed} activePart={activePart} schema={rawSchema} />
      {mode !== 'none' && <SyllableOverrideSummary target={editTarget} />}
      <div className="min-h-2 flex-1" aria-hidden="true" />
    </section>
    {syllableTrackpadOpen && mode !== 'none'
      ? <SyllableOverrideTrackpad target={editTarget} />
      : <section className="border-t border-border-subtle bg-surface p-4 pb-[calc(env(safe-area-inset-bottom)+16px)]">
        <button type="button" className="flex min-h-touch w-full items-center justify-center rounded-xl bg-primary px-4 font-semibold text-primary-foreground" onClick={openSyllableTrackpad}>{activeSyllable}의 {activeJamo.char} 편집</button>
      </section>}
  </div></main>
}
