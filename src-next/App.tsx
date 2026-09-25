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

export default function App() {
  return <><Page /><FontExportDialog /></>
}
