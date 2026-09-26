import type { ReactNode } from 'react'

/**
 * 개발 서버에서만 여는 랩 화면들. `main.tsx`가 `import.meta.env.DEV`일 때만 부르므로
 * 프로덕션 번들에는 이 파일도, 랩 페이지 청크도 들어가지 않는다.
 * 주소가 랩이면 그리고 true, 아니면 false.
 */
export async function showDevLab(show: (node: ReactNode) => void): Promise<boolean> {
  const path = window.location.pathname

  if (path === '/global-style-preview') {
    const { GlobalStylePreviewPage } = await import('./GlobalStylePreviewPage')
    show(<GlobalStylePreviewPage />)
    return true
  }

  if (path === '/noto-corpus-lab') {
    const { NotoCorpusLabPage } = await import('./NotoCorpusLabPage')
    show(<NotoCorpusLabPage />)
    return true
  }

  if (path === '/reference-lab') {
    const { ReferenceLabPage } = await import('./ReferenceLabPage')
    show(<ReferenceLabPage />)
    return true
  }

  if (path === '/reference-group-lab') {
    const { ReferenceGroupLabPage } = await import('./ReferenceGroupLabPage')
    show(<ReferenceGroupLabPage />)
    return true
  }

  if (path === '/stroke-grammar-lab') {
    const { StrokeGrammarLabPage } = await import('./StrokeGrammarLabPage')
    show(<StrokeGrammarLabPage />)
    return true
  }

  if (path === '/preset-candidate-lab') {
    const { PresetCandidateLabPage } = await import('./PresetCandidateLabPage')
    show(<PresetCandidateLabPage />)
    return true
  }

  if (path === '/font-guide-lab') {
    const params = new URLSearchParams(window.location.search)
    if (params.get('section') === 'medial') {
      params.set('section', 'initial')
      window.history.replaceState(null, '', `/font-guide-lab?${params.toString()}`)
    }
    const { FontGuideLabPage } = await import('./FontGuideLabPage')
    show(<FontGuideLabPage />)
    return true
  }

  if (path === '/medial-guide-lab') {
    const params = new URLSearchParams(window.location.search)
    params.set('section', 'initial')
    window.history.replaceState(null, '', `/font-guide-lab?${params.toString()}`)
    const { FontGuideLabPage } = await import('./FontGuideLabPage')
    show(<FontGuideLabPage />)
    return true
  }

  if (path === '/dashboard-lab') {
    const { DashboardLabPage } = await import('./DashboardLabPage')
    show(<DashboardLabPage />)
    return true
  }

  if (path === '/five-guide-lab') {
    const { FiveGuideLabPage } = await import('./FiveGuideLabPage')
    show(<FiveGuideLabPage />)
    return true
  }

  return false
}
