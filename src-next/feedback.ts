/**
 * 한임에게 의견. 친구 ↔ 한임 대화를 메시지 줄로 두고(`feedback_messages`) 화면은 대화 단위로 묶어 본다.
 * 서버 · 스토어를 가져오지 않는 순수 함수만 — 계정 페이지와 테스트가 같이 쓴다.
 */

export type FeedbackAuthor = 'friend' | 'hanim'

/** 제보 태그. 친구가 판에서 하나 고른다(안 골라도 된다). 글자색으로 갈래를 바로 알아보게. */
export type ReportTag = 'broken' | 'odd' | 'wish' | 'praise' | 'other'
export const REPORT_TAGS: { key: ReportTag; label: string }[] = [
  { key: 'broken', label: '안 돼요' },
  { key: 'odd', label: '이상해 보여요' },
  { key: 'wish', label: '이러면 좋겠어요' },
  { key: 'praise', label: '잘했어요' },
  { key: 'other', label: '기타' },
]
export const REPORT_TAG_LABEL = Object.fromEntries(REPORT_TAGS.map((tag) => [tag.key, tag.label])) as Record<ReportTag, string>

/**
 * 보낸 자리. 한임이 상황을 다시 그려 보는 데 쓴다.
 * `fontId` · `screen` · `tag`는 09-28부터 — 그 전 의견에는 없다. `fontId`는 그 친구의 어느 폰트인지(재현 화면이 연다).
 */
export interface FeedbackContext {
  path: string
  font: string | null
  device: string
  build: string
  fontId?: string | null
  /** 화면 이름(`screenOf`). */
  screen?: string
  tag?: ReportTag | null
}

const JAMO_SCREEN: Record<string, string> = { choseong: '초성', jungseong: '중성', jongseong: '종성' }

/** 경로 → 친구가 읽는 화면 이름. 제보 판 맨 위 태그와 관리자 목록에 쓴다. */
export function screenOf(pathname: string): string {
  const path = pathname.replace(/\/+$/, '') || '/'
  if (path === '/') return '문장 보정'
  if (path === '/dashboard' || path === '/fonts') return '대시보드'
  if (path.startsWith('/dashboard/')) return `고칠 ${JAMO_SCREEN[path.split('/')[2]] ?? '자소'}`
  if (path === '/workspace/font/export') return '폰트 완성'
  if (path === '/workspace/font') return '스타일'
  if (path.startsWith('/workspace/review')) return '검수'
  if (path.startsWith('/workspace/jamo')) return '자소 편집'
  if (path.startsWith('/workspace')) return '편집'
  if (path.startsWith('/account')) return '마이페이지'
  return path
}

export interface FeedbackMessage {
  id: string
  threadId: string
  author: FeedbackAuthor
  body: string
  context: FeedbackContext | null
  createdAt: string
  readAt: string | null
}

/** `replied`: 한임 답이 있다. `read`: 한임이 읽기만 했다. `sent`: 아직. */
export type FeedbackStatus = 'replied' | 'read' | 'sent'

export interface FeedbackThread {
  id: string
  /** 첫 메시지. 목록 제목. */
  first: FeedbackMessage
  messages: FeedbackMessage[]
  status: FeedbackStatus
  /** 한임의 마지막 답 때. 없으면 null. */
  lastReplyAt: string | null
  /** 마지막 메시지 때. 목록은 이 순서(최근 위). */
  updatedAt: string
}

export const FEEDBACK_MAX_LENGTH = 2000

/** 메시지 줄 → 대화. 대화 안은 오래된 순, 대화끼리는 최근 순. 첫 메시지를 못 받은 대화는 뺀다. */
export function threadsOf(messages: readonly FeedbackMessage[]): FeedbackThread[] {
  const byThread = new Map<string, FeedbackMessage[]>()
  for (const message of messages) byThread.set(message.threadId, [...(byThread.get(message.threadId) ?? []), message])
  const threads: FeedbackThread[] = []
  for (const [id, list] of byThread) {
    const sorted = [...list].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    const first = sorted.find((message) => message.id === id)
    if (!first) continue
    const replies = sorted.filter((message) => message.author === 'hanim')
    const lastReplyAt = replies.at(-1)?.createdAt ?? null
    const status: FeedbackStatus = replies.length > 0 ? 'replied' : sorted.some((message) => message.readAt) ? 'read' : 'sent'
    threads.push({ id, first, messages: sorted, status, lastReplyAt, updatedAt: sorted.at(-1)!.createdAt })
  }
  return threads.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

/** 대화 id → 마지막으로 연 때(ISO). 이 기기에만 둔다(플랜 미결정 1 — localStorage). */
export type FeedbackSeen = Record<string, string>

/** 안 본 한임 답이 있는 대화. */
export function hasUnseenReply(thread: FeedbackThread, seen: FeedbackSeen): boolean {
  if (!thread.lastReplyAt) return false
  const at = seen[thread.id]
  return !at || at < thread.lastReplyAt
}

export const FEEDBACK_SEEN_KEY = 'font-maker-feedback-seen-v1'

export function readSeen(storage: Pick<Storage, 'getItem'>, me: string): FeedbackSeen {
  try {
    const all = JSON.parse(storage.getItem(FEEDBACK_SEEN_KEY) ?? '{}') as Record<string, FeedbackSeen>
    const mine = all[me]
    return mine && typeof mine === 'object' ? mine : {}
  } catch { return {} }
}

export function markSeen(storage: Pick<Storage, 'getItem' | 'setItem'>, me: string, threadId: string, at: string): void {
  try {
    const all = JSON.parse(storage.getItem(FEEDBACK_SEEN_KEY) ?? '{}') as Record<string, FeedbackSeen>
    all[me] = { ...(all[me] ?? {}), [threadId]: at }
    storage.setItem(FEEDBACK_SEEN_KEY, JSON.stringify(all))
  } catch { /* 못 적으면 빨간 점이 남을 뿐 */ }
}

/** 기기 이름을 짧게. 전체 UA는 길어서 한임 화면에 안 맞는다. */
export function deviceOf(userAgent: string): string {
  const os = /iPhone/.test(userAgent) ? 'iPhone'
    : /iPad/.test(userAgent) ? 'iPad'
      : /Android/.test(userAgent) ? 'Android'
        : /Mac OS X/.test(userAgent) ? 'Mac'
          : /Windows/.test(userAgent) ? 'Windows' : '기타'
  const browser = /KAKAOTALK/i.test(userAgent) ? '카톡'
    : /SamsungBrowser/.test(userAgent) ? '삼성 인터넷'
      : /Edg\//.test(userAgent) ? 'Edge'
        : /CriOS|Chrome\//.test(userAgent) ? 'Chrome'
          : /Firefox|FxiOS/.test(userAgent) ? 'Firefox'
            : /Safari/.test(userAgent) ? 'Safari' : '브라우저'
  return `${os} · ${browser}`
}

export const STATUS_LABEL: Record<FeedbackStatus, string> = { replied: '답장 있어요', read: '읽었어요', sent: '보냈어요' }

/** 목록 · 말풍선 아래 때. 오늘 · 어제 · 9월 26일, `withTime`이면 뒤에 오후 11:40. */
export function whenText(iso: string, now = new Date(), withTime = false): string {
  const at = new Date(iso)
  const day = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  const days = Math.round((day(now) - day(at)) / 86_400_000)
  const date = days <= 0 ? '오늘' : days === 1 ? '어제' : `${at.getMonth() + 1}월 ${at.getDate()}일`
  if (!withTime) return date
  return `${date} ${at.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' })}`
}
