import { describe, expect, it } from 'vitest'
import { productFiles, scan } from './styleGuard'

/**
 * 제품 화면의 스타일 출처는 토큰(`src/index.css`)과 공용 부품(`components/ui`) 하나다.
 * 날 색 · 날 `<button>` · 단계 밖 글자 크기 · 모서리 · 굵기가 생기면 여기서 막힌다. 예외는 그 줄에 `style-guard: allow <이유>`.
 */

/** 아직 못 옮긴 파일. 다른 세션이 고치는 중이라 그 작업이 합쳐진 뒤 옮긴다(플랜 진행 기록). 비면 이 목록을 지운다. */
const PENDING = ['src-next/CalibrationSentenceEditor.tsx', 'src-next/GlyphLayoutEditor.tsx']

describe('스타일 가드', () => {
  it('제품 화면 파일을 import 그래프로 찾는다', () => {
    const files = productFiles().map((file) => file.slice(file.indexOf('src-next/')))
    expect(files).toContain('src-next/App.tsx')
    expect(files).toContain('src-next/DashboardLabPage.tsx')
    expect(files.some((file) => file.startsWith('src-next/admin/'))).toBe(false)
    expect(files).not.toContain('src-next/StyleGuideLabPage.tsx')
  })

  it('날 색 · 날 단추 · 단계 밖 크기가 없다', () => {
    const findings = scan().filter((finding) => !PENDING.includes(finding.file))
    expect(findings.map((finding) => `${finding.file}:${finding.line} ${finding.kind} ${finding.text}`)).toEqual([])
  })
})
