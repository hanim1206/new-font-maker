import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { webcrypto } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import type { User } from '@supabase/supabase-js'
import { betaCredentialsOf, betaInviteMessage, DEFAULT_BETA_EMAIL_DOMAIN, generateBetaCode } from '../src-next/betaCode'

/**
 * 베타 친구 계정을 미리 만든다. 이 맥에서만 돌린다 — `service_role` 키를 쓰기 때문이다.
 *
 *   npm run beta:accounts -- add 민지 준호     친구마다 계정 + 코드 + 카톡 메시지
 *   npm run beta:accounts -- reissue 민지      코드를 잊었을 때. 같은 계정, 새 코드(폰트는 그대로)
 *   npm run beta:accounts -- list              지금 베타 계정
 *
 * `.env`에서 읽는 값: `VITE_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `BETA_APP_URL`,
 * 있으면 `BETA_INSTALL_GUIDE_URL`, `VITE_BETA_EMAIL_DOMAIN`.
 * 결과(코드와 메시지)는 `beta-accounts/`에 쓴다. 이 폴더와 `.env`는 커밋하지 않는다.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUTPUT_DIRECTORY = path.join(ROOT, 'beta-accounts')

function loadEnv(): void {
  const file = path.join(ROOT, '.env')
  if (existsSync(file)) process.loadEnvFile(file)
}

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`.env에 ${name}이(가) 없습니다.`)
  return value
}

const randomBytes = (length: number) => webcrypto.getRandomValues(new Uint8Array(length))

async function allUsers(admin: ReturnType<typeof createClient>['auth']['admin']): Promise<User[]> {
  const users: User[] = []
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.listUsers({ page, perPage: 1000 })
    if (error) throw error
    users.push(...data.users)
    if (data.users.length < 1000) return users
  }
}

const nicknameOf = (user: User): string | undefined => user.user_metadata?.nickname
const isBeta = (user: User, domain: string) => user.email?.endsWith(`@${domain}`) ?? false

/** 앞 네 글자(계정 이름)가 겹치지 않는 코드. 31^4 ≈ 92만 가지라 거의 한 번에 된다. */
function freshCode(takenEmails: Set<string>, domain: string): { code: string; email: string; password: string } {
  for (;;) {
    const code = generateBetaCode(randomBytes)
    const credentials = betaCredentialsOf(code, domain)!
    if (!takenEmails.has(credentials.email)) return { code, ...credentials }
  }
}

async function main(): Promise<void> {
  loadEnv()
  const [command, ...nicknames] = process.argv.slice(2)
  const domain = process.env.VITE_BETA_EMAIL_DOMAIN || DEFAULT_BETA_EMAIL_DOMAIN
  const supabase = createClient(required('VITE_SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const admin = supabase.auth.admin
  const users = await allUsers(admin)
  const betaUsers = users.filter((user) => isBeta(user, domain))

  if (command === 'list') {
    if (betaUsers.length === 0) console.log('베타 계정이 없습니다.')
    for (const user of betaUsers) console.log(`${nicknameOf(user) ?? '(닉네임 없음)'}\t${user.email}\t마지막 로그인 ${user.last_sign_in_at ?? '없음'}`)
    return
  }

  if ((command !== 'add' && command !== 'reissue') || nicknames.length === 0) {
    console.error('쓰는 법: npm run beta:accounts -- add <닉네임...> | reissue <닉네임...> | list')
    process.exitCode = 1
    return
  }

  const appUrl = required('BETA_APP_URL')
  const installGuideUrl = process.env.BETA_INSTALL_GUIDE_URL
  const takenEmails = new Set(users.map((user) => user.email).filter((email): email is string => Boolean(email)))
  const issued: Array<{ nickname: string; code: string }> = []

  // 중간에 실패해도 이미 만든 계정의 코드는 파일로 남긴다.
  try {
    await issueAll()
  } finally {
    if (issued.length > 0) await writeMessages()
  }

  async function issueAll(): Promise<void> {
    for (const nickname of nicknames) {
      const existing = betaUsers.find((user) => nicknameOf(user) === nickname)
      if (command === 'add' && existing) throw new Error(`이미 있는 닉네임입니다: ${nickname}. 코드를 새로 주려면 reissue를 쓰세요.`)
      if (command === 'reissue' && !existing) throw new Error(`없는 닉네임입니다: ${nickname}`)

      const { code, email, password } = freshCode(takenEmails, domain)
      const { error } = existing
        ? await admin.updateUserById(existing.id, { email, password, email_confirm: true })
        : await admin.createUser({ email, password, email_confirm: true, user_metadata: { nickname, beta: true } })
      if (error) throw new Error(`${nickname}: ${error.message}`)
      takenEmails.add(email)
      issued.push({ nickname, code })
      console.log(`${command === 'add' ? '만듦' : '새 코드'}\t${nickname}\t${code}`)
    }
  }

  async function writeMessages(): Promise<void> {
    if (!installGuideUrl) console.warn('BETA_INSTALL_GUIDE_URL이 없어 메시지에서 설치 안내 줄을 뺐습니다.')
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')
    const body = issued
      .map(({ nickname, code }) => `## ${nickname}\n\n\`\`\`\n${betaInviteMessage({ nickname, code, appUrl, installGuideUrl })}\n\`\`\`\n`)
      .join('\n')
    await mkdir(OUTPUT_DIRECTORY, { recursive: true })
    const file = path.join(OUTPUT_DIRECTORY, `${stamp}_${command}.md`)
    await writeFile(file, `# 베타 초대 ${stamp}\n\n카톡으로 친구마다 아래 블록 하나씩 보낸다. 이 파일은 커밋하지 않는다.\n\n${body}`)
    console.log(`메시지: ${path.relative(ROOT, file)}`)
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
