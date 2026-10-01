import { createReadStream, existsSync } from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'
import { SPECTRUM_FONT_API, spectrumFontById } from '../src-next/spectrumFonts'

/**
 * 성격 스펙트럼 실험실의 폰트 파일. git에 없는 `.reference-fonts/`에서 목록(`spectrumFonts.ts`)에 있는 것만 내준다.
 * 개발 서버에만 붙는다(`apply: 'serve'`).
 */
export function spectrumFontApiPlugin(fontRoot: string): Plugin {
  return {
    name: 'spectrum-font-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(SPECTRUM_FONT_API, (request, response) => {
        const id = decodeURIComponent((request.url ?? '').replace(/^\//, '').split('?')[0])
        const font = spectrumFontById(id)
        const file = font ? path.join(fontRoot, font.file) : null
        if (!file || !existsSync(file)) {
          response.statusCode = 404
          response.end(font ? `${font.file}가 없습니다. .reference-fonts/에 받아 두세요.` : `모르는 폰트: ${id}`)
          return
        }
        response.setHeader('content-type', 'application/octet-stream')
        response.setHeader('cache-control', 'no-store')
        createReadStream(file).pipe(response)
      })
    },
  }
}
