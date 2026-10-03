import { execSync } from 'node:child_process'
import { defineConfig, devices } from '@playwright/test'
import { acquireE2eLock } from './scripts/e2e-lock.mjs'
import { listener } from './scripts/worktree-port.mjs'

// 같은 워크트리의 e2e는 차례로 돈다(서버 · 결과 폴더를 같이 쓴다). 워커와 `--list`는 잠그지 않는다.
if (!process.env.TEST_WORKER_INDEX && !process.argv.includes('--list')) acquireE2eLock()

// 워크트리마다 고정 포트(`scripts/worktree-port.mjs`). 다른 워크트리 서버를 빌려 쓰지 않게 한다.
// 워커는 설정을 다시 읽으므로 처음 잰 번호를 환경 변수로 물려준다(워커 안에선 스크립트가 빈 값을 낸다).
const port = Number(process.env.E2E_PORT || execSync('node scripts/worktree-port.mjs', { encoding: 'utf8' }).trim())
process.env.E2E_PORT = String(port)
const origin = `http://127.0.0.1:${port}`

// 떠 있는 서버를 다시 쓰기 전에 이 워크트리에서 띄운 것인지 본다. 다른 폴더 서버면 그 코드로 테스트하게 되니 멈춘다.
if (!process.env.TEST_WORKER_INDEX) {
  const root = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim()
  const on = listener(port)
  if (on && on.cwd !== root) {
    throw new Error(`[e2e] 포트 ${port}를 다른 폴더 서버가 쓰고 있다: ${on.cwd} (pid ${on.pid}). 이 워크트리: ${root}. 그 서버를 끄거나 셸의 E2E_PORT를 지운다.`)
  }
}

export default defineConfig({
  testDir: './tests/e2e',
  // 실험실 스펙은 넓은 회귀에서 뺀다(실험실은 타입 검사 + 스크린샷이 규칙). 돌리려면 `E2E_LABS=1`.
  testIgnore: process.env.E2E_LABS ? [] : ['**/*-lab.spec.ts', '**/admin-labs.spec.ts'],
  fullyParallel: false,
  reporter: 'line',
  use: {
    baseURL: origin,
    ...devices['iPhone 13'],
    browserName: 'chromium',
    channel: 'chrome',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    // 로그인 게이트를 끈 개발 서버(`dev:nogate`). 확인용으로 직접 띄울 때도 같은 명령을 쓴다.
    command: `npm run dev:nogate -- --port ${port}`,
    url: `${origin}/dashboard`,
    // 같은 워크트리의 확인용 서버가 이미 떠 있으면 그대로 쓴다.
    reuseExistingServer: true,
    // 로그인 게이트를 끈다. `.env`에 Supabase 설정이 있어도 e2e는 편집 화면으로 바로 들어간다.
    env: { VITE_AUTH_GATE: 'off' },
  },
})
