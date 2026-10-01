import { CalibrationSentenceEditor } from './CalibrationSentenceEditor'
import { useCalibrationProjectStore } from './calibrationProjectStore'
import { paddingToDesignBody } from './designBody'
import { useFontExportStore } from './fontExportStore'
import { SubtitleTemplate } from './SubtitleTemplate'
import { REFERENCE_HEIGHT, REFERENCE_WIDTH } from '../src/services/designBodyPlacement'
import { STEM_BEAK_SHAPES } from '../src/services/stemBeak'
import { useGlobalStyleStore } from '../src/stores/globalStyleStore'
import { useLayoutStore } from '../src/stores/layoutStore'
import styles from './FontWorkspacePage.module.css'

/**
 * 스타일 화면(`/workspace/font`). 대시보드 `스타일`로 들어온다 — 이 폰트 전체의 인상을 고치는 자리.
 * 머리는 `‹ 스타일`, 그 아래 지금 값 요약, 가운데는 문장 표본, 아래는 조절과 탭(네모꼴 · 획 · 부리).
 * 추출은 여기서 하지 않는다(대시보드 폰트 카드의 다운로드). 추출이 도는 동안 이 화면에 오면 대기 층이 덮는다.
 */
export function FontWorkspacePage() {
  return <CalibrationSentenceEditor chrome="workspace" space="style" above={<StyleSummary />} cover={<FontExportOverlay />} />
}


/** 머리 바로 아래 지금 값 네 칩(제목 `스타일`은 머리에). 칩은 저장된 값만 읽는다(끄는 중 미리보기는 문장이 보여 준다). */
function StyleSummary() {
  const style = useGlobalStyleStore((state) => state.style)
  const padding = useLayoutStore((state) => state.globalPadding)
  const fontSpace = useCalibrationProjectStore((state) => state.fontSpace)
  const body = paddingToDesignBody(padding, fontSpace)
  const width = Math.round(body.width)
  const height = Math.round(body.height)
  // 네모꼴은 가로만 바꾼다. 기본 가로 대비 %로 읽는다. 옛 화면에서 세로를 바꾼 폰트는 가로 × 세로를 그대로 보인다.
  const baseWidth = Math.round(REFERENCE_WIDTH * 1000)
  const bodyLabel = height !== Math.round(REFERENCE_HEIGHT * 1000) ? `${width} × ${height}`
    : width === baseWidth ? '기본'
      : `${Math.round(width / baseWidth * 100)}%`
  const flatBrush = style.strokeStyle.mode === 'brush' && style.strokeStyle.brush.tip !== 'round'
  const beak = style.stemBeak?.enabled ? STEM_BEAK_SHAPES.find((shape) => shape.id === style.stemBeak?.shape)?.label.replace(/ 부리$/, '') ?? '있음' : '없음'
  return <header className={styles.summary} data-testid="font-workspace">
    <ul aria-label="지금 스타일">
      <li>네모꼴 <b>{bodyLabel}</b></li>
      <li>붓 <b>{flatBrush ? '납작' : '일반'}</b></li>
      <li>굵기 <b>{style.weight}</b></li>
      <li>부리 <b>{beak}</b></li>
    </ul>
  </header>
}

/**
 * 대기 층. 추출이 도는 동안 스타일 화면의 내용 자리(머리 아래)를 덮고 퍼센트와 템플릿(내 획으로 그린 자막)을 보인다.
 * 닫기는 없다 — 추출은 취소하지 못한다. 머리 `‹`로는 나갈 수 있고 추출은 계속된다. 3단계(파일 조립)는 동기라 99에서 `파일로 묶는 중`으로 선다.
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
