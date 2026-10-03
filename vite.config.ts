/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'
import { notoCorpusApiPlugin } from './scripts/reference-lab/notoCorpusApi'
import { notoPresetApiPlugin } from './scripts/reference-lab/notoPresetApi'
import { betaInviteApiPlugin } from './scripts/betaInviteApi'
import { feedbackAdminApiPlugin } from './scripts/feedbackAdminApi'
import { styleLibraryApiPlugin } from './scripts/styleLibraryApi'
import { housePresetApiPlugin } from './scripts/housePresetApi'
import { announcementAdminApiPlugin } from './scripts/announcementAdminApi'
import { sharedCheckoutPath } from './scripts/sharedCheckoutPath'
import { spectrumFontApiPlugin } from './scripts/spectrumFontApi'

// git에 없는 Noto 코퍼스. 워크트리에서는 메인 체크아웃 것을 쓴다.
const guideCorpus = sharedCheckoutPath(fileURLToPath(new URL('.', import.meta.url)), '.reference-fonts/guide-corpus')
// 성격 스펙트럼 실험실의 참고 폰트들. 역시 git에 없다.
const referenceFonts = sharedCheckoutPath(fileURLToPath(new URL('.', import.meta.url)), '.reference-fonts')

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    notoCorpusApiPlugin(guideCorpus),
    notoPresetApiPlugin(guideCorpus),
    spectrumFontApiPlugin(referenceFonts),
    // 로컬 관리자 화면(`/admin`)의 베타 계정 발급. 개발 서버에만 붙는다.
    betaInviteApiPlugin(fileURLToPath(new URL('.', import.meta.url))),
    // 같은 화면의 의견 탭(한임 답장). 개발 서버에만 붙는다.
    feedbackAdminApiPlugin(fileURLToPath(new URL('.', import.meta.url))),
    // 관리자 `프리셋` 메뉴가 하우스 레이아웃 파일을 저장한다. 개발 서버에만 붙는다.
    housePresetApiPlugin(fileURLToPath(new URL('.', import.meta.url))),
    // 관리자 `공지` 메뉴(만들기 · 게시 · 이미지 올리기). 개발 서버에만 붙는다.
    announcementAdminApiPlugin(fileURLToPath(new URL('.', import.meta.url))),
    // 스타일가이드 라이브러리(`/style-guide`)가 부품이 쓰이는 곳을 묻는다(읽기만). 개발 서버에만 붙는다.
    styleLibraryApiPlugin(fileURLToPath(new URL('.', import.meta.url))),
    VitePWA({
      // 편집 중에 저절로 바뀌지 않게. 새 버전은 안전한 순간(탭 가림 · 화면 옮김)에 `appUpdate.ts`가 저장 뒤 바꾼다.
      registerType: 'prompt',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
      manifest: {
        name: '한글 폰트 메이커',
        short_name: '한글 폰트 메이커',
        description: '내 손으로 한글 폰트를 만들어 보는 도구',
        theme_color: '#292820',
        background_color: '#f0eee7',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/workspace/jamo',
        icons: [
          {
            src: 'pwa-192x192.svg',
            sizes: '192x192',
            type: 'image/svg+xml',
          },
          {
            src: 'pwa-512x512.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
          },
          {
            src: 'pwa-512x512.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'cdn-fonts',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1년
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src-next', import.meta.url)),
    },
  },
  // 레포 안 워크트리(`.claude/worktrees/*`)의 html · tsconfig를 보면, 다른 세션이 워크트리를 만들 때마다
  // 의존성을 다시 묶어 열린 탭에 React가 두 벌 섞인다(Invalid hook call). 앱 입구만 훑고 워크트리는 안 본다.
  optimizeDeps: {
    entries: ['index.html'],
  },
  server: {
    host: true, // 네트워크에서 접근 가능하도록 설정
    port: 5173, // 기본 포트 (필요시 변경 가능)
    watch: {
      ignored: ['**/.claude/**', '**/.codex/**'],
    },
    proxy: {
      '/api/reference': {
        target: 'http://127.0.0.1:8765',
        changeOrigin: false,
      },
    },
  },
  test: {
    // 레포 안 워크트리(`.claude/worktrees/*`)의 테스트는 다른 브랜치 코드다. 안 빼면 `npm test`가 그것까지 모아
    // 남의 실패가 내 실패로 보이고 몇 배 느려진다(10-03에 1122개 중 934개가 남의 것).
    exclude: ['**/node_modules/**', '**/dist/**', '**/.claude/**', '**/.codex/**'],
  },
})
