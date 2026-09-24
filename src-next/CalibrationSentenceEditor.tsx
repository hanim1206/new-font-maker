import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { ArrowLeft, Check, Circle, Copy, CopyPlus, Delete, Dices, Download, LayoutDashboard, Link2, ListTree, LoaderCircle, Plus, Redo2, Settings2, Spline, TextCursorInput, Trash2, Undo2, Unlink, X, ZoomIn } from 'lucide-react'
import { SvgRenderer } from '../src/renderers/SvgRenderer'
import { loadGhostVisible, saveGhostVisible, useGhostComparison, useNotoGhost } from './notoGhostCompare'
import { DevGhostToggle } from './DevGhostToggle'
import { facesToBox, identityOfSyllable } from '../src/services/contextBoxResolver'
import { contextPlacementOf, useContextPlacement, useNotoModel } from './notoModel'
import { GlyphLayoutEditor } from './GlyphLayoutEditor'
import type { LayoutLeaveGuard } from './GlyphLayoutEditor'
import leaveSheetStyles from './GlyphLayoutEditor.module.css'
import { effectiveLayoutDelta, useLayoutDeltaStore } from './layoutDeltaStore'
import type { LayoutDeltaSnapshot } from './layoutDeltaStore'
import { adoptFamilyStrokes, familyOfSyllable } from '../src/utils/jamoContextStrokes'
import { withFrameFrom, withoutFrame } from '../src/utils/jamoFrame'
import { weightToMultiplier } from '../src/utils/globalStyleUtils'
import { faceSnapCandidates, pointAnchors, snapStrokeDrag, strokeBodyAnchors, strokeSnapCandidates, withoutOwnCandidates } from './strokeSnap'
import type { SnapAnchors } from './strokeSnap'
import type { SnapCandidate, SnapHit } from './railSnap'
import { baselineRails } from './notoBaselineRails'
import { useNotoGlyph } from './useNotoGlyph'
import { PART_COLOR, PART_LABEL } from './partColors'
import { useJamoStore } from '../src/stores/jamoStore'
import { useLayoutStore } from '../src/stores/layoutStore'
import { moveHandle, movePoint, moveStroke, scaleStroke } from '../src/services/editorCommands'
import { scaleLayoutParts, translateLayoutParts } from '../src/services/layoutProfileCommands'
import { getRenderedStrokeTargets } from '../src/services/mobileEditorContext'
import { LayoutContextCards } from './LayoutContextCards'
import { corpusIdentity } from './notoCorpus'
import { TouchedGlyphRow } from './TouchedGlyphRow'
import { focusJamoOf, NO_LAYOUT_EDIT } from './reviewPropagation'
import { matchesRule } from './scopeRule'
import type { ScopeRule } from './scopeRule'
import { useUnifiedTrackpad } from '../src/features/mobile-editor/useUnifiedTrackpad'
import { calculateBoxes } from '../src/utils/layoutCalculator'
import { decomposeSyllable } from '../src/utils/hangulUtils'
import { createCirclePath, pointsToSvgD } from '../src/utils/pathUtils'
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
import { CALIBRATION_FREEFORM_BOUNDS, calibrationEditBounds } from './calibrationEditPolicy'
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
import { BrushStyleTrackpad, type StrokeEnds } from './BrushStyleTrackpad'
import { StemBeakControls } from './StemBeakControls'
import { designBodySvgTransform } from '../src/services/designBodyPlacement'
import { endRangeDrag, moveRangeDrag, startRangeDrag } from './rangeDrag'
import { DEFAULT_STEM_BEAK, type StemBeakStyle } from '../src/services/stemBeak'
import styleMode from './GlobalStyleMode.module.css'
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
  // `pointsOpen`: 잡은 획을 한 번 더 눌러 점을 펼친 상태(피그마의 벡터 편집 들어가기). 닫혀 있으면 획만 잡혀 있다.
  | { kind: 'stroke'; component: GlyphComponentIdentity; editorPart: MobileEditorPart; renderPart: Part; jamo: JamoData; strokeId: string; box: BoxConfig; pointsOpen?: boolean }
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
/** 선택 색. 피그마처럼 잉크는 제 색 그대로 두고, 잡은 획은 가는 중심선 + 둘레 상자로 알린다. 옆 자소에 너무 붙은 자소의 획은 경고색. */
const SELECTION_COLOR = '#0d99ff'
const SELECTION_WARNING_COLOR = '#e0321a'
/** 꼭짓점 눌림 반지름(뷰박스 단위). 겹치면 누른 자리에서 가장 가까운 점이 잡힌다. */
const POINT_HIT_RADIUS = 7.5
type PreviewSchema = { layoutType: LayoutType; schema: LayoutSchema }
/** 폰트 전체 굵기(100–900) · 기울기(도). 끄는 동안은 미리보기, 손을 떼면 저장 + 기록 한 줄. */
type StyleTone = { weight: number; slant: number }
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
  | { kind: 'brush'; before: StrokeRenderStyle; after: StrokeRenderStyle; ends?: { before: StrokeEnds; after: StrokeEnds } }
  | { kind: 'tone'; before: StyleTone; after: StyleTone }
  | { kind: 'beak'; before: StemBeakStyle; after: StemBeakStyle }
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

// `문장` 전체 화면의 글자 크기(px).
const SENTENCE_SHEET_EM = 44

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

const NO_PARTS: readonly MobileEditorPart[] = []
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
  gapWarningParts = NO_PARTS,
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
  /** 옆 자소에 최소 간격보다 가깝게(그리고 고치기 전보다 더) 붙은 자소들. 그 자소의 잡은 획을 경고색으로 그린다. */
  gapWarningParts?: readonly MobileEditorPart[]
  onSelect: (selection: Selection) => void
  selectedPoints: SelectedPoint[]
  onPointSelect: (selection: Extract<Selection, { kind: 'point' }>) => void
  fontSpace: { unitsPerEm: number }
  grid: { majorDivisions: number; minorInterval: number }
  designBody: { x: number; y: number; width: number; height: number }
  globalStyle: GlobalStyle
}) {
  // 배치는 칸 해석 함수(모델 상자)가 우선, 못 풀면 스키마. 획 겨냥·편집 오버레이도 같은 상자를 쓴다.
  const { placement, resolution, referencePlacement } = useContextPlacement(syllable, schema, globalStyle)
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
  // Noto 고스트는 기준 틀(기본 네모꼴) 좌표다. 견줄 때는 네모꼴을 얹기 전 자리끼리 견주고, 그릴 때는 고스트를 같은 변환으로 옮긴다.
  const comparison = useGhostComparison(ghost, syllable, referencePlacement, globalStyle)
  const toggleGhost = () => setGhostVisible((current) => { saveGhostVisible(!current); return !current })
  const selectedPart = selection.kind === 'none' ? null : selection.editorPart
  const selectedStrokeId = selection.kind === 'stroke' || selection.kind === 'point' || selection.kind === 'handle'
    ? selection.strokeId
    : null
  // 점이 펼쳐진 획. 획을 누르면 획만 잡히고, 한 번 더 누르면 그 획의 점이 뜬다. 점 · 핸들을 잡은 동안도 펼친 채다.
  const pointsOpenStrokeId = (selection.kind === 'stroke' && selection.pointsOpen) || selection.kind === 'point' || selection.kind === 'handle'
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
  // `onTap`: 끌지 않고 뗀 누르기에만 부른다. 잡은 획을 한 번 더 눌러 점을 펼칠 때 쓴다 — 잡은 획을 끌어 옮기는 건 그대로다.
  const drag = useRef<{ pointerId: number; startX: number; startY: number; box: BoxConfig; started: boolean; anchors: SnapAnchors; candidates: SnapCandidate[]; onTap?: () => void } | null>(null)
  // 스냅: 레이아웃의 기준선 스냅과 같은 규칙(처음 자리 → 기준선 · 상자 변 · 다른 획 → 격자), 축마다 따로. 후보는 이 글자의 Noto 기준선 + 부품 상자 네 변 + 같은 글자 안 획의 중심선 · 끝.
  const { glyph: notoGlyph } = useNotoGlyph(char.codePointAt(0) ?? 0xac00)
  const guideRails = useMemo<SnapCandidate[]>(() => !dragApiRef ? [] : [
    ...(notoGlyph ? baselineRails(notoGlyph) : []),
    ...(resolution ? faceSnapCandidates(resolution.parts) : []),
  ], [dragApiRef, notoGlyph, resolution])
  const strokeCandidates = useMemo(() => strokeSnapCandidates(targets.map((target) => ({ strokeId: target.stroke.id, label: `${target.jamo.char} 획`, stroke: target.stroke, box: target.box }))), [targets])
  const [snapHits, setSnapHits] = useState<{ x: SnapHit | null; y: SnapHit | null } | null>(null)
  // 이름표에는 기준선 · 획 · 격자만 올린다. `처음 자리`는 끄는 내내 걸려 있어서 뺀다.
  const snapHitLabels = snapHits ? [snapHits.x, snapHits.y].filter((hit): hit is SnapHit => Boolean(hit) && hit!.kind !== 'model').map((hit) => hit.label).filter((label, index, labels) => labels.indexOf(label) === index) : []
  // 누른 자리에서 가장 가까운 꼭짓점. 좌표는 누른 요소의 화면 변환을 거꾸로 돌려 얻는다 — 글자가 기울어도 맞는다.
  const nearestPoint = (event: ReactPointerEvent<SVGElement>, stroke: StrokeDataV2, box: BoxConfig): { index: number; distance: number } => {
    const matrix = (event.currentTarget as SVGGraphicsElement).getScreenCTM()
    if (!matrix) return { index: 0, distance: Infinity }
    const at = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse())
    return stroke.points.reduce((best, point, index) => {
      const { x, y } = absolutePoint(point, box)
      const distance = Math.hypot(x - at.x, y - at.y)
      return distance < best.distance ? { index, distance } : best
    }, { index: 0, distance: Infinity })
  }
  const startDrag = (event: ReactPointerEvent<SVGElement>, box: BoxConfig, anchors: SnapAnchors, dragged: { strokeId: string; pointIndex?: number }, onTap?: () => void) => {
    // 끌기가 없는 화면은 누르기가 곧 탭이다.
    if (!dragApiRef || !canvasRef.current) { onTap?.(); return }
    // 닻과 후보는 누른 순간의 자리로 굳힌다. 끄는 동안 자기 자신에게 걸리지 않게 자기 후보는 뺀다.
    drag.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, box, started: false, anchors, candidates: withoutOwnCandidates([...guideRails, ...strokeCandidates], dragged), onTap }
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
    // 글자가 기울어 있으면(skewX) 화면의 세로 이동이 기운 축을 따라 옆으로도 읽힌다. 기울기 전 좌표로 되돌린다: x = x' + tan(기울기) · y'.
    const emPerPx = CANVAS_VIEWPORT.width / canvas.getBoundingClientRect().width
    const uprightDx = dx + Math.tan(globalStyle.slant * Math.PI / 180) * dy
    const snapped = snapStrokeDrag({ anchors: state.anchors, requested: { x: uprightDx * emPerPx, y: dy * emPerPx }, candidates: state.candidates })
    setSnapHits((current) => current?.x?.value === snapped.hits.x?.value && current?.y?.value === snapped.hits.y?.value && current?.x?.label === snapped.hits.x?.label && current?.y?.label === snapped.hits.y?.label ? current : snapped.hits)
    api.change({ x: snapped.delta.x / state.box.width / 0.001, y: snapped.delta.y / state.box.height / 0.001 })
  }
  const endDrag = (event: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const state = drag.current
    if (!state || event.pointerId !== state.pointerId) return
    drag.current = null
    setSnapHits(null)
    if (canvasRef.current?.hasPointerCapture(event.pointerId)) canvasRef.current.releasePointerCapture(event.pointerId)
    if (!state.started) { if (!cancelled) state.onTap?.(); return }
    if (cancelled) dragApiRef?.current?.cancel()
    else dragApiRef?.current?.commit()
  }
  const minorStep = grid.minorInterval / fontSpace.unitsPerEm * VIEW_BOX_SIZE
  const majorStep = VIEW_BOX_SIZE / grid.majorDivisions
  const body = { x: designBody.x / fontSpace.unitsPerEm * VIEW_BOX_SIZE, y: designBody.y / fontSpace.unitsPerEm * VIEW_BOX_SIZE, width: designBody.width / fontSpace.unitsPerEm * VIEW_BOX_SIZE, height: designBody.height / fontSpace.unitsPerEm * VIEW_BOX_SIZE }

  return (
    <div ref={canvasRef} className={styles.focusCanvas} style={canvasStyle} data-testid="focus-canvas" data-placement={placement.kind} data-direct={dragApiRef ? true : undefined} data-gap-warning={gapWarningParts.length ? true : undefined} onPointerDown={() => onSelect({ kind: 'none' })} onPointerMove={moveDrag} onPointerUp={(event) => endDrag(event, false)} onPointerCancel={(event) => endDrag(event, true)}>
      {globalStyle.strokeStyle.mode === 'legacy-snapped-centerline' && <span className={styles.constructionGrid} aria-hidden="true" data-construction-grid="legacy-snapped-centerline" />}
      <SvgRenderer syllable={syllable} schema={placement.kind === 'schema' ? placement.schema : undefined} boxes={placement.kind === 'boxes' ? placement.boxes : undefined} size={340} viewportBox={CANVAS_VIEWPORT} className={styles.focusSvg} partStyles={partStyles} globalStyle={globalStyle} straightUnderlay={<>
        {/* 검수 캔버스(GhostCanvas)와 같은 깔개: 흰 칸 → 1/16 잔선·1/4 굵은선 눈금 → 칸 테두리 → 글자몸 → 기준선(0.88) → 부품 상자 → Noto 고스트. 전부 잉크 아래. */}
        {/* 글자가 기울어도 자리의 기준(눈금 · 글자몸 · 기준선 · 부품 상자)은 곧게 둔다. Noto 고스트만 잉크와 같이 기운다. */}
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
        {/* 레이아웃의 기준선을 읽기 전용으로 옅게 깐다. 획을 끌면 여기에 걸린다. */}
        {guideRails.length > 0 && <g aria-hidden="true" data-testid="stroke-guide-rails">
          {guideRails.map((rail) => rail.axis === 'x'
            ? <line key={rail.id} x1={rail.value * VIEW_BOX_SIZE} x2={rail.value * VIEW_BOX_SIZE} y1={-6} y2={106} className={styles.guideRail} />
            : <line key={rail.id} x1={-6} x2={106} y1={rail.value * VIEW_BOX_SIZE} y2={rail.value * VIEW_BOX_SIZE} className={styles.guideRail} />)}
        </g>}
      </>} underlay={<>
        {ghostVisible && ghost && <path d={ghost.path} transform={designBodySvgTransform(schema.padding, VIEW_BOX_SIZE)} className={styles.notoGhost} fillRule="evenodd" data-testid="noto-ghost" />}
      </>}>
        {targets.map((target) => {
          // 잠긴 동안 다른 자소는 눌리지 않는다. 잠긴 자소의 획은 자소 통째 선택을 거치지 않고 바로 잡힌다.
          if (lockedPart && target.editorPart !== lockedPart) return null
          const path = pointsToSvgD(target.stroke.points, target.stroke.closed, target.box, VIEW_BOX_SIZE)
          const component = componentFor(char, target.editorPart, target.jamo)
          const sameComponent = lockedPart !== null || selectedPart === target.editorPart
          const isSelected = selectedStrokeId === target.stroke.id
          // 피그마처럼: 잉크는 제 색 그대로 두고, 잡은 획은 가는 중심선으로만 알린다. 획 바깥에 둘레 상자는 두르지 않는다.
          // 옆 자소에 너무 붙은 자소면 빨갛게. 안 잡힌 획은 마우스를 올리면 중심선이 옅게 뜬다. 눌림 영역은 그 위에 투명하게 넓게 둔다.
          const warning = gapWarningParts.includes(target.editorPart)
          const pointsOpen = pointsOpenStrokeId === target.stroke.id
          return <g key={`hit-${target.renderPart}-${target.stroke.id}`} className={styles.strokeTarget} style={{ '--selection-color': warning ? SELECTION_WARNING_COLOR : SELECTION_COLOR } as CSSProperties}>
          {isSelected
            ? <path d={path} className={styles.selectedCenterline} pointerEvents="none" data-active-stroke={warning ? 'warning' : 'active'} />
            : <path d={path} className={styles.hoverCenterline} pointerEvents="none" />}
          <path
            d={path}
            fill="none"
            stroke="transparent"
            strokeWidth={Math.max(12, target.stroke.thickness * VIEW_BOX_SIZE + 8)}
            pointerEvents="stroke"
            data-editor-hit="stroke"
            data-selected={selectedStrokeId === target.stroke.id ? 'true' : undefined}
            onPointerDown={(event) => {
              event.stopPropagation()
              if (sameComponent) {
                const strokeSelection = { kind: 'stroke', component, editorPart: target.editorPart, renderPart: target.renderPart, jamo: target.jamo, strokeId: target.stroke.id, box: target.box } as const
                const anchors = strokeBodyAnchors(target.stroke, target.box)
                if (pointsOpen) {
                  // 점이 펼쳐진 획의 몸통: 점 선택만 풀고 펼친 채로 둔다. 끌면 획째 옮긴다.
                  onSelect({ ...strokeSelection, pointsOpen: true })
                  startDrag(event, target.box, anchors, { strokeId: target.stroke.id })
                } else if (isSelected) {
                  // 잡힌 획을 한 번 더 누르면(끌지 않고 떼면) 점이 펼쳐지고, 누른 자리에서 가장 가까운 꼭짓점이 잡힌다.
                  const pointIndex = nearestPoint(event, target.stroke, target.box).index
                  startDrag(event, target.box, anchors, { strokeId: target.stroke.id }, () => onPointSelect({ ...strokeSelection, kind: 'point', pointIndex }))
                } else {
                  onSelect(strokeSelection)
                  startDrag(event, target.box, anchors, { strokeId: target.stroke.id })
                }
              } else {
                onSelect({ kind: 'component', component, editorPart: target.editorPart, renderParts: roleRenderParts(target.editorPart, boxes), jamo: target.jamo })
              }
            }}
          />
          </g>
        })}
        {/* 점은 펼친 획에만 뜬다. `여러 점`으로 다른 획에서 골라 둔 점이 있으면 그 획의 점도 남긴다. */}
        {selectedPart && selection.kind !== 'component' && targets.filter((target) => target.editorPart === selectedPart
          && (target.stroke.id === pointsOpenStrokeId || selectedPoints.some((point) => point.strokeId === target.stroke.id))).flatMap((target) => target.stroke.points.map((point, pointIndex) => {
          const { x, y } = absolutePoint(point, target.box)
          const active = selectedPoints.some((point) => point.strokeId === target.stroke.id && point.pointIndex === pointIndex)
            || ((selection.kind === 'point' || selection.kind === 'handle') && selection.strokeId === target.stroke.id && selection.pointIndex === pointIndex)
          const component = componentFor(char, target.editorPart, target.jamo)
          const selectPoint = (event: ReactPointerEvent<SVGCircleElement>) => {
              event.stopPropagation()
              // 눌림 영역이 겹치면 나중에 그린 점이 먹는다. 누른 자리에서 가장 가까운 점을 잡는다(누른 자리가 영역 밖이면 누른 점 그대로).
              const nearest = nearestPoint(event, target.stroke, target.box)
              const pressed = absolutePoint(point, target.box)
              const matrix = event.currentTarget.getScreenCTM()
              const at = matrix ? new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse()) : null
              const index = at && Math.hypot(pressed.x - at.x, pressed.y - at.y) <= POINT_HIT_RADIUS ? nearest.index : pointIndex
              const picked = target.stroke.points[index]
              onPointSelect({ kind: 'point', component, editorPart: target.editorPart, renderPart: target.renderPart, jamo: target.jamo, strokeId: target.stroke.id, pointIndex: index, box: target.box })
              startDrag(event, target.box, pointAnchors(picked, target.box), { strokeId: target.stroke.id, pointIndex: index })
          }
          return <g key={`point-${target.renderPart}-${target.stroke.id}-${pointIndex}`}>
            <circle cx={x} cy={y} r={POINT_HIT_RADIUS} fill="transparent" pointerEvents="all" className={styles.pointHitTarget} data-editor-point="hit" onPointerDown={selectPoint} />
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
              // 핸들은 마름모. 꼭짓점(동그라미)과 모양으로 갈린다.
              <rect
                key={`handle-${target.renderPart}-${handle}`}
                x={position.x - (active ? 1.9 : 1.5)}
                y={position.y - (active ? 1.9 : 1.5)}
                width={active ? 3.8 : 3}
                height={active ? 3.8 : 3}
                transform={`rotate(45 ${position.x} ${position.y})`}
                className={active ? styles.activeHandle : styles.handle}
                data-editor-handle={active ? 'active' : 'idle'}
                onPointerDown={(event) => {
                  event.stopPropagation()
                  onSelect({ ...selection, kind: 'handle', handle })
                  startDrag(event, target.box, pointAnchors(handlePoint, target.box), { strokeId: target.stroke.id, pointIndex: selection.pointIndex })
                }}
              />,
            ]
          })
        })}
        {/* 걸린 자리. 레이아웃처럼 주황 선으로 보인다. `처음 자리`는 선을 안 긋는다 — 끄는 내내 떠 있어서 시끄럽다. */}
        {snapHits && (['x', 'y'] as const).map((axis) => {
          const hit = snapHits[axis]
          if (!hit || hit.kind === 'model') return null
          const at = hit.value * VIEW_BOX_SIZE
          return axis === 'x'
            ? <line key={axis} x1={at} x2={at} y1={-8} y2={108} className={styles.snapHitLine} data-testid="stroke-snap-hit" data-axis="x" />
            : <line key={axis} x1={-8} x2={108} y1={at} y2={at} className={styles.snapHitLine} data-testid="stroke-snap-hit" data-axis="y" />
        })}
      </SvgRenderer>
      {snapHitLabels.length > 0 && <span className={styles.snapHitChip} data-testid="stroke-snap-chip">{snapHitLabels.join(' · ')}</span>}
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
  creationSelection = null,
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
}: {
  glyph: string
  syllable: DecomposedSyllable
  selection: Selection
  /** 아무것도 안 잡혔을 때 넣기 도구(추가 · 원)가 기댈 자리. 획 편집에 잠긴 자소의 첫 획. */
  creationSelection?: Selection | null
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
  // 지금 끄는 손이 조절판인지. 셸 안에서도 조절판을 함께 두므로(섬세한 편집) 캔버스 끌기와 구분한다.
  const padMove = useRef(!direct)
  // 조절판은 상자 좌표 눈금에 붙인다. 캔버스 끌기는 em 기준 스냅을 끝낸 값을 넘기므로 여기서 다시 붙이지 않는다.
  const moveGridStep = () => padMove.current ? snapStep : undefined
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
  // 가로는 글자 칸 끝에서 멈춘다. 넘기면 그리는 단계가 자모 전체를 반대쪽으로 밀어 넣는다.
  const editBounds = (source: JamoData) => selection.kind === 'none' || selection.kind === 'component'
    ? CALIBRATION_FREEFORM_BOUNDS
    : calibrationEditBounds(selection.box, getJamoStrokes(source), weightToMultiplier(useGlobalStyleStore.getState().style.weight))
  const moveSelectedPoints = (source: JamoData, requested: StrokeMoveDelta) => {
    if (selection.kind !== 'point' || selectedPoints.length < 2) {
      return selection.kind === 'point'
        ? movePoint(source, selection.strokeId, selection.pointIndex, requested, editBounds(source), moveGridStep())
        : null
    }
    const first = selectedPoints[0]
    // 첫 점의 경계를 좁혀, 가장 바깥 점이 칸 끝에 닿으면 다 같이 멈춘다.
    const strokes = getJamoStrokes(source)
    const xs = selectedPoints.flatMap((point) => {
      const found = strokes.find((stroke) => stroke.id === point.strokeId)?.points[point.pointIndex]
      return found ? [found.x] : []
    })
    const firstX = strokes.find((stroke) => stroke.id === first.strokeId)?.points[first.pointIndex]?.x
    const bounds = editBounds(source)
    const groupBounds = firstX === undefined || !xs.length ? bounds : {
      ...bounds,
      minX: Math.min(firstX, bounds.minX + firstX - Math.min(...xs)),
      maxX: Math.max(firstX, bounds.maxX - (Math.max(...xs) - firstX)),
    }
    const firstResult = movePoint(source, first.strokeId, first.pointIndex, requested, groupBounds, moveGridStep())
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
    // 캔버스 끌기는 em 기준으로 이미 스냅해서 넘긴다(레이아웃과 같은 규칙). 여기서 상자 좌표 눈금에 한 번 더 붙이면 걸린 자리가 어긋난다.
    const normalized = !padMove.current ? { x: movement.x * .001, y: movement.y * .001 } : {
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
          ? moveStroke(startJamo.current!, selection.strokeId, movementAtFactor, editBounds(startJamo.current!), moveGridStep())
          : selection.kind === 'point'
            ? moveSelectedPoints(startJamo.current!, movementAtFactor)
            : selection.kind === 'handle'
              ? moveHandle(startJamo.current!, selection.strokeId, selection.pointIndex, selection.handle, movementAtFactor, editBounds(startJamo.current!), moveGridStep())
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
      const createCandidate = (factor: number) => scaleStroke(startJamo.current!, selection.strokeId, scaleAtFactor(factor), editBounds(startJamo.current!))
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
  // 넣기 도구가 기대는 선택. 획 · 점 · 핸들을 잡았으면 그것, 아니면 잠긴 자소의 첫 획.
  const creationBase = selection.kind === 'stroke' || selection.kind === 'point' || selection.kind === 'handle'
    ? selection
    : creationSelection?.kind === 'stroke' ? creationSelection : null
  const addStroke = () => {
    const selection = creationBase
    if (!selection) return
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
    onSelectionChange({ ...selection, kind: 'stroke', strokeId, jamo: after, pointsOpen: false })
  }
  // ㅇ·ㅎ의 둥근 획. 지금 자모 상자에 꽉 차는 타원을 닫힌 곡선으로 넣는다(ㅇ 프리셋과 같은 4점 베지어).
  const addCircle = () => {
    const selection = creationBase
    if (!selection) return
    const before = structuredClone(adoptFamilyStrokes(getJamo(selection.jamo.type, selection.jamo.char) ?? selection.jamo, familyOfSyllable(syllable)))
    const strokeId = `stroke-${Date.now()}`
    // ㅇ처럼 이미 상자에 꽉 찬 원이 있으면 똑같이 겹쳐 안 보인다. 같은 크기의 닫힌 획이 있는 동안 가운데로 줄인다.
    const closedBounds = getJamoStrokes(before).filter((stroke) => stroke.closed).map((stroke) => ({
      minX: Math.min(...stroke.points.map((point) => point.x)),
      maxX: Math.max(...stroke.points.map((point) => point.x)),
      minY: Math.min(...stroke.points.map((point) => point.y)),
      maxY: Math.max(...stroke.points.map((point) => point.y)),
    }))
    const overlaps = (radius: number) => closedBounds.some((bounds) => [bounds.minX, bounds.minY].every((value) => Math.abs(value - (.5 - radius)) < .05)
      && [bounds.maxX, bounds.maxY].every((value) => Math.abs(value - (.5 + radius)) < .05))
    let radius = .5
    while (overlaps(radius) && radius > .1) radius *= .6
    const stroke: StrokeDataV2 = {
      id: strokeId,
      points: createCirclePath(.5, .5, radius, radius).points,
      closed: true,
      thickness: selectedStroke?.thickness ?? .07,
      label: 'circle',
    }
    const after = addJamoStroke(before, selection.strokeId, stroke)
    onCommitJamo(before, after, { kind: 'stroke-move', glyph, component: selection.component, jamoType: selection.jamo.type, strokeId, delta: { x: 0, y: 0 } })
    onSelectionChange({ ...selection, kind: 'stroke', strokeId, jamo: after, pointsOpen: false })
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
    onMoveStart: () => { padMove.current = true; beginMove() },
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
    dragApiRef.current = { begin: () => { padMove.current = false; beginMove() }, change: changeMove, commit: commitMove, cancel }
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
    // 조작 안내 문구는 두지 않는다. 여러 점·간격 경고처럼 지금 상태가 바뀐 것만 알린다.
    const directLabel = [
      selectedPoints.length > 1 ? `점 ${selectedPoints.length}개 함께` : '',
      inkGapLimiter ? pastGapLimit.current ? `${inkGapLimiter.char}에서 옆 자소에 너무 붙음` : `${inkGapLimiter.char}에서 최소 간격 · 더 끌면 넘어감` : '',
    ].filter(Boolean).join(' · ')
    // 기준 틀이 굳은 자모만 `틀 다시 맞추기`가 된다.
    const liveJamo = editable ? activeVisibleJamo ?? selection.jamo : null
    const resetFrame = () => {
      if (!editable) return
      const before = structuredClone(adoptFamilyStrokes(getJamo(selection.jamo.type, selection.jamo.char) ?? selection.jamo, familyOfSyllable(syllable)))
      if (!before.frame) return
      onCommitJamo(before, withoutFrame(before), { kind: 'stroke-move', glyph, component: selection.component, jamoType: selection.jamo.type, strokeId: selection.strokeId, delta: { x: 0, y: 0 } }, { unframed: true })
    }
    // 자리가 흔들리지 않게 단추는 늘 같은 일곱 개를 그리고, 못 쓰는 것은 끈다.
    return (
      <section className={styles.strokeToolSection} data-testid="jamo-stroke-tools">
        {/* 경고만 한 줄. 알릴 게 없으면 줄을 접는다 — 늘어나고 줄어드는 건 트랙패드라 캔버스는 안 흔들린다. */}
        {directLabel && <p className={styles.strokeWarning}>{directLabel}</p>}
        {/* `틀 다시 맞추기`는 일단 숨긴다(기능은 남겨 둔다). */}
        <button type="button" hidden onClick={resetFrame} disabled={!liveJamo?.frame} data-testid="jamo-frame-reset">틀 다시 맞추기</button>
        {/* 트랙패드가 남는 세로를 다 먹고, 도구 단추는 그 오른쪽에 2열로 선다(단추 줄이 차지하던 세로를 트랙패드에 준다). */}
        <div className={styles.strokeWorkRow}>
          {/* 섬세한 편집용 조절판. 손가락이 글자를 가리지 않고, 1px이 1u라 캔버스 끌기보다 잘게 옮긴다. */}
          <div
            {...trackpad.handlers}
            className={`${legacyTrackpadStyles.trackpad} ${styles.trackpad} ${styles.strokeTrackpad} ${selection.kind === 'none' ? styles.trackpadDisabled : ''}`}
            role="group"
            aria-label="선택한 획을 잘게 옮기는 트랙패드"
            aria-disabled={selection.kind === 'none'}
            data-testid="jamo-stroke-trackpad"
          >
            <span className={legacyTrackpadStyles.horizontalLane} aria-hidden="true" />
            <span className={legacyTrackpadStyles.verticalLane} aria-hidden="true" />
            {trackpad.visualState.points.map((point, index) => <span key={index} className={legacyTrackpadStyles.pinchPoint} style={{ left: point.x, top: point.y }} aria-hidden="true" />)}
          </div>
          <div className={styles.strokeToolRow} role="toolbar" aria-label="획 편집 도구">
            <button type="button" onClick={addStroke} disabled={!creationBase} aria-label="선 추가"><Plus size={18} aria-hidden="true" /><span>추가</span></button>
            <button type="button" onClick={addCircle} disabled={!creationBase} aria-label="원 넣기" data-testid="jamo-stroke-add-circle"><Circle size={18} aria-hidden="true" /><span>원</span></button>
            <button type="button" onClick={deleteSelection} disabled={!canDelete} aria-label={selection.kind === 'stroke' ? '획 삭제' : '꼭짓점 삭제'}><Trash2 size={18} aria-hidden="true" /><span>삭제</span></button>
            <button type="button" onClick={toggleCurve} disabled={!onPoint} aria-label={selectedPointHasCurve ? '직선화' : '곡선화'}><Spline size={18} aria-hidden="true" /><span>{selectedPointHasCurve ? '직선' : '곡선'}</span></button>
            <button type="button" onClick={connectStroke} disabled={!mergeTarget} aria-label="가까운 선 연결"><Link2 size={18} aria-hidden="true" /><span>잇기</span></button>
            <button type="button" onClick={disconnectStroke} disabled={!canDisconnect} aria-label="선 끊기"><Unlink size={18} aria-hidden="true" /><span>끊기</span></button>
            <button type="button" onClick={() => onMultiSelectArmedChange(!multiSelectArmed)} disabled={!editable} aria-pressed={multiSelectArmed} aria-label="꼭짓점 여러 개 고르기"><CopyPlus size={18} aria-hidden="true" /><span>여러 점</span></button>
          </div>
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

/**
 * 제품 화면의 네모꼴: 막대 하나(길쭉 ↔ 정네모 ↔ 납작). 고르는 건 장평 하나뿐이라 가로 · 세로를 따로 두지 않는다.
 * 왼쪽은 세로를 둔 채 가로를 줄이고(500까지), 오른쪽은 가로를 글자 칸 끝(1000)까지 늘린 뒤 세로를 줄인다(500까지).
 */
const BODY_SQUARE = 850
const BODY_MIN = 500
const BODY_MAX = 1000
/** 막대는 −100(가장 길쭉) ~ 0(정네모) ~ 100(가장 납작). 정네모가 막대 한가운데에 오게 양쪽을 따로 편다. */
const BODY_SHAPE_LIMIT = 100
const BODY_SHAPE_STICKY = 4
const TALL_SPAN = BODY_SQUARE - BODY_MIN
const FLAT_SPAN = (BODY_MAX - BODY_SQUARE) + (BODY_SQUARE - BODY_MIN)
const roundTo5 = (value: number) => Math.round(value / 5) * 5

function bodyOfShape(shape: number): { width: number; height: number } {
  if (shape <= 0) return { width: roundTo5(BODY_SQUARE + shape / BODY_SHAPE_LIMIT * TALL_SPAN), height: BODY_SQUARE }
  const amount = shape / BODY_SHAPE_LIMIT * FLAT_SPAN
  const widen = Math.min(amount, BODY_MAX - BODY_SQUARE)
  return { width: roundTo5(BODY_SQUARE + widen), height: roundTo5(BODY_SQUARE - (amount - widen)) }
}

/** 저장된 가로 · 세로를 막대 자리로 읽는다. 옛 화면에서 둘을 따로 맞춘 값은 비율만 읽어 보여 주고, 막대를 움직이기 전에는 값을 안 건드린다. */
function shapeOfBody(width: number, height: number): number {
  const ratio = width / Math.max(height, 1)
  if (ratio <= 1) return Math.round((BODY_SQUARE * ratio - BODY_SQUARE) / TALL_SPAN * BODY_SHAPE_LIMIT)
  const amount = ratio <= BODY_MAX / BODY_SQUARE ? BODY_SQUARE * ratio - BODY_SQUARE : (BODY_MAX - BODY_SQUARE) + (BODY_SQUARE - BODY_MAX / ratio)
  return Math.round(amount / FLAT_SPAN * BODY_SHAPE_LIMIT)
}

function DesignBodyShapeControls({ fontSpace }: { fontSpace: { unitsPerEm: number; width: number; height: number } }) {
  const globalPadding = useLayoutStore((state) => state.globalPadding)
  const setGlobalPadding = useLayoutStore((state) => state.setGlobalPadding)
  const resetGlobalPadding = useLayoutStore((state) => state.resetGlobalPadding)
  const body = paddingToDesignBody(globalPadding, fontSpace)
  const shape = Math.max(-BODY_SHAPE_LIMIT, Math.min(BODY_SHAPE_LIMIT, shapeOfBody(body.width, body.height)))
  const isSquare = Math.round(body.width) === BODY_SQUARE && Math.round(body.height) === BODY_SQUARE
  // 정네모 근처에서는 탁 걸린다.
  const setShape = (value: number | null) => {
    if (value === null) return
    const next = Math.abs(value) <= BODY_SHAPE_STICKY ? 0 : value
    if (next === shape && !(next === 0 && !isSquare)) return
    const target = bodyOfShape(next)
    setGlobalPadding(centeredDesignBodyPadding(target.width, target.height, fontSpace))
  }
  return <div className={styleMode.weight} role="tabpanel" aria-label="글자 네모꼴 설정">
    <p><strong>글자가 들어가는 틀의 모양</strong><span>틀을 바꾸면 글자도 같이 바뀝니다</span></p>
    <div className={styleMode.weightBox}>
      <div className={styleMode.weightHead}><span>{shape === 0 ? '정네모' : shape < 0 ? '길쭉하게' : '납작하게'}</span><output data-testid="style-body-size">{Math.round(body.width)} × {Math.round(body.height)}</output></div>
      <div className={styleMode.shapeRow}>
        <span className={styleMode.shapeIcon} style={{ width: 12, height: 20 }} aria-hidden="true" />
        <input type="range" min={-BODY_SHAPE_LIMIT} max={BODY_SHAPE_LIMIT} step="1" value={shape} aria-label="네모꼴 모양" data-testid="style-body-shape" onChange={(event) => setShape(Number(event.target.value))}
          onPointerDown={(event) => setShape(startRangeDrag(event))} onPointerMove={(event) => setShape(moveRangeDrag(event))} onPointerUp={endRangeDrag} onPointerCancel={endRangeDrag} />
        <span className={styleMode.shapeIcon} style={{ width: 22, height: 12 }} aria-hidden="true" />
      </div>
    </div>
    <button type="button" disabled={isSquare} onClick={resetGlobalPadding}>정네모 850 × 850으로 되돌리기</button>
  </div>
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
  const dragBody = (dimension: 'width' | 'height') => {
    const apply = (value: number | null) => { if (value !== null && value !== Math.round(dimension === 'width' ? body.width : body.height)) updateBody(dimension, value) }
    return {
      onPointerDown: (event: ReactPointerEvent<HTMLInputElement>) => apply(startRangeDrag(event)),
      onPointerMove: (event: ReactPointerEvent<HTMLInputElement>) => apply(moveRangeDrag(event)),
      onPointerUp: endRangeDrag,
      onPointerCancel: endRangeDrag,
    }
  }

  return <div className={styles.bodyControls} role="tabpanel" aria-label="글자 네모꼴 설정">
    <div className={styles.bodyScope} role="tablist" aria-label="네모꼴 적용 범위">
      <button type="button" role="tab" aria-selected={scope === 'font'} onClick={() => setScope('font')}>폰트 전체</button>
      <button type="button" role="tab" aria-selected={scope === 'layout'} onClick={selectLayoutScope}>현재 레이아웃</button>
    </div>
    <p><strong>{scope === 'font' ? '모든 레이아웃의 기본 네모꼴' : `${LAYOUT_LABELS[layoutType]}만 별도 적용`}</strong><span>Font Space {fontSpace.unitsPerEm}은 고정됩니다</span></p>
    <div className={styles.bodyDimensionGrid}>
      <label><span>가로 <output>{Math.round(body.width)}</output></span><input type="range" min="500" max="1000" step="5" value={Math.round(body.width)} onChange={(event) => updateBody('width', Number(event.target.value))} {...dragBody('width')} /></label>
      <label><span>세로 <output>{Math.round(body.height)}</output></span><input type="range" min="500" max="1000" step="5" value={Math.round(body.height)} onChange={(event) => updateBody('height', Number(event.target.value))} {...dragBody('height')} /></label>
    </div>
    <button type="button" className={styles.bodyReset} disabled={scope === 'layout' ? !layoutOverride : body.width === 850 && body.height === 850} onClick={() => scope === 'layout' ? removePaddingOverride(layoutType) : resetGlobalPadding()}>{scope === 'layout' ? '폰트 전체 설정 따르기' : '기본 850 × 850으로 되돌리기'}</button>
  </div>
}

const DEFAULT_WEIGHT = 400
/** 글로벌 스타일 공간에서 문장 글자 하나의 크기(px). 평소는 24. */
const STYLE_SPACE_EM = 140
const WEIGHT_STOPS = [100, 200, 300, 400, 500, 600, 700, 800, 900]

/** 굵기. 폰트 전체에 한 값이고 100 단위로만 멈춘다. 끄는 동안은 미리보기만, 손을 떼면 적용한다. 기울기는 저장소에 있지만 지금은 화면에 내놓지 않는다. */
function StyleToneControls({
  committed,
  draft,
  onDraftChange,
  onCommit,
}: {
  committed: StyleTone
  draft: StyleTone | null
  onDraftChange: (tone: StyleTone) => void
  onCommit: (before: StyleTone, after: StyleTone) => void
}) {
  const tone = draft ?? committed
  const commit = () => { if (draft) onCommit(committed, draft) }
  const setWeight = (weight: number | null) => { if (weight !== null && weight !== tone.weight) onDraftChange({ ...tone, weight }) }
  return <div className={styleMode.weight} role="tabpanel" aria-label="굵기 설정">
    <p><strong>폰트 전체에 한 값</strong><span>획 모양과 상자는 그대로입니다</span></p>
    <div className={styleMode.weightBox}>
      <div className={styleMode.weightHead}><span>굵기</span><output>{tone.weight}</output></div>
      <input type="range" min="100" max="900" step="100" value={tone.weight} aria-label="굵기" data-testid="style-weight" onChange={(event) => setWeight(Number(event.target.value))}
        onPointerDown={(event) => setWeight(startRangeDrag(event))} onPointerMove={(event) => setWeight(moveRangeDrag(event))}
        onPointerUp={(event) => { endRangeDrag(event); commit() }} onPointerCancel={(event) => { endRangeDrag(event); commit() }} onKeyUp={commit} onBlur={commit} />
      <div className={styleMode.ticks} aria-hidden="true">{WEIGHT_STOPS.map((stop) => <span key={stop} data-on={stop === tone.weight || undefined}>{stop}</span>)}</div>
    </div>
    <button type="button" disabled={tone.weight === DEFAULT_WEIGHT} onClick={() => onCommit(committed, { ...committed, weight: DEFAULT_WEIGHT })}>기본 400으로 되돌리기</button>
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
  const [previewTone, setPreviewTone] = useState<StyleTone | null>(null)
  const [previewBeak, setPreviewBeak] = useState<StemBeakStyle | null>(null)
  const [isShapeRuleOpen, setIsShapeRuleOpen] = useState(false)
  const [editMode, setEditMode] = useState<EditMode>(initialEditMode)
  // `획 고치기`로 들어온 자소. 획 편집에서 선택을 푼 채 `완료`해도 레이아웃이 이 부품을 다시 켠다.
  const [strokeEntryPart, setStrokeEntryPart] = useState<MobileEditorPart | null>(initialStrokePart)
  // 획 편집에 들어온 순간의 기록 길이. `뒤로`는 여기까지 되돌린다.
  const [strokeEntryMark, setStrokeEntryMark] = useState(0)
  const [pendingStrokePart, setPendingStrokePart] = useState<MobileEditorPart | null>(initialStrokePart)
  // Undo/Redo로 저장된 Δ가 바뀌면 레이아웃 편집부를 새로 띄워 세션 편집(절대값)을 버린다.
  const [layoutEpoch, setLayoutEpoch] = useState(0)
  // 방금 적용한 배치 범위. 문장 줄에서 그 범위에 든 글자를 표시한다(적용의 신호). 다음 편집이 시작되거나 글자를 떠나면 빈다.
  const [appliedScope, setAppliedScope] = useState<readonly ScopeRule[]>([])
  useEffect(() => { setAppliedScope([]) }, [selectedChar])
  const directInputRef = useRef<HTMLTextAreaElement>(null)
  // 셸 안의 `문장` 전체 화면. 커서 자리는 글자 수(코드 포인트)로 센다.
  const [sentenceSheetOpen, setSentenceSheetOpen] = useState(false)
  // 줄어드는 동안만 true. 그동안은 여러 줄 그대로 줄어들고, 끝나면 한 줄로 돌아간다.
  const [sentenceSheetClosing, setSentenceSheetClosing] = useState(false)
  // 펼친 문장 줄의 높이(px). 열 때 편집부 자리 전체를 재서 그만큼 자란다.
  const [sentenceSheetHeight, setSentenceSheetHeight] = useState(0)
  const [sentenceCaret, setSentenceCaret] = useState(0)
  const sheetInputRef = useRef<HTMLTextAreaElement>(null)
  const isGlobalStyleOpen = globalStylePanel !== null
  const isBrushStyleOpen = globalStylePanel === 'brush'
  // 셸 안에서는 글로벌 스타일을 연 동안 캔버스가 보기 전용이다(어느 탭이든, 어느 모드에서 열었든). 옛 단독 화면은 전처럼 획 스타일 탭에서만 잠근다.
  const styleLocksCanvas = chrome === 'workspace' ? globalStylePanel !== null : isBrushStyleOpen
  // 셸 안의 글로벌 스타일 공간: 캔버스를 치우고 문장 줄이 크게 자라 미리보기를 맡는다.
  const styleSpaceOpen = chrome === 'workspace' && globalStylePanel !== null
  const maps = useMemo(() => ({ choseong, jungseong, jongseong }), [choseong, jungseong, jongseong])
  const previewGlobalStyle = useMemo(() => {
    const strokeStyle = previewBrush ?? globalStyle.strokeStyle
    return { ...globalStyle, ...previewTone, stemBeak: previewBeak ?? globalStyle.stemBeak, strokeStyle, brush: strokeStyle.mode === 'brush' ? strokeStyle.brush : globalStyle.brush }
  }, [globalStyle, previewBeak, previewBrush, previewTone])
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
  // 획 편집에 잠긴 자소. 다른 자소는 눌리지 않는다. 빈 곳을 누르면 선택은 다 풀리고, 넣기 도구(추가 · 원)는 이 자소에 그대로 쓴다.
  const lockedPart = chrome === 'workspace' && !isLayoutMode ? strokeEntryPart : null
  // 왼쪽 표지에 그릴 자소. 끄는 중의 미리보기까지 담긴 `syllable`에서 꺼내 표지가 캔버스와 같이 움직인다.
  const strokeCardPart = lockedPart ?? (selection.kind !== 'none' ? selection.editorPart : null)
  const strokeCardJamo = strokeCardPart === 'CH' ? syllable.choseong : strokeCardPart === 'JU' ? syllable.jungseong : strokeCardPart === 'JO' ? syllable.jongseong : null
  const strokeCardInk = strokeCardPart && strokeCardJamo ? { part: strokeCardPart, jamo: strokeCardJamo } : null
  // 획 편집 `닿는 글자` 줄의 범위 자모. 고치는 자리의 자모 하나(`모든 ㅁ 글자`).
  const strokeRowJamo = layoutAvailable && strokeCardPart ? focusJamoOf(corpusIdentity(selectedChar.codePointAt(0) ?? 0xac00), strokeCardPart) : null
  const snapStep = fontUnitsToNormalized(grid.snapInterval, fontSpace)
  const minimumInkGap = fontUnitsToNormalized(grid.minorInterval, fontSpace)
  // 간격 경고: 고친 자소(기준 틀이 굳은 것)가 이 글자에서 옆 자소에 최소 간격보다 가깝고, 고치기 전(틀 = 고치기 전 획)보다 더 붙었을 때. 프리셋이 원래 좁은 글자는 안 울린다.
  const gapWarningParts = useMemo((): readonly MobileEditorPart[] => {
    if (chrome !== 'workspace' || placement.kind !== 'boxes') return NO_PARTS
    return (['CH', 'JU', 'JO'] as const).filter((part) => {
      const jamo = part === 'CH' ? syllable.choseong : part === 'JU' ? syllable.jungseong : syllable.jongseong
      if (!jamo?.frame) return false
      const beforeJamo: JamoData = { ...jamo, ...jamo.frame }
      const beforeSyllable: DecomposedSyllable = part === 'CH' ? { ...syllable, choseong: beforeJamo } : part === 'JU' ? { ...syllable, jungseong: beforeJamo } : { ...syllable, jongseong: beforeJamo }
      // 굵기를 올리면 중심선은 그대로고 잉크만 굵어진다. 간격도 화면에 보이는 굵기로 잰다.
      const weight = weightToMultiplier(previewGlobalStyle.weight)
      const now = getMinimumInterComponentInkGap(syllable, placement.boxes, part, weight)
      return now + 1e-6 < Math.min(minimumInkGap, getMinimumInterComponentInkGap(beforeSyllable, placement.boxes, part, weight))
    })
  }, [chrome, minimumInkGap, placement, previewGlobalStyle.weight, syllable])
  const sentenceEm = 24
  const calibrationLines = useMemo(() => [sampleSentence], [sampleSentence])
  // 셸 안(레이아웃 · 획 편집 둘 다)에서는 문장이 한 줄 가로 스크롤이다(아래 편집부에 세로 자리를 내준다). 고른 글자가 가려져 있으면 가로로만 끌어온다.
  const sentenceCompact = chrome === 'workspace'
  // 획 편집에서는 문장 줄이 위로 접혀 사라지고 `닿는 글자` 줄만 남는다. 그만큼 캔버스와 트랙패드가 커진다.
  const sentenceCollapsed = chrome === 'workspace' && layoutAvailable && !isLayoutMode && !styleLocksCanvas && !styleSpaceOpen
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

  // 레이아웃 편집기가 걸어 두는 `떠나기 전 묻기`. 저장 안 한 보선이 있으면 편집기가 묻고, 편집기가 없으면 바로 간다.
  const layoutLeaveGuardRef = useRef<LayoutLeaveGuard | null>(null)
  const guardLayoutLeave: LayoutLeaveGuard = (next, options) => layoutLeaveGuardRef.current ? layoutLeaveGuardRef.current(next, options) : next()
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
  const selectFromCanvas = (requested: Selection) => {
    let nextSelection = requested
    // 빈 곳은 피그마처럼 획 · 점 · 핸들을 다 푼다(획 편집에 잠긴 동안도). 잠긴 동안 다른 자소는 안 잡힌다.
    if (lockedPart && requested.kind !== 'none' && requested.editorPart !== lockedPart) return
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
  const randomSampleSentence = () => {
    const candidates = SAMPLE_SENTENCES.filter((sentence) => sentence !== sampleSentence)
    return candidates[Math.floor(Math.random() * candidates.length)]
  }
  const pickSampleSentence = () => {
    const nextSentence = randomSampleSentence()
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
  // `문장` 전체 화면: 문장만 바꾸고 편집하던 글자는 그대로 둔다(문장에서 빠져도).
  const openSentenceSheet = () => {
    const area = sentenceRef.current?.parentElement
    if (area) { area.scrollTop = 0; setSentenceSheetHeight(area.clientHeight) }
    if (sentenceRef.current) sentenceRef.current.scrollLeft = 0
    setSentenceCaret([...sampleSentence].length)
    setSentenceSheetClosing(false)
    setSentenceSheetOpen(true)
  }
  const closeSentenceSheet = () => {
    sheetInputRef.current?.blur()
    // 빈 문장으로 닫으면 작은 줄이 비므로 편집하던 글자 하나를 남긴다.
    if (!sampleSentence.trim()) setSampleSentence(selectedChar)
    setSentenceSheetOpen(false)
    setSentenceSheetClosing(true)
  }
  // 펼친 동안 아래 버튼 바가 자판 위로 뜨게 자판 높이를 잰다(보이는 화면 아래 끝 ~ 창 아래 끝).
  const [keyboardInset, setKeyboardInset] = useState(0)
  useEffect(() => {
    const viewport = window.visualViewport
    if (!sentenceSheetOpen || !viewport) return
    const measure = () => setKeyboardInset(Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop)))
    measure()
    viewport.addEventListener('resize', measure)
    viewport.addEventListener('scroll', measure)
    return () => {
      viewport.removeEventListener('resize', measure)
      viewport.removeEventListener('scroll', measure)
      setKeyboardInset(0)
    }
  }, [sentenceSheetOpen])
  // 줄어드는 시간(--motion-slow)이 지나면 한 줄로 돌아간다.
  useEffect(() => {
    if (!sentenceSheetClosing) return
    const timer = window.setTimeout(() => setSentenceSheetClosing(false), 260)
    return () => window.clearTimeout(timer)
  }, [sentenceSheetClosing])
  const placeSentenceCaret = (index: number) => {
    setSentenceCaret(index)
    const input = sheetInputRef.current
    if (!input) return
    // 누른 그 손길 안에서 포커스해야 폰 자판이 열린다.
    input.focus({ preventScroll: true })
    const offset = [...input.value].slice(0, index).join('').length
    input.setSelectionRange(offset, offset)
  }
  const syncSentenceCaret = (input: HTMLTextAreaElement) => {
    setSentenceCaret([...input.value.slice(0, input.selectionStart ?? input.value.length)].length)
  }
  // 글자를 누르면 가까운 쪽 가장자리, 빈 곳을 누르면 문장 끝.
  const pickSentenceCaret = (event: ReactMouseEvent<HTMLElement>) => {
    if (!sentenceSheetOpen) return
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-char-index]')
    if (!target) return placeSentenceCaret([...sampleSentence].length)
    const index = Number(target.dataset.charIndex)
    const rect = target.getBoundingClientRect()
    placeSentenceCaret(event.clientX < rect.left + rect.width / 2 ? index : index + 1)
  }
  const clearSentence = () => {
    setSampleSentence('')
    setIsCustomSentence(true)
    placeSentenceCaret(0)
  }
  // 주사위는 비우지 않고 새 문장으로 바꾼다. 값이 바뀌면 입력칸 커서는 저절로 끝으로 간다.
  const rollSentence = () => {
    const nextSentence = randomSampleSentence()
    setSampleSentence(nextSentence)
    setIsCustomSentence(false)
    setSentenceCaret([...nextSentence].length)
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
  const applyEnds = (ends: StrokeEnds) => {
    const store = useGlobalStyleStore.getState()
    store.updateLinecap(ends.linecap)
    store.updateLinejoin(ends.linejoin)
  }
  // `각진 끝 ↔ 둥근 끝`은 붓촉은 같고 끝 모양만 다르다. 한 번 고른 것이 되돌리기 한 줄이 되게 끝 모양을 같은 기록에 싣는다.
  const commitBrush = (before: StrokeRenderStyle, after: StrokeRenderStyle, ends?: { before: StrokeEnds; after: StrokeEnds }) => {
    const endsChanged = ends && (ends.before.linecap !== ends.after.linecap || ends.before.linejoin !== ends.after.linejoin) ? ends : undefined
    if (JSON.stringify(before) === JSON.stringify(after) && !endsChanged) {
      setPreviewBrush(null)
      return
    }
    setHistory((entries) => [...entries, { kind: 'brush', before, after, ends: endsChanged }])
    setFuture([])
    useGlobalStyleStore.getState().setStrokeRenderStyle(after)
    if (endsChanged) applyEnds(endsChanged.after)
    setPreviewBrush(null)
  }
  const applyTone = (tone: StyleTone) => {
    const { updateStyle } = useGlobalStyleStore.getState()
    updateStyle('weight', tone.weight)
    updateStyle('slant', tone.slant)
  }
  const commitTone = (before: StyleTone, after: StyleTone) => {
    setPreviewTone(null)
    if (before.weight === after.weight && before.slant === after.slant) return
    setHistory((entries) => [...entries, { kind: 'tone', before, after }])
    setFuture([])
    applyTone(after)
  }
  const commitBeak = (before: StemBeakStyle, after: StemBeakStyle) => {
    setPreviewBeak(null)
    if (JSON.stringify(before) === JSON.stringify(after)) return
    setHistory((entries) => [...entries, { kind: 'beak', before, after }])
    setFuture([])
    useGlobalStyleStore.getState().setStemBeak(after)
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
    setPreviewTone(null)
    setPreviewBeak(null)
    setGlobalStylePanel(null)
  }
  // 기록 한 줄을 저장소에서 되돌린다. 기록 · 선택 정리는 호출자가 한다.
  const revertEntry = (entry: HistoryEntry) => {
    if (entry.kind === 'layout') useLayoutStore.getState().setUserPartOverrides(entry.layoutType, entry.beforeOverrides)
    else if (entry.kind === 'layoutDelta') { useLayoutDeltaStore.getState().restore(entry.before); setLayoutEpoch((epoch) => epoch + 1) }
    else if (entry.kind === 'brush') { useGlobalStyleStore.getState().setStrokeRenderStyle(entry.before); if (entry.ends) applyEnds(entry.ends.before) }
    else if (entry.kind === 'tone') applyTone(entry.before)
    else if (entry.kind === 'beak') useGlobalStyleStore.getState().setStemBeak(entry.before)
    else updateJamo(entry.before)
    if (entry.kind === 'layout' || entry.kind === 'jamo') useCalibrationProjectStore.getState().removeSampleGlyphEdit(entry.edit.id)
  }
  // `뒤로`: 이번에 획 편집에 들어와서 한 일을 전부 되돌리고 레이아웃으로 나간다. 되돌린 것은 Redo에 쌓여서 다시 살릴 수 있다.
  const strokeEditCount = Math.max(0, history.length - strokeEntryMark)
  const [strokeBackAsk, setStrokeBackAsk] = useState(false)
  // `뒤로`는 고친 게 있으면 먼저 묻는다. 끄는 즉시 저장되지만 사용자에게 `뒤로`는 버리기다.
  const askStrokeBack = () => strokeEditCount > 0 ? setStrokeBackAsk(true) : cancelStrokeEdits()
  const cancelStrokeEdits = () => {
    setStrokeBackAsk(false)
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
    else if (entry.kind === 'brush') { useGlobalStyleStore.getState().setStrokeRenderStyle(entry.after); if (entry.ends) applyEnds(entry.ends.after) }
    else if (entry.kind === 'tone') applyTone(entry.after)
    else if (entry.kind === 'beak') useGlobalStyleStore.getState().setStemBeak(entry.after)
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
  // `inSheet`: 전체 화면 문장. 글자를 눌러도 편집을 열지 않고, 누른 자리는 바깥(`pickSentenceCaret`)이 `data-char-index`로 읽는다.
  const renderSentenceCharacter = (char: string, charIndex: number, lineIndex: number, inSheet = false) => {
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
    // 방금 적용한 범위에 든 글자. 적용이 어디까지 닿았는지 문장에서 바로 보인다.
    const isScopeApplied = appliedScope.length > 0 && isEditableHangul(char) && (() => {
      const identity = corpusIdentity(char.codePointAt(0) ?? 0)
      return appliedScope.some((rule) => matchesRule(rule, identity))
    })()
    return isEditableHangul(char)
      ? inSheet
        ? <button key={`${lineIndex}-${char}-${charIndex}`} style={{ inlineSize: width }} type="button" tabIndex={-1} data-char-index={charIndex} aria-label={`${char} 앞뒤에 커서 두기`}>
            <Glyph char={char} size={sentenceEm} maps={maps} schemas={schemas} globalPadding={globalPadding} paddingOverrides={paddingOverrides} previewJamo={previewJamo} previewSchema={previewSchema} layoutHighlight={null} globalStyle={previewGlobalStyle} />
          </button>
        : <button key={`${lineIndex}-${char}-${charIndex}`} style={{ inlineSize: width }} type="button" aria-current={char === selectedChar ? 'true' : undefined} data-ink-gap-limiter={inkGapLimiter?.id === contextId ? 'true' : undefined} data-ink-safety-adjusted={isSafetyAdjusted ? 'true' : undefined} data-layout-applied={isScopeApplied ? 'true' : undefined} aria-label={`${char} 편집${isSafetyAdjusted ? ', 충돌 안전 보정됨' : ''}`} onClick={() => char === selectedChar ? chooseChar(char) : guardLayoutLeave(() => chooseChar(char))}>
          <Glyph char={char} size={sentenceEm} maps={maps} schemas={schemas} globalPadding={globalPadding} paddingOverrides={paddingOverrides} previewJamo={previewJamo} previewSchema={previewSchema} layoutHighlight={layoutHighlight} globalStyle={previewGlobalStyle} />
        </button>
      : <span key={`${lineIndex}-${char}-${charIndex}`} data-char-index={inSheet ? charIndex : undefined} className={/\s/u.test(char) ? styles.spaceGlyph : styles.punctuationGlyph} style={{ inlineSize: width }} aria-label={/\s/u.test(char) ? '공백' : char}>{char}</span>
  }
  // 셸 안에서는 도구가 머리 `…` 메뉴로 들어가 이름이 붙고, 실행취소·다시실행은 셸 머리에 있으니 뺀다.
  const menuLabel = (text: string) => chrome === 'workspace' ? <em>{text}</em> : null
  const toggleGlobalStyle = () => isGlobalStyleOpen ? closeGlobalStyle() : guardLayoutLeave(() => { if (sentenceSheetOpen) closeSentenceSheet(); setGlobalStylePanel('body') })
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
      {chrome === 'standalone' && <button type="button" data-active={isGlobalStyleOpen || undefined} onClick={toggleGlobalStyle} aria-label="글로벌 스타일 설정" title="글자 네모꼴과 획 스타일"><Settings2 size={18} />{menuLabel('네모꼴 · 획 스타일')}</button>}
      {chrome === 'standalone' && <>
        <button type="button" onClick={undo} disabled={history.length === 0} aria-label="마지막 편집 되돌리기"><Undo2 size={18} />{history.length > 0 && <span>{history.length}</span>}</button>
        <button type="button" onClick={redo} disabled={future.length === 0} aria-label="되돌린 편집 다시 실행"><Redo2 size={18} /></button>
      </>}
    </nav>
  )
  // 펼친 문장 줄의 글자들. 글자를 누르면 그 자리에 커서, 빈 곳은 끝. 편집은 열지 않는다.
  const renderSheetRun = () => {
    const chars = [...sampleSentence]
    const caret = (key: string) => <span key={key} className={styles.directInputCaret} aria-hidden="true" data-testid="sentence-sheet-caret" />
    const withCaret = (char: string, index: number) => index === sentenceCaret ? [caret(`caret-${index}`), renderSentenceCharacter(char, index, 0, true)] : [renderSentenceCharacter(char, index, 0, true)]
    return <>
      {/* 단어와 뒤 공백을 한 덩어리로 묶어 줄이 바뀔 때 공백이 다음 줄 앞에 서지 않게 한다. 엔터(\n)는 줄을 끊는다. */}
      {chars.reduce<({ kind: 'word'; start: number; text: string } | { kind: 'break'; index: number })[]>((groups, char, index) => {
        const last = groups.at(-1)
        if (char === '\n') groups.push({ kind: 'break', index })
        else if (last?.kind === 'word' && (/\s/u.test(char) || !/\s$/u.test(last.text))) last.text += char
        else groups.push({ kind: 'word', start: index, text: char })
        return groups
      }, []).map((group, groupIndex, groups) => group.kind === 'break'
        // 빈 줄(엔터 두 번 · 맨 앞 엔터)도 한 줄 높이를 차지하게 폭 없는 버팀목을 세운다.
        ? [(groupIndex === 0 || groups[groupIndex - 1].kind === 'break') && <span key={`empty-${group.index}`} className={styles.emptyLine} aria-hidden="true" />, group.index === sentenceCaret && caret(`caret-${group.index}`), <span key={`break-${group.index}`} className={styles.lineBreak} aria-hidden="true" />]
        : <span key={`word-${group.start}`} className={styles.wordRun}>{[...group.text].flatMap((char, index) => withCaret(char, group.start + index))}</span>)}
      {sentenceCaret >= chars.length && caret('caret-end')}
      {chars.length === 0 && <span className={styles.sentenceSheetHint}>고칠 글자가 든 문장을 적어 보세요</span>}
    </>
  }
  const body = (
    <>
      {/* 문장 줄부터 편집부까지 한 덩어리. 레이아웃 모드에서만 세로로 밀린다 — `내 문장`이 위로 빠지고 `닿는 글자` 줄이 그 자리에 붙는다.
          두 모드가 같은 덩어리를 써야 오갈 때 문장 줄이 다시 안 그려진다(가로 스크롤 자리 유지). */}
      <div className={styles.scrollArea} data-scroll={(isLayoutMode && !styleLocksCanvas) || undefined} data-sheet={sentenceSheetOpen || sentenceSheetClosing || undefined}>
      <section ref={sentenceRef} className={`${styles.sentence} ${chrome === 'workspace' ? styleMode.strip : ''}`} data-compact={sentenceCompact || undefined} data-grown={styleSpaceOpen || undefined} data-sheet={sentenceSheetOpen || undefined} data-sheet-wrap={sentenceSheetOpen || sentenceSheetClosing || undefined} style={{ '--sheet-h': `${sentenceSheetHeight}px` } as CSSProperties} onClick={pickSentenceCaret} data-collapsed={sentenceCollapsed || undefined} aria-hidden={sentenceCollapsed || undefined} inert={sentenceCollapsed || undefined} aria-label="보정 문장">
        {/* 셸 안에서는 돋보기 하나. 누르면 문장 줄이 그 자리에서 펼쳐지고, 같은 자리의 닫기로 접힌다. 문장 바꾸기(주사위 · 직접 입력)는 펼친 줄에서 한다. */}
        {chrome === 'workspace' ? <>
        <div className={styles.sentenceActions}>
          <button type="button" className={styles.sentenceOpen} onClick={(event) => { event.stopPropagation(); if (sentenceSheetOpen) closeSentenceSheet(); else openSentenceSheet() }} aria-label={sentenceSheetOpen ? '문장 접기' : '문장 크게 보기 · 바꾸기'} aria-expanded={sentenceSheetOpen} title={sentenceSheetOpen ? '문장 접기' : '문장 크게 보기 · 바꾸기'} data-testid="sentence-sheet-toggle">{sentenceSheetOpen ? <X size={19} aria-hidden="true" /> : <ZoomIn size={19} aria-hidden="true" />}</button>
        </div>
        {sentenceSheetOpen && <>
          <textarea
            ref={sheetInputRef}
            className={styles.sheetInput}
            value={sampleSentence}
            onChange={(event) => { setSampleSentence(event.target.value); setIsCustomSentence(true); syncSentenceCaret(event.target) }}
            onSelect={(event) => syncSentenceCaret(event.currentTarget)}
            aria-label="문장 입력"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
          {/* 아래 버튼 바. 화면 아래에 떠 있고, 자판이 열리면 자판 위로 올라간다. 누를 때 입력칸 포커스를 뺏지 않아 자판이 닫히지 않는다. */}
          <div className={styles.sentenceSheetBar} style={{ '--keyboard-inset': `${keyboardInset}px` } as CSSProperties} onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.preventDefault()} onMouseDown={(event) => event.preventDefault()}>
            <button type="button" onClick={rollSentence} aria-label="예시 문장 바꾸기" data-testid="sentence-sheet-roll"><Dices size={18} aria-hidden="true" />다른 문장</button>
            <button type="button" onClick={clearSentence} disabled={sampleSentence.length === 0} aria-label="문장 전체 삭제" data-testid="sentence-sheet-clear"><Delete size={18} aria-hidden="true" />전체 삭제</button>
          </div>
        </>}
        </> : <>
        <div className={styles.sentenceActions}>
          <button type="button" onClick={() => guardLayoutLeave(pickSampleSentence)} aria-label="예시 문장 무작위 선택" title="예시 문장 바꾸기"><Dices size={19} aria-hidden="true" /></button>
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
        </>}
        {calibrationLines.map((line, lineIndex) => <div key={line} className={`${styles.sentenceRun} ${chrome === 'workspace' ? styleMode.run : ''}`} style={{ fontSize: sentenceSheetOpen ? SENTENCE_SHEET_EM : styleSpaceOpen ? STYLE_SPACE_EM : sentenceEm }}>
          {sentenceSheetOpen ? renderSheetRun() : tokenizeSentenceLine(line).map((token) => token.whitespace
            ? [...token.text].map((char, index) => renderSentenceCharacter(char, token.start + index, lineIndex))
            : <span key={`${lineIndex}-word-${token.start}`} className={styles.wordRun}>{[...token.text].map((char, index) => renderSentenceCharacter(char, token.start + index, lineIndex))}</span>
          )}
          {isDirectInputActive && <span className={styles.directInputCaret} aria-hidden="true" />}
        </div>)}
      </section>

      {isLayoutMode && !styleLocksCanvas ? <section className={styles.layoutMode} aria-label={`${selectedChar} 레이아웃 수정`} data-testid="jamo-layout-mode">
        <GlyphLayoutEditor key={`${selectedChar}:${layoutEpoch}`} codepoint={selectedChar.codePointAt(0) ?? 0xac00} initialPart={selection.kind === 'none' ? strokeEntryPart ?? undefined : selection.editorPart} onCommitted={commitLayoutDelta} onEditStrokes={editStrokes} onPickCharacter={chooseChar} onScopeApplied={setAppliedScope} leaveGuardRef={layoutLeaveGuardRef} />
      </section> : <>
      {/* 획 편집에도 같은 자리·같은 높이로 `닿는 글자` 줄이 선다. 범위는 고치는 자모가 든 글자 전부(레이아웃을 안 가린다).
          줄이 두 모드에 다 있어야 `획 고치기`로 오갈 때 캔버스가 안 튄다. */}
      {chrome === 'workspace' && layoutAvailable && !styleLocksCanvas && strokeRowJamo && strokeCardPart &&
        <TouchedGlyphRow source={corpusIdentity(selectedChar.codePointAt(0) ?? 0xac00)} bundle={notoBundle} edit={NO_LAYOUT_EDIT} ghostVisible={false} focus={strokeCardPart} scope="jamo" group={strokeCardPart} jamos={[strokeRowJamo]} anyContext />}
      {!styleSpaceOpen && <section className={styles.editor} data-chrome={chrome} data-stroke-tools={!globalStylePanel && directManipulation ? true : undefined} aria-label={`${selectedChar} 완성 글자 편집`}>
        {/* 셸 안에서는 레이아웃 모드와 같은 자리(캔버스 왼쪽)에 같은 여섯 칸 표지가 선다. 획 편집에서는 `기본` 칸이 하나 더 오고 칸마다 고치는 자소가 그려진다. */}
        <div className={styles.strokeStage}>
        {chrome === 'workspace' && layoutAvailable && !styleLocksCanvas && <LayoutContextCards activeContextId={corpusIdentity(selectedChar.codePointAt(0) ?? 0xac00).contextId} allActive={false} ink={strokeCardInk ?? undefined} />}
        <div className={styles.focusArea}>
        <FocusedGlyph char={selectedChar} syllable={syllable} schema={effectiveSchema} selection={styleLocksCanvas ? { kind: 'none' } : selection} onSelect={styleLocksCanvas ? () => {} : selectFromCanvas} selectedPoints={styleLocksCanvas ? [] : selectedPoints} onPointSelect={styleLocksCanvas ? () => {} : selectPointFromCanvas} lockedPart={styleLocksCanvas ? null : lockedPart} dragApiRef={directManipulation && !styleLocksCanvas ? dragApiRef : undefined} gapWarningParts={gapWarningParts} fontSpace={fontSpace} grid={grid} designBody={designBody} globalStyle={previewGlobalStyle} />
        </div>
        </div>
      </section>}

      {globalStylePanel ? <GlobalStyleTrackpad
        panel={globalStylePanel}
        onPanelChange={(panel) => { setPreviewBrush(null); setPreviewTone(null); setPreviewBeak(null); setGlobalStylePanel(panel) }}
        fill={chrome === 'workspace'}
        onClose={closeGlobalStyle}
        bodyControls={chrome === 'workspace' ? <DesignBodyShapeControls fontSpace={fontSpace} /> : <DesignBodyControls layoutType={previewedSyllable.layoutType} fontSpace={fontSpace} />}
        brushControls={<BrushStyleTrackpad
          committed={globalStyle.strokeStyle}
          draft={previewBrush}
          onDraftChange={setPreviewBrush}
          onCommit={commitBrush}
          ends={{ linecap: globalStyle.linecap, linejoin: globalStyle.linejoin }}
          renderPreview={(strokeStyle, ends) => <Glyph char="한" size={42} maps={maps} schemas={schemas} globalPadding={globalPadding} paddingOverrides={paddingOverrides} previewJamo={null} previewSchema={null} layoutHighlight={null} globalStyle={{ ...globalStyle, ...ends, strokeStyle, brush: strokeStyle.mode === 'brush' ? strokeStyle.brush : globalStyle.brush }} />}
          embedded
          productOptions={chrome === 'workspace'}
        />}
        beakControls={<StemBeakControls committed={globalStyle.stemBeak ?? DEFAULT_STEM_BEAK} draft={previewBeak} onDraftChange={setPreviewBeak} onCommit={commitBeak} />}
        toneControls={<StyleToneControls committed={{ weight: globalStyle.weight, slant: globalStyle.slant }} draft={previewTone} onDraftChange={setPreviewTone} onCommit={commitTone} />}
      /> : <InferenceTrackpad
        glyph={selectedChar}
        syllable={syllable}
        selection={selection}
        selectedPoints={selectedPoints}
        layoutType={syllable.layoutType}
        schema={effectiveSchema}
        creationSelection={lockedPart && selection.kind === 'none' ? firstStrokeSelectionOf(lockedPart) : null}
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
      />}
      {/* 획 편집은 끄는 즉시 저장된다. `완료`는 저장이 아니라 레이아웃으로 돌아가는 문이다. */}
      {layoutAvailable && !globalStylePanel && <div className={styles.strokeDoneBar}>
        {boxFitIssue && <p role="status" data-testid="jamo-box-fit-issue">이 획은 모델 상자에 안 맞아 옛 배치로 그립니다 · {boxFitIssue.message}</p>}
        {/* `완료`는 고친 채로, 왼쪽 `뒤로`는 이번에 들어와서 고친 것을 되돌리고 레이아웃으로 나간다(취소). */}
        <div className={styles.strokeDoneRow}>
          <button type="button" className={styles.strokeBack} onClick={askStrokeBack} aria-label="고친 획을 되돌리고 레이아웃으로 돌아가기" title="고친 획을 되돌리고 레이아웃으로" data-testid="jamo-stroke-back"><ArrowLeft size={18} /></button>
          <button type="button" onClick={() => chooseEditMode('layout')} data-testid="jamo-stroke-done">완료</button>
        </div>
      </div>}
      {strokeBackAsk && <div className={leaveSheetStyles.leaveBackdrop} onClick={() => setStrokeBackAsk(false)} data-testid="stroke-back-backdrop">
        <div className={leaveSheetStyles.leaveSheet} role="alertdialog" aria-modal="true" aria-label="저장 안 한 획" onClick={(event) => event.stopPropagation()} data-testid="stroke-back-dialog">
          <header>
            <b>고친 획이 아직 저장되지 않았어요</b>
            <small>{strokeEditCount}번 고침 · 저장하지 않고 나가면 되돌아가요.</small>
          </header>
          <div className={leaveSheetStyles.leaveActions}>
            <button type="button" className={leaveSheetStyles.leaveSave} onClick={() => { setStrokeBackAsk(false); chooseEditMode('layout') }} data-testid="stroke-back-save">저장하고 나가기</button>
            <button type="button" onClick={cancelStrokeEdits} data-testid="stroke-back-discard">저장하지 않고 나가기</button>
          </div>
        </div>
      </div>}
      </>}
      </div>
      {isShapeRuleOpen && selection.kind !== 'none' && <ShapeRulePanel jamo={selection.jamo} selectedStrokeId={selection.kind === 'component' ? null : selection.strokeId} onClose={() => setIsShapeRuleOpen(false)} />}
    </>
  )
  if (chrome === 'workspace') {
    return (
      <MobileWorkspaceShell
        activeArea="jamo"
        projectName={projectName}
        history={{ canUndo: history.length > 0, canRedo: future.length > 0, onUndo: () => guardLayoutLeave(undo, { saveable: false }), onRedo: () => guardLayoutLeave(redo, { saveable: false }) }}
        menu={<div data-edit-mode={isLayoutMode ? 'layout' : 'stroke'} data-testid="jamo-toolbar">{actions}</div>}
        tools={<button type="button" className={styleMode.headerTool} data-active={isGlobalStyleOpen || undefined} onClick={toggleGlobalStyle} aria-label="글로벌 스타일 설정" aria-pressed={isGlobalStyleOpen} title="폰트 전체에 먹는 네모꼴 · 획 모양 · 굵기 · 부리"><Settings2 size={18} /></button>}
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
