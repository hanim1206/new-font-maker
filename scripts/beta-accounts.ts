import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { BETA_CODE_FILE, betaInviteEnvOf, createBetaInvites } from './betaInvites'
import type { BetaInvite } from './betaInvites'

/**
 * 베타 친구 계정을 미리 만든다. 이 맥에서만 돌린다 — `service_role` 키를 쓰기 때문이다.
 * 같은 일을 화면으로 하려면 개발 서버의 `/admin`(`betaInviteApi.ts`).
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

async function main(): Promise<void> {
  const envFile = path.join(ROOT, '.env')
  if (existsSync(envFile)) process.loadEnvFile(envFile)
  const [command, ...nicknames] = process.argv.slice(2)

  if (command === 'list') {
    const env = betaInviteEnvOf({ BETA_APP_URL: 'http://unused.invalid', ...process.env })
    const accounts = await createBetaInvites(env, path.join(ROOT, BETA_CODE_FILE)).list()
    if (accounts.length === 0) console.log('베타 계정이 없습니다.')
    for (const account of accounts) console.log(`${account.nickname ?? '(닉네임 없음)'}\t${account.email}\t${account.invite?.code ?? '(코드 모름)'}\t마지막 로그인 ${account.lastSignInAt ?? '없음'}`)
    return
  }

  if ((command !== 'add' && command !== 'reissue') || nicknames.length === 0) {
    console.error('쓰는 법: npm run beta:accounts -- add <닉네임...> | reissue <닉네임...> | list')
    process.exitCode = 1
    return
  }

  const env = betaInviteEnvOf(process.env)
  let issued: BetaInvite[] = []
  // 중간에 실패해도 이미 만든 계정의 코드는 파일로 남긴다.
  try {
    issued = await createBetaInvites(env, path.join(ROOT, BETA_CODE_FILE)).issue(command, nicknames, ({ nickname, code }) => {
      console.log(`${command === 'add' ? '만듦' : '새 코드'}\t${nickname}\t${code}`)
    })
  } catch (error) {
    issued = (error as { issued?: BetaInvite[] }).issued ?? []
    throw error
  } finally {
    if (issued.length > 0) await writeMessages(issued, command, !env.installGuideUrl)
  }
}

async function writeMessages(issued: BetaInvite[], command: string, missingGuide: boolean): Promise<void> {
  if (missingGuide) console.warn('BETA_INSTALL_GUIDE_URL이 없어 메시지에서 설치 안내 줄을 뺐습니다.')
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')
  const body = issued.map(({ nickname, message }) => `## ${nickname}\n\n\`\`\`\n${message}\n\`\`\`\n`).join('\n')
  await mkdir(OUTPUT_DIRECTORY, { recursive: true })
  const file = path.join(OUTPUT_DIRECTORY, `${stamp}_${command}.md`)
  await writeFile(file, `# 베타 초대 ${stamp}\n\n카톡으로 친구마다 아래 블록 하나씩 보낸다. 이 파일은 커밋하지 않는다.\n\n${body}`)
  console.log(`메시지: ${path.relative(ROOT, file)}`)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
