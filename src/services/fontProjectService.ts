import { supabase } from '../lib/supabase'
import type { FontProject, CreateFontProjectInput, UpdateFontProjectInput } from '../types/database'

const TABLE = 'font_projects'

/** 현재 로그인된 사용자 ID 조회 */
async function getCurrentUserId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}

/**
 * 폰트 프로젝트 CRUD 서비스
 */
export const fontProjectService = {
  /**
   * 전체 폰트 프로젝트 목록 조회 (최신순, 본인 프로젝트만)
   */
  async list(): Promise<FontProject[]> {
    const userId = await getCurrentUserId()
    let query = supabase
      .from(TABLE)
      .select('*')
      .order('updated_at', { ascending: false })

    // 로그인 상태면 본인 프로젝트만 조회
    if (userId) {
      query = query.eq('user_id', userId)
    }

    const { data, error } = await query

    if (error) throw new Error(`폰트 목록 조회 실패: ${error.message}`)
    return data as FontProject[]
  },

  /**
   * 단일 폰트 프로젝트 조회
   */
  async get(id: string): Promise<FontProject | null> {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null // 결과 없음
      throw new Error(`폰트 조회 실패: ${error.message}`)
    }
    return data as FontProject
  },

  /**
   * 새 폰트 프로젝트 생성
   */
  async create(input: CreateFontProjectInput): Promise<FontProject> {
    const userId = await getCurrentUserId()
    const { data, error } = await supabase
      .from(TABLE)
      .insert({
        name: input.name,
        font_data: input.font_data,
        user_id: input.user_id ?? userId,
      })
      .select()
      .single()

    if (error) throw new Error(`폰트 생성 실패: ${error.message}`)
    return data as FontProject
  },

  /**
   * 폰트 프로젝트 수정 (이름 또는 데이터)
   */
  async update(id: string, input: UpdateFontProjectInput): Promise<FontProject> {
    const { data, error } = await supabase
      .from(TABLE)
      .update(input)
      .eq('id', id)
      .select()
      .single()

    if (error) throw new Error(`폰트 수정 실패: ${error.message}`)
    return data as FontProject
  },

  /**
   * 폰트 프로젝트 삭제
   */
  async remove(id: string): Promise<void> {
    const { error } = await supabase
      .from(TABLE)
      .delete()
      .eq('id', id)

    if (error) throw new Error(`폰트 삭제 실패: ${error.message}`)
  },
}
