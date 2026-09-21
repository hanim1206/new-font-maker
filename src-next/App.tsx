import { useEffect } from 'react'
import { CalibrationSentenceEditor } from './CalibrationSentenceEditor'
import { GridSystem2LabPage } from './GridSystem2LabPage'
import { RuleLabPage } from './RuleLabPage'
import { ReviewWorkspacePage } from './ReviewWorkspacePage'
import { ShapeWorkspacePage } from './ShapeWorkspacePage'
import { FontExportDialog } from './workspace/FontExportDialog'

/** 앱을 열면 자소 탭이 처음이다. 셸 없는 옛 문장 보정은 `/calibration`에 남긴다. `?char=` 같은 쿼리는 그대로 넘긴다. */
function HomeRedirect() {
  useEffect(() => { window.location.replace(`/workspace/jamo${window.location.search}${window.location.hash}`) }, [])
  return null
}

function Page() {
  if (window.location.pathname === '/') return <HomeRedirect />
  if (window.location.pathname === '/grid-lab') return <GridSystem2LabPage />
  if (window.location.pathname === '/rule-lab') return <RuleLabPage />
  if (window.location.pathname === '/workspace/review' || window.location.pathname.startsWith('/workspace/review/')) return <ReviewWorkspacePage />
  if (window.location.pathname === '/workspace' || window.location.pathname.startsWith('/workspace/')) return <ShapeWorkspacePage />
  // `/calibration`과 모르는 주소는 셸 없는 문장 보정으로 온다.
  return <CalibrationSentenceEditor />
}

export default function App() {
  return <><Page /><FontExportDialog /></>
}
