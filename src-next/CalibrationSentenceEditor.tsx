import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from 'react'
import { Check, ChevronLeft, Circle, ClipboardPaste, Copy, Dices, Download, Import, Link2, ListTree, LoaderCircle, Maximize2, Minimize2, Minus, Pencil, Plus, Redo2, RotateCcw, Scan, Settings2, Share2, SlidersHorizontal, Spline, Square, TextCursorInput, Trash2, Undo2, Unlink, X, ZoomIn } from 'lucide-react'
import { createPortal } from 'react-dom'
import { create } from 'zustand'
import { SvgRenderer } from '../src/renderers/SvgRenderer'
import { loadGhostVisible, saveGhostVisible, useGhostComparison, useNotoGhost } from './notoGhostCompare'
import { DevGhostToggle } from './DevGhostToggle'
import { ensureDevNotoFont } from './devNotoSwap'
import { DEV_TOOLS_ENABLED } from './devTools'
import { facesToBox, identityOfSyllable } from '../src/services/contextBoxResolver'
import { contextPlacementOf, useContextPlacement, useNotoModel } from './notoModel'
import { GlyphLayoutEditor } from './GlyphLayoutEditor'
import { effectiveLayoutDelta, useLayoutDeltaStore } from './layoutDeltaStore'
import type { LayoutDeltaSnapshot } from './layoutDeltaStore'
import { useEditHistoryStore } from './editHistoryStore'
import { newLayoutEntry } from './layoutEntry'
import { adoptFamilyStrokes, familyOfSyllable, hasFamilyStrokes, mergeFamilyStrokes, splitFamilyStrokes, wholeJamoStrokes, writeFamilyStrokes } from '../src/utils/jamoContextStrokes'
import type { MedialFamily } from '../src/types'
import { VariantGateCard } from './VariantGateCard'
import { VariantDrawer } from './VariantDrawer'
import { countOwnJoins, miterLimitOf, withoutOwnJoins } from '../src/services/strokeJoin'
import { baseStrokeThickness, isBaseThickness, STROKE_THICKNESS_PERCENT, thicknessAtPercent, thicknessPercent } from '../src/services/strokeThickness'
import { centerlineInkGroups } from '../src/services/finalGlyphInk'
import { brushInkGroupsToSvgPaths } from '../src/services/brushGeometry'
import { DOUBLE_SPLIT, doubleFromSingle } from '../src/utils/jamoFromChoseong'
import { withFrameFrom, withoutFrame } from '../src/utils/jamoFrame'
import { weightToMultiplier } from '../src/utils/globalStyleUtils'
import { faceSnapCandidates, horizontalStrokeEndsX, jamoVertexCandidates, pointAnchors, snapStrokeDrag, strokeBodyAnchors, strokeSnapCandidates, withoutOwnCandidates } from './strokeSnap'
import type { SnapAnchors } from './strokeSnap'
import type { SnapCandidate, SnapHit } from './railSnap'
import { baselineRails } from './notoBaselineRails'
import { useNotoGlyph } from './useNotoGlyph'
import { PART_COLOR, PART_LABEL } from './partColors'
import { randomSampleSentence, SAMPLE_SENTENCES } from './sampleSentences'
import { getBaseJamo, useJamoStore } from '../src/stores/jamoStore'
import { useWorkbenchStore, workbenchJamoOf, workbenchSyllable } from '../src/stores/workbenchStore'
import { groupMatching, useJamoGroupStore } from '../src/stores/jamoGroupStore'
import confirmStyles from './workspace/FontExportDialog.module.css'
import { mergeLayoutPadding, mergePadding, useLayoutStore } from '../src/stores/layoutStore'
import { hangulAdvance as fontMetricsAdvance, hangulLeftBearing, SPACE_ADVANCE } from '../src/services/fontMetrics'
import { jamoCenterlineCenter, limitJamoMoveDelta, limitJamoScale, moveHandle, movePoint, moveStroke, scaleJamoStrokes, scaleStrokes, snapWholeJamoDelta, translateJamoStrokes, type StrokeBoundsOf } from '../src/services/editorCommands'
import { stemEditBox, storedStemDelta } from '../src/services/stemBend'
import { stemRailGuides } from '../src/services/medialStemRails'
import { StemSpreadSheet } from './StemSpreadSheet'
import { beforeSpreadJamo, defaultPicked, lockedKeys, pickedMasters, shapeAskForStroke, shapePreview, spreadableStem, type ShapeAsk } from './stemShapeSession'
import { useStemMasterStore } from '../src/stores/stemMasterStore'
import type { StemMasters } from '../src/services/stemMaster'
import { survivingStrokeId } from '../src/services/strokeGrammar'
import { JamoScaleSlider } from './JamoScaleSlider'
import { scaleLayoutParts, translateLayoutParts } from '../src/services/layoutProfileCommands'
import { getRenderedStrokeTargets } from '../src/services/mobileEditorContext'
import { LayoutContextCards } from './LayoutContextCards'
import { corpusIdentity, corpusIdentityOf } from './notoCorpus'
import { TouchedGlyphRow } from './TouchedGlyphRow'
import { focusJamoOf, NO_LAYOUT_EDIT } from './reviewPropagation'
import { matchesRule } from './scopeRule'
import type { ScopeRule } from './scopeRule'
import { useUnifiedTrackpad } from '../src/features/mobile-editor/useUnifiedTrackpad'
import { calculateBoxes } from '../src/utils/layoutCalculator'
import { decomposeSyllable } from '../src/utils/hangulUtils'
import { createCirclePath, pointsToSvgD } from '../src/utils/pathUtils'
import { getJamoRenderBox } from '../src/utils/jamoGeometry'
import { addPenStroke, fitJamoToCell, PEN_DEFAULT_THICKNESS, penJamoState, presetChannelOf, removePenStrokes, sameStrokePlaces, viewBoxToJamoBox } from '../src/services/penJamo'
import type { PenChannel } from '../src/services/penJamo'
import type { PenPoint } from '../src/services/penStrokeFit'
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
  StrokeLinecap,
  StrokeLinejoin,
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
import { designBodyPaddingOfSize, paddingToDesignBody } from './designBody'
import { useFontExportStore } from './fontExportStore'
import { resolveEffectiveStyle, useGlobalStyleStore, type GlobalStyle } from '../src/stores/globalStyleStore'
import { BrushStyleTrackpad, JoinPicto, NonePicto, type StrokeEnds } from './BrushStyleTrackpad'
import { JOIN_CHOICES } from './strokeJoinChoices'
import { RangeTicks } from './RangeTicks'
import { wholeOutlineRegion } from './wholeOutlineRegion'
import { StemBeakControls } from './StemBeakControls'
import { designBodyAxis, designBodySvgTransform, REFERENCE_HEIGHT, REFERENCE_WIDTH } from '../src/services/designBodyPlacement'
import { withBodyCompensation } from '../src/services/bodyCompensation'
import { stemScaleOf } from '../src/services/strokeRenderGeometry'
import { endRangeDrag, moveRangeDrag, startRangeDrag } from './rangeDrag'
import { DEFAULT_STEM_BEAK, type StemBeakStyle } from '../src/services/stemBeak'
import styleMode from './GlobalStyleMode.module.css'
import { EDIT_COLOR } from './editColors'
import { Button } from './components/ui/button'
import { Pressable } from './components/ui/pressable'
import { ChoiceGroup, ChoiceItem } from './components/ui/choice-group'
import { Checkbox } from './components/ui/checkbox'
import { Field, RangeBar } from './components/ui/range'
import { GlobalStyleTrackpad, type GlobalStylePanel } from './GlobalStyleTrackpad'
import { SentenceTextarea } from './SentenceTextarea'
import { SentenceSheetControls, SentenceSheetRun } from './SentenceSheet'
import { copyText, useSentenceSheet } from './sentenceSheetState'
import { GRID_SYSTEM_2_STROKE_UNITS, GRID_SYSTEM_2_UNIT } from '../src/services/gridSystem2Geometry'
import { ShapeRulePanel } from './ShapeRulePanel'
import { isDeleteKey, isTypingTarget } from './workspace/keyboardShortcuts'
import { MobileWorkspaceShell } from './workspace/WorkspaceChrome'
import { useUIStore } from '../src/stores/uiStore'

/** 어느 껍데기 안에 그릴지. standalone = 옛 `/` 전체 화면, workspace = 셸 자소 탭 안. */
export type EditorChrome = 'standalone' | 'workspace'
/** 셸 안 편집기의 자리. `edit`는 자소 탭(캔버스), `style`은 폰트 탭(글로벌 스타일 공간만, 캔버스 없음). */
export type EditorSpace = 'edit' | 'style'

const VIEW_BOX_SIZE = 100
/** 전역 획 스타일이 없을 때 펜 덧그림의 면 그리기가 쓰는 기본(둥근 붓촉). */
const PEN_FILLED_STYLE: StrokeRenderStyle = { mode: 'brush', brush: { tip: 'round', aspectRatio: 1, angle: 0 } }
/** 검수 캔버스와 같은 여백. 글자 칸(0–1) 밖 0.08씩 더 보여 라벨·튀어나온 획이 잘리지 않는다. */
const CANVAS_VIEWPORT = { x: -0.08, y: -0.08, width: 1.16, height: 1.16 }
/** 자소 단독(`ㄴ`)을 열면 캔버스가 그 자소 잉크에 맞춰 당겨진다. 잉크 긴 변에 이만큼씩 여백을 둔다. 글자 크기(저장값)는 그대로, 보기만 확대다. */
const SOLO_VIEW_MARGIN = 0.28

/** 자소 하나만 있는 글자면 그 잉크 상자에 맞춘 정사각 보기 창. 아니면 글자판 전체. 판보다 크게 물러나지는 않는다. */
function canvasViewportFor(syllable: DecomposedSyllable, inkBoxes: Partial<Record<Part, BoxConfig>>): BoxConfig {
  const box = syllable.choseong && !syllable.jungseong && !syllable.jongseong ? inkBoxes.CH : undefined
  if (!box) return CANVAS_VIEWPORT
  const side = Math.min(CANVAS_VIEWPORT.width, Math.max(box.width, box.height) * (1 + SOLO_VIEW_MARGIN * 2))
  return { x: box.x + box.width / 2 - side / 2, y: box.y + box.height / 2 - side / 2, width: side, height: side }
}

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
/** `shownBox`는 이동량을 비율로 나눈 칸(끌기를 시작할 때 그 획이 놓인 칸). 안 주면 선택이 기억한 칸. */
type StrokeDragApi = { begin: () => void; change: (movement: StrokeMoveDelta, shownBox?: BoxConfig) => void; commit: () => void; cancel: () => void }
/**
 * 캔버스에 올리는 펜 층(플랜 2026-10-05 고스트 따라 긋기, 10-06 펜 = 도구). 있으면 잠긴 자소의 눌림 영역을 걷고 투명 판 하나가 긋기를 받는다 — 펜이 켜진 동안은 늘 긋는다.
 * 점은 지금 자모가 놓이는 상자(기존 획이 놓인 바로 그 상자)의 0–1로 올린다 — 저장한 획이 그은 자리에 그대로 놓인다.
 */
type PenCanvas = {
  renderPart: Part
  /** 지금 자모(문맥 계열 변형을 기본 획으로 올린 것). */
  jamo: JamoData
  /** 긋는 중인 획의 굵기 · 끝 모양 견본. */
  sample: Pick<StrokeDataV2, 'thickness' | 'linecap' | 'linejoin'>
  /** 이번에 펜을 켠 뒤 그은 획 id. 이 획만 제 색이고 전부터 있던 획은 옅다. */
  freshIds: ReadonlySet<string>
  onStroke: (points: PenPoint[]) => void
}

/** 도구 줄에 내려 주는 펜 · 맞춤 상태와 동작(상태는 부모가 든다). */
type PenTool = {
  active: boolean
  /** 펜을 못 쓰는 이유(단추 설명). 쓸 수 있으면 null. */
  blocked: string | null
  /** 칩에 띄울 인식 상태. */
  status: string
  /** 켜고 끈다. */
  onToggle: () => void
  /** `맞춤`을 누르면 달라질 게 있는지. 이미 칸 안이면 false. */
  canFit: boolean
  onFit: () => void
  /** 펜이 켜진 동안 고른 획(묶음)을 지운다. 남은 그은 획은 빈 역할을 다시 받는다. */
  onDelete: (strokeIds: readonly string[]) => void
  /** 개발용: 마지막 펜 입력과 자모 상태를 클립보드로. 복사됐으면 true. */
  devCopyRaw?: () => Promise<boolean>
}

/** 끌기로 치는 최소 거리(px). 이보다 짧으면 누르기다. 조절판도 같은 문턱을 쓴다. */
const DRAG_THRESHOLD_PX = 3
/** 펜이 켜진 동안 톡 누르기로 치는 거리(px). 손을 뗄 때까지 이 안에서만 움직였으면 긋지 않고 그 자리의 획을 고른다. */
const PEN_TAP_SLOP_PX = 6
/** 펜 점 솎기(화면 px). 앞 점에서 이만큼 못 간 점은 받지 않는다 — 펜슬 떨림이 점을 촘촘히 쌓아 급꺾임이 생기고 곡선이 과해지는 것을 막는다. */
const PEN_MIN_STEP_PX = 6
/**
 * 조절판 끌기를 캔버스 끌기와 같은 계산(px → em, 같은 스냅)으로 돌리는 문. 캔버스가 연다.
 * `move`는 조절판에서 손가락이 간 거리(px). `begin`이 false면 지금 선택으로는 못 끈다(조절판 옛 계산으로 간다).
 */
type PadDragApi = { begin: () => boolean; move: (dx: number, dy: number) => void; end: (cancelled: boolean) => void }
/** 조절판 배율. 캔버스 끌기의 1/3 — 1px ≈ 1u(1000u 칸). 섬세한 편집용이라 캔버스보다 잘게 가되, 자모 상자 크기와 상관없이 늘 같다. */
const PAD_DRAG_GAIN = 1 / 3

/** `pastGapLimit`: 사용자가 최소 잉크 간격의 걸림을 밀고 넘어간 미리보기. 문맥 안전 보정(자동 되당김)을 얹지 않는다. */
type PreviewJamo = { type: JamoData['type']; char: string; data: JamoData; baseline?: JamoData; pastGapLimit?: boolean }
/** 최소 잉크 간격에 걸린 자리에서 이만큼(em) 더 끌어야 넘어간다. 한 번 "탁" 걸리는 세기. */
const GAP_STICK_EM = 0.05
/** 선택 색. 피그마처럼 잉크는 제 색 그대로 두고, 잡은 획은 가는 중심선 + 둘레 상자로 알린다. 옆 자소에 너무 붙은 자소의 획은 경고색. */
const SELECTION_COLOR = EDIT_COLOR.editHandle
const SELECTION_WARNING_COLOR = EDIT_COLOR.destructive
/** 꼭짓점 · 곡선 핸들 눌림 반지름(뷰박스 단위). 330px 캔버스에서 약 29px. 겹치면 누른 자리에서 가장 가까운 것이 잡힌다. */
const POINT_HIT_RADIUS = 10
/** 보이는 꼭짓점 반지름 · 핸들 마름모 한 변(뷰박스 단위). 잡은 것은 조금 더 크다. */
const POINT_RADIUS = 3
const ACTIVE_POINT_RADIUS = 3.8
/** 보선에 매인 줄기 끝 막대(가로로 누운 알약)의 폭 · 높이(뷰박스 단위). */
const RAIL_MARK_WIDTH = 7
const RAIL_MARK_HEIGHT = 2.6
const HANDLE_SIDE = 4.4
const ACTIVE_HANDLE_SIDE = 5.4
type PreviewSchema = { layoutType: LayoutType; schema: LayoutSchema }
/** 폰트 전체 굵기(100–900) · 기울기(도). 끄는 동안은 미리보기, 손을 떼면 저장 + 기록 한 줄. */
type StyleTone = { weight: number; slant: number }
type SelectedPoint = { strokeId: string; pointIndex: number }
export type HistoryEntry =
  | {
      kind: 'layout'
      layoutType: LayoutType
      beforeOverrides: LayoutSchema['userPartOverrides']
      afterOverrides: LayoutSchema['userPartOverrides']
      edit: SampleGlyphEdit
    }
  // 획 편집 끌기.
  // `picked`: 이 편집을 할 때 잡혀 있던 선택(획 · 점 묶음 · 획 묶음 · 자소 전체). 되돌리기 · 다시 하기가 되살린다 — 선택 자체는 기록 단위가 아니다.
  | { kind: 'jamo'; jamoType: JamoData['type']; char: string; before: JamoData; after: JamoData; edit: SampleGlyphEdit; picked?: PickedSelection }
  // 첫닿자 변형 가르기 · 합치기. 획은 안 바뀌고 변형 목록만 바뀐다.
  | { kind: 'jamoVariant'; char: string; before: JamoData; after: JamoData }
  | { kind: 'brush'; before: StrokeRenderStyle; after: StrokeRenderStyle; ends?: { before: StrokeEnds; after: StrokeEnds } }
  // 전역 패널의 `풀기` — 꺾임을 따로 정한 획들의 값을 한 번에 지운다. 자소 여럿이 한 줄의 되돌리기.
  | { kind: 'jamos'; before: JamoData[]; after: JamoData[] }
  | { kind: 'tone'; before: StyleTone; after: StyleTone }
  // `groupId`가 있으면 사용자 묶음의 부리. `groupBefore`는 되돌릴 값(없으면 전역을 따르던 상태).
  | { kind: 'beak'; before: StemBeakStyle; after: StemBeakStyle; groupId?: string; groupBefore?: StemBeakStyle }
  // 레이아웃 모드에서 적용·지운 배치 Δ. 저장소 앞뒤를 통째로 든다.
  | { kind: 'layoutDelta'; before: LayoutDeltaSnapshot; after: LayoutDeltaSnapshot }
  // 획 편집에서 나갈 때 줄기 모양을 형제에 반영했다. 마스터와 바뀐 홀자 앞뒤를 통째로 든다.
  | { kind: 'stemShape'; mastersBefore: StemMasters; mastersAfter: StemMasters; jamoBefore: Record<string, JamoData>; jamoAfter: Record<string, JamoData> }

/** 편집할 때의 선택. 되돌리기가 그대로 되살린다. */
type PickedSelection = { selection: Selection; points: SelectedPoint[]; strokes: string[] }


/** 자소 탭 편집 모드. 획 = 점·획·자소 형태, 레이아웃 = 기준선으로 배치(Δ 저장). */
type EditMode = 'stroke' | 'layout'
// 자소 탭은 레이아웃이 기본이다. `&mode=stroke`(+ `&part=CH|JU|JO`)만 획 편집을 바로 연다. 옛 `&mode=layout`은 기본과 같다.
const initialEditMode = (): EditMode => new URLSearchParams(window.location.search).get('mode') === 'stroke' ? 'stroke' : 'layout'
const initialStrokePart = (): MobileEditorPart | null => {
  const params = new URLSearchParams(window.location.search)
  const part = params.get('part')
  return params.get('mode') === 'stroke' && (part === 'CH' || part === 'JU' || part === 'JO') ? part : null
}

/** 첫닿자 단독 칸(`ㄴ`). 호환 자모 자음 하나. */
function isSoloConsonant(char: string): boolean {
  const code = char.codePointAt(0) ?? 0
  return code >= 0x3131 && code <= 0x314e
}
/** 음절의 첫닿자 하나. 첫닿자 획 편집은 음절이 아니라 이 글자(단독으로 그린 `ㄴ`)로 먼저 연다 — 변형 카드의 `기본`. 음절이 아니면 null. */
function soloConsonantOf(char: string): string | null {
  const code = char.codePointAt(0) ?? 0
  return code >= 0xac00 && code <= 0xd7a3 ? workbenchJamoOf('choseong', char) : null
}

function isEditableHangul(char: string): boolean {
  const code = char.codePointAt(0) ?? 0
  const isPrecomposedSyllable = code >= 0xac00 && code <= 0xd7a3
  const isCompatibilityJamo = code >= 0x3131 && code <= 0x3163
  return isPrecomposedSyllable || isCompatibilityJamo
}

/** `?char=염`처럼 다른 탭에서 글자를 들고 들어오면 그 글자로 연다. 문장은 그대로 두고, 문장에 없으면 앞에 붙인다. */
function initialFocus(): { char: string; sentence: string; custom: boolean } {
  const params = new URLSearchParams(window.location.search)
  const requested = [...(params.get('char') ?? '')][0]
  // 대시보드 폰트 카드와 같은 예시 문장. 여기서 바꾸면 대시보드도 바뀐다.
  const base = useFontExportStore.getState().sampleSentence.trim() || SAMPLE_SENTENCES[0]
  // 그냥 들어오면 문장 첫 글자를 잡는다. 문장에 없는 글자를 포커스한 채 열지 않는다.
  if (!requested || !isEditableHangul(requested)) return { char: [...base].find(isEditableHangul) ?? [...base][0], sentence: base, custom: false }
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


function withPreviewJamo(syllable: DecomposedSyllable, preview: PreviewJamo | null): DecomposedSyllable {
  if (!preview) return syllable
  if (preview.type === 'choseong' && syllable.choseong?.char === preview.char) return { ...syllable, choseong: preview.data }
  if (preview.type === 'jungseong' && syllable.jungseong?.char === preview.char) return { ...syllable, jungseong: preview.data }
  if (preview.type === 'jongseong' && syllable.jongseong?.char === preview.char) return { ...syllable, jongseong: preview.data }
  return syllable
}

/**
 * 고칠 자모의 출발 꼴: 저장된 자모에서 지금 글자의 홀자 계열 벌(가른 첫닿자)을 기본 획 자리에 올린 복제.
 * 획 편집의 모든 동작(추가 · 삭제 · 꺾임 · 굵기 · 크기 · 펜)이 여기서 출발한다. 저장 꼴(기본 획 + 벌 목록)을 그대로 고치면
 * 화면에 그려지는 벌이 아니라 기본 획이 바뀌어, 미리보기가 안 보이고 저장할 때 벌이 기본 모양으로 덮인다(10-06 끌기 버그).
 * 끌기 · 늘리기만은 화면의 자모(미리보기 · 문맥 보정이 얹힌 것)에서 출발하되 같은 식으로 벌을 올린다.
 */
function editableJamoOf(jamo: JamoData, syllable: DecomposedSyllable): JamoData {
  return adoptFamilyStrokes(getJamo(jamo.type, jamo.char) ?? jamo, familyOfSyllable(syllable))
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

// 붙여넣은 획이 같은 자리의 획과 겹쳐 안 보이지 않게 조금 비켜 놓는다. 핸들도 절대 좌표라 같이 옮긴다.
const PASTE_OFFSET = .03

// 획 복사판. 앱 안에서만 들고 다닌다(시스템 클립보드는 안 쓴다). 자소를 바꿔도 남아서 ㅁ에서 복사 → ㅣ에 붙여넣기가 된다.
// 획 하나, 또는 자소만 잡혔을 때 그 자소 획 전부(ㅂ → ㅃ)를 담는다.
const useStrokeClipboard = create<{ strokes: StrokeDataV2[] }>(() => ({ strokes: [] }))

function samePoints(a: StrokeDataV2, b: StrokeDataV2): boolean {
  return a.points.length === b.points.length && a.points.every((point, index) => Math.hypot(point.x - b.points[index].x, point.y - b.points[index].y) < .005)
}

function offsetStroke(stroke: StrokeDataV2, id: string, offset: number): StrokeDataV2 {
  const shift = (point: { x: number; y: number }) => ({ ...point, x: point.x + offset, y: point.y + offset })
  return {
    ...structuredClone(stroke),
    id,
    points: stroke.points.map((point) => ({
      ...shift(point),
      ...(point.handleIn ? { handleIn: shift(point.handleIn) } : {}),
      ...(point.handleOut ? { handleOut: shift(point.handleOut) } : {}),
    })),
  }
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
const NO_STROKES: readonly string[] = []
const editorPartOf = (part: Part): MobileEditorPart => part === 'CH' ? 'CH' : part === 'JO' ? 'JO' : 'JU'
/** `획 고치기`로 잠긴 동안 고치지 않는 자소의 잉크 농도. */
const LOCKED_OUT_OPACITY = 0.22
/** 펜이 켜진 동안 지금 자소의 전부터 있던 잉크. 옅어져 따라 그을 밑그림 노릇을 한다(새로 그은 획만 제 색). */
const PEN_OLD_INK_OPACITY = 0.3

function layoutAreaLabel(part: MobileEditorPart): string {
  if (part === 'CH') return '초성'
  if (part === 'JU') return '중성'
  return '종성'
}

/** 부품 상자. 검수 캔버스 GhostCanvas와 같은 색·농도·라벨. 선택 부품만 제 색, 나머지는 옅게. 선택이 없으면 전부 제 색(획 편집에 잠긴 동안은 잠긴 자소만). */
function PartBoxes({ boxes, activePart, unit = 1 }: { boxes: Partial<Record<Part, BoxConfig>>; activePart: MobileEditorPart | null; unit?: number }) {
  return <g aria-hidden="true" data-testid="jamo-part-boxes">
    {(Object.entries(boxes) as [Part, BoxConfig][]).map(([part, box]) => {
      const active = !activePart || editorPartOf(part) === activePart
      const color = PART_COLOR[part]
      return <g key={part} data-part={part} data-active={active}>
        <rect x={box.x * VIEW_BOX_SIZE} y={box.y * VIEW_BOX_SIZE} width={box.width * VIEW_BOX_SIZE} height={box.height * VIEW_BOX_SIZE} fill={color} fillOpacity={active ? 0.24 : 0.07} stroke={color} strokeOpacity={active ? 0.85 : 0.25} strokeWidth={(active ? 0.4 : 0.3) * unit} />
        <text x={box.x * VIEW_BOX_SIZE + 0.8 * unit} y={box.y * VIEW_BOX_SIZE - 0.8 * unit} fontSize={2.4 * unit} fontWeight={600} fill={color} fillOpacity={active ? 0.9 : 0.35} className={styles.partBoxLabel}>{PART_LABEL[part]}</text>
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
  const effectivePadding = mergeLayoutPadding(globalPadding, paddingOverrides, decomposed.layoutType)
  const effectiveSchema = { ...schema, padding: effectivePadding, designBodyPadding: effectivePadding }
  const viewportBox = {
    x: effectiveSchema.padding.left,
    y: 0,
    width: 1 - effectiveSchema.padding.left - effectiveSchema.padding.right,
    height: 1,
  }
  // 네모꼴 자동 보정은 이 글자 레이아웃의 네모꼴에서 나온다(`getEffectiveStyle`과 같은 길). 받는 `globalStyle`은 미리보기를 얹은 저장값이다.
  const paddingKey = `${effectivePadding.left}|${effectivePadding.right}|${effectivePadding.top}|${effectivePadding.bottom}`
  const exclusions = useGlobalStyleStore((state) => state.exclusions)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 여백은 네 값이 같으면 같다.
  const renderStyle = useMemo(() => resolveEffectiveStyle(globalStyle, exclusions, decomposed.layoutType, effectivePadding), [globalStyle, exclusions, decomposed.layoutType, paddingKey])
  // 배치는 칸 해석 함수(모델 상자)가 우선, 못 풀면 스키마.
  const { placement } = useContextPlacement(decomposed, effectiveSchema, renderStyle)
  const boxes = layoutHighlight?.layoutType === decomposed.layoutType
    ? placement.kind === 'boxes' ? placement.boxes : calculateBoxes(effectiveSchema, {
      cho: decomposed.choseong?.char ?? '',
      jung: decomposed.jungseong?.char ?? '',
      jong: decomposed.jongseong?.char ?? '',
    })
    : null
  return <SvgRenderer syllable={decomposed} schema={placement.kind === 'schema' ? placement.schema : undefined} boxes={placement.kind === 'boxes' ? placement.boxes : undefined} viewportBox={viewportBox} size={size} overflow="visible" clipGlyphs={false} globalStyle={renderStyle}>
    {boxes && layoutHighlight && <LayoutAreaBoxes boxes={boxes} parts={layoutHighlight.parts} emphasis={layoutHighlight.source ? 'source' : 'affected'} />}
  </SvgRenderer>
}

/**
 * 펜 층. 이번에 그은 획 · 긋는 중인 선 · 입력 판을 SvgRenderer 안(기울기 변환 안쪽)에 그린다.
 * 화면 → 자모 상자는 판의 화면 변환을 거꾸로 돌려 얻는다 — 글자가 기울어도 맞는다.
 */
function PenLayer({ pen, box, fresh, viewport, weightMultiplier, globalLinecap, globalLinejoin, miterLimit, strokeStyle, onTap }: { pen: PenCanvas; box: BoxConfig; fresh: readonly { stroke: StrokeDataV2; box: BoxConfig }[]; viewport: BoxConfig; weightMultiplier: number; globalLinecap?: StrokeLinecap; globalLinejoin?: StrokeLinejoin; miterLimit: number; strokeStyle?: StrokeRenderStyle; onTap: (clientX: number, clientY: number) => void }) {
  const surfaceRef = useRef<SVGRectElement>(null)
  /** 누른 자리와 거기서 가장 멀리 간 거리(화면 px). 톡 누르기인지 가른다. */
  const press = useRef({ x: 0, y: 0, travel: 0 })
  /** 마지막으로 받은 점(화면 px). 점 솎기의 기준. */
  const lastClient = useRef({ x: 0, y: 0 })
  const drawing = useRef<PenPoint[] | null>(null)
  /** 지금 긋는 포인터. 다른 손가락이 닿아도 이 획에 섞이지 않는다. */
  const activePointer = useRef<number | null>(null)
  const [current, setCurrent] = useState<PenPoint[] | null>(null)
  // iOS Safari는 SVG의 `touch-action: none`을 건너뛰기도 해서 세로로 그으면 화면이 스크롤된다. 펜 층이 있는 동안 터치 이동을 직접 막는다(passive 아님).
  useEffect(() => {
    const svg = surfaceRef.current?.ownerSVGElement
    if (!svg) return
    const block = (event: TouchEvent) => { if (event.cancelable) event.preventDefault() }
    svg.addEventListener('touchstart', block, { passive: false })
    svg.addEventListener('touchmove', block, { passive: false })
    return () => {
      svg.removeEventListener('touchstart', block)
      svg.removeEventListener('touchmove', block)
    }
  }, [])
  const toBox = (target: SVGGraphicsElement, clientX: number, clientY: number): PenPoint | null => {
    const matrix = target.getScreenCTM()
    if (!matrix) return null
    const at = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse())
    return viewBoxToJamoBox([{ x: at.x, y: at.y }], box, VIEW_BOX_SIZE)[0]
  }
  /** 펜은 한 프레임에 여러 점을 보낸다 — 합쳐진 이벤트를 풀어 받되, 앞 점에서 `PEN_MIN_STEP_PX`만큼 못 간 점은 솎는다. 합성 이벤트에는 없어 한 점으로 돌아간다. */
  const pointsOf = (event: ReactPointerEvent<SVGRectElement>): PenPoint[] => {
    const native = event.nativeEvent as globalThis.PointerEvent & { getCoalescedEvents?: () => globalThis.PointerEvent[] }
    const events = native.getCoalescedEvents?.() ?? []
    const source = events.length > 0 ? events : [native]
    const out: PenPoint[] = []
    for (const item of source) {
      if (Math.hypot(item.clientX - lastClient.current.x, item.clientY - lastClient.current.y) < PEN_MIN_STEP_PX) continue
      const point = toBox(event.currentTarget, item.clientX, item.clientY)
      if (!point) continue
      lastClient.current = { x: item.clientX, y: item.clientY }
      out.push(point)
    }
    return out
  }
  const begin = (event: ReactPointerEvent<SVGRectElement>) => {
    event.stopPropagation()
    if (event.pointerType === 'mouse' && event.button !== 0) return
    if (activePointer.current !== null) return
    const first = toBox(event.currentTarget, event.clientX, event.clientY)
    if (!first) return
    event.currentTarget.setPointerCapture(event.pointerId)
    activePointer.current = event.pointerId
    press.current = { x: event.clientX, y: event.clientY, travel: 0 }
    lastClient.current = { x: event.clientX, y: event.clientY }
    drawing.current = [first]
    setCurrent(drawing.current)
  }
  const move = (event: ReactPointerEvent<SVGRectElement>) => {
    event.stopPropagation()
    if (!drawing.current || event.pointerId !== activePointer.current) return
    press.current.travel = Math.max(press.current.travel, Math.hypot(event.clientX - press.current.x, event.clientY - press.current.y))
    drawing.current = [...drawing.current, ...pointsOf(event)]
    setCurrent(drawing.current)
  }
  const finish = (event: ReactPointerEvent<SVGRectElement>, cancelled: boolean) => {
    event.stopPropagation()
    if (event.pointerId !== activePointer.current) return
    activePointer.current = null
    const points = drawing.current
    drawing.current = null
    setCurrent(null)
    // 톡 누르기: 긋지 않고 그 자리의 획을 고른다(빈 곳이면 푼다). 펜을 든 채로도 골라서 지우고 복사한다.
    if (!cancelled && press.current.travel <= PEN_TAP_SLOP_PX) {
      onTap(event.clientX, event.clientY)
      return
    }
    if (!cancelled && points && points.length >= 2) {
      // 개발용: 마지막으로 그은 점을 남겨 둔다 — 실제 펜슬 입력을 그대로 가져다 맞춤을 재현하려고(도구 줄 `입력 복사`).
      if (DEV_TOOLS_ENABLED) { try { localStorage.setItem('pen:lastRaw', JSON.stringify(points.map((point) => [Number(point.x.toFixed(4)), Number(point.y.toFixed(4))]))) } catch { /* 저장 공간이 없으면 그냥 넘어간다 */ } }
      pen.onStroke(points)
    }
  }
  const pathOf = (points: readonly PenPoint[]) => points.map((point, index) => {
    const at = absolutePoint(point, box)
    return `${index === 0 ? 'M' : 'L'}${at.x.toFixed(2)} ${at.y.toFixed(2)}`
  }).join(' ')
  // 긋는 중인 획은 저장될 굵기로, 그은 점 그대로 그린다. 손떨림 거르기와 곡선 맞춤은 손을 뗄 때 한 번만 한다 — 긋는 내내 다시 거르면 펜 뒤 꼬리가 계속 자리를 바꾸고, 이미 완성된 획처럼 보인다(10-06 사용자: 실험실 페이지의 날 선이 자연스러웠다).
  const live = current && current.length >= 2 ? current : null
  // 실제 그리기(SvgRenderer)와 같은 끝 · 꺾임 · 뾰족 한계 — 그은 직후에 보이는 모양이 저장된 모양과 같아야 한다(10-06 사용자: 직후엔 뾰족, 다시 열면 깎임).
  const inkStyle = (stroke: Pick<StrokeDataV2, 'thickness' | 'linecap' | 'linejoin'>) => ({ fill: 'none', stroke: EDIT_COLOR.foreground, strokeWidth: stroke.thickness * weightMultiplier * VIEW_BOX_SIZE, strokeLinecap: stroke.linecap ?? globalLinecap ?? 'butt', strokeLinejoin: stroke.linejoin ?? globalLinejoin ?? 'miter', strokeMiterlimit: miterLimit, pointerEvents: 'none' } as const)
  return <g data-testid="pen-layer">
    {/* 이번에 그은 획은 옅어진 자소 위에 제 색으로 덧그린다. */}
    {fresh.map((item) => {
      // 방금 그은 획도 캔버스 잉크와 같은 면 그리기로 — 저장된 모양(레이아웃 · 추출)과 한 그림이다. 면을 못 만들면 선으로.
      const made = centerlineInkGroups({ id: item.stroke.id, stroke: item.stroke, box: item.box, weightMultiplier, effectiveLinecap: item.stroke.linecap ?? globalLinecap ?? 'butt', effectiveLinejoin: item.stroke.linejoin ?? globalLinejoin ?? 'miter' }, strokeStyle ?? PEN_FILLED_STYLE)
      return made.ok && made.groups.length > 0
        // 조각마다 `<path>` 하나 — 한 path에 합쳐 evenodd로 칠하면 겹친 조각(급꺾임 · 자기 교차 때 사각형 + 동그라미)이 서로 뚫린다(SvgRenderer와 같은 방식).
        ? <g key={item.stroke.id} pointerEvents="none" data-testid="pen-fresh">
          {brushInkGroupsToSvgPaths(made.groups, VIEW_BOX_SIZE).map((path, index) => <path key={index} d={path} fill={EDIT_COLOR.foreground} fillRule="evenodd" />)}
        </g>
        : <path key={item.stroke.id} d={pointsToSvgD(item.stroke.points, item.stroke.closed, item.box, VIEW_BOX_SIZE)} {...inkStyle(item.stroke)} data-testid="pen-fresh" />
    })}
    {live && <path d={pathOf(live)} {...inkStyle(pen.sample)} strokeLinejoin="round" data-testid="pen-live" />}
    {/* 글자가 기울어도 판이 칸 모서리를 덮도록 보기 창보다 넉넉히 깐다. */}
    <rect ref={surfaceRef} x={viewport.x * VIEW_BOX_SIZE - 100} y={viewport.y * VIEW_BOX_SIZE - 100} width={viewport.width * VIEW_BOX_SIZE + 200} height={viewport.height * VIEW_BOX_SIZE + 200} fill="transparent" pointerEvents="all" onPointerDown={begin} onPointerMove={move} onPointerUp={(event) => finish(event, false)} onPointerCancel={(event) => finish(event, true)} data-testid="pen-surface" />
  </g>
}

function FocusedGlyph({
  char,
  syllable,
  schema,
  selection,
  selectedPoints,
  selectedStrokes = NO_STROKES,
  wholeJamoCentered = null,
  multiSelectArmed = false,
  onSelect,
  onPointSelect,
  lockedPart = null,
  dragApiRef,
  padDragRef,
  gapWarningParts = NO_PARTS,
  fontSpace,
  grid,
  designBody,
  globalStyle,
  pen = null,
  corner = null,
}: {
  char: string
  syllable: DecomposedSyllable
  schema: LayoutSchema
  selection: Selection
  /** 캔버스 오른쪽 위 귀퉁이에 얹는 단추(`크게`). 눌러도 캔버스 고르기 · 끌기 · 펜 긋기로 안 번진다. */
  corner?: ReactNode
  /** 펜 모드. 있으면 잠긴 자소의 눌림 영역 대신 펜 층이 긋기를 받는다. */
  pen?: PenCanvas | null
  /** `획 고치기`로 들어온 자소. 이 자소의 획만 잡히고 나머지는 흐리게 그린다. */
  lockedPart?: MobileEditorPart | null
  /** 주면 잡은 점 · 핸들 · 획을 캔버스에서 바로 끈다(셸 안). 없으면 누르기로 고르기만 한다. */
  dragApiRef?: RefObject<StrokeDragApi | null>
  /** 캔버스가 조절판에 여는 끌기 문. 조절판도 캔버스와 같은 px → em 계산 · 같은 스냅을 탄다. */
  padDragRef?: RefObject<PadDragApi | null>
  /** 옆 자소에 최소 간격보다 가깝게(그리고 고치기 전보다 더) 붙은 자소들. 그 자소의 잡은 획을 경고색으로 그린다. */
  gapWarningParts?: readonly MobileEditorPart[]
  onSelect: (selection: Selection) => void
  selectedPoints: SelectedPoint[]
  /** 획 묶음. 둘 이상이면 묶인 획이 모두 잡힌 획처럼 중심선으로 보인다. */
  selectedStrokes?: readonly string[]
  /** 자소 통째 이동이 파트 상자 정가운데에 붙은 축. 그 축에 가운데 선을 긋는다. */
  wholeJamoCentered?: { x: boolean; y: boolean } | null
  /** 조절판에 손가락이 하나 닿아 있다. 그동안 캔버스 누르기는 무조건 획 묶음 넣고 빼기다 — 점 고르기 · 끌기 · 빈 곳 풀기는 안 한다. */
  multiSelectArmed?: boolean
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
  // 펜 상자. 지금 자모의 획이 놓이는 상자 하나 — 그은 점도 저장한 획도 같은 상자다(JU 줄기마다 달라지는 `targets`의 상자는 안 쓴다).
  const penBox = useMemo(() => {
    const target = pen ? boxes[pen.renderPart] : undefined
    return pen && target ? getJamoRenderBox(pen.jamo, wholeJamoStrokes(pen.jamo), target) : null
  }, [pen, boxes])
  const penFresh = useMemo(() => (pen && lockedPart ? targets.filter((target) => target.editorPart === lockedPart && pen.freshIds.has(target.stroke.id)) : []), [pen, lockedPart, targets])
  // 펜이 켜진 동안 톡 누른 자리의 획을 고른다. 깔아 둔 눌림 영역으로 찾아 평소 누르기와 같은 넓이로 잡힌다. 겹쳤으면 위에 그려진(나중) 획, 빈 곳이면 푼다.
  const pickUnderPen = (clientX: number, clientY: number) => {
    const strokeId = document.elementsFromPoint(clientX, clientY).find((element) => element.getAttribute('data-editor-hit') === 'stroke')?.getAttribute('data-stroke-id')
    const target = strokeId ? targets.find((item) => item.stroke.id === strokeId && (!lockedPart || item.editorPart === lockedPart)) : undefined
    if (!target) return onSelect({ kind: 'none' })
    onSelect({ kind: 'stroke', component: componentFor(char, target.editorPart, target.jamo), editorPart: target.editorPart, renderPart: target.renderPart, jamo: target.jamo, strokeId: target.stroke.id, box: target.box })
  }
  const penWeight = weightToMultiplier(globalStyle.weight)
  // 고른 홀자 줄기의 보선과 끝 표시. 세로로 끌면 저장 획이 아니라 보선이 움직인다 — 안쪽 보선은 레이아웃 편집처럼 칸 밖까지 길게 그린다.
  // 끝 표시: 보선에 매인 끝은 막대(보선 따라 세로로 미끄러짐), 칸 테두리에 매인 끝은 찬 점(획 편집에선 세로로 잠김). 테두리 보선은 길게 안 그린다 — 찬 점이 잠김을 말하고, 칸 변은 부품 상자로 보인다.
  const stemGuides = useMemo(() => {
    if (!dragApiRef || placement.kind !== 'boxes' || (selection.kind !== 'stroke' && selection.kind !== 'point' && selection.kind !== 'handle')) return []
    const target = targets.find((item) => item.stroke.id === selection.strokeId && item.editorPart === 'JU')
    if (!target || target.stroke.points.length < 2) return []
    const lastIndex = target.stroke.points.length - 1
    const first = absolutePoint(target.stroke.points[0], target.box)
    const last = absolutePoint(target.stroke.points[lastIndex], target.box)
    const topIndex = first.y <= last.y ? 0 : lastIndex
    return stemRailGuides({ jamo: target.jamo, stroke: target.stroke, part: target.renderPart, box: placement.boxes[target.renderPart] })
      .map((guide) => {
        // 가로 줄기 높이는 가운데에, 기둥 끝은 그 끝점에. `pointIndex`가 없으면 줄기 통째(높이)다.
        if (guide.end === 'center') return { ...guide, target, x: (first.x + last.x) / 2, y: (first.y + last.y) / 2, pointIndex: null }
        const pointIndex = guide.end === 'top' ? topIndex : lastIndex - topIndex
        const at = pointIndex === 0 ? first : last
        return { ...guide, target, x: at.x, y: at.y, pointIndex }
      })
  }, [dragApiRef, placement, selection, targets])
  // 화면에 보이는 부품 상자는 레이아웃 모드와 같은 잉크 바깥면이다. 획을 놓는 `boxes`는 두께 절반만큼 안쪽인 중심선 상자라 그대로 그리면 잉크가 상자를 뚫고 나온다.
  // 칸 해석이 없는 글자(단독 자소)는 중심선 상자 그대로다 — 굵기 반을 일괄로 더하면 끝이 평평한 줄기 쪽에 여백이 생기고, 획이 없을 때 칸이 줄어 격자가 튄다(10-06 사용자).
  const inkBoxes = useMemo(() => placement.kind === 'boxes' && resolution
    ? Object.fromEntries(resolution.parts.map((part) => [part.part, facesToBox(part.faces)])) as Partial<Record<Part, BoxConfig>>
    : boxes, [placement, resolution, boxes])
  // 보기 창. 자소 단독이면 그 잉크에 맞춰 당긴다. `u`는 판 전체 보기에서 뷰박스 1이 지금 뷰박스 몇인지 — 점 · 선 굵기를 화면에서 같은 크기로 두는 데 곱한다.
  const viewport = useMemo(() => canvasViewportFor(syllable, inkBoxes), [syllable, inkBoxes])
  const u = viewport.width / CANVAS_VIEWPORT.width
  // Noto 고스트: 표시·비교 전용. 잉크에 안 섞인다. 켬/끔은 기기에 기억한다.
  const [ghostVisible, setGhostVisible] = useState(loadGhostVisible)
  const { ghost, error: ghostError } = useNotoGhost(char, ghostVisible)
  // 굵기 400이 아니면 추출 윤곽(400) 대신 노토 가변 글꼴 텍스트로 지금 굵기 고스트를 그린다. xor 비교는 400 윤곽 기준이라 그동안 숨긴다.
  const weightGhost = ghostVisible && globalStyle.weight !== 400
  useEffect(() => { if (weightGhost) ensureDevNotoFont() }, [weightGhost])
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
  // 고스트 패널의 `내 획 숨김` — 내 잉크를 전부 숨기고 노토 고스트만 남겨 견준다(개발용, 세션 한정).
  const [inkHidden, setInkHidden] = useState(false)
  // 검수 캔버스와 같은 규칙: 잉크는 전부 제 색, 어느 부품을 잡았는지는 부품 상자 농도로만 보인다.
  // `획 고치기`로 들어왔을 때만 다르다 — 고치는 자소만 제 색이고 나머지는 흐리다. 글자는 제자리 그대로다.
  // 아무 획도 따로 안 잡았으면 잠긴 자소가 통째로 골라진 상태다(첫 화면 · 빈 곳). 잉크 둘레에 테두리를 둘러 알린다 — 획 하나를 잡으면 가운데 선.
  // 펜이 켜진 동안은 긋는 중이라 두르지 않는다.
  const wholePicked = !penBox && lockedPart !== null && selection.kind === 'none'
  const wholeOutlineId = `whole-outline-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  // 테두리 필터의 범위는 캔버스에 보이는 만큼만 잡는다(사파리 한계 — `wholeOutlineRegion`). 캔버스 크기가 바뀌면(`크게`) 다시 잰다. 한계를 넘으면 테두리 없이 잉크만 그린다.
  const [canvasSize, setCanvasSize] = useState<{ width: number; height: number } | null>(null)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || typeof ResizeObserver === 'undefined') return
    const measure = () => setCanvasSize((current) => current && current.width === canvas.clientWidth && current.height === canvas.clientHeight ? current : { width: canvas.clientWidth, height: canvas.clientHeight })
    const observer = new ResizeObserver(measure)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [])
  const outlineRegion = useMemo(() => wholePicked ? wholeOutlineRegion(viewport, canvasSize, typeof window === 'undefined' ? 1 : window.devicePixelRatio) : null, [wholePicked, viewport, canvasSize])
  const partStyles = useMemo(() => {
    if (inkHidden && ghostVisible) return Object.fromEntries((['CH', 'JU', 'JU_H', 'JU_V', 'JO'] as Part[]).map((part) => [part, { opacity: 0 }])) as Partial<Record<Part, { opacity: number }>>
    // 펜이 켜진 동안: 지금 자소의 잉크는 옅게 깔리고, 이번에 그은 획만 펜 층이 제 색으로 덧그린다.
    if (penBox && lockedPart) return Object.fromEntries((['CH', 'JU', 'JU_H', 'JU_V', 'JO'] as Part[]).map((part) => [part, { opacity: editorPartOf(part) === lockedPart ? PEN_OLD_INK_OPACITY : LOCKED_OUT_OPACITY }])) as Partial<Record<Part, { opacity: number }>>
    if (!lockedPart) return undefined
    return Object.fromEntries((['CH', 'JU', 'JU_H', 'JU_V', 'JO'] as Part[]).flatMap((part): [Part, { opacity?: number; filter?: string }][] => (
      editorPartOf(part) !== lockedPart ? [[part, { opacity: LOCKED_OUT_OPACITY }]] : outlineRegion ? [[part, { filter: `url(#${wholeOutlineId})` }]] : []
    ))) as Partial<Record<Part, { opacity?: number; filter?: string }>>
  }, [lockedPart, inkHidden, ghostVisible, penBox, outlineRegion, wholeOutlineId])
  const canvasStyle = {
    '--view-unit': u,
    '--construction-band-size': `${GRID_SYSTEM_2_UNIT * GRID_SYSTEM_2_STROKE_UNITS * 100}%`,
  } as CSSProperties
  // 눈금·글자몸 상자는 SVG 안에 그린다. 검수 캔버스처럼 글자 칸 밖 여백(-0.08)까지 보이고 라벨이 잘리지 않는다.
  // 직접 끌기. 누른 자리에서 고르기가 먼저 일어나고(리렌더), 문턱을 넘는 첫 움직임에 이동을 시작한다 — 그때의 `dragApiRef`는 새 선택을 안다.
  const canvasRef = useRef<HTMLDivElement>(null)
  // `onTap`: 끌지 않고 뗀 누르기에만 부른다. 잡은 획을 한 번 더 눌러 점을 펼칠 때 쓴다 — 잡은 획을 끌어 옮기는 건 그대로다.
  const drag = useRef<{ pointerId: number; startX: number; startY: number; box: BoxConfig; started: boolean; anchors: SnapAnchors; candidates: SnapCandidate[]; onTap?: () => void } | null>(null)
  // 스냅: 레이아웃의 기준선 스냅과 같은 규칙(처음 자리 → 기준선 · 상자 변 · 다른 획 → 격자), 축마다 따로. 후보는 이 글자의 Noto 기준선 + 부품 상자 네 변 + 같은 글자 안 획의 중심선 · 끝.
  const { glyph: notoGlyph } = useNotoGlyph(char.codePointAt(0) ?? 0xac00)
  // 노토 기준선은 기준 틀 좌표라 사용자 네모꼴로 옮긴다. 부품 상자 변(`resolution`)은 이미 옮겨져 온다.
  const guideRails = useMemo<SnapCandidate[]>(() => !dragApiRef ? [] : [
    ...(notoGlyph ? baselineRails(notoGlyph).map((rail) => ({ ...rail, value: designBodyAxis(schema.padding, rail.axis).to(rail.value) })) : []),
    ...(resolution ? faceSnapCandidates(resolution.parts) : []),
  ], [dragApiRef, notoGlyph, resolution, schema.padding])
  const strokeCandidates = useMemo(() => strokeSnapCandidates(targets.map((target) => ({ strokeId: target.stroke.id, label: `${target.jamo.char} 획`, stroke: target.stroke, box: target.box }))), [targets])
  // 끌기 후보: 같은 자소의 꼭짓점 · 대칭 자리가 먼저, 그다음 기준선 · 상자 변 · 다른 획 끝, 그다음 격자.
  const dragCandidates = (dragged: { strokeId: string; pointIndex?: number }): SnapCandidate[] => {
    const own = targets.find((target) => target.stroke.id === dragged.strokeId)
    const sameJamo = own ? targets.filter((target) => target.editorPart === own.editorPart && target.jamo.type === own.jamo.type && target.jamo.char === own.jamo.char) : []
    return [
      ...jamoVertexCandidates(sameJamo.map((target) => ({ strokeId: target.stroke.id, label: target.jamo.char, stroke: target.stroke, box: target.box })), dragged),
      ...withoutOwnCandidates([...guideRails, ...strokeCandidates], dragged),
    ]
  }
  const [snapHits, setSnapHits] = useState<{ x: SnapHit | null; y: SnapHit | null } | null>(null)
  // 이름표에는 기준선 · 획 · 격자만 올린다. `처음 자리`는 끄는 내내 걸려 있어서 뺀다.
  const snapHitLabels = snapHits ? [snapHits.x, snapHits.y].filter((hit): hit is SnapHit => Boolean(hit) && hit!.kind !== 'model').map((hit) => hit.touch ? `${hit.label}에 딱 붙음` : hit.label).filter((label, index, labels) => labels.indexOf(label) === index) : []
  // 홀자 가로 줄기를 끌면 다른 칸 세로 변(잉크 바깥면)이 `딱 붙음` 후보가 된다 — 레이아웃 편집에서 닿자 세로 변을 끌 때와 같은 규칙. 닻이 중심선이라 굵기를 바꿔도 안 튀어나온다.
  const withTouch = (candidates: SnapCandidate[], strokeId: string) => {
    const target = targets.find((item) => item.stroke.id === strokeId)
    if (!target || target.editorPart !== 'JU' || horizontalStrokeEndsX([{ stroke: target.stroke, box: target.box }]).length === 0) return candidates
    return candidates.map((candidate) => candidate.axis === 'x' && candidate.id.startsWith('face:') && !/^face:JU(_H|_V)?:/.test(candidate.id) ? { ...candidate, touch: true } : candidate)
  }
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
  // 잡은 획의 꼭짓점 · 핸들 눌림. 잡은 획의 눌림 영역은 다른 획보다 위에 깔려서, 잡은 획 가까이를 누르면 다른 획이 아니라 이 획의 점이 잡힌다.
  // 영역이 겹치면 누른 자리에서 가장 가까운 꼭짓점 · 핸들이 잡힌다. 점이 아직 안 펼쳐졌으면 끌면 획째 옮기고, 떼면 그 점이 잡힌다.
  // `pressed`: 누른 눌림 영역의 주인. 누른 자리가 어느 영역에도 안 들면(좌표 없는 합성 이벤트 등) 그대로 잡는다.
  const pressActiveStroke = (event: ReactPointerEvent<SVGElement>, target: (typeof targets)[number], pressed: { pointIndex: number; handle?: 'in' | 'out' }) => {
    event.stopPropagation()
    // 조절판을 누른 동안은 점 · 핸들 자리를 눌러도 그 획을 묶음에 넣고 뺀다. PC Shift는 점이 펼쳐져 있으면 점 묶음이 먼저다(아래).
    if (multiSelectArmed && !event.shiftKey) {
      onSelect({ kind: 'stroke', component: componentFor(char, target.editorPart, target.jamo), editorPart: target.editorPart, renderPart: target.renderPart, jamo: target.jamo, strokeId: target.stroke.id, box: target.box })
      return
    }
    const matrix = (event.currentTarget as SVGGraphicsElement).getScreenCTM()
    const at = matrix ? new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse()) : null
    const distanceTo = (point: { x: number; y: number }) => {
      if (!at) return Infinity
      const { x, y } = absolutePoint(point, target.box)
      return Math.hypot(x - at.x, y - at.y)
    }
    let best: { pointIndex: number; handle?: 'in' | 'out'; distance: number } = { pointIndex: 0, distance: Infinity }
    target.stroke.points.forEach((point, pointIndex) => {
      const distance = distanceTo(point)
      if (distance < best.distance) best = { pointIndex, distance }
    })
    if ((selection.kind === 'point' || selection.kind === 'handle') && selection.strokeId === target.stroke.id) {
      const point = target.stroke.points[selection.pointIndex]
      for (const handle of ['in', 'out'] as const) {
        const handlePoint = handle === 'in' ? point?.handleIn : point?.handleOut
        const distance = handlePoint ? distanceTo(handlePoint) : Infinity
        if (distance < best.distance) best = { pointIndex: selection.pointIndex, handle, distance }
      }
    }
    if (best.distance > POINT_HIT_RADIUS * u) best = { ...pressed, distance: 0 }
    const component = componentFor(char, target.editorPart, target.jamo)
    const picked = target.stroke.points[best.pointIndex]
    // Shift 묶음(PC): 펼쳐진 점을 눌렀으면 그 점을 점 묶음에 넣고 뺀다. 핸들 자리거나 점이 안 펼쳐졌으면 획 묶음.
    if (multiSelectArmed && event.shiftKey) {
      const shown = pointsOpenStrokeId === target.stroke.id || selectedPoints.some((point) => point.strokeId === target.stroke.id)
      if (shown && !best.handle) {
        onPointSelect({ kind: 'point', component, editorPart: target.editorPart, renderPart: target.renderPart, jamo: target.jamo, strokeId: target.stroke.id, pointIndex: best.pointIndex, box: target.box })
        return
      }
      onSelect({ kind: 'stroke', component, editorPart: target.editorPart, renderPart: target.renderPart, jamo: target.jamo, strokeId: target.stroke.id, box: target.box })
      return
    }
    if (best.handle && (selection.kind === 'point' || selection.kind === 'handle')) {
      const handlePoint = best.handle === 'in' ? picked.handleIn! : picked.handleOut!
      onSelect({ ...selection, kind: 'handle', handle: best.handle })
      startDrag(event, target.box, pointAnchors(handlePoint, target.box), { strokeId: target.stroke.id, pointIndex: best.pointIndex })
      return
    }
    const pointSelection = { kind: 'point', component, editorPart: target.editorPart, renderPart: target.renderPart, jamo: target.jamo, strokeId: target.stroke.id, pointIndex: best.pointIndex, box: target.box } as const
    const pointsShown = pointsOpenStrokeId === target.stroke.id || selectedPoints.some((point) => point.strokeId === target.stroke.id)
    if (pointsShown) {
      onPointSelect(pointSelection)
      startDrag(event, target.box, pointAnchors(picked, target.box), { strokeId: target.stroke.id, pointIndex: best.pointIndex })
    } else {
      startDrag(event, target.box, strokeBodyAnchors(target.stroke, target.box), { strokeId: target.stroke.id }, () => onPointSelect(pointSelection))
    }
  }
  // 줄기 끝 표시를 누름 = 그 끝점을 바로 잡는다. 점이 안 펼쳐진 획이어도 몸통 끌기로 새지 않는다.
  const pressStemEnd = (event: ReactPointerEvent<SVGElement>, target: (typeof targets)[number], pointIndex: number) => {
    event.stopPropagation()
    const component = componentFor(char, target.editorPart, target.jamo)
    onPointSelect({ kind: 'point', component, editorPart: target.editorPart, renderPart: target.renderPart, jamo: target.jamo, strokeId: target.stroke.id, pointIndex, box: target.box })
    startDrag(event, target.box, pointAnchors(target.stroke.points[pointIndex], target.box), { strokeId: target.stroke.id, pointIndex })
  }
  const startDrag = (event: ReactPointerEvent<SVGElement>, box: BoxConfig, anchors: SnapAnchors, dragged: { strokeId: string; pointIndex?: number }, onTap?: () => void) => {
    // 끌기가 없는 화면은 누르기가 곧 탭이다.
    if (!dragApiRef || !canvasRef.current) { onTap?.(); return }
    // 닻과 후보는 누른 순간의 자리로 굳힌다. 끄는 동안 자기 자신에게 걸리지 않게 자기 후보는 뺀다.
    drag.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, box, started: false, anchors, candidates: withTouch(dragCandidates(dragged), dragged.strokeId), onTap }
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
    applySnappedMove(state, dx, dy, 1)
  }
  // 화면 px → 글자 칸(em) → 그 획이 놓인 상자 좌표. 캔버스는 배율 1이라 점이 손가락을 따라오고, 조절판은 `PAD_DRAG_GAIN`만큼 잘게 간다.
  // 글자가 기울어 있으면(skewX) 화면의 세로 이동이 기운 축을 따라 옆으로도 읽힌다. 기울기 전 좌표로 되돌린다: x = x' + tan(기울기) · y'.
  const applySnappedMove = (state: { box: BoxConfig; anchors: SnapAnchors; candidates: SnapCandidate[] }, dx: number, dy: number, gain: number) => {
    const api = dragApiRef?.current
    const canvas = canvasRef.current
    if (!api || !canvas) return
    // 보기 창은 정사각이고 캔버스의 짧은 변에 맞춰 그려진다(`크게` 보기에선 캔버스가 정사각이 아니다).
    const canvasRect = canvas.getBoundingClientRect()
    const emPerPx = viewport.width / Math.min(canvasRect.width, canvasRect.height) * gain
    const uprightDx = dx + Math.tan(globalStyle.slant * Math.PI / 180) * dy
    const snapped = snapStrokeDrag({ anchors: state.anchors, requested: { x: uprightDx * emPerPx, y: dy * emPerPx }, candidates: state.candidates })
    setSnapHits((current) => current?.x?.value === snapped.hits.x?.value && current?.y?.value === snapped.hits.y?.value && current?.x?.label === snapped.hits.x?.label && current?.y?.label === snapped.hits.y?.label ? current : snapped.hits)
    api.change({ x: snapped.delta.x / state.box.width / 0.001, y: snapped.delta.y / state.box.height / 0.001 }, state.box)
  }
  // 조절판 끌기: 잡은 획 · 점 · 핸들의 닻과 후보를 캔버스 끌기와 똑같이 굳히고, 같은 스냅으로 옮긴다.
  const padDrag = useRef<{ box: BoxConfig; anchors: SnapAnchors; candidates: SnapCandidate[] } | null>(null)
  const beginPadDrag = () => {
    if (!dragApiRef?.current || (selection.kind !== 'stroke' && selection.kind !== 'point' && selection.kind !== 'handle')) return false
    const target = targets.find((item) => item.stroke.id === selection.strokeId)
    if (!target) return false
    const point = selection.kind === 'stroke' ? null : target.stroke.points[selection.pointIndex]
    const handlePoint = selection.kind === 'handle' && point ? selection.handle === 'in' ? point.handleIn : point.handleOut : point
    if (selection.kind !== 'stroke' && !handlePoint) return false
    const anchors = handlePoint ? pointAnchors(handlePoint, target.box) : strokeBodyAnchors(target.stroke, target.box)
    const dragged = selection.kind === 'stroke' ? { strokeId: target.stroke.id } : { strokeId: target.stroke.id, pointIndex: selection.pointIndex }
    padDrag.current = { box: target.box, anchors, candidates: withTouch(dragCandidates(dragged), dragged.strokeId) }
    dragApiRef.current.begin()
    return true
  }
  useEffect(() => {
    if (!padDragRef) return
    padDragRef.current = {
      begin: beginPadDrag,
      move: (dx, dy) => { if (padDrag.current) applySnappedMove(padDrag.current, dx, dy, PAD_DRAG_GAIN) },
      end: (cancelled) => {
        if (!padDrag.current) return
        padDrag.current = null
        setSnapHits(null)
        if (cancelled) dragApiRef?.current?.cancel()
        else dragApiRef?.current?.commit()
      },
    }
  })
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
    <div ref={canvasRef} className={styles.focusCanvas} style={canvasStyle} data-testid="focus-canvas" data-pinch-lock data-placement={placement.kind} data-direct={dragApiRef ? true : undefined} data-gap-warning={gapWarningParts.length ? true : undefined} onPointerDown={() => { if (!multiSelectArmed) onSelect({ kind: 'none' }) }} onPointerMove={moveDrag} onPointerUp={(event) => endDrag(event, false)} onPointerCancel={(event) => endDrag(event, true)}>
      {globalStyle.strokeStyle.mode === 'legacy-snapped-centerline' && <span className={styles.constructionGrid} aria-hidden="true" data-construction-grid="legacy-snapped-centerline" />}
      <SvgRenderer ink="filled" syllable={syllable} schema={placement.kind === 'schema' ? placement.schema : undefined} boxes={placement.kind === 'boxes' ? placement.boxes : undefined} size={340} viewportBox={viewport} className={styles.focusSvg} partStyles={partStyles} globalStyle={globalStyle} straightUnderlay={<>
        {/* 검수 캔버스(GhostCanvas)와 같은 깔개: 흰 칸 → 1/16 잔선·1/4 굵은선 눈금 → 칸 테두리 → 글자몸 → 기준선(0.88) → 부품 상자 → Noto 고스트. 전부 잉크 아래. */}
        {/* 글자가 기울어도 자리의 기준(눈금 · 글자몸 · 기준선 · 부품 상자)은 곧게 둔다. Noto 고스트만 잉크와 같이 기운다. */}
        <defs>
          <pattern id="jamo-grid-fine" width={minorStep} height={minorStep} patternUnits="userSpaceOnUse"><path d={`M${minorStep} 0V${minorStep}H0`} fill="none" stroke={EDIT_COLOR.border} strokeOpacity={0.7} strokeWidth={0.2 * u} /></pattern>
          <pattern id="jamo-grid-coarse" width={majorStep} height={majorStep} patternUnits="userSpaceOnUse"><path d={`M${majorStep} 0V${majorStep}H0`} fill="none" stroke={EDIT_COLOR.editGuide} strokeOpacity={0.8} strokeWidth={0.3 * u} /></pattern>
        </defs>
        <rect x={0} y={0} width={VIEW_BOX_SIZE} height={VIEW_BOX_SIZE} fill={EDIT_COLOR.surface} />
        <rect x={0} y={0} width={VIEW_BOX_SIZE} height={VIEW_BOX_SIZE} fill="url(#jamo-grid-fine)" data-testid="jamo-grid" />
        <rect x={0} y={0} width={VIEW_BOX_SIZE} height={VIEW_BOX_SIZE} fill="url(#jamo-grid-coarse)" />
        <rect x={0} y={0} width={VIEW_BOX_SIZE} height={VIEW_BOX_SIZE} fill="none" stroke={EDIT_COLOR.editGuide} strokeWidth={0.4 * u} />
        <rect x={body.x} y={body.y} width={body.width} height={body.height} fill="none" stroke={EDIT_COLOR.editSlotJu} strokeOpacity={0.18} strokeWidth={0.3 * u} data-testid="jamo-design-body" />
        <line x1={-6} x2={102} y1={88} y2={88} stroke={EDIT_COLOR.editBaseline} strokeWidth={0.3 * u} />
        <PartBoxes boxes={inkBoxes} activePart={selectedPart ?? lockedPart} unit={u} />
        {/* 레이아웃의 기준선을 읽기 전용으로 옅게 깐다. 획을 끌면 여기에 걸린다. */}
        {guideRails.length > 0 && <g aria-hidden="true" data-testid="stroke-guide-rails">
          {guideRails.map((rail) => rail.axis === 'x'
            ? <line key={rail.id} x1={rail.value * VIEW_BOX_SIZE} x2={rail.value * VIEW_BOX_SIZE} y1={-6} y2={106} className={styles.guideRail} />
            : <line key={rail.id} x1={-6} x2={106} y1={rail.value * VIEW_BOX_SIZE} y2={rail.value * VIEW_BOX_SIZE} className={styles.guideRail} />)}
        </g>}
      </>} underlay={<>
        {ghostVisible && (weightGhost
          ? <text x={0} y={88} fontFamily="'Noto Sans KR', sans-serif" fontWeight={globalStyle.weight} fontSize={100} transform={designBodySvgTransform(schema.padding, VIEW_BOX_SIZE)} className={styles.notoGhost} data-testid="noto-ghost">{char}</text>
          : ghost && <path d={ghost.path} transform={designBodySvgTransform(schema.padding, VIEW_BOX_SIZE)} className={styles.notoGhost} fillRule="evenodd" data-testid="noto-ghost" />)}
      </>}>
        {stemGuides.some((guide) => !guide.border) && <g aria-hidden="true" pointerEvents="none" data-testid="stem-rail-guides">
          {stemGuides.filter((guide) => !guide.border).map((guide) => <line key={guide.key} x1={-6} x2={106} y1={guide.y} y2={guide.y} stroke={PART_COLOR.JU} strokeWidth={0.4 * u} data-rail-key={guide.key} />)}
        </g>}
        {/* 통째로 고른 자소의 테두리: 잉크를 조금 부풀린 면을 선택 색으로 깔고 그 위에 잉크를 그대로 얹는다 — 붓 모양 · 끝 모양이 무엇이든 실제 잉크 둘레를 따른다. */}
        {outlineRegion && <defs>
          <filter id={wholeOutlineId} filterUnits="userSpaceOnUse" x={outlineRegion.x * VIEW_BOX_SIZE} y={outlineRegion.y * VIEW_BOX_SIZE} width={outlineRegion.width * VIEW_BOX_SIZE} height={outlineRegion.height * VIEW_BOX_SIZE} colorInterpolationFilters="sRGB" data-testid="whole-jamo-outline">
            <feMorphology in="SourceAlpha" operator="dilate" radius={.7 * u} result="grown" />
            <feFlood floodColor={SELECTION_COLOR} />
            <feComposite in2="grown" operator="in" result="edge" />
            <feMerge><feMergeNode in="edge" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>}
        {targets.map((target) => {
          // 잠긴 동안 다른 자소는 눌리지 않는다. 잠긴 자소의 획은 자소 통째 선택을 거치지 않고 바로 잡힌다.
          if (lockedPart && target.editorPart !== lockedPart) return null
          const path = pointsToSvgD(target.stroke.points, target.stroke.closed, target.box, VIEW_BOX_SIZE)
          // 펜이 켜진 동안은 눌림을 펜 층이 다 받는다. 톡 누른 자리의 획을 찾을 눌림 영역만 깔아 둔다 — 끌기 · 점 펼치기는 없다. 고른 표시는 펜 층 위에 따로 그린다.
          if (penBox) return <path key={`hit-${target.renderPart}-${target.stroke.id}`} d={path} fill="none" stroke="transparent" strokeWidth={Math.max(12 * u, target.stroke.thickness * VIEW_BOX_SIZE + 8 * u)} pointerEvents="stroke" data-editor-hit="stroke" data-stroke-id={target.stroke.id} data-selected={selectedStrokeId === target.stroke.id ? 'true' : undefined} />
          const component = componentFor(char, target.editorPart, target.jamo)
          const sameComponent = lockedPart !== null || selectedPart === target.editorPart
          const isSelected = selectedStrokeId === target.stroke.id
          // 피그마처럼: 잉크는 제 색 그대로 두고, 잡은 획은 가는 중심선으로만 알린다. 획 바깥에 둘레 상자는 두르지 않는다.
          // 옆 자소에 너무 붙은 자소면 빨갛게. 안 잡힌 획은 마우스를 올리면 중심선이 옅게 뜬다. 눌림 영역은 그 위에 투명하게 넓게 둔다.
          const warning = gapWarningParts.includes(target.editorPart)
          const pointsOpen = pointsOpenStrokeId === target.stroke.id
          return <g key={`hit-${target.renderPart}-${target.stroke.id}`} className={styles.strokeTarget} style={{ '--selection-color': warning ? SELECTION_WARNING_COLOR : SELECTION_COLOR } as CSSProperties}>
          {isSelected || (selectedStrokes.length > 1 && selectedStrokes.includes(target.stroke.id))
            ? <path d={path} className={styles.selectedCenterline} pointerEvents="none" data-active-stroke={warning ? 'warning' : 'active'} />
            // 아무것도 안 골랐으면 잠긴 자소 전체가 잡힌 상태다(두 손가락 = 통째 크기, 한 손가락 = 통째 이동). 그때는 잉크 둘레 테두리가 알린다(`wholePicked`).
            : <path d={path} className={styles.hoverCenterline} pointerEvents="none" />}
          <path
            d={path}
            fill="none"
            stroke="transparent"
            strokeWidth={Math.max(12 * u, target.stroke.thickness * VIEW_BOX_SIZE + 8 * u)}
            pointerEvents="stroke"
            data-editor-hit="stroke"
            data-stroke-id={target.stroke.id}
            data-selected={selectedStrokeId === target.stroke.id ? 'true' : undefined}
            onPointerDown={(event) => {
              event.stopPropagation()
              if (sameComponent) {
                const strokeSelection = { kind: 'stroke', component, editorPart: target.editorPart, renderPart: target.renderPart, jamo: target.jamo, strokeId: target.stroke.id, box: target.box } as const
                // 조절판을 누른 동안은 묶음에 넣고 빼기만. 끌기 · 점 펼치기는 안 한다.
                if (multiSelectArmed) return onSelect(strokeSelection)
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
        {/* 점은 펼친 획에만 뜬다. `여러 점`으로 다른 획에서 골라 둔 점이 있으면 그 획의 점도 남긴다.
            잡기만 하고 아직 안 펼친 획도 꼭짓점 눌림 영역(`catch`)은 깐다 — 잡은 획 가까이 누르면 다른 획보다 이 획의 점이 먼저다. */}
        {!penBox && selectedPart && selection.kind !== 'component' && targets.filter((target) => target.editorPart === selectedPart
          && (target.stroke.id === selectedStrokeId || selectedPoints.some((point) => point.strokeId === target.stroke.id))).flatMap((target) => {
          const shown = target.stroke.id === pointsOpenStrokeId || selectedPoints.some((point) => point.strokeId === target.stroke.id)
          return target.stroke.points.map((point, pointIndex) => {
            const { x, y } = absolutePoint(point, target.box)
            const active = selectedPoints.some((point) => point.strokeId === target.stroke.id && point.pointIndex === pointIndex)
              || ((selection.kind === 'point' || selection.kind === 'handle') && selection.strokeId === target.stroke.id && selection.pointIndex === pointIndex)
            return <g key={`point-${target.renderPart}-${target.stroke.id}-${pointIndex}`}>
              <circle cx={x} cy={y} r={POINT_HIT_RADIUS * u} fill="transparent" pointerEvents="all" className={styles.pointHitTarget} data-editor-point={shown ? 'hit' : 'catch'} onPointerDown={(event) => pressActiveStroke(event, target, { pointIndex })} />
              {shown && !stemGuides.some((guide) => guide.target === target && guide.pointIndex === pointIndex) && <circle cx={x} cy={y} r={(active ? ACTIVE_POINT_RADIUS : POINT_RADIUS) * u} className={active ? styles.activePoint : styles.point} data-editor-point="visible" pointerEvents="none" />}
            </g>
          })
        })}
        {!penBox && (selection.kind === 'point' || selection.kind === 'handle') && targets.filter((target) => target.stroke.id === selection.strokeId).flatMap((target) => {
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
              // 핸들 눌림 영역은 꼭짓점과 같은 크기. 겹치면 누른 자리에서 가까운 쪽이 잡힌다.
              <circle key={`handle-hit-${target.renderPart}-${handle}`} cx={position.x} cy={position.y} r={POINT_HIT_RADIUS * u} fill="transparent" pointerEvents="all" className={styles.pointHitTarget} data-editor-handle-hit={handle} onPointerDown={(event) => pressActiveStroke(event, target, { pointIndex: selection.pointIndex, handle })} />,
              // 핸들은 마름모. 꼭짓점(동그라미)과 모양으로 갈린다.
              <rect
                key={`handle-${target.renderPart}-${handle}`}
                x={position.x - (active ? ACTIVE_HANDLE_SIDE : HANDLE_SIDE) * u / 2}
                y={position.y - (active ? ACTIVE_HANDLE_SIDE : HANDLE_SIDE) * u / 2}
                width={(active ? ACTIVE_HANDLE_SIDE : HANDLE_SIDE) * u}
                height={(active ? ACTIVE_HANDLE_SIDE : HANDLE_SIDE) * u}
                transform={`rotate(45 ${position.x} ${position.y})`}
                className={active ? styles.activeHandle : styles.handle}
                data-editor-handle={active ? 'active' : 'idle'}
                onPointerDown={(event) => pressActiveStroke(event, target, { pointIndex: selection.pointIndex, handle })}
              />,
            ]
          })
        })}
        {/* 줄기 끝 표시. 막대 = 안쪽 보선에 매인 끝, 찬 점 = 칸 테두리에 매인 끝. 어느 쪽이든 끌면 그 홀자의 저장 획이 바뀐다(보선 위에 얹히는 차이) — 보선은 레이아웃 편집에서만 옮긴다.
            획을 잡기만 한 때도 뜨고, 누르면 점을 펼치지 않아도 바로 그 끝이 잡힌다. 가로 줄기 가운데 막대는 표시만 — 누름은 획 몸통이 받는다. */}
        {stemGuides.map((guide) => {
          const { target, pointIndex } = guide
          const active = pointIndex !== null && (selection.kind === 'point' || selection.kind === 'handle') && selection.strokeId === target.stroke.id && selection.pointIndex === pointIndex
          const shown = target.stroke.id === pointsOpenStrokeId
          return <g key={`stem-mark-${guide.key}`} className={styles.strokeTarget} style={{ '--selection-color': gapWarningParts.includes(target.editorPart) ? SELECTION_WARNING_COLOR : SELECTION_COLOR } as CSSProperties} data-stem-mark={guide.border ? 'locked' : 'rail'} data-rail-key={guide.key} data-active={active || undefined}>
            {guide.border
              ? <circle cx={guide.x} cy={guide.y} r={(active ? ACTIVE_POINT_RADIUS : POINT_RADIUS) * u} className={active ? styles.activeLockedMark : styles.lockedMark} pointerEvents="none" />
              : <rect x={guide.x - RAIL_MARK_WIDTH * u / 2} y={guide.y - RAIL_MARK_HEIGHT * u / 2} width={RAIL_MARK_WIDTH * u} height={RAIL_MARK_HEIGHT * u} rx={RAIL_MARK_HEIGHT * u / 2} className={active ? styles.activeRailMark : styles.railMark} pointerEvents="none" />}
            {pointIndex !== null && !shown && <circle cx={guide.x} cy={guide.y} r={POINT_HIT_RADIUS * u} fill="transparent" pointerEvents="all" className={styles.pointHitTarget} data-stem-mark-hit={guide.border ? 'locked' : 'rail'} onPointerDown={(event) => pressStemEnd(event, target, pointIndex)} />}
          </g>
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
        {/* 자소 통째 이동이 파트 상자 정가운데에 붙었다. 스냅 선과 같은 모양으로 가운데를 긋는다. */}
        {wholeJamoCentered && lockedPart && (() => {
          const box = targets.find((target) => target.editorPart === lockedPart)?.box
          if (!box) return null
          const cx = (box.x + box.width / 2) * VIEW_BOX_SIZE
          const cy = (box.y + box.height / 2) * VIEW_BOX_SIZE
          return <>
            {wholeJamoCentered.x && <line x1={cx} x2={cx} y1={-8} y2={108} className={styles.snapHitLine} data-testid="whole-jamo-center" data-axis="x" />}
            {wholeJamoCentered.y && <line x1={-8} x2={108} y1={cy} y2={cy} className={styles.snapHitLine} data-testid="whole-jamo-center" data-axis="y" />}
          </>
        })()}
        {pen && penBox && <PenLayer pen={pen} box={penBox} fresh={penFresh} viewport={viewport} weightMultiplier={penWeight} globalLinecap={globalStyle.linecap} globalLinejoin={globalStyle.linejoin} miterLimit={miterLimitOf(globalStyle.strokeStyle)} strokeStyle={globalStyle.strokeStyle} onTap={pickUnderPen} />}
        {/* 펜 중에 고른 획(묶음)의 중심선. 방금 그은 획의 잉크는 펜 층이 그리므로 그 위에 얹어야 보인다. 눌림은 안 받는다. */}
        {penBox && <g className={styles.strokeTarget} style={{ '--selection-color': SELECTION_COLOR } as CSSProperties} pointerEvents="none">
          {targets.filter((target) => (!lockedPart || target.editorPart === lockedPart) && (selectedStrokeId === target.stroke.id || (selectedStrokes.length > 1 && selectedStrokes.includes(target.stroke.id))))
            .map((target) => <path key={`picked-${target.renderPart}-${target.stroke.id}`} d={pointsToSvgD(target.stroke.points, target.stroke.closed, target.box, VIEW_BOX_SIZE)} className={styles.selectedCenterline} data-active-stroke="active" />)}
        </g>}
      </SvgRenderer>
      {wholeJamoCentered
        ? <span className={styles.snapHitChip} data-testid="stroke-snap-chip">파트 가운데</span>
        : snapHitLabels.length > 0 && <span className={styles.snapHitChip} data-testid="stroke-snap-chip">{snapHitLabels.join(' · ')}</span>}
      <span className={styles.focusChar} aria-hidden="true">{char} · {fontSpace.unitsPerEm} UPM</span>
      {corner && <span className={styles.canvasCorner} onPointerDown={(event) => event.stopPropagation()} onPointerUp={(event) => event.stopPropagation()}>{corner}</span>}
      <DevGhostToggle pressed={ghostVisible} onToggle={toggleGhost} testId="noto-ghost-toggle" panel={
        <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, whiteSpace: 'nowrap' }}>
          <input type="checkbox" checked={inkHidden} onChange={(event) => setInkHidden(event.target.checked)} data-testid="dev-ink-hidden" />내 획 숨김
        </label>
      }>
        {weightGhost && <strong data-testid="noto-ghost-weight">노토 {globalStyle.weight}</strong>}
        {ghostVisible && !weightGhost && comparison && ('xorRatio' in comparison
          ? <strong data-testid="noto-ghost-xor">xor {(comparison.xorRatio * 100).toFixed(0)}%</strong>
          : <small>{comparison.message}</small>)}
        {ghostVisible && !weightGhost && ghostError && <small>{ghostError}</small>}
      </DevGhostToggle>
    </div>
  )
}

function InferenceTrackpad({
  glyph,
  syllable,
  selection,
  creationSelection = null,
  strokeBoxes,
  selectedPoints,
  selectedStrokes,
  onWholeJamoCenteredChange,
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
  onStrokeGroupChange,
  onInkGapLimitChange,
  onMultiSelectArmedChange,
  dragApiRef,
  padDragRef,
  frameForEdit,
  toolSlot = null,
  onSpread = null,
  penTool = null,
  padHidden = false,
  guard,
}: {
  glyph: string
  syllable: DecomposedSyllable
  selection: Selection
  /** 상속받는 첫닿자 글자에 처음 손댈 때 가로채 묻는다(조절판 · 크기 막대 · 도구 단추 전부). 잡는 쪽에서 전파를 멈춘다. */
  guard?: { onPointerDownCapture: (event: ReactPointerEvent<HTMLElement>) => void; onClickCapture: (event: ReactMouseEvent<HTMLElement>) => void }
  /** 획을 안 잡았을 때 넣기 도구(추가 · 원)와 자소 통째 단추가 기댈 자리. 획 편집에 잠긴 자소, 잠기지 않았으면 고른 부품의 첫 획. */
  creationSelection?: Selection | null
  /** 이 글자의 획마다 지금 놓인 상자. 자소를 통째로 키우거나 옮길 때 글자 칸 밖으로 못 나가게 재는 데 쓴다. */
  strokeBoxes?: readonly { editorPart: MobileEditorPart; strokeId: string; box: BoxConfig }[]
  selectedPoints: SelectedPoint[]
  /** 획 묶음. 둘 이상이면 잡은 획을 끌 때 묶인 획이 같이 움직인다. */
  selectedStrokes: readonly string[]
  /** 자소 통째 이동이 파트 상자 정가운데에 붙은 축(없으면 null). 캔버스가 가운데 선을 긋는다. */
  onWholeJamoCenteredChange?: (centered: { x: boolean; y: boolean } | null) => void
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
  /** 획 묶음째 고른다(묶음에 한 일 뒤에도 묶음을 지킬 때). `strokeIds`가 하나면 그 획 하나만 잡힌다. */
  onStrokeGroupChange: (selection: Selection, strokeIds: readonly string[]) => void
  onInkGapLimitChange: (violation: CalibrationInkGapViolation | null) => void
  onMultiSelectArmedChange: (armed: boolean) => void
  /** 주면 조절판 대신 도구 줄을 그리고, 이동 계산을 캔버스 직접 끌기에 내준다(셸 안). */
  dragApiRef?: RefObject<StrokeDragApi | null>
  /** 캔버스가 여는 조절판 끌기 문. 있으면 획 · 점 · 핸들 이동은 캔버스와 같은 계산으로 간다. */
  padDragRef?: RefObject<PadDragApi | null>
  /** 직접 조작에서 `여러 점` 토글이 켜져 있는지. 상태는 부모가 든다. */
  /** 도구 단추를 그릴 자리(캔버스 왼쪽 세로 줄). 있으면 단추는 거기로 가고 트랙패드가 가로를 다 쓴다. */
  toolSlot?: HTMLElement | null
  /** 잡은 획이 형제에 퍼뜨릴 수 있는 홀자 줄기면 도구 줄 맨 아래 `전파`. 누르면 그 획 하나를 기준으로 반영 창이 뜬다. */
  onSpread?: (() => void) | null
  /** 펜 도구(잠긴 자소를 펜으로 다시 긋는다). 없으면 단추를 안 그린다. */
  penTool?: PenTool | null
  /** 캔버스 `크게` 보기. 조절판과 자소 크기 막대를 안 그린다 — 이동 계산과 도구 줄은 이 부품이 들고 있어 부품은 그대로 남는다. */
  padHidden?: boolean
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
  // 도구 줄 단추가 편 패널. `추가`는 넣을 것(선 · 원 · 사각 · 펜), `스타일`은 고른 획의 스타일(지금은 꺾임, 뒤에 끝 모양 등이 줄로 더해진다). 조절판 자리에 펴지고 한 번에 하나만 열린다.
  const [toolPanel, setToolPanel] = useState<'add' | 'style' | null>(null)
  // `초기화`를 눌러 되돌릴지 묻는 창이 떠 있는지.
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false)
  useEffect(() => {
    if (!resetConfirmOpen) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setResetConfirmOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [resetConfirmOpen])
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
    : Boolean(selectedStroke && selectedJamo)

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
  // 얇은 칸의 줄기(ㅡ · ㅣ)는 저장 좌표가 넓힌 칸 비율이다. 한계도 그 칸에서 재야 글자 칸 끝에서 멈춘다 — 받은 칸(두께 0)으로 재면 한계가 없는 것과 같다.
  const editBounds = (source: JamoData) => {
    if (selection.kind === 'none' || selection.kind === 'component') return CALIBRATION_FREEFORM_BOUNDS
    const strokes = getJamoStrokes(source)
    const stroke = strokes.find((item) => item.id === selection.strokeId)
    // 여유는 끄는 획의 잉크로만 잰다 — 다른 획 두께로 두 축을 다 막지 않는다.
    return calibrationEditBounds(stroke ? stemEditBox(source, stroke, selection.box) : selection.box, stroke ? [stroke] : strokes, weightToMultiplier(useGlobalStyleStore.getState().style.weight))
  }
  // 잡은 획을 옮긴다. 획 묶음이면 잡은 획의 이동(경계 · 눈금 반영)만큼 묶인 획도 같이.
  const moveSelectedStrokes = (source: JamoData, requested: StrokeMoveDelta) => {
    if (selection.kind !== 'stroke') return null
    const first = moveStroke(source, selection.strokeId, requested, editBounds(source), moveGridStep())
    if (selectedStrokes.length < 2) return first
    let jamo = first.jamo
    for (const strokeId of selectedStrokes) {
      if (strokeId !== selection.strokeId) jamo = moveStroke(jamo, strokeId, first.delta, CALIBRATION_FREEFORM_BOUNDS).jamo
    }
    return { ...first, jamo }
  }
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
      // 가른 벌(홀자별 첫닿자)을 고칠 때는 그 벌의 획을 기본 획 자리에 올린 자모에서 출발한다 — 저장 꼴 그대로 끌면 기본 획이 옮겨져 끄는 동안 안 보이고, 뗄 때 벌이 기본 모양으로 덮인다.
      const latest = adoptFamilyStrokes(activeVisibleJamo ?? selection.jamo, familyOfSyllable(syllable))
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
      // 가른 벌(홀자별 첫닿자)을 고칠 때는 그 벌의 획을 기본 획 자리에 올린 자모에서 출발한다 — 저장 꼴 그대로 끌면 기본 획이 옮겨져 끄는 동안 안 보이고, 뗄 때 벌이 기본 모양으로 덮인다.
      const latest = adoptFamilyStrokes(activeVisibleJamo ?? selection.jamo, familyOfSyllable(syllable))
      startJamo.current = latest
      currentJamo.current = latest
    }
  }
  const changeMove = (movement: StrokeMoveDelta, shownBox?: BoxConfig) => {
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
      // 이름 있는 줄기도 세로 이동이 저장 획에 남는다 — 보선 자리 위에 얹히는 이 홀자의 차이. 보선은 레이아웃 편집에서만 옮긴다.
      const strokeMove = normalized
      // 화면의 홀자 줄기는 받침 있는 칸에서도 em 휨을 지켜 놓여 있다(`placeStemStroke`). 놓인 칸에서 끈 이동량을 저장 좌표로 되돌린다.
      // 얇은 칸의 줄기는 기울이는 순간 놓인 칸이 넓어진다. 선택이 기억한 칸이 아니라 이동량을 나눈 바로 그 칸으로 되돌려야 한다.
      // 방향키 · 조절판은 칸 눈금으로 센다. 얇은 칸이면 넓힌 칸의 눈금이다.
      const toStored = (movement: StrokeMoveDelta): StrokeMoveDelta => {
        const stroke = getJamoStrokes(startJamo.current!).find((item) => item.id === selection.strokeId)
        if (!stroke) return movement
        const endpoint = selection.kind === 'point' && (selection.pointIndex === 0 || selection.pointIndex === stroke.points.length - 1)
        return storedStemDelta(startJamo.current!, stroke, shownBox ?? stemEditBox(startJamo.current!, stroke, selection.box), movement, selection.kind === 'stroke' || endpoint ? 'rigid' : 'bend')
      }
      const createCandidate = (factor: number) => {
        const movementAtFactor = toStored({ x: strokeMove.x * factor, y: strokeMove.y * factor })
        const moved = selection.kind === 'stroke'
          ? moveSelectedStrokes(startJamo.current!, movementAtFactor)
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
      const createCandidate = (factor: number) => scaleStrokes(startJamo.current!, selectedStrokes.length > 1 ? selectedStrokes : [selection.strokeId], scaleAtFactor(factor), editBounds(startJamo.current!))
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
    const before = editableJamoOf(selection.jamo, syllable)
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
  // 펜은 켜진 동안 늘 긋는다. 다른 넣기 · 바꾸기 도구를 쓰면 펜을 끈다 — 그 도구가 잡아 주는 획을 바로 고칠 수 있게.
  const leavePen = () => { if (penTool?.active) penTool.onToggle() }
  // 이 자소에 그려진 획 전부. 펜이 켜져 있으면 옛 획과 방금 그은 획을 다 센다.
  const jamoStrokeIds = creationBase ? [...new Set((strokeBoxes ?? []).filter((item) => item.editorPart === creationBase.editorPart).map((item) => item.strokeId))] : NO_STROKES
  // 획 · 점을 따로 안 잡았으면 자소가 통째로 골라진 상태다(첫 화면 · 빈 곳). 복사 · 삭제 · 스타일이 획 전부에 한다. 통째로 돌아가는 문은 빈 곳 누르기 하나다.
  // 펜이 켜진 동안은 긋는 중이라 아무것도 안 고른 상태다 — 획을 다 지우려면 펜을 끄고 한다.
  const wholePicked = selection.kind !== 'stroke' && selection.kind !== 'point' && selection.kind !== 'handle' && Boolean(creationBase) && !penTool?.active
  // 지금 고른 획들. 통째면 전부, 묶음이면 묶음, 아니면 잡은 획 하나. 복사 · 삭제 · 꺾임이 이 목록에 한다.
  const pickedStrokeIds = wholePicked ? jamoStrokeIds : selection.kind === 'stroke' && selectedStroke ? (selectedStrokes.length > 1 ? selectedStrokes : [selectedStroke.id]) : NO_STROKES
  // 고른 획이 든 자모와 그 획을 가리킬 선택. 획을 잡았으면 그것, 통째면 잠긴 자소.
  const pickedBase = selection.kind === 'stroke' ? selection : wholePicked ? creationBase : null
  const pickedJamoStrokes = () => pickedBase ? getJamoStrokes(editableJamoOf(pickedBase.jamo, syllable)).filter((stroke) => pickedStrokeIds.includes(stroke.id)) : []
  // 패널이 기댈 것이 사라지면 닫는다 — 넣을 자소가 없으면 `추가`, 고른 획이 없으면(점을 잡았거나 획이 없는 자소) `스타일`. (펜을 켤 때는 켜는 쪽이 닫는다.)
  if (toolPanel && (toolPanel === 'add' ? !creationBase : pickedStrokeIds.length === 0)) setToolPanel(null)
  // `추가` 패널은 메뉴다 — 패널과 도구 줄 밖(캔버스의 획 · 빈 곳, 머리 단추)을 누르면 닫힌다. 도구 줄의 다른 단추는 줄 쪽에서 닫는다.
  // `스타일` 패널은 고른 획의 속성이라 캔버스에서 다른 획을 눌러도 열려 있다(그 획의 값을 보인다).
  useEffect(() => {
    if (toolPanel !== 'add') return
    const onPointerDown = (event: globalThis.PointerEvent) => {
      if (event.target instanceof Element && event.target.closest('[data-tool-panel], [data-tool-rail]')) return
      setToolPanel(null)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [toolPanel])
  const addStroke = () => {
    const selection = creationBase
    if (!selection) return
    const before = editableJamoOf(selection.jamo, syllable)
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
  // 닫힌 도형 획. 원은 ㅇ·ㅎ의 둥근 획(ㅇ 프리셋과 같은 4점 베지어), 사각은 모서리가 곧은 4점. 지금 자모 상자에 꽉 차게 넣는다.
  const addClosedShape = (shape: 'circle' | 'square') => {
    const selection = creationBase
    if (!selection) return
    const before = editableJamoOf(selection.jamo, syllable)
    const strokeId = `stroke-${Date.now()}`
    // ㅇ처럼 이미 상자에 꽉 찬 닫힌 획이 있으면 똑같이 겹쳐 안 보인다. 같은 크기의 닫힌 획이 있는 동안 가운데로 줄인다.
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
    const stroke: StrokeDataV2 = shape === 'circle'
      ? {
        id: strokeId,
        points: createCirclePath(.5, .5, radius, radius).points,
        closed: true,
        thickness: selectedStroke?.thickness ?? .07,
        label: 'circle',
      }
      : {
        id: strokeId,
        points: [{ x: .5 - radius, y: .5 - radius }, { x: .5 + radius, y: .5 - radius }, { x: .5 + radius, y: .5 + radius }, { x: .5 - radius, y: .5 + radius }],
        closed: true,
        thickness: selectedStroke?.thickness ?? .07,
      }
    const after = addJamoStroke(before, selection.strokeId, stroke)
    onCommitJamo(before, after, { kind: 'stroke-move', glyph, component: selection.component, jamoType: selection.jamo.type, strokeId, delta: { x: 0, y: 0 } })
    onSelectionChange({ ...selection, kind: 'stroke', strokeId, jamo: after, pointsOpen: false })
  }
  // 고른 획(묶음이면 묶음, 통째면 자소의 획 전부)을 두께·모양 그대로 복사판에 담는다.
  const clipboardStrokes = useStrokeClipboard((state) => state.strokes)
  const [strokeCopied, setStrokeCopied] = useState(false)
  // 개발용: 마지막 펜 입력을 클립보드로(부모가 자모 상태까지 담아 준다).
  const [penRawCopied, setPenRawCopied] = useState(false)
  const copyPenRaw = () => {
    if (!penTool?.devCopyRaw) return
    void penTool.devCopyRaw().then((ok) => { if (ok) { setPenRawCopied(true); window.setTimeout(() => setPenRawCopied(false), 1200) } })
  }
  const copyStroke = () => {
    const strokes = selection.kind === 'stroke' && selectedStroke && pickedStrokeIds.length === 1 ? [selectedStroke] : pickedJamoStrokes()
    if (strokes.length === 0) return
    useStrokeClipboard.setState({ strokes: structuredClone(strokes) })
    setStrokeCopied(true)
    window.setTimeout(() => setStrokeCopied(false), 1200)
  }
  // 지금 자소(고른 것, 없으면 잠긴 것)에 복사한 획을 같은 자리(자소 상자 안 0–1 좌표)로 더한다. 원래 획은 그대로 둔다.
  // 같은 자리에 똑같은 획이 있으면 묶음째 같은 만큼 비켜 놓는다. 한 획이면 그 획을, 여럿이면 선택을 풀어 붙인 모양을 다 보이게 한다.
  const pasteStroke = () => {
    const selection = creationBase
    if (!selection || clipboardStrokes.length === 0) return
    leavePen()
    const before = editableJamoOf(selection.jamo, syllable)
    const stamp = Date.now()
    const ids = clipboardStrokes.map((_, index) => clipboardStrokes.length === 1 ? `stroke-${stamp}` : `stroke-${stamp}-${index}`)
    const existing = getJamoStrokes(before)
    const pasted = (offset: number) => clipboardStrokes.map((stroke, index) => offsetStroke(stroke, ids[index], offset))
    let offset = 0
    while (offset < .3 && pasted(offset).some((copy) => existing.some((stroke) => samePoints(stroke, copy)))) offset += PASTE_OFFSET
    const after = pasted(offset).reduce((jamo, stroke) => addJamoStroke(jamo, selection.strokeId, stroke), before)
    onCommitJamo(before, after, { kind: 'stroke-move', glyph, component: selection.component, jamoType: selection.jamo.type, strokeId: ids[0], delta: { x: 0, y: 0 } })
    onSelectionChange(ids.length === 1 ? { ...selection, kind: 'stroke', strokeId: ids[0], jamo: after, pointsOpen: false } : { kind: 'none' })
  }
  // 지금 자소(고른 것, 없으면 잠긴 것)를 기본 프리셋으로 되돌린다. 문맥 변형까지 처음 그대로 — 틀 · 잉크 간격 보정도 얹지 않는다.
  // 고친 획이 한 번에 다 사라지니 먼저 묻는다(되돌리기로 되살릴 수는 있다).
  const resetBase = creationBase ? getBaseJamo(creationBase.jamo.type, creationBase.jamo.char) : undefined
  const canResetJamo = Boolean(creationBase && resetBase
    && JSON.stringify(getJamo(creationBase.jamo.type, creationBase.jamo.char)) !== JSON.stringify(resetBase))
  const resetJamo = () => {
    const selection = creationBase
    setResetConfirmOpen(false)
    if (!selection || !resetBase || !canResetJamo) return
    leavePen()
    const before = structuredClone(getJamo(selection.jamo.type, selection.jamo.char) ?? selection.jamo)
    const firstStrokeId = getJamoStrokes(adoptFamilyStrokes(resetBase, familyOfSyllable(syllable)))[0]?.id ?? selection.strokeId
    onCommitJamo(before, resetBase, { kind: 'stroke-move', glyph, component: selection.component, jamoType: selection.jamo.type, strokeId: firstStrokeId, delta: { x: 0, y: 0 } }, { unframed: true, pastGapLimit: true })
    onSelectionChange({ ...selection, kind: 'stroke', strokeId: firstStrokeId, jamo: resetBase, pointsOpen: false })
  }
  // 쌍자음 초성이면 홑자음 초성을 앞 · 뒤 두 번 가져온다(ㄱ → ㄲ). 지금 모음 계열 변형 그대로, 지금 쌍자음 획은 다 바뀐다(되돌리기로 되살림).
  const doubleSplit = creationBase?.jamo.type === 'choseong' ? DOUBLE_SPLIT[creationBase.jamo.char] : undefined
  const takeSingle = () => {
    const selection = creationBase
    const single = doubleSplit ? getJamo('choseong', doubleSplit.single) : undefined
    if (!selection || !single) return
    leavePen()
    const family = familyOfSyllable(syllable)
    const before = editableJamoOf(selection.jamo, syllable)
    const after = doubleFromSingle(adoptFamilyStrokes(single, family), before)
    const firstStrokeId = after?.strokes?.[0]?.id
    if (!after || !firstStrokeId) return
    onCommitJamo(before, after, { kind: 'stroke-move', glyph, component: selection.component, jamoType: selection.jamo.type, strokeId: firstStrokeId, delta: { x: 0, y: 0 } })
    onSelectionChange({ ...selection, kind: 'stroke', strokeId: firstStrokeId, jamo: after, pointsOpen: false })
  }
  const connectStroke = () => {
    if ((selection.kind !== 'stroke' && selection.kind !== 'point' && selection.kind !== 'handle') || !selectedStroke || !mergeTarget) return
    // 문법 표에 있는 획을 바탕으로 잇는다 — 새로 그린 조각을 잡고 기둥에 이어도 기둥 id와 설정이 남아 `전파`가 뜬다.
    const keepId = survivingStrokeId(selection.jamo.type, selection.jamo.char, selectedStroke.id, mergeTarget.id)
    const [kept, other] = keepId === selectedStroke.id ? [selectedStroke, mergeTarget] : [mergeTarget, selectedStroke]
    const merged = mergeStrokes(kept, other)
    if (!merged) return
    const before = editableJamoOf(selection.jamo, syllable)
    const after = updateJamoStroke(updateJamoStroke(before, keepId, () => merged), other.id, () => null)
    onCommitJamo(before, after, { kind: 'stroke-move', glyph, component: selection.component, jamoType: selection.jamo.type, strokeId: keepId, delta: { x: 0, y: 0 } })
    onSelectionChange({ ...selection, kind: 'stroke', strokeId: keepId, jamo: after })
  }
  const disconnectStroke = () => {
    if ((selection.kind !== 'point' && selection.kind !== 'handle') || !selectedStroke || !canDisconnect) return
    const before = editableJamoOf(selection.jamo, syllable)
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
    // 통째로 고른 자소: 획을 전부 지운다(옛 `비우기`). 자소는 통째로 고른 채 남는다.
    if (wholePicked && pickedBase && pickedStrokeIds.length > 0) {
      const before = editableJamoOf(pickedBase.jamo, syllable)
      const after = pickedStrokeIds.reduce((jamo, strokeId) => updateJamoStroke(jamo, strokeId, () => null), before)
      onCommitJamo(before, after, { kind: 'stroke-move', glyph, component: pickedBase.component, jamoType: pickedBase.jamo.type, strokeId: pickedStrokeIds[0], delta: { x: 0, y: 0 } })
      return
    }
    if ((selection.kind !== 'stroke' && selection.kind !== 'point' && selection.kind !== 'handle') || !selectedStroke || !canDelete) return
    // 펜이 켜진 동안 획을 지우면 남은 그은 획이 빈 역할을 다시 받는다 — 그 판정은 펜 쪽(부모)이 한다.
    if (selection.kind === 'stroke' && penTool?.active) return penTool.onDelete(pickedStrokeIds)
    const before = editableJamoOf(selection.jamo, syllable)
    const after = selection.kind === 'point' || selection.kind === 'handle'
      ? updateJamoStroke(before, selectedStroke.id, (stroke) => ({ ...stroke, points: stroke.points.filter((_, index) => index !== selection.pointIndex) }))
      // 묶어 고른 획은 한 번에 지운다(되돌리기 한 줄).
      : pickedStrokeIds.reduce((jamo, strokeId) => updateJamoStroke(jamo, strokeId, () => null), before)
    onCommitJamo(before, after, { kind: selection.kind === 'stroke' ? 'stroke-move' : 'point-move', glyph, component: selection.component, jamoType: selection.jamo.type, strokeId: selectedStroke.id, ...(selection.kind === 'stroke' ? {} : { pointIndex: selection.pointIndex }), delta: { x: 0, y: 0 } } as RawGlyphEdit)
    // 지운 뒤에는 남은 첫 획을 잡는다 — 통째로 돌아가면 `삭제`를 한 번 더 눌렀을 때 전부 지워진다. 남은 획이 없으면 푼다.
    const nextStrokeId = selection.kind === 'stroke' ? getJamoStrokes(after)[0]?.id : selectedStroke.id
    onSelectionChange(nextStrokeId ? { ...selection, kind: 'stroke', strokeId: nextStrokeId, jamo: after } : { kind: 'none' })
  }
  // 고른 획(하나 · 묶음 · 통째)의 꺾임. `적용 안 함`이면 값을 지워 전역을 따른다. 획별 값이 있으면 전역을 바꿔도 안 바뀐다(획 > 전역).
  // 여럿을 골랐을 때 보이는 값은 잡은 획(통째면 첫 획)의 것이다.
  const pickedJoin = selection.kind === 'stroke' && selectedStroke ? selectedStroke.linejoin : wholePicked ? pickedJamoStrokes()[0]?.linejoin : undefined
  const strokeJoinLabel = JOIN_CHOICES.find((choice) => choice.id === pickedJoin)?.label ?? '적용 안 함'
  const setStrokeJoin = (next: StrokeLinejoin | undefined) => {
    if (!pickedBase || pickedStrokeIds.length === 0) return
    const before = editableJamoOf(pickedBase.jamo, syllable)
    if (getJamoStrokes(before).filter((stroke) => pickedStrokeIds.includes(stroke.id)).every((stroke) => stroke.linejoin === next)) return
    const after = pickedStrokeIds.reduce((jamo, id) => updateJamoStroke(jamo, id, (stroke) => {
      const { linejoin: _dropped, ...rest } = stroke
      void _dropped
      return next ? { ...rest, linejoin: next } : rest
    }), before)
    onCommitJamo(before, after, { kind: 'stroke-move', glyph, component: pickedBase.component, jamoType: pickedBase.jamo.type, strokeId: pickedStrokeIds[0], delta: { x: 0, y: 0 } })
    // 획을 잡은 채였으면 그대로(묶음도 지킨다) — 이어서 다른 꺾임을 골라 볼 수 있다. 통째면 통째 그대로다.
    if (selection.kind === 'stroke') onStrokeGroupChange({ ...selection, jamo: after }, pickedStrokeIds)
  }
  // 고른 획(하나 · 묶음 · 통째)의 굵기. 저장값은 획의 `thickness`이고, 막대는 그 획의 기본 굵기(프리셋의 같은 획)에 대한 %다. 전역 굵기는 이 위에 곱해진다.
  // 여럿을 골랐을 때 보이는 값은 잡은 획(통째면 첫 획)의 것이고, 막대를 끌면 고른 획 전부가 저마다의 기본 굵기에서 같은 %가 된다.
  // 끄는 동안은 미리보기, 손을 떼면 되돌리기 한 줄. `적용 안 함`은 기본 굵기로 돌린다.
  const thicknessStroke = toolPanel !== 'style' ? undefined : selection.kind === 'stroke' && selectedStroke ? selectedStroke : wholePicked ? pickedJamoStrokes()[0] : undefined
  const thicknessPreset = thicknessStroke && pickedBase ? getBaseJamo(pickedBase.jamo.type, pickedBase.jamo.char) : undefined
  const thicknessPresetStrokes = thicknessPreset ? getJamoStrokes(adoptFamilyStrokes(thicknessPreset, familyOfSyllable(syllable))) : []
  const thicknessBaseOf = (strokeId: string) => baseStrokeThickness(thicknessPresetStrokes, strokeId)
  const [thicknessDraft, setThicknessDraft] = useState<number | null>(null)
  const thicknessDrag = useRef<{ source: JamoData | null; percent: number | null; dragging: boolean }>({ source: null, percent: null, dragging: false })
  const thicknessShown = thicknessStroke ? thicknessDraft ?? thicknessPercent(thicknessStroke.thickness, thicknessBaseOf(thicknessStroke.id)) : undefined
  const thicknessIsBase = Boolean(thicknessStroke) && (thicknessDraft === null ? isBaseThickness(thicknessStroke!.thickness, thicknessBaseOf(thicknessStroke!.id)) : thicknessDraft === STROKE_THICKNESS_PERCENT.base)
  const withThickness = (jamo: JamoData, percent: number) => pickedStrokeIds.reduce((next, id) => updateJamoStroke(next, id, (stroke) => ({ ...stroke, thickness: thicknessAtPercent(percent, thicknessBaseOf(id)) })), jamo)
  const thicknessSource = () => {
    if (!thicknessDrag.current.source && pickedBase) thicknessDrag.current.source = editableJamoOf(pickedBase.jamo, syllable)
    return thicknessDrag.current.source
  }
  const previewThickness = (percent: number) => {
    const source = thicknessSource()
    if (!source || thicknessDrag.current.percent === percent) return
    thicknessDrag.current.percent = percent
    setThicknessDraft(percent)
    onPreviewJamo({ type: source.type, char: source.char, data: withThickness(source, percent), baseline: source })
  }
  const cancelThickness = () => {
    thicknessDrag.current = { source: null, percent: null, dragging: false }
    setThicknessDraft(null)
    onPreviewJamo(null)
  }
  const commitThickness = (percent: number | null) => {
    const source = thicknessSource()
    if (!source || !pickedBase || percent === null) return cancelThickness()
    const after = withThickness(source, percent)
    thicknessDrag.current = { source: null, percent: null, dragging: false }
    setThicknessDraft(null)
    // 바뀐 게 없으면 미리보기만 거둔다(저장 쪽은 같은 값이면 아무것도 안 한다).
    if (JSON.stringify(source) === JSON.stringify(after)) return onPreviewJamo(null)
    onCommitJamo(source, after, { kind: 'stroke-move', glyph, component: pickedBase.component, jamoType: pickedBase.jamo.type, strokeId: pickedStrokeIds[0], delta: { x: 0, y: 0 } })
    if (selection.kind === 'stroke') onStrokeGroupChange({ ...selection, jamo: after }, pickedStrokeIds)
  }
  // 트랙패드 왼쪽 크기 막대. 지금 자소(고른 것, 없으면 잠긴 것)를 통째로 키운다. 두께는 전역 굵기 그대로.
  // 넘친 만큼은 상자 밖으로 그대로 나가야 하므로 문맥 간격 되당김을 얹지 않는다(`pastGapLimit`).
  // 자소 상자는 넘어도 글자 칸은 못 넘는다. 시작할 때 획마다 놓인 상자에서 한계를 재 두고(끄는 동안 상자가 흔들려도 같다), 닿는 배율 · 거리에서 멈춘다.
  // 키우다 한쪽이 칸 끝에 닿으면 그쪽을 붙잡고 반대쪽으로 더 키운다(`limitJamoScale`).
  const wholeJamoBounds = useRef<StrokeBoundsOf>(() => undefined)
  const captureWholeJamoBounds = (source: JamoData | null, editorPart: MobileEditorPart | undefined) => {
    const weight = weightToMultiplier(useGlobalStyleStore.getState().style.weight)
    const placed = (strokeBoxes ?? []).filter((item) => item.editorPart === editorPart)
    const strokes = source ? getJamoStrokes(source) : []
    const table = new Map(placed.map((item) => {
      // 한계는 그 획 자신의 잉크로 잰다(섞임홀자는 가로부 · 세로부 상자가 다르다). 못 찾으면 같은 상자의 획으로.
      const together = strokes.filter((stroke) => placed.some((other) => other.strokeId === stroke.id && other.box === item.box))
      const own = strokes.find((stroke) => stroke.id === item.strokeId)
      // 얇은 칸의 줄기는 넓힌 칸에서 잰다(저장 좌표가 그 칸 비율이다).
      return [item.strokeId, calibrationEditBounds(source && own ? stemEditBox(source, own, item.box) : item.box, own ? [own] : together, weight)] as const
    }))
    wholeJamoBounds.current = (strokeId) => table.get(strokeId)
  }
  const scaleSource = useRef<JamoData | null>(null)
  const beginJamoScale = () => {
    const base = creationBase
    scaleSource.current = base ? editableJamoOf(base.jamo, syllable) : null
    captureWholeJamoBounds(scaleSource.current, base?.editorPart)
  }
  // 실제로 쓴 배율을 돌려준다 — 크기 막대가 요청이 아니라 커진 만큼을 보인다.
  const changeJamoScale = (requested: number) => {
    const source = scaleSource.current
    if (!source) return requested
    const { factor, shift } = limitJamoScale(source, requested, wholeJamoBounds.current)
    onPreviewJamo({ type: source.type, char: source.char, data: scaleJamoStrokes(source, factor, shift), baseline: source, pastGapLimit: true })
    return factor
  }
  const commitJamoScale = (requested: number) => {
    const source = scaleSource.current
    const base = creationBase
    scaleSource.current = null
    if (!source || !base) return onPreviewJamo(null)
    const { factor, shift } = limitJamoScale(source, requested, wholeJamoBounds.current)
    onCommitJamo(source, scaleJamoStrokes(source, factor, shift), { kind: 'stroke-scale', glyph, component: base.component, jamoType: source.type, strokeId: base.strokeId, scale: { x: factor, y: factor } }, { pastGapLimit: true })
  }
  const cancelJamoScale = () => {
    scaleSource.current = null
    onPreviewJamo(null)
  }
  // ⌘C · ⌘V(Ctrl) = `복사` · `붙여넣기` 단추. 입력칸에서는 글자 복사에 맡긴다.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey || event.isComposing || isTypingTarget(event.target)) return
      const key = event.key.toLowerCase()
      if (key === 'c' && pickedStrokeIds.length > 0) {
        event.preventDefault()
        copyStroke()
      } else if (key === 'v' && creationBase && clipboardStrokes.length > 0 && !penTool?.active) {
        event.preventDefault()
        pasteStroke()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })
  // Delete · Backspace = `삭제` 단추. 입력칸에서는 글자 지우기에 맡긴다.
  useEffect(() => {
    if (!canDelete) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isDeleteKey(event) || event.isComposing || isTypingTarget(event.target)) return
      event.preventDefault()
      deleteSelection()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  // 조절판 이동이 캔버스 끌기 계산(px → em · 같은 스냅)으로 가는 중인지. 셸 안의 획 · 점 · 핸들만 그렇고, 자소 통째 · 옛 화면은 옛 계산이다.
  const padRouted = useRef(false)
  // 아무것도 안 골랐으면 잠긴 자소 전체가 잡힌 상태다: 두 손가락은 통째로 키우고(왼쪽 크기 막대와 같은 계산, 가로 · 세로 같은 비율), 한 손가락은 통째로 옮긴다.
  // 펜이 켜져 있으면 조절판을 끈다 — 긋다가 조절판에 닿아 자소가 통째로 옮겨지지 않게(리뷰 10-05).
  const wholeJamoPinch = selection.kind === 'none' && Boolean(creationBase) && !penTool?.active
  const wholeJamoFactor = useRef(1)
  const wholeJamoMove = useRef<{ source: JamoData; center: { x: number; y: number }; delta: StrokeMoveDelta } | null>(null)
  const beginWholeJamoMove = () => {
    const base = creationBase
    const source = base ? editableJamoOf(base.jamo, syllable) : null
    wholeJamoMove.current = source ? { source, center: jamoCenterlineCenter(source), delta: { x: 0, y: 0 } } : null
    captureWholeJamoBounds(source, base?.editorPart)
  }
  const changeWholeJamoMove = (movement: StrokeMoveDelta) => {
    const state = wholeJamoMove.current
    if (!state) return
    // 눈금에 붙이고, 파트 상자 정가운데 가까이면 가운데에 먼저 붙인다(09-30 사용자).
    const gridded = { x: Math.round(movement.x * .001 / snapStep) * snapStep, y: Math.round(movement.y * .001 / snapStep) * snapStep }
    const snapped = snapWholeJamoDelta(state.center, gridded)
    state.delta = limitJamoMoveDelta(state.source, snapped.delta, wholeJamoBounds.current)
    onWholeJamoCenteredChange?.(snapped.centered.x || snapped.centered.y ? snapped.centered : null)
    onPreviewJamo({ type: state.source.type, char: state.source.char, data: translateJamoStrokes(state.source, state.delta), baseline: state.source, pastGapLimit: true })
  }
  const commitWholeJamoMove = () => {
    const state = wholeJamoMove.current
    const base = creationBase
    wholeJamoMove.current = null
    onWholeJamoCenteredChange?.(null)
    if (!state || !base) return onPreviewJamo(null)
    onCommitJamo(state.source, translateJamoStrokes(state.source, state.delta), { kind: 'stroke-move', glyph, component: base.component, jamoType: state.source.type, strokeId: base.strokeId, delta: state.delta }, { pastGapLimit: true })
  }
  const trackpad = useUnifiedTrackpad({
    enabled: selection.kind !== 'none' || wholeJamoPinch,
    scaleEnabled: selection.kind === 'component' || selection.kind === 'stroke' || wholeJamoPinch,
    moveDeadzone: direct ? DRAG_THRESHOLD_PX : undefined,
    onMoveStart: () => {
      if (wholeJamoPinch) return beginWholeJamoMove()
      padRouted.current = Boolean(direct && padDragRef?.current?.begin())
      if (padRouted.current) return
      padMove.current = true
      beginMove()
    },
    onMoveChange: (movement) => wholeJamoPinch ? changeWholeJamoMove(movement) : padRouted.current ? padDragRef?.current?.move(movement.x, movement.y) : changeMove(movement),
    onMoveCommit: () => {
      if (wholeJamoPinch) return commitWholeJamoMove()
      if (!padRouted.current) return commitMove()
      padRouted.current = false
      padDragRef?.current?.end(false)
    },
    onScaleStart: () => {
      if (!wholeJamoPinch) return beginScale()
      wholeJamoFactor.current = 1
      beginJamoScale()
    },
    onScaleChange: (relative, axis) => {
      if (!wholeJamoPinch) return changeScale(relative, axis)
      wholeJamoFactor.current = Math.min(2, Math.max(.5, axis === 'x' ? relative.x : relative.y))
      changeJamoScale(wholeJamoFactor.current)
    },
    onScaleCommit: () => wholeJamoPinch ? commitJamoScale(wholeJamoFactor.current) : commitScale(),
    onCancel: () => {
      if (wholeJamoPinch) {
        wholeJamoMove.current = null
        return cancelJamoScale()
      }
      if (!padRouted.current) return cancel()
      padRouted.current = false
      padDragRef?.current?.end(true)
    },
  })
  useEffect(() => {
    // 조절판에 손가락을 대고 있는 동안 누르는 점 · 획이 더해진다(`여러 점` 단추는 뺐다). 셸(캔버스 직접 끌기)에도 조절판이 돌아와서 같이 쓴다.
    onMultiSelectArmedChange(trackpad.visualState.mode === 'pending' && trackpad.visualState.points.length === 1)
  }, [onMultiSelectArmedChange, trackpad.visualState.mode, trackpad.visualState.points.length])
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
    // 두 손가락으로 늘어나는 축. 획 하나는 길이가 있는 축만(가로획은 세로가 잠긴다 — `scaleStroke`의 잠긴 축), 자소 전체는 둘 다 같은 비율.
    const stretchAxes = wholeJamoPinch
      ? { x: true, y: true }
      : selection.kind === 'stroke' && selectedStroke
        ? (() => {
          // 획 묶음이면 묶인 획 전체 범위로(한 덩어리로 늘어난다).
          const group = selectedStrokes.length > 1 ? getJamoStrokes(selection.jamo).filter((stroke) => selectedStrokes.includes(stroke.id)) : [selectedStroke]
          const xs = group.flatMap((stroke) => stroke.points.map((point) => point.x))
          const ys = group.flatMap((stroke) => stroke.points.map((point) => point.y))
          return { x: Math.max(...xs) - Math.min(...xs) > 1e-6, y: Math.max(...ys) - Math.min(...ys) > 1e-6 }
        })()
        : { x: false, y: false }
    const scaling = trackpad.visualState.mode === 'scale'
    // 늘리는 중에 진하게 켤 길. 잠긴 축으로 벌리면 켜지 않는다. 자소 전체는 벌린 축과 상관없이 둘 다라 켜진 채(둘 다 옅게) 둔다.
    const scaleLaneAxis = wholeJamoPinch ? null : trackpad.visualState.axis && stretchAxes[trackpad.visualState.axis] ? trackpad.visualState.axis : null
    const directLabel = penTool?.active && penTool.status ? penTool.status : [
      selectedPoints.length > 1 ? `점 ${selectedPoints.length}개 함께` : '',
      inkGapLimiter ? pastGapLimit.current ? `${inkGapLimiter.char}에서 옆 자소에 너무 붙음` : `${inkGapLimiter.char}에서 최소 간격 · 더 끌면 넘어감` : '',
    ].filter(Boolean).join(' · ')
    // 기준 틀이 굳은 자모만 `틀 다시 맞추기`가 된다.
    const liveJamo = editable ? activeVisibleJamo ?? selection.jamo : null
    const resetFrame = () => {
      if (!editable) return
      const before = editableJamoOf(selection.jamo, syllable)
      if (!before.frame) return
      onCommitJamo(before, withoutFrame(before), { kind: 'stroke-move', glyph, component: selection.component, jamoType: selection.jamo.type, strokeId: selection.strokeId, delta: { x: 0, y: 0 } }, { unframed: true })
    }
    // 도구 줄에는 지금 고른 것에 쓰는 단추만 세운다. 첫 칸 `추가`(펜이 켜지면 `펜`)는 늘 같은 자리.
    // 획에 하는 일(복사 · 삭제 · 꺾임)은 고른 획에 한다 — 통째로 골랐으면(첫 화면 · 빈 곳) 자소의 획 전부, 획을 잡았으면 그 획(묶음).
    // 자소에 하는 일(맞춤 · 초기화)은 통째일 때만 — 획 · 점을 잡은 채로는 빈 곳을 눌러 돌아간다.
    const penActive = Boolean(penTool?.active)
    const railMode = !editable ? 'jamo' : onPoint ? 'point' : 'stroke'
    const togglePanel = (kind: 'add' | 'style') => setToolPanel((open) => open === kind ? null : kind)
    const pickAdd = (add: () => void) => {
      setToolPanel(null)
      leavePen()
      add()
    }
    // 펜은 고른 뒤에도 켜진 채 남는 도구라, 켜지면 패널은 닫히고 도구 줄 첫 칸이 켜진 `펜`으로 바뀐다. 다시 누르면 꺼지고 `추가`로 돌아온다.
    const togglePen = () => {
      if (!penTool || penTool.blocked) return
      setToolPanel(null)
      penTool.onToggle()
    }
    const copyLabel = <>{strokeCopied ? <Check size={18} aria-hidden="true" /> : <Copy size={18} aria-hidden="true" />}<span>{strokeCopied ? '복사함' : '복사'}</span></>
    // 붙여넣기는 복사 바로 아래. 복사한 게 있을 때만 뜬다.
    const pasteButton = creationBase && clipboardStrokes.length > 0 && <Pressable type="button" onClick={pasteStroke} aria-label="획 붙여넣기" data-testid="jamo-stroke-paste"><ClipboardPaste size={18} aria-hidden="true" /><span>붙여넣기</span></Pressable>
    const deleteButton = (wholePicked ? pickedStrokeIds.length > 0 : canDelete) && <Pressable type="button" onClick={deleteSelection} aria-label={onPoint ? '꼭짓점 삭제' : '획 삭제'}><Trash2 size={18} aria-hidden="true" /><span>삭제</span></Pressable>
    const copyButton = pickedStrokeIds.length > 0 && <Pressable type="button" onClick={copyStroke} aria-label="획 복사" data-testid="jamo-stroke-copy">{copyLabel}</Pressable>
    // 고른 획(하나 · 묶음 · 통째)의 스타일. 단추는 하나, 값은 패널 안에서 줄마다 고른다 — 끝 모양 같은 것이 생기면 줄만 더한다.
    const styleButton = pickedStrokeIds.length > 0 && <Pressable type="button" onClick={() => togglePanel('style')} aria-expanded={toolPanel === 'style'} aria-label={`획 스타일 — 꺾임 ${strokeJoinLabel}`} data-testid="jamo-stroke-style" data-join={pickedJoin ?? 'global'} data-panel-toggle><SlidersHorizontal size={18} aria-hidden="true" /><span>스타일</span></Pressable>
    const connectButton = mergeTarget && pickedStrokeIds.length <= 1 && <Pressable type="button" onClick={connectStroke} aria-label="가까운 선 연결"><Link2 size={18} aria-hidden="true" /><span>잇기</span></Pressable>
    // 패널을 편 채 다른 단추(복사 · 삭제 …)를 누르면 패널은 닫히고 그 단추가 제 일을 한다. `추가` · `스타일`끼리는 서로 바꿔 편다.
    const closePanelOnOtherTool = (event: ReactMouseEvent<HTMLDivElement>) => {
      const button = event.target instanceof Element ? event.target.closest('button') : null
      if (button && !button.hasAttribute('data-panel-toggle')) setToolPanel(null)
    }
    const toolRail = (
      <div className={styles.strokeToolRow} role="toolbar" aria-label="획 편집 도구" data-mode={railMode} data-tool-rail onClickCapture={closePanelOnOtherTool}>
        {penActive
          ? <Pressable type="button" onClick={togglePen} aria-pressed aria-label="펜으로 그리기" data-testid="jamo-stroke-pen"><Pencil size={18} aria-hidden="true" /><span>펜</span></Pressable>
          : <Pressable type="button" onClick={() => togglePanel('add')} disabled={!creationBase} aria-expanded={toolPanel === 'add'} aria-label="획 추가" data-panel-toggle><Plus size={18} aria-hidden="true" /><span>추가</span></Pressable>}
        {/* 늘 뜨는 단추를 앞에, 될 때만 뜨는 단추(잇기 · 끊기)를 뒤에 둬 자리가 덜 흔들린다. */}
        {railMode === 'stroke' && <>
          {copyButton}
          {pasteButton}
          {deleteButton}
          {styleButton}
          {connectButton}
        </>}
        {railMode === 'point' && <>
          <Pressable type="button" onClick={toggleCurve} aria-label={selectedPointHasCurve ? '직선화' : '곡선화'}><Spline size={18} aria-hidden="true" /><span>{selectedPointHasCurve ? '직선' : '곡선'}</span></Pressable>
          {deleteButton}
          {canDisconnect && <Pressable type="button" onClick={disconnectStroke} aria-label="선 끊기"><Unlink size={18} aria-hidden="true" /><span>끊기</span></Pressable>}
          {connectButton}
        </>}
        {railMode === 'jamo' && <>
          {copyButton}
          {pasteButton}
          {deleteButton}
          {styleButton}
          {/* 자소를 기본 프리셋이 놓이는 자리와 똑같이 채운다. 이미 그 자리면 꺼진다. */}
          {creationBase && penTool && <Pressable type="button" onClick={() => { leavePen(); penTool.onFit() }} disabled={!penTool.canFit} aria-label={`${creationBase.jamo.char} 칸에 맞추기`} data-testid="jamo-stroke-fit"><Scan size={18} aria-hidden="true" /><span>맞춤</span></Pressable>}
          {creationBase && <Pressable type="button" onClick={() => setResetConfirmOpen(true)} disabled={!canResetJamo} aria-label={`${creationBase.jamo.char} 프리셋으로 초기화`} data-testid="jamo-stroke-reset"><RotateCcw size={18} aria-hidden="true" /><span>초기화</span></Pressable>}
        </>}
        {/* 맨 아래 주황 단추. 잡은 홀자 줄기의 모양(휨 · 기울기)을 같은 갈래 형제에 퍼뜨린다 — 모양이 마스터와 다를 때만 뜬다. */}
        {onSpread && <Pressable type="button" className={styles.strokeToolSpread} onClick={onSpread} aria-label="이 획 모양을 형제에 전파" data-testid="jamo-stroke-spread"><Share2 size={18} aria-hidden="true" /><span>전파</span></Pressable>}
        {/* 개발용 단추는 줄 맨 끝. */}
        {penTool?.devCopyRaw && penActive && <Pressable type="button" onClick={copyPenRaw} aria-label="마지막 펜 입력 복사 (개발용)" data-testid="dev-pen-raw-copy"><Copy size={18} aria-hidden="true" /><span>{penRawCopied ? '복사함' : '입력 복사'}</span></Pressable>}
      </div>
    )
    // `추가` 패널: 넣을 것. 꺾임과 같은 그림 칸으로 세우고, 하나를 고르면 닫힌다. 쌍자음이면 홑자 모양 가져오기도 여기 있다.
    const PANEL_PICTO = '[&_svg]:h-[44px] [&_svg]:w-14'
    const THICKNESS_TICKS = [{ at: STROKE_THICKNESS_PERCENT.min, text: String(STROKE_THICKNESS_PERCENT.min) }, { at: STROKE_THICKNESS_PERCENT.base, text: '기본' }, { at: 150 }, { at: STROKE_THICKNESS_PERCENT.max, text: String(STROKE_THICKNESS_PERCENT.max) }]
    const addChoices = creationBase && (
      <ChoiceGroup variant="tile" className={styles.panelChoices} aria-label="추가할 것">
        <ChoiceItem checked={false} onClick={() => pickAdd(addStroke)} className={PANEL_PICTO} aria-label="선 추가"><Minus aria-hidden="true" /><strong>선</strong></ChoiceItem>
        <ChoiceItem checked={false} onClick={() => pickAdd(() => addClosedShape('circle'))} className={PANEL_PICTO} aria-label="원 넣기" data-testid="jamo-stroke-add-circle"><Circle aria-hidden="true" /><strong>원</strong></ChoiceItem>
        <ChoiceItem checked={false} onClick={() => pickAdd(() => addClosedShape('square'))} className={PANEL_PICTO} aria-label="사각 넣기" data-testid="jamo-stroke-add-square"><Square aria-hidden="true" /><strong>사각</strong></ChoiceItem>
        {penTool && <ChoiceItem checked={false} onClick={togglePen} disabled={Boolean(penTool.blocked)} className={PANEL_PICTO} aria-label={penTool.blocked ?? '펜으로 그리기'} data-testid="jamo-stroke-pen"><Pencil aria-hidden="true" /><strong>펜</strong></ChoiceItem>}
        {doubleSplit && <ChoiceItem checked={false} onClick={() => pickAdd(takeSingle)} className={PANEL_PICTO} aria-label={`${doubleSplit.single} 모양 가져오기`} data-testid="jamo-stroke-take-single"><Import aria-hidden="true" /><strong>{doubleSplit.single} 모양</strong></ChoiceItem>}
      </ChoiceGroup>
    )
    // `스타일` 패널: 줄마다 이름 + 그림 칸. 줄 맨 앞 칸은 `적용 안 함`(이 획에 따로 정한 값이 없음 — 꺾임은 전역, 굵기는 기본 굵기). 골라도 열려 있어 바로 바꿔 본다.
    const stylePanel = pickedStrokeIds.length > 0 && (
      <div className={styles.stylePanel}>
        <section>
          <h3>꺾임</h3>
          <ChoiceGroup variant="tile" className={styles.panelChoices} aria-label="이 획 꺾임">
            <ChoiceItem checked={!pickedJoin} onClick={() => setStrokeJoin(undefined)} className={PANEL_PICTO} data-testid="jamo-stroke-join-choice" data-join="global">
              <NonePicto /><strong>적용 안 함</strong>
            </ChoiceItem>
            {JOIN_CHOICES.map((choice) => (
              <ChoiceItem key={choice.id} checked={pickedJoin === choice.id} onClick={() => setStrokeJoin(choice.id)} className={PANEL_PICTO} data-testid="jamo-stroke-join-choice" data-join={choice.id}>
                <JoinPicto join={choice.id} /><strong>{choice.label}</strong>
              </ChoiceItem>
            ))}
          </ChoiceGroup>
        </section>
        {/* 굵기: 왼쪽 칸은 꺾임과 같은 `적용 안 함`, 오른쪽은 전역 스타일과 같은 채움 막대. 막대 값은 그 획의 기본 굵기에 대한 %. */}
        {thicknessShown !== undefined && <section>
          <h3>굵기 <output data-testid="jamo-stroke-thickness-value">{thicknessShown}%</output></h3>
          <div className={styles.stylePanelSplit}>
            <ChoiceGroup variant="tile" className="grid" aria-label="이 획 굵기 적용">
              <ChoiceItem checked={thicknessIsBase} onClick={() => commitThickness(STROKE_THICKNESS_PERCENT.base)} className={PANEL_PICTO} data-testid="jamo-stroke-thickness-none">
                <NonePicto /><strong>적용 안 함</strong>
              </ChoiceItem>
            </ChoiceGroup>
            <div className={styles.stylePanelBar}>
              <RangeBar min={STROKE_THICKNESS_PERCENT.min} max={STROKE_THICKNESS_PERCENT.max} step={STROKE_THICKNESS_PERCENT.step}
                value={Math.min(STROKE_THICKNESS_PERCENT.max, Math.max(STROKE_THICKNESS_PERCENT.min, thicknessShown))}
                onPointerDown={(event) => { const next = startRangeDrag(event); if (next === null) return; thicknessDrag.current.dragging = true; if (next !== thicknessShown) previewThickness(next) }}
                onPointerMove={(event) => { const next = moveRangeDrag(event); if (next !== null) previewThickness(next) }}
                onPointerUp={(event) => { endRangeDrag(event); if (thicknessDrag.current.dragging) commitThickness(thicknessDrag.current.percent) }}
                onPointerCancel={(event) => { endRangeDrag(event); cancelThickness() }}
                // 키보드 · 값 넣기는 끌기가 아니라 바로 한 줄로 싣는다.
                onChange={(event) => { if (!thicknessDrag.current.dragging) commitThickness(Number(event.target.value)) }}
                aria-label="이 획 굵기" data-testid="jamo-stroke-thickness" />
              <RangeTicks min={STROKE_THICKNESS_PERCENT.min} max={STROKE_THICKNESS_PERCENT.max} ticks={THICKNESS_TICKS} />
            </div>
          </div>
        </section>}
      </div>
    )
    // 캔버스 `크게`에는 조절판이 없다. 패널을 펴면 도구 줄이 그 자리에서 패널 내용으로 바뀌고 `뒤로`로 돌아온다.
    const strokeTools = padHidden && toolPanel
      ? (
        <div className={styles.strokeToolRow} role="toolbar" aria-label="획 편집 도구" data-panel={toolPanel} data-tool-panel data-testid="jamo-tool-panel">
          <Pressable type="button" onClick={() => setToolPanel(null)} aria-label="도구 줄로 돌아가기" data-testid="jamo-tool-panel-back"><ChevronLeft size={18} aria-hidden="true" /><span>뒤로</span></Pressable>
          {toolPanel === 'add' ? addChoices : stylePanel}
        </div>
      )
      : toolRail
    return (
      <section className={styles.strokeToolSection} data-pad-hidden={padHidden || undefined} {...guard} data-testid="jamo-stroke-tools">
        {/* 경고 · 펜 상태 한 줄. 조절판 위에 띄워 자리를 안 차지한다 — 뜨고 사라져도 조절판도 캔버스도 안 흔들린다. */}
        {directLabel && <p className={styles.strokeWarning} data-testid="jamo-pen-status">{directLabel}</p>}
        {/* `틀 다시 맞추기`는 일단 숨긴다(기능은 남겨 둔다). */}
        <Pressable type="button" hidden onClick={resetFrame} disabled={!liveJamo?.frame} data-testid="jamo-frame-reset">틀 다시 맞추기</Pressable>
        {/* 트랙패드가 남는 세로를 다 먹고, 도구 단추는 그 오른쪽에 2열로 선다(단추 줄이 차지하던 세로를 트랙패드에 준다). */}
        {!padHidden && <div className={styles.strokeWorkRow}>
          {/* 패널이 열린 동안은 조절판과 자소 크기 막대가 비킨다 — 넣을 것 · 꺾임을 고르는 동안은 안 쓴다. */}
          {toolPanel
            ? <div className={styles.toolPanel} data-panel={toolPanel} data-tool-panel data-testid="jamo-tool-panel">
              {/* 조절판 자리에 편 패널은 맨 위에 이름을 단다 — 누른 도구 단추와 같은 말. 크게 보기의 가로 줄에는 없다(`뒤로`가 그 자리). */}
              <h2 className={styles.toolPanelTitle}>{toolPanel === 'add' ? '추가' : '스타일'}</h2>
              {toolPanel === 'add' ? addChoices : stylePanel}
            </div>
            : <>
            <JamoScaleSlider disabled={!creationBase || Boolean(penTool?.active)} onStart={beginJamoScale} onChange={changeJamoScale} onCommit={commitJamoScale} onCancel={cancelJamoScale} />
            {/* 섬세한 편집용 조절판. 손가락이 글자를 가리지 않고, 1px이 1u라 캔버스 끌기보다 잘게 옮긴다. */}
            <div
              {...trackpad.handlers}
              className={`${legacyTrackpadStyles.trackpad} ${styles.trackpad} ${styles.strokeTrackpad} ${selection.kind === 'none' && !wholeJamoPinch ? styles.trackpadDisabled : ''} ${scaling ? legacyTrackpadStyles.scaleActive : ''} ${scaling && scaleLaneAxis === 'x' ? legacyTrackpadStyles.scaleAxisX : scaling && scaleLaneAxis === 'y' ? legacyTrackpadStyles.scaleAxisY : ''}`}
              data-scaling={scaling || undefined}
              data-whole={wholeJamoPinch || undefined}
              role="group"
              aria-label="선택한 획을 잘게 옮기는 트랙패드"
              aria-disabled={selection.kind === 'none'}
              data-testid="jamo-stroke-trackpad"
            >
              {/* 가운데 길: 두 손가락으로 늘어나는 방향. 획 하나면 길이 방향만(가로획 = 가로), 자소 전체면 둘 다. 늘리는 중엔 늘리는 쪽이 진해진다. */}
              <span className={`${legacyTrackpadStyles.horizontalLane} ${stretchAxes.x ? styles.laneHint : ''}`} aria-hidden="true" data-lane="x" data-stretch={stretchAxes.x || undefined} />
              <span className={`${legacyTrackpadStyles.verticalLane} ${stretchAxes.y ? styles.laneHint : ''}`} aria-hidden="true" data-lane="y" data-stretch={stretchAxes.y || undefined} />
              {trackpad.visualState.points.map((point, index) => <span key={index} className={legacyTrackpadStyles.pinchPoint} style={{ left: point.x, top: point.y }} aria-hidden="true" />)}
            </div>
            </>}
          {!toolSlot && strokeTools}
        </div>}
        {toolSlot && createPortal(strokeTools, toolSlot)}
        {resetConfirmOpen && creationBase && createPortal(
          <div className={confirmStyles.backdrop} onClick={() => setResetConfirmOpen(false)}>
            <div className={confirmStyles.sheet} role="alertdialog" aria-modal="true" aria-label="프리셋으로 초기화" onClick={(event) => event.stopPropagation()} data-testid="jamo-stroke-reset-confirm">
              <header>
                <b>{creationBase.jamo.char} 자소를 폰트 프리셋으로 되돌릴까요?</b>
                <small>이 자소에서 고친 획이 모두 사라지고 처음 프리셋 모양으로 돌아가요. 실행 취소로 되살릴 수 있어요.</small>
              </header>
              <div className={confirmStyles.actions}>
                <Pressable type="button" onClick={() => setResetConfirmOpen(false)}>취소</Pressable>
                <Pressable type="submit" onClick={resetJamo} autoFocus data-testid="jamo-stroke-reset-ok">되돌리기</Pressable>
              </div>
            </div>
          </div>,
          document.body,
        )}
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
 * 제품 화면의 네모꼴: 막대 하나, 가로만(좁게 ↔ 기본 ↔ 넓게). 세로는 노토 몸통 높이에 고정이다(2026-10-01 사용자 결정).
 * 읽기는 기본 가로(840) 대비 % — 가변 폰트의 폭 축과 같다.
 * 범위는 속공간이 안 막히는 86%부터, 글자 칸 끝 안전 보정이 안 걸리는 106%까지다(플랜 `2026-10-01_네모꼴-열기` 4단계 전수). 속공간 지키기가 들어오면 넓힌다.
 */
const BODY_W = Math.round(REFERENCE_WIDTH * 1000)
const BODY_H = Math.round(REFERENCE_HEIGHT * 1000)
const BODY_PERCENT_MIN = 86
const BODY_PERCENT_MAX = 106
/** 기본(100%) 근처에서는 탁 걸린다. */
const BODY_PERCENT_STICKY = 1
const percentOfWidth = (width: number) => Math.round(width / BODY_W * 100)

function DesignBodyShapeControls({ fontSpace }: { fontSpace: { unitsPerEm: number; width: number; height: number } }) {
  const globalPadding = useLayoutStore((state) => state.globalPadding)
  const setGlobalPadding = useLayoutStore((state) => state.setGlobalPadding)
  const resetGlobalPadding = useLayoutStore((state) => state.resetGlobalPadding)
  const style = useGlobalStyleStore((state) => state.style)
  const setAutoCompensation = useGlobalStyleStore((state) => state.setAutoCompensation)
  const body = paddingToDesignBody(globalPadding, fontSpace)
  const width = Math.round(body.width)
  const height = Math.round(body.height)
  const percent = percentOfWidth(width)
  const shown = Math.max(BODY_PERCENT_MIN, Math.min(BODY_PERCENT_MAX, percent))
  const isReference = width === BODY_W && height === BODY_H
  // 옛 화면에서 세로를 바꿨거나 범위 밖으로 저장된 폰트. 막대를 움직이기 전에는 값을 안 건드린다.
  const outside = height !== BODY_H || percent !== shown
  const setPercent = (value: number | null) => {
    if (value === null) return
    const next = Math.abs(value - 100) <= BODY_PERCENT_STICKY ? 100 : Math.max(BODY_PERCENT_MIN, Math.min(BODY_PERCENT_MAX, Math.round(value)))
    if (next === percent && height === BODY_H) return
    setGlobalPadding(designBodyPaddingOfSize(next === 100 ? BODY_W : Math.round(BODY_W * next / 100), BODY_H, fontSpace))
  }
  // 자동 보정: 좁히면 세로줄기만 얇아진다. 저장된 굵기는 그대로고 여기서는 얼마나 보정했는지만 보여 준다.
  const autoOn = style.autoCompensation !== false
  const thinned = Math.round((1 - stemScaleOf(withBodyCompensation({ ...style, autoCompensation: undefined }, globalPadding).strokeStyle)) * 100)
  const autoText = !autoOn ? '꺼 두었어요' : thinned > 0 ? `세로줄기 −${thinned}%` : percent >= 100 ? '좁힐 때만 얇게 해요' : '이 붓에서는 못 해요'
  return <div className={styleMode.weight} role="tabpanel" aria-label="글자 네모꼴 설정">
    <p><strong>글자가 들어가는 틀의 가로</strong><span>틀을 바꾸면 글자도 같이 바뀝니다</span></p>
    <div className={styleMode.weightBox}>
      <div className={styleMode.weightHead}><span>{isReference ? '기본' : percent < 100 ? '좁게' : percent > 100 ? '넓게' : '기본 가로'}</span><output data-testid="style-body-size">{percent}%</output></div>
      <div className={styleMode.shapeRow}>
        <span className={styleMode.shapeIcon} style={{ width: 12, height: 20 }} aria-hidden="true" />
        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <RangeBar min={BODY_PERCENT_MIN} max={BODY_PERCENT_MAX} step="1" value={shown} aria-label="네모꼴 가로" data-testid="style-body-shape" onChange={(event) => setPercent(Number(event.target.value))}
            onPointerDown={(event) => setPercent(startRangeDrag(event))} onPointerMove={(event) => setPercent(moveRangeDrag(event))} onPointerUp={endRangeDrag} onPointerCancel={endRangeDrag} />
          <RangeTicks min={BODY_PERCENT_MIN} max={BODY_PERCENT_MAX} ticks={[{ at: BODY_PERCENT_MIN, text: '좁게' }, { at: 100, text: '기본' }, { at: BODY_PERCENT_MAX, text: '넓게' }]} />
        </span>
        <span className={styleMode.shapeIcon} style={{ width: 18, height: 20 }} aria-hidden="true" />
      </div>
      {outside && <small className={styleMode.bodyNote} data-testid="style-body-outside">지금 값({width} × {height})은 막대 범위 밖이에요. 막대를 움직이면 범위 안으로 들어와요.</small>}
    </div>
    <label className={styleMode.autoRow}>
      <Checkbox tone="ink" checked={autoOn} onCheckedChange={(checked) => setAutoCompensation(checked === true)} data-testid="style-body-auto" />
      <span>자동 보정</span>
      <output data-testid="style-body-auto-amount">{autoText}</output>
    </label>
    <Button variant="faint" size="sm" className="mt-3 h-11 w-full" disabled={isReference} onClick={resetGlobalPadding}>기본 가로로 되돌리기</Button>
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
  const padding = usesLayoutOverride ? mergePadding(globalPadding, layoutOverride) : globalPadding
  const body = paddingToDesignBody(padding, fontSpace)

  const updateBody = (dimension: 'width' | 'height', value: number) => {
    const next = designBodyPaddingOfSize(
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
      <Pressable type="button" role="tab" aria-selected={scope === 'font'} onClick={() => setScope('font')}>폰트 전체</Pressable>
      <Pressable type="button" role="tab" aria-selected={scope === 'layout'} onClick={selectLayoutScope}>현재 레이아웃</Pressable>
    </div>
    <p><strong>{scope === 'font' ? '모든 레이아웃의 기본 네모꼴' : `${LAYOUT_LABELS[layoutType]}만 별도 적용`}</strong><span>Font Space {fontSpace.unitsPerEm}은 고정됩니다</span></p>
    <div className={styles.bodyDimensionGrid}>
      <label><span>가로 <output>{Math.round(body.width)}</output></span><input type="range" min="500" max="1000" step="5" value={Math.round(body.width)} onChange={(event) => updateBody('width', Number(event.target.value))} {...dragBody('width')} /></label>
      <label><span>세로 <output>{Math.round(body.height)}</output></span><input type="range" min="500" max="1000" step="5" value={Math.round(body.height)} onChange={(event) => updateBody('height', Number(event.target.value))} {...dragBody('height')} /></label>
    </div>
    <Pressable type="button" className={styles.bodyReset} disabled={scope === 'layout' ? !layoutOverride : body.width === BODY_W && body.height === BODY_H} onClick={() => scope === 'layout' ? removePaddingOverride(layoutType) : resetGlobalPadding()}>{scope === 'layout' ? '폰트 전체 설정 따르기' : '기본 840 × 910으로 되돌리기'}</Pressable>
  </div>
}

/** 글로벌 스타일 공간에서 문장 글자 하나의 크기(px). 평소는 24. */
const STYLE_SPACE_EM = 112
const WEIGHT_STOPS = [100, 200, 300, 400, 500, 600, 700, 800, 900]
/**
 * 굵기 막대 끝. 속공간 지키기가 안 끝나 굵은 굵기는 속공간이 막혀 한글날 오픈에서 600까지만 연다(10-07 사용자). 개발 서버 · e2e는 900.
 * 이미 600보다 굵게 저장된 폰트는 막대 끝을 그 값까지 늘려 저장값을 그대로 둔다 — 내리면 다시 600까지만 오른다.
 */
const WEIGHT_OPEN_MAX = DEV_TOOLS_ENABLED ? 900 : 600
/** 기울기 막대 범위(도). 오른쪽으로만 15도까지 — 이탤릭으로 쓰는 만큼(10-07 사용자). 범위 밖으로 저장된 폰트는 막대를 그 값까지 늘린다. */
const SLANT_RANGE = { min: 0, max: 15 } as const

/** 굵기 · 기울기. 폰트 전체에 한 값이다. 굵기는 100 단위, 기울기는 1도 단위로 멈춘다. 끄는 동안은 미리보기만, 손을 떼면 적용한다. `획` 탭 맨 위에 붓 조절과 같은 막대로 놓인다. */
function StyleWeightRange({
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
  const max = Math.max(WEIGHT_OPEN_MAX, committed.weight)
  const setSlant = (slant: number | null) => { if (slant !== null && slant !== tone.slant) onDraftChange({ ...tone, slant }) }
  const slantMin = Math.min(SLANT_RANGE.min, committed.slant)
  const slantMax = Math.max(SLANT_RANGE.max, committed.slant)
  // 다른 획 막대와 같은 생김새: 제목 오른쪽 값, 아래 눈금(100 · 400 · 끝만 글씨).
  return <>
    <Field label="굵기" value={tone.weight}>
      <RangeBar min="100" max={max} step="100" value={tone.weight} aria-label="굵기" data-testid="style-weight" onChange={(event) => setWeight(Number(event.target.value))}
        onPointerDown={(event) => setWeight(startRangeDrag(event))} onPointerMove={(event) => setWeight(moveRangeDrag(event))}
        onPointerUp={(event) => { endRangeDrag(event); commit() }} onPointerCancel={(event) => { endRangeDrag(event); commit() }} onKeyUp={commit} onBlur={commit} />
      <RangeTicks min={100} max={max} ticks={WEIGHT_STOPS.filter((at) => at <= max).map((at) => ({ at, text: at === 100 || at === 400 || at === max ? String(at) : undefined }))} />
    </Field>
    <Field label="기울기" value={`${tone.slant}°`}>
      <RangeBar min={slantMin} max={slantMax} step="1" value={tone.slant} aria-label="기울기" data-testid="style-slant" onChange={(event) => setSlant(Number(event.target.value))}
        onPointerDown={(event) => setSlant(startRangeDrag(event))} onPointerMove={(event) => setSlant(moveRangeDrag(event))}
        onPointerUp={(event) => { endRangeDrag(event); commit() }} onPointerCancel={(event) => { endRangeDrag(event); commit() }} onKeyUp={commit} onBlur={commit} />
      <RangeTicks min={slantMin} max={slantMax} ticks={[{ at: slantMin, text: `${slantMin}°` }, { at: 5 }, { at: 10 }, { at: slantMax, text: `${slantMax}°` }]} />
    </Field>
    {/* 속공간 지키기(굵기 자동 보정) 체크박스는 개발 중이라 숨겼다(10-03). 되살릴 땐 `isCounterKeepOn` · `setCounterKeep`. */}
  </>
}

export function CalibrationSentenceEditor({ chrome = 'standalone', space = 'edit', above, cover }: { chrome?: EditorChrome; space?: EditorSpace; above?: ReactNode; cover?: ReactNode } = {}) {
  const projectName = useUIStore((state) => state.currentProjectName) ?? '새 한글 폰트'
  const choseong = useJamoStore((state) => state.choseong)
  const jungseong = useJamoStore((state) => state.jungseong)
  const jongseong = useJamoStore((state) => state.jongseong)
  const schemas = useLayoutStore((state) => state.layoutSchemas)
  const globalPadding = useLayoutStore((state) => state.globalPadding)
  const paddingOverrides = useLayoutStore((state) => state.paddingOverrides)
  const globalStyle = useGlobalStyleStore((state) => state.style)
  const exclusions = useGlobalStyleStore((state) => state.exclusions)
  const fontSpace = useCalibrationProjectStore((state) => state.fontSpace)
  const grid = useCalibrationProjectStore((state) => state.grid)
  const metrics = useCalibrationProjectStore((state) => state.metrics)
  const [focus] = useState(initialFocus)
  // 주소로 들고 온 글자 · 모드는 여는 데만 쓴다. 남겨 두면 새로고침할 때마다 그 글자로 다시 열린다.
  useEffect(() => {
    const url = new URL(window.location.href)
    const opened = ['char', 'mode', 'part', 'solo'].filter((key) => url.searchParams.has(key))
    if (!opened.length) return
    opened.forEach((key) => url.searchParams.delete(key))
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
  }, [])
  const [sampleSentence, setSampleSentence] = useState<string>(focus.sentence)
  // 사용자가 문장을 바꾼 자리(주사위 · 입력 · 지우기)만 대시보드 문장에 쓴다. 글자를 골라 앞에 붙인 문장은 쓰지 않는다.
  const shareSentence = useFontExportStore((state) => state.setSampleSentence)
  // 첫닿자 획 편집으로 열면 음절이 아니라 그 첫닿자 하나가 먼저 뜬다(`닿는 글자` 줄 맨 앞 칸). 들고 온 음절은 줄의 기준으로 남는다.
  const [soloEntry] = useState(() => chrome === 'workspace' && initialStrokePart() === 'CH' ? soloConsonantOf(focus.char) : null)
  const [selectedChar, setSelectedChar] = useState(soloEntry ?? focus.char)
  const [selection, setSelection] = useState<Selection>({ kind: 'none' })
  // 펜 세션. 잠긴 자소를 펜으로 다시 긋는 동안만 있다. `raw`는 그은 점 묶음(자모 상자 0–1) — 끝을 눌러야 판정을 거쳐 저장된다.
  // 펜이 켜졌는지. `since`는 켠 순간의 기록 길이(그 앞까지 되돌리면 펜을 끈다), `base`는 켠 순간 있던 획의 점 — 여기 없는 획이 이번에 그은 획이다.
  const [pen, setPen] = useState<{ since: number; base: ReadonlySet<string> } | null>(null)
  const [selectedPoints, setSelectedPoints] = useState<SelectedPoint[]>([])
  // 획 묶음(여러 획 함께 이동). 둘 이상일 때만 묶음이다. 점 묶음(`selectedPoints`)과 따로 — 획 묶음은 점을 안 띄운다.
  const [selectedStrokes, setSelectedStrokes] = useState<string[]>([])
  const [wholeJamoCentered, setWholeJamoCentered] = useState<{ x: boolean; y: boolean } | null>(null)
  const [multiSelectArmed, setMultiSelectArmed] = useState(false)
  // PC: Shift를 누른 동안은 조절판에 손가락을 댄 것과 같다(획 · 점 묶음 넣고 빼기, 피그마 shift+클릭). 창을 떠나면 푼다.
  const [shiftArmed, setShiftArmed] = useState(false)
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === 'Shift') setShiftArmed(event.type === 'keydown') }
    const clear = () => setShiftArmed(false)
    window.addEventListener('keydown', key)
    window.addEventListener('keyup', key)
    window.addEventListener('blur', clear)
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('keyup', key); window.removeEventListener('blur', clear) }
  }, [])
  const multiArmed = multiSelectArmed || shiftArmed
  // 캔버스 왼쪽 도구 줄. 단추는 트랙패드 컴포넌트가 들고 이 자리에 그린다.
  const [strokeToolSlot, setStrokeToolSlot] = useState<HTMLDivElement | null>(null)
  // 셸 안에서는 조절판 없이 캔버스에서 바로 끈다. 이동 계산은 도구 줄 컴포넌트(`InferenceTrackpad`)가 들고 이 ref로 캔버스에 내준다.
  const dragApiRef = useRef<StrokeDragApi | null>(null)
  const padDragRef = useRef<PadDragApi | null>(null)
  const directManipulation = chrome === 'workspace'
  // 폰트 탭: 글로벌 스타일 공간이 늘 열려 있고 닫히지 않는다. 캔버스 · 레이아웃 · 획 편집은 없다.
  const styleOnly = chrome === 'workspace' && space === 'style'
  const [previewJamo, setPreviewJamo] = useState<PreviewJamo | null>(null)
  const [previewSchema, setPreviewSchema] = useState<PreviewSchema | null>(null)
  // 되돌리기 기록은 화면 밖 저장소에 둔다 — 자소↔검수를 오가며 화면이 다시 열려도 남는다.
  const history = useEditHistoryStore((state) => state.history)
  const future = useEditHistoryStore((state) => state.future)
  const setHistory = useEditHistoryStore((state) => state.setHistory)
  const setFuture = useEditHistoryStore((state) => state.setFuture)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const exportState = useFontExportStore((state) => state.status)
  const exportProgress = useFontExportStore((state) => state.progress)
  const exportCurrentFont = useFontExportStore((state) => state.request)
  const [inkGapLimiter, setInkGapLimiter] = useState<CalibrationInkGapViolation | null>(null)
  const [isDirectInputActive, setIsDirectInputActive] = useState(false)
  const [isCustomSentence, setIsCustomSentence] = useState(focus.custom)
  // 도마. 섹션 홈 · 대시보드가 올려 둔 자소 묶음. 여기서는 전환만 하고 담기 · 빼기는 하지 않는다.
  const benchType = useWorkbenchStore((state) => state.type)
  const benchChars = useWorkbenchStore((state) => state.chars)
  // 섹션 홈 `편집 n`으로 들어왔는지. 돌아갈 곳(`returnTo`)이 있을 때만 — 레이아웃 카드로 들어오면 도마가 남아 있어도 아니다.
  // 대시보드 스타일 칸이 `?panel=beak`처럼 열 탭을 준다. 없으면 획(굵기가 있는 탭 — 네모꼴이 잠겨 있던 동안 첫 화면이던 그대로).
  const [globalStylePanel, setGlobalStylePanel] = useState<GlobalStylePanel | null>(() => {
    if (!styleOnly) return null
    const asked = new URLSearchParams(window.location.search).get('panel')
    return asked === 'body' || asked === 'beak' ? asked : 'brush'
  })
  const [previewBrush, setPreviewBrush] = useState<StrokeRenderStyle | null>(null)
  const [previewTone, setPreviewTone] = useState<StyleTone | null>(null)
  const [previewBeak, setPreviewBeak] = useState<StemBeakStyle | null>(null)
  // 도마가 사용자 묶음과 똑같으면 부리를 그 묶음에만 줄 수 있다. 스타일 공간은 `이 폰트 전체`로 들어오는 곳이라 기본은 전체.
  const benchGroup = useJamoGroupStore((state) => groupMatching(state.groups, benchType, benchChars))
  const [beakToGroup, setBeakToGroup] = useState(false)
  const beakGroup = beakToGroup ? benchGroup : null
  const groupPreviewBeak = useJamoGroupStore((state) => (beakGroup && state.previewBeak?.groupId === beakGroup.id ? state.previewBeak.beak : null))
  const [isShapeRuleOpen, setIsShapeRuleOpen] = useState(false)
  const [editMode, setEditMode] = useState<EditMode>(initialEditMode)
  // 획 편집 캔버스 `크게` 보기. 화면 상태일 뿐 저장하지 않는다 — 글자를 바꿔도 켜진 채, 레이아웃으로 나가면 꺼진다.
  const [canvasBig, setCanvasBig] = useState(false)
  // `획 고치기`로 들어온 자소. 획 편집에서 선택을 푼 채 `완료`해도 레이아웃이 이 부품을 다시 켠다.
  const [strokeEntryPart, setStrokeEntryPart] = useState<MobileEditorPart | null>(initialStrokePart)
  const [pendingStrokePart, setPendingStrokePart] = useState<MobileEditorPart | null>(initialStrokePart)
  // Undo/Redo로 저장된 Δ가 바뀌면 레이아웃 편집부를 새로 띄워 세션 편집(절대값)을 버린다.
  const [layoutEpoch, setLayoutEpoch] = useState(0)
  // 방금 적용한 배치 범위. 문장 줄에서 그 범위에 든 글자를 표시한다(적용의 신호). 다음 편집이 시작되거나 글자를 떠나면 빈다.
  const [appliedScope, setAppliedScope] = useState<readonly ScopeRule[]>([])
  useEffect(() => { setAppliedScope([]) }, [selectedChar])
  const directInputRef = useRef<HTMLTextAreaElement>(null)
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
    const padding = mergeLayoutPadding(globalPadding, paddingOverrides, previewedSyllable.layoutType)
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
    // 네모꼴 자동 보정의 세로줄기 배율도 같이 넘긴다 — 화면이 글자를 놓는 상자와 같아야 한다.
    const stemScale = stemScaleOf(resolveEffectiveStyle(previewGlobalStyle, exclusions, target.layoutType, schema.padding).strokeStyle)
    const { placement } = contextPlacementOf({ bundle: notoBundle, identity, syllable: target, schema, ends: { ...previewEnds, stemScale }, delta: effectiveLayoutDelta({ rules: layoutDeltaRules }, identity) })
    return placement.kind === 'boxes' ? placement.boxes : legacy()
  }, [chrome, notoBundle, previewEnds, previewGlobalStyle, exclusions, layoutDeltaRules])
  const measuresOnScreenBoxes = chrome === 'workspace' && Boolean(notoBundle)
  const syllable = useMemo(
    () => resolveSyllableContextualInkSafety(previewedSyllable, screenBoxesOf(previewedSyllable, effectiveSchema)).syllable,
    [effectiveSchema, previewedSyllable, screenBoxesOf],
  )
  // 레이아웃 모드는 글자가 모델 상자로 그려질 때만 뜻이 있다. 그때는 옛 경로(자소 통째 이동 → 스키마)가 글자에 안 닿으므로 셸 안에서는 끈다.
  // 고치는 글자의 실효 스타일. 미리보기를 얹은 저장값에 이 레이아웃 네모꼴의 자동 보정을 얹는다(`getEffectiveStyle`과 같은 길).
  const focusedGlobalStyle = useMemo(() => resolveEffectiveStyle(previewGlobalStyle, exclusions, syllable.layoutType, effectiveSchema.padding), [previewGlobalStyle, exclusions, syllable.layoutType, effectiveSchema.padding])
  const { placement, resolution: placementResolution } = useContextPlacement(syllable, effectiveSchema, focusedGlobalStyle)
  // 레이아웃 모드는 모델이 있으면 열린다. 지금 획이 모델 상자에 맞는지(`placement.kind`)에 매지 않는다 —
  // 획을 고치다 맞춤이 깨지면(ㅡ를 곡선으로 → 상자가 획 두께보다 작음) 나가는 문(`완료`)까지 사라져 갇힌다.
  const layoutAvailable = chrome === 'workspace' && isEditableHangul(selectedChar) && (selectedChar.codePointAt(0) ?? 0) >= 0xac00 && !notoModelError
  // 모델은 왔는데 이 글자 획이 상자에 안 맞아 옛 배치(스키마)로 그리는 중. 이유를 말해 준다.
  const boxFitIssue = chrome === 'workspace' && notoBundle && placement.kind !== 'boxes' ? placementResolution?.issues[0] ?? null : null
  const isLayoutMode = editMode === 'layout' && layoutAvailable
  // 레이아웃 화면에 들어올 때 보선 자리. 상시 저장이라 `original`은 놓을 때마다 바뀌므로 주황 띠 · Δ는 이 기준에서 잰다. 글자를 바꾸거나 다시 들어오면 새 기준, 되돌리기(`layoutEpoch`)에는 그대로.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const layoutEntry = useMemo(() => newLayoutEntry(), [selectedChar, isLayoutMode])
  const schemaMoveLocked = chrome === 'workspace' && placement.kind === 'boxes'
  // 그 자소의 첫 획. `획 고치기`는 자소 통째 선택을 거치지 않고 이 상태로 열려 조절판이 바로 뜬다(혼합 홀자는 가로부 먼저).
  const firstStrokeSelectionOf = (part: MobileEditorPart): Selection | null => {
    const boxes = placement.kind === 'boxes' ? placement.boxes : focusedBoxes
    const target = getRenderedStrokeTargets(syllable, boxes).find((item) => item.editorPart === part)
    return target ? { kind: 'stroke', component: componentFor(selectedChar, part, target.jamo), editorPart: part, renderPart: target.renderPart, jamo: target.jamo, strokeId: target.stroke.id, box: target.box } : null
  }
  // 넣기 도구(추가 · 원 · 붙여넣기)의 기댈 곳. 획을 다 지운 자소는 잡을 첫 획이 없어, 빈 자소와 그 상자로 선다.
  // 비었나는 화면에 그려지는 꼴(가른 벌을 올린 `editableJamoOf`)로 본다 — 저장 꼴은 벌을 다 지워도 기본 획이 남아 있어 `추가`가 꺼진다.
  const creationSelectionOf = (part: MobileEditorPart): Selection | null => {
    const first = firstStrokeSelectionOf(part)
    if (first) return first
    const stored = part === 'CH' ? syllable.choseong : part === 'JU' ? syllable.jungseong : syllable.jongseong
    const jamo = stored ? editableJamoOf(stored, syllable) : undefined
    const boxes = placement.kind === 'boxes' ? placement.boxes : focusedBoxes
    const renderPart: Part | undefined = part === 'JU' ? (['JU', 'JU_H', 'JU_V'] as const).find((item) => boxes[item]) : part
    const box = renderPart ? boxes[renderPart] : undefined
    if (!jamo || !renderPart || !box || getJamoStrokes(jamo).length > 0) return null
    return { kind: 'stroke', component: componentFor(selectedChar, part, jamo), editorPart: part, renderPart, jamo, strokeId: '', box }
  }
  // 주소로 바로 연 획 편집(`&mode=stroke&part=`)은 첫 렌더에서 한 번 선택을 풀어 그 자소가 통째로 골라진 첫 화면으로 연다.
  if (pendingStrokePart) {
    setPendingStrokePart(null)
    // 획 편집의 첫 화면은 자소가 통째로 골라진 상태다(= 빈 곳을 누른 상태). 획은 눌러서 잡는다.
    setSelection({ kind: 'none' })
  }
  // 획 편집에 잠긴 자소. 다른 자소는 눌리지 않는다. 빈 곳을 누르면 선택은 다 풀리고, 넣기 도구(추가 · 원)는 이 자소에 그대로 쓴다.
  const lockedPart = chrome === 'workspace' && !isLayoutMode ? strokeEntryPart : null
  // 왼쪽 표지에 그릴 자소. 끄는 중의 미리보기까지 담긴 `syllable`에서 꺼내 표지가 캔버스와 같이 움직인다.
  const strokeCardPart = lockedPart ?? (selection.kind !== 'none' ? selection.editorPart : null)
  const strokeCardJamo = strokeCardPart === 'CH' ? syllable.choseong : strokeCardPart === 'JU' ? syllable.jungseong : strokeCardPart === 'JO' ? syllable.jongseong : null
  const strokeCardInk = strokeCardPart && strokeCardJamo ? { part: strokeCardPart, jamo: strokeCardJamo } : null
  // 줄에 넘기는 값은 글자·자모가 바뀔 때만 새로 만든다. 끄는 동안 매번 새 객체를 넘기면 줄이 표본을 다시 뽑고 카드를 다 다시 그린다.
  // 줄에서 다른 글자를 눌러도 줄은 처음 글자 기준 그대로 두고, 누른 칸만 켠다. 첫닿자 단독 칸을 여는 동안에도 기준은 음절이다.
  const [strokeRowAnchor, setStrokeRowAnchor] = useState<string | null>(soloEntry ? focus.char : null)
  const strokeRowChar = strokeRowAnchor ?? selectedChar
  // 첫닿자 단독 칸(`ㄴ`)을 여는 중. 이 글자엔 레이아웃이 없지만, 획 편집 틀(문장 접힘 · 닿는 글자 줄 · 완료)은 기준 음절로 그대로 선다.
  const soloOpen = chrome === 'workspace' && editMode === 'stroke' && isSoloConsonant(selectedChar) && strokeRowAnchor !== null && !notoModelError
  const strokeFrameAvailable = layoutAvailable || soloOpen
  // 획 편집 `닿는 글자` 줄의 범위 자모. 고치는 자리의 자모 하나(`모든 ㅁ 글자`). 줄의 기준 글자에서 꺼낸다 — 줄의 글자는 모두 같은 자모라 지금 글자와 같다.
  const strokeRowJamo = strokeFrameAvailable && strokeCardPart ? focusJamoOf(corpusIdentity(strokeRowChar.codePointAt(0) ?? 0xac00), strokeCardPart) : null
  // 줄 맨 앞에 서는 첫닿자 단독 칸. 첫닿자를 고칠 때만.
  const soloChar = strokeRowJamo && strokeCardPart === 'CH' ? soloConsonantOf(strokeRowChar) : null
  // 줄의 기준 글자가 홑자모(`ㄱ` 단독 칸)면 코퍼스 신원이 없다 — 그때는 줄이 안 서므로(`strokeRowJamo` null) `가`로 채워 두기만 한다. 던지면 화면이 통째로 죽는다.
  const strokeRowSource = useMemo(() => corpusIdentityOf(strokeRowChar) ?? corpusIdentity(0xac00), [strokeRowChar])
  const strokeRowJamos = useMemo(() => strokeRowJamo ? [strokeRowJamo] : [], [strokeRowJamo])
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
  const sentenceCollapsed = chrome === 'workspace' && strokeFrameAvailable && !isLayoutMode && !styleLocksCanvas && !styleSpaceOpen
  // `크게`는 셸 안 획 편집(펜 포함)에서만. 켜면 도마 줄 · 문장 줄 · `닿는 글자` 줄 · 조절판이 비키고 캔버스와 도구 줄만 남는다.
  const canvasBigAvailable = chrome === 'workspace' && !styleOnly && !isLayoutMode && !styleLocksCanvas
  const big = canvasBig && canvasBigAvailable
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
      const padding = mergeLayoutPadding(globalPadding, paddingOverrides, decomposed.layoutType)
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

  // 글자 바꾸기. 획 편집에서 고친 줄기 모양은 그 홀자에만 남는다 — 형제에 퍼뜨리는 건 `전파` 단추뿐이라 나갈 때 묻지 않는다.
  const chooseChar = (char: string) => switchChar(char)
  const switchChar = (char: string) => {
    // 글자를 바꾸면 기본 상태(레이아웃)로 돌아간다.
    if (chrome === 'workspace') { setEditMode('layout'); setStrokeEntryPart(null) }
    setStrokeRowAnchor(null)
    setSelectedChar(char)
    setSelection({ kind: 'none' })
    setSelectedPoints([])
    setSelectedStrokes([])
    setPreviewJamo(null)
    setPreviewSchema(null)
    setInkGapLimiter(null)
  }
  // 획 편집 `닿는 글자` 줄에서 글자를 누르면 그 글자로 바꾸고 획 편집에 머문다. 줄의 글자는 모두 고치는 자모가 같은 자리에 들었으니 같은 자소를 이어서 고친다.
  // 새 글자의 첫 획은 새 글자가 그려진 뒤에야 알 수 있어서, 다음 그림에서 잡는다.
  const pickFirstStrokeRef = useRef(false)
  const pickStrokeRowChar = (char: string) => {
    if (char === selectedChar || !strokeCardPart) return
    setStrokeRowAnchor((anchor) => anchor ?? selectedChar)
    setStrokeEntryPart(strokeCardPart)
    setSelectedChar(char)
    setSelection({ kind: 'none' })
    setSelectedPoints([])
    setSelectedStrokes([])
    setPreviewJamo(null)
    setPreviewSchema(null)
    setInkGapLimiter(null)
    pickFirstStrokeRef.current = true
  }
  // 줄 맨 앞 단독 칸을 누르면 음절 문맥을 떠나 첫닿자 하나를 연다. 줄은 기준 음절 그대로.
  const pickSolo = () => {
    if (!soloChar || soloChar === selectedChar) return
    setStrokeRowAnchor((anchor) => anchor ?? selectedChar)
    setStrokeEntryPart('CH')
    setSelectedChar(soloChar)
    setSelection({ kind: 'none' })
    setSelectedPoints([])
    setSelectedStrokes([])
    setPreviewJamo(null)
    setPreviewSchema(null)
    setInkGapLimiter(null)
    pickFirstStrokeRef.current = true
  }
  const soloLead = useMemo(() => soloChar ? { char: soloChar, active: selectedChar === soloChar } : undefined, [soloChar, selectedChar])
  // 첫닿자 변형 3벌. 지금 글자의 홀자 계열(단독 칸은 null)과, 그 계열을 따로 그렸는지.
  const editFamily = familyOfSyllable(syllable)
  const storedChoseong = syllable.choseong ? choseong[syllable.choseong.char] : undefined
  const familySplit = !!storedChoseong && hasFamilyStrokes(storedChoseong, editFamily)
  const splitFamilies = useMemo(() => storedChoseong ? (['right', 'bottom', 'mixed'] as const).filter((family) => hasFamilyStrokes(storedChoseong, family)) : [], [storedChoseong])
  // 안 가른 계열의 글자 = 기본을 상속받는 글자. 보는 건 자유고, 처음 손댈 때 트리 드로어가 묻는다(`따로 새롭게 그리기` | `기본 ㅈ 고치기`, 10-07 사용자).
  // `닿는 글자` 줄에서 고른 글자일 때만(`strokeRowAnchor`) — 주소로 음절을 바로 연 옛 길(`?mode=stroke`만)은 묻지 않고 기본 획을 고친다.
  const inheritedFamily = chrome === 'workspace' && editMode === 'stroke' && strokeCardPart === 'CH' && strokeRowAnchor !== null && !isSoloConsonant(selectedChar) && editFamily && storedChoseong && !familySplit ? editFamily : null
  // `기본 ㅈ 고치기`를 고른 자모. 그 자모를 떠날 때까지 다시 묻지 않는다(다른 상속 글자로 옮겨도).
  const [baseEditJamo, setBaseEditJamo] = useState<string | null>(null)
  const storedChoseongChar = storedChoseong?.char
  useEffect(() => { setBaseEditJamo(null) }, [storedChoseongChar])
  const intentNeeded = inheritedFamily !== null && baseEditJamo !== storedChoseongChar
  // 손대는 순간 가로채 트리 드로어를 올린다. 캔버스는 획 · 자소를 잡을 때만(빈 곳 탭 · 확대는 그대로), 조절판 · 도구 줄은 전부. 눌림 뒤의 click도 막는다.
  const guardIntent = (event: ReactPointerEvent<HTMLElement> | ReactMouseEvent<HTMLElement>) => {
    if (!intentNeeded) return
    event.preventDefault()
    event.stopPropagation()
    if (event.type === 'pointerdown') setTreeOpen(true)
  }
  const toolGuard = intentNeeded ? { onPointerDownCapture: guardIntent, onClickCapture: guardIntent } : undefined
  const canvasGuard = (event: ReactPointerEvent<HTMLElement>) => { if (intentNeeded && (event.target as Element).closest('[data-editor-hit]')) guardIntent(event) }
  const commitVariant = (after: JamoData) => {
    if (!storedChoseong || after === storedChoseong) return
    setHistory((entries) => [...entries, { kind: 'jamoVariant', char: storedChoseong.char, before: structuredClone(storedChoseong), after }])
    setFuture([])
    updateJamo(after)
    setPreviewJamo(null)
  }
  // 트리 `적용`. 끌어 둔 계열은 가르고(기본 복제로 시작), 켜 둔 계열은 변형을 지워 다시 잇는다 — 한 번에 저장 하나 · 기록 한 줄.
  const applyVariants = ({ split, merge }: { split: MedialFamily[]; merge: MedialFamily[] }) => {
    if (!storedChoseong) return
    let next = storedChoseong
    for (const family of merge) next = mergeFamilyStrokes(next, family)
    for (const family of split) next = splitFamilyStrokes(next, family)
    if (next === storedChoseong) return
    commitVariant(next)
    if (split.length) {
      // 가르자마자 트리를 접고 이 글자의 첫 획을 잡아 바로 고친다.
      setTreeOpen(false)
      pickFirstStrokeRef.current = true
    }
    if (merge.length) {
      // 잡고 있던 획을 푼다 — 상속으로 돌아간 글자에서 조절판이 옛 선택을 들고 있지 않게.
      setSelection({ kind: 'none' })
      setSelectedPoints([])
      setSelectedStrokes([])
    }
  }
  // 트리 `기본 ㅈ 고치기`. 상속받는 글자에서 열린 트리면 그 자리에서 기본을 고치게 열고 끝(이 자모를 떠날 때까지 안 묻음), 가른 글자에서면 단독 칸으로 간다. 트리에서 가지로 가는 길은 없다 — 이동은 윗줄로만(10-07 사용자).
  const editBaseFromTree = () => {
    setTreeOpen(false)
    if (inheritedFamily && storedChoseong) setBaseEditJamo(storedChoseong.char); else pickSolo()
  }
  // `닿는 글자` 줄 `⋯` = 조절판 자리 트리 토글(지도). 들어올 때 저절로 뜨지 않는다. 글자를 바꾸면 접힌다.
  const [treeOpen, setTreeOpen] = useState(false)
  useEffect(() => { setTreeOpen(false) }, [selectedChar])
  const variantTreeAvailable = chrome === 'workspace' && editMode === 'stroke' && strokeCardPart === 'CH' && !!storedChoseong && !big
  const variantTreeShown = variantTreeAvailable && treeOpen
  const closeTree = () => setTreeOpen(false)
  const variantTree = variantTreeAvailable
    ? { open: variantTreeShown, onToggle: () => { if (variantTreeShown) closeTree(); else setTreeOpen(true) } }
    : undefined
  const canvasLocked = styleLocksCanvas
  useEffect(() => {
    if (!pickFirstStrokeRef.current || !lockedPart) return
    pickFirstStrokeRef.current = false
    // 새 글자로 옮겨도 첫 화면과 같다 — 자소 통째.
    setSelection({ kind: 'none' })
  }, [selectedChar, lockedPart])
  const selectFromCanvas = (requested: Selection) => {
    let nextSelection = requested
    // 빈 곳은 피그마처럼 획 · 점 · 핸들을 다 푼다(획 편집에 잠긴 동안도). 잠긴 동안 다른 자소는 안 잡힌다.
    if (lockedPart && requested.kind !== 'none' && requested.editorPart !== lockedPart) return
    // 모델 상자로 그리는 글자는 자소를 통째로 옮겨도(옛 스키마 저장) 글자에 안 닿는다. 자소를 누르면 통째 선택 대신 그 첫 획을 잡는다 — 자리는 레이아웃에서 고친다.
    if (schemaMoveLocked && nextSelection.kind === 'component') nextSelection = firstStrokeSelectionOf(nextSelection.editorPart) ?? nextSelection
    const current = selection.kind === 'stroke' || selection.kind === 'point' || selection.kind === 'handle' ? selection : null
    const sameJamo = Boolean(current && nextSelection.kind === 'stroke' && current.editorPart === nextSelection.editorPart
      && current.jamo.type === nextSelection.jamo.type && current.jamo.char === nextSelection.jamo.char)
    if (nextSelection.kind === 'stroke' && current && sameJamo) {
      // 조절판에 손가락을 댄 채(여러 개 고르기) 같은 자소의 다른 획을 누르면 획 묶음에 더한다. 묶음은 점 없이 중심선으로만 보인다.
      if (multiArmed) {
        const base = selectedStrokes.length > 0 ? selectedStrokes : [current.strokeId]
        setSelectedPoints([])
        // 이미 묶인 획을 누르면 뺀다(피그마 shift+클릭처럼). 하나 남으면 그 획 하나를 잡은 상태로.
        if (base.includes(nextSelection.strokeId)) {
          const rest = base.filter((strokeId) => strokeId !== nextSelection.strokeId)
          if (rest.length === 0) return
          setSelectedStrokes(rest.length > 1 ? rest : [])
          setSelection({ ...nextSelection, strokeId: current.strokeId === nextSelection.strokeId ? rest[0] : current.strokeId })
          return
        }
        setSelectedStrokes([...base, nextSelection.strokeId])
        setSelection(nextSelection)
        return
      }
      // 묶음에 든 획을 누르면 묶음을 그대로 둔다(피그마처럼) — 그대로 끌면 다 같이 움직인다. 푸는 건 빈 곳.
      if (selectedStrokes.length > 1 && selectedStrokes.includes(nextSelection.strokeId)) {
        setSelection(nextSelection)
        return
      }
    }
    setSelectedStrokes([])
    setSelection(nextSelection)
    if (nextSelection.kind === 'point' || nextSelection.kind === 'handle') {
      setSelectedPoints([{ strokeId: nextSelection.strokeId, pointIndex: nextSelection.pointIndex }])
    } else {
      setSelectedPoints([])
    }
  }
  const selectPointFromCanvas = (nextSelection: Extract<Selection, { kind: 'point' }>) => {
    setSelection(nextSelection)
    setSelectedStrokes([])
    const nextPoint = { strokeId: nextSelection.strokeId, pointIndex: nextSelection.pointIndex }
    // 피그마처럼: 이미 고른 묶음 안의 점을 누르면 묶음을 그대로 둔다 — 그대로 끌면 다 같이 움직인다. 푸는 건 빈 곳.
    const inGroup = selectedPoints.length > 1 && selectedPoints.some((point) => point.strokeId === nextPoint.strokeId && point.pointIndex === nextPoint.pointIndex)
    if (!multiArmed) {
      if (!inGroup) setSelectedPoints([nextPoint])
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
  // 도구 줄이 획 묶음째 고른다(묶음 꺾임 뒤 묶음 지키기). 하나뿐이면 그 획 하나를 잡은 상태다.
  const selectStrokeGroup = (nextSelection: Selection, strokeIds: readonly string[]) => {
    setSelection(nextSelection)
    setSelectedPoints([])
    setSelectedStrokes(strokeIds.length > 1 ? [...strokeIds] : [])
  }
  const handleTrackpadSelectionChange = (nextSelection: Selection) => {
    setSelection(nextSelection)
    setSelectedStrokes([])
    if (nextSelection.kind === 'stroke' || nextSelection.kind === 'component' || nextSelection.kind === 'none') {
      setSelectedPoints([])
    }
  }
  const pickSampleSentence = () => {
    const nextSentence = randomSampleSentence(sampleSentence)
    setSampleSentence(nextSentence)
    shareSentence(nextSentence)
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
    shareSentence(value)
    setIsCustomSentence(true)
    if (![...value].includes(selectedChar)) {
      const firstSyllable = [...value].find(isEditableHangul)
      if (firstSyllable) chooseChar(firstSyllable)
    }
  }
  // 셸 안의 `문장` 전체 화면: 문장만 바꾸고 편집하던 글자는 그대로 둔다(문장에서 빠져도). 대시보드 카드와 같은 부품.
  const sentenceSheet = useSentenceSheet({
    sentence: sampleSentence,
    rootRef: sentenceRef,
    // 편집부 자리 전체를 재서 그만큼 자란다.
    measureHeight: () => {
      const area = sentenceRef.current?.parentElement
      if (sentenceRef.current) sentenceRef.current.scrollLeft = 0
      if (!area) return null
      area.scrollTop = 0
      return area.clientHeight
    },
    onType: (value) => { setSampleSentence(value); shareSentence(value); setIsCustomSentence(true) },
    onRoll: (next) => { setSampleSentence(next); shareSentence(next); setIsCustomSentence(false) },
    onClear: () => { setSampleSentence(''); setIsCustomSentence(true) },
    // 빈 문장으로 닫으면 작은 줄이 비므로 편집하던 글자 하나를 남긴다.
    onClose: () => { if (!sampleSentence.trim()) { setSampleSentence(selectedChar); shareSentence(selectedChar) } },
  })
  const { open: sentenceSheetOpen, closing: sentenceSheetClosing, height: sentenceSheetHeight, em: sheetEm, openSheet: openSentenceSheet, closeSheet: closeSentenceSheet, pickCaret: pickSentenceCaret } = sentenceSheet
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
  const frameForEdit = (jamo: JamoData): JamoData => withFrameFrom(jamo, editableJamoOf(jamo, syllable))
  // 문맥 안전 보정(글자마다 부딪히면 변화량을 줄여 그리는 자동 되당김)을 뗀다. 사용자가 걸림을 밀고 넘어갔다는 건 붙여도 좋다는 뜻이라, 그 자모는 그린 대로 나온다.
  const withoutInkSafety = (jamo: JamoData): JamoData => { const next = { ...jamo }; delete next.contextualInkSafety; return next }
  const commitJamo = (before: JamoData, after: JamoData, raw: RawGlyphEdit, options?: { unframed?: boolean; pastGapLimit?: boolean }) => {
    if (JSON.stringify(before) === JSON.stringify(after)) return
    const storedBefore = structuredClone(getJamo(before.type, before.char) ?? before)
    // `틀 다시 맞추기`만 틀 없이 저장한다. 되돌리기는 기록의 `before`(틀이 없던 때)로 돌아가므로 틀도 같이 사라진다.
    const framedAfter = options?.unframed ? withoutFrame(after) : frameForEdit(after)
    const safeAfter = options?.pastGapLimit ? withoutInkSafety(framedAfter) : withContextualInkSafety(storedBefore, before, framedAfter, minimumInkGap)
    // 편집기는 그 계열 획만 든 자모를 고쳤다. 저장은 계열 변형이 있으면 그 자리에, 없으면 기본 획에 — 다른 변형은 남는다.
    const storedAfter = writeFamilyStrokes(storedBefore, safeAfter, familyOfSyllable(syllable))
    const edit = createSampleGlyphEdit(raw)
    setHistory((entries) => [...entries, { kind: 'jamo', jamoType: before.type, char: before.char, before: storedBefore, after: storedAfter, edit, picked: { selection, points: selectedPoints, strokes: selectedStrokes } }])
    setFuture([])
    useCalibrationProjectStore.getState().addSampleGlyphEdit(edit)
    updateJamo(storedAfter)
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
  // 꺾임을 따로 정한 획 수(폰트 전체)와 `풀기`. 전역 꺾임을 바꿔도 그 획들은 안 바뀌므로 패널이 한 줄로 알린다.
  const ownJoinCount = useMemo(() => [choseong, jungseong, jongseong].reduce((sum, map) => sum + Object.values(map).reduce((inner, jamo) => inner + countOwnJoins(jamo), 0), 0), [choseong, jungseong, jongseong])
  const releaseOwnJoins = () => {
    const before: JamoData[] = []
    const after: JamoData[] = []
    for (const map of [choseong, jungseong, jongseong]) {
      for (const jamo of Object.values(map)) {
        const stripped = withoutOwnJoins(jamo)
        if (stripped === jamo) continue
        before.push(structuredClone(jamo))
        after.push(stripped)
      }
    }
    if (after.length === 0) return
    setHistory((entries) => [...entries, { kind: 'jamos', before, after }])
    setFuture([])
    for (const jamo of after) updateJamo(jamo)
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
    useJamoGroupStore.getState().setPreviewBeak(null)
    if (JSON.stringify(before) === JSON.stringify(after)) return
    setFuture([])
    if (beakGroup) {
      setHistory((entries) => [...entries, { kind: 'beak', before, after, groupId: beakGroup.id, groupBefore: beakGroup.stemBeak }])
      useJamoGroupStore.getState().setStemBeak(beakGroup.id, after)
      return
    }
    setHistory((entries) => [...entries, { kind: 'beak', before, after }])
    useGlobalStyleStore.getState().setStemBeak(after)
  }
  const draftBeak = (beak: StemBeakStyle | null) => {
    if (beakGroup) useJamoGroupStore.getState().setPreviewBeak(beak ? { groupId: beakGroup.id, beak } : null)
    else setPreviewBeak(beak)
  }
  const committedBeak = (beakGroup ? beakGroup.stemBeak : undefined) ?? globalStyle.stemBeak ?? DEFAULT_STEM_BEAK
  const commitLayoutDelta = (before: LayoutDeltaSnapshot, after: LayoutDeltaSnapshot) => {
    if (JSON.stringify(before) === JSON.stringify(after)) return
    setHistory((entries) => [...entries, { kind: 'layoutDelta', before, after }])
    setFuture([])
  }
  // 줄기 모양 반영 창. 획을 잡고 `전파`를 누르면 그 획 하나를 기준으로 뜬다(도구 줄 맨 아래 주황 단추). 나갈 때 · 다른 글자로 갈 때는 묻지 않는다.
  const [shapeAsk, setShapeAsk] = useState<{ ask: ShapeAsk; picked: Set<string> } | null>(null)
  const stemMasters = useStemMasterStore((state) => state.masters)
  const shapePreviewMap = useMemo(() => shapeAsk ? shapePreview(shapeAsk.ask, shapeAsk.picked, jungseong, stemMasters) : {}, [shapeAsk, jungseong, stemMasters])
  // 창 머리의 `전` = 기준 획이 지금 마스터를 따르는 모양(형제가 지금 가진 모양).
  const shapeBeforeMap = useMemo(() => shapeAsk ? beforeSpreadJamo(jungseong, stemMasters, shapeAsk.ask) : {}, [shapeAsk, jungseong, stemMasters])
  // 잡은 획이 이름 있는 홀자 줄기면 `전파`가 뜬다 — 곧은 기본 획도 이미 고친 형제에 퍼뜨릴 수 있다.
  const spreadTarget = useMemo(() => {
    if (editMode !== 'stroke' || selection.kind === 'none' || selection.kind === 'component' || selection.jamo.type !== 'jungseong') return null
    return spreadableStem(jungseong, selection.jamo.char, selection.strokeId) ? { char: selection.jamo.char, strokeId: selection.strokeId } : null
  }, [editMode, selection, jungseong])
  const openSpread = () => {
    if (!spreadTarget) return
    const ask = shapeAskForStroke(useJamoStore.getState().jungseong, useStemMasterStore.getState().masters, spreadTarget.char, spreadTarget.strokeId)
    if (ask) setShapeAsk({ ask, picked: defaultPicked(ask) })
  }
  const toggleShapeAsk = (keys: readonly string[], on: boolean) => setShapeAsk((current) => {
    if (!current) return current
    const picked = new Set(current.picked)
    const locked = lockedKeys(current.ask)
    for (const key of keys) { if (on) picked.add(key); else if (!locked.has(key)) picked.delete(key) }
    return { ...current, picked }
  })
  // 전파: 고른 획이 든 갈래에 이 획의 모양을 적고, 뺀 획은 풀림(지금 모양). 되돌리기 한 줄. 창을 닫고 획 편집에 남는다.
  const applyShapeAsk = () => {
    if (!shapeAsk) return
    const jamoBefore = useJamoStore.getState().jungseong
    const mastersBefore = useStemMasterStore.getState().masters
    useStemMasterStore.getState().setMasters(pickedMasters(shapeAsk.ask, shapeAsk.picked), (char, strokeId) => !shapeAsk.picked.has(`${char}:${strokeId}`))
    const jamoAfter = useJamoStore.getState().jungseong
    const changedChars = Object.keys(jamoAfter).filter((char) => jamoAfter[char] !== jamoBefore[char])
    if (changedChars.length > 0 || mastersBefore !== useStemMasterStore.getState().masters) {
      setHistory((entries) => [...entries, {
        kind: 'stemShape', mastersBefore, mastersAfter: useStemMasterStore.getState().masters,
        jamoBefore: Object.fromEntries(changedChars.map((char) => [char, jamoBefore[char]])), jamoAfter: Object.fromEntries(changedChars.map((char) => [char, jamoAfter[char]])),
      }])
      setFuture([])
    }
    setShapeAsk(null)
  }
  // 취소 = 창만 닫고 획 편집에 남는다.
  const cancelShapeAsk = () => setShapeAsk(null)
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
  // Esc = 빈 곳 누르기(획 · 점 · 핸들을 다 푼다). 레이아웃 모드의 켠 상자는 그대로 둔다.
  // 반영 창이 떠 있으면 Esc는 창이 받는다 — 잡은 획을 풀지 않는다(풀면 `전파`가 사라진다).
  const escapeActive = !isLayoutMode && !globalStylePanel && selection.kind !== 'none' && !shapeAsk
  useEffect(() => {
    if (!escapeActive) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.isComposing || isTypingTarget(event.target)) return
      setSelection({ kind: 'none' })
      setSelectedPoints([])
      setSelectedStrokes([])
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [escapeActive])
  const chooseEditMode = (mode: EditMode) => {
    setEditMode(mode)
    // 첫닿자 단독 칸에서 나가면 기준 음절의 레이아웃으로 돌아간다.
    if (mode === 'layout' && isSoloConsonant(selectedChar) && strokeRowAnchor) setSelectedChar(strokeRowAnchor)
    setStrokeRowAnchor(null)
    setMultiSelectArmed(false)
    setPreviewJamo(null)
    setPreviewSchema(null)
    if (mode === 'layout') { closeGlobalStyle(); setCanvasBig(false) }
  }
  const editStrokes = (part: Part) => {
    const editorPart: MobileEditorPart = part === 'CH' ? 'CH' : part === 'JO' ? 'JO' : 'JU'
    setStrokeEntryPart(editorPart)
    setSelection(firstStrokeSelectionOf(editorPart) ?? { kind: 'none' })
    setSelectedPoints([])
    setSelectedStrokes([])
    chooseEditMode('stroke')
    // 첫닿자는 단독 칸으로 먼저 연다. 첫 획은 단독 글자가 그려진 다음 그림에서 잡는다.
    const solo = chrome === 'workspace' && editorPart === 'CH' ? soloConsonantOf(selectedChar) : null
    if (solo) {
      setStrokeRowAnchor(selectedChar)
      setSelectedChar(solo)
      setSelection({ kind: 'none' })
      pickFirstStrokeRef.current = true
    }
  }
  // ===== 펜 (플랜 2026-10-05 고스트 따라 긋기 — 10-06부터 획 편집 안의 도구) =====
  // 펜은 잠긴 자소에 획을 하나씩 더한다. 잠긴 자소의 프리셋(현 문맥 계열 변형 포함)이 역할 판정의 기준이다. 섞임홀자(칸이 가로부 · 세로부로 갈린 홀자)는 채널 배정이 아직 없어 막는다.
  const penSetup = useMemo(() => {
    if (!lockedPart) return null
    const part = lockedPart === 'CH' ? syllable.choseong : lockedPart === 'JU' ? syllable.jungseong : syllable.jongseong
    if (!part) return null
    const family = familyOfSyllable(syllable)
    const jamo = adoptFamilyStrokes(part, family)
    const boxes = placement.kind === 'boxes' ? placement.boxes : focusedBoxes
    const renderPart: Part | null = lockedPart === 'JU' ? (boxes.JU ? 'JU' : null) : lockedPart
    const base = getBaseJamo(jamo.type, jamo.char)
    const preset = base ? adoptFamilyStrokes(base, family) : null
    const blocked = lockedPart === 'JU' && !boxes.JU ? '섞임홀자는 곧' : !preset ? '프리셋이 없는 자모예요' : null
    const channel: PenChannel = preset ? presetChannelOf(preset) : 'strokes'
    const strokes = jamo[channel] ?? []
    const first = strokes[0] ?? preset?.[channel]?.[0]
    const sample = { thickness: first?.thickness ?? PEN_DEFAULT_THICKNESS, linecap: first?.linecap, linejoin: first?.linejoin }
    // `맞춤`이 잉크를 채울 칸. 굵기(글자 좌표)를 칸 좌표의 축별 반 굵기로 옮긴다.
    const box = renderPart ? boxes[renderPart] : undefined
    const halfInk = sample.thickness * weightToMultiplier(focusedGlobalStyle.weight) / 2
    const ink = box && box.width > 0 && box.height > 0 ? { half: { x: halfInk / box.width, y: halfInk / box.height }, linecap: sample.linecap ?? focusedGlobalStyle.linecap } : null
    return { jamo, renderPart, preset, channel, blocked, sample, ink }
  }, [lockedPart, syllable, placement, focusedBoxes, focusedGlobalStyle.weight, focusedGlobalStyle.linecap])
  const penBase = pen?.base
  // 이번에 펜을 켠 뒤 그은 획 = 켠 순간에 없던 획. 그은 획끼리는 다음 획을 그을 때 함께 다시 판정한다.
  const penDrawn = (stroke: StrokeDataV2) => Boolean(penBase) && !penBase!.has(JSON.stringify(stroke.points))
  const penFreshIds = useMemo(
    () => new Set(penBase && penSetup ? (penSetup.jamo[penSetup.channel] ?? []).filter((stroke) => !penBase.has(JSON.stringify(stroke.points))).map((stroke) => stroke.id) : []),
    [penBase, penSetup],
  )
  const penStatus = (() => {
    if (!pen || !penSetup?.preset) return ''
    const strokes = penSetup.jamo[penSetup.channel] ?? []
    if (strokes.length === 0) return '그어 보세요'
    // 닿자는 역할이 있든 없든 그리기 · 칸 맞춤 · 내보내기가 같아 알릴 게 없다(10-06 조사). 홀자만 기둥 · 보선이 걸린다.
    if (penSetup.jamo.type !== 'jungseong') return ''
    const { state, missing } = penJamoState(penSetup.jamo, penSetup.channel, penSetup.preset)
    // 아직 안 그었고 역할도 다 있으면 알릴 게 없다.
    if (state === 'recognized') return penFreshIds.size > 0 ? '인식됨' : ''
    if (state === 'partial') return missing.length > 0 ? `일부 자유 · 안 그린 획 ${missing.join(', ')}` : '일부 자유'
    return '자유 · 기둥·보선이 안 따라가요'
  })()
  // 잠긴 자소가 바뀌거나 글자를 바꾸거나 스타일 · 레이아웃으로 나가면 펜을 끈다.
  useEffect(() => { setPen(null) }, [selectedChar, lockedPart, styleLocksCanvas, isLayoutMode])
  const storedPenJamo = () => penSetup ? editableJamoOf(penSetup.jamo, syllable) : null
  // 손을 떼면 그은 자리 그대로 바로 저장한다(선 · 원 · 사각과 같은 길). 문맥 간격 되당김은 얹지 않는다 — 그은 자리가 옮겨지면 안 된다.
  const commitPenStroke = (points: PenPoint[]) => {
    const before = storedPenJamo()
    if (!pen || !penSetup?.preset || !lockedPart || !before) return
    // 끝 모양 따라가기: 끝이 둥근 글씨는 예각 꺾임도 둥글게, 네모 끝은 그리기가 평평하게 깎는다.
    const roundAcute = (penSetup.sample.linecap ?? focusedGlobalStyle.linecap) === 'round'
    const result = addPenStroke(before, penSetup.channel, points, penSetup.preset, { drawn: penDrawn, roundAcute })
    if (!result) return
    commitJamo(before, result.jamo, { kind: 'stroke-move', glyph: selectedChar, component: componentFor(selectedChar, lockedPart, penSetup.jamo), jamoType: before.type, strokeId: result.strokeId, delta: { x: 0, y: 0 } }, { pastGapLimit: true })
  }
  // `맞춤`: 자소의 잉크(굵기 · 끝 모양 포함)가 칸에 꽉 차게 채운다. 눌러도 달라질 게 없으면 단추가 꺼진다.
  const fitted = useMemo(() => {
    if (!penSetup?.preset || !penSetup.ink || penSetup.blocked) return null
    const after = fitJamoToCell(penSetup.jamo, penSetup.channel, penSetup.ink)
    return sameStrokePlaces(penSetup.jamo, after, penSetup.channel) ? null : after
  }, [penSetup])
  const fitJamo = () => {
    const before = storedPenJamo()
    if (!fitted || !penSetup?.preset || !penSetup.ink || !lockedPart || !before) return
    const after = fitJamoToCell(before, penSetup.channel, penSetup.ink)
    const strokeId = after[penSetup.channel]?.[0]?.id
    if (!strokeId) return
    commitJamo(before, after, { kind: 'stroke-move', glyph: selectedChar, component: componentFor(selectedChar, lockedPart, penSetup.jamo), jamoType: before.type, strokeId, delta: { x: 0, y: 0 } }, { pastGapLimit: true })
  }
  // 펜이 켜진 동안의 `삭제`: 고른 획(묶음)을 지우고, 남은 그은 획을 빈 역할에 다시 판정한다 — 옅은 옛 획을 따라 그은 뒤 그 옛 획을 지우면 그은 획이 역할을 받는다. 무르기는 되돌리기.
  const deletePenStrokes = (strokeIds: readonly string[]) => {
    const before = storedPenJamo()
    if (!penSetup?.preset || !lockedPart || !before || strokeIds.length === 0) return
    const after = removePenStrokes(before, penSetup.channel, penSetup.preset, new Set(strokeIds), { drawn: penDrawn })
    setSelection({ kind: 'none' })
    setSelectedPoints([])
    setSelectedStrokes([])
    commitJamo(before, after, { kind: 'stroke-move', glyph: selectedChar, component: componentFor(selectedChar, lockedPart, penSetup.jamo), jamoType: before.type, strokeId: strokeIds[0], delta: { x: 0, y: 0 } }, { pastGapLimit: true })
  }
  const penTool: PenTool | null = penSetup ? {
    active: pen !== null,
    blocked: penSetup.blocked ?? (penSetup.renderPart ? null : '이 자소는 펜을 못 써요'),
    status: penStatus,
    onToggle: () => {
      if (pen) { setPen(null); return }
      setSelection({ kind: 'none' })
      setSelectedPoints([])
      setSelectedStrokes([])
      setPreviewJamo(null)
      setPen({ since: history.length, base: new Set((penSetup.jamo[penSetup.channel] ?? []).map((stroke) => JSON.stringify(stroke.points))) })
    },
    canFit: fitted !== null,
    onFit: fitJamo,
    onDelete: deletePenStrokes,
    devCopyRaw: DEV_TOOLS_ENABLED ? async () => {
      let raw = ''
      try { raw = localStorage.getItem('pen:lastRaw') ?? '' } catch { raw = '' }
      if (!raw) return false
      // 자취와 함께 지금 자모(틀 포함)도 담는다 — 거대 획처럼 상자 계산이 어긋난 경우를 그대로 재현하려고.
      const text = JSON.stringify({ char: selectedChar, part: lockedPart, raw: JSON.parse(raw), jamo: getJamo(penSetup.jamo.type, penSetup.jamo.char) })
      // 로컬 http(아이패드로 맥에 붙을 때)에는 navigator.clipboard가 없다 — 숨은 글상자로 복사한다.
      if (navigator.clipboard) { await navigator.clipboard.writeText(text); return true }
      const area = document.createElement('textarea')
      area.value = text
      area.setAttribute('readonly', '')
      area.style.position = 'fixed'
      area.style.opacity = '0'
      document.body.appendChild(area)
      area.focus()
      area.select()
      area.setSelectionRange(0, text.length)
      const ok = document.execCommand('copy')
      document.body.removeChild(area)
      return ok
    } : undefined,
  } : null
  const penCanvas: PenCanvas | null = pen && penSetup?.preset && penSetup.renderPart && !penSetup.blocked && !styleLocksCanvas ? {
    renderPart: penSetup.renderPart,
    jamo: penSetup.jamo,
    sample: penSetup.sample,
    freshIds: penFreshIds,
    onStroke: commitPenStroke,
  } : null
  const closeGlobalStyle = () => {
    setPreviewBrush(null)
    setPreviewTone(null)
    setPreviewBeak(null)
    useJamoGroupStore.getState().setPreviewBeak(null)
    if (!styleOnly) setGlobalStylePanel(null)
  }
  // 기록 한 줄을 저장소에서 되돌린다. 기록 · 선택 정리는 호출자가 한다.
  const revertEntry = (entry: HistoryEntry) => {
    if (entry.kind === 'layout') useLayoutStore.getState().setUserPartOverrides(entry.layoutType, entry.beforeOverrides)
    else if (entry.kind === 'layoutDelta') { useLayoutDeltaStore.getState().restore(entry.before); setLayoutEpoch((epoch) => epoch + 1) }
    else if (entry.kind === 'stemShape') { useStemMasterStore.setState({ masters: entry.mastersBefore }); for (const [char, jamo] of Object.entries(entry.jamoBefore)) useJamoStore.getState().updateJungseong(char, jamo) }
    else if (entry.kind === 'brush') { useGlobalStyleStore.getState().setStrokeRenderStyle(entry.before); if (entry.ends) applyEnds(entry.ends.before) }
    else if (entry.kind === 'jamos') { for (const jamo of entry.before) updateJamo(jamo) }
    else if (entry.kind === 'tone') applyTone(entry.before)
    else if (entry.kind === 'beak') { if (entry.groupId) useJamoGroupStore.getState().setStemBeak(entry.groupId, entry.groupBefore); else useGlobalStyleStore.getState().setStemBeak(entry.before) }
    else updateJamo(entry.before)
    if (entry.kind === 'layout' || entry.kind === 'jamo') useCalibrationProjectStore.getState().removeSampleGlyphEdit(entry.edit.id)
  }
  // 되돌리기 · 다시 하기 뒤의 선택: 그 편집 때 잡혀 있던 것. 되살린 모양에 그 획이 없거나 기록에 선택이 없으면 잠긴 자소의 첫 획(없으면 빈 선택).
  const restorePicked = (entry: HistoryEntry, jamo: JamoData) => {
    const picked = entry.kind === 'jamo' ? entry.picked : undefined
    const strokes = getJamoStrokes(jamo)
    const ids = new Set(strokes.map((stroke) => stroke.id))
    if (picked?.selection.kind === 'none' && lockedPart) {
      setSelection({ kind: 'none' })
      setSelectedPoints([])
      setSelectedStrokes([])
      return
    }
    if (picked && (picked.selection.kind === 'stroke' || picked.selection.kind === 'point' || picked.selection.kind === 'handle') && ids.has(picked.selection.strokeId)) {
      const pointCount = strokes.find((stroke) => stroke.id === (picked.selection as { strokeId: string }).strokeId)?.points.length ?? 0
      const restored = picked.selection.kind !== 'stroke' && picked.selection.pointIndex >= pointCount
        ? { ...picked.selection, kind: 'stroke' as const, jamo }
        : { ...picked.selection, jamo }
      setSelection(restored as Selection)
      setSelectedPoints(picked.points.filter((point) => ids.has(point.strokeId) && point.pointIndex < (strokes.find((stroke) => stroke.id === point.strokeId)?.points.length ?? 0)))
      setSelectedStrokes(picked.strokes.filter((strokeId) => ids.has(strokeId)))
      return
    }
    // 획 편집에 잠긴 동안은 빈 선택으로 떨어뜨리지 않는다 — 도구 줄이 다 꺼져 버린다.
    setSelection(lockedPart ? firstStrokeSelectionOf(lockedPart) ?? { kind: 'none' } : { kind: 'none' })
    setSelectedPoints([])
    setSelectedStrokes([])
  }
  const undo = () => {
    const entry = history.at(-1)
    if (!entry) return
    revertEntry(entry)
    // 펜을 켜기 전의 기록까지 되돌리면 펜을 끈다. 켠 뒤 그은 획을 무르는 동안은 켜 둔다.
    if (pen && history.length - 1 < pen.since) setPen(null)
    setHistory((entries) => entries.slice(0, -1))
    setFuture((entries) => [...entries, entry])
    setPreviewJamo(null)
    setPreviewSchema(null)
    if (entry.kind === 'jamo') restorePicked(entry, entry.before)
    else {
      setSelection(lockedPart ? firstStrokeSelectionOf(lockedPart) ?? { kind: 'none' } : { kind: 'none' })
      setSelectedPoints([])
      setSelectedStrokes([])
    }
  }
  const redo = () => {
    const entry = future.at(-1)
    if (!entry) return
    if (entry.kind === 'layout') useLayoutStore.getState().setUserPartOverrides(entry.layoutType, entry.afterOverrides)
    else if (entry.kind === 'layoutDelta') { useLayoutDeltaStore.getState().restore(entry.after); setLayoutEpoch((epoch) => epoch + 1) }
    else if (entry.kind === 'stemShape') { useStemMasterStore.setState({ masters: entry.mastersAfter }); for (const [char, jamo] of Object.entries(entry.jamoAfter)) useJamoStore.getState().updateJungseong(char, jamo) }
    else if (entry.kind === 'brush') { useGlobalStyleStore.getState().setStrokeRenderStyle(entry.after); if (entry.ends) applyEnds(entry.ends.after) }
    else if (entry.kind === 'jamos') { for (const jamo of entry.after) updateJamo(jamo) }
    else if (entry.kind === 'tone') applyTone(entry.after)
    else if (entry.kind === 'beak') { if (entry.groupId) useJamoGroupStore.getState().setStemBeak(entry.groupId, entry.after); else useGlobalStyleStore.getState().setStemBeak(entry.after) }
    else updateJamo(entry.after)
    setFuture((entries) => entries.slice(0, -1))
    setHistory((entries) => [...entries, entry])
    if (entry.kind === 'layout' || entry.kind === 'jamo') useCalibrationProjectStore.getState().addSampleGlyphEdit(entry.edit)
    setPreviewJamo(null)
    setPreviewSchema(null)
    if (entry.kind === 'jamo') restorePicked(entry, entry.after)
    else {
      setSelection(lockedPart ? firstStrokeSelectionOf(lockedPart) ?? { kind: 'none' } : { kind: 'none' })
      setSelectedPoints([])
      setSelectedStrokes([])
    }
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
      ? mergeLayoutPadding(globalPadding, paddingOverrides, decomposedForMetrics.layoutType)
      : null
    // 글자 칸 · 띄어쓰기는 추출 폰트와 같은 값(`fontMetrics`)이다. 몸통은 칸 안에서 왼 여백만큼 안쪽에 앉는다.
    const hangulAdvance = layoutPadding ? fontMetricsAdvance(layoutPadding, previewGlobalStyle.letterSpacing) : metrics.hangulAdvance
    const advance = advanceForCharacter(char, metrics, hangulAdvance, SPACE_ADVANCE)
    const bearing = layoutPadding ? `${hangulLeftBearing(layoutPadding)}em` : undefined
    const width = `${advance / fontSpace.unitsPerEm}em`
    const layoutHighlight = !isBrushStyleOpen && selection.kind === 'component'
      ? { layoutType: syllable.layoutType, parts: selection.renderParts, source: char === selectedChar }
      : null
    const contextId = `sentence-${lineIndex}-${charIndex}`
    let isSafetyAdjusted = false
    if (isEditableHangul(char)) {
      const previewed = withPreviewJamo(decomposeSyllable(char, choseong, jungseong, jongseong), previewJamo)
      const contextBase = schemas[previewed.layoutType]
      const padding = mergeLayoutPadding(globalPadding, paddingOverrides, previewed.layoutType)
      const contextSchema = { ...contextBase, padding, designBodyPadding: padding }
      // 보정할 것이 있는 글자(고친 자모가 든 글자)에서만 상자를 푼다. 상자는 화면과 같은 것.
      const hasSafety = [previewed.choseong, previewed.jungseong, previewed.jongseong].some((jamo) => jamo?.contextualInkSafety)
      isSafetyAdjusted = hasSafety && resolveSyllableContextualInkSafety(previewed, screenBoxesOf(previewed, contextSchema)).limitedParts.length > 0
    }
    // 방금 적용한 범위에 든 글자. 적용이 어디까지 닿았는지 문장에서 바로 보인다.
    // 범위 규칙은 완성형 음절에만 맞는다. 문장에 든 홑자모(`ㄱ`)는 신원이 없으니 표시하지 않는다(던지면 문장 줄이 통째로 죽는다).
    const isScopeApplied = appliedScope.length > 0 && (() => {
      const identity = corpusIdentityOf(char)
      return identity !== null && appliedScope.some((rule) => matchesRule(rule, identity))
    })()
    return isEditableHangul(char)
      ? inSheet
        ? <Pressable key={`${lineIndex}-${char}-${charIndex}`} style={{ inlineSize: width, paddingInlineStart: bearing }} type="button" tabIndex={-1} data-char-index={charIndex} aria-label={`${char} 앞뒤에 커서 두기`}>
            <Glyph char={char} size={sentenceEm} maps={maps} schemas={schemas} globalPadding={globalPadding} paddingOverrides={paddingOverrides} previewJamo={previewJamo} previewSchema={previewSchema} layoutHighlight={null} globalStyle={previewGlobalStyle} />
          </Pressable>
        : <Pressable key={`${lineIndex}-${char}-${charIndex}`} style={{ inlineSize: width, paddingInlineStart: bearing }} type="button" aria-current={char === selectedChar ? 'true' : undefined} data-ink-gap-limiter={inkGapLimiter?.id === contextId ? 'true' : undefined} data-ink-safety-adjusted={isSafetyAdjusted ? 'true' : undefined} data-layout-applied={isScopeApplied ? 'true' : undefined} aria-label={`${char} 편집${isSafetyAdjusted ? ', 충돌 안전 보정됨' : ''}`} onClick={() => chooseChar(char)}>
          <Glyph char={char} size={sentenceEm} maps={maps} schemas={schemas} globalPadding={globalPadding} paddingOverrides={paddingOverrides} previewJamo={previewJamo} previewSchema={previewSchema} layoutHighlight={layoutHighlight} globalStyle={previewGlobalStyle} />
        </Pressable>
      : <span key={`${lineIndex}-${char}-${charIndex}`} data-char-index={inSheet ? charIndex : undefined} className={/\s/u.test(char) ? styles.spaceGlyph : styles.punctuationGlyph} style={{ inlineSize: width }} aria-label={/\s/u.test(char) ? '공백' : char}>{char}</span>
  }
  // 셸 안에서는 도구 줄이 없다(출력은 폰트 탭, 형태 규칙은 머리, 실행취소 · 다시실행은 셸 머리). 아래 줄은 옛 단독 화면 것.
  const menuLabel = (text: string) => chrome === 'workspace' ? <em>{text}</em> : null
  const toggleGlobalStyle = () => { if (isGlobalStyleOpen) closeGlobalStyle(); else { if (sentenceSheetOpen) closeSentenceSheet(); setGlobalStylePanel(chrome === 'workspace' ? 'brush' : 'body') } }
  const actions = (
    <nav aria-label="폰트 추출 및 편집 기록">
      <Pressable type="button" className={styles.exportButton} data-export-state={exportState} onClick={exportCurrentFont} disabled={exportState === 'exporting'} aria-label={exportState === 'exporting' ? `OTF 추출 중: ${exportProgress}` : exportState === 'downloaded' ? 'OTF 추출 완료' : exportState === 'failed' ? 'OTF 추출 실패' : '현재 작업을 OTF로 추출'} title={exportState === 'exporting' ? exportProgress : '현재 작업을 OTF로 추출'}>
        {exportState === 'exporting' ? <LoaderCircle className={styles.exportSpinner} size={18} /> : exportState === 'downloaded' ? <Check size={18} /> : exportState === 'failed' ? <X size={18} /> : <Download size={18} />}
        {menuLabel('OTF 추출')}
      </Pressable>
      <Pressable hidden type="button" className={styles.copyButton} data-copy-state={copyState} onClick={copyAnalysisValues} aria-label={copyState === 'copied' ? '분석용 값 복사됨' : copyState === 'failed' ? '분석용 값 복사 실패' : '분석용 값 복사'} title="분석용 값 복사">
        {copyState === 'copied' ? <Check size={18} /> : <Copy size={18} />}
      </Pressable>
      <Pressable type="button" disabled={selection.kind === 'none'} onClick={() => setIsShapeRuleOpen(true)} aria-label="선택 자모 형태 규칙" title="현재 자모의 획과 형태 예절"><ListTree size={18} />{menuLabel('형태 규칙')}</Pressable>
      {chrome === 'standalone' && <Pressable type="button" data-active={isGlobalStyleOpen || undefined} onClick={toggleGlobalStyle} aria-label="글로벌 스타일 설정" title="글자 네모꼴과 획 스타일"><Settings2 size={18} />{menuLabel('네모꼴 · 획 스타일')}</Pressable>}
      {chrome === 'standalone' && <>
        <Pressable type="button" onClick={undo} disabled={history.length === 0} aria-label="마지막 편집 되돌리기"><Undo2 size={18} />{history.length > 0 && <span>{history.length}</span>}</Pressable>
        <Pressable type="button" onClick={redo} disabled={future.length === 0} aria-label="되돌린 편집 다시 실행"><Redo2 size={18} /></Pressable>
      </>}
    </nav>
  )
  const body = (
    <>
      {/* 문장 줄부터 편집부까지 한 덩어리. 레이아웃 모드에서만 세로로 밀린다 — `내 문장`이 위로 빠지고 `닿는 글자` 줄이 그 자리에 붙는다.
          두 모드가 같은 덩어리를 써야 오갈 때 문장 줄이 다시 안 그려진다(가로 스크롤 자리 유지). */}
      <div className={styles.scrollArea} data-scroll={(isLayoutMode && !styleLocksCanvas) || undefined} data-sheet={sentenceSheetOpen || sentenceSheetClosing || undefined} data-big={big || undefined}>
      {styleOnly && above}
      <section ref={sentenceRef} className={`${styles.sentence} ${chrome === 'workspace' ? styleMode.strip : ''}`} data-compact={sentenceCompact || undefined} data-grown={styleSpaceOpen || undefined} data-sheet={sentenceSheetOpen || undefined} data-sheet-wrap={sentenceSheetOpen || sentenceSheetClosing || undefined} style={{ '--sheet-h': `${sentenceSheetHeight}px` } as CSSProperties} onClick={pickSentenceCaret} data-collapsed={sentenceCollapsed || undefined} aria-hidden={sentenceCollapsed || undefined} inert={sentenceCollapsed || undefined} aria-label="보정 문장">
        {/* 셸 안에서는 돋보기 하나. 누르면 문장 줄이 그 자리에서 펼쳐지고, 같은 자리의 닫기로 접힌다. 문장 바꾸기(주사위 · 직접 입력)는 펼친 줄에서 한다. */}
        {chrome === 'workspace' ? <>
        <div className={styles.sentenceActions}>
          <Pressable type="button" className={styles.sentenceOpen} onClick={(event) => { event.stopPropagation(); if (sentenceSheetOpen) closeSentenceSheet(); else openSentenceSheet() }} aria-label={sentenceSheetOpen ? '문장 접기' : '문장 크게 보기 · 바꾸기'} aria-expanded={sentenceSheetOpen} title={sentenceSheetOpen ? '문장 접기' : '문장 크게 보기 · 바꾸기'} data-testid="sentence-sheet-toggle">{sentenceSheetOpen ? <X size={19} aria-hidden="true" /> : <ZoomIn size={19} aria-hidden="true" />}</Pressable>
        </div>
        <SentenceSheetControls sheet={sentenceSheet} />
        </> : <>
        <div className={styles.sentenceActions}>
          <Pressable type="button" onClick={pickSampleSentence} aria-label="예시 문장 무작위 선택" title="예시 문장 바꾸기"><Dices size={19} aria-hidden="true" /></Pressable>
          <Pressable type="button" data-active={isDirectInputActive || undefined} onClick={startDirectInput} aria-label="보정 문장 직접 입력" title="직접 입력"><TextCursorInput size={19} aria-hidden="true" /></Pressable>
        </div>
        <SentenceTextarea
          ref={directInputRef}
          className={styles.directInput}
          value={sampleSentence}
          onValueChange={updateDirectInput}
          onFocus={() => setIsDirectInputActive(true)}
          onBlur={() => setIsDirectInputActive(false)}
          aria-label="보정 문장 직접 입력"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
        </>}
        {/* 줄 key는 순번. 문장 글자로 두면 한 글자 칠 때마다 줄 안 글자가 전부 새로 만들어져 움찔거리고 획 맞추기를 처음부터 다시 한다. */}
        {calibrationLines.map((line, lineIndex) => <div key={`${lineIndex}-${sentenceSheet.rolled}`} className={`${styles.sentenceRun} ${chrome === 'workspace' ? styleMode.run : ''} ${sentenceSheet.rolled > 0 ? styles.sentenceRolled : ''}`} style={{ fontSize: sentenceSheetOpen ? sheetEm : styleSpaceOpen ? STYLE_SPACE_EM : sentenceEm }}>
          {sentenceSheetOpen ? <SentenceSheetRun sheet={sentenceSheet} renderChar={(char, index) => renderSentenceCharacter(char, index, 0, true)} /> : tokenizeSentenceLine(line).map((token) => token.whitespace
            ? [...token.text].map((char, index) => renderSentenceCharacter(char, token.start + index, lineIndex))
            : <span key={`${lineIndex}-word-${token.start}`} className={styles.wordRun}>{[...token.text].map((char, index) => renderSentenceCharacter(char, token.start + index, lineIndex))}</span>
          )}
          {isDirectInputActive && <span className={styles.directInputCaret} aria-hidden="true" />}
        </div>)}
      </section>

      {isLayoutMode && !styleLocksCanvas ? <section className={styles.layoutMode} aria-label={`${selectedChar} 레이아웃 수정`} data-testid="jamo-layout-mode">
        <GlyphLayoutEditor key={`${selectedChar}:${layoutEpoch}`} entry={layoutEntry} codepoint={selectedChar.codePointAt(0) ?? 0xac00} initialPart={selection.kind === 'none' ? strokeEntryPart ?? undefined : selection.editorPart} onCommitted={commitLayoutDelta} onEditStrokes={editStrokes} onPickCharacter={chooseChar} onScopeApplied={setAppliedScope} />
      </section> : <>
      {/* 획 편집에도 같은 자리·같은 높이로 `닿는 글자` 줄이 선다. 범위는 고치는 자모가 든 글자 전부(레이아웃을 안 가린다).
          줄이 두 모드에 다 있어야 `획 고치기`로 오갈 때 캔버스가 안 튄다. */}
      {chrome === 'workspace' && strokeFrameAvailable && !styleLocksCanvas && !big && strokeRowJamo && strokeCardPart &&
        <TouchedGlyphRow source={strokeRowSource} bundle={notoBundle} edit={NO_LAYOUT_EDIT} ghostVisible={false} slant={globalStyle.slant} focus={strokeCardPart} scope="jamo" group={strokeCardPart} jamos={strokeRowJamos} anyContext onPick={pickStrokeRowChar} activeChar={selectedChar} lead={soloLead} onPickLead={pickSolo} splitFamilies={splitFamilies} tree={variantTree} />}
      {!styleSpaceOpen && <section className={styles.editor} data-chrome={chrome} data-stroke-tools={!globalStylePanel && directManipulation ? true : undefined} data-big={big || undefined} aria-label={`${selectedChar} 완성 글자 편집`}>
        {/* 셸 안 획 편집에서는 캔버스 왼쪽에 도구 단추가 세로로 선다(한 칸씩 넘기는 슬라이드). 여섯 칸 표지는 숨긴다 — 닿는 범위는 위 `닿는 글자` 줄이 보여 준다. */}
        <div className={styles.strokeStage}>
        {chrome === 'workspace' && !globalStylePanel && directManipulation && !styleLocksCanvas
          ? <div ref={setStrokeToolSlot} className={styles.strokeToolSlot} {...toolGuard} data-testid="jamo-stroke-tool-slot" />
          : chrome === 'workspace' && layoutAvailable && !styleLocksCanvas && <LayoutContextCards activeContextId={corpusIdentity(selectedChar.codePointAt(0) ?? 0xac00).contextId} allActive={false} ink={strokeCardInk ?? undefined} />}
        <div className={styles.focusArea} onPointerDownCapture={canvasGuard}>
        <FocusedGlyph char={selectedChar} syllable={syllable} schema={effectiveSchema} selection={canvasLocked ? { kind: 'none' } : selection} onSelect={canvasLocked ? () => {} : selectFromCanvas} selectedPoints={canvasLocked ? [] : selectedPoints} selectedStrokes={canvasLocked ? [] : selectedStrokes} multiSelectArmed={!canvasLocked && multiArmed} wholeJamoCentered={canvasLocked ? null : wholeJamoCentered} onPointSelect={canvasLocked ? () => {} : selectPointFromCanvas} lockedPart={canvasLocked ? null : lockedPart} dragApiRef={directManipulation && !canvasLocked ? dragApiRef : undefined} padDragRef={directManipulation && !canvasLocked ? padDragRef : undefined} gapWarningParts={gapWarningParts} fontSpace={fontSpace} grid={grid} designBody={designBody} globalStyle={focusedGlobalStyle} pen={penCanvas}
          // `크게`에서는 머리가 없다 — 되돌리기 · 다시 실행을 귀퉁이에 띄우고 그 아래 `작게`를 둔다(머리 단추와 같은 이름).
          corner={canvasBigAvailable && <>
            {big && <span className={styles.canvasCornerRow}>
              <Pressable type="button" className={styles.canvasBigToggle} disabled={history.length === 0} onClick={undo} aria-label="형태 편집 실행 취소"><Undo2 size={18} aria-hidden="true" /></Pressable>
              <Pressable type="button" className={styles.canvasBigToggle} disabled={future.length === 0} onClick={redo} aria-label="형태 편집 다시 실행"><Redo2 size={18} aria-hidden="true" /></Pressable>
            </span>}
            <Pressable type="button" className={styles.canvasBigToggle} onClick={() => setCanvasBig((on) => !on)} aria-pressed={big} aria-label={big ? '캔버스 작게 보기' : '캔버스 크게 보기'} title={big ? '작게' : '크게'} data-testid="canvas-big-toggle">{big ? <Minimize2 size={18} aria-hidden="true" /> : <Maximize2 size={18} aria-hidden="true" />}</Pressable>
          </>} />
        </div>
        </div>
      </section>}

      {globalStylePanel ? <GlobalStyleTrackpad
        panel={globalStylePanel}
        onPanelChange={(panel) => { setPreviewBrush(null); setPreviewTone(null); setPreviewBeak(null); useJamoGroupStore.getState().setPreviewBeak(null); setGlobalStylePanel(panel) }}
        fill={chrome === 'workspace'}
        closable={!styleOnly}
        onClose={closeGlobalStyle}
        bodyControls={chrome === 'workspace' ? <DesignBodyShapeControls fontSpace={fontSpace} /> : <DesignBodyControls layoutType={previewedSyllable.layoutType} fontSpace={fontSpace} />}
        brushControls={<BrushStyleTrackpad
          committed={globalStyle.strokeStyle}
          draft={previewBrush}
          onDraftChange={setPreviewBrush}
          onCommit={commitBrush}
          ends={{ linecap: globalStyle.linecap, linejoin: globalStyle.linejoin }}
          joinOverrides={{ count: ownJoinCount, onRelease: releaseOwnJoins }}
          renderPreview={(strokeStyle, ends) => <Glyph char="한" size={42} maps={maps} schemas={schemas} globalPadding={globalPadding} paddingOverrides={paddingOverrides} previewJamo={null} previewSchema={null} layoutHighlight={null} globalStyle={{ ...globalStyle, ...ends, strokeStyle, brush: strokeStyle.mode === 'brush' ? strokeStyle.brush : globalStyle.brush }} />}
          embedded
          productOptions={chrome === 'workspace'}
          leading={<StyleWeightRange committed={{ weight: globalStyle.weight, slant: globalStyle.slant }} draft={previewTone} onDraftChange={setPreviewTone} onCommit={commitTone} />}
        />}
        beakControls={<StemBeakControls
          committed={committedBeak}
          draft={beakGroup ? groupPreviewBeak : previewBeak}
          onDraftChange={draftBeak}
          onCommit={commitBeak}
          scope={benchGroup && { groupName: benchGroup.name, groupSize: benchGroup.chars.length, toGroup: beakGroup !== null, onChange: (toGroup) => { draftBeak(null); setBeakToGroup(toGroup) } }}
        />}
      /> : <InferenceTrackpad
        glyph={selectedChar}
        syllable={syllable}
        selection={selection}
        creationSelection={selection.kind === 'component' ? creationSelectionOf(selection.editorPart) : lockedPart && selection.kind === 'none' ? creationSelectionOf(lockedPart) : null}
        strokeBoxes={getRenderedStrokeTargets(syllable, placement.kind === 'boxes' ? placement.boxes : focusedBoxes).map((target) => ({ editorPart: target.editorPart, strokeId: target.stroke.id, box: target.box }))}
        selectedPoints={selectedPoints}
        selectedStrokes={selectedStrokes}
        onWholeJamoCenteredChange={setWholeJamoCentered}
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
        onStrokeGroupChange={selectStrokeGroup}
        onInkGapLimitChange={setInkGapLimiter}
        onMultiSelectArmedChange={setMultiSelectArmed}
        dragApiRef={directManipulation ? dragApiRef : undefined}
        padDragRef={directManipulation ? padDragRef : undefined}
        frameForEdit={frameForEdit}
        toolSlot={strokeToolSlot}
        onSpread={spreadTarget ? openSpread : null}
        penTool={penTool}
        padHidden={big}
        guard={toolGuard}
      />}
      {/* 첫닿자 변형 트리. 조절판을 덮는 하단 드로어 — 안 가른 계열의 글자를 열면 저절로 올라오고(게이트), 가른 뒤엔 줄 `⋯`로. 끌어 내리면 닫힌다. */}
      {variantTreeAvailable && storedChoseong && <VariantDrawer open={variantTreeShown} onClose={closeTree} title="닿자 형태 전파" description={splitFamilies.length >= 3 ? '기본 닿자의 영향을 받는 레이아웃이 없어요.' : `${3 - splitFamilies.length}개의 레이아웃이 기본 닿자의 영향을 받아요.`}>
        <div data-testid="variant-gate-section">
          <VariantGateCard jamo={storedChoseong.char} viewing={isSoloConsonant(selectedChar) || !editFamily ? 'base' : editFamily} splitFamilies={splitFamilies} onApply={applyVariants} onEditBase={editBaseFromTree} />
        </div>
      </VariantDrawer>}

      {/* 획 편집은 끄는 즉시 저장된다. 레이아웃으로 돌아가는 문은 머리 `‹`(도마를 들고 왔으면 섹션 홈), 되돌리기는 ↶. */}
      {strokeFrameAvailable && !globalStylePanel && boxFitIssue && <div className={styles.strokeDoneBar}>
        <p role="status" data-testid="jamo-box-fit-issue">이 획은 모델 상자에 안 맞아 옛 배치로 그립니다 · {boxFitIssue.message}</p>
      </div>}
      </>}
      </div>
      {isShapeRuleOpen && selection.kind !== 'none' && <ShapeRulePanel jamo={selection.jamo} selectedStrokeId={selection.kind === 'component' ? null : selection.strokeId} onClose={() => setIsShapeRuleOpen(false)} />}
    </>
  )
  // 도마 칩 줄. 획 편집(자모 에디터)에서만 — 레이아웃 편집엔 도마가 없다. 지금 글자에 든 도마 자소가 검정.
  // 탭하면 그 자소의 대표 글자로 바꾸되 획 편집에 머문다(문장에 없으면 앞에 붙인다). `닿는 글자` 줄에서 글자를 고르는 것과 같은 길.
  const benchJamo = benchType ? workbenchJamoOf(benchType, selectedChar) : null
  const benchPart: MobileEditorPart | null = benchType === 'choseong' ? 'CH' : benchType === 'jungseong' ? 'JU' : benchType === 'jongseong' ? 'JO' : null
  const pickBenchJamo = (char: string) => {
    if (!benchType || !benchPart || char === benchJamo) return
    const syllable = workbenchSyllable(benchType, char)
    if (![...sampleSentence].includes(syllable)) {
      setSampleSentence((sentence) => `${syllable} ${sentence}`)
      setIsCustomSentence(true)
    }
    // 첫닿자는 단독 칸으로 연다. 대표 음절은 `닿는 글자` 줄의 기준으로.
    const solo = benchType === 'choseong' ? char : null
    setEditMode('stroke')
    setStrokeEntryPart(benchPart)
    setStrokeRowAnchor(solo ? syllable : null)
    setSelectedChar(solo ?? syllable)
    setSelection({ kind: 'none' })
    setSelectedPoints([])
    setSelectedStrokes([])
    setPreviewJamo(null)
    setPreviewSchema(null)
    setInkGapLimiter(null)
    pickFirstStrokeRef.current = true
  }
  const benchRow = benchType && benchChars.length > 0 && editMode === 'stroke' && !big && (
    <div className={styles.bench} role="tablist" aria-label="도마" data-testid="workbench">
      {benchChars.map((char) => <Pressable key={char} type="button" role="tab" aria-selected={char === benchJamo} onClick={() => pickBenchJamo(char)}>{char}</Pressable>)}
    </div>
  )
  if (chrome === 'workspace') {
    return (
      <MobileWorkspaceShell
        activeArea={styleOnly ? 'font' : 'jamo'}
        wide={big}
        projectName={projectName}
        heading={styleOnly ? '스타일' : isLayoutMode ? '레이아웃 편집' : '자소 편집'}
        cover={cover}
        // 획 편집은 레이아웃 위에 얹힌 층이다. 머리 `‹`가 레이아웃으로 내려가는 문(옛 `완료`). 도마를 들고 왔으면 섹션 홈으로.
        back={!styleOnly && editMode === 'stroke' && strokeFrameAvailable ? { label: '레이아웃', onClick: () => chooseEditMode('layout') } : undefined}
        history={{ canUndo: history.length > 0, canRedo: future.length > 0, onUndo: undo, onRedo: redo }}
      >
        {!styleOnly && benchRow}
        {body}
        {shapeAsk && <StemSpreadSheet ask={shapeAsk.ask} picked={shapeAsk.picked} preview={shapePreviewMap} before={shapeBeforeMap} onToggle={toggleShapeAsk} onDone={applyShapeAsk} onCancel={cancelShapeAsk} />}
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
