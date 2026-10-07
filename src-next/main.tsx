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
import { autoPickOf, clearLocalFont, copyChoicePlanOf, dropForeignCopy, editorPlanOf, hasLocalFont, readStamp, writeStamp } from './accountFont'
import type { CopyChoice } from './accountFont'
import { LOCAL_OWNER } from './localFontApi'
import { showAppNotice } from './appNotice'
import { AppErrorBoundary, AppErrorScreen } from './AppErrorBoundary'
import { AppNoticeBar } from './AppNoticeBar'
import { ConsentSheet } from './ConsentSheet'
import { watchAppUpdate } from './appUpdate'
import { authGateMode, enterGuest, loginAt, sessionUser, signInErrorOf, takeWithdrawnFlag } from './betaAuth'
import { DevCrashProbe } from './devCrash'
import { EditLockedPage } from './EditLockedPage'
import { editLockName, holdEditLock, takeStealRequest } from './editLock'
import { reportInterruptedExport } from './exportInterrupted'
import { navigate } from './router'
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
      <ConsentSheet />
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
reportInterruptedExport(window.localStorage)

// 요소 끌어 옮기기(이미지 · 링크 · 선택한 글자)를 앱 전체에서 막는다. 입력칸은 예외. CSS `-webkit-user-drag`가 안 먹는 브라우저(Firefox)용.
document.addEventListener('dragstart', (event) => {
  if (event.target instanceof Element && event.target.closest('input, textarea, [contenteditable]:not([contenteditable="false"])')) return
  event.preventDefault()
})

/** 옛 메인 화면 주소. 폰트 목록은 대시보드 캐러셀로 옮겼다(09-26) — 들어오면 대시보드로 바꿔 적는다. */
const FONTS_PATH = '/fonts'
const DASHBOARD_PATH = '/dashboard'
const ADMIN_PATH = '/admin'
/** 받을 때 로그인(`download`)의 로그인 화면. */
const LOGIN_PATH = '/login'
const isAdminPath = (pathname: string) => pathname === ADMIN_PATH || pathname.startsWith(`${ADMIN_PATH}/`)
/** 게이트가 꺼진 개발 서버에서 새 폰트 이름. */
const LOCAL_NICKNAME = '내 폰트'

/**
 * 고른 폰트가 없을 때(처음 로그인 · 연 폰트를 지움) 최근 폰트를, 없으면 새로 만들기를 이름표에 적는다(`autoPickOf`).
 * 스토어를 가져오기 전에 부른다 — 사본을 비운 뒤 스토어가 옛 값을 들고 있으면 새 폰트가 옛 폰트를 베낀다. 목록을 못 받으면 false.
 */
async function pickFont(me: string, nickname: string | null): Promise<boolean> {
  const { listFonts } = await import('./accountFontApi')
  const listed = await listFonts(me)
  if (!listed.ok) return false
  const picked = autoPickOf(readStamp(window.localStorage), me, listed.value, hasLocalFont(window.localStorage), nickname)
  if (picked.clear) clearLocalFont(window.localStorage)
  writeStamp(window.localStorage, picked.stamp)
  return true
}

/** 열다가 고를 폰트가 사라졌을 때(다른 기기에서 지움 · 한도) 한 번만 새로 고쳐 다시 고른다. 짧은 사이 또 오면 멈춘다. */
const REPICK_KEY = 'font-maker-repick-at'
const REPICK_WINDOW_MS = 10_000
function repickOnce(): boolean {
  try {
    const last = Number(window.sessionStorage.getItem(REPICK_KEY) ?? 0)
    if (Date.now() - last < REPICK_WINDOW_MS) return false
    window.sessionStorage.setItem(REPICK_KEY, String(Date.now()))
  } catch { return false }
  window.location.reload()
  return true
}

/**
 * 게이트가 꺼진 개발 서버: 계정 대신 `local`이 주인이다. 아직 이 기기 폰트를 고른 적이 없으면(옛 사본 · 로그인 사본 · 빈 상태)
 * 지금 사본을 첫 폰트로 만든다 — 편집 주소로 바로 들어와도 메인 화면으로 튕기지 않고, 있던 작업도 잃지 않는다.
 */
function adoptLocalCopy(): void {
  const stamp = readStamp(window.localStorage)
  if (stamp.owner === LOCAL_OWNER) return
  writeStamp(window.localStorage, { owner: LOCAL_OWNER, fontId: null, pending: false, create: '내 폰트' })
}

/** 손님(`local`) 이름표를 뗀다. 주인 없는 사본은 `dropForeignCopy`가 지우지 않고, 계정이 비었으면 첫 폰트로 올라간다. 뗐으면 true. */
function releaseGuestCopy(): boolean {
  const stamp = readStamp(window.localStorage)
  if (stamp.owner !== LOCAL_OWNER) return false
  writeStamp(window.localStorage, { owner: null, fontId: null, pending: false })
  return hasLocalFont(window.localStorage)
}

/**
 * 손님 사본을 들고 로그인했는데 계정에 폰트가 있으면 묻는다(`CopyChoicePage`). 계정이 비었으면 묻지 않고 사본이 첫 폰트가 된다(`autoPickOf`).
 * 목록을 못 받으면 묻지 않고 그냥 연다 — 사본은 남아 있어 다음에 다시 묻는다.
 */
async function askCopyChoice(me: string, nickname: string | null): Promise<boolean> {
  const { deleteFont, listFonts } = await import('./accountFontApi')
  const listed = await listFonts(me)
  if (!listed.ok || listed.value.length === 0) return false
  const { loadProfile } = await import('./profileApi')
  const limit = (await loadProfile(me))?.fontLimit ?? 1
  const fonts = listed.value
  const { CopyChoicePage } = await import('./BetaLoginPage')
  const choice = await new Promise<CopyChoice>((resolve) => {
    const replaces = copyChoicePlanOf('local', me, fonts, limit, nickname).deleteIds.map((id) => fonts.find((font) => font.id === id)?.name ?? '').filter(Boolean).join(' · ')
    show(<CopyChoicePage accountFontName={fonts[0].name} replaces={replaces || null} onChoose={resolve} />)
  })
  const plan = copyChoicePlanOf(choice, me, fonts, limit, nickname)
  for (const id of plan.deleteIds) await deleteFont(id)
  if (plan.clear) clearLocalFont(window.localStorage)
  writeStamp(window.localStorage, plan.stamp)
  return true
}

/**
 * 로그인 게이트(베타). 로그인 안 됐으면 앱 대신 코드 입력 화면을 띄운다.
 * 들어오면 대시보드부터(마지막 폰트, 없으면 최근 폰트 · 새 폰트). 편집 주소를 바로 열거나 새로고침하면 마지막 폰트로 바로 연다.
 */
async function gate(): Promise<void> {
  // 스타일 가이드 미리보기가 고르는 상황 화면(`?preview=`). 개발 서버에서만, 배포 번들에는 없다.
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('preview')) {
    const { showDevPreview } = await import('./devPreview')
    if (await showDevPreview(show)) return
  }
  // 라우터 스토어는 이 파일을 읽을 때 옛 주소를 이미 들었다. 그냥 `replaceState`하면 화면은 `/fonts`로 남는다(개발 서버는 옛 문장 보정으로 샌다).
  if (window.location.pathname === FONTS_PATH) navigate(DASHBOARD_PATH, { replace: true })
  // 이용약관 · 개인정보 처리방침. 로그인과 상관없이 연다(카카오 심사 · 가입 전에 읽는다).
  if (window.location.pathname === '/terms' || window.location.pathname === '/privacy') {
    const { LegalPage } = await import('./legal/LegalPage')
    show(<LegalPage kind={window.location.pathname === '/terms' ? 'terms' : 'privacy'} />)
    return
  }
  // 관리자 화면(`/admin/*`). 개발 서버에서만, 로그인과 상관없이(발급 API가 이 맥에서만 받는다). 배포 번들에는 없다.
  if (import.meta.env.DEV && isAdminPath(window.location.pathname)) {
    const { AdminApp } = await import('./admin/AdminApp')
    show(<AdminApp />)
    return
  }
  const mode = authGateMode()
  if (mode === 'off') {
    adoptLocalCopy()
    return start(LOCAL_OWNER, LOCAL_NICKNAME)
  }
  const { AuthMisconfiguredPage, BetaLoginPage, WithdrawnPage } = await import('./BetaLoginPage')
  if (mode === 'misconfigured') {
    show(<AuthMisconfiguredPage />)
    return
  }
  // 방금 탈퇴하고 새로 불러왔다. 안내 한 장만.
  if (takeWithdrawnFlag()) {
    show(<WithdrawnPage justNow />)
    return
  }
  const user = await sessionUser()
  const onSignedIn = () => window.location.assign(DASHBOARD_PATH)
  // 카카오에서 실패를 달고 돌아왔다. 주소 조각은 지우고 알림 줄 한 줄.
  const signInError = signInErrorOf(window.location.hash)
  if (signInError) {
    history.replaceState(null, '', window.location.pathname + window.location.search)
    showAppNotice('sign-in', { tone: 'error', message: `로그인하지 못했어요. ${signInError}`, dismissable: true })
  }
  if (loginAt() === 'download') {
    // 받을 때 로그인: 로그인 전엔 손님으로 이 기기 사본을 바로 연다. 로그인 화면은 `/login`(동의 시트 · 계정 화면에서 온다).
    if (window.location.pathname === LOGIN_PATH) {
      if (user) { navigate(DASHBOARD_PATH, { replace: true }); return start(user.id, user.nickname) }
      show(<BetaLoginPage kakao onSignedIn={onSignedIn} />)
      return
    }
    if (!user) {
      enterGuest()
      adoptLocalCopy()
      return start(LOCAL_OWNER, LOCAL_NICKNAME)
    }
    // 손님으로 만든 사본은 주인 없는 사본으로 — 계정이 비었으면 첫 폰트가 된다(`autoPickOf`), 있으면 묻는다.
    if (releaseGuestCopy()) await askCopyChoice(user.id, user.nickname)
  } else if (!user) {
    show(<BetaLoginPage onSignedIn={onSignedIn} />)
    return
  }
  // 탈퇴한 계정은 들어오지 못한다. 프로필을 못 읽으면(표가 아직 없음 · 연결) 정상으로 본다 — RLS가 한 번 더 막는다.
  const { loadProfile } = await import('./profileApi')
  const profile = await loadProfile(user.id)
  if (profile?.withdrawnAt) {
    const { clearSignedOutCopy } = await import('./accountFont')
    await (await import('../src/lib/supabase')).supabase.auth.signOut()
    clearSignedOutCopy(window.localStorage)
    show(<WithdrawnPage />)
    return
  }
  // 남의 이름표가 붙은 브라우저 사본은 스토어가 읽기 전에 지운다(공용 기기).
  dropForeignCopy(window.localStorage, user.id)
  return start(user.id, user.nickname)
}

/** 편집 화면을 열기 전에 계정 폰트(게이트 꺼지면 이 기기 폰트)를 불러온다. */
async function start(me?: string, nickname: string | null = null): Promise<void> {
  // 랩 화면은 개발 서버에서만. 프로덕션 번들에는 랩 청크가 들어가지 않는다.
  if (import.meta.env.DEV) {
    const { showDevLab } = await import('./devLabs')
    if (await showDevLab(show)) return
  }

  if (me && editorPlanOf(readStamp(window.localStorage), me) === 'home' && !(await pickFont(me, nickname))) {
    const { AccountFontFailedPage } = await import('./BetaLoginPage')
    show(<AccountFontFailedPage reason="network" message="폰트 목록을 불러오지 못했어요." />)
    return
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
    const { MigrationBlockedPage } = await import('./MigrationBlockedPage')
    show(<MigrationBlockedPage detail={`${migration.message}\n복구용 원본: ${LAYOUT_PROFILE_MIGRATION_BACKUP_KEY}`} />)
    return
  }

  // 게이트가 꺼져도 불러 둔다 — 오류 화면의 백업 · 업데이트 전 저장 창구(`workGuard`)를 채운다.
  const { startAccountFont } = await import('./accountFontSync')
  if (me) {
    const started = await startAccountFont(me)
    if (!started.ok && started.reason === 'home' && repickOnce()) return
    if (!started.ok) {
      const { AccountFontFailedPage } = await import('./BetaLoginPage')
      show(started.reason === 'home'
        ? <AccountFontFailedPage reason="network" message="열 폰트를 고르지 못했어요." />
        : <AccountFontFailedPage reason={started.reason} message={started.message} />)
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

// 개발 서버에서만 스타일가이드의 주색 · 테마 미리보기를 덮어 쓴다(이 브라우저에만 저장). 배포 빌드에서는 빠진다.
if (import.meta.env.DEV) void import('./themePreview').then(({ startThemePreview }) => startThemePreview())

// 여는 길에서 던지면(사본을 못 읽음 · 저장 계약 거부) 뼈대 화면에 멈춰 있지 않고 오류 화면을 띄운다.
void gate().catch((error: unknown) => {
  recordError(error, 'promise')
  show(<AppErrorScreen />)
})

