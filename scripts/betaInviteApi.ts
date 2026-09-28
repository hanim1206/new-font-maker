import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import { loadEnv } from 'vite'
import type { Plugin } from 'vite'
import { isDrawableName } from '../src-next/betaWelcome'
import { BETA_CODE_FILE, betaInviteEnvOf, createBetaInvites } from './betaInvites'
import type { BetaInvite, BetaIssueMode } from './betaInvites'

/**
 * 로컬 관리자 화면(`/admin`)이 부르는 발급 API. 개발 서버에만 붙는다(`apply: 'serve'`) — 배포 빌드에는 없다.
 *
 * `service_role` 키로 계정을 만드는 창구라 세 겹으로 닫는다.
 * - 이 맥에서 온 요청만(루프백). 개발 서버가 네트워크에 열려 있어도(`host: true`) 같은 와이파이 폰은 못 쓴다.
 * - 전용 헤더가 있어야 한다. 다른 사이트가 브라우저로 몰래 보내면 CORS 사전 요청에서 막힌다.
 * - 보낸 곳(Origin)이 있으면 이 서버여야 한다.
 */

export const BETA_INVITE_API = '/api/beta-invites'
export const BETA_INVITE_HEADER = 'x-beta-admin'

/** 초대 표 한 번에 발급하는 최대 인원 · 메모 길이. */
const BATCH_MAX = 30
const MEMO_MAX_LENGTH = 200

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])

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
    if (raw.length > 10_000) throw new Error('요청이 너무 큽니다.')
  }
  return JSON.parse(raw || '{}')
}

/** 막을 이유가 있으면 그 문장, 없으면 null. */
export function rejectReasonOf(request: Pick<IncomingMessage, 'headers'> & { socket: { remoteAddress?: string } }): string | null {
  if (!LOOPBACK.has(request.socket.remoteAddress ?? '')) return '이 맥의 localhost 주소로 열어 주세요.'
  if (request.headers[BETA_INVITE_HEADER] !== '1') return '관리자 화면에서만 부를 수 있습니다.'
  const origin = request.headers.origin
  if (origin && new URL(origin).host !== request.headers.host) return '다른 곳에서 온 요청입니다.'
  return null
}

export function betaInviteApiPlugin(root: string): Plugin {
  let mode = 'development'
  const service = () => createBetaInvites(betaInviteEnvOf(loadEnv(mode, root, '')), path.join(root, BETA_CODE_FILE))

  return {
    name: 'beta-invite-api',
    apply: 'serve',
    configResolved(config) { mode = config.mode },
    configureServer(server) {
      server.middlewares.use(BETA_INVITE_API, async (request, response) => {
        const rejected = rejectReasonOf(request)
        if (rejected) return send(response, 403, { error: rejected })
        try {
          if (request.method === 'GET') return send(response, 200, { accounts: await service().list() })
          if (request.method === 'PATCH') {
            const { email, suspended } = await readJson(request) as { email?: string; suspended?: boolean }
            if (!email || typeof suspended !== 'boolean') return send(response, 400, { error: '정지할 계정이 없습니다.' })
            await service().setSuspended(email, suspended)
            return send(response, 200, { email, suspended })
          }
          if (request.method === 'DELETE') {
            const { email } = await readJson(request) as { email?: string }
            if (!email) return send(response, 400, { error: '지울 계정이 없습니다.' })
            await service().remove(email)
            return send(response, 200, { email })
          }
          if (request.method !== 'POST') return send(response, 405, { error: 'GET · POST · PATCH · DELETE만 받습니다.' })

          const body = await readJson(request) as { mode?: BetaIssueMode; nickname?: string; rows?: { nickname?: string; memo?: string }[] }
          // 여러 명 한 번에(초대 표). 한 명이 틀려도 아무도 만들지 않는다.
          if (body.mode === 'add' && Array.isArray(body.rows)) {
            const rows = body.rows.map((row) => ({ nickname: row.nickname?.trim() ?? '', memo: (row.memo ?? '').trim().slice(0, MEMO_MAX_LENGTH) }))
            if (rows.length === 0 || rows.length > BATCH_MAX) return send(response, 400, { error: `한 번에 1~${BATCH_MAX}명까지 발급합니다.` })
            const wrong = rows.find((row) => !isDrawableName(row.nickname))
            if (wrong) return send(response, 400, { error: `닉네임은 한글 1~6자로 넣어 주세요: ${wrong.nickname || '(빈 칸)'}` })
            const names = rows.map((row) => row.nickname)
            const twice = names.find((name, index) => names.indexOf(name) !== index)
            if (twice) return send(response, 400, { error: `같은 닉네임이 두 번 있습니다: ${twice}` })
            const batch = await service().issue('add', names, undefined, Object.fromEntries(rows.map((row) => [row.nickname, row.memo])))
            return send(response, 200, { invites: batch })
          }
          const nickname = body.nickname?.trim() ?? ''
          if (body.mode !== 'add' && body.mode !== 'reissue') return send(response, 400, { error: '발급 방식이 틀렸습니다.' })
          if (body.mode === 'add' && !isDrawableName(nickname)) return send(response, 400, { error: '닉네임은 한글 1~6자로 넣어 주세요.' })
          if (!nickname) return send(response, 400, { error: '닉네임이 없습니다.' })
          const [invite] = await service().issue(body.mode, [nickname])
          return send(response, 200, { invite })
        } catch (error) {
          const issued = (error as { issued?: BetaInvite[] }).issued ?? []
          return send(response, 500, { error: error instanceof Error ? error.message : String(error), invite: issued[0], invites: issued })
        }
      })
    },
  }
}
