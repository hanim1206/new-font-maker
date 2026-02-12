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

// 레이아웃 스키마 (Split + Padding 기반)
export interface LayoutSchema {
  id: LayoutType
  slots: Part[]
  splits?: Split[] // 0~N개의 기준선
  padding?: Padding // Split 0개일 때 주로 사용
  // 혼합중성용 추가 설정
  mixedJungseong?: {
    horizontalBox?: { splitY?: number; padding?: Padding }
    verticalBox?: { splitX?: number; padding?: Padding }
  }
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

// ===== 규칙 시스템 (조건/액션 DSL) =====
export type Jamo = string // 'ㄱ', 'ㅏ', 'ㅁ' 등

// 조건 타입
export type Condition =
  | { type: 'layoutIs'; layout: LayoutType }
  | { type: 'choseongIs'; jamo: Jamo }
  | { type: 'jungseongIs'; jamo: Jamo }
  | { type: 'jongseongIs'; jamo: Jamo }

// 액션 타입
export type BoxProp = 'x' | 'y' | 'width' | 'height'

export type Action = {
  type: 'setBox'
  part: Part
  prop: BoxProp
  value: number
}

// 규칙
export interface Rule {
  id: string
  name: string
  presetId: string // 어느 프리셋에 속하는지
  priority: number // 숫자 클수록 우선
  when: Condition[]
  then: Action[]
  enabled: boolean
}

// ===== 패스 데이터 (곡선 지원) =====
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
  x: number // 0~1 상대 좌표
  y: number
  width: number // 0~1 상대 크기
  height: number
}

export interface RectStrokeData extends StrokeBase {
  direction: 'horizontal' | 'vertical'
}

export interface PathStrokeData extends StrokeBase {
  direction: 'path'
  pathData: PathData
}

export type StrokeData = RectStrokeData | PathStrokeData

// 타입 가드
export function isPathStroke(stroke: StrokeData): stroke is PathStrokeData {
  return stroke.direction === 'path'
}

// ===== 자모 데이터 =====
export interface JamoData {
  char: string
  type: 'choseong' | 'jungseong' | 'jongseong'
  // 일반 자모는 strokes 사용, 혼합중성은 horizontalStrokes + verticalStrokes만 사용
  strokes?: StrokeData[]
  // 혼합중성의 경우 가로획과 세로획 분리
  horizontalStrokes?: StrokeData[]
  verticalStrokes?: StrokeData[]
}

// ===== 음절 분해 결과 =====
export interface DecomposedSyllable {
  char: string
  choseong: JamoData | null
  jungseong: JamoData | null
  jongseong: JamoData | null
  layoutType: LayoutType
}

// ===== UI 상태 =====
export type ViewMode = 'preview' | 'presets' | 'editor'

