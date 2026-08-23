import { CalibrationSentenceEditor } from './CalibrationSentenceEditor'
import { GridSystem2LabPage } from './GridSystem2LabPage'

export default function App() {
  if (window.location.pathname === '/grid-lab') return <GridSystem2LabPage />
  return <CalibrationSentenceEditor />
}
