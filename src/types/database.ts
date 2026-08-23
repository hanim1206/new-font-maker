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

// ===== 글로벌 스타일 (DB 저장용) =====
export interface FontGlobalStyle {
  slant: number
  weight: number
  letterSpacing: number
  linecap: StrokeLinecap
  linejoin: StrokeLinejoin
  brush: BrushStyle
  strokeStyle: StrokeRenderStyle
}

export interface FontGlobalStyleExclusion {
  id: string
  property: keyof FontGlobalStyle
  layoutType: LayoutType
}

// ===== 폰트 데이터 (font_data JSONB 컬럼 구조) =====
export const LEGACY_FONT_DATA_VERSION = '1.2.0' as const
export const FONT_DATA_V1_3_VERSION = '1.3.0' as const
export const FONT_DATA_VERSION = '1.4.0' as const

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

export interface FontData extends FontDataPayload {
  version: typeof FONT_DATA_VERSION
  /** Shape v2 raw source만 저장하며 resolved grid/box/윤곽/provenance/history는 저장하지 않는다. */
  shapeSystem?: DeepReadonly<ShapeSystemSourceV2>
}

export type PersistedFontData = FontDataV1_2 | FontDataV1_3 | FontData

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
