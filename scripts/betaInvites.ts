import { webcrypto } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import type { User } from '@supabase/supabase-js'
import { betaCredentialsOf, betaInviteLinkOf, betaInviteMessage, DEFAULT_BETA_EMAIL_DOMAIN, generateBetaCode } from '../src-next/betaCode'

/**
 * 베타 친구 계정 발급. CLI(`beta-accounts.ts`)와 로컬 관리자 화면(`betaInviteApi.ts`)이 같이 쓴다.
 * `service_role` 키를 쓰므로 이 맥에서만 돈다 — 브라우저 번들에 들어가면 안 된다.
 *
 * 발급한 코드는 이 맥의 `codeFile`(`beta-accounts/codes.json`, 커밋 안 함)에 남겨 나중에도 다시 복사한다.
 * 코드가 곧 비번이라 DB에는 두지 않는다. 이 파일이 생기기 전에 만든 계정은 코드를 모른다 — `새 코드`로 다시 준다.
 */

/** 발급한 코드를 남기는 파일(레포 기준). `beta-accounts/`는 gitignore. */
export const BETA_CODE_FILE = 'beta-accounts/codes.json'

export interface BetaInviteEnv {
  supabaseUrl: string
  serviceRoleKey: string
  domain: string
  appUrl: string
  installGuideUrl?: string
}

/** `.env` 값 → 발급 설정. 빠진 값은 이름을 담아 던진다. */
export function betaInviteEnvOf(env: Record<string, string | undefined>): BetaInviteEnv {
  const required = (name: string): string => {
    const value = env[name]
    if (!value) throw new Error(`.env에 ${name}이(가) 없습니다.`)
    return value
  }
  return {
    supabaseUrl: required('VITE_SUPABASE_URL'),
    serviceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
    domain: env.VITE_BETA_EMAIL_DOMAIN || DEFAULT_BETA_EMAIL_DOMAIN,
    appUrl: required('BETA_APP_URL'),
    installGuideUrl: env.BETA_INSTALL_GUIDE_URL || undefined,
  }
}

export interface BetaAccount {
  nickname: string | null
  email: string
  createdAt: string
  lastSignInAt: string | null
  /** 이 맥에 남은 코드와 메시지. 모르면 없음. */
  invite?: BetaInvite
}

export interface BetaInvite {
  nickname: string
  code: string
  link: string
  message: string
}

export type BetaIssueMode = 'add' | 'reissue'

const randomBytes = (length: number) => webcrypto.getRandomValues(new Uint8Array(length))
const nicknameOf = (user: User): string | null => user.user_metadata?.nickname ?? null

/** 계정 이메일 → 마지막으로 준 코드. */
type CodeBook = Record<string, { nickname: string; code: string; issuedAt: string }>

export function createBetaInvites(env: BetaInviteEnv, codeFile: string) {
  const supabase = createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const admin = supabase.auth.admin
  const isBeta = (user: User) => user.email?.endsWith(`@${env.domain}`) ?? false

  async function allUsers(): Promise<User[]> {
    const users: User[] = []
    for (let page = 1; ; page += 1) {
      const { data, error } = await admin.listUsers({ page, perPage: 1000 })
      if (error) throw error
      users.push(...data.users)
      if (data.users.length < 1000) return users
    }
  }

  /** 앞 네 글자(계정 이름)가 겹치지 않는 코드. 31^4 ≈ 92만 가지라 거의 한 번에 된다. */
  function freshCode(takenEmails: Set<string>): { code: string; email: string; password: string } {
    for (;;) {
      const code = generateBetaCode(randomBytes)
      const credentials = betaCredentialsOf(code, env.domain)!
      if (!takenEmails.has(credentials.email)) return { code, ...credentials }
    }
  }

  function inviteOf(nickname: string, code: string): BetaInvite {
    return {
      nickname,
      code,
      link: betaInviteLinkOf(env.appUrl, nickname),
      message: betaInviteMessage({ nickname, code, appUrl: env.appUrl, installGuideUrl: env.installGuideUrl }),
    }
  }

  async function readCodes(): Promise<CodeBook> {
    try { return JSON.parse(await readFile(codeFile, 'utf8')) as CodeBook } catch { return {} }
  }

  async function saveCode(email: string, nickname: string, code: string): Promise<void> {
    const book = await readCodes()
    book[email] = { nickname, code, issuedAt: new Date().toISOString() }
    await mkdir(path.dirname(codeFile), { recursive: true })
    await writeFile(codeFile, `${JSON.stringify(book, null, 2)}\n`, { mode: 0o600 })
  }

  /** 지금 베타 계정. 새로 만든 게 위로. 이 맥에 코드가 남아 있으면 메시지까지. */
  async function list(): Promise<BetaAccount[]> {
    const [users, book] = await Promise.all([allUsers(), readCodes()])
    return users
      .filter(isBeta)
      .map((user) => {
        const nickname = nicknameOf(user)
        const saved = book[user.email!]
        return {
          nickname, email: user.email!, createdAt: user.created_at, lastSignInAt: user.last_sign_in_at ?? null,
          invite: saved ? inviteOf(nickname ?? saved.nickname, saved.code) : undefined,
        }
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  /**
   * `add`: 닉네임마다 새 계정 + 코드. `reissue`: 코드를 잊었을 때 같은 계정에 새 코드(폰트는 그대로).
   * 하나씩 만들고, 중간에 실패하면 그때까지 만든 것을 `issued`에 담아 던진다 — 만든 코드를 잃지 않게.
   */
  async function issue(mode: BetaIssueMode, nicknames: string[], onIssued?: (invite: BetaInvite) => void): Promise<BetaInvite[]> {
    const users = await allUsers()
    const betaUsers = users.filter(isBeta)
    const takenEmails = new Set(users.map((user) => user.email).filter((email): email is string => Boolean(email)))
    const issued: BetaInvite[] = []
    try {
      for (const nickname of nicknames) {
        const existing = betaUsers.find((user) => nicknameOf(user) === nickname)
        if (mode === 'add' && existing) throw new Error(`이미 있는 닉네임입니다: ${nickname}. 코드를 새로 주려면 새 코드를 쓰세요.`)
        if (mode === 'reissue' && !existing) throw new Error(`없는 닉네임입니다: ${nickname}`)

        const { code, email, password } = freshCode(takenEmails)
        const { error } = existing
          ? await admin.updateUserById(existing.id, { email, password, email_confirm: true })
          : await admin.createUser({ email, password, email_confirm: true, user_metadata: { nickname, beta: true } })
        if (error) throw new Error(`${nickname}: ${error.message}`)
        takenEmails.add(email)
        await saveCode(email, nickname, code)
        const invite = inviteOf(nickname, code)
        issued.push(invite)
        onIssued?.(invite)
      }
    } catch (error) {
      throw Object.assign(error instanceof Error ? error : new Error(String(error)), { issued })
    }
    return issued
  }

  return { list, issue }
}
