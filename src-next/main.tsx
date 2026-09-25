import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import {
  LAYOUT_PROFILE_MIGRATION_BACKUP_KEY,
  runLayoutProfileMigrationBootstrap,
} from '../src/services/layoutProfileMigrationBootstrap'
import { LEGACY_CALIBRATION_LAYOUT_PROFILE_V1 } from '../src/data/legacyCalibrationLayoutProfileV1'
import { DEFAULT_LAYOUT_SCHEMAS } from '../src/utils/layoutCalculator'
import '../src/index.css'
import { dropForeignCopy } from './accountFont'
import { authGateMode, sessionUserId } from './betaAuth'

const root = createRoot(document.getElementById('root')!)

// 요소 끌어 옮기기(이미지 · 링크 · 선택한 글자)를 앱 전체에서 막는다. 입력칸은 예외. CSS `-webkit-user-drag`가 안 먹는 브라우저(Firefox)용.
document.addEventListener('dragstart', (event) => {
  if (event.target instanceof Element && event.target.closest('input, textarea, [contenteditable]:not([contenteditable="false"])')) return
  event.preventDefault()
})

/** 로그인 게이트(베타). 로그인 안 됐으면 앱 대신 코드 입력 화면을 띄우고, 들어오면 그 자리에서 앱을 연다. */
async function gate(): Promise<void> {
  const mode = authGateMode()
  if (mode === 'off') return start()
  const { AuthMisconfiguredPage, BetaLoginPage } = await import('./BetaLoginPage')
  if (mode === 'misconfigured') {
    root.render(<StrictMode><AuthMisconfiguredPage /></StrictMode>)
    return
  }
  const me = await sessionUserId()
  if (me) return start(me)
  root.render(<StrictMode><BetaLoginPage onSignedIn={() => void gate()} /></StrictMode>)
}

/** `me`가 있으면(로그인 게이트가 켜졌을 때) 편집 화면을 열기 전에 계정 폰트를 불러온다. */
async function start(me?: string): Promise<void> {
  if (import.meta.env.DEV && window.location.pathname === '/global-style-preview') {
    const { GlobalStylePreviewPage } = await import('./GlobalStylePreviewPage')
    root.render(<StrictMode><GlobalStylePreviewPage /></StrictMode>)
    return
  }

  if (window.location.pathname === '/noto-corpus-lab') {
    const { NotoCorpusLabPage } = await import('./NotoCorpusLabPage')
    root.render(<StrictMode><NotoCorpusLabPage /></StrictMode>)
    return
  }

  if (window.location.pathname === '/reference-lab') {
    const { ReferenceLabPage } = await import('./ReferenceLabPage')
    root.render(<StrictMode><ReferenceLabPage /></StrictMode>)
    return
  }

  if (window.location.pathname === '/reference-group-lab') {
    const { ReferenceGroupLabPage } = await import('./ReferenceGroupLabPage')
    root.render(<StrictMode><ReferenceGroupLabPage /></StrictMode>)
    return
  }

  if (window.location.pathname === '/stroke-grammar-lab') {
    const { StrokeGrammarLabPage } = await import('./StrokeGrammarLabPage')
    root.render(<StrictMode><StrokeGrammarLabPage /></StrictMode>)
    return
  }

  if (window.location.pathname === '/preset-candidate-lab') {
    const { PresetCandidateLabPage } = await import('./PresetCandidateLabPage')
    root.render(<StrictMode><PresetCandidateLabPage /></StrictMode>)
    return
  }

  if (window.location.pathname === '/font-guide-lab') {
    const params = new URLSearchParams(window.location.search)
    if (params.get('section') === 'medial') {
      params.set('section', 'initial')
      window.history.replaceState(null, '', `/font-guide-lab?${params.toString()}`)
    }
    const { FontGuideLabPage } = await import('./FontGuideLabPage')
    root.render(<StrictMode><FontGuideLabPage /></StrictMode>)
    return
  }

  if (window.location.pathname === '/medial-guide-lab') {
    const params = new URLSearchParams(window.location.search)
    params.set('section', 'initial')
    window.history.replaceState(null, '', `/font-guide-lab?${params.toString()}`)
    const { FontGuideLabPage } = await import('./FontGuideLabPage')
    root.render(<StrictMode><FontGuideLabPage /></StrictMode>)
    return
  }

  if (window.location.pathname === '/five-guide-lab') {
    const { FiveGuideLabPage } = await import('./FiveGuideLabPage')
    root.render(<StrictMode><FiveGuideLabPage /></StrictMode>)
    return
  }

  // 남의 이름표가 붙은 브라우저 사본은 스토어가 읽기 전에 지운다(공용 기기).
  if (me) dropForeignCopy(window.localStorage, me)

  const migration = runLayoutProfileMigrationBootstrap({
    storage: window.localStorage,
    defaultSchemas: DEFAULT_LAYOUT_SCHEMAS,
    presetProfile: LEGACY_CALIBRATION_LAYOUT_PROFILE_V1,
  })

  if (migration.status === 'blocked') {
    root.render(
      <StrictMode>
        <main role="alert" style={{ maxWidth: 560, margin: '20vh auto', padding: 24, lineHeight: 1.6 }}>
          <h1>레이아웃 데이터를 안전하게 보존했습니다</h1>
          <p>기존 데이터의 자동 이관을 완료하지 못해 편집 화면을 열지 않았습니다.</p>
          <p>{migration.message}</p>
          <p>충돌을 자동으로 해결하거나 어느 쪽 데이터도 임의로 선택하지 않았습니다.</p>
          <p>
            복구용 원본은 <code>{LAYOUT_PROFILE_MIGRATION_BACKUP_KEY}</code> 키에 보존되어 있습니다.
          </p>
        </main>
      </StrictMode>,
    )
    return
  }

  if (me) {
    const { startAccountFont } = await import('./accountFontSync')
    const started = await startAccountFont(me)
    if (!started.ok) {
      const { AccountFontFailedPage } = await import('./BetaLoginPage')
      root.render(<StrictMode><AccountFontFailedPage reason={started.reason} message={started.message} /></StrictMode>)
      return
    }
  }

  const { default: App } = await import('./App')
  root.render(<StrictMode><App /></StrictMode>)
}

void gate()

// 개발 서버에서만 화면 명세 버튼을 붙인다. 배포 빌드에서는 이 분기와 버튼 코드가 통째로 빠진다. `VITE_SCREEN_SPEC=off`로 끌 수 있다.
if (import.meta.env.DEV && import.meta.env.VITE_SCREEN_SPEC !== 'off') void import('./mountScreenSpecButton').then(({ mountScreenSpecButton }) => mountScreenSpecButton())
