import { CalibrationSentenceEditor } from './CalibrationSentenceEditor'
import { GridSystem2LabPage } from './GridSystem2LabPage'
import { RuleLabPage } from './RuleLabPage'

export default function App() {
  if (window.location.pathname === '/grid-lab') return <GridSystem2LabPage />
  if (window.location.pathname === '/rule-lab') return <RuleLabPage />
  return <CalibrationSentenceEditor />
}
