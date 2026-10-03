import { lazy, Suspense, useEffect } from 'react'
import { ensureDevNotoFont, useDevNotoSwap } from './devNotoSwap'
import { navigate, usePathname, useRouteKey } from './router'
import { AccountPage } from './AccountPage'
import { DashboardLabPage, JamoHomePage } from './DashboardLabPage'
import { FontExportDonePage } from './FontExportDonePage'
import { FontWorkspacePage } from './FontWorkspacePage'
import { ReviewWorkspacePage } from './ReviewWorkspacePage'
import { ShapeWorkspacePage } from './ShapeWorkspacePage'
import { Button } from './components/ui/button'
import { FontExportDialog } from './workspace/FontExportDialog'

/**
 * 앱을 열면 대시보드가 처음이다 — 화면 사이 입구가 다 거기 있다. 프로덕션에서 모르는 주소도 여기로 온다.
 * 글자 쿼리(`?char=`)가 있으면 그 글자를 여는 링크라 자소 화면으로 그대로 넘긴다.
 */
function HomeRedirect() {
  useEffect(() => {
    const { search, hash } = window.location
    navigate(new URLSearchParams(search).has('char') ? `/workspace/jamo${search}${hash}` : '/dashboard', { replace: true })
  }, [])
  return null
}

// 랩 · 셸 없는 옛 문장 보정은 개발 서버에서만. 프로덕션 빌드에서는 이 분기가 사라져 청크도 안 만든다.
const DevPage = import.meta.env.DEV ? lazy(() => import('./devPages')) : null

/** 주소가 바뀌면 화면만 바꾼다(새로고침 없음). `key`는 같은 경로라도 새 주소(`?char=`)로 들어올 때 화면을 다시 연다. */
function Page() {
  const pathname = usePathname()
  const key = useRouteKey()
  if (pathname === '/') return <HomeRedirect key={key} />
  if (pathname === '/dashboard') return <DashboardLabPage key={key} />
  // 섹션 홈. 묶기(`?group=`)는 화면이 조용히 고치니 경로로만 연다.
  if (pathname.startsWith('/dashboard/')) return <JamoHomePage key={pathname} />
  // 계정 페이지 · 한임에게 의견. 대시보드 아바타에서 밀려 들어온다.
  if (pathname === '/account' || pathname.startsWith('/account/')) return <AccountPage key={pathname} pathname={pathname} />
  if (pathname === '/workspace/font') return <FontWorkspacePage key={key} />
  if (pathname === '/workspace/font/export') return <FontExportDonePage key={key} />
  if (pathname === '/workspace/review' || pathname.startsWith('/workspace/review/')) return <ReviewWorkspacePage key={key} />
  if (pathname === '/workspace' || pathname.startsWith('/workspace/')) return <ShapeWorkspacePage key={key} />
  if (DevPage) return <Suspense fallback={null}><DevPage /></Suspense>
  return <HomeRedirect key={key} />
}

/**
 * 캔버스(`data-pinch-lock`) 위에서만 브라우저 확대를 막는다. 나머지 화면은 확대된다.
 * `touch-action: none`만으로는 iOS Safari가 핀치를 안 막아 제스처 이벤트도 같이 막는다.
 */
function usePinchLock(): void {
  useEffect(() => {
    const locked = (event: Event) => event.target instanceof Element && event.target.closest('[data-pinch-lock]') !== null
    const onGesture = (event: Event) => { if (locked(event)) event.preventDefault() }
    const onTouchMove = (event: TouchEvent) => { if (event.touches.length > 1 && locked(event)) event.preventDefault() }
    const onWheel = (event: WheelEvent) => { if (event.ctrlKey && locked(event)) event.preventDefault() }
    const options: AddEventListenerOptions = { capture: true, passive: false }
    for (const type of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(type, onGesture, options)
    document.addEventListener('touchmove', onTouchMove, options)
    document.addEventListener('wheel', onWheel, options)
    return () => {
      for (const type of ['gesturestart', 'gesturechange', 'gestureend']) document.removeEventListener(type, onGesture, options)
      document.removeEventListener('touchmove', onTouchMove, options)
      document.removeEventListener('wheel', onWheel, options)
    }
  }, [])
}

/**
 * 개발 서버 전용 — 눈 ③ 확인용 우상단 고정 버튼 줄. 프로덕션 빌드에서는 분기가 사라진다.
 * `노토로`: 검수 격자 글자를 노토 산스(같은 굵기)로 교체 — 검수 경로에서만 보인다.
 */
function DevToggles() {
  const pathname = usePathname()
  const notoOn = useDevNotoSwap((state) => state.on)
  const toggleNoto = useDevNotoSwap((state) => state.toggle)
  useEffect(() => { if (notoOn) ensureDevNotoFont() }, [notoOn])
  return (
    <span style={{ position: 'fixed', top: 10, right: 10, zIndex: 9999, display: 'flex', gap: 6 }}>
      {pathname.startsWith('/workspace/review') && (
        <Button variant={notoOn ? 'default' : 'outline'} size="sm" data-testid="dev-noto-swap" onClick={toggleNoto}>
          노토로 {notoOn ? '켬' : '끔'}
        </Button>
      )}
    </span>
  )
}

export default function App() {
  usePinchLock()
  // 자동화 브라우저(e2e)에선 숨긴다 — 우상단 고정이라 머리 단추 클릭을 가린다.
  return <><Page /><FontExportDialog />{import.meta.env.DEV && !navigator.webdriver && <DevToggles />}</>
}
