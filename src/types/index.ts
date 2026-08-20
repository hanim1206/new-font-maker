// ===== 레이아웃 타입 =====
export type LayoutType =
  | 'choseong-only' // 초성만
  | 'jungseong-vertical-only' // 세로중성만
  | 'jungseong-horizontal-only' // 가로중성만
  | 'jungseong-mixed-only' // 혼합중성만
  | 'choseong-jungseong-vertical' // 초성 + 세로중성
  | 'choseong-jungseong-horizontal' // 초성 + 가로중성
  | 'choseong-jungseong-mixed' // 초성 + 혼합중성
  | 'choseong-jungseong-vertical-jongseong' // 초성 + 세로중성 + 종성
  | 'choseong-jungseong-horizontal-jongseong' // 초성 + 가로중성 + 종성
  | 'choseong-jungseong-mixed-jongseong' // 초성 + 혼합중성 + 종성

export type Part = 'CH' | 'JU' | 'JU_H' | 'JU_V' | 'JO' // 초성/중성/중성가로/중성세로/종성

// ===== 박스 설정 =====
export interface BoxConfig {
  x: number // 0~1 상대 좌표
  y: number
  width: number // 0~1 상대 크기
  height: number
}

// ===== Split 기반 레이아웃 시스템 =====
export type Axis = 'x' | 'y'

// 기준선 (공간 분할)
export interface Split {
  axis: Axis
  value: number // 0~1 비율
}

// 슬롯 내부 여백
export interface Padding {
  top: number
  bottom: number
  left: number
  right: number
}

// 파트별 박스 오프셋 (2차 세부 조정)
export interface PartOverride {
  top: number    // 양수=안쪽 축소, 음수=바깥 확장 (오버랩)
  bottom: number
  left: number
  right: number
}

export type GapAnchor = 'before' | 'center' | 'after'

export interface LayoutGap {
  id: string
  axis: Axis
  before: Part[]
  after: Part[]
  size: number
  anchor: GapAnchor
  beforeInset?: number
  afterInset?: number
}

// 레이아웃 스키마 (Split + Padding 기반)
export interface LayoutSchema {
  id: LayoutType
  slots: Part[]
  // Font Space 안의 바깥 Design Body. 있으면 기본 850×850 좌표로 계산한
  // 내부 분할·여백을 이 영역에 비례 변환한다.
  designBodyPadding?: Padding
  splits?: Split[] // 0~N개의 기준선
  padding?: Padding // Split 0개일 때 주로 사용
  gaps?: LayoutGap[] // 파트 사이에서 비워 둘 공간
  // 혼합중성용 추가 설정
  mixedJungseong?: {
    horizontalBox?: { splitY?: number; padding?: Padding }
    verticalBox?: { splitX?: number; padding?: Padding }
  }
  // 파트별 박스 오프셋 (기준선 기반 박스에서 확장/축소)
  partOverrides?: Partial<Record<Part, PartOverride>>
  // 사용자가 레이아웃 화면에서 직접 조작한 추가 오프셋 (프리셋·자모별 기본 보정 뒤에 적용)
  userPartOverrides?: Partial<Record<Part, PartOverride>>
  // 특정 중성에서만 적용되는 레이아웃 기본 파트 영역 (사용자 오버라이드와 별도)
  partOverridesByJungseong?: Record<string, Partial<Record<Part, PartOverride>>>
  // 음절 조합별 파트 오프셋 오버라이드 (conditionGroups 매칭 시 partOverrides 위에 병합)
  overrides?: LayoutOverride[]
}

// ===== 레이아웃 프리셋 =====
export interface LayoutPreset {
  id: string
  name: string
  layoutType: LayoutType
  box: {
    CH?: BoxConfig
    JU?: BoxConfig
    JU_H?: BoxConfig // 혼합중성 가로획용
    JU_V?: BoxConfig // 혼합중성 세로획용
    JO?: BoxConfig
  }
  isDefault?: boolean
}

// ===== 조건부 자모 오버라이드 =====
export type Jamo = string // 'ㄱ', 'ㅏ', 'ㅁ' 등

export interface JamoTransform {
  translateX: number
  translateY: number
  scaleX: number
  scaleY: number
}

// 오버라이드 단일 조건
export type OverrideCondition =
  | { type: 'choseongIs'; jamo: Jamo }
  | { type: 'jungseongIs'; jamo: Jamo }
  | { type: 'jongseongIs'; jamo: Jamo }
  | { type: 'layoutIs'; layout: LayoutType }

// 오버라이드 변형 데이터 (기본 JamoData를 대체하는 부분)
export interface JamoOverrideVariant {
  strokes?: StrokeDataV2[]
  horizontalStrokes?: StrokeDataV2[]
  verticalStrokes?: StrokeDataV2[]
  padding?: Padding
  horizontalPadding?: Padding
  verticalPadding?: Padding
  // 기본 자소 형태를 유지한 채 특정 문맥에서만 적용할 위치/비율 보정
  transform?: JamoTransform
}

// 자모 오버라이드 (JamoData.overrides[]에 저장)
// conditionGroups: 외부 배열 = OR 결합, 내부 배열 = AND 결합
// 예: [[ㄱ초성, ㅏ중성], [ㄴ초성]] = (ㄱ초성 AND ㅏ중성) OR (ㄴ초성)
export interface JamoOverride {
  id: string
  conditionGroups: OverrideCondition[][]  // OR(AND) 결합
  conditions?: OverrideCondition[]        // 레거시 (마이그레이션용, 단일 AND 그룹)
  variant: JamoOverrideVariant
  priority: number                        // 높을수록 우선
  enabled: boolean
}

// 레이아웃 범위 오버라이드 (특정 음절 조합에만 다른 파트 오프셋 적용)
// LayoutSchema.overrides[]에 저장되며, conditionGroups는 JamoOverride와 동일한 OR(AND) 구조
export interface LayoutOverride {
  id: string
  conditionGroups: OverrideCondition[][]
  partOverrides: Partial<Record<Part, PartOverride>>
  priority: number
  enabled: boolean
}

// ===== 패스 데이터 (곡선 지원) — 레거시, Phase 5에서 제거 예정 =====
export interface PathPoint {
  x: number // 0~1, 스트로크 바운딩 박스 내 상대 좌표
  y: number
  handleIn?: { x: number; y: number } // 이전 점에서 들어오는 베지어 제어 핸들
  handleOut?: { x: number; y: number } // 다음 점으로 나가는 베지어 제어 핸들
}

export interface PathData {
  points: PathPoint[]
  closed: boolean // true: 닫힌 패스 (ㅇ 원형 등)
}

// ===== 획 데이터 =====
interface StrokeBase {
  id: string
  x: number // 0~1 상대 좌표 (rect: 중심, path: 좌상단)
  y: number
  width: number // 0~1 상대 크기 (rect: 주축 길이, path: 바운딩 폭)
  thickness: number // 획 두께 (0–1, 공통)
}

export interface RectStrokeData extends StrokeBase {
  direction: 'horizontal' | 'vertical' // 힌트/그룹핑용
  angle: number // 회전각 (0°=가로, 90°=세로)
}

export interface PathStrokeData extends StrokeBase {
  direction: 'path'
  height: number // 바운딩 박스 높이 (0–1)
  pathData: PathData
}

export type StrokeData = RectStrokeData | PathStrokeData

// 타입 가드
export function isPathStroke(stroke: StrokeData): stroke is PathStrokeData {
  return stroke.direction === 'path'
}

export function isRectStroke(stroke: StrokeData): stroke is RectStrokeData {
  return stroke.direction === 'horizontal' || stroke.direction === 'vertical'
}

// 레거시 별칭 (마이그레이션 유틸리티에서 사용)
export type LegacyStrokeData = StrokeData

// ===== 획 끝 모양 (Linecap) =====
export type StrokeLinecap = 'round' | 'butt' | 'square'

// ===== 획 꺾임 모양 (Linejoin) =====
export type StrokeLinejoin = 'miter' | 'round' | 'bevel'

// ===== 통합 획 데이터 (V2) =====
export interface AnchorPoint {
  x: number       // 0~1, 레이아웃 박스 기준
  y: number       // 0~1, 레이아웃 박스 기준
  handleIn?: { x: number; y: number }   // 베지어 제어점 (박스 기준)
  handleOut?: { x: number; y: number }
}

export interface StrokeDataV2 {
  id: string
  points: AnchorPoint[]   // 앵커 포인트 배열 (박스 기준 0~1)
  closed: boolean         // true = 닫힌 도형 (ㅇ 원형 등)
  thickness: number       // 획 두께 (절대값, viewBoxSize 기준)
  label?: string          // 선택적 메타데이터 ('horizontal' | 'vertical' | 'curve' | 'circle')
  linecap?: StrokeLinecap  // 획별 끝 모양 오버라이드 (없으면 글로벌 기본값 사용)
  linejoin?: StrokeLinejoin // 획별 꺾임 모양 오버라이드 (없으면 글로벌 기본값 사용)
}

// ===== 자모 데이터 =====
export type JamoGeometryMode = 'slot-normalized' | 'ink-normalized'

export interface JamoInkSafetyOrigin {
  strokes?: StrokeDataV2[]
  horizontalStrokes?: StrokeDataV2[]
  verticalStrokes?: StrokeDataV2[]
}

export interface JamoContextualInkSafety {
  origin: JamoInkSafetyOrigin
  minimumGap: number
}

export interface JamoData {
  char: string
  type: 'choseong' | 'jungseong' | 'jongseong'
  // 기존 데이터는 slot-normalized(기본값). 실제 종횡비를 보존해 만든 신규 마스터만 ink-normalized.
  geometryMode?: JamoGeometryMode
  // 일반 자모는 strokes 사용, 혼합중성은 horizontalStrokes + verticalStrokes만 사용
  strokes?: StrokeDataV2[]
  // 혼합중성의 경우 가로획과 세로획 분리
  horizontalStrokes?: StrokeDataV2[]
  verticalStrokes?: StrokeDataV2[]
  // 보정 편집의 공통 목표는 현재 획에 두고, 문맥별 충돌 시 origin→현재 변화량만 줄여 적용한다.
  contextualInkSafety?: JamoContextualInkSafety
  /** @deprecated 조합 배치는 레이아웃 프로필이 담당한다. 구형 파일 읽기 전용. */
  padding?: Padding
  /** @deprecated 조합 배치는 레이아웃 프로필이 담당한다. 구형 파일 읽기 전용. */
  horizontalPadding?: Padding
  /** @deprecated 조합 배치는 레이아웃 프로필이 담당한다. 구형 파일 읽기 전용. */
  verticalPadding?: Padding
  // 조건부 변형 목록 (특정 음절 문맥에서 다른 획/패딩 사용)
  overrides?: JamoOverride[]
}

// ===== 음절 분해 결과 =====
export interface DecomposedSyllable {
  char: string
  choseong: JamoData | null
  jungseong: JamoData | null
  jongseong: JamoData | null
  layoutType: LayoutType
}

// ===== 모바일 편집기 v2 =====
export type MobileEditorPart = 'CH' | 'JU' | 'JO'

export type MobileEditorSelection =
  | { kind: 'none' }
  | { kind: 'part'; part: Part }
  | { kind: 'stroke'; part: Part; strokeId: string }
  | { kind: 'point'; part: Part; strokeId: string; pointIndex: number }
  | { kind: 'handle'; part: Part; strokeId: string; pointIndex: number; handle: 'in' | 'out' }

export interface StrokeMoveDelta {
  x: number
  y: number
}

export interface StrokeScale {
  x: number
  y: number
}

export interface GlyphBounds {
  minX: number
  centerX: number
  maxX: number
  minY: number
  centerY: number
  maxY: number
}

export interface AlignmentReference {
  label: string
  bounds: GlyphBounds
}

export interface SmartGuide {
  axis: 'x' | 'y'
  position: number
  label: string
}

export interface EditorHistoryEntry {
  id: string
  createdAt: string
  action: 'part-move' | 'part-resize' | 'gap-change' | 'split-change' | 'stroke-move' | 'stroke-scale' | 'point-move' | 'restore' | 'undo'
  targetKind: 'layout' | 'jamo'
  scope?: 'jamo-base' | 'syllable'
  syllable: string
  jamoType: JamoData['type']
  jamoChar: string
  part: MobileEditorPart
  layoutType: LayoutType
  strokeId: string
  pointIndex?: number
  delta: StrokeMoveDelta
  scale?: StrokeScale
  before: JamoData
  after: JamoData
  layoutBefore?: LayoutSchema
  layoutAfter?: LayoutSchema
  summary: string
}

// ===== UI 상태 =====
export type ViewMode = 'preview' | 'presets' | 'editor'
