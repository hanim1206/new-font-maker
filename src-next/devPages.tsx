import { CalibrationSentenceEditor } from './CalibrationSentenceEditor'
import { GridSystem2LabPage } from './GridSystem2LabPage'
import { RuleLabPage } from './RuleLabPage'

/** 개발 서버에서만 여는 화면. `App.tsx`가 `import.meta.env.DEV`일 때만 불러오므로 프로덕션 번들에는 들어가지 않는다. */
export default function DevPage() {
  if (window.location.pathname === '/grid-lab') return <GridSystem2LabPage />
  if (window.location.pathname === '/rule-lab') return <RuleLabPage />
  // `/calibration`과 모르는 주소는 셸 없는 옛 문장 보정으로 온다(e2e가 여기서 돈다).
  return <CalibrationSentenceEditor />
}
