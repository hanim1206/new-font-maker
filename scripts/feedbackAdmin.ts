import { createClient } from '@supabase/supabase-js'
import type { FeedbackContext, FeedbackMessage } from '../src-next/feedback'

/**
 * 한임 쪽 의견 창구. 로컬 관리자 API(`feedbackAdminApi.ts`)가 쓴다.
 * `service_role` 키로 모든 친구 의견을 읽고, 한임 이름으로 답장하고, 읽음을 적는다 — 이 맥에서만 돈다.
 */

export interface FeedbackAdminEnv { supabaseUrl: string; serviceRoleKey: string }

export function feedbackAdminEnvOf(env: Record<string, string | undefined>): FeedbackAdminEnv {
  const supabaseUrl = env.VITE_SUPABASE_URL
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl) throw new Error('.env에 VITE_SUPABASE_URL이(가) 없습니다.')
  if (!serviceRoleKey) throw new Error('.env에 SUPABASE_SERVICE_ROLE_KEY이(가) 없습니다.')
  return { supabaseUrl, serviceRoleKey }
}

/** 친구 메시지 + 누가 보냈는지. */
export interface AdminFeedbackMessage extends FeedbackMessage { userId: string }

interface Row { id: string; thread_id: string; user_id: string; author: 'friend' | 'hanim'; body: string; context: FeedbackContext | null; created_at: string; read_at: string | null }

const TABLE = 'feedback_messages'
export const REPLY_MAX_LENGTH = 2000

export function createFeedbackAdmin(env: FeedbackAdminEnv) {
  const supabase = createClient(env.supabaseUrl, env.serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })

  /** 모든 의견과 친구 이름(`user_metadata.nickname`). */
  async function list(): Promise<{ messages: AdminFeedbackMessage[]; nicknames: Record<string, string | null> }> {
    const { data, error } = await supabase.from(TABLE).select('*').order('created_at', { ascending: true })
    if (error) throw error
    const messages = (data as Row[]).map((row) => ({
      id: row.id, threadId: row.thread_id, userId: row.user_id, author: row.author, body: row.body, context: row.context, createdAt: row.created_at, readAt: row.read_at,
    }))
    const nicknames: Record<string, string | null> = {}
    for (const userId of new Set(messages.map((message) => message.userId))) {
      const { data: found } = await supabase.auth.admin.getUserById(userId)
      const nickname = found.user?.user_metadata?.nickname
      nicknames[userId] = typeof nickname === 'string' ? nickname : null
    }
    return { messages, nicknames }
  }

  /** 대화 주인을 첫 메시지에서 찾는다. 없는 대화면 던진다. */
  async function ownerOf(threadId: string): Promise<string> {
    const { data, error } = await supabase.from(TABLE).select('user_id').eq('id', threadId).eq('thread_id', threadId).maybeSingle()
    if (error) throw error
    if (!data) throw new Error('없는 대화입니다.')
    return (data as { user_id: string }).user_id
  }

  /** 대화의 친구 메시지를 읽음으로. 이미 읽은 건 그대로. */
  async function markRead(threadId: string): Promise<void> {
    const { error } = await supabase.from(TABLE).update({ read_at: new Date().toISOString() })
      .eq('thread_id', threadId).eq('author', 'friend').is('read_at', null)
    if (error) throw error
  }

  /** 한임 답장. 답하면 읽은 것이기도 하다. */
  async function reply(threadId: string, body: string): Promise<void> {
    const userId = await ownerOf(threadId)
    const { error } = await supabase.from(TABLE).insert({ thread_id: threadId, user_id: userId, author: 'hanim', body })
    if (error) throw error
    await markRead(threadId)
  }

  return { list, reply, markRead }
}
