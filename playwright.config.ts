import { execSync } from 'node:child_process'
import { defineConfig, devices } from '@playwright/test'

// 워크트리마다 고정 포트(`scripts/worktree-port.mjs`). 다른 워크트리 서버를 빌려 쓰지 않게 한다.
// 워커는 설정을 다시 읽으므로 처음 잰 번호를 환경 변수로 물려준다(워커 안에선 스크립트가 빈 값을 낸다).
const port = Number(process.env.E2E_PORT || execSync('node scripts/worktree-port.mjs', { encoding: 'utf8' }).trim())
process.env.E2E_PORT = String(port)
const origin = `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: './tests/e2e',
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
