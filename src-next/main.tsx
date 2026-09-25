import { StrictMode } from 'react'
import type { ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import {
  LAYOUT_PROFILE_MIGRATION_BACKUP_KEY,
  runLayoutProfileMigrationBootstrap,
} from '../src/services/layoutProfileMigrationBootstrap'
import { LEGACY_CALIBRATION_LAYOUT_PROFILE_V1 } from '../src/data/legacyCalibrationLayoutProfileV1'
import { DEFAULT_LAYOUT_SCHEMAS } from '../src/utils/layoutCalculator'
import '../src/index.css'
import { setPersistWriteErrorHandler } from '../src/utils/debouncedStorage'
import { dropForeignCopy, readStamp, writeStamp } from './accountFont'
import { LOCAL_OWNER } from './localFontApi'
import { showAppNotice } from './appNotice'
import { AppErrorBoundary } from './AppErrorBoundary'
import { AppNoticeBar } from './AppNoticeBar'
import { watchAppUpdate } from './appUpdate'
import { authGateMode, sessionUser } from './betaAuth'
import { DevCrashProbe } from './devCrash'
import { EditLockedPage } from './EditLockedPage'
import { editLockName, holdEditLock, takeStealRequest } from './editLock'
import { installErrorLog, isQuotaExceeded, onErrorRecorded, recordError } from './errorLog'
import { suspendWork } from './workGuard'

const root = createRoot(document.getElementById('root')!)

/** 모든 화면은 여기로 그린다. 그리다 던지면 흰 화면 대신 오류 화면, 아래 한 줄 알림은 어느 화면에서나. */
function show(node: ReactNode): void {
  root.render(
    <StrictMode>
      <AppErrorBoundary>
        {import.meta.env.DEV && <DevCrashProbe />}
        {node}
      </AppErrorBoundary>
      <AppNoticeBar />
    </StrictMode>,
  )
}

/** 브라우저 사본을 못 남겼다(저장 공간 초과 등). 이 탭에서 한 번만. */
function showLocalCopyNotice(): void {
  showAppNotice('local-copy', {
    tone: 'error',
    message: authGateMode() === 'on'
      ? '이 기기에 사본을 못 남겼어요. 계정에는 저장돼요.'
      : '저장하지 못했어요. 브라우저 저장 공간이 찼어요.',
    dismissable: true,
  }, { once: true })
}

installErrorLog()
onErrorRecorded((_entry, error) => { if (isQuotaExceeded(error)) showLocalCopyNotice() })
setPersistWriteErrorHandler((error) => {
  recordError(error, 'event')
  showLocalCopyNotice()
})
watchAppUpdate()

// 요소 끌어 옮기기(이미지 · 링크 · 선택한 글자)를 앱 전체에서 막는다. 입력칸은 예외. CSS `-webkit-user-drag`가 안 먹는 브라우저(Firefox)용.
document.addEventListener('dragstart', (event) => {
  if (event.target instanceof Element && event.target.closest('input, textarea, [contenteditable]:not([contenteditable="false"])')) return
  event.preventDefault()
})

/** 메인 화면 `내 폰트`. 게이트가 켜지면 계정, 꺼지면(개발 서버) 이 기기의 목록(`localFontApi`). */
const FONTS_PATH = '/fonts'

/**
 * 게이트가 꺼진 개발 서버: 계정 대신 `local`이 주인이다. 아직 이 기기 폰트를 고른 적이 없으면(옛 사본 · 로그인 사본 · 빈 상태)
 * 지금 사본을 첫 폰트로 만든다 — 편집 주소로 바로 들어와도 메인 화면으로 튕기지 않고, 있던 작업도 잃지 않는다.
 */
function adoptLocalCopy(): void {
  const stamp = readStamp(window.localStorage)
  if (stamp.owner === LOCAL_OWNER) return
  writeStamp(window.localStorage, { owner: LOCAL_OWNER, fontId: null, pending: false, create: '내 폰트' })
}

/**
 * 로그인 게이트(베타). 로그인 안 됐으면 앱 대신 코드 입력 화면을 띄운다.
 * 들어오면 메인 화면(`/fonts`)부터. 편집 주소를 바로 열거나 새로고침하면 마지막 폰트로 바로 연다.
 */
async function gate(): Promise<void> {
  const mode = authGateMode()
  if (mode === 'off') {
    adoptLocalCopy()
    if (window.location.pathname === FONTS_PATH) {
      const { FontHomePage } = await import('./FontHomePage')
      show(<FontHomePage me={LOCAL_OWNER} nickname="내 폰트" />)
      return
    }
    return start(LOCAL_OWNER)
  }
  const { AuthMisconfiguredPage, BetaLoginPage } = await import('./BetaLoginPage')
  if (mode === 'misconfigured') {
    show(<AuthMisconfiguredPage />)
    return
  }
  const user = await sessionUser()
  if (!user) {
    show(<BetaLoginPage onSignedIn={() => window.location.assign(FONTS_PATH)} />)
    return
  }
  // 남의 이름표가 붙은 브라우저 사본은 스토어가 읽기 전에 지운다(공용 기기).
  dropForeignCopy(window.localStorage, user.id)
  if (window.location.pathname === FONTS_PATH) {
    const { FontHomePage } = await import('./FontHomePage')
    show(<FontHomePage me={user.id} nickname={user.nickname} />)
    return
  }
  return start(user.id)
}

/** 편집 화면을 열기 전에 계정 폰트(게이트 꺼지면 이 기기 폰트)를 불러온다. */
async function start(me?: string): Promise<void> {
  // 랩 화면은 개발 서버에서만. 프로덕션 번들에는 랩 청크가 들어가지 않는다.
  if (import.meta.env.DEV) {
    const { showDevLab } = await import('./devLabs')
    if (await showDevLab(show)) return
  }

  // 같은 폰트는 한 탭에서만. 스토어가 사본을 읽기 전에 막는다.
  const initialFontId = me ? readStamp(window.localStorage).fontId : null
  const onLost = () => {
    suspendWork()
    show(<EditLockedPage lost />)
  }
  const held = await holdEditLock(editLockName(me, initialFontId), { steal: takeStealRequest(window.sessionStorage), onLost })
  if (!held) {
    show(<EditLockedPage lost={false} />)
    return
  }

  const migration = runLayoutProfileMigrationBootstrap({
    storage: window.localStorage,
    defaultSchemas: DEFAULT_LAYOUT_SCHEMAS,
    presetProfile: LEGACY_CALIBRATION_LAYOUT_PROFILE_V1,
  })

  if (migration.status === 'blocked') {
    show(
      <main role="alert" style={{ maxWidth: 560, margin: '20vh auto', padding: 24, lineHeight: 1.6 }}>
        <h1>레이아웃 데이터를 안전하게 보존했습니다</h1>
        <p>기존 데이터의 자동 이관을 완료하지 못해 편집 화면을 열지 않았습니다.</p>
        <p>{migration.message}</p>
        <p>충돌을 자동으로 해결하거나 어느 쪽 데이터도 임의로 선택하지 않았습니다.</p>
        <p>
          복구용 원본은 <code>{LAYOUT_PROFILE_MIGRATION_BACKUP_KEY}</code> 키에 보존되어 있습니다.
        </p>
      </main>,
    )
    return
  }

  // 게이트가 꺼져도 불러 둔다 — 오류 화면의 백업 · 업데이트 전 저장 창구(`workGuard`)를 채운다.
  const { startAccountFont } = await import('./accountFontSync')
  if (me) {
    const started = await startAccountFont(me)
    if (!started.ok && started.reason === 'home') { window.location.replace(FONTS_PATH); return }
    if (!started.ok) {
      const { AccountFontFailedPage } = await import('./BetaLoginPage')
      show(<AccountFontFailedPage reason={started.reason} message={started.message} />)
      return
    }
    // 새로 만든 폰트는 이제 id가 생겼다. 그 이름으로도 잠가야 둘째 탭이 같은 폰트를 알아본다(처음 잠금은 `new`였다).
    const fontId = readStamp(window.localStorage).fontId
    if (fontId !== initialFontId && !(await holdEditLock(editLockName(me, fontId), { steal: false, onLost }))) {
      show(<EditLockedPage lost={false} />)
      return
    }
  }

  const { default: App } = await import('./App')
  show(<App />)
}

void gate()

// 개발 서버에서만 화면 명세 버튼을 붙인다. 배포 빌드에서는 이 분기와 버튼 코드가 통째로 빠진다. `VITE_SCREEN_SPEC=off`로 끌 수 있다.
if (import.meta.env.DEV && import.meta.env.VITE_SCREEN_SPEC !== 'off') void import('./mountScreenSpecButton').then(({ mountScreenSpecButton }) => mountScreenSpecButton())
