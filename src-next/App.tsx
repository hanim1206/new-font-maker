import { lazy, Suspense, useEffect } from 'react'
import { ReviewWorkspacePage } from './ReviewWorkspacePage'
import { ShapeWorkspacePage } from './ShapeWorkspacePage'
import { FontExportDialog } from './workspace/FontExportDialog'

/** 앱을 열면 자소 탭이 처음이다. `?char=` 같은 쿼리는 그대로 넘긴다. 프로덕션에서 모르는 주소도 여기로 온다. */
function HomeRedirect() {
  useEffect(() => { window.location.replace(`/workspace/jamo${window.location.search}${window.location.hash}`) }, [])
  return null
}

// 랩 · 셸 없는 옛 문장 보정은 개발 서버에서만. 프로덕션 빌드에서는 이 분기가 사라져 청크도 안 만든다.
const DevPage = import.meta.env.DEV ? lazy(() => import('./devPages')) : null

function Page() {
  if (window.location.pathname === '/') return <HomeRedirect />
  if (window.location.pathname === '/workspace/review' || window.location.pathname.startsWith('/workspace/review/')) return <ReviewWorkspacePage />
  if (window.location.pathname === '/workspace' || window.location.pathname.startsWith('/workspace/')) return <ShapeWorkspacePage />
  if (DevPage) return <Suspense fallback={null}><DevPage /></Suspense>
  return <HomeRedirect />
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

export default function App() {
  usePinchLock()
  return <><Page /><FontExportDialog /></>
}
