import { REPORT_TAG_LABEL } from '../feedback'
import type { FeedbackMessage, FeedbackThread } from '../feedback'

export type AdminMessage = FeedbackMessage & { userId: string }

/** 상태 필터. 새 의견 = 마지막 말이 친구 것이고 안 읽음, 답장 안 함 = 읽기만 하고 답장이 없음. */
export type FeedbackFilterStatus = 'all' | 'pending' | 'replied' | 'unreplied'
export const FEEDBACK_FILTER_LABEL: Record<FeedbackFilterStatus, string> = { all: '전체', pending: '새 의견', replied: '답장함', unreplied: '답장 안 함' }

export interface FeedbackFilter { status: FeedbackFilterStatus; friend: string; query: string }
export const EMPTY_FEEDBACK_FILTER: FeedbackFilter = { status: 'all', friend: 'all', query: '' }

/** 새 의견: 마지막 말이 친구 것이고 아직 안 읽었다. 답장하거나 `읽음만`을 누르면 지난 의견으로 간다. */
export const isPending = (thread: FeedbackThread) => {
  const last = thread.messages.at(-1)!
  return last.author === 'friend' && thread.messages.some((message) => message.author === 'friend' && !message.readAt)
}

export const userOf = (thread: FeedbackThread) => (thread.first as AdminMessage).userId

/** 검색어는 대화 글 · 친구 닉네임 · 보낸 자리(폰트 · 경로 · 화면 이름 · 기기 · 갈래 태그)에서 찾는다. 띄어 쓴 말은 모두 들어 있어야 한다. */
export function matchesFeedback(thread: FeedbackThread, filter: FeedbackFilter, nickname: string | null): boolean {
  if (filter.friend !== 'all' && userOf(thread) !== filter.friend) return false
  if (filter.status === 'pending' && !isPending(thread)) return false
  if (filter.status === 'replied' && thread.status !== 'replied') return false
  if (filter.status === 'unreplied' && (thread.status === 'replied' || isPending(thread))) return false
  const words = filter.query.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const haystack = [
    nickname ?? '',
    ...thread.messages.flatMap((message) => [
      message.body, message.context?.font ?? '', message.context?.path ?? '', message.context?.device ?? '',
      message.context?.screen ?? '', message.context?.tag ? REPORT_TAG_LABEL[message.context.tag] : '',
    ]),
  ].join('\n').toLowerCase()
  return words.every((word) => haystack.includes(word))
}
