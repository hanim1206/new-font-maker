import { announcementOf } from './announcements'
import type { Announcement, AnnouncementRow } from './announcements'
import { authGateMode, sessionUser } from './betaAuth'

/**
 * 게시된 공지와 내 가입일을 앱이 뜰 때 한 번 받아 둔다(자리마다 부르지 않는다).
 * RLS가 게시 중인 공지만 돌려준다. 게이트가 꺼진 개발 서버에서는 localStorage 한 키를 본다 — e2e도 이 길이다.
 * 만들기 · 게시는 여기 없다. 로컬 관리자 API(`scripts/announcementAdminApi.ts`)가 한다.
 */

export const LOCAL_ANNOUNCEMENTS_KEY = 'font-maker-local-announcements-v1'

export interface AnnouncementFeed { announcements: Announcement[]; signedUpAt: string | null }

const EMPTY: AnnouncementFeed = { announcements: [], signedUpAt: null }

function readLocal(): Announcement[] {
  try {
    const value = JSON.parse(localStorage.getItem(LOCAL_ANNOUNCEMENTS_KEY) ?? '[]') as unknown
    return Array.isArray(value) ? value as Announcement[] : []
  } catch { return [] }
}

async function fetchFeed(): Promise<AnnouncementFeed> {
  const mode = authGateMode()
  if (mode === 'off') return { announcements: readLocal(), signedUpAt: null }
  if (mode !== 'on') return EMPTY
  try {
    const { supabase } = await import('../src/lib/supabase')
    const [{ data, error }, user] = await Promise.all([
      supabase.from('announcements').select('*').eq('status', 'published').order('published_at', { ascending: true }),
      sessionUser(),
    ])
    // 테이블이 아직 없거나 네트워크가 끊겨도 앱은 그냥 공지 없이 돈다.
    if (error) return EMPTY
    const announcements = (data as AnnouncementRow[] ?? []).map(announcementOf).filter((item): item is Announcement => item !== null)
    return { announcements, signedUpAt: user?.createdAt ?? null }
  } catch {
    return EMPTY
  }
}

let feed: Promise<AnnouncementFeed> | null = null

export function loadAnnouncementFeed(): Promise<AnnouncementFeed> {
  feed ??= fetchFeed()
  return feed
}
