import type { IncomingMessage, ServerResponse } from 'node:http'
import { loadEnv } from 'vite'
import { sharedEnvDir } from './sharedCheckoutPath'
import type { Plugin } from 'vite'
import { announcementDraftProblem } from '../src-next/announcements'
import type { AnnouncementDraft, AnnouncementStatus } from '../src-next/announcements'
import { rejectReasonOf } from './betaInviteApi'
import { createAnnouncementAdmin } from './announcementAdmin'
import { feedbackAdminEnvOf } from './feedbackAdmin'

/**
 * 로컬 관리자 화면(`/admin/announcements`)이 부르는 공지 API. 개발 서버에만 붙는다(`apply: 'serve'`).
 * 문지기는 발급 API와 같다 — 이 맥 · 전용 헤더 · 같은 출처(`rejectReasonOf`).
 *
 * - `GET /api/announcements` 전부
 * - `POST` `{ draft }` 새 초안 · `PATCH` `{ id, draft }` 고치기 · `PATCH` `{ id, status }` 게시 · 내리기 · `DELETE` `{ id }`
 * - `POST /api/announcements/image` 이미지 바이트(본문 그대로, content-type = 이미지 종류) → `{ url }`
 */

export const ANNOUNCEMENT_ADMIN_API = '/api/announcements'
const IMAGE_MAX_BYTES = 5 * 1024 * 1024
const STATUSES: AnnouncementStatus[] = ['draft', 'published', 'archived']

function send(response: ServerResponse, status: number, body: unknown): void {
  response.statusCode = status
  response.setHeader('content-type', 'application/json; charset=utf-8')
  response.setHeader('cache-control', 'no-store')
  response.end(JSON.stringify(body))
}

async function readBytes(request: IncomingMessage, limit: number): Promise<Buffer> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    size += (chunk as Buffer).length
    if (size > limit) throw new Error('요청이 너무 큽니다.')
    chunks.push(chunk as Buffer)
  }
  return Buffer.concat(chunks)
}

/** Supabase 오류는 Error가 아니라 `{ code, message }`다. 테이블 · 버킷이 없으면 마이그레이션을 알려 준다. */
export function announcementFailureOf(error: unknown): string {
  const { code, message } = (error ?? {}) as { code?: string; message?: string }
  if (code === '42P01' || code === 'PGRST205' || message === 'Bucket not found') {
    return '공지 테이블이나 버킷이 없어요. supabase/migrations/20260929120000_announcements.sql을 먼저 적용해 주세요.'
  }
  return message ?? String(error)
}

export function announcementAdminApiPlugin(root: string): Plugin {
  let mode = 'development'
  const admin = () => createAnnouncementAdmin(feedbackAdminEnvOf(loadEnv(mode, sharedEnvDir(root), '')))

  return {
    name: 'announcement-admin-api',
    apply: 'serve',
    configResolved(config) { mode = config.mode },
    configureServer(server) {
      server.middlewares.use(ANNOUNCEMENT_ADMIN_API, async (request, response) => {
        const rejected = rejectReasonOf(request)
        if (rejected) return send(response, 403, { error: rejected })
        try {
          // connect가 앞 주소를 떼어 준다 — `/image`면 이미지 올리기.
          if ((request.url ?? '/').split('?')[0] === '/image') {
            if (request.method !== 'POST') return send(response, 405, { error: 'POST만 받습니다.' })
            const bytes = await readBytes(request, IMAGE_MAX_BYTES)
            if (!bytes.length) return send(response, 400, { error: '이미지가 비었어요.' })
            return send(response, 200, { url: await admin().uploadImage(bytes, request.headers['content-type'] ?? '') })
          }
          if (request.method === 'GET') return send(response, 200, { announcements: await admin().list() })
          const payload = JSON.parse((await readBytes(request, 100_000)).toString('utf8') || '{}') as { id?: string; draft?: AnnouncementDraft; status?: AnnouncementStatus }
          if (request.method === 'DELETE') {
            if (!payload.id) return send(response, 400, { error: '공지가 없습니다.' })
            await admin().remove(payload.id)
            return send(response, 200, { id: payload.id })
          }
          if (request.method === 'PATCH' && payload.id && payload.status) {
            if (!STATUSES.includes(payload.status)) return send(response, 400, { error: '모르는 상태입니다.' })
            return send(response, 200, { announcement: await admin().setStatus(payload.id, payload.status) })
          }
          if (request.method !== 'POST' && request.method !== 'PATCH') return send(response, 405, { error: 'GET · POST · PATCH · DELETE만 받습니다.' })
          if (!payload.draft) return send(response, 400, { error: '공지 내용이 없습니다.' })
          const problem = announcementDraftProblem(payload.draft)
          if (problem) return send(response, 400, { error: problem })
          if (request.method === 'POST') return send(response, 200, { announcement: await admin().create(payload.draft) })
          if (!payload.id) return send(response, 400, { error: '공지가 없습니다.' })
          return send(response, 200, { announcement: await admin().update(payload.id, payload.draft) })
        } catch (error) {
          return send(response, 500, { error: announcementFailureOf(error) })
        }
      })
    },
  }
}
