import { supabase } from '../src/lib/supabase'
import type { FontData } from '../src/types/database'
import { authGateMode } from './betaAuth'
import * as local from './localFontApi'

/**
 * `font_projects` 서버 호출. 스토어를 가져오지 않아 메인 화면(`/fonts`)도 쓴다.
 * 지운 폰트(`deleted_at`)는 읽지 않는다. RLS가 내 줄만 돌려준다.
 * 로그인 게이트가 꺼진 개발 서버에서는 같은 함수가 localStorage(`localFontApi`)를 본다 — 메인 화면과 편집 화면이 dev에서도 같은 길.
 */
const isLocal = () => authGateMode() === 'off'

const TABLE = 'font_projects'

export interface FontSummary { id: string; name: string; updatedAt: string }
/** `updatedAt`은 충돌 확인용 표(`saveFont`의 `expectedUpdatedAt`). */
export interface FontRow { id: string; name: string; fontData: unknown; updatedAt: string | null }

/** `conflict`: 내가 연 뒤 다른 곳(기기 · 탭)이 먼저 저장했다. */
export type ApiResult<T> = { ok: true; value: T } | { ok: false; message: string; limit?: boolean; conflict?: boolean }

const failed = (error: { message: string }): { ok: false; message: string } => ({ ok: false, message: error.message })

export async function listFonts(me: string): Promise<ApiResult<FontSummary[]>> {
  if (isLocal()) return local.listFonts()
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
  if (isLocal()) return local.fetchFont(fontId)
  const { data, error } = await supabase
    .from(TABLE)
    .select('id, name, font_data, updated_at')
    .eq('id', fontId)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) return failed(error)
  return { ok: true, value: data ? { id: data.id as string, name: data.name as string, fontData: data.font_data, updatedAt: (data.updated_at as string | undefined) ?? null } : null }
}

export async function createFont(me: string, name: string, fontData: FontData): Promise<ApiResult<{ id: string; updatedAt: string | null }>> {
  if (isLocal()) return local.createFont(name, fontData)
  const { data, error } = await supabase
    .from(TABLE)
    .insert({ name, user_id: me, font_data: fontData })
    .select('id, updated_at')
    .single()
  // DB 트리거가 한도(3)를 넘으면 `font-limit`로 막는다.
  if (error) return { ok: false, message: error.message, limit: error.message.includes('font-limit') }
  const row = data as { id: string; updated_at?: string }
  return { ok: true, value: { id: row.id, updatedAt: row.updated_at ?? null } }
}

/**
 * 폰트를 돌려받지 않는다(내보내는 데이터양을 늘리지 않게). 저장된 `updated_at`만 돌려받아 다음 저장의 표로 쓴다.
 * `expectedUpdatedAt`을 주면 서버 값이 그대로일 때만 덮는다. 다르면 `conflict` — 다른 기기가 먼저 저장했다.
 * null이면 조건 없이 덮는다(`내 것으로 덮기`, 사본 올리기).
 */
export async function saveFont(fontId: string, fontData: FontData, expectedUpdatedAt: string | null = null): Promise<ApiResult<string | null>> {
  if (isLocal()) return local.saveFont(fontId, fontData, expectedUpdatedAt)
  let query = supabase
    .from(TABLE)
    .update({ font_data: fontData, updated_at: new Date().toISOString() })
    .eq('id', fontId)
    .is('deleted_at', null)
  if (expectedUpdatedAt) query = query.eq('updated_at', expectedUpdatedAt)
  const { data, error } = await query.select('updated_at')
  if (error) return failed(error)
  const row = (data as { updated_at?: string }[] | null)?.[0]
  if (row) return { ok: true, value: row.updated_at ?? null }
  if (expectedUpdatedAt && await fontExists(fontId)) {
    return { ok: false, conflict: true, message: '다른 기기에서 먼저 저장했어요.' }
  }
  return { ok: false, message: '계정의 폰트를 찾지 못했습니다(다른 기기에서 지웠을 수 있어요).' }
}

/** 지우지 않은 폰트가 있는지만. 충돌과 삭제를 가른다. 확인을 못 하면 있다고 친다(덮지 않는 쪽). */
async function fontExists(fontId: string): Promise<boolean> {
  const { data, error } = await supabase.from(TABLE).select('id').eq('id', fontId).is('deleted_at', null).maybeSingle()
  return error ? true : data !== null
}

export async function renameFont(fontId: string, name: string): Promise<ApiResult<null>> {
  if (isLocal()) return local.renameFont(fontId, name)
  const { error } = await supabase.from(TABLE).update({ name }).eq('id', fontId)
  return error ? failed(error) : { ok: true, value: null }
}

/** 소프트 삭제. 줄은 남고 목록 · 한도에서 빠진다. 되살리기는 관리자가 `deleted_at`을 비운다. */
export async function deleteFont(fontId: string): Promise<ApiResult<null>> {
  if (isLocal()) return local.deleteFont(fontId)
  const { error } = await supabase.from(TABLE).update({ deleted_at: new Date().toISOString() }).eq('id', fontId)
  return error ? failed(error) : { ok: true, value: null }
}

/** 추출할 때마다 +1 한 값. 파일 버전 `1.00n`의 n. */
export async function bumpExportRevision(fontId: string): Promise<ApiResult<number>> {
  if (isLocal()) return local.bumpExportRevision(fontId)
  const { data, error } = await supabase.rpc('bump_font_export_revision', { font_id: fontId })
  if (error) return failed(error)
  if (typeof data !== 'number') return { ok: false, message: '추출 버전을 올리지 못했습니다.' }
  return { ok: true, value: data }
}
