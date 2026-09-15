import { useEffect, useMemo, useState } from 'react'
import { notoOutlineGhostPath } from '../src/services/notoOutlineInk'
import { approvedNotoInputs } from './notoBoundMaster'
import type { ApprovedNotoInput } from './notoBoundMaster'
import { allCorpusRows, CORPUS_TOTAL, corpusIdentity, parseCorpusReviews, REVIEW_STORAGE_KEY } from './notoCorpus'
import type { CorpusReviews, CorpusSnapshot } from './notoCorpus'
import { NotoCorpusMatrix } from './NotoCorpusMatrix'
import { notoPresetGlyphs } from './notoPresetGlyphs'
import type { NotoPresetGlyph } from './notoPresetGlyphs'
import { MobileWorkspaceShell } from './workspace/WorkspaceChrome'
import styles from './ReviewWorkspacePage.module.css'

/**
 * 검수 탭. 글자 격자에서 고른 글자의 Noto 실측 윤곽을 고스트로 깔고 역할면 기준선을 검수한다.
 * Noto 윤곽은 측정 원천·고스트·룩으로만 쓴다. 편집 대상이 아니고 잉크 union에도 들어가지 않는다.
 * 획(centerline) 마스터가 붙으면 이 고스트 위에 내 획을 겹쳐 편차를 본다.
 */

const VIEW_BOX = '-0.08 -0.08 1.16 1.16'
const GRID_PATH = '/workspace/review'
const GLYPH_PATH = '/workspace/review/glyph'
// export 기준선 id → 축·표시 이름. 길이(visibleLength) 타깃은 좌표가 아니라 그리지 않는다.
const BASELINE_RAILS: Record<string, { axis: 'x' | 'y'; label: string }> = {
  'initial.roleFaces.left': { axis: 'x', label: 'CH 왼선' }, 'initial.roleFaces.right': { axis: 'x', label: 'CH 오른선' },
  'initial.roleFaces.top': { axis: 'y', label: 'CH 윗선' }, 'initial.roleFaces.bottom': { axis: 'y', label: 'CH 밑선' },
  'final.roleFaces.right': { axis: 'x', label: 'JO 오른선' }, 'final.roleFaces.top': { axis: 'y', label: 'JO 윗선' },
  'medial.primaryBeam.face': { axis: 'y', label: 'JU 가로보' }, 'medial.upperBeam.face': { axis: 'y', label: 'JU 위보' }, 'medial.lowerBeam.face': { axis: 'y', label: 'JU 아래보' },
  'medial.baseStem.face': { axis: 'x', label: 'JU 줄기' }, 'medial.leftStem.face': { axis: 'x', label: 'JU 왼줄기' }, 'medial.rightStem.face': { axis: 'x', label: 'JU 오른줄기' },
}

interface Rail { id: string; axis: 'x' | 'y'; label: string; value: number }

function codepointFromUrl(): number {
  const character = new URLSearchParams(window.location.search).get('char') ?? ''
  const codepoint = character.codePointAt(0) ?? 0
  return codepoint >= 0xac00 && codepoint < 0xac00 + CORPUS_TOTAL ? codepoint : 0xac00
}

function glyphHref(codepoint: number): string {
  return `${GLYPH_PATH}?char=${encodeURIComponent(String.fromCodePoint(codepoint))}`
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

function useNotoGlyph(codepoint: number): { glyph: NotoPresetGlyph | null; error: string } {
  const [state, setState] = useState<{ codepoint: number; glyph: NotoPresetGlyph | null; error: string }>({ codepoint, glyph: null, error: '' })
  useEffect(() => {
    const controller = new AbortController()
    setState({ codepoint, glyph: null, error: '' })
    notoPresetGlyphs.glyph(codepoint, controller.signal)
      .then((glyph) => setState({ codepoint, glyph, error: '' }))
      .catch((failure: Error) => { if (!controller.signal.aborted) setState({ codepoint, glyph: null, error: failure.message }) })
    return () => controller.abort()
  }, [codepoint])
  return state.codepoint === codepoint ? state : { glyph: null, error: '' }
}

// 승인 번들은 모듈 상수라 codepoint 인덱스를 한 번만 만든다. 번들이 깨졌으면 전부 실측만으로 둔다.
const approvedByCodepoint: ReadonlyMap<number, ApprovedNotoInput> = (() => {
  try { return new Map(approvedNotoInputs().map((entry) => [entry.identity.codepoint, entry])) } catch { return new Map() }
})()
const approvedCount = approvedByCodepoint.size
const isApproved = (codepoint: number) => approvedByCodepoint.has(codepoint)

/** 승인 측정 = 사용자가 확인한 기준선 입력. 획 마스터 fit의 출발점이 될 글자다. */
function TierBadge({ approved, className }: { approved: boolean; className?: string }) {
  return <span className={`${styles.badge} ${className ?? ''}`} data-tier={approved ? 'approved' : 'measured'} data-testid="review-tier">{approved ? '승인 측정' : '실측만'}</span>
}

function baselineRails(glyph: NotoPresetGlyph): Rail[] {
  return Object.entries(glyph.baselines).flatMap(([id, value]) => {
    const spec = BASELINE_RAILS[id]
    return spec && Number.isFinite(value) ? [{ id, axis: spec.axis, label: spec.label, value }] : []
  })
}

function GhostCanvas({ ghost, rails, approved, selectedRail, onSelectRail, label }: {
  ghost: string
  rails: Rail[]
  approved: boolean
  selectedRail?: string
  onSelectRail?: (id: string) => void
  label: string
}) {
  return <svg className={styles.canvas} viewBox={VIEW_BOX} role="img" aria-label={label} data-testid="review-canvas">
    <defs>
      {/* 자소 원형 캔버스와 같은 눈금: 1/16 잔선 + 1/4 굵은선 */}
      <pattern id="review-grid-fine" width=".0625" height=".0625" patternUnits="userSpaceOnUse"><path d="M.0625 0V.0625H0" fill="none" stroke="rgb(218 223 230 / .7)" strokeWidth=".002" /></pattern>
      <pattern id="review-grid-coarse" width=".25" height=".25" patternUnits="userSpaceOnUse"><path d="M.25 0V.25H0" fill="none" stroke="rgb(196 203 212 / .8)" strokeWidth=".003" /></pattern>
    </defs>
    <rect x="0" y="0" width="1" height="1" fill="#fff" />
    <rect x="0" y="0" width="1" height="1" fill="url(#review-grid-fine)" data-testid="review-grid" />
    <rect x="0" y="0" width="1" height="1" fill="url(#review-grid-coarse)" />
    <rect x="0" y="0" width="1" height="1" fill="none" stroke="rgb(196 203 212)" strokeWidth=".004" />
    <path d="M-.06 .88H1.02" stroke="#a6a297" strokeWidth=".003" />
    {/* Noto 고스트. 잉크가 아니라 비교용이라 반투명으로 깐다. */}
    <path d={ghost} fill="#3a3a36" fillOpacity={approved ? 0.55 : 0.7} fillRule="evenodd" data-testid="review-ghost" />
    {rails.map((rail) => {
      const selected = rail.id === selectedRail
      const stroke = selected ? '#f0561e' : approved ? '#3b6fd6' : '#8a8577'
      const geometry = rail.axis === 'x' ? { x1: rail.value, x2: rail.value, y1: -0.06, y2: 1.02 } : { x1: -0.06, x2: 1.02, y1: rail.value, y2: rail.value }
      const text = rail.axis === 'x' ? { x: rail.value + 0.012, y: -0.025 } : { x: -0.05, y: rail.value - 0.012 }
      return <g key={rail.id} data-rail={rail.id} data-selected={selected || undefined}>
        <line {...geometry} stroke={stroke} strokeWidth={selected ? 0.008 : 0.004} strokeDasharray={approved ? undefined : '.012 .008'} />
        {onSelectRail && <line {...geometry} className={styles.railButton} stroke="transparent" strokeWidth=".06" role="button" tabIndex={0} aria-label={`${rail.label} 보기`} aria-pressed={selected} onClick={() => onSelectRail(rail.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelectRail(rail.id) } }} />}
        <text {...text} fontSize=".032" fill={stroke}>{rail.label}</text>
      </g>
    })}
  </svg>
}

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

  return <MobileWorkspaceShell activeArea="review" statusLabel="검수 · 글자 격자">
    <section className={styles.titleSection}>
      <span className={styles.screenId}>R-01 · 검수</span>
      <h1>글자 격자<small>Noto 고스트 · {snapshot ? `${snapshot.rows.length.toLocaleString()}자 추출` : '읽는 중'}</small></h1>
      <nav className={styles.segment} aria-label="검수 보기"><a href="/">문장</a><span aria-current="page">격자</span></nav>
    </section>
    <div className={styles.scroll}>
      {error && <p className={styles.status} data-state="error" role="alert">{error}</p>}
      {/* 칸 탭 = 선택, 선택된 칸 다시 탭 = 글자 화면. 키보드 화살표 이동은 선택만 바꾼다. */}
      {rows.length > 0 && <div className={styles.matrixSection}><NotoCorpusMatrix rows={rows} reviews={reviews} selected={selected} onSelect={(codepoint) => { if (codepoint === selected) window.location.assign(glyphHref(codepoint)); else setSelected(codepoint) }} isHighlighted={() => true} noFinal={false} tierOf={(row) => isApproved(row.identity.codepoint) ? 'editable' : 'readonly'} /><p className={styles.status}>파란 테두리 칸 = 승인 측정 {approvedCount}자(획 마스터 fit 출발점). 나머지는 실측 기준선만.</p></div>}
      <a className={styles.pick} href={glyphHref(selected)} data-testid="review-pick">
        <GlyphMini codepoint={selected} />
        <span className={styles.pickBody}>
          <strong>선택 · {identity.character}</strong>
          <small>{identity.initialJamo} + {identity.medialJamo}{identity.finalJamo ? ` + ${identity.finalJamo}` : ' · 받침 없음'}</small>
          <TierBadge approved={isApproved(selected)} />
          <small className={styles.hint}>카드 탭 또는 같은 칸 다시 탭 → 글자 열기</small>
        </span>
        <span aria-hidden="true">›</span>
      </a>
    </div>
  </MobileWorkspaceShell>
}

function GlyphTitle({ codepoint, approved }: { codepoint: number; approved: boolean }) {
  const character = String.fromCodePoint(codepoint)
  return <section className={styles.titleSection}>
    <span className={styles.screenId}>R-02 · 검수 › 글자</span>
    <h1>{character}<small>{approved ? '승인 측정 검수' : '실측 보기'}</small></h1>
    <nav className={styles.segment} aria-label="검수 보기"><a href={`${GRID_PATH}?char=${encodeURIComponent(character)}`}>‹ 격자</a><span aria-current="page">글자</span></nav>
  </section>
}

function GlyphView({ glyph }: { glyph: NotoPresetGlyph }) {
  const codepoint = glyph.identity.codepoint
  const approved = isApproved(codepoint)
  const ghost = useMemo(() => notoOutlineGhostPath(glyph.outline), [glyph])
  const rails = useMemo(() => baselineRails(glyph), [glyph])
  const [selectedRail, setSelectedRail] = useState<string | undefined>()
  const focused = rails.find((rail) => rail.id === selectedRail)
  return <MobileWorkspaceShell activeArea="review" statusLabel={approved ? '검수 · 승인 측정' : '검수 · 실측 보기'}>
    <GlyphTitle codepoint={codepoint} approved={approved} />
    <div className={styles.scroll}>
      <p className={styles.context}>{glyph.identity.initialJamo} + {glyph.identity.medialJamo}{glyph.identity.finalJamo ? ` + ${glyph.identity.finalJamo}` : ''} · <b>{approved ? '승인 측정 있음' : '승인 추출 없음'}</b> · Noto 고스트</p>
      <section className={styles.canvasSection}>
        {'path' in ghost ? <GhostCanvas ghost={ghost.path} rails={rails} approved={approved} selectedRail={selectedRail} onSelectRail={setSelectedRail} label={`${glyph.identity.character} Noto 고스트`} /> : <p className={styles.warning} role="alert">{ghost.error}</p>}
        <TierBadge approved={approved} className={styles.canvasBadge} />
      </section>
      <div className={styles.head}><span>기준선 실측<small>Noto · 1000 u{focused ? ` · ${focused.label} 선택` : ''}</small></span><span>{rails.length}개</span></div>
      <div className={styles.values} data-testid="review-values">
        {rails.map((rail) => <button type="button" className={styles.cell} key={rail.id} aria-pressed={rail.id === selectedRail} onClick={() => setSelectedRail(rail.id)}><span><span className={styles.key}>{rail.label}</span><span className={styles.value}>{(rail.value * 1000).toFixed(1)}<small>u</small></span></span><i className={styles.bar} style={{ '--p': `${Math.round(rail.value * 100)}%` } as React.CSSProperties} /></button>)}
      </div>
      <p className={styles.locked}>{approved ? '획 마스터 fit · 1단계에서 열림' : '기준선 편집 · 추출 승인 뒤 열림'}</p>
    </div>
  </MobileWorkspaceShell>
}

function GlyphScreen() {
  const codepoint = codepointFromUrl()
  const { glyph, error } = useNotoGlyph(codepoint)
  if (glyph) return <GlyphView key={codepoint} glyph={glyph} />
  return <MobileWorkspaceShell activeArea="review" statusLabel="검수 · 실측 보기">
    <GlyphTitle codepoint={codepoint} approved={isApproved(codepoint)} />
    <p className={styles.status} data-state={error ? 'error' : 'loading'} role={error ? 'alert' : 'status'}>{error || 'Noto 윤곽 읽는 중'}</p>
  </MobileWorkspaceShell>
}

export function ReviewWorkspacePage() {
  return window.location.pathname === GLYPH_PATH ? <GlyphScreen /> : <GridScreen />
}
