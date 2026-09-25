import { supabase } from '../src/lib/supabase'
import type { FontData } from '../src/types/database'

/**
 * `font_projects` 서버 호출. 스토어를 가져오지 않아 메인 화면(`/fonts`)도 쓴다.
 * 지운 폰트(`deleted_at`)는 읽지 않는다. RLS가 내 줄만 돌려준다.
 */

const TABLE = 'font_projects'

export interface FontSummary { id: string; name: string; updatedAt: string }
export interface FontRow { id: string; name: string; fontData: unknown }

export type ApiResult<T> = { ok: true; value: T } | { ok: false; message: string; limit?: boolean }

const failed = (error: { message: string }): { ok: false; message: string } => ({ ok: false, message: error.message })

export async function listFonts(me: string): Promise<ApiResult<FontSummary[]>> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('id, name, updated_at')
    .eq('user_id', me)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
  if (error) return failed(error)
  return { ok: true, value: (data ?? []).map((row) => ({ id: row.id as string, name: row.name as string, updatedAt: row.updated_at as string })) }
}

export async function fetchFont(fontId: string): Promise<ApiResult<FontRow | null>> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('id, name, font_data')
    .eq('id', fontId)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) return failed(error)
  return { ok: true, value: data ? { id: data.id as string, name: data.name as string, fontData: data.font_data } : null }
}

export async function createFont(me: string, name: string, fontData: FontData): Promise<ApiResult<string>> {
  const { data, error } = await supabase
    .from(TABLE)
    .insert({ name, user_id: me, font_data: fontData })
    .select('id')
    .single()
  // DB 트리거가 한도(3)를 넘으면 `font-limit`로 막는다.
  if (error) return { ok: false, message: error.message, limit: error.message.includes('font-limit') }
  return { ok: true, value: (data as { id: string }).id }
}

/** 폰트를 돌려받지 않는다(내보내는 데이터양을 늘리지 않게). */
export async function saveFont(fontId: string, fontData: FontData): Promise<ApiResult<null>> {
  const { error, count } = await supabase
    .from(TABLE)
    .update({ font_data: fontData, updated_at: new Date().toISOString() }, { count: 'exact' })
    .eq('id', fontId)
    .is('deleted_at', null)
  if (error) return failed(error)
  if (count === 0) return { ok: false, message: '계정의 폰트를 찾지 못했습니다(다른 기기에서 지웠을 수 있어요).' }
  return { ok: true, value: null }
}

export async function renameFont(fontId: string, name: string): Promise<ApiResult<null>> {
  const { error } = await supabase.from(TABLE).update({ name }).eq('id', fontId)
  return error ? failed(error) : { ok: true, value: null }
}

/** 소프트 삭제. 줄은 남고 목록 · 한도에서 빠진다. 되살리기는 관리자가 `deleted_at`을 비운다. */
export async function deleteFont(fontId: string): Promise<ApiResult<null>> {
  const { error } = await supabase.from(TABLE).update({ deleted_at: new Date().toISOString() }).eq('id', fontId)
  return error ? failed(error) : { ok: true, value: null }
}

/** 추출할 때마다 +1 한 값. 파일 버전 `1.00n`의 n. */
export async function bumpExportRevision(fontId: string): Promise<ApiResult<number>> {
  const { data, error } = await supabase.rpc('bump_font_export_revision', { font_id: fontId })
  if (error) return failed(error)
  if (typeof data !== 'number') return { ok: false, message: '추출 버전을 올리지 못했습니다.' }
  return { ok: true, value: data }
}
