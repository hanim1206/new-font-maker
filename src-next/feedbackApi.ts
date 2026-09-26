import { supabase } from '../src/lib/supabase'
import { authGateMode } from './betaAuth'
import type { FeedbackContext, FeedbackMessage } from './feedback'

/**
 * `feedback_messages` 서버 호출(친구 쪽). RLS가 내 줄만 돌려주고, 내 이름(friend)으로만 쓰게 한다.
 * 게이트가 꺼진 개발 서버에서는 같은 함수가 localStorage 한 키를 본다 — e2e도 이 길이다.
 * 한임 답장은 여기 없다. 로컬 관리자 API(`scripts/feedbackAdminApi.ts`)가 쓴다.
 */

const TABLE = 'feedback_messages'
export const LOCAL_FEEDBACK_KEY = 'font-maker-local-feedback-v1'
const isLocal = () => authGateMode() === 'off'

export type FeedbackResult<T> = { ok: true; value: T } | { ok: false; message: string }

interface Row { id: string; thread_id: string; author: 'friend' | 'hanim'; body: string; context: FeedbackContext | null; created_at: string; read_at: string | null }

const messageOf = (row: Row): FeedbackMessage => ({
  id: row.id, threadId: row.thread_id, author: row.author, body: row.body, context: row.context, createdAt: row.created_at, readAt: row.read_at,
})

function readLocal(): FeedbackMessage[] {
  try {
    const value = JSON.parse(localStorage.getItem(LOCAL_FEEDBACK_KEY) ?? '[]') as unknown
    return Array.isArray(value) ? value as FeedbackMessage[] : []
  } catch { return [] }
}

export async function listMyFeedback(me: string): Promise<FeedbackResult<FeedbackMessage[]>> {
  if (isLocal()) return { ok: true, value: readLocal() }
  const { data, error } = await supabase.from(TABLE)
    .select('id, thread_id, author, body, context, created_at, read_at')
    .eq('user_id', me)
    .order('created_at', { ascending: true })
  if (error) return { ok: false, message: error.message }
  return { ok: true, value: (data as Row[] ?? []).map(messageOf) }
}

/** 새 대화면 `threadId`를 비운다 — 첫 메시지 id가 곧 대화 id. */
export async function sendFeedback(me: string, body: string, context: FeedbackContext, threadId?: string): Promise<FeedbackResult<FeedbackMessage>> {
  const id = crypto.randomUUID()
  const thread = threadId ?? id
  if (isLocal()) {
    const message: FeedbackMessage = { id, threadId: thread, author: 'friend', body, context, createdAt: new Date().toISOString(), readAt: null }
    try { localStorage.setItem(LOCAL_FEEDBACK_KEY, JSON.stringify([...readLocal(), message])) } catch { return { ok: false, message: '이 기기에 적지 못했어요.' } }
    return { ok: true, value: message }
  }
  const { data, error } = await supabase.from(TABLE)
    .insert({ id, thread_id: thread, user_id: me, author: 'friend', body, context })
    .select('id, thread_id, author, body, context, created_at, read_at')
    .single()
  if (error) return { ok: false, message: error.message }
  return { ok: true, value: messageOf(data as Row) }
}
