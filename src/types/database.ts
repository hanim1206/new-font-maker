import type { LayoutType, LayoutSchema, Padding, JamoData, StrokeLinecap } from './index'

// ===== 글로벌 스타일 (DB 저장용) =====
export interface FontGlobalStyle {
  slant: number
  weight: number
  letterSpacing: number
  linecap: StrokeLinecap
}

export interface FontGlobalStyleExclusion {
  id: string
  property: keyof FontGlobalStyle
  layoutType: LayoutType
}

// ===== 폰트 데이터 (font_data JSONB 컬럼 구조) =====
export const FONT_DATA_VERSION = '1.0.0'

export interface FontData {
  // 데이터 버전 (마이그레이션용)
  version: string
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

// ===== font_projects 테이블 Row =====
export interface FontProject {
  id: string
  user_id: string | null
  name: string
  font_data: FontData
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
