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

export const SHARED_LAYOUT_TYPES = [
  'choseong-only',
  'choseong-jungseong-vertical',
  'choseong-jungseong-horizontal',
  'choseong-jungseong-mixed',
  'choseong-jungseong-vertical-jongseong',
  'choseong-jungseong-horizontal-jongseong',
  'choseong-jungseong-mixed-jongseong',
] as const satisfies readonly LayoutType[]

export type SharedLayoutType = (typeof SHARED_LAYOUT_TYPES)[number]
export type LayoutSplitId = string
export type LayoutRailId = string

export interface StableLayoutSplit extends Split {
  id: LayoutSplitId
}

/** 저장 LayoutSchema와 분리된, 해석 시점의 안정 분할선 주소. */
export interface GridBoundLayoutProjection {
  schema: LayoutSchema
  stableSplits: StableLayoutSplit[]
}

export interface ResolvedLayoutRail {
  id: LayoutRailId
  axis: Axis
  value: number
}

/** partGrid와 별개인 레이아웃 슬롯 전용 Rail 좌표계. */
export interface ResolvedLayoutGrid {
  id: string
  xRails: ResolvedLayoutRail[]
  yRails: ResolvedLayoutRail[]
}

export interface LayoutPartEdgeRailIds {
  left: LayoutRailId
  right: LayoutRailId
  top: LayoutRailId
  bottom: LayoutRailId
}

export interface LayoutGridBinding {
  schema: 'layout-grid-binding'
  version: 1
  id: string
  layoutType: SharedLayoutType
  layoutGridId: string
  splitRailIds: Record<LayoutSplitId, LayoutRailId>
  partEdgeRailIds: Partial<Record<Part, LayoutPartEdgeRailIds>>
}

export type LayoutRailPosition =
  | { kind: 'absolute'; value: number }
  | { kind: 'between'; fromRailId: LayoutRailId; toRailId: LayoutRailId; ratio: number }

export interface LayoutGridSourceRailV1 {
  id: LayoutRailId
  axis: Axis
  position: LayoutRailPosition
}

/** 공통 layoutGrid의 원본 Rail. resolved value와 projection은 저장하지 않는다. */
export interface LayoutGridSourceV1 {
  schema: 'layout-grid-source'
  version: 1
  id: string
  xRails: LayoutGridSourceRailV1[]
  yRails: LayoutGridSourceRailV1[]
  snapStep: number
  minGap: number
}

export interface LayoutGridSystemSourceV1 {
  schema: 'layout-grid-system'
  version: 1
  grid: LayoutGridSourceV1
  bindings: Record<SharedLayoutType, LayoutGridBinding>
}

declare const validatedLayoutGridSystemSourceV1Brand: unique symbol

export type ValidatedLayoutGridSystemSourceV1 = DeepReadonly<LayoutGridSystemSourceV1> & {
  readonly [validatedLayoutGridSystemSourceV1Brand]: true
}

export type LayoutGridSystemSourceIssueCode =
  | 'invalid-root'
  | 'unsupported-schema'
  | 'unsupported-version'
  | 'unknown-field'
  | 'invalid-grid'
  | 'invalid-rail'
  | 'duplicate-id'
  | 'missing-reference'
  | 'cross-axis-reference'
  | 'cyclic-reference'
  | 'invalid-rail-order'
  | 'invalid-gap'
  | 'invalid-binding'
  | 'non-canonical-binding-id'

export interface LayoutGridSystemSourceIssue {
  code: LayoutGridSystemSourceIssueCode
  path: string
  message: string
}

export type LayoutGridSystemSourceParseResult =
  | {
    ok: true
    source: ValidatedLayoutGridSystemSourceV1
    resolvedGrid: ResolvedLayoutGrid
  }
  | { ok: false; issues: LayoutGridSystemSourceIssue[] }

export type LayoutGridProjectionIssueCode =
  | 'invalid-schema'
  | 'unsupported-layout'
  | 'invalid-grid'
  | 'invalid-binding'
  | 'missing-rail'
  | 'cross-axis-rail'
  | 'invalid-edge-order'
  | 'split-edge-conflict'

export interface LayoutGridProjectionIssue {
  code: LayoutGridProjectionIssueCode
  message: string
  layoutType?: LayoutType
  splitId?: LayoutSplitId
  part?: Part
  edge?: keyof LayoutPartEdgeRailIds
  railId?: LayoutRailId
}

export type LayoutGridProjectionResult =
  | { ok: true; projection: GridBoundLayoutProjection }
  | { ok: false; issues: LayoutGridProjectionIssue[] }

export type AllLayoutGridProjectionResult =
  | {
    ok: true
    schemas: Record<LayoutType, LayoutSchema>
    stableSplits: Record<SharedLayoutType, StableLayoutSplit[]>
  }
  | { ok: false; issues: LayoutGridProjectionIssue[] }

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

// ===== 전역 붓촉 =====
export type BrushTip = 'round' | 'ellipse' | 'rectangle'

export interface BrushStyle {
  tip: BrushTip
  /** 짧은 축 / 긴 축. 0.2~1.0 */
  aspectRatio: number
  /** 화면 가로축 기준 고정 각도. -90~+90 */
  angle: number
}

// ===== 중심선 → 최종 윤곽 생성 규칙 =====
export interface BrushStrokeRenderStyle {
  mode: 'brush'
  brush: BrushStyle
}

export interface AngledAreaStrokeRenderStyle {
  mode: 'angled-area'
  /** 화면 가로축 기준 공통 절단면 각도. -60~+60 */
  cutAngle: number
  /** 꺾임을 둥글리는 비율. 0~1 */
  cornerRadius: number
}

export interface DotPatternStrokeRenderStyle {
  mode: 'dot-pattern'
  /** 기존 획 굵기에 대한 점 지름 배율. 0.5~1.5 */
  dotSize: number
  /** 점 지름에 대한 중심 간 빈 간격 배율. 0~2 */
  gap: number
  /** 중심선 양옆으로 반복하는 열 수. 1~3 */
  rows: number
  /** 이웃 열을 반 칸 엇갈리게 배치 */
  stagger: boolean
  /** 0은 생략 없음, 2~8은 해당 주기마다 한 점 생략 */
  omitEvery: number
}

/** 25-unit 스냅·75-unit 획·35° 절단을 사용하는 구형 중심선 렌더 실험. */
export interface LegacySnappedCenterlineStrokeRenderStyle {
  mode: 'legacy-snapped-centerline'
}

export type StrokeRenderStyle =
  | BrushStrokeRenderStyle
  | AngledAreaStrokeRenderStyle
  | DotPatternStrokeRenderStyle
  | LegacySnappedCenterlineStrokeRenderStyle

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

// ===== 화면·폰트 공통 잉크 해석 계약 =====
export interface InkPoint {
  x: number
  y: number
}

export type InkRing = InkPoint[]

export interface InkRegion {
  outer: InkRing
  holes: InkRing[]
}

/** 자소에서 현재 중심선을 선택한 저장 채널. */
export type InkChannel = 'strokes' | 'horizontalStrokes' | 'verticalStrokes'

export type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer Item)[]
    ? readonly DeepReadonly<Item>[]
    : T extends object
      ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
      : T

export type ReadonlyStrokeDataV2 = DeepReadonly<StrokeDataV2>

/** Step 3의 그리드 provenance와 관계없는, 기존 중심선의 안정적 주소. */
export interface ResolvedStrokeInkSource {
  kind: 'stroke'
  glyphId: string
  part: Part
  channel: InkChannel
  jamoId: string
  strokeId: string
}

/** 생산용 part grid가 도입될 때 확장할 소스 분기. 현재 resolver는 생성하지 않는다. */
export interface ResolvedPartGridInkSource {
  kind: 'part-grid'
  glyphId: string
  part: Part
  jamoId: string
  elementId: string
}

// Noto 실측 윤곽은 잉크 소스가 아니다. 측정·고스트·룩으로만 쓰므로 여기에 소스 분기를 두지 않는다.
export type ResolvedInkSource = ResolvedStrokeInkSource | ResolvedPartGridInkSource

export type InkCoordinateSpace = 'stroke-local-with-glyph-box' | 'glyph-normalized'

export interface ResolvedCenterlinePrimitive<
  TSource extends ResolvedInkSource = ResolvedInkSource,
> {
  kind: 'centerline'
  coordinateSpace: 'stroke-local-with-glyph-box'
  id: string
  source: TSource
  stroke: ReadonlyStrokeDataV2
  box: Readonly<BoxConfig>
  weightMultiplier: number
  effectiveLinecap: StrokeLinecap
  effectiveLinejoin: StrokeLinejoin
}

/** 면 원본을 연결할 후속 Step 2 조각을 위한 계약. */
export interface ResolvedRegionPrimitive {
  kind: 'region'
  coordinateSpace: 'glyph-normalized'
  id: string
  source: ResolvedInkSource
  region: DeepReadonly<InkRegion>
}

export type ResolvedInkPrimitive = ResolvedCenterlinePrimitive | ResolvedRegionPrimitive

export type GlyphInkPlacement =
  | { kind: 'schema'; schema: LayoutSchema }
  | { kind: 'boxes'; boxes: Readonly<Partial<Record<Part, BoxConfig>>> }
  | {
    kind: 'resolved-part-grid'
    resolvedPartGrid: {
      boxes: Readonly<Partial<Record<Part, BoxConfig>>>
    }
  }

export interface ResolveGlyphInkInput {
  syllable: DecomposedSyllable
  placement: GlyphInkPlacement
  weightMultiplier: number
  globalLinecap?: StrokeLinecap
  globalLinejoin?: StrokeLinejoin
  horizontalInkBounds?: Readonly<{ min: number; max: number }>
}

export interface ResolvedGlyphInkResult<
  TPrimitive extends ResolvedInkPrimitive = ResolvedInkPrimitive,
> {
  boxes: Partial<Record<Part, BoxConfig>>
  renderOrder: Part[]
  limitedParts: MobileEditorPart[]
  primitives: TPrimitive[]
}

// ===== 안정 ID 기반 생산용 형태 그리드 =====
export type RailId = string
export type RailAxis = 'x' | 'y'

export type CoreXRailRole =
  | 'outer-left'
  | 'inner-left'
  | 'center-x'
  | 'inner-right'
  | 'outer-right'

export type CoreYRailRole =
  | 'outer-top'
  | 'inner-top'
  | 'center-y'
  | 'inner-bottom'
  | 'outer-bottom'

export type CoreRailRole = CoreXRailRole | CoreYRailRole

export type JamoPartRole =
  | 'STANDALONE'
  | 'CH'
  | 'JU_VERTICAL'
  | 'JU_HORIZONTAL'
  | 'JU_H'
  | 'JU_V'
  | 'JO'

export type RailPosition =
  | { kind: 'absolute'; value: number }
  | {
    kind: 'between'
    fromRailId: RailId
    toRailId: RailId
    ratio: number
  }

export interface ShapeRail {
  id: RailId
  position: RailPosition
  kind: 'core' | 'auxiliary'
  coreRole?: CoreXRailRole | CoreYRailRole
}

export interface RailGrid {
  id: string
  role: JamoPartRole
  xRails: ShapeRail[]
  yRails: ShapeRail[]
  snapStep: number
  minGap: number
}

export interface ResolvedShapeRail {
  id: RailId
  axis: RailAxis
  kind: ShapeRail['kind']
  coreRole?: ShapeRail['coreRole']
  value: number
}

export interface ResolvedRailGrid {
  id: string
  role: JamoPartRole
  xRails: ResolvedShapeRail[]
  yRails: ResolvedShapeRail[]
  snapStep: number
  minGap: number
}

/** context part grid를 최종 layout slot에 한 번 투영한 비영속 좌표 그리드. */
export interface SlotProjectedPartGrid {
  coordinateSpace: 'glyph-normalized'
  sourceGridId: string
  role: JamoPartRole
  part: Part
  slot: BoxConfig
  xRails: ResolvedShapeRail[]
  yRails: ResolvedShapeRail[]
}

export type PartGridSlotProjectionIssueCode =
  | 'invalid-request'
  | 'invalid-contextual-grid'
  | 'invalid-provenance'
  | 'invalid-slot'
  | 'role-part-mismatch'
  | 'non-finite-projection'
  | 'degenerate-projection'

export interface PartGridSlotProjectionIssue {
  code: PartGridSlotProjectionIssueCode
  message: string
  causeCodes?: RailGridIssueCode[]
}

export type PartGridSlotProjectionResult =
  | {
    ok: true
    resolvedPartGrid: SlotProjectedPartGrid
    master: JamoRoleMaster
    provenance: GridProvenance
  }
  | { ok: false; issues: PartGridSlotProjectionIssue[] }

export type RailGridIssueCode =
  | 'invalid-grid-structure'
  | 'invalid-grid-id'
  | 'invalid-role'
  | 'invalid-rail-id'
  | 'invalid-rail-kind'
  | 'invalid-position-kind'
  | 'duplicate-rail-id'
  | 'missing-core-role'
  | 'duplicate-core-role'
  | 'core-role-axis-mismatch'
  | 'core-role-on-auxiliary'
  | 'core-role-order-mismatch'
  | 'non-finite-position'
  | 'out-of-range-position'
  | 'invalid-ratio'
  | 'missing-reference'
  | 'cross-axis-reference'
  | 'self-reference'
  | 'identical-between-reference'
  | 'cyclic-reference'
  | 'reversed-between-span'
  | 'non-monotonic'
  | 'min-gap-violation'
  | 'invalid-snap-step'
  | 'invalid-min-gap'

export interface RailGridIssue {
  code: RailGridIssueCode
  message: string
  axis?: RailAxis
  railId?: RailId
  coreRole?: CoreXRailRole | CoreYRailRole
  referenceRailId?: RailId
}

export type RailGridValidationResult =
  | { ok: true; issues: [] }
  | { ok: false; issues: RailGridIssue[] }

export type RailGridResolutionResult =
  | { ok: true; grid: ResolvedRailGrid }
  | { ok: false; issues: RailGridIssue[] }

export type JamoConstructionChannelName = 'main' | 'horizontal' | 'vertical'

export interface GridCellRef {
  id: string
  leftRailId: RailId
  rightRailId: RailId
  topRailId: RailId
  bottomRailId: RailId
}

export interface GridPointRef {
  id: string
  xRailId: RailId
  yRailId: RailId
}

export type BoundaryTreatment =
  | {
    id: string
    kind: 'curve'
    vertex: GridPointRef
    from: GridPointRef
    to: GridPointRef
    tension: number
  }
  | {
    id: string
    kind: 'diagonal'
    vertex: GridPointRef
    from: GridPointRef
    to: GridPointRef
  }

export interface GridAreaElement {
  id: string
  kind: 'area'
  filledCells: GridCellRef[]
  boundaryTreatments: BoundaryTreatment[]
}

export interface GridCenterlineAnchor {
  id: string
  point: GridPointRef
  handleIn?: GridPointRef
  handleOut?: GridPointRef
}

export interface GridCenterlineElement {
  id: string
  kind: 'centerline'
  anchors: GridCenterlineAnchor[]
  closed: boolean
  thickness: number
  linecap?: StrokeLinecap
  linejoin?: StrokeLinejoin
}

export type JamoConstructionElement = GridAreaElement | GridCenterlineElement

export type JamoLayoutContext =
  | 'choseong-only'
  | 'vertical'
  | 'horizontal'
  | 'mixed'
  | 'vertical-with-jongseong'
  | 'horizontal-with-jongseong'
  | 'mixed-with-jongseong'

export interface JamoVariantContext {
  baseContext: JamoLayoutContext
  medialClass?: string
  finalWidthClass?: 'narrow' | 'normal' | 'wide'
  initialClass?: 'open' | 'closed' | 'double'
}

export type ConstructionReferenceAddress = Exclude<
  GridReferenceAddress,
  { kind: 'rail-position' }
>

export interface GridReferenceOverride {
  id: string
  target: ConstructionReferenceAddress
  railId: RailId
}

export type AuxiliaryShapeRail = ShapeRail & {
  kind: 'auxiliary'
  coreRole?: never
}

export interface JamoContextVariant {
  id: string
  context: JamoVariantContext
  presetId?: string
  coreRailOverrides?: Partial<Record<CoreXRailRole | CoreYRailRole, RailPosition>>
  auxiliaryRails?: {
    xRails: AuxiliaryShapeRail[]
    yRails: AuxiliaryShapeRail[]
  }
  referenceOverrides?: GridReferenceOverride[]
}

export type GridValueSource = 'master' | 'role-default' | 'context-preset' | 'jamo-override'

export interface GridValueProvenance {
  source: GridValueSource
  variantId?: string
  presetId?: string
}

export interface GridProvenance {
  railSources: Record<RailId, GridValueProvenance>
  referenceSources: Record<string, GridValueProvenance>
  selectedPresetIds: string[]
  selectedVariantId?: string
  selectedVariantContext?: JamoVariantContext
  requestedContext?: JamoVariantContext
  selectedContextPresetContext?: JamoVariantContext
}

export interface RoleGridDefaultV1 {
  id: string
  role: JamoPartRole
  coreRailPositions: Partial<Record<CoreRailRole, RailPosition>>
}

export interface ContextGridPresetV1 {
  id: string
  role: JamoPartRole
  context: JamoVariantContext
  coreRailPositions: Partial<Record<CoreRailRole, RailPosition>>
}

export interface ContextGridPresetCatalogV1 {
  schema: 'context-grid-preset-catalog'
  version: 1
  roleDefaults: RoleGridDefaultV1[]
  contextPresets: ContextGridPresetV1[]
}

declare const validatedContextGridPresetCatalogV1Brand: unique symbol

export type ValidatedContextGridPresetCatalogV1 = DeepReadonly<ContextGridPresetCatalogV1> & {
  readonly [validatedContextGridPresetCatalogV1Brand]: true
}

export type ContextGridPresetCatalogIssueCode =
  | 'invalid-root'
  | 'unsupported-schema'
  | 'unsupported-version'
  | 'unknown-field'
  | 'invalid-id'
  | 'non-canonical-id'
  | 'duplicate-id'
  | 'invalid-role'
  | 'duplicate-role-default'
  | 'invalid-context'
  | 'invalid-role-context'
  | 'duplicate-context-preset'
  | 'invalid-core-position'
  | 'empty-patch'

export interface ContextGridPresetCatalogIssue {
  code: ContextGridPresetCatalogIssueCode
  path: string
  message: string
}

export type ContextGridPresetCatalogParseResult =
  | { ok: true; catalog: ValidatedContextGridPresetCatalogV1 }
  | { ok: false; issues: ContextGridPresetCatalogIssue[] }

export type ContextPartGridIssueCode =
  | 'invalid-catalog'
  | 'invalid-request'
  | 'invalid-source'
  | 'missing-master'
  | 'role-mismatch'
  | 'unknown-preset'
  | 'preset-role-mismatch'
  | 'preset-context-mismatch'
  | 'ambiguous-context-preset'
  | 'ambiguous-jamo-variant'
  | 'invalid-derived-grid'
  | 'invalid-jamo-override'

export interface ContextPartGridIssue {
  code: ContextPartGridIssueCode
  message: string
  presetId?: string
  variantId?: string
  masterId?: string
  causeCodes?: string[]
}

export type ContextPartGridResolutionResult =
  | {
    ok: true
    grid: RailGrid
    master: JamoRoleMaster
    provenance: GridProvenance
  }
  | { ok: false; issues: ContextPartGridIssue[] }

export type SuccessfulContextPartGridResolution = Extract<
  ContextPartGridResolutionResult,
  { ok: true }
>

export type JamoVariantIssueCode =
  | 'invalid-variant-id'
  | 'non-canonical-variant-id'
  | 'duplicate-variant-id'
  | 'duplicate-variant-context'
  | 'invalid-variant-context'
  | 'empty-variant'
  | 'invalid-preset-id'
  | 'preset-coverage-incomplete'
  | 'invalid-core-rail-override'
  | 'invalid-variant-rail'
  | 'duplicate-variant-rail-id'
  | 'invalid-reference-override'
  | 'duplicate-reference-override'
  | 'orphan-reference-target'
  | 'orphan-destination-rail'
  | 'axis-mismatch'
  | 'overlapping-retile'
  | 'invalid-derived-grid'

export interface JamoVariantIssue {
  code: JamoVariantIssueCode
  message: string
  masterId?: string
  variantId?: string
  overrideId?: string
  railId?: RailId
  elementId?: string
  referenceId?: string
}

export type JamoVariantValidationResult =
  | { ok: true; issues: [] }
  | { ok: false; issues: JamoVariantIssue[] }

export type ExactJamoContextVariantResolutionResult =
  | {
    ok: true
    grid: RailGrid
    master: JamoRoleMaster
    provenance: GridProvenance
  }
  | {
    ok: false
    issues: JamoVariantIssue[]
  }

export type MainJamoPartRole = Exclude<JamoPartRole, 'JU_H' | 'JU_V'>

export interface JamoConstructionChannel<TRole extends JamoPartRole = JamoPartRole> {
  role: TRole
  gridId: string
  elements: JamoConstructionElement[]
}

interface JamoRoleMasterBase {
  id: string
  jamoId: string
  contextVariants?: JamoContextVariant[]
}

export type JamoRoleMaster =
  | (JamoRoleMasterBase & {
    role: MainJamoPartRole
    construction: {
      channels: {
        main: JamoConstructionChannel<MainJamoPartRole>
        horizontal?: never
        vertical?: never
      }
    }
  })
  | (JamoRoleMasterBase & {
    role: 'JU_H'
    construction: {
      channels: {
        main?: never
        horizontal: JamoConstructionChannel<'JU_H'>
        vertical?: never
      }
    }
  })
  | (JamoRoleMasterBase & {
    role: 'JU_V'
    construction: {
      channels: {
        main?: never
        horizontal?: never
        vertical: JamoConstructionChannel<'JU_V'>
      }
    }
  })

export interface RoleConstructionScope {
  schema: 'role-construction'
  version: 1
  grid: RailGrid
  masters: JamoRoleMaster[]
}

declare const validatedRoleConstructionSourceV1Brand: unique symbol

export type ValidatedRoleConstructionSourceV1 = DeepReadonly<RoleConstructionScope> & {
  readonly [validatedRoleConstructionSourceV1Brand]: true
}

export interface ShapeSystemSourceV1 {
  schema: 'shape-system'
  version: 1
  roleSources: Record<JamoPartRole, RoleConstructionScope>
}

declare const validatedShapeSystemSourceV1Brand: unique symbol

export type ValidatedShapeSystemSourceV1 = DeepReadonly<ShapeSystemSourceV1> & {
  readonly [validatedShapeSystemSourceV1Brand]: true
}

export type ShapeSystemSourceV1ParseIssueCode =
  | 'invalid-root'
  | 'unsupported-schema'
  | 'unsupported-version'
  | 'unknown-field'
  | 'invalid-role-sources'
  | 'missing-role-source'
  | 'unexpected-role-source'
  | 'invalid-role-source'
  | 'role-mismatch'
  | 'duplicate-grid-id'
  | 'duplicate-rail-id'
  | 'duplicate-master-id'

export interface ShapeSystemSourceV1ParseIssue {
  code: ShapeSystemSourceV1ParseIssueCode
  path: string
  message: string
}

export type ShapeSystemSourceV1ParseResult =
  | { ok: true; source: ValidatedShapeSystemSourceV1 }
  | { ok: false; issues: ShapeSystemSourceV1ParseIssue[] }

/**
 * Shape System v2의 canonical 저장 원본.
 * layout/context 해석 결과와 provenance/history는 저장하지 않는다.
 */
export interface ShapeSystemSourceV2 {
  schema: 'shape-system'
  version: 2
  roleSources: Record<JamoPartRole, RoleConstructionScope>
  layoutGridSystem: LayoutGridSystemSourceV1 | null
  contextPresetCatalog: ContextGridPresetCatalogV1 | null
}

declare const validatedShapeSystemSourceV2Brand: unique symbol

export type ValidatedShapeSystemSourceV2 = DeepReadonly<ShapeSystemSourceV2> & {
  readonly [validatedShapeSystemSourceV2Brand]: true
}

export type ShapeSystemSourceV2ParseIssueCode =
  | ShapeSystemSourceV1ParseIssueCode
  | 'invalid-layout-grid-system'
  | 'invalid-context-preset-catalog'
  | 'invalid-catalog-grid-link'
  | 'invalid-preset-link'
  | 'duplicate-global-id'
  | 'clone-failed'

export interface ShapeSystemSourceV2ParseIssue {
  code: ShapeSystemSourceV2ParseIssueCode
  path: string
  message: string
}

export type ShapeSystemSourceV2ParseResult =
  | { ok: true; source: ValidatedShapeSystemSourceV2 }
  | { ok: false; issues: ShapeSystemSourceV2ParseIssue[] }

export type ShapeSystemSourceMigrationResult =
  | { ok: true; source: ValidatedShapeSystemSourceV2; migratedFrom?: 1 }
  | { ok: false; issues: ShapeSystemSourceV2ParseIssue[] }

export type ShapeSystemHistoryEntry =
  | {
      role: JamoPartRole
      transaction: SourceCommandTransaction<RoleConstructionScope>
    }
  | {
      transaction: SourceCommandTransaction<ShapeSystemSourceV2>
    }

export type ShapeSystemStoreErrorCode =
  | 'not-initialized'
  | 'hydration-blocked'
  | 'invalid-role'
  | 'invalid-source'
  | 'command-failed'
  | 'no-history'
  | 'stale-history'

export type ShapeSystemStoreResult =
  | { ok: true }
  | { ok: false; error: { code: ShapeSystemStoreErrorCode; message: string } }

export type RoleConstructionSourceV1ParseIssueCode =
  | 'invalid-root'
  | 'unsupported-schema'
  | 'unsupported-version'
  | 'unknown-field'
  | 'invalid-source'
  | 'preset-coverage-incomplete'
  | 'invalid-variants'

export interface RoleConstructionSourceV1ParseIssue {
  code: RoleConstructionSourceV1ParseIssueCode
  path: string
  message: string
}

export type RoleConstructionSourceV1ParseResult =
  | { ok: true; source: ValidatedRoleConstructionSourceV1 }
  | { ok: false; issues: RoleConstructionSourceV1ParseIssue[] }

export type JamoConstructionIssueCode =
  | 'invalid-scope-structure'
  | 'invalid-grid'
  | 'invalid-master-id'
  | 'non-canonical-master-id'
  | 'duplicate-master-id'
  | 'duplicate-master-key'
  | 'invalid-jamo-id'
  | 'master-role-mismatch'
  | 'invalid-channel-set'
  | 'channel-role-mismatch'
  | 'channel-grid-mismatch'
  | 'invalid-element-id'
  | 'duplicate-element-id'
  | 'invalid-element-kind'
  | 'invalid-cell-id'
  | 'duplicate-cell-id'
  | 'non-canonical-cell-id'
  | 'missing-cell-rail'
  | 'non-atomic-cell'
  | 'duplicate-cell-bounds'
  | 'invalid-reference-id'
  | 'duplicate-reference-id'
  | 'missing-reference-rail'
  | 'invalid-centerline-anchor'
  | 'invalid-centerline-shape'
  | 'invalid-centerline-thickness'
  | 'invalid-boundary-treatment'
  | 'invalid-variant-id'
  | 'non-canonical-variant-id'
  | 'duplicate-variant-id'
  | 'duplicate-variant-context'
  | 'invalid-variant-context'
  | 'invalid-variant-rail'
  | 'duplicate-variant-rail-id'
  | 'invalid-reference-override'
  | 'duplicate-reference-override'
  | 'orphan-variant-reference'
  | 'unsupported-source-field'
  | 'unsupported-source-version'

export interface JamoConstructionIssue {
  code: JamoConstructionIssueCode
  message: string
  masterId?: string
  channel?: JamoConstructionChannelName
  elementId?: string
  cellId?: string
  railId?: RailId
  referenceId?: string
  treatmentId?: string
  anchorId?: string
}

export type RoleConstructionValidationResult =
  | { ok: true; issues: [] }
  | { ok: false; issues: JamoConstructionIssue[] }

export interface SourceCommandTransaction<T> {
  id: string
  kind: 'master-grid'
  command:
    | 'add-auxiliary-rail'
    | 'rebind-grid-reference'
    | 'delete-auxiliary-rail'
    | 'retile-grid-cell-edge'
    | 'import-grid-v1'
    | 'set-context-variant-patch'
    | 'remove-context-variant-patch'
    | 'set-seven-context-base-core-rail'
    | 'set-base-master-area-cells'
    | 'connect-layout-grid'
    | 'set-layout-grid-rail'
  before: T
  after: T
}

export interface BaseMasterRailTargetV2 {
  masterId: string
  railId: RailId
}

/** J-02 초성 원형의 ㄱ·가·고·과·각·곡·곽 비교 범위를 한 번에 갱신한다. */
export interface SetSevenContextBaseCoreRailV2Command {
  transactionId: string
  jamoId: string
  coreRole: CoreXRailRole | CoreYRailRole
  position: { kind: 'absolute'; value: number }
  targets: {
    STANDALONE: BaseMasterRailTargetV2
    CH: BaseMasterRailTargetV2
  }
}

export interface BaseMasterAreaTargetV1 {
  masterId: string
  elementId: string
}

/** J-02의 한 역할 primary area 점유 집합에 원자 셀을 추가하거나 제거한다. */
export interface SetBaseMasterAreaCellsV1Command {
  transactionId: string
  mode: 'fill' | 'erase'
  jamoId: string
  target: BaseMasterAreaTargetV1
  cells: Omit<GridCellRef, 'id'>[]
}

/** 공통 layout grid의 안정 Rail ID 하나를 한 transaction으로 이동한다. */
export interface SetLayoutGridRailV1Command {
  transactionId: string
  railId: string
  position: { kind: 'absolute'; value: number }
}

export type BaseMasterRailCommandErrorCode =
  | 'invalid-transaction-id'
  | 'invalid-command'
  | 'invalid-source'
  | 'missing-master'
  | 'shared-grid-in-use'
  | 'stale-target'
  | 'core-role-mismatch'
  | 'invalid-position'
  | 'no-op'
  | 'invalid-result'

export type BaseMasterRailCommandResult =
  | {
      ok: true
      source: ValidatedShapeSystemSourceV2
      transaction: SourceCommandTransaction<ShapeSystemSourceV2>
    }
  | {
      ok: false
      error: {
        code: BaseMasterRailCommandErrorCode
        message: string
      }
    }

export type BaseMasterAreaCommandErrorCode =
  | 'invalid-transaction-id'
  | 'invalid-command'
  | 'invalid-source'
  | 'missing-master'
  | 'stale-target'
  | 'target-exists'
  | 'unsupported-area-shape'
  | 'variant-in-use'
  | 'cell-occupied'
  | 'no-op'
  | 'invalid-result'

export type BaseMasterAreaCommandResult =
  | {
      ok: true
      source: ValidatedShapeSystemSourceV2
      transaction: SourceCommandTransaction<ShapeSystemSourceV2>
    }
  | {
      ok: false
      error: {
        code: BaseMasterAreaCommandErrorCode
        message: string
      }
    }

export interface AddAuxiliaryRailCommand {
  transactionId: string
  axis: RailAxis
  railId: RailId
  fromRailId: RailId
  toRailId: RailId
  ratio: number
}

export interface GridCellSplitAudit {
  masterId: string
  channel: JamoConstructionChannelName
  elementId: string
  parentCellId: string
  childCellIds: [string, string]
}

export type MasterGridCommandErrorCode =
  | 'invalid-transaction-id'
  | 'invalid-scope'
  | 'invalid-axis'
  | 'invalid-rail-id'
  | 'duplicate-rail-id'
  | 'missing-reference'
  | 'cross-axis-reference'
  | 'non-adjacent-reference'
  | 'invalid-ratio'
  | 'min-gap-violation'
  | 'child-cell-id-collision'
  | 'variant-usage-unchecked'
  | 'invalid-result'

export type MasterGridCommandResult =
  | {
    ok: true
    scope: RoleConstructionScope
    splits: GridCellSplitAudit[]
    transaction: SourceCommandTransaction<RoleConstructionScope>
  }
  | {
    ok: false
    error: {
      code: MasterGridCommandErrorCode
      message: string
      railId?: RailId
      cellId?: string
    }
  }

export type GridCellEdge = 'left' | 'right' | 'top' | 'bottom'
export type GridPointAxis = 'x' | 'y'

interface GridReferenceAddressBase {
  masterId: string
  channel: JamoConstructionChannelName
  elementId: string
}

export type GridReferenceAddress =
  | (GridReferenceAddressBase & {
    kind: 'centerline-point'
    anchorId: string
    referenceId: string
    slot: 'point' | 'handle-in' | 'handle-out'
    axis: GridPointAxis
  })
  | (GridReferenceAddressBase & {
    kind: 'boundary-point'
    treatmentId: string
    referenceId: string
    slot: 'vertex' | 'from' | 'to'
    axis: GridPointAxis
  })
  | (GridReferenceAddressBase & {
    kind: 'cell-edge'
    cellId: string
    edge: GridCellEdge
  })
  | {
    kind: 'rail-position'
    gridId: string
    ownerRailId: RailId
    endpoint: 'from' | 'to'
    axis: RailAxis
  }

export interface RebindGridReferenceCommand {
  transactionId: string
  target: GridReferenceAddress
  railId: RailId
}

export interface RetileGridCellEdgeCommand {
  transactionId: string
  target: Extract<GridReferenceAddress, { kind: 'cell-edge' }>
  railId: RailId
}

export interface GridCellRetileAudit {
  masterId: string
  channel: JamoConstructionChannelName
  elementId: string
  sourceCellId: string
  generatedCellIds: string[]
  reusedCellIds: string[]
}

export type GridCellRetileErrorCode =
  | 'invalid-transaction-id'
  | 'invalid-scope'
  | 'invalid-target'
  | 'target-not-found'
  | 'target-ambiguous'
  | 'missing-rail'
  | 'axis-mismatch'
  | 'no-op'
  | 'internal-cell-seam'
  | 'crosses-opposite-edge'
  | 'cell-id-collision'
  | 'invalid-result'
  | 'variant-usage-unchecked'

export type GridCellRetileCommandResult =
  | {
    ok: true
    scope: RoleConstructionScope
    audit: GridCellRetileAudit
    transaction: SourceCommandTransaction<RoleConstructionScope>
  }
  | {
    ok: false
    error: {
      code: GridCellRetileErrorCode
      message: string
      cellId?: string
    }
  }

export type GridReferenceCommandErrorCode =
  | 'invalid-transaction-id'
  | 'invalid-scope'
  | 'target-not-found'
  | 'target-ambiguous'
  | 'missing-rail'
  | 'axis-mismatch'
  | 'no-op'
  | 'requires-cell-retile'
  | 'variant-usage-unchecked'
  | 'invalid-result'

export type GridReferenceCommandResult =
  | {
    ok: true
    scope: RoleConstructionScope
    transaction: SourceCommandTransaction<RoleConstructionScope>
  }
  | {
    ok: false
    error: {
      code: GridReferenceCommandErrorCode
      message: string
    }
  }

interface RailUsageBase {
  gridId: string
  railId: RailId
  axis: RailAxis
}

export type RailUsage =
  | (RailUsageBase & {
    kind: 'core-role'
    role: JamoPartRole
    coreRole: CoreXRailRole | CoreYRailRole
  })
  | (RailUsageBase & {
    kind: 'between-binding'
    dependentRailId: RailId
    endpoint: 'from' | 'to'
  })
  | (RailUsageBase & {
    kind: 'point-reference'
    masterId: string
    channel: JamoConstructionChannelName
    elementId: string
    referenceId: string
    anchorId?: string
    treatmentId?: string
    slot:
      | 'anchor-point'
      | 'handle-in'
      | 'handle-out'
      | 'curve-vertex'
      | 'curve-from'
      | 'curve-to'
      | 'diagonal-vertex'
      | 'diagonal-from'
      | 'diagonal-to'
  })
  | (RailUsageBase & {
    kind: 'cell-boundary'
    masterId: string
    channel: JamoConstructionChannelName
    elementId: string
    cellId: string
    edge: GridCellEdge
    neighborCellId?: string
    reason: 'merge-safe' | 'occupancy-differs'
  })
  | (RailUsageBase & {
    kind: 'variant-core-override'
    masterId: string
    variantId: string
    coreRole: CoreXRailRole | CoreYRailRole
  })
  | (RailUsageBase & {
    kind: 'variant-between-binding'
    masterId: string
    variantId: string
    ownerKind: 'core-override' | 'auxiliary-rail'
    ownerId: string
    endpoint: 'from' | 'to'
  })
  | (RailUsageBase & {
    kind: 'variant-reference-destination'
    masterId: string
    variantId: string
    overrideId: string
    target: ConstructionReferenceAddress
  })
  | (RailUsageBase & {
    kind: 'variant-reference-target'
    masterId: string
    variantId: string
    overrideId: string
    target: ConstructionReferenceAddress
    reason: 'point-current-rail' | 'cell-id-would-change'
  })

export type RailUsageCollectionResult =
  | { ok: true; usages: RailUsage[] }
  | {
    ok: false
    error: {
      code: 'invalid-scope' | 'missing-rail'
      message: string
    }
  }

export interface RemoveAuxiliaryRailCommand {
  transactionId: string
  axis: RailAxis
  railId: RailId
  usageCoverage: 'role-construction-v1'
}

export const ROLE_CONSTRUCTION_SOURCE_V1_USAGE_COVERAGE =
  'role-construction-source-v1-complete' as const

export interface RemoveAuxiliaryRailSourceV1Command {
  transactionId: string
  axis: RailAxis
  railId: RailId
  usageCoverage: typeof ROLE_CONSTRUCTION_SOURCE_V1_USAGE_COVERAGE
}

export type RemoveRailSourceV1CommandResult =
  | {
    ok: true
    scope: ValidatedRoleConstructionSourceV1
    merges: GridCellMergeAudit[]
    transaction: SourceCommandTransaction<RoleConstructionScope>
  }
  | {
    ok: false
    error: {
      code: RemoveRailCommandErrorCode
      message: string
      usages: RailUsage[]
    }
  }

export type ContextVariantCommandErrorCode =
  | 'invalid-transaction-id'
  | 'invalid-source'
  | 'preset-coverage-incomplete'
  | 'missing-master'
  | 'missing-variant-value'
  | 'invalid-variant-value'
  | 'duplicate-variant-value'
  | 'variant-value-in-use'
  | 'no-op'
  | 'invalid-result'

export type ContextVariantCommandResult =
  | {
    ok: true
    scope: ValidatedRoleConstructionSourceV1
    transaction: SourceCommandTransaction<RoleConstructionScope>
  }
  | {
    ok: false
    error: {
      code: ContextVariantCommandErrorCode
      message: string
      usages?: RailUsage[]
    }
  }

export interface ContextVariantCommandOptions {
  knownPresetIds?: ReadonlySet<string>
}

export interface SetCoreRailOverrideV1Command {
  transactionId: string
  masterId: string
  context: JamoVariantContext
  coreRole: CoreXRailRole | CoreYRailRole
  position: RailPosition
}

export interface RemoveCoreRailOverrideV1Command {
  transactionId: string
  masterId: string
  context: JamoVariantContext
  coreRole: CoreXRailRole | CoreYRailRole
}

export interface SetVariantReferenceOverrideV1Command {
  transactionId: string
  masterId: string
  context: JamoVariantContext
  override: GridReferenceOverride
}

export interface RemoveVariantReferenceOverrideV1Command {
  transactionId: string
  masterId: string
  context: JamoVariantContext
  overrideId: string
}

export interface AddVariantAuxiliaryRailV1Command {
  transactionId: string
  masterId: string
  context: JamoVariantContext
  axis: RailAxis
  rail: AuxiliaryShapeRail
}

export interface RemoveVariantAuxiliaryRailV1Command {
  transactionId: string
  masterId: string
  context: JamoVariantContext
  axis: RailAxis
  railId: RailId
}

export interface ConstructionElementAddress {
  masterId: string
  channel: JamoConstructionChannelName
  elementId: string
}

export type ConstructionReferenceLocator =
  | (ConstructionElementAddress & {
    kind: 'point-reference'
    referenceId: string
  })
  | (ConstructionElementAddress & {
    kind: 'cell-reference'
    cellId: string
  })

export interface VariantReferenceTargetUsage {
  kind: 'variant-reference-target'
  ownerMasterId: string
  variantId: string
  overrideId: string
  target: ConstructionReferenceAddress
}

export interface GridCellMergeAudit {
  masterId: string
  channel: JamoConstructionChannelName
  elementId: string
  parentCellIds: [string, string]
  mergedCellId: string
}

export type RemoveRailCommandErrorCode =
  | 'invalid-transaction-id'
  | 'invalid-scope'
  | 'missing-rail'
  | 'axis-mismatch'
  | 'core-rail-locked'
  | 'rail-in-use'
  | 'incomplete-usage-coverage'
  | 'occupancy-differs'
  | 'cell-id-collision'
  | 'invalid-result'

export type RemoveRailCommandResult =
  | {
    ok: true
    scope: RoleConstructionScope
    merges: GridCellMergeAudit[]
    transaction: SourceCommandTransaction<RoleConstructionScope>
  }
  | {
    ok: false
    error: {
      code: RemoveRailCommandErrorCode
      message: string
      usages: RailUsage[]
    }
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

/** 홀자 계열: 오른홀자(가)·아래홀자(고)·혼합(과). 닿자 골격이 계열마다 다르다. */
export type MedialFamily = 'right' | 'bottom' | 'mixed'

export interface JamoData {
  char: string
  type: 'choseong' | 'jungseong' | 'jongseong'
  /**
   * 문맥 계열별 `strokes` 변형(닿자용). 기본 프리셋이 Noto 골격에 맞춰 넣는다.
   * 렌더·잉크·편집 겨냥은 `strokesForFamily`로 고르고, 사용자가 편집하면 그 문맥 획만 남고 지워진다.
   */
  contextStrokes?: Partial<Record<MedialFamily, StrokeDataV2[]>>
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
