import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { Download, Heart } from 'lucide-react'
import { downloadTTF } from '../src/services/fontGenerator'
import { fontVersionText } from '../src/services/fontRevision'
import { DASHBOARD_PATH, FONT_TAB_PATH, useFontExportStore } from './fontExportStore'
import { navigate, onLinkClick } from './router'
import { MobileWorkspaceShell } from './workspace/WorkspaceChrome'
import styles from './FontExportDonePage.module.css'

/**
 * 추출 완료 페이지(`/workspace/font/export`). 방금 만든 OTF를 `FontFace`로 등록해 내 글자를 진짜 폰트로 크게 보여 준다 — "진짜가 됐다".
 * 이름 첫 글자 하나 크게 · 대시보드 카드에서 주사위로 고른 문장 · 가나다 줄, 아래 `다시 받기` · `한임에게 자랑하기`(의견 쓰기, 문구를 채워 둔다). 빠진 글자가 있으면 그 목록.
 * 설치 안내는 뺐다(나중에). 폰트 덱 안의 하위 화면이라 머리는 `‹ 폰트`, 대시보드에서 받았으면 `‹ 내 폰트`.
 * `lastExport`는 메모리에만 있다. 새로고침이면 폰트 탭으로 넘긴다.
 */
export function FontExportDonePage() {
  const lastExport = useFontExportStore((state) => state.lastExport)
  useEffect(() => { if (!lastExport) navigate(FONT_TAB_PATH, { replace: true }) }, [lastExport])
  if (!lastExport) return null
  const back = lastExport.from === 'dashboard' ? { label: '내 폰트', href: DASHBOARD_PATH } : { label: '폰트', href: FONT_TAB_PATH }
  return <MobileWorkspaceShell activeArea="font" back={back} heading="폰트 완성">
    <ExportedFont key={lastExport.at} export={lastExport} />
  </MobileWorkspaceShell>
}

/** 등록 이름에 버전을 넣는다 — 같은 family로 두 번 등록하면 브라우저가 옛 바이트를 붙들 수 있다. 떠날 때 지운다. */
function fontFaceName(familyName: string, revision: number): string {
  return `${familyName}-${fontVersionText(revision)}`
}

const isHangul = (char: string) => { const code = char.codePointAt(0) ?? 0; return code >= 0xac00 && code <= 0xd7a3 }

/** 크게 보여 줄 한 글자. 이름의 첫 한글 음절, 없으면 `가`. */
function heroChar(familyName: string): string {
  return [...familyName].find(isHangul) ?? '가'
}

const SAMPLE_ABC = '가나다라마바사 아자차카타파하'

function ExportedFont({ export: done }: { export: NonNullable<ReturnType<typeof useFontExportStore.getState>['lastExport']> }) {
  const faceName = fontFaceName(done.familyName, done.revision)
  // 읽는 동안은 견본을 가린다 — 기본 글꼴로 먼저 그려졌다 바뀌는 깜빡임을 막는다. 못 읽으면 기본 글꼴로라도 보인다.
  const [face, setFace] = useState<'loading' | 'ready' | 'failed'>(typeof FontFace === 'undefined' ? 'failed' : 'loading')
  useEffect(() => {
    if (typeof FontFace === 'undefined') return
    const fontFace = new FontFace(faceName, done.bytes)
    let alive = true
    fontFace.load().then(() => { if (!alive) return; document.fonts.add(fontFace); setFace('ready') }).catch(() => { if (alive) setFace('failed') })
    return () => { alive = false; document.fonts.delete(fontFace) }
  }, [faceName, done.bytes])
  const version = fontVersionText(done.revision)
  const mb = (done.fileSize / (1024 * 1024)).toFixed(1)
  const brag = () => navigate(`/account/feedback?draft=${encodeURIComponent(`${done.familyName} ${version} 만들었어요!`)}`)
  return <section className={styles.screen} aria-label="추출 완료" data-testid="font-export-done" data-font-loaded={face === 'ready' || undefined} data-font-state={face}>
    <div className={styles.content} style={face === 'ready' ? { '--specimen-font': `'${faceName}', sans-serif` } as CSSProperties : undefined}>
      <header className={styles.hero}>
        <span className={styles.heroChar} aria-hidden="true">{heroChar(done.familyName)}</span>
        <h1>{done.familyName}</h1>
        <p>{version} · {mb} MB</p>
      </header>
      <p className={styles.line}>{done.sample}</p>
      <p className={styles.abc}>{SAMPLE_ABC}</p>
      {done.skippedChars.length > 0 && <section className={styles.skipped} aria-label="빠진 글자" data-testid="font-export-skipped">
        <h2>모양을 만들지 못해 빈 칸으로 들어간 글자 {done.skippedChars.length}자</h2>
        <p>글자를 누르면 그 글자로 가요. 획을 고쳐 다시 받아 주세요.</p>
        <ul>{done.skippedChars.map((char) => <li key={char}><a href={`/workspace/jamo?char=${encodeURIComponent(char)}`} onClick={onLinkClick}>{char}</a></li>)}</ul>
      </section>}
    </div>
    <footer className={styles.actions}>
      <button type="button" className={styles.again} onClick={() => downloadTTF(done.bytes, done.fileName)} data-testid="font-export-redownload"><Download size={18} aria-hidden="true" />다시 받기</button>
      <button type="button" className={styles.brag} onClick={brag} data-testid="font-export-brag"><Heart size={18} aria-hidden="true" />한임에게 자랑하기</button>
    </footer>
  </section>
}
