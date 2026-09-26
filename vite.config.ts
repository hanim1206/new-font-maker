import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'
import { notoCorpusApiPlugin } from './scripts/reference-lab/notoCorpusApi'
import { notoPresetApiPlugin } from './scripts/reference-lab/notoPresetApi'
import { betaInviteApiPlugin } from './scripts/betaInviteApi'
import { feedbackAdminApiPlugin } from './scripts/feedbackAdminApi'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    notoCorpusApiPlugin(fileURLToPath(new URL('./.reference-fonts/guide-corpus', import.meta.url))),
    notoPresetApiPlugin(fileURLToPath(new URL('./.reference-fonts/guide-corpus', import.meta.url))),
    // 로컬 관리자 화면(`/admin`)의 베타 계정 발급. 개발 서버에만 붙는다.
    betaInviteApiPlugin(fileURLToPath(new URL('.', import.meta.url))),
    // 같은 화면의 의견 탭(한임 답장). 개발 서버에만 붙는다.
    feedbackAdminApiPlugin(fileURLToPath(new URL('.', import.meta.url))),
    VitePWA({
      // 편집 중에 저절로 바뀌지 않게. 새 버전은 알림(`appUpdate.ts`) 뒤 사용자가 새로고침한다.
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
  server: {
    host: true, // 네트워크에서 접근 가능하도록 설정
    port: 5173, // 기본 포트 (필요시 변경 가능)
    proxy: {
      '/api/reference': {
        target: 'http://127.0.0.1:8765',
        changeOrigin: false,
      },
    },
  },
})
