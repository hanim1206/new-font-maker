import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { Check, Copy, Dices, Download, LoaderCircle, Redo2, Settings2, TextCursorInput, Undo2, X } from 'lucide-react'
import { SvgRenderer } from '../src/renderers/SvgRenderer'
import { useJamoStore } from '../src/stores/jamoStore'
import { useLayoutStore } from '../src/stores/layoutStore'
import { moveHandle, movePoint, moveStroke, scaleStroke } from '../src/services/editorCommands'
import { scaleLayoutParts, translateLayoutParts } from '../src/services/layoutProfileCommands'
import { getRenderedStrokeTargets } from '../src/services/mobileEditorContext'
import { useUnifiedTrackpad } from '../src/features/mobile-editor/useUnifiedTrackpad'
import { calculateBoxes } from '../src/utils/layoutCalculator'
import { decomposeSyllable } from '../src/utils/hangulUtils'
import { pointsToSvgD } from '../src/utils/pathUtils'
import { addHandlesToPoint, mergeStrokes, pointHasHandles, removeHandlesFromPoint, splitStroke } from '../src/utils/strokeEditUtils'
import { MERGE_PROXIMITY } from '../src/utils/snapUtils'
import type {
  BoxConfig,
  DecomposedSyllable,
  JamoData,
  LayoutSchema,
  LayoutType,
  MobileEditorPart,
  Padding,
  Part,
  StrokeMoveDelta,
  StrokeScale,
  StrokeDataV2,
} from '../src/types'
import legacyTrackpadStyles from '../src/features/mobile-editor/MobileEditorV2.module.css'
import styles from './CalibrationSentenceEditor.module.css'
import {
  advanceForCharacter,
  fontUnitsToNormalized,
  useCalibrationProjectStore,
  type GlyphComponentIdentity,
  type RawGlyphEdit,
  type SampleGlyphEdit,
} from './calibrationProjectStore'
import { createSampleGlyphEdit } from './editInference'
import { createCalibrationAnalysisSnapshot } from './calibrationAnalysisSnapshot'
import { StrokeToolRail } from '../src/features/mobile-editor/StrokeToolRail'
import { CALIBRATION_FREEFORM_BOUNDS } from './calibrationEditPolicy'
import { findMaximumSafeEditFactor } from './inkGapGuard'
import {
  findJamoInkGapViolation,
  findLayoutInkGapViolation,
  type CalibrationInkGapContext,
  type CalibrationInkGapViolation,
} from './calibrationInkGap'
import { resolveSyllableContextualInkSafety, withContextualInkSafety } from '../src/utils/contextualInkSafety'
import { centeredDesignBodyPadding, paddingToDesignBody } from './designBody'
import { generateAndDownloadFont } from '../src/services/fontGenerator'

const SAMPLE_SENTENCES = [
  '별을 노래하는 마음으로',
  '오늘 밤에도 별이 바람에 스치운다',
  '모든 죽어가는 것을 사랑해야지',
  '나 보기가 역겨워',
  '말없이 고이 보내드리오리다',
  '사뿐히 즈려밟고 가시옵소서',
  '임은 갔습니다',
  '나는 임을 보내지 아니하였습니다',
  '그곳이 차마 꿈엔들 잊힐리야',
  '하늘을 우러러 한 점 부끄럼 없기를',
] as const
const VIEW_BOX_SIZE = 100

const LAYOUT_LABELS: Record<LayoutType, string> = {
  'choseong-only': '초성 단독',
  'jungseong-vertical-only': '세로중성 단독',
  'jungseong-horizontal-only': '가로중성 단독',
  'jungseong-mixed-only': '혼합중성 단독',
  'choseong-jungseong-vertical': '초성·세로중성',
  'choseong-jungseong-horizontal': '초성·가로중성',
  'choseong-jungseong-mixed': '초성·혼합중성',
  'choseong-jungseong-vertical-jongseong': '초성·세로중성·종성',
  'choseong-jungseong-horizontal-jongseong': '초성·가로중성·종성',
  'choseong-jungseong-mixed-jongseong': '초성·혼합중성·종성',
}

type Selection =
  | { kind: 'none' }
  | { kind: 'component'; component: GlyphComponentIdentity; editorPart: MobileEditorPart; renderParts: Part[]; jamo: JamoData }
  | { kind: 'stroke'; component: GlyphComponentIdentity; editorPart: MobileEditorPart; renderPart: Part; jamo: JamoData; strokeId: string; box: BoxConfig }
  | { kind: 'point'; component: GlyphComponentIdentity; editorPart: MobileEditorPart; renderPart: Part; jamo: JamoData; strokeId: string; pointIndex: number; box: BoxConfig }
  | { kind: 'handle'; component: GlyphComponentIdentity; editorPart: MobileEditorPart; renderPart: Part; jamo: JamoData; strokeId: string; pointIndex: number; handle: 'in' | 'out'; box: BoxConfig }

type PreviewJamo = { type: JamoData['type']; char: string; data: JamoData; baseline?: JamoData }
type PreviewSchema = { layoutType: LayoutType; schema: LayoutSchema }
type SelectedPoint = { strokeId: string; pointIndex: number }
type HistoryEntry =
  | { kind: 'layout'; layoutType: LayoutType; before: LayoutSchema; after: LayoutSchema; edit: SampleGlyphEdit }
  | { kind: 'jamo'; jamoType: JamoData['type']; char: string; before: JamoData; after: JamoData; edit: SampleGlyphEdit }

function isEditableHangul(char: string): boolean {
  const code = char.codePointAt(0) ?? 0
  const isPrecomposedSyllable = code >= 0xac00 && code <= 0xd7a3
  const isCompatibilityJamo = code >= 0x3131 && code <= 0x3163
  return isPrecomposedSyllable || isCompatibilityJamo
}

function tokenizeSentenceLine(line: string): Array<{ text: string; start: number; whitespace: boolean }> {
  const tokens: Array<{ text: string; start: number; whitespace: boolean }> = []
  for (const char of [...line]) {
    const whitespace = /\s/u.test(char)
    const previous = tokens.at(-1)
    if (previous && previous.whitespace === whitespace) previous.text += char
    else tokens.push({ text: char, start: tokens.reduce((length, token) => length + [...token.text].length, 0), whitespace })
  }
  return tokens
}

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text)
    return
  }
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  const copied = document.execCommand('copy')
  textarea.remove()
  if (!copied) throw new Error('clipboard copy failed')
}

function withPreviewJamo(syllable: DecomposedSyllable, preview: PreviewJamo | null): DecomposedSyllable {
  if (!preview) return syllable
  if (preview.type === 'choseong' && syllable.choseong?.char === preview.char) return { ...syllable, choseong: preview.data }
  if (preview.type === 'jungseong' && syllable.jungseong?.char === preview.char) return { ...syllable, jungseong: preview.data }
  if (preview.type === 'jongseong' && syllable.jongseong?.char === preview.char) return { ...syllable, jongseong: preview.data }
  return syllable
}

function updateJamo(jamo: JamoData): void {
  const store = useJamoStore.getState()
  if (jamo.type === 'choseong') store.updateChoseong(jamo.char, jamo)
  else if (jamo.type === 'jungseong') store.updateJungseong(jamo.char, jamo)
  else store.updateJongseong(jamo.char, jamo)
}

function getJamo(type: JamoData['type'], char: string): JamoData | undefined {
  const store = useJamoStore.getState()
  if (type === 'choseong') return store.choseong[char]
  if (type === 'jungseong') return store.jungseong[char]
  return store.jongseong[char]
}

function getJamoStrokes(jamo: JamoData): StrokeDataV2[] {
  return [...(jamo.strokes ?? []), ...(jamo.horizontalStrokes ?? []), ...(jamo.verticalStrokes ?? [])]
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

function addJamoStroke(jamo: JamoData, selectedStrokeId: string, stroke: StrokeDataV2): JamoData {
  if (jamo.horizontalStrokes?.some((item) => item.id === selectedStrokeId)) return { ...jamo, horizontalStrokes: [...jamo.horizontalStrokes, stroke] }
  if (jamo.verticalStrokes?.some((item) => item.id === selectedStrokeId)) return { ...jamo, verticalStrokes: [...jamo.verticalStrokes, stroke] }
  if (jamo.strokes) return { ...jamo, strokes: [...jamo.strokes, stroke] }
  if (jamo.horizontalStrokes) return { ...jamo, horizontalStrokes: [...jamo.horizontalStrokes, stroke] }
  if (jamo.verticalStrokes) return { ...jamo, verticalStrokes: [...jamo.verticalStrokes, stroke] }
  return { ...jamo, strokes: [stroke] }
}

function endpointDistance(strokeA: StrokeDataV2, strokeB: StrokeDataV2): number {
  const aEnds = [strokeA.points[0], strokeA.points.at(-1)!]
  const bEnds = [strokeB.points[0], strokeB.points.at(-1)!]
  return Math.min(...aEnds.flatMap((a) => bEnds.map((b) => Math.hypot(a.x - b.x, a.y - b.y))))
}

function componentFor(glyph: string, part: MobileEditorPart, jamo: JamoData): GlyphComponentIdentity {
  const role = part === 'CH' ? 'initial' : part === 'JU' ? 'medial' : 'final'
  return { id: `${glyph}:${role}:${jamo.char}`, role, jamoId: jamo.char }
}

function withLayoutProfile(
  schema: LayoutSchema,
  overrides: LayoutSchema['userPartOverrides'] | undefined,
): LayoutSchema {
  return { ...schema, userPartOverrides: overrides ?? schema.userPartOverrides }
}

function absolutePoint(point: { x: number; y: number }, box: BoxConfig): { x: number; y: number } {
  return {
    x: (box.x + point.x * box.width) * VIEW_BOX_SIZE,
    y: (box.y + point.y * box.height) * VIEW_BOX_SIZE,
  }
}

function roleRenderParts(part: MobileEditorPart, boxes: Partial<Record<Part, BoxConfig>>): Part[] {
  if (part === 'JU' && (boxes.JU_H || boxes.JU_V)) {
    const mixedParts: Part[] = ['JU_H', 'JU_V']
    return mixedParts.filter((item) => boxes[item])
  }
  return [part]
}

function layoutAreaLabel(part: MobileEditorPart): string {
  if (part === 'CH') return '초성'
  if (part === 'JU') return '중성'
  return '종성'
}

function LayoutAreaBoxes({
  boxes,
  parts,
  emphasis,
}: {
  boxes: Partial<Record<Part, BoxConfig>>
  parts: Part[]
  emphasis: 'focused' | 'source' | 'affected'
}) {
  return <g aria-hidden="true" pointerEvents="none">
    {parts.map((part) => {
      const box = boxes[part]
      if (!box) return null
      return <rect
        key={`layout-area-${part}`}
        data-layout-area={part}
        data-layout-emphasis={emphasis}
        x={box.x * VIEW_BOX_SIZE}
        y={box.y * VIEW_BOX_SIZE}
        width={box.width * VIEW_BOX_SIZE}
        height={box.height * VIEW_BOX_SIZE}
        rx={1.5}
        className={`${styles.layoutAreaBox} ${emphasis === 'focused' ? styles.layoutAreaBoxFocused : emphasis === 'source' ? styles.layoutAreaBoxSource : styles.layoutAreaBoxAffected}`}
      />
    })}
  </g>
}

function Glyph({
  char,
  size,
  maps,
  schemas,
  globalPadding,
  paddingOverrides,
  previewJamo,
  previewSchema,
  layoutProfile,
  layoutHighlight,
}: {
  char: string
  size: number
  maps: { choseong: Record<string, JamoData>; jungseong: Record<string, JamoData>; jongseong: Record<string, JamoData> }
  schemas: Record<LayoutType, LayoutSchema>
  globalPadding: Padding
  paddingOverrides: Partial<Record<LayoutType, Partial<Padding>>>
  previewJamo: PreviewJamo | null
  previewSchema: PreviewSchema | null
  layoutProfile: Partial<Record<LayoutType, LayoutSchema['userPartOverrides']>>
  layoutHighlight: { layoutType: LayoutType; parts: Part[]; source: boolean } | null
}) {
  const decomposed = withPreviewJamo(decomposeSyllable(char, maps.choseong, maps.jungseong, maps.jongseong), previewJamo)
  const schema = previewSchema?.layoutType === decomposed.layoutType
    ? previewSchema.schema
    : withLayoutProfile(schemas[decomposed.layoutType], layoutProfile[decomposed.layoutType])
  const effectivePadding = { ...globalPadding, ...paddingOverrides[decomposed.layoutType] }
  const effectiveSchema = { ...schema, padding: effectivePadding, designBodyPadding: effectivePadding }
  const viewportBox = {
    x: effectiveSchema.padding.left,
    y: 0,
    width: 1 - effectiveSchema.padding.left - effectiveSchema.padding.right,
    height: 1,
  }
  const boxes = layoutHighlight?.layoutType === decomposed.layoutType
    ? calculateBoxes(effectiveSchema, {
      cho: decomposed.choseong?.char ?? '',
      jung: decomposed.jungseong?.char ?? '',
      jong: decomposed.jongseong?.char ?? '',
    })
    : null
  return <SvgRenderer syllable={decomposed} schema={effectiveSchema} viewportBox={viewportBox} size={size} overflow="visible" clipGlyphs={false}>
    {boxes && layoutHighlight && <LayoutAreaBoxes boxes={boxes} parts={layoutHighlight.parts} emphasis={layoutHighlight.source ? 'source' : 'affected'} />}
  </SvgRenderer>
}

function FocusedGlyph({
  char,
  syllable,
  schema,
  selection,
  selectedPoints,
  onSelect,
  onPointSelect,
  fontSpace,
  grid,
  designBody,
}: {
  char: string
  syllable: DecomposedSyllable
  schema: LayoutSchema
  selection: Selection
  onSelect: (selection: Selection) => void
  selectedPoints: SelectedPoint[]
  onPointSelect: (selection: Extract<Selection, { kind: 'point' }>) => void
  fontSpace: { unitsPerEm: number }
  grid: { majorDivisions: number; minorInterval: number }
  designBody: { x: number; y: number; width: number; height: number }
}) {
  const boxes = useMemo(() => calculateBoxes(schema, {
    cho: syllable.choseong?.char ?? '',
    jung: syllable.jungseong?.char ?? '',
    jong: syllable.jongseong?.char ?? '',
  }), [schema, syllable])
  const targets = useMemo(() => getRenderedStrokeTargets(syllable, boxes), [boxes, syllable])
  const selectedPart = selection.kind === 'none' ? null : selection.editorPart
  const selectedStrokeId = selection.kind === 'stroke' || selection.kind === 'point' || selection.kind === 'handle'
    ? selection.strokeId
    : null
  const partStyles = selectedPart ? {
    CH: { opacity: selectedPart === 'CH' ? 1 : .28 },
    JU: { opacity: selectedPart === 'JU' ? 1 : .28 },
    JU_H: { opacity: selectedPart === 'JU' ? 1 : .28 },
    JU_V: { opacity: selectedPart === 'JU' ? 1 : .28 },
    JO: { opacity: selectedPart === 'JO' ? 1 : .28 },
  } : undefined
  const canvasStyle = {
    '--major-grid-size': `${100 / grid.majorDivisions}%`,
    '--minor-grid-size': `${grid.minorInterval / fontSpace.unitsPerEm * 100}%`,
    '--design-body-left': `${designBody.x / fontSpace.unitsPerEm * 100}%`,
    '--design-body-top': `${designBody.y / fontSpace.unitsPerEm * 100}%`,
    '--design-body-width': `${designBody.width / fontSpace.unitsPerEm * 100}%`,
    '--design-body-height': `${designBody.height / fontSpace.unitsPerEm * 100}%`,
  } as CSSProperties

  return (
    <div className={styles.focusCanvas} style={canvasStyle} onPointerDown={() => onSelect({ kind: 'none' })}>
      <span className={styles.designBody} aria-hidden="true" />
      <SvgRenderer syllable={syllable} schema={schema} size={340} className={styles.focusSvg} partStyles={partStyles}>
        {selection.kind === 'component' && <LayoutAreaBoxes boxes={boxes} parts={selection.renderParts} emphasis="focused" />}
        {targets.map((target) => {
          const path = pointsToSvgD(target.stroke.points, target.stroke.closed, target.box, VIEW_BOX_SIZE)
          const component = componentFor(char, target.editorPart, target.jamo)
          const sameComponent = selectedPart === target.editorPart
          return <path
            key={`hit-${target.renderPart}-${target.stroke.id}`}
            d={path}
            fill="none"
            stroke={selectedStrokeId === target.stroke.id ? 'rgb(var(--color-primary) / .3)' : 'transparent'}
            strokeWidth={Math.max(12, target.stroke.thickness * VIEW_BOX_SIZE + 8)}
            pointerEvents="stroke"
            onPointerDown={(event) => {
              event.stopPropagation()
              if (sameComponent) {
                onSelect({ kind: 'stroke', component, editorPart: target.editorPart, renderPart: target.renderPart, jamo: target.jamo, strokeId: target.stroke.id, box: target.box })
              } else {
                onSelect({ kind: 'component', component, editorPart: target.editorPart, renderParts: roleRenderParts(target.editorPart, boxes), jamo: target.jamo })
              }
            }}
          />
        })}
        {selectedPart && selection.kind !== 'component' && targets.filter((target) => target.editorPart === selectedPart).flatMap((target) => target.stroke.points.map((point, pointIndex) => {
          const { x, y } = absolutePoint(point, target.box)
          const active = selectedPoints.some((point) => point.strokeId === target.stroke.id && point.pointIndex === pointIndex)
            || ((selection.kind === 'point' || selection.kind === 'handle') && selection.strokeId === target.stroke.id && selection.pointIndex === pointIndex)
          const component = componentFor(char, target.editorPart, target.jamo)
          const selectPoint = (event: ReactPointerEvent<SVGCircleElement>) => {
              event.stopPropagation()
              onPointSelect({ kind: 'point', component, editorPart: target.editorPart, renderPart: target.renderPart, jamo: target.jamo, strokeId: target.stroke.id, pointIndex, box: target.box })
          }
          return <g key={`point-${target.renderPart}-${target.stroke.id}-${pointIndex}`}>
            <circle cx={x} cy={y} r={7.5} fill="transparent" pointerEvents="all" className={styles.pointHitTarget} onPointerDown={selectPoint} />
            <circle cx={x} cy={y} r={active ? 2.8 : 2.1} className={active ? styles.activePoint : styles.point} pointerEvents="none" />
          </g>
        }))}
        {(selection.kind === 'point' || selection.kind === 'handle') && targets.filter((target) => target.stroke.id === selection.strokeId).flatMap((target) => {
          const point = target.stroke.points[selection.pointIndex]
          if (!point) return []
          const anchor = absolutePoint(point, target.box)
          return (['in', 'out'] as const).flatMap((handle) => {
            const handlePoint = handle === 'in' ? point.handleIn : point.handleOut
            if (!handlePoint) return []
            const position = absolutePoint(handlePoint, target.box)
            const active = selection.kind === 'handle' && selection.handle === handle
            return [
              <line key={`handle-line-${target.renderPart}-${handle}`} x1={anchor.x} y1={anchor.y} x2={position.x} y2={position.y} className={styles.handleLine} />,
              <circle
                key={`handle-${target.renderPart}-${handle}`}
                cx={position.x}
                cy={position.y}
                r={active ? 2.4 : 1.8}
                className={active ? styles.activeHandle : styles.handle}
                onPointerDown={(event) => {
                  event.stopPropagation()
                  onSelect({ ...selection, kind: 'handle', handle })
                }}
              />,
            ]
          })
        })}
      </SvgRenderer>
      <span className={styles.focusChar} aria-hidden="true">{char} · {fontSpace.unitsPerEm} UPM</span>
    </div>
  )
}

function InferenceTrackpad({
  glyph,
  syllable,
  selection,
  selectedPoints,
  layoutType,
  schema,
  snapStep,
  unitsPerEm,
  minimumInkGap,
  collisionContexts,
  onPreviewJamo,
  onPreviewSchema,
  onCommitJamo,
  onCommitSchema,
  onCancel,
  onSelectionChange,
  onInkGapLimitChange,
  onMultiSelectArmedChange,
}: {
  glyph: string
  syllable: DecomposedSyllable
  selection: Selection
  selectedPoints: SelectedPoint[]
  layoutType: LayoutType
  schema: LayoutSchema
  snapStep: number
  unitsPerEm: number
  minimumInkGap: number
  collisionContexts: CalibrationInkGapContext[]
  onPreviewJamo: (preview: PreviewJamo | null) => void
  onPreviewSchema: (preview: PreviewSchema | null) => void
  onCommitJamo: (before: JamoData, after: JamoData, raw: RawGlyphEdit) => void
  onCommitSchema: (before: LayoutSchema, after: LayoutSchema, raw: RawGlyphEdit) => void
  onCancel: () => void
  onSelectionChange: (selection: Selection) => void
  onInkGapLimitChange: (violation: CalibrationInkGapViolation | null) => void
  onMultiSelectArmedChange: (armed: boolean) => void
}) {
  const startSchema = useRef(schema)
  const currentSchema = useRef(schema)
  const startJamo = useRef<JamoData | null>(null)
  const currentJamo = useRef<JamoData | null>(null)
  const currentDelta = useRef<StrokeMoveDelta>({ x: 0, y: 0 })
  const currentScale = useRef<StrokeScale>({ x: 1, y: 1 })
  const [delta, setDelta] = useState<StrokeMoveDelta>({ x: 0, y: 0 })
  const [scale, setScale] = useState<StrokeScale>({ x: 1, y: 1 })
  const [inkGapLimiter, setInkGapLimiter] = useState<CalibrationInkGapViolation | null>(null)
  const selectedJamo = selection.kind === 'stroke' || selection.kind === 'point' || selection.kind === 'handle'
    ? selection.jamo
    : null
  const selectedStrokeId = selection.kind === 'stroke' || selection.kind === 'point' || selection.kind === 'handle'
    ? selection.strokeId
    : null
  const selectedStroke = selectedJamo && selectedStrokeId
    ? getJamoStrokes(selectedJamo).find((stroke) => stroke.id === selectedStrokeId)
    : undefined
  const selectedPointHasCurve = Boolean(
    selectedStroke
    && (selection.kind === 'point' || selection.kind === 'handle')
    && pointHasHandles(selectedStroke, selection.pointIndex),
  )
  const mergeTarget = selectedStroke && !selectedStroke.closed
    ? getJamoStrokes(selectedJamo!)
      .filter((stroke) => stroke.id !== selectedStroke.id && !stroke.closed)
      .map((stroke) => ({ stroke, distance: endpointDistance(selectedStroke, stroke) }))
      .filter(({ distance }) => distance <= MERGE_PROXIMITY)
      .sort((a, b) => a.distance - b.distance)[0]?.stroke
    : undefined
  const canDisconnect = Boolean(
    selectedStroke
    && (selection.kind === 'point' || selection.kind === 'handle')
    && (selectedStroke.closed || (selection.pointIndex > 0 && selection.pointIndex < selectedStroke.points.length - 1)),
  )
  const canDelete = selection.kind === 'point' || selection.kind === 'handle'
    ? Boolean(selectedStroke && selectedStroke.points.length > 2)
    : Boolean(selectedStroke && selectedJamo && getJamoStrokes(selectedJamo).length > 1)

  const context = {
    cho: syllable.choseong?.char ?? '',
    jung: syllable.jungseong?.char ?? '',
    jong: syllable.jongseong?.char ?? '',
  }
  const activePart = selection.kind === 'none' ? 'CH' : selection.editorPart
  const focusedCollisionContext = collisionContexts.find((item) => item.char === glyph) ?? collisionContexts[0]
  const activeVisibleJamo = activePart === 'CH' ? syllable.choseong : activePart === 'JU' ? syllable.jungseong : syllable.jongseong
  const jamoInkGapViolation = (jamo: JamoData) => findJamoInkGapViolation(
    focusedCollisionContext ? [focusedCollisionContext] : [],
    jamo,
    startJamo.current ?? jamo,
    activePart,
    minimumInkGap,
  )
  const schemaInkGapViolation = (candidate: LayoutSchema) => findLayoutInkGapViolation(
    collisionContexts,
    candidate,
    startSchema.current,
    activePart,
    minimumInkGap,
  )
  const updateInkGapLimiter = (violation: CalibrationInkGapViolation | null) => {
    setInkGapLimiter(violation)
    onInkGapLimitChange(violation)
  }
  const moveSelectedPoints = (source: JamoData, requested: StrokeMoveDelta) => {
    if (selection.kind !== 'point' || selectedPoints.length < 2) {
      return selection.kind === 'point'
        ? movePoint(source, selection.strokeId, selection.pointIndex, requested, CALIBRATION_FREEFORM_BOUNDS, snapStep)
        : null
    }
    const first = selectedPoints[0]
    const firstResult = movePoint(source, first.strokeId, first.pointIndex, requested, CALIBRATION_FREEFORM_BOUNDS, snapStep)
    let jamo = firstResult.jamo
    for (const point of selectedPoints.slice(1)) {
      jamo = movePoint(jamo, point.strokeId, point.pointIndex, firstResult.delta, CALIBRATION_FREEFORM_BOUNDS).jamo
    }
    return { ...firstResult, jamo }
  }

  useEffect(() => {
    setDelta({ x: 0, y: 0 })
    currentDelta.current = { x: 0, y: 0 }
    setScale({ x: 1, y: 1 })
    currentScale.current = { x: 1, y: 1 }
    setInkGapLimiter(null)
    onInkGapLimitChange(null)
  }, [selection, onInkGapLimitChange])

  const beginMove = () => {
    setDelta({ x: 0, y: 0 })
    updateInkGapLimiter(null)
    if (selection.kind === 'component') {
      const latest = structuredClone(schema)
      startSchema.current = latest
      currentSchema.current = latest
    } else if (selection.kind !== 'none') {
      const latest = structuredClone(activeVisibleJamo ?? selection.jamo)
      startJamo.current = latest
      currentJamo.current = latest
    }
  }
  const beginScale = () => {
    setScale({ x: 1, y: 1 })
    updateInkGapLimiter(null)
    if (selection.kind === 'component') {
      const latest = structuredClone(schema)
      startSchema.current = latest
      currentSchema.current = latest
    } else if (selection.kind === 'stroke') {
      const latest = structuredClone(activeVisibleJamo ?? selection.jamo)
      startJamo.current = latest
      currentJamo.current = latest
    }
  }
  const changeMove = (movement: StrokeMoveDelta) => {
    const normalized = {
      x: Math.round(movement.x * .001 / snapStep) * snapStep,
      y: Math.round(movement.y * .001 / snapStep) * snapStep,
    }
    setDelta(normalized)
    currentDelta.current = normalized
    if (selection.kind === 'component') {
      const createCandidate = (factor: number) => translateLayoutParts(startSchema.current, selection.renderParts, {
        x: normalized.x * factor,
        y: normalized.y * factor,
      })
      const safeFactor = findMaximumSafeEditFactor((factor) => !schemaInkGapViolation(createCandidate(factor)))
      const next = createCandidate(safeFactor)
      const appliedDelta = { x: normalized.x * safeFactor, y: normalized.y * safeFactor }
      currentSchema.current = next
      setDelta(appliedDelta)
      currentDelta.current = appliedDelta
      updateInkGapLimiter(safeFactor < 0.9999 ? schemaInkGapViolation(createCandidate(1)) : null)
      onPreviewSchema({ layoutType, schema: next })
    } else if (selection.kind !== 'none' && startJamo.current) {
      const createCandidate = (factor: number) => {
        const movementAtFactor = { x: normalized.x * factor, y: normalized.y * factor }
        return selection.kind === 'stroke'
          ? moveStroke(startJamo.current!, selection.strokeId, movementAtFactor, CALIBRATION_FREEFORM_BOUNDS, snapStep)
          : selection.kind === 'point'
            ? moveSelectedPoints(startJamo.current!, movementAtFactor)
            : selection.kind === 'handle'
              ? moveHandle(startJamo.current!, selection.strokeId, selection.pointIndex, selection.handle, movementAtFactor, CALIBRATION_FREEFORM_BOUNDS, snapStep)
              : null
      }
      const safeFactor = findMaximumSafeEditFactor((factor) => {
        const candidate = createCandidate(factor)
        return !candidate || !jamoInkGapViolation(candidate.jamo)
      })
      const result = createCandidate(safeFactor)
      if (!result) return
      currentJamo.current = result.jamo
      setDelta(result.delta)
      currentDelta.current = result.delta
      const requested = createCandidate(1)
      updateInkGapLimiter(safeFactor < 0.9999 && requested ? jamoInkGapViolation(requested.jamo) : null)
      onPreviewJamo({ type: selection.jamo.type, char: selection.jamo.char, data: result.jamo, baseline: startJamo.current })
    }
  }
  const commitMove = () => {
    if (selection.kind === 'component') {
      onCommitSchema(startSchema.current, currentSchema.current, {
        kind: 'component-move', glyph, component: selection.component, layoutType, parts: selection.renderParts, delta: currentDelta.current,
      })
    } else if (selection.kind !== 'none' && startJamo.current && currentJamo.current) {
      const common = { glyph, component: selection.component, jamoType: selection.jamo.type, strokeId: selection.strokeId, delta: currentDelta.current }
      const raw: RawGlyphEdit = selection.kind === 'stroke'
        ? { kind: 'stroke-move', ...common }
        : selection.kind === 'point'
          ? { kind: 'point-move', ...common, pointIndex: selection.pointIndex }
          : selection.kind === 'handle'
            ? { kind: 'handle-move', ...common, pointIndex: selection.pointIndex, handle: selection.handle }
            : { kind: 'stroke-move', ...common }
      onCommitJamo(startJamo.current, currentJamo.current, raw)
    }
  }
  const changeScale = (relative: StrokeScale, axis: 'x' | 'y') => {
    const nextScale = { x: axis === 'x' ? Math.max(.5, relative.x) : 1, y: axis === 'y' ? Math.max(.5, relative.y) : 1 }
    setScale(nextScale)
    currentScale.current = nextScale
    if (selection.kind === 'component') {
      const startBoxes = calculateBoxes(startSchema.current, context)
      const scaleAtFactor = (factor: number) => ({
        x: 1 + (nextScale.x - 1) * factor,
        y: 1 + (nextScale.y - 1) * factor,
      })
      const createCandidate = (factor: number) => scaleLayoutParts(startSchema.current, selection.renderParts, startBoxes, scaleAtFactor(factor))
      const safeFactor = findMaximumSafeEditFactor((factor) => !schemaInkGapViolation(createCandidate(factor)))
      const appliedScale = scaleAtFactor(safeFactor)
      const next = createCandidate(safeFactor)
      currentSchema.current = next
      setScale(appliedScale)
      currentScale.current = appliedScale
      updateInkGapLimiter(safeFactor < 0.9999 ? schemaInkGapViolation(createCandidate(1)) : null)
      onPreviewSchema({ layoutType, schema: next })
    } else if (selection.kind === 'stroke' && startJamo.current) {
      const scaleAtFactor = (factor: number) => ({
        x: 1 + (nextScale.x - 1) * factor,
        y: 1 + (nextScale.y - 1) * factor,
      })
      const createCandidate = (factor: number) => scaleStroke(startJamo.current!, selection.strokeId, scaleAtFactor(factor), CALIBRATION_FREEFORM_BOUNDS)
      const safeFactor = findMaximumSafeEditFactor((factor) => !jamoInkGapViolation(createCandidate(factor).jamo))
      const result = createCandidate(safeFactor)
      currentJamo.current = result.jamo
      setScale(result.scale)
      currentScale.current = result.scale
      updateInkGapLimiter(safeFactor < 0.9999 ? jamoInkGapViolation(createCandidate(1).jamo) : null)
      onPreviewJamo({ type: selection.jamo.type, char: selection.jamo.char, data: result.jamo, baseline: startJamo.current })
    }
  }
  const commitScale = () => {
    if (selection.kind === 'component') {
      onCommitSchema(startSchema.current, currentSchema.current, {
        kind: 'component-scale', glyph, component: selection.component, layoutType, parts: selection.renderParts, scale: currentScale.current,
      })
    } else if (selection.kind === 'stroke' && startJamo.current && currentJamo.current) {
      onCommitJamo(startJamo.current, currentJamo.current, {
        kind: 'stroke-scale', glyph, component: selection.component, jamoType: selection.jamo.type, strokeId: selection.strokeId, scale: currentScale.current,
      })
    }
  }
  const cancel = () => {
    onPreviewJamo(null)
    onPreviewSchema(null)
    onCancel()
  }
  const toggleCurve = () => {
    if ((selection.kind !== 'point' && selection.kind !== 'handle') || !selectedStroke) return
    const before = structuredClone(getJamo(selection.jamo.type, selection.jamo.char) ?? selection.jamo)
    const after = structuredClone(before)
    const collections = [after.strokes, after.horizontalStrokes, after.verticalStrokes]
    for (const strokes of collections) {
      const strokeIndex = strokes?.findIndex((stroke) => stroke.id === selection.strokeId) ?? -1
      if (!strokes || strokeIndex < 0) continue
      const stroke = strokes[strokeIndex]
      strokes[strokeIndex] = selectedPointHasCurve
        ? removeHandlesFromPoint(stroke, selection.pointIndex)
        : addHandlesToPoint(stroke, selection.pointIndex)
      break
    }
    onCommitJamo(before, after, {
      kind: 'point-move',
      glyph,
      component: selection.component,
      jamoType: selection.jamo.type,
      strokeId: selection.strokeId,
      pointIndex: selection.pointIndex,
      delta: { x: 0, y: 0 },
    })
    if (selectedPointHasCurve) {
      onSelectionChange({ ...selection, kind: 'point', jamo: after })
      return
    }
    const curvedStroke = [
      ...(after.strokes ?? []),
      ...(after.horizontalStrokes ?? []),
      ...(after.verticalStrokes ?? []),
    ].find((stroke) => stroke.id === selection.strokeId)
    const curvedPoint = curvedStroke?.points[selection.pointIndex]
    const handle = curvedPoint?.handleOut ? 'out' : curvedPoint?.handleIn ? 'in' : null
    onSelectionChange(handle
      ? { ...selection, kind: 'handle', handle, jamo: after }
      : { ...selection, kind: 'point', jamo: after })
  }
  const addStroke = () => {
    if (selection.kind === 'none' || selection.kind === 'component') return
    const before = structuredClone(getJamo(selection.jamo.type, selection.jamo.char) ?? selection.jamo)
    const strokeId = `stroke-${Date.now()}`
    const stroke: StrokeDataV2 = {
      id: strokeId,
      points: [{ x: .3, y: .5 }, { x: .7, y: .5 }],
      closed: false,
      thickness: selectedStroke?.thickness ?? .07,
    }
    const after = addJamoStroke(before, selection.strokeId, stroke)
    onCommitJamo(before, after, { kind: 'stroke-move', glyph, component: selection.component, jamoType: selection.jamo.type, strokeId, delta: { x: 0, y: 0 } })
    onSelectionChange({ ...selection, kind: 'stroke', strokeId, jamo: after })
  }
  const connectStroke = () => {
    if ((selection.kind !== 'stroke' && selection.kind !== 'point' && selection.kind !== 'handle') || !selectedStroke || !mergeTarget) return
    const merged = mergeStrokes(selectedStroke, mergeTarget)
    if (!merged) return
    const before = structuredClone(getJamo(selection.jamo.type, selection.jamo.char) ?? selection.jamo)
    const after = updateJamoStroke(updateJamoStroke(before, selectedStroke.id, () => merged), mergeTarget.id, () => null)
    onCommitJamo(before, after, { kind: 'stroke-move', glyph, component: selection.component, jamoType: selection.jamo.type, strokeId: selectedStroke.id, delta: { x: 0, y: 0 } })
    onSelectionChange({ ...selection, kind: 'stroke', strokeId: selectedStroke.id, jamo: after })
  }
  const disconnectStroke = () => {
    if ((selection.kind !== 'point' && selection.kind !== 'handle') || !selectedStroke || !canDisconnect) return
    const before = structuredClone(getJamo(selection.jamo.type, selection.jamo.char) ?? selection.jamo)
    if (selectedStroke.closed) {
      const points = [...selectedStroke.points.slice(selection.pointIndex), ...selectedStroke.points.slice(0, selection.pointIndex)]
      const after = updateJamoStroke(before, selectedStroke.id, (stroke) => ({ ...stroke, points, closed: false }))
      onCommitJamo(before, after, { kind: 'point-move', glyph, component: selection.component, jamoType: selection.jamo.type, strokeId: selectedStroke.id, pointIndex: selection.pointIndex, delta: { x: 0, y: 0 } })
      onSelectionChange({ ...selection, kind: 'point', pointIndex: 0, jamo: after })
      return
    }
    const halves = splitStroke(selectedStroke, selection.pointIndex)
    if (!halves) return
    const [first, second] = halves
    const after = addJamoStroke(updateJamoStroke(before, selectedStroke.id, () => first), selectedStroke.id, second)
    onCommitJamo(before, after, { kind: 'point-move', glyph, component: selection.component, jamoType: selection.jamo.type, strokeId: selectedStroke.id, pointIndex: selection.pointIndex, delta: { x: 0, y: 0 } })
    onSelectionChange({ ...selection, kind: 'stroke', strokeId: second.id, jamo: after })
  }
  const deleteSelection = () => {
    if ((selection.kind !== 'stroke' && selection.kind !== 'point' && selection.kind !== 'handle') || !selectedStroke || !canDelete) return
    const before = structuredClone(getJamo(selection.jamo.type, selection.jamo.char) ?? selection.jamo)
    const after = selection.kind === 'point' || selection.kind === 'handle'
      ? updateJamoStroke(before, selectedStroke.id, (stroke) => ({ ...stroke, points: stroke.points.filter((_, index) => index !== selection.pointIndex) }))
      : updateJamoStroke(before, selectedStroke.id, () => null)
    onCommitJamo(before, after, { kind: selection.kind === 'stroke' ? 'stroke-move' : 'point-move', glyph, component: selection.component, jamoType: selection.jamo.type, strokeId: selectedStroke.id, ...(selection.kind === 'stroke' ? {} : { pointIndex: selection.pointIndex }), delta: { x: 0, y: 0 } } as RawGlyphEdit)
    onSelectionChange({ ...selection, kind: 'stroke', strokeId: selection.kind === 'stroke' ? getJamoStrokes(after)[0]?.id ?? selectedStroke.id : selectedStroke.id, jamo: after })
  }

  const trackpad = useUnifiedTrackpad({
    enabled: selection.kind !== 'none',
    scaleEnabled: selection.kind === 'component' || selection.kind === 'stroke',
    commitOnCancel: true,
    onMoveStart: beginMove,
    onMoveChange: changeMove,
    onMoveCommit: commitMove,
    onScaleStart: beginScale,
    onScaleChange: changeScale,
    onScaleCommit: commitScale,
    onCancel: cancel,
  })
  useEffect(() => {
    onMultiSelectArmedChange(trackpad.visualState.mode === 'pending' && trackpad.visualState.points.length === 1)
  }, [onMultiSelectArmedChange, trackpad.visualState.mode, trackpad.visualState.points.length])
  const baseLabel = selection.kind === 'none'
    ? '글자에서 움직일 부분이나 점을 누르세요'
    : selection.kind === 'component'
      ? `${layoutAreaLabel(selection.editorPart)} 영역 · 같은 구조의 글자에 함께 적용`
      : selection.kind === 'stroke'
        ? `${selection.jamo.char}의 획 · 이동 · 두 손가락 비율`
        : selection.kind === 'handle'
          ? `${selection.jamo.char}의 곡선 핸들 · 한 손가락 이동`
          : `${selection.jamo.char}의 점 · 한 손가락 이동`
  const multiSelectLabel = trackpad.visualState.mode === 'pending' && trackpad.visualState.points.length === 1
    ? ` · 꼭짓점 추가 선택${selectedPoints.length > 0 ? ` ${selectedPoints.length}개` : ''}`
    : selectedPoints.length > 1
      ? ` · 꼭짓점 ${selectedPoints.length}개 함께 이동`
      : ''
  const label = `${baseLabel}${multiSelectLabel}${inkGapLimiter ? ` · ${inkGapLimiter.char}에서 최소 잉크 간격` : ''}`

  return (
    <section className={styles.trackpadSection}>
      <div className={`${legacyTrackpadStyles.trackpadWithTools} ${selection.kind === 'stroke' || selection.kind === 'point' || selection.kind === 'handle' ? legacyTrackpadStyles.trackpadWithToolsActive : ''}`}>
      {(selection.kind === 'stroke' || selection.kind === 'point' || selection.kind === 'handle') && <StrokeToolRail
        onAdd={addStroke}
        curveMode={selection.kind === 'point' || selection.kind === 'handle' ? selectedPointHasCurve ? 'line' : 'curve' : undefined}
        onToggleCurve={selection.kind === 'point' || selection.kind === 'handle' ? toggleCurve : undefined}
        onConnect={mergeTarget ? connectStroke : undefined}
        onDisconnect={canDisconnect ? disconnectStroke : undefined}
        deleteLabel={canDelete ? selection.kind === 'stroke' ? '획 삭제' : '꼭짓점 삭제' : undefined}
        onDelete={canDelete ? deleteSelection : undefined}
      />}
      <div
        {...trackpad.handlers}
        className={`${legacyTrackpadStyles.trackpad} ${styles.trackpad} ${selection.kind === 'none' ? styles.trackpadDisabled : ''}`}
        role="group"
        aria-label="선택한 글자 형태를 조절하는 트랙패드"
        aria-disabled={selection.kind === 'none'}
      >
        <span className={legacyTrackpadStyles.horizontalLane} aria-hidden="true" />
        <span className={legacyTrackpadStyles.verticalLane} aria-hidden="true" />
        {trackpad.visualState.points.map((point, index) => <span key={index} className={legacyTrackpadStyles.pinchPoint} style={{ left: point.x, top: point.y }} aria-hidden="true" />)}
        <span className={styles.trackpadLabel}>{label}</span>
        <output className={styles.trackpadValue}>{trackpad.visualState.mode === 'scale' ? `${Math.round(scale.x * 100)}% × ${Math.round(scale.y * 100)}%` : `x ${Math.round(delta.x * unitsPerEm)} · y ${Math.round(delta.y * unitsPerEm)}`}</output>
      </div>
      </div>
    </section>
  )
}

function DesignBodySettings({
  layoutType,
  fontSpace,
  onClose,
}: {
  layoutType: LayoutType
  fontSpace: { unitsPerEm: number; width: number; height: number }
  onClose: () => void
}) {
  const globalPadding = useLayoutStore((state) => state.globalPadding)
  const layoutOverride = useLayoutStore((state) => state.paddingOverrides[layoutType])
  const setGlobalPadding = useLayoutStore((state) => state.setGlobalPadding)
  const resetGlobalPadding = useLayoutStore((state) => state.resetGlobalPadding)
  const setPaddingOverride = useLayoutStore((state) => state.setPaddingOverride)
  const removePaddingOverride = useLayoutStore((state) => state.removePaddingOverride)
  const [scope, setScope] = useState<'font' | 'layout'>(layoutOverride ? 'layout' : 'font')
  const usesLayoutOverride = scope === 'layout' && !!layoutOverride
  const padding = usesLayoutOverride ? { ...globalPadding, ...layoutOverride } : globalPadding
  const body = paddingToDesignBody(padding, fontSpace)

  const updateBody = (dimension: 'width' | 'height', value: number) => {
    const next = centeredDesignBodyPadding(
      dimension === 'width' ? value : body.width,
      dimension === 'height' ? value : body.height,
      fontSpace,
    )
    if (scope === 'layout') {
      if (dimension === 'width') {
        setPaddingOverride(layoutType, 'left', next.left)
        setPaddingOverride(layoutType, 'right', next.right)
      } else {
        setPaddingOverride(layoutType, 'top', next.top)
        setPaddingOverride(layoutType, 'bottom', next.bottom)
      }
    } else setGlobalPadding(next)
  }

  const selectLayoutScope = () => {
    setScope('layout')
  }

  return <section className={styles.bodySettings} aria-label="글자 네모꼴 설정">
    <div className={styles.bodySettingsTitle}>
      <div><strong>글자 네모꼴</strong><span>Font Space {fontSpace.unitsPerEm}은 고정됩니다</span></div>
      <button type="button" onClick={onClose} aria-label="글자 네모꼴 설정 닫기"><X size={18} /></button>
    </div>
    <div className={styles.bodyScope} role="tablist" aria-label="네모꼴 적용 범위">
      <button type="button" role="tab" aria-selected={scope === 'font'} onClick={() => setScope('font')}>폰트 전체</button>
      <button type="button" role="tab" aria-selected={scope === 'layout'} onClick={selectLayoutScope}>현재 레이아웃</button>
    </div>
    <p>{scope === 'font' ? '모든 레이아웃의 기본 네모꼴' : `${LAYOUT_LABELS[layoutType]}만 별도 적용`}</p>
    <label><span>가로 <output>{Math.round(body.width)}</output></span><input type="range" min="500" max="1000" step="5" value={Math.round(body.width)} onChange={(event) => updateBody('width', Number(event.target.value))} /></label>
    <label><span>세로 <output>{Math.round(body.height)}</output></span><input type="range" min="500" max="1000" step="5" value={Math.round(body.height)} onChange={(event) => updateBody('height', Number(event.target.value))} /></label>
    <button type="button" className={styles.bodyReset} disabled={scope === 'layout' ? !layoutOverride : body.width === 850 && body.height === 850} onClick={() => scope === 'layout' ? removePaddingOverride(layoutType) : resetGlobalPadding()}>{scope === 'layout' ? '폰트 전체 설정 따르기' : '기본 850 × 850으로 되돌리기'}</button>
  </section>
}

export function CalibrationSentenceEditor() {
  const choseong = useJamoStore((state) => state.choseong)
  const jungseong = useJamoStore((state) => state.jungseong)
  const jongseong = useJamoStore((state) => state.jongseong)
  const schemas = useLayoutStore((state) => state.layoutSchemas)
  const globalPadding = useLayoutStore((state) => state.globalPadding)
  const paddingOverrides = useLayoutStore((state) => state.paddingOverrides)
  const fontSpace = useCalibrationProjectStore((state) => state.fontSpace)
  const grid = useCalibrationProjectStore((state) => state.grid)
  const metrics = useCalibrationProjectStore((state) => state.metrics)
  const layoutProfile = useCalibrationProjectStore((state) => state.layoutProfile)
  const [sampleSentence, setSampleSentence] = useState<string>(SAMPLE_SENTENCES[0])
  const [selectedChar, setSelectedChar] = useState('과')
  const [selection, setSelection] = useState<Selection>({ kind: 'none' })
  const [selectedPoints, setSelectedPoints] = useState<SelectedPoint[]>([])
  const [multiSelectArmed, setMultiSelectArmed] = useState(false)
  const [previewJamo, setPreviewJamo] = useState<PreviewJamo | null>(null)
  const [previewSchema, setPreviewSchema] = useState<PreviewSchema | null>(null)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [future, setFuture] = useState<HistoryEntry[]>([])
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const [exportState, setExportState] = useState<'idle' | 'exporting' | 'downloaded' | 'failed'>('idle')
  const [exportProgress, setExportProgress] = useState('')
  const [inkGapLimiter, setInkGapLimiter] = useState<CalibrationInkGapViolation | null>(null)
  const [isDirectInputActive, setIsDirectInputActive] = useState(false)
  const [isCustomSentence, setIsCustomSentence] = useState(false)
  const [isBodySettingsOpen, setIsBodySettingsOpen] = useState(false)
  const directInputRef = useRef<HTMLTextAreaElement>(null)
  const maps = useMemo(() => ({ choseong, jungseong, jongseong }), [choseong, jungseong, jongseong])
  const baseSyllable = useMemo(() => decomposeSyllable(selectedChar, choseong, jungseong, jongseong), [selectedChar, choseong, jungseong, jongseong])
  const previewedSyllable = useMemo(() => withPreviewJamo(baseSyllable, previewJamo), [baseSyllable, previewJamo])
  const baseSchema = withLayoutProfile(schemas[previewedSyllable.layoutType], layoutProfile[previewedSyllable.layoutType])
  const displayedSchema = previewSchema?.layoutType === previewedSyllable.layoutType ? previewSchema.schema : baseSchema
  const effectiveSchema = useMemo(() => {
    const padding = { ...globalPadding, ...paddingOverrides[previewedSyllable.layoutType] }
    return { ...displayedSchema, padding, designBodyPadding: padding }
  }, [displayedSchema, globalPadding, paddingOverrides, previewedSyllable.layoutType])
  const designBody = useMemo(() => paddingToDesignBody(effectiveSchema.padding, fontSpace), [effectiveSchema.padding, fontSpace])
  const focusedBoxes = useMemo(() => calculateBoxes(effectiveSchema, {
    cho: previewedSyllable.choseong?.char ?? '',
    jung: previewedSyllable.jungseong?.char ?? '',
    jong: previewedSyllable.jongseong?.char ?? '',
  }), [effectiveSchema, previewedSyllable])
  const syllable = useMemo(
    () => resolveSyllableContextualInkSafety(previewedSyllable, focusedBoxes).syllable,
    [focusedBoxes, previewedSyllable],
  )
  const snapStep = fontUnitsToNormalized(grid.snapInterval, fontSpace)
  const minimumInkGap = fontUnitsToNormalized(grid.minorInterval, fontSpace)
  const sentenceEm = 40
  const calibrationLines = useMemo(() => [sampleSentence], [sampleSentence])
  const collisionContexts = useMemo<CalibrationInkGapContext[]>(() => {
    const contexts = calibrationLines.flatMap((line, lineIndex) => [...line].flatMap((char, charIndex) => {
      if (!isEditableHangul(char)) return []
      const decomposed = decomposeSyllable(char, choseong, jungseong, jongseong)
      const base = withLayoutProfile(schemas[decomposed.layoutType], layoutProfile[decomposed.layoutType])
      const padding = { ...globalPadding, ...paddingOverrides[decomposed.layoutType] }
      const schema = { ...base, padding, designBodyPadding: padding }
      const boxes = calculateBoxes(schema, {
        cho: decomposed.choseong?.char ?? '',
        jung: decomposed.jungseong?.char ?? '',
        jong: decomposed.jongseong?.char ?? '',
      })
      return [{
        id: `sentence-${lineIndex}-${charIndex}`,
        char,
        syllable: resolveSyllableContextualInkSafety(decomposed, boxes).syllable,
        schema,
      }]
    }))
    if (!contexts.some((item) => item.char === selectedChar)) {
      contexts.unshift({ id: 'focused', char: selectedChar, syllable, schema: effectiveSchema })
    }
    return contexts
  }, [calibrationLines, choseong, effectiveSchema, globalPadding, jungseong, jongseong, layoutProfile, paddingOverrides, schemas, selectedChar, syllable])

  const chooseChar = (char: string) => {
    setSelectedChar(char)
    setSelection({ kind: 'none' })
    setSelectedPoints([])
    setPreviewJamo(null)
    setPreviewSchema(null)
    setInkGapLimiter(null)
  }
  const selectFromCanvas = (nextSelection: Selection) => {
    setSelection(nextSelection)
    if (nextSelection.kind === 'point' || nextSelection.kind === 'handle') {
      setSelectedPoints([{ strokeId: nextSelection.strokeId, pointIndex: nextSelection.pointIndex }])
    } else {
      setSelectedPoints([])
    }
  }
  const selectPointFromCanvas = (nextSelection: Extract<Selection, { kind: 'point' }>) => {
    setSelection(nextSelection)
    const nextPoint = { strokeId: nextSelection.strokeId, pointIndex: nextSelection.pointIndex }
    if (!multiSelectArmed) {
      setSelectedPoints([nextPoint])
      return
    }
    const currentJamo = selection.kind === 'stroke' || selection.kind === 'point' || selection.kind === 'handle'
      ? selection.jamo
      : null
    const sameJamo = currentJamo?.type === nextSelection.jamo.type && currentJamo.char === nextSelection.jamo.char
    setSelectedPoints((points) => {
      const base = sameJamo ? points : []
      return base.some((point) => point.strokeId === nextPoint.strokeId && point.pointIndex === nextPoint.pointIndex)
        ? base
        : [...base, nextPoint]
    })
  }
  const handleTrackpadSelectionChange = (nextSelection: Selection) => {
    setSelection(nextSelection)
    if (nextSelection.kind === 'stroke' || nextSelection.kind === 'component' || nextSelection.kind === 'none') {
      setSelectedPoints([])
    }
  }
  const pickSampleSentence = () => {
    const candidates = SAMPLE_SENTENCES.filter((sentence) => sentence !== sampleSentence)
    const nextSentence = candidates[Math.floor(Math.random() * candidates.length)]
    setSampleSentence(nextSentence)
    setIsCustomSentence(false)
    const firstSyllable = [...nextSentence].find(isEditableHangul)
    if (firstSyllable) chooseChar(firstSyllable)
  }
  const startDirectInput = () => {
    if (!isCustomSentence) {
      setSampleSentence('')
      setIsCustomSentence(true)
    }
    setIsDirectInputActive(true)
    const input = directInputRef.current
    if (!input) return
    if (!isCustomSentence) input.value = ''
    input.focus()
    const caretPosition = isCustomSentence ? input.value.length : 0
    input.setSelectionRange(caretPosition, caretPosition)
  }
  const updateDirectInput = (value: string) => {
    setSampleSentence(value)
    setIsCustomSentence(true)
    if (![...value].includes(selectedChar)) {
      const firstSyllable = [...value].find(isEditableHangul)
      if (firstSyllable) chooseChar(firstSyllable)
    }
  }
  const previewJamoWithContextSafety = (preview: PreviewJamo | null) => {
    if (!preview) {
      setPreviewJamo(null)
      return
    }
    const stored = getJamo(preview.type, preview.char) ?? preview.data
    setPreviewJamo({
      ...preview,
      data: withContextualInkSafety(stored, preview.baseline ?? preview.data, preview.data, minimumInkGap),
    })
  }
  const commitJamo = (before: JamoData, after: JamoData, raw: RawGlyphEdit) => {
    if (JSON.stringify(before) === JSON.stringify(after)) return
    const storedBefore = structuredClone(getJamo(before.type, before.char) ?? before)
    const safeAfter = withContextualInkSafety(storedBefore, before, after, minimumInkGap)
    const edit = createSampleGlyphEdit(raw)
    setHistory((entries) => [...entries, { kind: 'jamo', jamoType: before.type, char: before.char, before: storedBefore, after: safeAfter, edit }])
    setFuture([])
    useCalibrationProjectStore.getState().addSampleGlyphEdit(edit)
    updateJamo(safeAfter)
    setPreviewJamo(null)
    setSelection((current) => current.kind === 'none' ? current : { ...current, jamo: safeAfter })
  }
  const commitSchema = (before: LayoutSchema, after: LayoutSchema, raw: RawGlyphEdit) => {
    if (JSON.stringify(before.userPartOverrides ?? {}) === JSON.stringify(after.userPartOverrides ?? {})) return
    const edit = createSampleGlyphEdit(raw)
    setHistory((entries) => [...entries, { kind: 'layout', layoutType: before.id, before, after, edit }])
    setFuture([])
    useCalibrationProjectStore.getState().setLayoutProfile(after.id, after.userPartOverrides)
    useCalibrationProjectStore.getState().addSampleGlyphEdit(edit)
    setPreviewSchema(null)
  }
  const undo = () => {
    const entry = history.at(-1)
    if (!entry) return
    if (entry.kind === 'layout') useCalibrationProjectStore.getState().setLayoutProfile(entry.layoutType, entry.before.userPartOverrides)
    else updateJamo(entry.before)
    setHistory((entries) => entries.slice(0, -1))
    setFuture((entries) => [...entries, entry])
    useCalibrationProjectStore.getState().removeSampleGlyphEdit(entry.edit.id)
    setPreviewJamo(null)
    setPreviewSchema(null)
    setSelection({ kind: 'none' })
    setSelectedPoints([])
  }
  const redo = () => {
    const entry = future.at(-1)
    if (!entry) return
    if (entry.kind === 'layout') useCalibrationProjectStore.getState().setLayoutProfile(entry.layoutType, entry.after.userPartOverrides)
    else updateJamo(entry.after)
    setFuture((entries) => entries.slice(0, -1))
    setHistory((entries) => [...entries, entry])
    useCalibrationProjectStore.getState().addSampleGlyphEdit(entry.edit)
    setPreviewJamo(null)
    setPreviewSchema(null)
    setSelection({ kind: 'none' })
    setSelectedPoints([])
  }
  const copyAnalysisValues = async () => {
    const currentJamos = useJamoStore.getState()
    const currentLayouts = useLayoutStore.getState()
    const currentProject = useCalibrationProjectStore.getState()
    const snapshot = createCalibrationAnalysisSnapshot({
      sentenceLines: calibrationLines,
      fontSpace: currentProject.fontSpace,
      grid: currentProject.grid,
      designBody: paddingToDesignBody(currentLayouts.globalPadding, currentProject.fontSpace),
      metrics: currentProject.metrics,
      layoutProfile: currentProject.layoutProfile,
      sampleGlyphEdits: currentProject.sampleGlyphEdits,
      maps: {
        choseong: currentJamos.choseong,
        jungseong: currentJamos.jungseong,
        jongseong: currentJamos.jongseong,
      },
      schemas: currentLayouts.layoutSchemas,
      globalPadding: currentLayouts.globalPadding,
      paddingOverrides: currentLayouts.paddingOverrides,
    })
    try {
      await copyText(JSON.stringify(snapshot, null, 2))
      setCopyState('copied')
    } catch {
      setCopyState('failed')
    }
    window.setTimeout(() => setCopyState('idle'), 1800)
  }
  const exportCurrentFont = async () => {
    if (exportState === 'exporting') return
    setExportState('exporting')
    setExportProgress('준비 중...')
    const result = await generateAndDownloadFont({
      familyName: 'FontMaker',
      layoutProfile: useCalibrationProjectStore.getState().layoutProfile,
      onProgress: (_completed, _total, phase) => setExportProgress(phase),
    })
    setExportProgress('')
    setExportState(result.success ? 'downloaded' : 'failed')
    window.setTimeout(() => setExportState('idle'), 1800)
  }
  const renderSentenceCharacter = (char: string, charIndex: number, lineIndex: number) => {
    const decomposedForMetrics = isEditableHangul(char)
      ? decomposeSyllable(char, choseong, jungseong, jongseong)
      : null
    const layoutPadding = decomposedForMetrics
      ? { ...globalPadding, ...paddingOverrides[decomposedForMetrics.layoutType] }
      : null
    const hangulAdvance = layoutPadding
      ? Math.round((1 - layoutPadding.left - layoutPadding.right) * fontSpace.unitsPerEm)
      : metrics.hangulAdvance
    const globalBodyWidth = 1 - globalPadding.left - globalPadding.right
    const spaceAdvance = Math.round(metrics.spaceAdvance * globalBodyWidth / .85)
    const advance = advanceForCharacter(char, metrics, hangulAdvance, spaceAdvance)
    const width = `${advance / fontSpace.unitsPerEm}em`
    const layoutHighlight = selection.kind === 'component'
      ? { layoutType: syllable.layoutType, parts: selection.renderParts, source: char === selectedChar }
      : null
    const contextId = `sentence-${lineIndex}-${charIndex}`
    let isSafetyAdjusted = false
    if (isEditableHangul(char)) {
      const previewed = withPreviewJamo(decomposeSyllable(char, choseong, jungseong, jongseong), previewJamo)
      const contextBase = withLayoutProfile(schemas[previewed.layoutType], layoutProfile[previewed.layoutType])
      const padding = { ...globalPadding, ...paddingOverrides[previewed.layoutType] }
      const contextSchema = { ...contextBase, padding, designBodyPadding: padding }
      const contextBoxes = calculateBoxes(contextSchema, {
        cho: previewed.choseong?.char ?? '',
        jung: previewed.jungseong?.char ?? '',
        jong: previewed.jongseong?.char ?? '',
      })
      isSafetyAdjusted = resolveSyllableContextualInkSafety(previewed, contextBoxes).limitedParts.length > 0
    }
    return isEditableHangul(char)
      ? <button key={`${lineIndex}-${char}-${charIndex}`} style={{ inlineSize: width }} type="button" aria-current={char === selectedChar ? 'true' : undefined} data-ink-gap-limiter={inkGapLimiter?.id === contextId ? 'true' : undefined} data-ink-safety-adjusted={isSafetyAdjusted ? 'true' : undefined} aria-label={`${char} 편집${isSafetyAdjusted ? ', 충돌 안전 보정됨' : ''}`} onClick={() => chooseChar(char)}>
          <Glyph char={char} size={sentenceEm} maps={maps} schemas={schemas} globalPadding={globalPadding} paddingOverrides={paddingOverrides} previewJamo={previewJamo} previewSchema={previewSchema} layoutProfile={layoutProfile} layoutHighlight={layoutHighlight} />
        </button>
      : <span key={`${lineIndex}-${char}-${charIndex}`} className={/\s/u.test(char) ? styles.spaceGlyph : styles.punctuationGlyph} style={{ inlineSize: width }} aria-label={/\s/u.test(char) ? '공백' : char}>{char}</span>
  }
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div><span>FONT CALIBRATION</span><strong>문장에서 글자를 직접 다듬으세요</strong></div>
        <nav aria-label="폰트 추출 및 편집 기록">
          <button type="button" className={styles.exportButton} data-export-state={exportState} onClick={exportCurrentFont} disabled={exportState === 'exporting'} aria-label={exportState === 'exporting' ? `OTF 추출 중: ${exportProgress}` : exportState === 'downloaded' ? 'OTF 추출 완료' : exportState === 'failed' ? 'OTF 추출 실패' : '현재 작업을 OTF로 추출'} title={exportState === 'exporting' ? exportProgress : '현재 작업을 OTF로 추출'}>
            {exportState === 'exporting' ? <LoaderCircle className={styles.exportSpinner} size={18} /> : exportState === 'downloaded' ? <Check size={18} /> : exportState === 'failed' ? <X size={18} /> : <Download size={18} />}
          </button>
          <button hidden type="button" className={styles.copyButton} data-copy-state={copyState} onClick={copyAnalysisValues} aria-label={copyState === 'copied' ? '분석용 값 복사됨' : copyState === 'failed' ? '분석용 값 복사 실패' : '분석용 값 복사'} title="분석용 값 복사">
            {copyState === 'copied' ? <Check size={18} /> : <Copy size={18} />}
          </button>
          <button type="button" data-active={isBodySettingsOpen || undefined} onClick={() => setIsBodySettingsOpen((open) => !open)} aria-label="글자 네모꼴 설정" title="글자 네모꼴 설정"><Settings2 size={18} /></button>
          <button type="button" onClick={undo} disabled={history.length === 0} aria-label="마지막 편집 되돌리기"><Undo2 size={18} />{history.length > 0 && <span>{history.length}</span>}</button>
          <button type="button" onClick={redo} disabled={future.length === 0} aria-label="되돌린 편집 다시 실행"><Redo2 size={18} /></button>
        </nav>
      </header>


      {isBodySettingsOpen && <DesignBodySettings layoutType={previewedSyllable.layoutType} fontSpace={fontSpace} onClose={() => setIsBodySettingsOpen(false)} />}

      <section className={styles.sentence} aria-label="보정 문장">
        <div className={styles.sentenceActions}>
          <button type="button" onClick={pickSampleSentence} aria-label="예시 문장 무작위 선택" title="예시 문장 바꾸기"><Dices size={19} aria-hidden="true" /></button>
          <button type="button" data-active={isDirectInputActive || undefined} onClick={startDirectInput} aria-label="보정 문장 직접 입력" title="직접 입력"><TextCursorInput size={19} aria-hidden="true" /></button>
        </div>
        <textarea
          ref={directInputRef}
          className={styles.directInput}
          value={sampleSentence}
          onChange={(event) => updateDirectInput(event.target.value)}
          onFocus={() => setIsDirectInputActive(true)}
          onBlur={() => setIsDirectInputActive(false)}
          aria-label="보정 문장 직접 입력"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
        {calibrationLines.map((line, lineIndex) => <div key={line} className={styles.sentenceRun} style={{ fontSize: sentenceEm }}>
          {tokenizeSentenceLine(line).map((token) => token.whitespace
            ? [...token.text].map((char, index) => renderSentenceCharacter(char, token.start + index, lineIndex))
            : <span key={`${lineIndex}-word-${token.start}`} className={styles.wordRun}>{[...token.text].map((char, index) => renderSentenceCharacter(char, token.start + index, lineIndex))}</span>
          )}
          {isDirectInputActive && <span className={styles.directInputCaret} aria-hidden="true" />}
        </div>)}
      </section>

      <section className={styles.editor} aria-label={`${selectedChar} 완성 글자 편집`}>
        <FocusedGlyph char={selectedChar} syllable={syllable} schema={effectiveSchema} selection={selection} onSelect={selectFromCanvas} selectedPoints={selectedPoints} onPointSelect={selectPointFromCanvas} fontSpace={fontSpace} grid={grid} designBody={designBody} />
      </section>

      <InferenceTrackpad
        glyph={selectedChar}
        syllable={syllable}
        selection={selection}
        selectedPoints={selectedPoints}
        layoutType={syllable.layoutType}
        schema={effectiveSchema}
        snapStep={snapStep}
        unitsPerEm={fontSpace.unitsPerEm}
        minimumInkGap={minimumInkGap}
        collisionContexts={collisionContexts}
        onPreviewJamo={previewJamoWithContextSafety}
        onPreviewSchema={setPreviewSchema}
        onCommitJamo={commitJamo}
        onCommitSchema={commitSchema}
        onCancel={() => { setPreviewJamo(null); setPreviewSchema(null) }}
        onSelectionChange={handleTrackpadSelectionChange}
        onInkGapLimitChange={setInkGapLimiter}
        onMultiSelectArmedChange={setMultiSelectArmed}
      />
    </main>
  )
}
