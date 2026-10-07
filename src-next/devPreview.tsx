import type { ReactNode } from 'react'
import { PREVIEW_SITUATIONS } from './previewCases'
import type { PreviewSituation } from './previewCases'

/**
 * 개발 서버 전용 — 스타일 가이드 미리보기에서 상황 화면을 그대로 띄운다(`?preview=<key>`).
 * 진짜 상황(오류 · 잠김 · 로그인 실패)을 만들지 않고 그 화면 부품만 그린다. 단추는 눌러도 아무 데도 안 간다.
 * `main.tsx`가 `import.meta.env.DEV`일 때만 불러오므로 배포 번들에는 없다.
 */
export async function showDevPreview(show: (node: ReactNode) => void): Promise<boolean> {
  const key = new URLSearchParams(window.location.search).get('preview') as PreviewSituation | null
  if (!key || !PREVIEW_SITUATIONS.some((situation) => situation.key === key)) return false
  show(await nodeOf(key))
  return true
}

const noop = () => undefined

async function nodeOf(key: PreviewSituation): Promise<ReactNode> {
  switch (key) {
    case 'not-found': {
      const { NotFoundPage } = await import('./NotFoundPage')
      return <NotFoundPage />
    }
    case 'error': {
      const { AppErrorScreen } = await import('./AppErrorBoundary')
      return <AppErrorScreen />
    }
    case 'migration': {
      const { MigrationBlockedPage } = await import('./MigrationBlockedPage')
      return <MigrationBlockedPage detail="미리보기: 이관 실패 사유가 여기 들어가요." />
    }
    case 'edit-locked':
    case 'edit-lost': {
      const { EditLockedPage } = await import('./EditLockedPage')
      return <EditLockedPage lost={key === 'edit-lost'} />
    }
    case 'font-failed-network':
    case 'font-failed-invalid': {
      const { AccountFontFailedPage } = await import('./BetaLoginPage')
      return key === 'font-failed-network'
        ? <AccountFontFailedPage reason="network" message="폰트 목록을 불러오지 못했어요." />
        : <AccountFontFailedPage reason="invalid-font" message="저장 형식을 읽지 못했어요." />
    }
    case 'auth-misconfigured': {
      const { AuthMisconfiguredPage } = await import('./BetaLoginPage')
      return <AuthMisconfiguredPage />
    }
    case 'login':
    case 'login-code': {
      const { BetaLoginPage } = await import('./BetaLoginPage')
      return <BetaLoginPage kakao={key === 'login'} onSignedIn={noop} />
    }
    case 'copy-choice': {
      const { CopyChoicePage } = await import('./BetaLoginPage')
      return <CopyChoicePage accountFontName="내 폰트" replaces={null} onChoose={noop} />
    }
    case 'withdrawn':
    case 'withdrawn-now': {
      const { WithdrawnPage } = await import('./BetaLoginPage')
      return <WithdrawnPage justNow={key === 'withdrawn-now'} />
    }
  }
}
