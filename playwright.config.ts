import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  reporter: 'line',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    ...devices['iPhone 13'],
    browserName: 'chromium',
    channel: 'chrome',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173/editor-v2',
    reuseExistingServer: true,
    // 로그인 게이트를 끈다. `.env`에 Supabase 설정이 있어도 e2e는 편집 화면으로 바로 들어간다.
    env: { VITE_AUTH_GATE: 'off' },
  },
})
