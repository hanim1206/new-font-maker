import { useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import { downloadTTF } from '../src/services/fontGenerator'
import { fontVersionText } from '../src/services/fontRevision'
import { FONT_TAB_PATH, useFontExportStore } from './fontExportStore'
import { navigate, onLinkClick } from './router'
import { SubtitleTemplate } from './SubtitleTemplate'
import { MobileWorkspaceShell } from './workspace/WorkspaceChrome'
import styles from './FontExportDonePage.module.css'

/**
 * 추출 완료 페이지(`/workspace/font/export`). 방금 만든 OTF를 `FontFace`로 등록해 같은 템플릿을 진짜 폰트로 그린다 — "진짜가 됐다".
 * 다시 받기 · 버전 · 파일 크기 · 빠진 글자 · 설치 안내. 폰트 덱 안의 하위 화면이라 머리는 `‹ 폰트`.
 * `lastExport`는 메모리에만 있다. 새로고침이면 폰트 탭으로 넘긴다.
 */
export function FontExportDonePage() {
  const lastExport = useFontExportStore((state) => state.lastExport)
  useEffect(() => { if (!lastExport) navigate(FONT_TAB_PATH, { replace: true }) }, [lastExport])
  if (!lastExport) return null
  return <MobileWorkspaceShell activeArea="font" back={{ label: '폰트', href: FONT_TAB_PATH }}>
    <ExportedFont key={lastExport.at} export={lastExport} />
  </MobileWorkspaceShell>
}

/** 등록 이름에 버전을 넣는다 — 같은 family로 두 번 등록하면 브라우저가 옛 바이트를 붙들 수 있다. 떠날 때 지운다. */
function fontFaceName(familyName: string, revision: number): string {
  return `${familyName}-${fontVersionText(revision)}`
}

function ExportedFont({ export: done }: { export: NonNullable<ReturnType<typeof useFontExportStore.getState>['lastExport']> }) {
  const faceName = fontFaceName(done.familyName, done.revision)
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    if (typeof FontFace === 'undefined') return
    const face = new FontFace(faceName, done.bytes)
    let alive = true
    face.load().then(() => { if (!alive) return; document.fonts.add(face); setLoaded(true) }).catch(() => { /* 못 읽으면 내 획 그림으로 남긴다 */ })
    return () => { alive = false; document.fonts.delete(face) }
  }, [faceName, done.bytes])
  const kb = Math.max(1, Math.round(done.fileSize / 1024))
  return <section className={styles.screen} aria-label="추출 완료" data-testid="font-export-done" data-font-loaded={loaded || undefined}>
    <header className={styles.head}>
      <h1>진짜 폰트가 됐어요</h1>
      <p>{done.familyName} · {fontVersionText(done.revision)} · {kb.toLocaleString()} KB</p>
    </header>
    <SubtitleTemplate fontFamily={loaded ? faceName : undefined} />
    <button type="button" className={styles.download} onClick={() => downloadTTF(done.bytes, done.fileName)} data-testid="font-export-redownload"><Download size={18} />다시 받기</button>
    {done.skippedChars.length > 0 && <section className={styles.skipped} aria-label="빠진 글자" data-testid="font-export-skipped">
      <h2>모양을 만들지 못해 빈 칸으로 들어간 글자 {done.skippedChars.length}자</h2>
      <p>글자를 누르면 그 글자로 가요. 획을 고쳐 다시 받아 주세요.</p>
      <ul>{done.skippedChars.map((char) => <li key={char}><a href={`/workspace/jamo?char=${encodeURIComponent(char)}`} onClick={onLinkClick}>{char}</a></li>)}</ul>
    </section>}
    <p className={styles.note}>iPhone에서는 파일 앱에 저장한 뒤 컴퓨터에서 설치해요. 안드로이드 · 컴퓨터는 받은 파일을 열어 설치하면 돼요.</p>
  </section>
}
