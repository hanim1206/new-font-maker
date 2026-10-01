import type {
  BrushStyle,
  DeepReadonly,
  JamoData,
  LayoutSchema,
  LayoutType,
  Padding,
  ShapeSystemSourceV1,
  ShapeSystemSourceV2,
  StrokeLinecap,
  StrokeLinejoin,
  StrokeRenderStyle,
} from './index'
import type { ContextBoxDelta } from '../services/contextBoxResolver'

// ===== 글로벌 스타일 (DB 저장용) =====
export interface FontGlobalStyle {
  slant: number
  weight: number
  letterSpacing: number
  linecap: StrokeLinecap
  linejoin: StrokeLinejoin
  brush: BrushStyle
  strokeStyle: StrokeRenderStyle
  /** 세로줄기 부리. 나중에 생긴 값이라 옛 저장분에는 없다. */
  stemBeak?: { enabled: boolean; shape: 'angled' | 'slab' | 'round' | 'bar' | 'flare'; size: number; angle: number }
  /** 네모꼴 자동 굵기 보정. 껐을 때만 `false`가 온다 — 없으면 켜짐. */
  autoCompensation?: boolean
  /** 속공간 지키기(굵기 자동 보정). 껐을 때만 `false`가 온다 — 없으면 켜짐. */
  counterKeep?: boolean
}

export interface FontGlobalStyleExclusion {
  id: string
  property: keyof FontGlobalStyle
  layoutType: LayoutType
}

// ===== 폰트 데이터 (font_data JSONB 컬럼 구조) =====
export const LEGACY_FONT_DATA_VERSION = '1.2.0' as const
export const FONT_DATA_V1_3_VERSION = '1.3.0' as const
export const FONT_DATA_V1_4_VERSION = '1.4.0' as const
export const FONT_DATA_VERSION = '1.5.0' as const

/**
 * 폰트가 어느 기본 폰트에서 시작했는지. 저장 칸과 화면에는 우리 이름만 쓴다.
 * 폰트마다 만들 때 한 번 박고 저장할 때 덮지 않는다 — 기본값이 바뀌어도 기존 폰트는 제 버전 모델로 그린다.
 * `basic-gothic` = v1(노토 레이아웃 모델), `basic-gothic-v2` = 관리자 `프리셋`에서 고친 대푯값 모델.
 */
export const FONT_PRESET_IDS = ['basic-gothic', 'basic-gothic-v2'] as const
export type FontPresetId = (typeof FONT_PRESET_IDS)[number]
/** 새 폰트가 받는 버전. v2 출시 = 이 줄을 바꾸는 커밋(사용자 승인). */
export const DEFAULT_FONT_PRESET: FontPresetId = 'basic-gothic'
/** 노토 모델을 그대로 쓰는 버전. 동결. */
export const NOTO_FONT_PRESET: FontPresetId = 'basic-gothic'

/** 사용자 레이아웃 조정(`noto-layout-delta-v1`). 범위 규칙식 키 → Δ. 1.5부터 저장한다. */
export interface FontLayoutDelta {
  rules: Record<string, ContextBoxDelta>
}

interface FontDataPayload {
  // layoutStore에서 영속화하는 데이터
  layoutSchemas: Record<LayoutType, LayoutSchema>
  globalPadding: Padding
  paddingOverrides: Partial<Record<LayoutType, Partial<Padding>>>

  // jamoStore에서 영속화하는 데이터
  jamoData: {
    choseong: Record<string, JamoData>
    jungseong: Record<string, JamoData>
    jongseong: Record<string, JamoData>
  }

  // globalStyleStore에서 영속화하는 데이터
  globalStyle: {
    style: FontGlobalStyle
    exclusions: FontGlobalStyleExclusion[]
  }
}

export interface FontDataV1_2 extends FontDataPayload {
  version: typeof LEGACY_FONT_DATA_VERSION
}

export interface FontDataV1_3 extends FontDataPayload {
  version: typeof FONT_DATA_V1_3_VERSION
  /** 원본 Rail/자소 construction만 저장하며 파생 윤곽·provenance·history는 저장하지 않는다. */
  shapeSystem?: DeepReadonly<ShapeSystemSourceV1>
}

export interface FontDataV1_4 extends FontDataPayload {
  version: typeof FONT_DATA_V1_4_VERSION
  shapeSystem?: DeepReadonly<ShapeSystemSourceV2>
}

export interface FontData extends FontDataPayload {
  version: typeof FONT_DATA_VERSION
  /** Shape v2 raw source만 저장하며 resolved grid/box/윤곽/provenance/history는 저장하지 않는다. */
  shapeSystem?: DeepReadonly<ShapeSystemSourceV2>
  /** 없으면 조정 없음. 1.4 이하에서 올린 값에는 없다. */
  layoutDelta?: FontLayoutDelta
  /** 시작한 기본 폰트. 없으면(1.4 이하) `basic-gothic`으로 읽는다. */
  preset?: FontPresetId
}

export type PersistedFontData = FontDataV1_2 | FontDataV1_3 | FontDataV1_4 | FontData

// ===== font_projects 테이블 Row =====
export interface FontProject {
  id: string
  user_id: string | null
  name: string
  /** DB JSONB ingress는 런타임 parser를 통과하기 전까지 신뢰하지 않는다. */
  font_data: unknown
  created_at: string
  updated_at: string
}

// ===== CRUD 요청 타입 =====
export interface CreateFontProjectInput {
  name: string
  font_data: FontData
  user_id?: string
}

export interface UpdateFontProjectInput {
  name?: string
  font_data?: FontData
}
