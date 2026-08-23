import { CalibrationSentenceEditor } from './CalibrationSentenceEditor'
import { GridSystem2LabPage } from './GridSystem2LabPage'
import { RuleLabPage } from './RuleLabPage'
import { ShapeWorkspacePage } from './ShapeWorkspacePage'

export default function App() {
  if (window.location.pathname === '/grid-lab') return <GridSystem2LabPage />
  if (window.location.pathname === '/rule-lab') return <RuleLabPage />
  if (window.location.pathname === '/workspace' || window.location.pathname.startsWith('/workspace/')) return <ShapeWorkspacePage />
  return <CalibrationSentenceEditor />
}
