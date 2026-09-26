import { useEffect, type ReactNode } from 'react'
import { MobileWorkspaceShell } from './workspace/WorkspaceChrome'
import { navigate, onLinkClick, usePathname } from './router'
import styles from './ShapeWorkspacePage.module.css'
import { CalibrationSentenceEditor } from './CalibrationSentenceEditor'

/** 옛 화면 주소. 뼈대 탭과 J-01 현황 · J-02 원형 · J-03 조합별 결과는 없앴다(글자에 닿지 않던 화면). 전부 자소 탭으로 넘긴다. */
const LEGACY_PATHS = new Set(['/workspace/skeleton', '/workspace/jamos', '/workspace/jamo/result', '/workspace/jamo/master'])

function NotFoundScreen(): ReactNode {
  return (
    <MobileWorkspaceShell activeArea="jamo">
      <section className={styles.notFound} role="alert">
        <span className={styles.screenId}>WORKSPACE</span>
        <h1>작업 화면을 찾을 수 없어요</h1>
        <p>잘못된 주소를 문장 보정 화면으로 숨기지 않았습니다.</p>
        <a href="/dashboard" onClick={onLinkClick}>대시보드로 이동</a>
      </section>
    </MobileWorkspaceShell>
  )
}

/** 자소 탭. 문장에서 글자를 골라 획을 직접 편집한다. */
function JamoEditorScreen() {
  return <CalibrationSentenceEditor chrome="workspace" />
}

function LegacyRedirect() {
  useEffect(() => { navigate('/workspace/jamo', { replace: true }) }, [])
  return null
}

export function ShapeWorkspacePage() {
  const pathname = usePathname()
  if (LEGACY_PATHS.has(pathname)) return <LegacyRedirect />
  if (pathname === '/workspace/jamo') return <JamoEditorScreen />
  return <NotFoundScreen />
}
