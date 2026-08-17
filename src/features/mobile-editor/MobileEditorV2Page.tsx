import { useMemo, useState, type KeyboardEvent } from 'react'
import { useDrag } from '@use-gesture/react'
import { ArrowLeft, Check, Clock3, History, RotateCcw, Undo2 } from 'lucide-react'
import { SvgRenderer } from '../../renderers/SvgRenderer'
import { useJamoStore } from '../../stores/jamoStore'
import { useLayoutStore } from '../../stores/layoutStore'
import { useMobileEditorStore } from '../../stores/mobileEditorStore'
import { useEditorHistoryStore } from '../../stores/editorHistoryStore'
import { calculateBoxes } from '../../utils/layoutCalculator'
import { decomposeSyllable } from '../../utils/hangulUtils'
import { pointsToSvgD } from '../../utils/pathUtils'
import { formatMoveSummary, moveStroke } from '../../services/editorCommands'
import { createAlignmentReference, findSmartGuideSnap, getStrokeBoundsInGlyph } from '../../services/smartGuideUtils'
import { getBoxBoundsInNormalizedCoordinates } from '../../utils/containerBoxUtils'
import { applyAppRoute, pushAppRoute } from '../../utils/appRoutes'
import type { AlignmentReference, BoxConfig, EditorHistoryEntry, JamoData, LayoutSchema, Padding, SmartGuide, StrokeMoveDelta } from '../../types'
import styles from './MobileEditorV2.module.css'

const SYLLABLE = '곰'
const JAMO_CHAR = 'ㄱ'
const NORMAL_SENSITIVITY = 0.001
const PRECISE_SENSITIVITY = 0.00025
const NORMAL_GRID_STEP = 0.025
const PRECISE_GRID_STEP = 0.005
const SMART_GUIDE_THRESHOLD = 0.018

function paddedBox(box: BoxConfig, padding?: Padding): BoxConfig {
  if (!padding) return box
  return {
    x: box.x + padding.left * box.width,
    y: box.y + padding.top * box.height,
    width: box.width * (1 - padding.left - padding.right),
    height: box.height * (1 - padding.top - padding.bottom),
  }
}

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(iso))
}

function AppBar({ title, onBack, onHistory }: { title: string; onBack: () => void; onHistory?: () => void }) {
  return (
    <header className="flex h-16 items-center justify-between border-b border-border-subtle px-3 pt-safe-t">
      <button type="button" className="flex min-h-touch min-w-touch items-center justify-center rounded-lg text-text-dim-2 hover:bg-surface-hover" onClick={onBack} aria-label="뒤로">
        <ArrowLeft size={22} aria-hidden="true" />
      </button>
      <h1 className="text-base font-semibold tracking-tight">{title}</h1>
      {onHistory ? (
        <button type="button" className="flex min-h-touch min-w-touch items-center justify-center rounded-lg text-text-dim-2 hover:bg-surface-hover" onClick={onHistory} aria-label="편집 히스토리">
          <History size={21} aria-hidden="true" />
        </button>
      ) : <span className="min-w-touch" aria-hidden="true" />}
    </header>
  )
}

function GlyphPreview({ jamo, schema, selection, smartGuides = [], onStrokePress }: {
  jamo: JamoData
  schema: LayoutSchema
  selection: ReturnType<typeof useMobileEditorStore.getState>['selection']
  smartGuides?: SmartGuide[]
  onStrokePress?: (strokeId: string) => void
}) {
  const choseong = useJamoStore((state) => state.choseong)
  const jungseong = useJamoStore((state) => state.jungseong)
  const jongseong = useJamoStore((state) => state.jongseong)
  const syllable = useMemo(() => {
    const decomposed = decomposeSyllable(SYLLABLE, choseong, jungseong, jongseong)
    return { ...decomposed, choseong: jamo }
  }, [choseong, jamo, jongseong, jungseong])
  const box = useMemo(() => {
    const raw = calculateBoxes(schema, { cho: JAMO_CHAR, jung: 'ㅗ', jong: 'ㅁ' }).CH
    return raw ? paddedBox(raw, jamo.padding) : null
  }, [jamo.padding, schema])
  const selectedStrokeId = selection.kind === 'stroke' ? selection.strokeId : null

  return (
    <SvgRenderer
      syllable={syllable}
      schema={schema}
      size={320}
      className="h-full w-full"
      overflow="hidden"
      fillColor="rgb(var(--color-foreground))"
    >
      {smartGuides.map((guide) => (
        <g key={`${guide.axis}-${guide.position}-${guide.label}`} pointerEvents="none" aria-hidden="true">
          <line
            x1={guide.axis === 'x' ? guide.position * 100 : 0}
            y1={guide.axis === 'y' ? guide.position * 100 : 0}
            x2={guide.axis === 'x' ? guide.position * 100 : 100}
            y2={guide.axis === 'y' ? guide.position * 100 : 100}
            stroke="rgb(var(--color-primary))"
            strokeWidth={0.55}
          />
        </g>
      ))}
      {box && jamo.strokes?.map((stroke) => {
        const d = pointsToSvgD(stroke.points, stroke.closed, box, 100)
        if (!d) return null
        return (
          <g key={stroke.id}>
            {selectedStrokeId === stroke.id && (
              <path
                d={d}
                fill="none"
                stroke="rgb(var(--color-primary))"
                strokeWidth={stroke.thickness * 100}
                strokeLinecap={stroke.linecap ?? 'round'}
                strokeLinejoin={stroke.linejoin ?? 'round'}
                pointerEvents="none"
              />
            )}
            <path
              d={d}
              fill="none"
              stroke="transparent"
              strokeWidth={Math.max(stroke.thickness * 100 + 5, 14)}
              strokeLinecap="round"
              strokeLinejoin="round"
              pointerEvents={onStrokePress ? 'stroke' : 'none'}
              role={onStrokePress ? 'button' : undefined}
              tabIndex={onStrokePress ? 0 : -1}
              aria-pressed={onStrokePress ? selectedStrokeId === stroke.id : undefined}
              aria-label={onStrokePress ? `${JAMO_CHAR} ${stroke.id} 획 선택` : undefined}
              onClick={() => onStrokePress?.(stroke.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onStrokePress?.(stroke.id)
                }
              }}
            />
          </g>
        )
      })}
    </SvgRenderer>
  )
}

function buildHistoryEntry(args: {
  action: EditorHistoryEntry['action']
  strokeId: string
  delta: StrokeMoveDelta
  before: JamoData
  after: JamoData
  summary: string
}): Omit<EditorHistoryEntry, 'id' | 'createdAt'> {
  return {
    ...args,
    syllable: SYLLABLE,
    jamoType: 'choseong',
    jamoChar: JAMO_CHAR,
    part: 'CH',
  }
}

function Trackpad({ confirmedJamo, selectedStrokeId, movementBounds, strokeContainer, alignmentReferences }: {
  confirmedJamo: JamoData
  selectedStrokeId: string | null
  movementBounds: ReturnType<typeof getBoxBoundsInNormalizedCoordinates>
  strokeContainer: BoxConfig
  alignmentReferences: AlignmentReference[]
}) {
  const precise = useMobileEditorStore((state) => state.precise)
  const phase = useMobileEditorStore((state) => state.phase)
  const previewDelta = useMobileEditorStore((state) => state.previewDelta)
  const smartGuides = useMobileEditorStore((state) => state.smartGuides)
  const canUndo = useEditorHistoryStore((state) => state.undoEntryIds.length > 0)
  const [touchPoint, setTouchPoint] = useState({ x: 50, y: 50 })

  const commit = (before: JamoData, after: JamoData, delta: StrokeMoveDelta, strokeId: string) => {
    if (Math.abs(delta.x) < 0.000001 && Math.abs(delta.y) < 0.000001) {
      useMobileEditorStore.getState().finishGesture('idle')
      return
    }
    useJamoStore.getState().updateChoseong(JAMO_CHAR, after)
    useEditorHistoryStore.getState().addEntry(buildHistoryEntry({
      action: 'stroke-move',
      strokeId,
      delta,
      before,
      after,
      summary: `${JAMO_CHAR} 획 · ${formatMoveSummary(delta)}`,
    }))
    useMobileEditorStore.getState().finishGesture('saved')
  }

  const bind = useDrag(({ first, last, canceled, movement: [mx, my], xy: [x, y], event }) => {
    if (!selectedStrokeId) return
    event.preventDefault()
    const editor = useMobileEditorStore.getState()
    if (first) editor.beginGesture(confirmedJamo)
    if (canceled) {
      editor.cancelGesture()
      setTouchPoint({ x: 50, y: 50 })
      return
    }
    const start = useMobileEditorStore.getState().gestureStartJamo ?? confirmedJamo
    const sensitivity = precise ? PRECISE_SENSITIVITY : NORMAL_SENSITIVITY
    const gridStep = precise ? PRECISE_GRID_STEP : NORMAL_GRID_STEP
    const requested = { x: mx * sensitivity, y: my * sensitivity }
    const rawResult = moveStroke(start, selectedStrokeId, requested, movementBounds)
    const gridResult = moveStroke(start, selectedStrokeId, requested, movementBounds, gridStep)
    const rawBounds = getStrokeBoundsInGlyph(rawResult.jamo, selectedStrokeId, strokeContainer)
    const guideSnap = rawBounds
      ? findSmartGuideSnap(rawBounds, alignmentReferences, SMART_GUIDE_THRESHOLD)
      : { correctionX: null, correctionY: null, guides: [] }
    const smartRequested = {
      x: guideSnap.correctionX === null
        ? gridResult.delta.x
        : rawResult.delta.x + guideSnap.correctionX / strokeContainer.width,
      y: guideSnap.correctionY === null
        ? gridResult.delta.y
        : rawResult.delta.y + guideSnap.correctionY / strokeContainer.height,
    }
    const result = moveStroke(start, selectedStrokeId, smartRequested, movementBounds)
    editor.updatePreview(result.jamo, result.delta, guideSnap.guides)
    const target = event.currentTarget as HTMLElement
    const rect = target.getBoundingClientRect()
    setTouchPoint({
      x: Math.max(0, Math.min(100, ((x - rect.left) / rect.width) * 100)),
      y: Math.max(0, Math.min(100, ((y - rect.top) / rect.height) * 100)),
    })
    if (last) {
      commit(start, result.jamo, result.delta, selectedStrokeId)
      setTouchPoint({ x: 50, y: 50 })
    }
  }, { filterTaps: true })

  const commitKeyboardMove = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!selectedStrokeId || !event.key.startsWith('Arrow')) return
    event.preventDefault()
    const gridStep = precise ? PRECISE_GRID_STEP : NORMAL_GRID_STEP
    const step = (event.shiftKey ? 4 : 1) * gridStep
    const delta = {
      x: event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0,
      y: event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0,
    }
    const result = moveStroke(confirmedJamo, selectedStrokeId, delta, movementBounds, gridStep)
    if (result.changed) commit(confirmedJamo, result.jamo, result.delta, selectedStrokeId)
  }

  const handleUndo = () => {
    if (phase === 'active') return
    const entry = useEditorHistoryStore.getState().popUndoableEntry()
    if (!entry) return
    const current = useJamoStore.getState().getChoseong(JAMO_CHAR)
    if (!current) return
    const restored = structuredClone(entry.before)
    useJamoStore.getState().updateChoseong(JAMO_CHAR, restored)
    useEditorHistoryStore.getState().addEntry(buildHistoryEntry({
      action: 'undo',
      strokeId: entry.strokeId,
      delta: { x: 0, y: 0 },
      before: current,
      after: restored,
      summary: `실행 취소 · ${entry.summary}`,
    }), { undoable: false })
    useMobileEditorStore.getState().finishGesture('saved')
  }

  return (
    <section className="border-t border-border-subtle bg-surface px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">미세 이동 트랙패드</h2>
          <p className="mt-0.5 text-xs text-text-dim-3">{selectedStrokeId ? '손가락을 움직이고 떼면 저장돼요' : '위 글자에서 획을 먼저 선택하세요'}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!canUndo || phase === 'active'}
            className="flex min-h-touch items-center gap-1.5 rounded-full border border-text-dim-5 bg-surface px-3 text-xs font-medium text-text-dim-3 disabled:border-border-subtle disabled:text-text-dim-6"
            onClick={handleUndo}
            aria-label="마지막 편집 실행 취소"
          >
            <Undo2 size={15} aria-hidden="true" /> 취소
          </button>
          <button
            type="button"
            aria-pressed={precise}
            className={`min-h-touch rounded-full border px-4 text-xs font-medium ${precise ? 'border-primary bg-primary-light text-primary-dark' : 'border-text-dim-5 bg-surface text-text-dim-3'}`}
            onClick={() => useMobileEditorStore.getState().setPrecise(!precise)}
          >
            정밀
          </button>
        </div>
      </div>
      <div
        {...bind()}
        className={`${styles.trackpad} h-32 rounded-xl border ${selectedStrokeId ? 'border-text-dim-5' : 'border-border-subtle opacity-60'}`}
        role="group"
        aria-label="선택한 획을 상하좌우로 움직이는 트랙패드"
        aria-disabled={!selectedStrokeId}
        tabIndex={selectedStrokeId ? 0 : -1}
        onKeyDown={commitKeyboardMove}
        onPointerCancel={() => useMobileEditorStore.getState().cancelGesture()}
      >
        {phase === 'active' && (
          <span
            className="absolute z-10 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-primary shadow-md"
            style={{ left: `${touchPoint.x}%`, top: `${touchPoint.y}%` }}
            aria-hidden="true"
          />
        )}
        <span className="absolute bottom-3 left-3 z-10 rounded-md bg-surface/90 px-2 py-1 font-mono text-[11px] text-text-dim-3">
          x {previewDelta.x.toFixed(3)} · y {previewDelta.y.toFixed(3)}
        </span>
        <span className="absolute bottom-3 right-3 z-10 rounded-md bg-surface/90 px-2 py-1 text-[11px] font-medium text-text-dim-3">
          그리드 {precise ? '0.5%' : '2.5%'}
        </span>
      </div>
      <div className="mt-2 flex h-5 items-center justify-center gap-1.5 text-xs text-text-dim-3" role="status" aria-live="polite">
        {phase === 'saved'
          ? <><Check size={14} className="text-primary" aria-hidden="true" /> 저장됨</>
          : phase === 'active' && smartGuides.length > 0
            ? smartGuides.map((guide) => guide.label).join(' · ')
            : phase === 'active' ? '미리보기 중' : '변경은 자동으로 기록됩니다'}
      </div>
    </section>
  )
}

function HistoryPage() {
  const entries = useEditorHistoryStore((state) => state.entries)
  return (
    <div className={`${styles.shell} flex flex-col`}>
      <AppBar title="편집 히스토리" onBack={() => useMobileEditorStore.getState().setScreen('editor')} />
      <main className="flex-1 overflow-y-auto px-4 py-5">
        <p className="mb-4 text-sm text-text-dim-3">복원해도 이전 기록은 지워지지 않고 새 변경으로 남습니다.</p>
        {entries.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-text-dim-3">아직 저장된 변경이 없습니다.</div>
        ) : (
          <ol className="space-y-3">
            {entries.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  className="w-full rounded-xl border border-border bg-surface p-4 text-left shadow-sm transition-colors hover:bg-surface-hover"
                  onClick={() => useMobileEditorStore.getState().compareHistory(entry.id)}
                >
                  <span className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold">
                      {entry.action === 'restore' ? '과거 상태 복원' : entry.action === 'undo' ? '실행 취소' : entry.summary}
                    </span>
                    <span className="flex shrink-0 items-center gap-1 text-xs text-text-dim-3"><Clock3 size={13} aria-hidden="true" />{formatTime(entry.createdAt)}</span>
                  </span>
                  <span className="mt-2 block text-xs text-text-dim-3">대상 {entry.syllable}의 {entry.jamoChar} · 범위 자소 기본형</span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </main>
    </div>
  )
}

function ComparePage({ schema, currentJamo }: { schema: LayoutSchema; currentJamo: JamoData }) {
  const historyId = useMobileEditorStore((state) => state.comparedHistoryId)
  const entry = useEditorHistoryStore((state) => state.entries.find((item) => item.id === historyId))
  if (!entry) {
    return <HistoryPage />
  }
  const restore = () => {
    const strokeId = entry.strokeId
    const restored = structuredClone(entry.before)
    useJamoStore.getState().updateChoseong(JAMO_CHAR, restored)
    useEditorHistoryStore.getState().addEntry(buildHistoryEntry({
      action: 'restore',
      strokeId,
      delta: { x: 0, y: 0 },
      before: currentJamo,
      after: restored,
      summary: `${formatTime(entry.createdAt)} 상태로 복원`,
    }))
    useMobileEditorStore.getState().setScreen('editor')
  }
  return (
    <div className={`${styles.shell} flex flex-col`}>
      <AppBar title="변경 비교" onBack={() => useMobileEditorStore.getState().compareHistory(null)} />
      <main className="flex-1 overflow-y-auto px-4 py-5">
        <div className="grid grid-cols-2 gap-3">
          <section className="rounded-xl border-2 border-primary bg-primary-light/30 p-2">
            <p className="px-1 pb-2 text-xs font-semibold text-primary-dark">변경 전</p>
            <div className="aspect-square rounded-lg bg-surface"><GlyphPreview jamo={entry.before} schema={schema} selection={{ kind: 'none' }} /></div>
          </section>
          <section className="rounded-xl border border-border bg-surface-2 p-2">
            <p className="px-1 pb-2 text-xs font-semibold text-text-dim-3">현재</p>
            <div className="aspect-square rounded-lg bg-surface"><GlyphPreview jamo={currentJamo} schema={schema} selection={{ kind: 'none' }} /></div>
          </section>
        </div>
        <div className="mt-4 rounded-xl border border-border-subtle bg-surface-2 p-4 text-sm">
          <p className="font-semibold">{entry.summary}</p>
          <p className="mt-1 text-xs text-text-dim-3">{formatTime(entry.createdAt)} · 곰의 초성 ㄱ</p>
        </div>
      </main>
      <div className="border-t border-border-subtle p-4 pb-[calc(env(safe-area-inset-bottom)+16px)]">
        <button type="button" className="flex min-h-touch w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 font-semibold text-primary-foreground" onClick={restore}>
          <RotateCcw size={18} aria-hidden="true" /> 변경 전으로 복원
        </button>
      </div>
    </div>
  )
}

export function MobileEditorV2Page() {
  const confirmedJamo = useJamoStore((state) => state.choseong[JAMO_CHAR])
  const selection = useMobileEditorStore((state) => state.selection)
  const previewJamo = useMobileEditorStore((state) => state.previewJamo)
  const smartGuides = useMobileEditorStore((state) => state.smartGuides)
  const screen = useMobileEditorStore((state) => state.screen)
  const layoutType = 'choseong-jungseong-horizontal-jongseong' as const
  const rawSchema = useLayoutStore((state) => state.layoutSchemas[layoutType])
  const globalPadding = useLayoutStore((state) => state.globalPadding)
  const paddingOverride = useLayoutStore((state) => state.paddingOverrides[layoutType])
  const schema = useMemo(() => ({ ...rawSchema, padding: { ...globalPadding, ...paddingOverride } }), [globalPadding, paddingOverride, rawSchema])
  const jungseongJamo = useJamoStore((state) => state.jungseong['ㅗ'])
  const jongseongJamo = useJamoStore((state) => state.jongseong['ㅁ'])
  const boxes = useMemo(() => calculateBoxes(schema, { cho: JAMO_CHAR, jung: 'ㅗ', jong: 'ㅁ' }), [schema])
  const strokeContainer = useMemo(() => {
    const rawBox = boxes.CH
    return rawBox ? paddedBox(rawBox, confirmedJamo?.padding) : { x: 0, y: 0, width: 1, height: 1 }
  }, [boxes.CH, confirmedJamo?.padding])
  const movementBounds = useMemo(
    () => getBoxBoundsInNormalizedCoordinates(strokeContainer, { x: 0, y: 0, width: 1, height: 1 }),
    [strokeContainer]
  )
  const alignmentReferences = useMemo(() => {
    const references = [
      createAlignmentReference(jungseongJamo, boxes.JU ? paddedBox(boxes.JU, jungseongJamo?.padding) : undefined, 'ㅗ'),
      createAlignmentReference(jongseongJamo, boxes.JO ? paddedBox(boxes.JO, jongseongJamo?.padding) : undefined, 'ㅁ'),
    ]
    return references.filter((reference): reference is AlignmentReference => reference !== null)
  }, [boxes.JO, boxes.JU, jongseongJamo, jungseongJamo])

  if (!confirmedJamo) return null
  if (screen === 'history') return <main className={styles.page}><HistoryPage /></main>
  if (screen === 'compare') return <main className={styles.page}><ComparePage schema={schema} currentJamo={confirmedJamo} /></main>

  const handleStrokePress = (strokeId: string) => {
    useMobileEditorStore.getState().selectStroke(strokeId)
  }
  const selectedStrokeId = selection.kind === 'stroke' ? selection.strokeId : null
  const hint = selection.kind === 'stroke'
    ? '아래 트랙패드에서 획을 움직이세요'
    : '움직일 획을 한 번 탭하세요'

  return (
    <main className={styles.page}>
      <div className={`${styles.shell} flex flex-col`}>
        <AppBar
          title="곰 편집"
          onBack={() => {
            const route = { page: 'home' as const }
            pushAppRoute(route)
            applyAppRoute(route)
          }}
          onHistory={() => useMobileEditorStore.getState().setScreen('history')}
        />
        <section className="flex min-h-0 flex-1 flex-col px-4 pt-3">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-primary">자소 편집 · 초성</p>
              <p className="mt-1 text-sm text-text-dim-3" role="status">{hint}</p>
            </div>
            <span className="rounded-full bg-surface-3 px-3 py-1.5 text-xs font-medium text-text-dim-3">곰 · ㄱ</span>
          </div>
          <div className={`${styles.canvasGrid} ${styles.glyphCanvas} mx-auto aspect-square overflow-hidden rounded-xl border border-border bg-surface-2`}>
            <GlyphPreview jamo={previewJamo ?? confirmedJamo} schema={schema} selection={selection} smartGuides={smartGuides} onStrokePress={handleStrokePress} />
          </div>
          <div className="flex flex-1 items-center justify-center py-2 text-center text-xs text-text-dim-3">
            {selectedStrokeId ? `선택된 획 ${selectedStrokeId}` : '선택 없음'}
          </div>
        </section>
        <Trackpad
          confirmedJamo={confirmedJamo}
          selectedStrokeId={selectedStrokeId}
          movementBounds={movementBounds}
          strokeContainer={strokeContainer}
          alignmentReferences={alignmentReferences}
        />
      </div>
    </main>
  )
}
