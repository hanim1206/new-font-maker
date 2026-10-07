import { ChevronLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '../components/ui/button'
import { LEGAL_FIELDS } from './legalInfo'
import { fillFields, parseLegalMarkdown } from './legalMarkdown'
import type { LegalBlock, ListBlock, Span } from './legalMarkdown'
import terms from './terms.md?raw'
import privacy from './privacy.md?raw'
import styles from './LegalPage.module.css'

/**
 * 이용약관(`/terms`) · 개인정보 처리방침(`/privacy`). 로그인 게이트 앞에서 열린다 — 카카오 심사와 가입 전 사람이 읽어야 해서.
 * 본문은 같은 폴더의 마크다운이고, 빈칸(`{운영자}` 등)은 `legalInfo.ts`가 채운다. 계정 페이지와 같은 480 흰 판.
 */

export type LegalKind = 'terms' | 'privacy'

const DOCS: Record<LegalKind, { title: string; source: string; other: LegalKind; otherTitle: string }> = {
  terms: { title: '이용약관', source: terms, other: 'privacy', otherTitle: '개인정보 처리방침' },
  privacy: { title: '개인정보 처리방침', source: privacy, other: 'terms', otherTitle: '이용약관' },
}

function Spans({ spans }: { spans: Span[] }) {
  return <>{spans.map((span, index) => span.bold ? <strong key={index}>{span.text}</strong> : <span key={index}>{span.text}</span>)}</>
}

function List({ list }: { list: ListBlock }) {
  const items = list.items.map((item, index) => <li key={index}><Spans spans={item.spans} />{item.children && <List list={item.children} />}</li>)
  return list.ordered ? <ol className={styles.list}>{items}</ol> : <ul className={styles.list}>{items}</ul>
}

function Block({ block }: { block: LegalBlock }): ReactNode {
  if (block.kind === 'heading') return <h2>{block.text}</h2>
  if (block.kind === 'paragraph') return <p><Spans spans={block.spans} /></p>
  if (block.kind === 'list') return <List list={block} />
  return <div className={styles.tableWrap}>
    <table className={styles.table}>
      <thead><tr>{block.head.map((cell, index) => <th key={index}><Spans spans={cell} /></th>)}</tr></thead>
      <tbody>{block.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, index) => <td key={index}><Spans spans={cell} /></td>)}</tr>)}</tbody>
    </table>
  </div>
}

/** 같은 사이트에서 왔으면 그리로, 주소로 바로 들어왔으면 처음 화면으로. 게이트 앞 화면이라 앱 라우터를 쓰지 않는다. */
function goBack(): void {
  const sameSite = document.referrer.startsWith(window.location.origin)
  if (sameSite && window.history.length > 1) window.history.back()
  else window.location.assign('/')
}

export function LegalPage({ kind }: { kind: LegalKind }) {
  const doc = DOCS[kind]
  const blocks = parseLegalMarkdown(fillFields(doc.source, LEGAL_FIELDS))
  document.title = `${doc.title} · 한글칸글`
  return <main className={styles.page}>
    <div className={styles.shell} data-testid={`legal-${kind}`}>
      <header className={styles.bar}>
        <Button variant="plain" size="icon-lg" aria-label="뒤로" onClick={goBack}><ChevronLeft aria-hidden="true" /></Button>
      </header>
      <article className={styles.body}>
        <h1>{doc.title}</h1>
        <p className={styles.sub}>한글칸글</p>
        {blocks.map((block, index) => <Block key={index} block={block} />)}
        <div className={styles.band} />
        <a className={styles.other} href={`/${doc.other}`}>{doc.otherTitle} 보기</a>
      </article>
    </div>
  </main>
}
