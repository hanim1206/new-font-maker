import { useEffect, useMemo, useState } from 'react'
import { notoOutlineGhostPath } from '../src/services/notoOutlineInk'
import { allCorpusRows, CORPUS_TOTAL, corpusIdentity, parseCorpusReviews, REVIEW_STORAGE_KEY } from './notoCorpus'
import type { CorpusReviews, CorpusSnapshot } from './notoCorpus'
import { NotoCorpusMatrix } from './NotoCorpusMatrix'
import { TierBadge } from './GlyphLayoutEditor'
import { approvedCount, isApproved } from './notoApprovedIndex'
import { notoPresetGlyphs } from './notoPresetGlyphs'
import type { NotoPresetXorMap } from './notoPresetGlyphs'
import { useNotoGlyph } from './useNotoGlyph'
import { MobileWorkspaceShell } from './workspace/WorkspaceChrome'
import styles from './ReviewWorkspacePage.module.css'

/**
 * 검수 탭. 글자 격자(표)로 전체 글자를 한눈에 훑는 화면만 있다.
 * 글자를 열면 자소 탭의 `레이아웃` 모드로 간다. 기준선 편집부는 `GlyphLayoutEditor`.
 * 옛 글자 화면 주소(`/workspace/review/glyph`)는 같은 글자의 자소 탭으로 넘긴다.
 */

const VIEW_BOX = '-0.08 -0.08 1.16 1.16'
const GLYPH_PATH = '/workspace/review/glyph'

function codepointFromUrl(): number {
  const character = new URLSearchParams(window.location.search).get('char') ?? ''
  const codepoint = character.codePointAt(0) ?? 0
  return codepoint >= 0xac00 && codepoint < 0xac00 + CORPUS_TOTAL ? codepoint : 0xac00
}

function glyphHref(codepoint: number): string {
  return `/workspace/jamo?char=${encodeURIComponent(String.fromCodePoint(codepoint))}&mode=layout`
}

function loadReviews(): CorpusReviews {
  try { return parseCorpusReviews(localStorage.getItem(REVIEW_STORAGE_KEY)) } catch { return {} }
}

async function getJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal, cache: 'no-store' })
  const value = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error((value as { error?: string }).error ?? '자료를 읽지 못했습니다.')
  return value as T
}

function useNotoXorMap(): { xorMap: NotoPresetXorMap | null; error: string } {
  const [state, setState] = useState<{ xorMap: NotoPresetXorMap | null; error: string }>({ xorMap: null, error: '' })
  useEffect(() => {
    const controller = new AbortController()
    notoPresetGlyphs.xor(controller.signal)
      .then((xorMap) => setState({ xorMap, error: '' }))
      .catch((failure: Error) => { if (!controller.signal.aborted) setState({ xorMap: null, error: failure.message }) })
    return () => controller.abort()
  }, [])
  return state
}

/** xor 비율 → 격자 색 단계. 게이트가 아니라 눈에 띄게 하는 용도. */
const XOR_TONES: { max: number; tone: 'good' | 'mid' | 'far' | 'bad'; label: string }[] = [
  { max: 0.15, tone: 'good', label: '15% 미만' }, { max: 0.3, tone: 'mid', label: '30% 미만' }, { max: 0.6, tone: 'far', label: '60% 미만' }, { max: Infinity, tone: 'bad', label: '60% 이상' },
]
const xorTone = (xor: number) => XOR_TONES.find((entry) => xor < entry.max)!.tone


function GlyphMini({ codepoint }: { codepoint: number }) {
  const { glyph, error } = useNotoGlyph(codepoint)
  const ghost = useMemo(() => glyph ? notoOutlineGhostPath(glyph.outline) : null, [glyph])
  return <svg viewBox={VIEW_BOX} role="img" aria-label={ghost ? String.fromCodePoint(codepoint) : error || '읽는 중'}>
    <rect x="0" y="0" width="1" height="1" fill="#fff" />
    {ghost && 'path' in ghost && <path d={ghost.path} fill="#3a3a36" fillOpacity=".7" fillRule="evenodd" />}
  </svg>
}

function GridScreen() {
  const [snapshot, setSnapshot] = useState<CorpusSnapshot | null>(null)
  const [error, setError] = useState('')
  const [reviews, setReviews] = useState<CorpusReviews>(loadReviews)
  const [selected, setSelected] = useState(codepointFromUrl)

  useEffect(() => {
    const controller = new AbortController()
    void getJson<CorpusSnapshot>('/api/noto-corpus', controller.signal).then(setSnapshot).catch((failure: Error) => { if (!controller.signal.aborted) setError(failure.message) })
    return () => controller.abort()
  }, [])
  useEffect(() => {
    const onStorage = (event: StorageEvent) => { if (event.key === REVIEW_STORAGE_KEY) setReviews(loadReviews()) }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const rows = useMemo(() => snapshot ? allCorpusRows(snapshot) : [], [snapshot])
  const identity = corpusIdentity(selected)
  const { xorMap, error: xorError } = useNotoXorMap()
  const [colorBy, setColorBy] = useState<'xor' | 'status'>('xor')
  const xorOf = (character: string) => xorMap?.characters[character]?.xor
  const selectedXor = xorOf(identity.character)

  return <MobileWorkspaceShell activeArea="review" statusLabel="검수 · 글자 격자">
    <section className={styles.titleSection}>
      <span className={styles.screenId}>R-01 · 검수</span>
      <h1>글자 격자<small>Noto 고스트 · {snapshot ? `${snapshot.rows.length.toLocaleString()}자 추출` : '읽는 중'}</small></h1>
      <nav className={styles.segment} aria-label="검수 보기"><a href="/workspace/jamo">문장</a><span aria-current="page">격자</span></nav>
    </section>
    <div className={styles.scroll}>
      {error && <p className={styles.status} data-state="error" role="alert">{error}</p>}
      {/* 칸 탭 = 선택, 선택된 칸 다시 탭 = 글자 화면. 키보드 화살표 이동은 선택만 바꾼다. */}
      {rows.length > 0 && <div className={styles.matrixSection}><NotoCorpusMatrix rows={rows} reviews={reviews} selected={selected} onSelect={(codepoint) => { if (codepoint === selected) window.location.assign(glyphHref(codepoint)); else setSelected(codepoint) }} isHighlighted={() => true} noFinal={false} tierOf={(row) => isApproved(row.identity.codepoint) ? 'editable' : 'readonly'} toneOf={colorBy === 'xor' && xorMap ? (row) => { const xor = xorOf(row.identity.character); return xor === undefined ? undefined : xorTone(xor) } : undefined} /></div>}
      <div className={styles.colorBar}>
        <div className={styles.segment} role="group" aria-label="칸 색 기준">
          <button type="button" aria-current={colorBy === 'xor' ? 'page' : undefined} onClick={() => setColorBy('xor')} disabled={!xorMap}>Noto 대비 xor</button>
          <button type="button" aria-current={colorBy === 'status' ? 'page' : undefined} onClick={() => setColorBy('status')}>추출 상태</button>
        </div>
        {colorBy === 'xor' && xorMap && <div className={styles.toneLegend} data-testid="review-xor-legend">{XOR_TONES.map((entry) => <span key={entry.tone} data-tone={entry.tone}>{entry.label}</span>)}<small>앱 기본 획 기준 · {new Date(xorMap.generatedAt).toLocaleDateString('ko-KR')}</small></div>}
        {colorBy === 'xor' && xorError && <p className={styles.status} data-state="error">{xorError}</p>}
      </div>
      <p className={styles.status}>파란 테두리 칸 = 승인 측정 {approvedCount}자(획 마스터 fit 출발점). 나머지는 실측 기준선만.</p>
      <a className={styles.pick} href={glyphHref(selected)} data-testid="review-pick">
        <GlyphMini codepoint={selected} />
        <span className={styles.pickBody}>
          <strong>선택 · {identity.character}{selectedXor !== undefined && <em className={styles.pickXor} data-tone={xorTone(selectedXor)} data-testid="review-pick-xor"> xor {(selectedXor * 100).toFixed(0)}%</em>}</strong>
          <small>{identity.initialJamo} + {identity.medialJamo}{identity.finalJamo ? ` + ${identity.finalJamo}` : ' · 받침 없음'}</small>
          <TierBadge approved={isApproved(selected)} />
          <small className={styles.hint}>카드 탭 또는 같은 칸 다시 탭 → 글자 열기</small>
        </span>
        <span aria-hidden="true">›</span>
      </a>
    </div>
  </MobileWorkspaceShell>
}


export function ReviewWorkspacePage() {
  const legacyGlyph = window.location.pathname === GLYPH_PATH
  useEffect(() => { if (legacyGlyph) window.location.replace(glyphHref(codepointFromUrl())) }, [legacyGlyph])
  return legacyGlyph ? null : <GridScreen />
}
