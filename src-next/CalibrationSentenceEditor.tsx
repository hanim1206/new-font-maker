import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { ArrowLeft, Check, Copy, CopyPlus, Dices, Download, LayoutDashboard, Link2, ListTree, LoaderCircle, Plus, Redo2, Settings2, Spline, TextCursorInput, Trash2, Undo2, Unlink, X } from 'lucide-react'
import { SvgRenderer } from '../src/renderers/SvgRenderer'
import { loadGhostVisible, saveGhostVisible, useGhostComparison, useNotoGhost } from './notoGhostCompare'
import { DevGhostToggle } from './DevGhostToggle'
import { facesToBox, identityOfSyllable } from '../src/services/contextBoxResolver'
import { contextPlacementOf, useContextPlacement, useNotoModel } from './notoModel'
import { GlyphLayoutEditor } from './GlyphLayoutEditor'
import { effectiveLayoutDelta, useLayoutDeltaStore } from './layoutDeltaStore'
import type { LayoutDeltaSnapshot } from './layoutDeltaStore'
import { adoptFamilyStrokes, familyOfSyllable } from '../src/utils/jamoContextStrokes'
import { withFrameFrom, withoutFrame } from '../src/utils/jamoFrame'
import { componentProtrusion } from '../src/services/notoComponentFit'
import { PART_COLOR, PART_LABEL } from './partColors'
import { useJamoStore } from '../src/stores/jamoStore'
import { useLayoutStore } from '../src/stores/layoutStore'
import { moveHandle, movePoint, moveStroke, scaleStroke } from '../src/services/editorCommands'
import { scaleLayoutParts, translateLayoutParts } from '../src/services/layoutProfileCommands'
import { getRenderedStrokeTargets } from '../src/services/mobileEditorContext'
import { LayoutContextCards } from './LayoutContextCards'
import { corpusIdentity } from './notoCorpus'
import { useUnifiedTrackpad } from '../src/features/mobile-editor/useUnifiedTrackpad'
import { calculateBoxes } from '../src/utils/layoutCalculator'
import { decomposeSyllable } from '../src/utils/hangulUtils'
import { pointsToSvgD } from '../src/utils/pathUtils'
import { addHandlesToPoint, mergeStrokes, pointHasHandles, removeHandlesFromPoint, splitStroke } from '../src/utils/strokeEditUtils'
import { MERGE_PROXIMITY } from '../src/utils/snapUtils'
import type {
  BoxConfig,
  StrokeRenderStyle,
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
import { findMaximumSafeEditFactor, getMinimumInterComponentInkGap } from './inkGapGuard'
import {
  findJamoInkGapViolation,
  findLayoutInkGapViolation,
  type CalibrationInkGapContext,
  type CalibrationInkGapViolation,
} from './calibrationInkGap'
import { resolveSyllableContextualInkSafety, withContextualInkSafety } from '../src/utils/contextualInkSafety'
import { centeredDesignBodyPadding, paddingToDesignBody } from './designBody'
import { useFontExportStore } from './fontExportStore'
import { useGlobalStyleStore, type GlobalStyle } from '../src/stores/globalStyleStore'
import { BrushStyleTrackpad } from './BrushStyleTrackpad'
import { GlobalStyleTrackpad, type GlobalStylePanel } from './GlobalStyleTrackpad'
import { GRID_SYSTEM_2_STROKE_UNITS, GRID_SYSTEM_2_UNIT } from '../src/services/gridSystem2Geometry'
import { ShapeRulePanel } from './ShapeRulePanel'
import { MobileWorkspaceShell } from './workspace/WorkspaceChrome'
import { useUIStore } from '../src/stores/uiStore'

/** 어느 껍데기 안에 그릴지. standalone = 옛 `/` 전체 화면, workspace = 셸 자소 탭 안. */
export type EditorChrome = 'standalone' | 'workspace'

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
/** 검수 캔버스와 같은 여백. 글자 칸(0–1) 밖 0.08씩 더 보여 라벨·튀어나온 획이 잘리지 않는다. */
const CANVAS_VIEWPORT = { x: -0.08, y: -0.08, width: 1.16, height: 1.16 }

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

/** 캔버스 직접 끌기가 조절판과 같은 이동 계산을 쓰게 하는 문. `change`의 단위는 조절판과 같다(1 = 상자 좌표 0.001). */
type StrokeDragApi = { begin: () => void; change: (movement: StrokeMoveDelta) => void; commit: () => void; cancel: () => void }
/** 끌기로 치는 최소 거리(px). 이보다 짧으면 누르기다. */
const DRAG_THRESHOLD_PX = 3

/** `pastGapLimit`: 사용자가 최소 잉크 간격의 걸림을 밀고 넘어간 미리보기. 문맥 안전 보정(자동 되당김)을 얹지 않는다. */
type PreviewJamo = { type: JamoData['type']; char: string; data: JamoData; baseline?: JamoData; pastGapLimit?: boolean }
/** 최소 잉크 간격에 걸린 자리에서 이만큼(em) 더 끌어야 넘어간다. 한 번 "탁" 걸리는 세기. */
const GAP_STICK_EM = 0.05
type PreviewSchema = { layoutType: LayoutType; schema: LayoutSchema }
type SelectedPoint = { strokeId: string; pointIndex: number }
type HistoryEntry =
  | {
      kind: 'layout'
      layoutType: LayoutType
      beforeOverrides: LayoutSchema['userPartOverrides']
      afterOverrides: LayoutSchema['userPartOverrides']
      edit: SampleGlyphEdit
    }
  | { kind: 'jamo'; jamoType: JamoData['type']; char: string; before: JamoData; after: JamoData; edit: SampleGlyphEdit }
  | { kind: 'brush'; before: StrokeRenderStyle; after: StrokeRenderStyle }
  // 레이아웃 모드에서 적용·지운 배치 Δ. 저장소 앞뒤를 통째로 든다.
  | { kind: 'layoutDelta'; before: LayoutDeltaSnapshot; after: LayoutDeltaSnapshot }

/** 자소 탭 편집 모드. 획 = 점·획·자소 형태, 레이아웃 = 기준선으로 배치(Δ 저장). */
type EditMode = 'stroke' | 'layout'
// 자소 탭은 레이아웃이 기본이다. `&mode=stroke`(+ `&part=CH|JU|JO`)만 획 편집을 바로 연다. 옛 `&mode=layout`은 기본과 같다.
const initialEditMode = (): EditMode => new URLSearchParams(window.location.search).get('mode') === 'stroke' ? 'stroke' : 'layout'
const initialStrokePart = (): MobileEditorPart | null => {
  const params = new URLSearchParams(window.location.search)
  const part = params.get('part')
  return params.get('mode') === 'stroke' && (part === 'CH' || part === 'JU' || part === 'JO') ? part : null
}

function isEditableHangul(char: string): boolean {
  const code = char.codePointAt(0) ?? 0
  const isPrecomposedSyllable = code >= 0xac00 && code <= 0xd7a3
  const isCompatibilityJamo = code >= 0x3131 && code <= 0x3163
  return isPrecomposedSyllable || isCompatibilityJamo
}

/** `?char=염`처럼 다른 탭에서 글자를 들고 들어오면 그 글자로 연다. 문장에 없으면 앞에 붙인다. `&solo=1`(검수 격자에서 글자를 눌러 들어올 때)이면 문장에 그 글자 하나만 올린다. */
function initialFocus(): { char: string; sentence: string; custom: boolean } {
  const params = new URLSearchParams(window.location.search)
  const requested = [...(params.get('char') ?? '')][0]
  const base = SAMPLE_SENTENCES[0]
  // 그냥 들어오면 문장 첫 글자를 잡는다. 문장에 없는 글자를 포커스한 채 열지 않는다.
  if (!requested || !isEditableHangul(requested)) return { char: [...base].find(isEditableHangul) ?? [...base][0], sentence: base, custom: false }
  if (params.get('solo') === '1') return { char: requested, sentence: requested, custom: true }
  if ([...base].includes(requested)) return { char: requested, sentence: base, custom: false }
  return { char: requested, sentence: `${requested} ${base}`, custom: true }
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

const editorPartOf = (part: Part): MobileEditorPart => part === 'CH' ? 'CH' : part === 'JO' ? 'JO' : 'JU'
/** `획 고치기`로 잠긴 동안 고치지 않는 자소의 잉크 농도. */
const LOCKED_OUT_OPACITY = 0.22

function layoutAreaLabel(part: MobileEditorPart): string {
  if (part === 'CH') return '초성'
  if (part === 'JU') return '중성'
  return '종성'
}

/** 부품 상자. 검수 캔버스 GhostCanvas와 같은 색·농도·라벨. 선택 부품만 제 색, 나머지는 옅게. 선택이 없으면 전부 제 색. */
function PartBoxes({ boxes, activePart }: { boxes: Partial<Record<Part, BoxConfig>>; activePart: MobileEditorPart | null }) {
  return <g aria-hidden="true" data-testid="jamo-part-boxes">
    {(Object.entries(boxes) as [Part, BoxConfig][]).map(([part, box]) => {
      const active = !activePart || editorPartOf(part) === activePart
      const color = PART_COLOR[part]
      return <g key={part} data-part={part} data-active={active}>
        <rect x={box.x * VIEW_BOX_SIZE} y={box.y * VIEW_BOX_SIZE} width={box.width * VIEW_BOX_SIZE} height={box.height * VIEW_BOX_SIZE} fill={color} fillOpacity={active ? 0.24 : 0.07} stroke={color} strokeOpacity={active ? 0.85 : 0.25} strokeWidth={active ? 0.4 : 0.3} />
        <text x={box.x * VIEW_BOX_SIZE + 0.8} y={box.y * VIEW_BOX_SIZE - 0.8} fontSize={2.4} fontWeight={600} fill={color} fillOpacity={active ? 0.9 : 0.35} className={styles.partBoxLabel}>{PART_LABEL[part]}</text>
      </g>
    })}
  </g>
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
  layoutHighlight,
  globalStyle,
}: {
  char: string
  size: number
  maps: { choseong: Record<string, JamoData>; jungseong: Record<string, JamoData>; jongseong: Record<string, JamoData> }
  schemas: Record<LayoutType, LayoutSchema>
  globalPadding: Padding
  paddingOverrides: Partial<Record<LayoutType, Partial<Padding>>>
  previewJamo: PreviewJamo | null
  previewSchema: PreviewSchema | null
  layoutHighlight: { layoutType: LayoutType; parts: Part[]; source: boolean } | null
  globalStyle: GlobalStyle
}) {
  const decomposed = withPreviewJamo(decomposeSyllable(char, maps.choseong, maps.jungseong, maps.jongseong), previewJamo)
  const schema = previewSchema?.layoutType === decomposed.layoutType
    ? previewSchema.schema
    : schemas[decomposed.layoutType]
  const effectivePadding = { ...globalPadding, ...paddingOverrides[decomposed.layoutType] }
  const effectiveSchema = { ...schema, padding: effectivePadding, designBodyPadding: effectivePadding }
  const viewportBox = {
    x: effectiveSchema.padding.left,
    y: 0,
    width: 1 - effectiveSchema.padding.left - effectiveSchema.padding.right,
    height: 1,
  }
  // 배치는 칸 해석 함수(모델 상자)가 우선, 못 풀면 스키마.
  const { placement } = useContextPlacement(decomposed, effectiveSchema, globalStyle)
  const boxes = layoutHighlight?.layoutType === decomposed.layoutType
    ? placement.kind === 'boxes' ? placement.boxes : calculateBoxes(effectiveSchema, {
      cho: decomposed.choseong?.char ?? '',
      jung: decomposed.jungseong?.char ?? '',
      jong: decomposed.jongseong?.char ?? '',
    })
    : null
  return <SvgRenderer syllable={decomposed} schema={placement.kind === 'schema' ? placement.schema : undefined} boxes={placement.kind === 'boxes' ? placement.boxes : undefined} viewportBox={viewportBox} size={size} overflow="visible" clipGlyphs={false} globalStyle={globalStyle}>
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
  lockedPart = null,
  dragApiRef,
  gapWarning = false,
  fontSpace,
  grid,
  designBody,
  globalStyle,
}: {
  char: string
  syllable: DecomposedSyllable
  schema: LayoutSchema
  selection: Selection
  /** `획 고치기`로 들어온 자소. 이 자소의 획만 잡히고 나머지는 흐리게 그린다. */
  lockedPart?: MobileEditorPart | null
  /** 주면 잡은 점 · 핸들 · 획을 캔버스에서 바로 끈다(셸 안). 없으면 누르기로 고르기만 한다. */
  dragApiRef?: RefObject<StrokeDragApi | null>
  /** 고친 자소가 옆 자소에 최소 간격보다 가깝게(그리고 고치기 전보다 더) 붙었다. 캔버스 바탕에 색을 깔아 알린다. */
  gapWarning?: boolean
  onSelect: (selection: Selection) => void
  selectedPoints: SelectedPoint[]
  onPointSelect: (selection: Extract<Selection, { kind: 'point' }>) => void
  fontSpace: { unitsPerEm: number }
  grid: { majorDivisions: number; minorInterval: number }
  designBody: { x: number; y: number; width: number; height: number }
  globalStyle: GlobalStyle
}) {
  // 배치는 칸 해석 함수(모델 상자)가 우선, 못 풀면 스키마. 획 겨냥·편집 오버레이도 같은 상자를 쓴다.
  const { placement, resolution } = useContextPlacement(syllable, schema, globalStyle)
  const boxes = useMemo(() => placement.kind === 'boxes' ? placement.boxes : calculateBoxes(schema, {
    cho: syllable.choseong?.char ?? '',
    jung: syllable.jungseong?.char ?? '',
    jong: syllable.jongseong?.char ?? '',
  }), [placement, schema, syllable])
  const targets = useMemo(() => getRenderedStrokeTargets(syllable, boxes), [boxes, syllable])
  // 화면에 보이는 부품 상자는 레이아웃 모드와 같은 잉크 바깥면이다. 획을 놓는 `boxes`는 두께 절반만큼 안쪽인 중심선 상자라 그대로 그리면 잉크가 상자를 뚫고 나온다.
  const inkBoxes = useMemo(() => placement.kind === 'boxes' && resolution
    ? Object.fromEntries(resolution.parts.map((part) => [part.part, facesToBox(part.faces)])) as Partial<Record<Part, BoxConfig>>
    : boxes, [placement, resolution, boxes])
  // Noto 고스트: 표시·비교 전용. 잉크에 안 섞인다. 켬/끔은 기기에 기억한다.
  const [ghostVisible, setGhostVisible] = useState(loadGhostVisible)
  const { ghost, error: ghostError } = useNotoGhost(char, ghostVisible)
  const comparison = useGhostComparison(ghost, syllable, placement, globalStyle)
  const toggleGhost = () => setGhostVisible((current) => { saveGhostVisible(!current); return !current })
  const selectedPart = selection.kind === 'none' ? null : selection.editorPart
  const selectedStrokeId = selection.kind === 'stroke' || selection.kind === 'point' || selection.kind === 'handle'
    ? selection.strokeId
    : null
  // 검수 캔버스와 같은 규칙: 잉크는 전부 제 색, 어느 부품을 잡았는지는 부품 상자 농도로만 보인다.
  // `획 고치기`로 들어왔을 때만 다르다 — 고치는 자소만 제 색이고 나머지는 흐리다. 글자는 제자리 그대로다.
  const partStyles = useMemo(() => lockedPart
    ? Object.fromEntries((['CH', 'JU', 'JU_H', 'JU_V', 'JO'] as Part[]).filter((part) => editorPartOf(part) !== lockedPart).map((part) => [part, { opacity: LOCKED_OUT_OPACITY }])) as Partial<Record<Part, { opacity: number }>>
    : undefined, [lockedPart])
  const canvasStyle = {
    '--construction-band-size': `${GRID_SYSTEM_2_UNIT * GRID_SYSTEM_2_STROKE_UNITS * 100}%`,
  } as CSSProperties
  // 눈금·글자몸 상자는 SVG 안에 그린다. 검수 캔버스처럼 글자 칸 밖 여백(-0.08)까지 보이고 라벨이 잘리지 않는다.
  // 직접 끌기. 누른 자리에서 고르기가 먼저 일어나고(리렌더), 문턱을 넘는 첫 움직임에 이동을 시작한다 — 그때의 `dragApiRef`는 새 선택을 안다.
  const canvasRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ pointerId: number; startX: number; startY: number; box: BoxConfig; started: boolean } | null>(null)
  const startDrag = (event: ReactPointerEvent<SVGElement>, box: BoxConfig) => {
    if (!dragApiRef || !canvasRef.current) return
    drag.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, box, started: false }
    canvasRef.current.setPointerCapture(event.pointerId)
  }
  const moveDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = drag.current
    const api = dragApiRef?.current
    const canvas = canvasRef.current
    if (!state || !api || !canvas || event.pointerId !== state.pointerId) return
    const dx = event.clientX - state.startX
    const dy = event.clientY - state.startY
    if (!state.started) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return
      state.started = true
      api.begin()
    }
    // 화면 px → 글자 칸(em) → 그 획이 놓인 상자 좌표. 그래야 점이 손가락을 따라온다.
    const emPerPx = CANVAS_VIEWPORT.width / canvas.getBoundingClientRect().width
    api.change({ x: dx * emPerPx / state.box.width / 0.001, y: dy * emPerPx / state.box.height / 0.001 })
  }
  const endDrag = (event: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const state = drag.current
    if (!state || event.pointerId !== state.pointerId) return
    drag.current = null
    if (canvasRef.current?.hasPointerCapture(event.pointerId)) canvasRef.current.releasePointerCapture(event.pointerId)
    if (!state.started) return
    if (cancelled) dragApiRef?.current?.cancel()
    else dragApiRef?.current?.commit()
  }
  const minorStep = grid.minorInterval / fontSpace.unitsPerEm * VIEW_BOX_SIZE
  const majorStep = VIEW_BOX_SIZE / grid.majorDivisions
  const body = { x: designBody.x / fontSpace.unitsPerEm * VIEW_BOX_SIZE, y: designBody.y / fontSpace.unitsPerEm * VIEW_BOX_SIZE, width: designBody.width / fontSpace.unitsPerEm * VIEW_BOX_SIZE, height: designBody.height / fontSpace.unitsPerEm * VIEW_BOX_SIZE }

  return (
    <div ref={canvasRef} className={styles.focusCanvas} style={canvasStyle} data-testid="focus-canvas" data-placement={placement.kind} data-direct={dragApiRef ? true : undefined} data-gap-warning={gapWarning ? true : undefined} onPointerDown={() => onSelect({ kind: 'none' })} onPointerMove={moveDrag} onPointerUp={(event) => endDrag(event, false)} onPointerCancel={(event) => endDrag(event, true)}>
      {globalStyle.strokeStyle.mode === 'legacy-snapped-centerline' && <span className={styles.constructionGrid} aria-hidden="true" data-construction-grid="legacy-snapped-centerline" />}
      <SvgRenderer syllable={syllable} schema={placement.kind === 'schema' ? placement.schema : undefined} boxes={placement.kind === 'boxes' ? placement.boxes : undefined} size={340} viewportBox={CANVAS_VIEWPORT} className={styles.focusSvg} partStyles={partStyles} globalStyle={globalStyle} underlay={<>
        {/* 검수 캔버스(GhostCanvas)와 같은 깔개: 흰 칸 → 1/16 잔선·1/4 굵은선 눈금 → 칸 테두리 → 글자몸 → 기준선(0.88) → 부품 상자 → Noto 고스트. 전부 잉크 아래. */}
        <defs>
          <pattern id="jamo-grid-fine" width={minorStep} height={minorStep} patternUnits="userSpaceOnUse"><path d={`M${minorStep} 0V${minorStep}H0`} fill="none" stroke="rgb(218 223 230 / .7)" strokeWidth={0.2} /></pattern>
          <pattern id="jamo-grid-coarse" width={majorStep} height={majorStep} patternUnits="userSpaceOnUse"><path d={`M${majorStep} 0V${majorStep}H0`} fill="none" stroke="rgb(196 203 212 / .8)" strokeWidth={0.3} /></pattern>
        </defs>
        <rect x={0} y={0} width={VIEW_BOX_SIZE} height={VIEW_BOX_SIZE} fill="#fff" />
        <rect x={0} y={0} width={VIEW_BOX_SIZE} height={VIEW_BOX_SIZE} fill="url(#jamo-grid-fine)" data-testid="jamo-grid" />
        <rect x={0} y={0} width={VIEW_BOX_SIZE} height={VIEW_BOX_SIZE} fill="url(#jamo-grid-coarse)" />
        <rect x={0} y={0} width={VIEW_BOX_SIZE} height={VIEW_BOX_SIZE} fill="none" stroke="rgb(196 203 212)" strokeWidth={0.4} />
        <rect x={body.x} y={body.y} width={body.width} height={body.height} fill="none" stroke="rgb(59 111 214 / .18)" strokeWidth={0.3} data-testid="jamo-design-body" />
        <line x1={-6} x2={102} y1={88} y2={88} stroke="#a6a297" strokeWidth={0.3} />
        <PartBoxes boxes={inkBoxes} activePart={selectedPart} />
        {ghostVisible && ghost && <path d={ghost.path} className={styles.notoGhost} fillRule="evenodd" data-testid="noto-ghost" />}
      </>}>
        {targets.map((target) => {
          // 잠긴 동안 다른 자소는 눌리지 않는다. 잠긴 자소의 획은 자소 통째 선택을 거치지 않고 바로 잡힌다.
          if (lockedPart && target.editorPart !== lockedPart) return null
          const path = pointsToSvgD(target.stroke.points, target.stroke.closed, target.box, VIEW_BOX_SIZE)
          const component = componentFor(char, target.editorPart, target.jamo)
          const sameComponent = lockedPart !== null || selectedPart === target.editorPart
          return <path
            key={`hit-${target.renderPart}-${target.stroke.id}`}
            d={path}
            fill="none"
            stroke={selectedStrokeId === target.stroke.id ? 'rgb(var(--color-primary) / .3)' : 'transparent'}
            strokeWidth={Math.max(12, target.stroke.thickness * VIEW_BOX_SIZE + 8)}
            pointerEvents="stroke"
            data-editor-hit="stroke"
            data-selected={selectedStrokeId === target.stroke.id ? 'true' : undefined}
            onPointerDown={(event) => {
              event.stopPropagation()
              if (sameComponent) {
                onSelect({ kind: 'stroke', component, editorPart: target.editorPart, renderPart: target.renderPart, jamo: target.jamo, strokeId: target.stroke.id, box: target.box })
                startDrag(event, target.box)
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
              startDrag(event, target.box)
          }
          return <g key={`point-${target.renderPart}-${target.stroke.id}-${pointIndex}`}>
            <circle cx={x} cy={y} r={7.5} fill="transparent" pointerEvents="all" className={styles.pointHitTarget} data-editor-point="hit" onPointerDown={selectPoint} />
            <circle cx={x} cy={y} r={active ? 2.8 : 2.1} className={active ? styles.activePoint : styles.point} data-editor-point="visible" pointerEvents="none" />
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
                  startDrag(event, target.box)
                }}
              />,
            ]
          })
        })}
      </SvgRenderer>
      <span className={styles.focusChar} aria-hidden="true">{char} · {fontSpace.unitsPerEm} UPM</span>
      <DevGhostToggle pressed={ghostVisible} onToggle={toggleGhost} testId="noto-ghost-toggle">
        {ghostVisible && comparison && ('xorRatio' in comparison
          ? <strong data-testid="noto-ghost-xor">xor {(comparison.xorRatio * 100).toFixed(0)}%</strong>
          : <small>{comparison.message}</small>)}
        {ghostVisible && ghostError && <small>{ghostError}</small>}
      </DevGhostToggle>
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
  dragApiRef,
  multiSelectArmed = false,
  frameForEdit,
  partBoxes,
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
  onCommitJamo: (before: JamoData, after: JamoData, raw: RawGlyphEdit, options?: { unframed?: boolean; pastGapLimit?: boolean }) => void
  /** 지금 글자의 부품 상자(중심선 상자). 튀어나온 양을 em으로 바꿀 때 쓴다 — 선택이 들고 있는 상자는 고친 뒤 낡을 수 있다. */
  partBoxes?: Partial<Record<Part, BoxConfig>>
  /** 고치는 중의 자모에 기준 틀을 굳혀 돌려준다. 끄는 동안의 간격 계산이 놓은 뒤와 같은 배치를 보게 한다. */
  frameForEdit?: (jamo: JamoData) => JamoData
  onCommitSchema: (before: LayoutSchema, after: LayoutSchema, raw: RawGlyphEdit) => void
  onCancel: () => void
  onSelectionChange: (selection: Selection) => void
  onInkGapLimitChange: (violation: CalibrationInkGapViolation | null) => void
  onMultiSelectArmedChange: (armed: boolean) => void
  /** 주면 조절판 대신 도구 줄을 그리고, 이동 계산을 캔버스 직접 끌기에 내준다(셸 안). */
  dragApiRef?: RefObject<StrokeDragApi | null>
  /** 직접 조작에서 `여러 점` 토글이 켜져 있는지. 상태는 부모가 든다. */
  multiSelectArmed?: boolean
}) {
  const direct = Boolean(dragApiRef)
  const startSchema = useRef(schema)
  const currentSchema = useRef(schema)
  const startJamo = useRef<JamoData | null>(null)
  const currentJamo = useRef<JamoData | null>(null)
  const currentDelta = useRef<StrokeMoveDelta>({ x: 0, y: 0 })
  const currentScale = useRef<StrokeScale>({ x: 1, y: 1 })
  // 직접 조작에서는 최소 잉크 간격이 막지 않고 알린다: 걸린 자리에서 한 번 붙들고, 더 끌면 넘어간다.
  const pastGapLimit = useRef(false)
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
    pastGapLimit.current = false
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
        const moved = selection.kind === 'stroke'
          ? moveStroke(startJamo.current!, selection.strokeId, movementAtFactor, CALIBRATION_FREEFORM_BOUNDS, snapStep)
          : selection.kind === 'point'
            ? moveSelectedPoints(startJamo.current!, movementAtFactor)
            : selection.kind === 'handle'
              ? moveHandle(startJamo.current!, selection.strokeId, selection.pointIndex, selection.handle, movementAtFactor, CALIBRATION_FREEFORM_BOUNDS, snapStep)
              : null
        return moved && frameForEdit ? { ...moved, jamo: frameForEdit(moved.jamo) } : moved
      }
      const safeFactor = findMaximumSafeEditFactor((factor) => {
        const candidate = createCandidate(factor)
        return !candidate || !jamoInkGapViolation(candidate.jamo)
      })
      const held = createCandidate(safeFactor)
      if (!held) return
      const requested = createCandidate(1)
      const limited = safeFactor < 0.9999 && Boolean(requested)
      // 걸린 자리(held)에서 요청 자리까지의 거리(em). 여유가 있던 글자에서만 붙든다 — 처음부터 좁은 글자는 붙들 자리가 출발점이라 끌기가 먹통처럼 느껴진다.
      const overshoot = limited && requested ? Math.hypot((requested.delta.x - held.delta.x) * selection.box.width, (requested.delta.y - held.delta.y) * selection.box.height) : 0
      const past = direct && limited && Boolean(requested) && (safeFactor < 0.02 || overshoot > GAP_STICK_EM)
      const result = past && requested ? requested : held
      pastGapLimit.current = past
      currentJamo.current = result.jamo
      setDelta(result.delta)
      currentDelta.current = result.delta
      updateInkGapLimiter(limited && requested ? jamoInkGapViolation(requested.jamo) : null)
      onPreviewJamo({ type: selection.jamo.type, char: selection.jamo.char, data: result.jamo, baseline: startJamo.current, pastGapLimit: past })
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
      onCommitJamo(startJamo.current, currentJamo.current, raw, { pastGapLimit: pastGapLimit.current })
      pastGapLimit.current = false
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
    const before = structuredClone(adoptFamilyStrokes(getJamo(selection.jamo.type, selection.jamo.char) ?? selection.jamo, familyOfSyllable(syllable)))
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
    const before = structuredClone(adoptFamilyStrokes(getJamo(selection.jamo.type, selection.jamo.char) ?? selection.jamo, familyOfSyllable(syllable)))
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
    const before = structuredClone(adoptFamilyStrokes(getJamo(selection.jamo.type, selection.jamo.char) ?? selection.jamo, familyOfSyllable(syllable)))
    const after = updateJamoStroke(updateJamoStroke(before, selectedStroke.id, () => merged), mergeTarget.id, () => null)
    onCommitJamo(before, after, { kind: 'stroke-move', glyph, component: selection.component, jamoType: selection.jamo.type, strokeId: selectedStroke.id, delta: { x: 0, y: 0 } })
    onSelectionChange({ ...selection, kind: 'stroke', strokeId: selectedStroke.id, jamo: after })
  }
  const disconnectStroke = () => {
    if ((selection.kind !== 'point' && selection.kind !== 'handle') || !selectedStroke || !canDisconnect) return
    const before = structuredClone(adoptFamilyStrokes(getJamo(selection.jamo.type, selection.jamo.char) ?? selection.jamo, familyOfSyllable(syllable)))
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
    const before = structuredClone(adoptFamilyStrokes(getJamo(selection.jamo.type, selection.jamo.char) ?? selection.jamo, familyOfSyllable(syllable)))
    const after = selection.kind === 'point' || selection.kind === 'handle'
      ? updateJamoStroke(before, selectedStroke.id, (stroke) => ({ ...stroke, points: stroke.points.filter((_, index) => index !== selection.pointIndex) }))
      : updateJamoStroke(before, selectedStroke.id, () => null)
    onCommitJamo(before, after, { kind: selection.kind === 'stroke' ? 'stroke-move' : 'point-move', glyph, component: selection.component, jamoType: selection.jamo.type, strokeId: selectedStroke.id, ...(selection.kind === 'stroke' ? {} : { pointIndex: selection.pointIndex }), delta: { x: 0, y: 0 } } as RawGlyphEdit)
    onSelectionChange({ ...selection, kind: 'stroke', strokeId: selection.kind === 'stroke' ? getJamoStrokes(after)[0]?.id ?? selectedStroke.id : selectedStroke.id, jamo: after })
  }

  const trackpad = useUnifiedTrackpad({
    enabled: selection.kind !== 'none',
    scaleEnabled: selection.kind === 'component' || selection.kind === 'stroke',
    onMoveStart: beginMove,
    onMoveChange: changeMove,
    onMoveCommit: commitMove,
    onScaleStart: beginScale,
    onScaleChange: changeScale,
    onScaleCommit: commitScale,
    onCancel: cancel,
  })
  useEffect(() => {
    // 직접 조작에서는 `여러 점` 토글이 이 상태를 든다. 조절판에 손가락을 대는 방식은 조절판이 있을 때만.
    if (direct) return
    onMultiSelectArmedChange(trackpad.visualState.mode === 'pending' && trackpad.visualState.points.length === 1)
  }, [direct, onMultiSelectArmedChange, trackpad.visualState.mode, trackpad.visualState.points.length])
  // 캔버스 끌기는 늘 지금 선택을 아는 최신 계산을 불러야 한다.
  useEffect(() => {
    if (!dragApiRef) return
    dragApiRef.current = { begin: beginMove, change: changeMove, commit: commitMove, cancel }
  })
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

  if (direct) {
    const editable = selection.kind === 'stroke' || selection.kind === 'point' || selection.kind === 'handle'
    const onPoint = selection.kind === 'point' || selection.kind === 'handle'
    const directLabel = selection.kind === 'none'
      ? '고칠 획을 누르세요'
      : `${selection.kind === 'stroke' ? `${selection.jamo.char}의 획` : selection.kind === 'handle' ? `${selection.jamo.char}의 곡선 핸들` : selection.kind === 'point' ? `${selection.jamo.char}의 점` : ''} · 캔버스에서 끌어 옮기기${selectedPoints.length > 1 ? ` · 점 ${selectedPoints.length}개 함께` : ''}${inkGapLimiter ? pastGapLimit.current ? ` · ${inkGapLimiter.char}에서 옆 자소에 너무 붙음` : ` · ${inkGapLimiter.char}에서 최소 간격 · 더 끌면 넘어감` : ''}`
    // 기준 틀이 굳은 자모만: 틀 밖으로 나간 양(u)과 `틀 다시 맞추기`. 튀어나옴은 저장값이 아니라 여기서 계산한다.
    const liveJamo = editable ? activeVisibleJamo ?? selection.jamo : null
    const protrusion = editable && liveJamo?.frame
      ? componentProtrusion({ jamo: liveJamo, channel: selection.renderPart === 'JU_H' ? 'horizontalStrokes' : selection.renderPart === 'JU_V' ? 'verticalStrokes' : undefined, family: selection.editorPart === 'JU' ? null : familyOfSyllable(syllable) }, partBoxes?.[selection.renderPart] ?? selection.box)
      : null
    const protrusionLabel = protrusion
      ? ([['위', protrusion.top], ['아래', protrusion.bottom], ['왼쪽', protrusion.left], ['오른쪽', protrusion.right]] as const).filter(([, amount]) => Math.round(amount * unitsPerEm) >= 1).map(([side, amount]) => `${side} +${Math.round(amount * unitsPerEm)}u`).join(' · ')
      : ''
    const resetFrame = () => {
      if (!editable) return
      const before = structuredClone(adoptFamilyStrokes(getJamo(selection.jamo.type, selection.jamo.char) ?? selection.jamo, familyOfSyllable(syllable)))
      if (!before.frame) return
      onCommitJamo(before, withoutFrame(before), { kind: 'stroke-move', glyph, component: selection.component, jamoType: selection.jamo.type, strokeId: selection.strokeId, delta: { x: 0, y: 0 } }, { unframed: true })
    }
    // 자리가 흔들리지 않게 단추는 늘 같은 여섯 개를 그리고, 못 쓰는 것은 끈다.
    return (
      <section className={styles.strokeToolSection} data-testid="jamo-stroke-tools">
        <p className={styles.strokeToolStatus}><span>{directLabel}</span><output>x {Math.round(delta.x * unitsPerEm)} · y {Math.round(delta.y * unitsPerEm)}</output></p>
        {/* 줄은 늘 자리를 차지한다 — 틀이 굳는 순간 도구 줄이 밀리면 캔버스가 흔들린다. */}
        <p className={styles.strokeFrameStatus} data-testid="jamo-frame-status" data-framed={liveJamo?.frame ? true : undefined}>
          {liveJamo?.frame && <>
            <span data-protruding={protrusionLabel ? true : undefined}>{protrusionLabel ? `상자 밖 ${protrusionLabel}` : '틀 안 · 획을 끌어도 다른 획은 제자리'}</span>
            <button type="button" onClick={resetFrame} data-testid="jamo-frame-reset">틀 다시 맞추기</button>
          </>}
        </p>
        <div className={styles.strokeToolRow} role="toolbar" aria-label="획 편집 도구">
          <button type="button" onClick={addStroke} disabled={!editable} aria-label="선 추가"><Plus size={18} aria-hidden="true" /><span>추가</span></button>
          <button type="button" onClick={deleteSelection} disabled={!canDelete} aria-label={selection.kind === 'stroke' ? '획 삭제' : '꼭짓점 삭제'}><Trash2 size={18} aria-hidden="true" /><span>삭제</span></button>
          <button type="button" onClick={toggleCurve} disabled={!onPoint} aria-label={selectedPointHasCurve ? '직선화' : '곡선화'}><Spline size={18} aria-hidden="true" /><span>{selectedPointHasCurve ? '직선' : '곡선'}</span></button>
          <button type="button" onClick={connectStroke} disabled={!mergeTarget} aria-label="가까운 선 연결"><Link2 size={18} aria-hidden="true" /><span>잇기</span></button>
          <button type="button" onClick={disconnectStroke} disabled={!canDisconnect} aria-label="선 끊기"><Unlink size={18} aria-hidden="true" /><span>끊기</span></button>
          <button type="button" onClick={() => onMultiSelectArmedChange(!multiSelectArmed)} disabled={!editable} aria-pressed={multiSelectArmed} aria-label="꼭짓점 여러 개 고르기"><CopyPlus size={18} aria-hidden="true" /><span>여러 점</span></button>
        </div>
      </section>
    )
  }

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

function DesignBodyControls({
  layoutType,
  fontSpace,
}: {
  layoutType: LayoutType
  fontSpace: { unitsPerEm: number; width: number; height: number }
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

  return <div className={styles.bodyControls} role="tabpanel" aria-label="글자 네모꼴 설정">
    <div className={styles.bodyScope} role="tablist" aria-label="네모꼴 적용 범위">
      <button type="button" role="tab" aria-selected={scope === 'font'} onClick={() => setScope('font')}>폰트 전체</button>
      <button type="button" role="tab" aria-selected={scope === 'layout'} onClick={selectLayoutScope}>현재 레이아웃</button>
    </div>
    <p><strong>{scope === 'font' ? '모든 레이아웃의 기본 네모꼴' : `${LAYOUT_LABELS[layoutType]}만 별도 적용`}</strong><span>Font Space {fontSpace.unitsPerEm}은 고정됩니다</span></p>
    <div className={styles.bodyDimensionGrid}>
      <label><span>가로 <output>{Math.round(body.width)}</output></span><input type="range" min="500" max="1000" step="5" value={Math.round(body.width)} onChange={(event) => updateBody('width', Number(event.target.value))} /></label>
      <label><span>세로 <output>{Math.round(body.height)}</output></span><input type="range" min="500" max="1000" step="5" value={Math.round(body.height)} onChange={(event) => updateBody('height', Number(event.target.value))} /></label>
    </div>
    <button type="button" className={styles.bodyReset} disabled={scope === 'layout' ? !layoutOverride : body.width === 850 && body.height === 850} onClick={() => scope === 'layout' ? removePaddingOverride(layoutType) : resetGlobalPadding()}>{scope === 'layout' ? '폰트 전체 설정 따르기' : '기본 850 × 850으로 되돌리기'}</button>
  </div>
}

export function CalibrationSentenceEditor({ chrome = 'standalone' }: { chrome?: EditorChrome } = {}) {
  const projectName = useUIStore((state) => state.currentProjectName) ?? '새 한글 폰트'
  const choseong = useJamoStore((state) => state.choseong)
  const jungseong = useJamoStore((state) => state.jungseong)
  const jongseong = useJamoStore((state) => state.jongseong)
  const schemas = useLayoutStore((state) => state.layoutSchemas)
  const globalPadding = useLayoutStore((state) => state.globalPadding)
  const paddingOverrides = useLayoutStore((state) => state.paddingOverrides)
  const globalStyle = useGlobalStyleStore((state) => state.style)
  const fontSpace = useCalibrationProjectStore((state) => state.fontSpace)
  const grid = useCalibrationProjectStore((state) => state.grid)
  const metrics = useCalibrationProjectStore((state) => state.metrics)
  const [focus] = useState(initialFocus)
  const [sampleSentence, setSampleSentence] = useState<string>(focus.sentence)
  const [selectedChar, setSelectedChar] = useState(focus.char)
  const [selection, setSelection] = useState<Selection>({ kind: 'none' })
  const [selectedPoints, setSelectedPoints] = useState<SelectedPoint[]>([])
  const [multiSelectArmed, setMultiSelectArmed] = useState(false)
  // 셸 안에서는 조절판 없이 캔버스에서 바로 끈다. 이동 계산은 도구 줄 컴포넌트(`InferenceTrackpad`)가 들고 이 ref로 캔버스에 내준다.
  const dragApiRef = useRef<StrokeDragApi | null>(null)
  const directManipulation = chrome === 'workspace'
  const [previewJamo, setPreviewJamo] = useState<PreviewJamo | null>(null)
  const [previewSchema, setPreviewSchema] = useState<PreviewSchema | null>(null)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [future, setFuture] = useState<HistoryEntry[]>([])
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const exportState = useFontExportStore((state) => state.status)
  const exportProgress = useFontExportStore((state) => state.progress)
  const exportCurrentFont = useFontExportStore((state) => state.request)
  const [inkGapLimiter, setInkGapLimiter] = useState<CalibrationInkGapViolation | null>(null)
  const [isDirectInputActive, setIsDirectInputActive] = useState(false)
  const [isCustomSentence, setIsCustomSentence] = useState(focus.custom)
  const [globalStylePanel, setGlobalStylePanel] = useState<GlobalStylePanel | null>(null)
  const [previewBrush, setPreviewBrush] = useState<StrokeRenderStyle | null>(null)
  const [isShapeRuleOpen, setIsShapeRuleOpen] = useState(false)
  const [editMode, setEditMode] = useState<EditMode>(initialEditMode)
  // `획 고치기`로 들어온 자소. 획 편집에서 선택을 푼 채 `완료`해도 레이아웃이 이 부품을 다시 켠다.
  const [strokeEntryPart, setStrokeEntryPart] = useState<MobileEditorPart | null>(initialStrokePart)
  // 획 편집에 들어온 순간의 기록 길이. `뒤로`는 여기까지 되돌린다.
  const [strokeEntryMark, setStrokeEntryMark] = useState(0)
  const [pendingStrokePart, setPendingStrokePart] = useState<MobileEditorPart | null>(initialStrokePart)
  // Undo/Redo로 저장된 Δ가 바뀌면 레이아웃 편집부를 새로 띄워 세션 편집(절대값)을 버린다.
  const [layoutEpoch, setLayoutEpoch] = useState(0)
  const directInputRef = useRef<HTMLTextAreaElement>(null)
  const isGlobalStyleOpen = globalStylePanel !== null
  const isBrushStyleOpen = globalStylePanel === 'brush'
  const maps = useMemo(() => ({ choseong, jungseong, jongseong }), [choseong, jungseong, jongseong])
  const previewGlobalStyle = useMemo(() => {
    const strokeStyle = previewBrush ?? globalStyle.strokeStyle
    return { ...globalStyle, strokeStyle, brush: strokeStyle.mode === 'brush' ? strokeStyle.brush : globalStyle.brush }
  }, [globalStyle, previewBrush])
  const baseSyllable = useMemo(() => decomposeSyllable(selectedChar, choseong, jungseong, jongseong), [selectedChar, choseong, jungseong, jongseong])
  const previewedSyllable = useMemo(() => withPreviewJamo(baseSyllable, previewJamo), [baseSyllable, previewJamo])
  const baseSchema = schemas[previewedSyllable.layoutType]
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
  // 간격은 화면이 글자를 놓는 상자로 잰다(모델 상자 + 레이아웃 Δ + 기준 틀). 옛 스키마 상자로 재면 자주 쓰는 글자의 92%에서 10u 넘게 어긋나고 셋 중 하나는 닿음 판정이 뒤집힌다(`ink-gap-box-parity.test.ts`).
  // 모델이 없거나 그 글자를 못 풀면 스키마 상자로 돌아간다. 독립 실행(`/calibration`)은 전과 같다.
  const { bundle: notoBundle, error: notoModelError } = useNotoModel()
  const layoutDeltaRules = useLayoutDeltaStore((state) => state.rules)
  const previewEnds = useMemo(() => ({ linecap: previewGlobalStyle.linecap, linejoin: previewGlobalStyle.linejoin }), [previewGlobalStyle.linecap, previewGlobalStyle.linejoin])
  const screenBoxesOf = useCallback((target: DecomposedSyllable, schema: LayoutSchema): Partial<Record<Part, BoxConfig>> => {
    const legacy = () => calculateBoxes(schema, { cho: target.choseong?.char ?? '', jung: target.jungseong?.char ?? '', jong: target.jongseong?.char ?? '' })
    if (chrome !== 'workspace' || !notoBundle) return legacy()
    const identity = identityOfSyllable(target)
    const { placement } = contextPlacementOf({ bundle: notoBundle, identity, syllable: target, schema, ends: previewEnds, delta: effectiveLayoutDelta({ rules: layoutDeltaRules }, identity) })
    return placement.kind === 'boxes' ? placement.boxes : legacy()
  }, [chrome, notoBundle, previewEnds, layoutDeltaRules])
  const measuresOnScreenBoxes = chrome === 'workspace' && Boolean(notoBundle)
  const syllable = useMemo(
    () => resolveSyllableContextualInkSafety(previewedSyllable, screenBoxesOf(previewedSyllable, effectiveSchema)).syllable,
    [effectiveSchema, previewedSyllable, screenBoxesOf],
  )
  // 레이아웃 모드는 글자가 모델 상자로 그려질 때만 뜻이 있다. 그때는 옛 경로(자소 통째 이동 → 스키마)가 글자에 안 닿으므로 셸 안에서는 끈다.
  const { placement, resolution: placementResolution } = useContextPlacement(syllable, effectiveSchema, previewGlobalStyle)
  // 레이아웃 모드는 모델이 있으면 열린다. 지금 획이 모델 상자에 맞는지(`placement.kind`)에 매지 않는다 —
  // 획을 고치다 맞춤이 깨지면(ㅡ를 곡선으로 → 상자가 획 두께보다 작음) 나가는 문(`완료`)까지 사라져 갇힌다.
  const layoutAvailable = chrome === 'workspace' && isEditableHangul(selectedChar) && (selectedChar.codePointAt(0) ?? 0) >= 0xac00 && !notoModelError
  // 모델은 왔는데 이 글자 획이 상자에 안 맞아 옛 배치(스키마)로 그리는 중. 이유를 말해 준다.
  const boxFitIssue = chrome === 'workspace' && notoBundle && placement.kind !== 'boxes' ? placementResolution?.issues[0] ?? null : null
  const isLayoutMode = editMode === 'layout' && layoutAvailable
  const schemaMoveLocked = chrome === 'workspace' && placement.kind === 'boxes'
  // 그 자소의 첫 획. `획 고치기`는 자소 통째 선택을 거치지 않고 이 상태로 열려 조절판이 바로 뜬다(혼합 홀자는 가로부 먼저).
  const firstStrokeSelectionOf = (part: MobileEditorPart): Selection | null => {
    const boxes = placement.kind === 'boxes' ? placement.boxes : focusedBoxes
    const target = getRenderedStrokeTargets(syllable, boxes).find((item) => item.editorPart === part)
    return target ? { kind: 'stroke', component: componentFor(selectedChar, part, target.jamo), editorPart: part, renderPart: target.renderPart, jamo: target.jamo, strokeId: target.stroke.id, box: target.box } : null
  }
  // 주소로 바로 연 획 편집(`&mode=stroke&part=`)은 첫 렌더에서 한 번 그 자소의 첫 획을 잡는다.
  if (pendingStrokePart) {
    setPendingStrokePart(null)
    const entry = firstStrokeSelectionOf(pendingStrokePart)
    if (entry) setSelection(entry)
  }
  // 획 편집에 잠긴 자소. 다른 자소는 눌리지 않고, 빈 곳을 눌러도 획은 잡힌 채다.
  const lockedPart = chrome === 'workspace' && !isLayoutMode ? strokeEntryPart : null
  // 왼쪽 표지에 그릴 자소. 끄는 중의 미리보기까지 담긴 `syllable`에서 꺼내 표지가 캔버스와 같이 움직인다.
  const strokeCardPart = lockedPart ?? (selection.kind !== 'none' ? selection.editorPart : null)
  const strokeCardJamo = strokeCardPart === 'CH' ? syllable.choseong : strokeCardPart === 'JU' ? syllable.jungseong : strokeCardPart === 'JO' ? syllable.jongseong : null
  const strokeCardInk = strokeCardPart && strokeCardJamo ? { part: strokeCardPart, jamo: strokeCardJamo } : null
  const snapStep = fontUnitsToNormalized(grid.snapInterval, fontSpace)
  const minimumInkGap = fontUnitsToNormalized(grid.minorInterval, fontSpace)
  // 간격 경고: 고친 자소(기준 틀이 굳은 것)가 이 글자에서 옆 자소에 최소 간격보다 가깝고, 고치기 전(틀 = 고치기 전 획)보다 더 붙었을 때. 프리셋이 원래 좁은 글자는 안 울린다.
  const gapWarning = useMemo(() => {
    if (chrome !== 'workspace' || placement.kind !== 'boxes') return false
    return (['CH', 'JU', 'JO'] as const).some((part) => {
      const jamo = part === 'CH' ? syllable.choseong : part === 'JU' ? syllable.jungseong : syllable.jongseong
      if (!jamo?.frame) return false
      const beforeJamo: JamoData = { ...jamo, ...jamo.frame }
      const beforeSyllable: DecomposedSyllable = part === 'CH' ? { ...syllable, choseong: beforeJamo } : part === 'JU' ? { ...syllable, jungseong: beforeJamo } : { ...syllable, jongseong: beforeJamo }
      const now = getMinimumInterComponentInkGap(syllable, placement.boxes, part)
      return now + 1e-6 < Math.min(minimumInkGap, getMinimumInterComponentInkGap(beforeSyllable, placement.boxes, part))
    })
  }, [chrome, minimumInkGap, placement, syllable])
  const sentenceEm = 24
  const calibrationLines = useMemo(() => [sampleSentence], [sampleSentence])
  // 셸 안(레이아웃 · 획 편집 둘 다)에서는 문장이 한 줄 가로 스크롤이다(아래 편집부에 세로 자리를 내준다). 고른 글자가 가려져 있으면 가로로만 끌어온다.
  const sentenceCompact = chrome === 'workspace'
  const sentenceRef = useRef<HTMLElement>(null)
  useEffect(() => {
    const section = sentenceRef.current
    const current = sentenceCompact ? section?.querySelector<HTMLElement>('button[aria-current="true"]') : null
    if (!section || !current) return
    const left = current.offsetLeft - 12
    const right = current.offsetLeft + current.offsetWidth + 100
    if (left < section.scrollLeft) section.scrollLeft = left
    else if (right > section.scrollLeft + section.clientWidth) section.scrollLeft = right - section.clientWidth
  }, [sentenceCompact, selectedChar, sampleSentence])
  const collisionContexts = useMemo<CalibrationInkGapContext[]>(() => {
    const contexts = calibrationLines.flatMap((line, lineIndex) => [...line].flatMap((char, charIndex): CalibrationInkGapContext[] => {
      if (!isEditableHangul(char)) return []
      const decomposed = decomposeSyllable(char, choseong, jungseong, jongseong)
      const base = schemas[decomposed.layoutType]
      const padding = { ...globalPadding, ...paddingOverrides[decomposed.layoutType] }
      const schema = { ...base, padding, designBodyPadding: padding }
      // 셸 안: 화면과 같은 상자로 잰다. 상자 풀기(자소 맞춤)는 비싸서 미루고, 간격 검사가 그 자모가 든 글자에서만 부른다.
      if (measuresOnScreenBoxes) return [{ id: `sentence-${lineIndex}-${charIndex}`, char, syllable: decomposed, schema, boxesOf: (target: DecomposedSyllable) => screenBoxesOf(target, schema) }]
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
      contexts.unshift({ id: 'focused', char: selectedChar, syllable, schema: effectiveSchema, boxesOf: measuresOnScreenBoxes ? (target: DecomposedSyllable) => screenBoxesOf(target, effectiveSchema) : undefined })
    }
    return contexts
  }, [calibrationLines, choseong, effectiveSchema, globalPadding, jungseong, jongseong, measuresOnScreenBoxes, paddingOverrides, schemas, screenBoxesOf, selectedChar, syllable])

  const chooseChar = (char: string) => {
    // 글자를 바꾸면 기본 상태(레이아웃)로 돌아간다.
    if (chrome === 'workspace') { setEditMode('layout'); setStrokeEntryPart(null) }
    setSelectedChar(char)
    setSelection({ kind: 'none' })
    setSelectedPoints([])
    setPreviewJamo(null)
    setPreviewSchema(null)
    setInkGapLimiter(null)
  }
  // 예시 글자 카드를 누르면 그 글자를 열고 문장에는 그 글자 하나만 올린다. 예시 문장은 주사위로 돌아온다.
  const openSoloChar = (char: string) => {
    setSampleSentence(char)
    setIsCustomSentence(true)
    chooseChar(char)
  }
  const selectFromCanvas = (requested: Selection) => {
    let nextSelection = requested
    if (lockedPart) {
      if (requested.kind === 'none') {
        // 빈 곳: 점 선택만 풀고 그 획은 잡은 채로 둔다.
        if (selection.kind !== 'point' && selection.kind !== 'handle') return
        nextSelection = { kind: 'stroke', component: selection.component, editorPart: selection.editorPart, renderPart: selection.renderPart, jamo: selection.jamo, strokeId: selection.strokeId, box: selection.box }
      } else if (requested.editorPart !== lockedPart) return
    }
    // 모델 상자로 그리는 글자는 자소를 통째로 옮겨도(옛 스키마 저장) 글자에 안 닿는다. 자소를 누르면 통째 선택 대신 그 첫 획을 잡는다 — 자리는 레이아웃에서 고친다.
    if (schemaMoveLocked && nextSelection.kind === 'component') nextSelection = firstStrokeSelectionOf(nextSelection.editorPart) ?? nextSelection
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
      // 걸림을 밀고 넘어간 미리보기는 되당기지 않는다 — 넘어간 만큼 그대로 보여야 한다.
      data: preview.pastGapLimit ? withoutInkSafety(frameForEdit(preview.data)) : withContextualInkSafety(stored, preview.baseline ?? preview.data, frameForEdit(preview.data), minimumInkGap),
    })
  }
  // 기준 틀은 처음 고치는 순간에 굳는다: 저장돼 있던(고치기 전) 획이 틀이 된다. 끄는 중 미리보기도 같은 틀을 써서 끄는 동안부터 다른 획이 안 움직인다.
  const frameForEdit = (jamo: JamoData): JamoData => withFrameFrom(jamo, adoptFamilyStrokes(getJamo(jamo.type, jamo.char) ?? jamo, familyOfSyllable(syllable)))
  // 문맥 안전 보정(글자마다 부딪히면 변화량을 줄여 그리는 자동 되당김)을 뗀다. 사용자가 걸림을 밀고 넘어갔다는 건 붙여도 좋다는 뜻이라, 그 자모는 그린 대로 나온다.
  const withoutInkSafety = (jamo: JamoData): JamoData => { const next = { ...jamo }; delete next.contextualInkSafety; return next }
  const commitJamo = (before: JamoData, after: JamoData, raw: RawGlyphEdit, options?: { unframed?: boolean; pastGapLimit?: boolean }) => {
    if (JSON.stringify(before) === JSON.stringify(after)) return
    const storedBefore = structuredClone(getJamo(before.type, before.char) ?? before)
    // `틀 다시 맞추기`만 틀 없이 저장한다. 되돌리기는 기록의 `before`(틀이 없던 때)로 돌아가므로 틀도 같이 사라진다.
    const framedAfter = options?.unframed ? withoutFrame(after) : frameForEdit(after)
    const safeAfter = options?.pastGapLimit ? withoutInkSafety(framedAfter) : withContextualInkSafety(storedBefore, before, framedAfter, minimumInkGap)
    const edit = createSampleGlyphEdit(raw)
    setHistory((entries) => [...entries, { kind: 'jamo', jamoType: before.type, char: before.char, before: storedBefore, after: safeAfter, edit }])
    setFuture([])
    useCalibrationProjectStore.getState().addSampleGlyphEdit(edit)
    updateJamo(safeAfter)
    setPreviewJamo(null)
    setSelection((current) => current.kind === 'none' ? current : { ...current, jamo: safeAfter })
  }
  const commitSchema = (before: LayoutSchema, after: LayoutSchema, raw: RawGlyphEdit) => {
    const layoutType = before.id
    const storedBefore = useLayoutStore.getState().layoutSchemas[layoutType].userPartOverrides
    const beforeOverrides = storedBefore && Object.keys(storedBefore).length > 0
      ? structuredClone(storedBefore)
      : undefined
    const afterOverrides = after.userPartOverrides && Object.keys(after.userPartOverrides).length > 0
      ? structuredClone(after.userPartOverrides)
      : undefined
    if (JSON.stringify(beforeOverrides ?? {}) === JSON.stringify(afterOverrides ?? {})) return
    const edit = createSampleGlyphEdit(raw)
    useLayoutStore.getState().setUserPartOverrides(layoutType, afterOverrides)
    setHistory((entries) => [...entries, { kind: 'layout', layoutType, beforeOverrides, afterOverrides, edit }])
    setFuture([])
    useCalibrationProjectStore.getState().addSampleGlyphEdit(edit)
    setPreviewSchema(null)
  }
  const commitBrush = (before: StrokeRenderStyle, after: StrokeRenderStyle) => {
    if (JSON.stringify(before) === JSON.stringify(after)) {
      setPreviewBrush(null)
      return
    }
    setHistory((entries) => [...entries, { kind: 'brush', before, after }])
    setFuture([])
    useGlobalStyleStore.getState().setStrokeRenderStyle(after)
    setPreviewBrush(null)
  }
  const commitLayoutDelta = (before: LayoutDeltaSnapshot, after: LayoutDeltaSnapshot) => {
    if (JSON.stringify(before) === JSON.stringify(after)) return
    setHistory((entries) => [...entries, { kind: 'layoutDelta', before, after }])
    setFuture([])
  }
  // 방향키: 잡은 획 · 점 · 핸들을 눈금 한 칸(Shift는 네 칸) 옮긴다. 끌기와 같은 계산 · 같은 기록 한 줄.
  const nudgeActive = directManipulation && !isLayoutMode && !globalStylePanel && selection.kind !== 'none' && selection.kind !== 'component'
  useEffect(() => {
    if (!nudgeActive) return
    const onKeyDown = (event: KeyboardEvent) => {
      const direction = event.key === 'ArrowLeft' ? { x: -1, y: 0 } : event.key === 'ArrowRight' ? { x: 1, y: 0 } : event.key === 'ArrowUp' ? { x: 0, y: -1 } : event.key === 'ArrowDown' ? { x: 0, y: 1 } : null
      const target = event.target as HTMLElement | null
      if (!direction || event.metaKey || event.ctrlKey || event.altKey || target?.closest('input, textarea, select, [contenteditable="true"]')) return
      const api = dragApiRef.current
      if (!api) return
      event.preventDefault()
      const steps = (event.shiftKey ? 4 : 1) * snapStep / 0.001
      api.begin()
      api.change({ x: direction.x * steps, y: direction.y * steps })
      api.commit()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [nudgeActive, snapStep])
  const chooseEditMode = (mode: EditMode) => {
    setEditMode(mode)
    setMultiSelectArmed(false)
    setPreviewJamo(null)
    setPreviewSchema(null)
    if (mode === 'layout') closeGlobalStyle()
  }
  const editStrokes = (part: Part) => {
    const editorPart: MobileEditorPart = part === 'CH' ? 'CH' : part === 'JO' ? 'JO' : 'JU'
    setStrokeEntryPart(editorPart)
    setStrokeEntryMark(history.length)
    setSelection(firstStrokeSelectionOf(editorPart) ?? { kind: 'none' })
    setSelectedPoints([])
    chooseEditMode('stroke')
  }
  const closeGlobalStyle = () => {
    setPreviewBrush(null)
    setGlobalStylePanel(null)
  }
  // 기록 한 줄을 저장소에서 되돌린다. 기록 · 선택 정리는 호출자가 한다.
  const revertEntry = (entry: HistoryEntry) => {
    if (entry.kind === 'layout') useLayoutStore.getState().setUserPartOverrides(entry.layoutType, entry.beforeOverrides)
    else if (entry.kind === 'layoutDelta') { useLayoutDeltaStore.getState().restore(entry.before); setLayoutEpoch((epoch) => epoch + 1) }
    else if (entry.kind === 'brush') useGlobalStyleStore.getState().setStrokeRenderStyle(entry.before)
    else updateJamo(entry.before)
    if (entry.kind === 'layout' || entry.kind === 'jamo') useCalibrationProjectStore.getState().removeSampleGlyphEdit(entry.edit.id)
  }
  // `뒤로`: 이번에 획 편집에 들어와서 한 일을 전부 되돌리고 레이아웃으로 나간다. 되돌린 것은 Redo에 쌓여서 다시 살릴 수 있다.
  const cancelStrokeEdits = () => {
    const reverted = history.slice(Math.min(strokeEntryMark, history.length)).reverse()
    reverted.forEach(revertEntry)
    if (reverted.length) {
      setHistory((entries) => entries.slice(0, entries.length - reverted.length))
      setFuture((entries) => [...entries, ...reverted])
    }
    chooseEditMode('layout')
  }
  const undo = () => {
    const entry = history.at(-1)
    if (!entry) return
    revertEntry(entry)
    setHistory((entries) => entries.slice(0, -1))
    setFuture((entries) => [...entries, entry])
    setPreviewJamo(null)
    setPreviewSchema(null)
    // 획 편집에 잠긴 동안은 빈 선택으로 떨어뜨리지 않는다 — 도구 줄이 다 꺼져 버린다.
    setSelection(lockedPart ? firstStrokeSelectionOf(lockedPart) ?? { kind: 'none' } : { kind: 'none' })
    setSelectedPoints([])
  }
  const redo = () => {
    const entry = future.at(-1)
    if (!entry) return
    if (entry.kind === 'layout') useLayoutStore.getState().setUserPartOverrides(entry.layoutType, entry.afterOverrides)
    else if (entry.kind === 'layoutDelta') { useLayoutDeltaStore.getState().restore(entry.after); setLayoutEpoch((epoch) => epoch + 1) }
    else if (entry.kind === 'brush') useGlobalStyleStore.getState().setStrokeRenderStyle(entry.after)
    else updateJamo(entry.after)
    setFuture((entries) => entries.slice(0, -1))
    setHistory((entries) => [...entries, entry])
    if (entry.kind === 'layout' || entry.kind === 'jamo') useCalibrationProjectStore.getState().addSampleGlyphEdit(entry.edit)
    setPreviewJamo(null)
    setPreviewSchema(null)
    // 획 편집에 잠긴 동안은 빈 선택으로 떨어뜨리지 않는다 — 도구 줄이 다 꺼져 버린다.
    setSelection(lockedPart ? firstStrokeSelectionOf(lockedPart) ?? { kind: 'none' } : { kind: 'none' })
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
    const layoutHighlight = !isBrushStyleOpen && selection.kind === 'component'
      ? { layoutType: syllable.layoutType, parts: selection.renderParts, source: char === selectedChar }
      : null
    const contextId = `sentence-${lineIndex}-${charIndex}`
    let isSafetyAdjusted = false
    if (isEditableHangul(char)) {
      const previewed = withPreviewJamo(decomposeSyllable(char, choseong, jungseong, jongseong), previewJamo)
      const contextBase = schemas[previewed.layoutType]
      const padding = { ...globalPadding, ...paddingOverrides[previewed.layoutType] }
      const contextSchema = { ...contextBase, padding, designBodyPadding: padding }
      // 보정할 것이 있는 글자(고친 자모가 든 글자)에서만 상자를 푼다. 상자는 화면과 같은 것.
      const hasSafety = [previewed.choseong, previewed.jungseong, previewed.jongseong].some((jamo) => jamo?.contextualInkSafety)
      isSafetyAdjusted = hasSafety && resolveSyllableContextualInkSafety(previewed, screenBoxesOf(previewed, contextSchema)).limitedParts.length > 0
    }
    return isEditableHangul(char)
      ? <button key={`${lineIndex}-${char}-${charIndex}`} style={{ inlineSize: width }} type="button" aria-current={char === selectedChar ? 'true' : undefined} data-ink-gap-limiter={inkGapLimiter?.id === contextId ? 'true' : undefined} data-ink-safety-adjusted={isSafetyAdjusted ? 'true' : undefined} aria-label={`${char} 편집${isSafetyAdjusted ? ', 충돌 안전 보정됨' : ''}`} onClick={() => chooseChar(char)}>
          <Glyph char={char} size={sentenceEm} maps={maps} schemas={schemas} globalPadding={globalPadding} paddingOverrides={paddingOverrides} previewJamo={previewJamo} previewSchema={previewSchema} layoutHighlight={layoutHighlight} globalStyle={previewGlobalStyle} />
        </button>
      : <span key={`${lineIndex}-${char}-${charIndex}`} className={/\s/u.test(char) ? styles.spaceGlyph : styles.punctuationGlyph} style={{ inlineSize: width }} aria-label={/\s/u.test(char) ? '공백' : char}>{char}</span>
  }
  // 셸 안에서는 도구가 머리 `…` 메뉴로 들어가 이름이 붙고, 실행취소·다시실행은 셸 머리에 있으니 뺀다.
  const menuLabel = (text: string) => chrome === 'workspace' ? <em>{text}</em> : null
  const actions = (
    <nav aria-label="폰트 추출 및 편집 기록">
      <a href="/workspace/jamo/master" className={styles.workspaceLink} aria-label="자소 원형 새 화면 검토" title="자소 원형 새 화면 검토"><LayoutDashboard size={18} />{menuLabel('자소 원형')}</a>
      <button type="button" className={styles.exportButton} data-export-state={exportState} onClick={exportCurrentFont} disabled={exportState === 'exporting'} aria-label={exportState === 'exporting' ? `OTF 추출 중: ${exportProgress}` : exportState === 'downloaded' ? 'OTF 추출 완료' : exportState === 'failed' ? 'OTF 추출 실패' : '현재 작업을 OTF로 추출'} title={exportState === 'exporting' ? exportProgress : '현재 작업을 OTF로 추출'}>
        {exportState === 'exporting' ? <LoaderCircle className={styles.exportSpinner} size={18} /> : exportState === 'downloaded' ? <Check size={18} /> : exportState === 'failed' ? <X size={18} /> : <Download size={18} />}
        {menuLabel('OTF 추출')}
      </button>
      <button hidden type="button" className={styles.copyButton} data-copy-state={copyState} onClick={copyAnalysisValues} aria-label={copyState === 'copied' ? '분석용 값 복사됨' : copyState === 'failed' ? '분석용 값 복사 실패' : '분석용 값 복사'} title="분석용 값 복사">
        {copyState === 'copied' ? <Check size={18} /> : <Copy size={18} />}
      </button>
      <button type="button" disabled={selection.kind === 'none'} onClick={() => setIsShapeRuleOpen(true)} aria-label="선택 자모 형태 규칙" title="현재 자모의 획과 형태 예절"><ListTree size={18} />{menuLabel('형태 규칙')}</button>
      <button type="button" data-active={isGlobalStyleOpen || undefined} disabled={isLayoutMode} onClick={() => isGlobalStyleOpen ? closeGlobalStyle() : setGlobalStylePanel('body')} aria-label="글로벌 스타일 설정" title="글자 네모꼴과 획 스타일"><Settings2 size={18} />{menuLabel('네모꼴 · 획 스타일')}</button>
      {chrome === 'standalone' && <>
        <button type="button" onClick={undo} disabled={history.length === 0} aria-label="마지막 편집 되돌리기"><Undo2 size={18} />{history.length > 0 && <span>{history.length}</span>}</button>
        <button type="button" onClick={redo} disabled={future.length === 0} aria-label="되돌린 편집 다시 실행"><Redo2 size={18} /></button>
      </>}
    </nav>
  )
  const body = (
    <>
      <section ref={sentenceRef} className={styles.sentence} data-compact={sentenceCompact || undefined} aria-label="보정 문장">
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

      {isLayoutMode ? <section className={styles.layoutMode} aria-label={`${selectedChar} 레이아웃 수정`} data-testid="jamo-layout-mode">
        <GlyphLayoutEditor key={`${selectedChar}:${layoutEpoch}`} codepoint={selectedChar.codePointAt(0) ?? 0xac00} initialPart={selection.kind === 'none' ? strokeEntryPart ?? undefined : selection.editorPart} onCommitted={commitLayoutDelta} onEditStrokes={editStrokes} onPickCharacter={openSoloChar} />
      </section> : <>
      <section className={styles.editor} data-chrome={chrome} aria-label={`${selectedChar} 완성 글자 편집`}>
        {/* 셸 안에서는 레이아웃 모드와 같은 자리(캔버스 왼쪽)에 같은 여섯 칸 표지가 선다. 획 편집에서는 `기본` 칸이 하나 더 오고 칸마다 고치는 자소가 그려진다. */}
        <div className={styles.strokeStage}>
        {chrome === 'workspace' && layoutAvailable && !isBrushStyleOpen && <LayoutContextCards activeContextId={corpusIdentity(selectedChar.codePointAt(0) ?? 0xac00).contextId} allActive={false} ink={strokeCardInk ?? undefined} />}
        <div className={styles.focusArea}>
        <FocusedGlyph char={selectedChar} syllable={syllable} schema={effectiveSchema} selection={isBrushStyleOpen ? { kind: 'none' } : selection} onSelect={isBrushStyleOpen ? () => {} : selectFromCanvas} selectedPoints={isBrushStyleOpen ? [] : selectedPoints} onPointSelect={isBrushStyleOpen ? () => {} : selectPointFromCanvas} lockedPart={isBrushStyleOpen ? null : lockedPart} dragApiRef={directManipulation && !isBrushStyleOpen ? dragApiRef : undefined} gapWarning={gapWarning} fontSpace={fontSpace} grid={grid} designBody={designBody} globalStyle={previewGlobalStyle} />
        </div>
        </div>
      </section>

      {globalStylePanel ? <GlobalStyleTrackpad
        panel={globalStylePanel}
        onPanelChange={(panel) => { setPreviewBrush(null); setGlobalStylePanel(panel) }}
        onClose={closeGlobalStyle}
        bodyControls={<DesignBodyControls layoutType={previewedSyllable.layoutType} fontSpace={fontSpace} />}
        brushControls={<BrushStyleTrackpad
          committed={globalStyle.strokeStyle}
          draft={previewBrush}
          onDraftChange={setPreviewBrush}
          onCommit={commitBrush}
          renderPreview={(strokeStyle) => <Glyph char="한" size={42} maps={maps} schemas={schemas} globalPadding={globalPadding} paddingOverrides={paddingOverrides} previewJamo={null} previewSchema={null} layoutHighlight={null} globalStyle={{ ...globalStyle, strokeStyle, brush: strokeStyle.mode === 'brush' ? strokeStyle.brush : globalStyle.brush }} />}
          embedded
        />}
      /> : <InferenceTrackpad
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
        dragApiRef={directManipulation ? dragApiRef : undefined}
        multiSelectArmed={multiSelectArmed}
        frameForEdit={frameForEdit}
        partBoxes={placement.kind === 'boxes' ? placement.boxes : focusedBoxes}
      />}
      {/* 획 편집은 끄는 즉시 저장된다. `완료`는 저장이 아니라 레이아웃으로 돌아가는 문이다. */}
      {layoutAvailable && !globalStylePanel && <div className={styles.strokeDoneBar}>
        {boxFitIssue && <p role="status" data-testid="jamo-box-fit-issue">이 획은 모델 상자에 안 맞아 옛 배치로 그립니다 · {boxFitIssue.message}</p>}
        {/* `완료`는 고친 채로, 왼쪽 `뒤로`는 이번에 들어와서 고친 것을 되돌리고 레이아웃으로 나간다(취소). */}
        <div className={styles.strokeDoneRow}>
          <button type="button" className={styles.strokeBack} onClick={cancelStrokeEdits} aria-label="고친 획을 되돌리고 레이아웃으로 돌아가기" title="고친 획을 되돌리고 레이아웃으로" data-testid="jamo-stroke-back"><ArrowLeft size={18} /></button>
          <button type="button" onClick={() => chooseEditMode('layout')} data-testid="jamo-stroke-done">완료</button>
        </div>
      </div>}
      </>}
      {isShapeRuleOpen && selection.kind !== 'none' && <ShapeRulePanel jamo={selection.jamo} selectedStrokeId={selection.kind === 'component' ? null : selection.strokeId} onClose={() => setIsShapeRuleOpen(false)} />}
    </>
  )
  if (chrome === 'workspace') {
    return (
      <MobileWorkspaceShell
        activeArea="jamo"
        projectName={projectName}
        statusLabel={isLayoutMode ? '레이아웃 수정' : lockedPart && selection.kind !== 'none' ? `획 편집 · ${selection.jamo.char} · 모든 ${selection.jamo.char} 글자` : '획 편집'}
        history={{ canUndo: history.length > 0, canRedo: future.length > 0, onUndo: undo, onRedo: redo }}
        menu={<div data-edit-mode={isLayoutMode ? 'layout' : 'stroke'} data-testid="jamo-toolbar">{actions}</div>}
        menuBadge={exportState === 'exporting' ? 'busy' : exportState === 'downloaded' ? 'done' : exportState === 'failed' ? 'failed' : null}
      >
        {body}
      </MobileWorkspaceShell>
    )
  }
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div><span>FONT CALIBRATION</span><strong>문장에서 글자를 직접 다듬으세요</strong></div>
        {actions}
      </header>
      {body}
    </main>
  )
}
