import { Check, Download, LoaderCircle, X } from 'lucide-react'
import { accountFontUpdatedAt } from './accountFontSync'
import { editedDayText } from './accountFont'
import { useFontExportStore } from './fontExportStore'
import { useUIStore } from '../src/stores/uiStore'
import { MobileWorkspaceShell } from './workspace/WorkspaceChrome'
import styles from './FontWorkspacePage.module.css'

/**
 * 폰트 탭(`/workspace/font`). 폰트 덱의 첫 화면 — 이 폰트 하나에 대한 것이 모이는 자리.
 * 지금은 이름 · 마지막 고친 날 · OTF 추출. 글로벌 스타일(네모꼴 · 획 스타일 · 굵기 · 부리)은 다음 단계에서 여기로 온다.
 */
export function FontWorkspacePage() {
  const name = useUIStore((state) => state.currentProjectName) ?? '새 한글 폰트'
  const updatedAt = accountFontUpdatedAt()
  const exportState = useFontExportStore((state) => state.status)
  const exportProgress = useFontExportStore((state) => state.progress)
  const requestExport = useFontExportStore((state) => state.request)
  const exportLabel = exportState === 'exporting' ? `OTF 추출 중: ${exportProgress}` : exportState === 'downloaded' ? 'OTF 추출 완료' : exportState === 'failed' ? 'OTF 추출 실패' : '현재 작업을 OTF로 추출'
  return <MobileWorkspaceShell activeArea="font">
    <section className={styles.screen} aria-label="폰트 정보" data-testid="font-workspace">
      <header className={styles.identity}>
        <h1>{name}</h1>
        {updatedAt && <p>마지막 고침 · {editedDayText(updatedAt)}</p>}
      </header>
      <button type="button" className={styles.exportButton} data-export-state={exportState} onClick={requestExport} disabled={exportState === 'exporting'} aria-label={exportLabel} title={exportLabel}>
        {exportState === 'exporting' ? <LoaderCircle className={styles.exportSpinner} size={18} /> : exportState === 'downloaded' ? <Check size={18} /> : exportState === 'failed' ? <X size={18} /> : <Download size={18} />}
        <span>OTF 추출</span>
        {exportState === 'exporting' && <small>{exportProgress}</small>}
      </button>
    </section>
  </MobileWorkspaceShell>
}
