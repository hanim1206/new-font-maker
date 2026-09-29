import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { announcementOf } from '../src-next/announcements'
import type { Announcement, AnnouncementDraft, AnnouncementRow, AnnouncementStatus } from '../src-next/announcements'

/**
 * 한임 쪽 공지 창구. 로컬 관리자 API(`announcementAdminApi.ts`)가 쓴다.
 * `service_role` 키로 초안까지 다 읽고, 만들고, 게시 · 내리고, 이미지를 버킷에 올린다 — 이 맥에서만 돈다.
 */

export interface AnnouncementAdminEnv { supabaseUrl: string; serviceRoleKey: string }

const TABLE = 'announcements'
export const ANNOUNCEMENT_BUCKET = 'announcements'

const IMAGE_EXTENSION: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }
export const imageExtensionOf = (contentType: string | undefined) => IMAGE_EXTENSION[(contentType ?? '').split(';')[0].trim()] ?? null

export function createAnnouncementAdmin(env: AnnouncementAdminEnv) {
  const supabase = createClient(env.supabaseUrl, env.serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })

  const rowsOf = (data: unknown) => (data as AnnouncementRow[]).map(announcementOf).filter((item): item is Announcement => item !== null)

  /** 모든 공지. 새로 고친 것 먼저. */
  async function list(): Promise<Announcement[]> {
    const { data, error } = await supabase.from(TABLE).select('*').order('updated_at', { ascending: false })
    if (error) throw error
    return rowsOf(data)
  }

  async function create(draft: AnnouncementDraft): Promise<Announcement> {
    const { data, error } = await supabase.from(TABLE).insert({ title: draft.title.trim(), place: draft.place, slides: draft.slides }).select('*')
    if (error) throw error
    return rowsOf(data)[0]
  }

  async function update(id: string, draft: AnnouncementDraft): Promise<Announcement> {
    const { data, error } = await supabase.from(TABLE)
      .update({ title: draft.title.trim(), place: draft.place, slides: draft.slides, updated_at: new Date().toISOString() })
      .eq('id', id).select('*')
    if (error) throw error
    if (!data?.length) throw new Error('없는 공지입니다.')
    return rowsOf(data)[0]
  }

  /** 게시 · 내리기 · 초안으로. 게시한 때는 처음 게시할 때만 적는다(다시 게시해도 이미 읽은 사람에겐 안 뜬다). */
  async function setStatus(id: string, status: AnnouncementStatus): Promise<Announcement> {
    const { data: found, error: findError } = await supabase.from(TABLE).select('published_at').eq('id', id).maybeSingle()
    if (findError) throw findError
    if (!found) throw new Error('없는 공지입니다.')
    const now = new Date().toISOString()
    const publishedAt = (found as { published_at: string | null }).published_at
    const patch = status === 'published' && !publishedAt ? { status, published_at: now, updated_at: now } : { status, updated_at: now }
    const { data, error } = await supabase.from(TABLE).update(patch).eq('id', id).select('*')
    if (error) throw error
    return rowsOf(data)[0]
  }

  async function remove(id: string): Promise<void> {
    const { data, error } = await supabase.from(TABLE).delete().eq('id', id).select('id')
    if (error) throw error
    if (!data?.length) throw new Error('없는 공지입니다.')
  }

  /** 이미지 하나를 버킷에 올리고 공개 주소를 돌려준다. */
  async function uploadImage(bytes: Buffer, contentType: string): Promise<string> {
    const extension = imageExtensionOf(contentType)
    if (!extension) throw new Error('PNG · JPG · WebP · GIF만 올릴 수 있어요.')
    const path = `${randomUUID()}.${extension}`
    const { error } = await supabase.storage.from(ANNOUNCEMENT_BUCKET).upload(path, bytes, { contentType, upsert: false })
    if (error) throw error
    return supabase.storage.from(ANNOUNCEMENT_BUCKET).getPublicUrl(path).data.publicUrl
  }

  return { list, create, update, setStatus, remove, uploadImage }
}
