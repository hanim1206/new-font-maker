/**
 * 한임에게 의견. 친구 ↔ 한임 대화를 메시지 줄로 두고(`feedback_messages`) 화면은 대화 단위로 묶어 본다.
 * 서버 · 스토어를 가져오지 않는 순수 함수만 — 계정 페이지와 테스트가 같이 쓴다.
 */

export type FeedbackAuthor = 'friend' | 'hanim'

/** 보낸 자리. 한임이 상황을 다시 그려 보는 데 쓴다. */
export interface FeedbackContext { path: string; font: string | null; device: string; build: string }

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
