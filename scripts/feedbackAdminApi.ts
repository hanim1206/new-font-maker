import type { IncomingMessage, ServerResponse } from 'node:http'
import { loadEnv } from 'vite'
import type { Plugin } from 'vite'
import { rejectReasonOf } from './betaInviteApi'
import { createFeedbackAdmin, feedbackAdminEnvOf, REPLY_MAX_LENGTH } from './feedbackAdmin'

/**
 * 로컬 관리자 화면(`/admin` 의견 탭)이 부르는 의견 API. 개발 서버에만 붙는다(`apply: 'serve'`).
 * 문지기는 발급 API와 같다 — 이 맥 · 전용 헤더 · 같은 출처(`rejectReasonOf`).
 */

export const FEEDBACK_ADMIN_API = '/api/feedback'

function send(response: ServerResponse, status: number, body: unknown): void {
  response.statusCode = status
  response.setHeader('content-type', 'application/json; charset=utf-8')
  response.setHeader('cache-control', 'no-store')
  response.end(JSON.stringify(body))
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  let raw = ''
  for await (const chunk of request) {
    raw += chunk
    if (raw.length > 20_000) throw new Error('요청이 너무 큽니다.')
  }
  return JSON.parse(raw || '{}')
}

/** Supabase 오류는 Error가 아니라 `{ code, message }`다. 테이블이 없으면 마이그레이션을 알려 준다. */
export function failureOf(error: unknown): string {
  const { code, message } = (error ?? {}) as { code?: string; message?: string }
  if (code === '42P01' || code === 'PGRST205') return '의견 테이블이 없어요. supabase/migrations/20260927120000_feedback_messages.sql을 먼저 적용해 주세요.'
  return message ?? String(error)
}

export function feedbackAdminApiPlugin(root: string): Plugin {
  let mode = 'development'
  const admin = () => createFeedbackAdmin(feedbackAdminEnvOf(loadEnv(mode, root, '')))

  return {
    name: 'feedback-admin-api',
    apply: 'serve',
    configResolved(config) { mode = config.mode },
    configureServer(server) {
      server.middlewares.use(FEEDBACK_ADMIN_API, async (request, response) => {
        const rejected = rejectReasonOf(request)
        if (rejected) return send(response, 403, { error: rejected })
        try {
          if (request.method === 'GET') return send(response, 200, await admin().list())
          const { threadId, body } = await readJson(request) as { threadId?: string; body?: string }
          if (!threadId) return send(response, 400, { error: '대화가 없습니다.' })
          if (request.method === 'PATCH') {
            await admin().markRead(threadId)
            return send(response, 200, { threadId })
          }
          if (request.method !== 'POST') return send(response, 405, { error: 'GET · POST · PATCH만 받습니다.' })
          const text = body?.trim() ?? ''
          if (!text || text.length > REPLY_MAX_LENGTH) return send(response, 400, { error: `답장은 1~${REPLY_MAX_LENGTH}자로 써 주세요.` })
          await admin().reply(threadId, text)
          return send(response, 200, { threadId })
        } catch (error) {
          return send(response, 500, { error: failureOf(error) })
        }
      })
    },
  }
}
