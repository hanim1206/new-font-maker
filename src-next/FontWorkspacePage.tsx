import { Check, Download, LoaderCircle, X } from 'lucide-react'
import { accountFontUpdatedAt } from './accountFontSync'
import { editedDayText } from './accountFont'
import { CalibrationSentenceEditor } from './CalibrationSentenceEditor'
import { useFontExportStore } from './fontExportStore'
import { SubtitleTemplate } from './SubtitleTemplate'
import { useUIStore } from '../src/stores/uiStore'
import styles from './FontWorkspacePage.module.css'

/**
 * 폰트 탭(`/workspace/font`). 폰트 덱의 첫 화면 — 이 폰트 하나에 대한 것이 모이는 자리.
 * 위는 이름 · 마지막 고친 날 · OTF 추출, 아래는 글로벌 스타일 공간(문장 표본 + 네모꼴 · 획 스타일 · 굵기 · 부리).
 * 글로벌 스타일은 편집기의 `style` 자리다 — 캔버스 없이 문장 줄이 크게 자라 미리보기를 맡고, 되돌리기는 셸 머리.
 * 추출이 도는 동안은 대기 층이 이 화면을 덮고, 끝나면 완료 페이지로 간다.
 */
export function FontWorkspacePage() {
  return <CalibrationSentenceEditor chrome="workspace" space="style" above={<FontIdentity />} cover={<FontExportOverlay />} />
}

function FontIdentity() {
  const name = useUIStore((state) => state.currentProjectName) ?? '새 한글 폰트'
  const updatedAt = accountFontUpdatedAt()
  const exportState = useFontExportStore((state) => state.status)
  const exportProgress = useFontExportStore((state) => state.progress)
  const requestExport = useFontExportStore((state) => state.request)
  const exportLabel = exportState === 'exporting' ? `OTF 추출 중: ${exportProgress}` : exportState === 'downloaded' ? 'OTF 추출 완료' : exportState === 'failed' ? 'OTF 추출 실패' : '현재 작업을 OTF로 추출'
  return <section className={styles.identity} aria-label="폰트 정보" data-testid="font-workspace">
    <div className={styles.name}>
      <h1>{name}</h1>
      {updatedAt && <p>마지막 고침 · {editedDayText(updatedAt)}</p>}
    </div>
    <button type="button" className={styles.exportButton} data-export-state={exportState} onClick={requestExport} disabled={exportState === 'exporting'} aria-label={exportLabel} title={exportLabel}>
      {exportState === 'exporting' ? <LoaderCircle className={styles.exportSpinner} size={18} /> : exportState === 'downloaded' ? <Check size={18} /> : exportState === 'failed' ? <X size={18} /> : <Download size={18} />}
      <span>OTF 추출</span>
    </button>
  </section>
}

/**
 * 대기 층. 추출이 도는 동안 폰트 탭의 내용 자리(머리와 탭 사이)를 덮고 퍼센트와 템플릿(내 획으로 그린 자막)을 보인다.
 * 닫기는 없다 — 추출은 취소하지 못한다. 탭으로는 나갈 수 있고 추출은 계속된다. 3단계(파일 조립)는 동기라 99에서 `파일로 묶는 중`으로 선다.
 */
function FontExportOverlay() {
  const exporting = useFontExportStore((state) => state.status === 'exporting')
  const percent = useFontExportStore((state) => state.percent)
  const phase = useFontExportStore((state) => state.progress)
  if (!exporting) return null
  return <div className={styles.overlay} role="status" aria-live="polite" aria-label="OTF 추출 중" data-testid="font-export-overlay">
    <div className={styles.overlayCard}>
      <p className={styles.percent}><strong data-testid="font-export-percent">{percent}</strong><span>%</span></p>
      <p className={styles.phase}>{phase}</p>
      <SubtitleTemplate />
      <p className={styles.hint}>내 획으로 미리 그린 모습이에요. 끝나면 진짜 폰트로 다시 그려요.</p>
    </div>
  </div>
}
