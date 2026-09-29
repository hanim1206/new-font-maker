/**
 * 공지 팝업(docs/plans/2026-09-29_공지-팝업.md). 공지 하나 = 장 카드 여러 장 + 뜨는 자리 하나.
 * 서버 · 스토어를 가져오지 않는 순수 함수만 — 앱 · 관리자 화면 · 관리자 API · 테스트가 같이 쓴다.
 */

/** 뜨는 자리. 자리를 늘리려면 여기 한 줄 + 그 화면에 `AnnouncementSpot` 하나. */
export const ANNOUNCEMENT_PLACES = [
  { key: 'global', label: '전체', hint: '어느 화면이든 첫 진입' },
  { key: 'dashboard', label: '대시보드', hint: '/dashboard' },
  { key: 'style', label: '스타일', hint: '글로벌 스타일 공간 열 때' },
  { key: 'style.brush', label: '스타일 · 붓', hint: '붓 트랙패드 열 때' },
  { key: 'jamo-editor', label: '자소 편집', hint: '획 편집기 진입' },
  { key: 'layout-editor', label: '레이아웃', hint: '레이아웃 편집기 진입' },
  { key: 'review', label: '검수', hint: '/workspace/review' },
  { key: 'export', label: '다운로드', hint: '추출 완료 화면' },
] as const

export type AnnouncementPlace = typeof ANNOUNCEMENT_PLACES[number]['key']
export type AnnouncementStatus = 'draft' | 'published' | 'archived'

export const ANNOUNCEMENT_STATUS_LABEL: Record<AnnouncementStatus, string> = { draft: '초안', published: '게시 중', archived: '내림' }

export const placeLabelOf = (place: string) => ANNOUNCEMENT_PLACES.find((item) => item.key === place)?.label ?? place
export const isAnnouncementPlace = (place: unknown): place is AnnouncementPlace =>
  ANNOUNCEMENT_PLACES.some((item) => item.key === place)

/** 장 카드 한 장. `image`는 버킷의 공개 주소(비면 그림 없이 글만). */
export interface AnnouncementSlide { image: string; title: string; body: string }

export interface Announcement {
  id: string
  title: string
  place: AnnouncementPlace
  slides: AnnouncementSlide[]
  status: AnnouncementStatus
  publishedAt: string | null
  createdAt: string
  updatedAt: string
}

/** 관리자가 고치는 몫. */
export interface AnnouncementDraft { title: string; place: AnnouncementPlace; slides: AnnouncementSlide[] }

export const ANNOUNCEMENT_LIMITS = { title: 80, slideTitle: 40, slideBody: 300, slides: 10 } as const

/** 저장할 수 없으면 까닭 한 줄, 되면 null. 관리자 화면과 관리자 API가 같이 본다. */
export function announcementDraftProblem(draft: AnnouncementDraft): string | null {
  const title = draft.title.trim()
  if (!title || title.length > ANNOUNCEMENT_LIMITS.title) return `공지 이름은 1~${ANNOUNCEMENT_LIMITS.title}자로 써 주세요.`
  if (!isAnnouncementPlace(draft.place)) return '뜨는 자리를 골라 주세요.'
  if (!Array.isArray(draft.slides) || draft.slides.length === 0) return '장을 하나 이상 넣어 주세요.'
  if (draft.slides.length > ANNOUNCEMENT_LIMITS.slides) return `장은 ${ANNOUNCEMENT_LIMITS.slides}장까지예요.`
  for (const [order, slide] of draft.slides.entries()) {
    const at = `${order + 1}번째 장`
    if (!slide.title.trim() || slide.title.length > ANNOUNCEMENT_LIMITS.slideTitle) return `${at} 제목은 1~${ANNOUNCEMENT_LIMITS.slideTitle}자로 써 주세요.`
    if (slide.body.length > ANNOUNCEMENT_LIMITS.slideBody) return `${at} 본문은 ${ANNOUNCEMENT_LIMITS.slideBody}자까지예요.`
  }
  return null
}

/** 읽음 표시. 닫으면 읽음(끝 장까지 안 넘겨도). 기기마다 따로다. */
export const announcementReadKey = (id: string) => `announcement-read:${id}`

type ReadStorage = Pick<Storage, 'getItem' | 'setItem'>

export function isAnnouncementRead(storage: ReadStorage, id: string): boolean {
  try { return storage.getItem(announcementReadKey(id)) !== null } catch { return false }
}

export function markAnnouncementRead(storage: ReadStorage, id: string, now = new Date()): void {
  try { storage.setItem(announcementReadKey(id), now.toISOString()) } catch { /* 못 남기면 다음에 한 번 더 뜬다 */ }
}

/**
 * 이 자리에 지금 띄울 공지. 게시 중 · 이 자리 · 안 읽음 · 가입 뒤 게시만, 오래된 것부터 하나.
 * 가입일이 없으면(게이트 꺼진 개발 서버) 가입일로 거르지 않는다.
 */
export function nextAnnouncement(
  list: readonly Announcement[],
  place: AnnouncementPlace,
  isRead: (id: string) => boolean,
  signedUpAt: string | null,
): Announcement | null {
  const since = signedUpAt ? Date.parse(signedUpAt) : Number.NEGATIVE_INFINITY
  const candidates = list.filter((item) => item.status === 'published'
    && item.place === place
    && item.publishedAt !== null
    && Date.parse(item.publishedAt) >= since
    && item.slides.length > 0
    && !isRead(item.id))
  candidates.sort((a, b) => Date.parse(a.publishedAt!) - Date.parse(b.publishedAt!))
  return candidates[0] ?? null
}

/** 서버 줄 → 앱 모양. 모르는 자리 · 깨진 장은 버린다. */
export interface AnnouncementRow {
  id: string
  title: string
  place: string
  slides: unknown
  status: AnnouncementStatus
  published_at: string | null
  created_at: string
  updated_at: string
}

export function announcementOf(row: AnnouncementRow): Announcement | null {
  if (!isAnnouncementPlace(row.place)) return null
  const slides = Array.isArray(row.slides)
    ? row.slides.filter((slide): slide is AnnouncementSlide => !!slide && typeof slide === 'object'
      && typeof slide.title === 'string' && typeof slide.body === 'string' && typeof slide.image === 'string')
    : []
  return {
    id: row.id, title: row.title, place: row.place, slides, status: row.status,
    publishedAt: row.published_at, createdAt: row.created_at, updatedAt: row.updated_at,
  }
}
