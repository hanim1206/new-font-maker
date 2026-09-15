import { useEffect, useMemo, useState } from 'react'
import { allCorpusRows, CORPUS_TOTAL, corpusCodepoint, corpusIdentity, corpusProgress, corpusRecordingPath, hasRejection, isCompleteCandidate, isReviewed, parseCorpusReviews, PART_STAGES, REVIEW_STORAGE_KEY, reviewFor, STAGE_LABEL, STATUS_LABEL } from './notoCorpus'
import type { ComponentMeasurement, CorpusDetail, CorpusModelPrediction, CorpusReviews, CorpusRow, CorpusSnapshot, MedialMeasurement, PartStage, RawCorpusOutline } from './notoCorpus'
import styles from './NotoCorpusLabPage.module.css'
import { NotoCorpusMatrix } from './NotoCorpusMatrix'
import { NotoPresetInspector } from './NotoPresetInspector'
import { notoConflictingParts } from './notoRoleIntegrity'

const PART_COLOR = { initial: '#db6228', medial: '#2472bc', final: '#238370' }
// 예측 기준선은 실측(주황 실선)과 대비되게 보라 점선으로 그린다.
const MODEL_COLOR = '#7c3aed'
// 타깃 → 어느 단계 색·짧은 이름. 단계 B는 첫닿밑선 하나.
const MODEL_TARGET_LABEL: Record<string, string> = { 'initial.roleFaces.bottom': '첫닿밑선' }
const REASON_LABEL: Record<string, string> = { 'context-contract-not-expanded': '실제 문맥 추출 계약이 아직 확장되지 않았습니다.', 'no-role-match': '역할에 맞는 외곽면을 찾지 못했습니다.', 'incomplete-required-medial-roles': '필수 홀자 역할이 일부 빠져 있습니다.', 'no-axis-face': '일부 보조 축평행 면이 없습니다. 필수 역할면 상태와 구분합니다.', 'extractor-error': '추출 중 실행 오류가 발생했습니다.', 'medial-anchor-role-conflict': '홀자 후보와 첫닿자 구조의 역할이 충돌합니다. 기준선 맞음 승인을 차단했습니다.', 'final-separation-unproven': '첫닿자와 받침의 분리 증명이 부족해 자동 포기했습니다. 임의 절단으로 채우지 않습니다.' }
const number = (value: number) => value.toLocaleString('ko-KR')
const percent = (value: number, total: number) => total ? `${(value / total * 100).toFixed(2)}%` : '해당 없음'

function loadReviews(): { entries: CorpusReviews; error: string } {
  try { return { entries: parseCorpusReviews(localStorage.getItem(REVIEW_STORAGE_KEY)), error: '' } }
  catch (error) { return { entries: {}, error: error instanceof Error ? error.message : '검수 저장소를 읽을 수 없습니다.' } }
}

async function getJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal, cache: 'no-store' })
  const value = await response.json()
  if (!response.ok) throw new Error(value.error ?? '관측 자료를 읽지 못했습니다.')
  return value as T
}

function Metric({ title, value, total, description }: { title: string; value: number; total: number; description: string }) {
  return <article className={styles.metric} aria-label={title}><span>{title}</span><strong>{number(value)}<small> / {number(total)}</small></strong><progress max={total || 1} value={value} /><p>{percent(value, total)} · {description}</p></article>
}

type GuideStyle = 'line' | 'box'
const FACE_ORIENTATION: Record<string, 'vertical' | 'horizontal'> = { left: 'vertical', right: 'vertical', top: 'horizontal', bottom: 'horizontal' }
const CANVAS_EDGE = [-0.12, 1.12] as const
// 글자 영역 안 배경 격자: 0.1 간격, 0.5 중심선만 조금 진하게
const GRID_MINOR = [1, 2, 3, 4, 6, 7, 8, 9].map((step) => `M${step / 10} 0V1M0 ${step / 10}H1`).join('')
const GRID_MAJOR = 'M.5 0V1M0 .5H1'
const faceLine = (orientation: 'vertical' | 'horizontal', face: number) => orientation === 'vertical'
  ? { x1: face, x2: face, y1: CANVAS_EDGE[0], y2: CANVAS_EDGE[1] }
  : { x1: CANVAS_EDGE[0], x2: CANVAS_EDGE[1], y1: face, y2: face }

function GuideCanvas({ detail, visible, guideStyle, model }: { detail: CorpusDetail; visible: Record<PartStage, boolean>; guideStyle: GuideStyle; model: CorpusModelPrediction[] }) {
  const drawing = useMemo(() => {
    try {
      const outline = detail.stages.outline?.observation as RawCorpusOutline | null
      if (!outline || !Array.isArray(outline.operations) || !Number.isFinite(outline.unitsPerEm) || outline.unitsPerEm <= 0) return { path: '', upm: 1000, error: '' }
      return { path: corpusRecordingPath(outline.operations), upm: outline.unitsPerEm, error: '' }
    } catch (error) { return { path: '', upm: 1000, error: error instanceof Error ? error.message : '윤곽 표시 실패' } }
  }, [detail])
  if (!drawing.path) return <div className={styles.emptyCanvas} data-testid="corpus-no-outline">{drawing.error || '이 글자는 아직 원본 윤곽이 없습니다. 대체 글자를 그리지 않습니다.'}</div>
  const medial = (detail.stages.medial?.measurements ?? {}) as Record<string, MedialMeasurement>
  return <svg viewBox="-0.12 -0.12 1.24 1.24" className={styles.canvas} role="img" aria-label={`${detail.identity.character} 실제 Noto 윤곽과 추출 기준선`} data-testid="corpus-outline">
    <rect x="0" y="0" width="1" height="1" fill="white" stroke="#d8e1e9" strokeWidth=".003" />
    <path d={GRID_MINOR} stroke="#edf1f5" strokeWidth="1" vectorEffect="non-scaling-stroke" data-grid="minor" />
    <path d={GRID_MAJOR} stroke="#d9e2ea" strokeWidth="1" vectorEffect="non-scaling-stroke" data-grid="major" />
    <path d="M-.1 .88H1.1" stroke="#9aaec1" strokeWidth=".002" />
    {guideStyle === 'box' && <>
      {(['initial', 'final'] as const).map((stage) => {
        const area = (detail.stages[stage]?.measurements as ComponentMeasurement | undefined)?.selectionArea
        return visible[stage] && area ? <rect key={stage} {...area} fill={PART_COLOR[stage]} fillOpacity=".12" stroke={PART_COLOR[stage]} strokeWidth="2" strokeDasharray="6 4" vectorEffect="non-scaling-stroke" data-testid={`corpus-guide-${stage}`} /> : null
      })}
      {visible.medial && <g data-testid="corpus-guide-medial">{Object.entries(medial).flatMap(([id, value]) => value.visibleSpans.map((span, index) => <line key={`${id}-${index}`} x1={value.orientation === 'vertical' ? value.face : span.from} x2={value.orientation === 'vertical' ? value.face : span.to} y1={value.orientation === 'vertical' ? span.from : value.face} y2={value.orientation === 'vertical' ? span.to : value.face} stroke={PART_COLOR.medial} strokeWidth="5" vectorEffect="non-scaling-stroke"><title>{id} · {value.face.toFixed(5)}</title></line>))}</g>}
    </>}
    <path d={drawing.path} transform={`matrix(${1 / drawing.upm} 0 0 ${-1 / drawing.upm} 0 .88)`} fill="#172b3d" data-source="actual-font-outline" />
    {/* 선 방식은 윤곽 위에 그려 면이 획 가장자리와 맞는지 바로 보이게 한다. */}
    {guideStyle === 'line' && <>
      {(['initial', 'final'] as const).map((stage) => {
        const measurement = detail.stages[stage]?.measurements as ComponentMeasurement | undefined
        const area = measurement?.selectionArea
        const faces = measurement?.roleFaces ?? (area ? { top: area.y, bottom: area.y + area.height, left: area.x, right: area.x + area.width } : null)
        return visible[stage] && faces ? <g key={stage} data-testid={`corpus-guide-${stage}`}>{Object.entries(faces).filter(([side, value]) => FACE_ORIENTATION[side] && Number.isFinite(value)).map(([side, value]) => <line key={side} {...faceLine(FACE_ORIENTATION[side], value)} stroke={PART_COLOR[stage]} strokeWidth="1.5" strokeOpacity=".9" vectorEffect="non-scaling-stroke"><title>{STAGE_LABEL[stage]} {side} · {value.toFixed(5)}</title></line>)}</g> : null
      })}
      {visible.medial && <g data-testid="corpus-guide-medial">{Object.entries(medial).map(([id, value]) => <line key={id} {...faceLine(value.orientation, value.face)} stroke={PART_COLOR.medial} strokeWidth="2" strokeOpacity=".9" vectorEffect="non-scaling-stroke"><title>{id} · {value.face.toFixed(5)}</title></line>)}</g>}
    </>}
    {/* 예측 기준선: 실측과 같은 좌표계에 보라 점선. 실선(실측)과의 간극이 잔차다. */}
    {model.filter((prediction) => visible.initial && prediction.target === 'initial.roleFaces.bottom').map((prediction) => (
      <line key={prediction.target} {...faceLine('horizontal', prediction.predicted / 1000)} stroke={MODEL_COLOR} strokeWidth="1.6" strokeDasharray="7 5" vectorEffect="non-scaling-stroke" data-testid="corpus-model-initial-bottom">
        <title>{MODEL_TARGET_LABEL[prediction.target]} 예측 {(prediction.predicted / 1000).toFixed(5)} · 잔차 {prediction.residual >= 0 ? '+' : ''}{prediction.residual.toFixed(1)}u</title>
      </line>
    ))}
  </svg>
}

export function NotoCorpusLabPage() {
  const [snapshot, setSnapshot] = useState<CorpusSnapshot | null>(null)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [scope, setScope] = useState('all')
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0xac00)
  const [detail, setDetail] = useState<CorpusDetail | null>(null)
  const [detailError, setDetailError] = useState('')
  const [reviewState, setReviewState] = useState(loadReviews)
  const [guideStyle, setGuideStyle] = useState<GuideStyle>('line')
  const [showGuides, setShowGuides] = useState(true)
  const [parts, setParts] = useState<Record<PartStage, boolean>>({ initial: true, medial: true, final: true })

  useEffect(() => {
    const controller = new AbortController()
    setError('')
    void getJson<CorpusSnapshot>('/api/noto-corpus', controller.signal).then(setSnapshot).catch((failure: Error) => { if (!controller.signal.aborted) setError(failure.message) })
    return () => controller.abort()
  }, [refresh])

  useEffect(() => {
    if (!snapshot) return
    const controller = new AbortController()
    setDetail(null)
    setDetailError('')
    void getJson<CorpusDetail>(`/api/noto-corpus/glyph/${selected}`, controller.signal).then((value) => {
      if (value.identity.codepoint !== selected) throw new Error('선택 글자와 응답이 다릅니다.')
      setDetail(value)
    }).catch((failure: Error) => { if (!controller.signal.aborted) setDetailError(failure.message) })
    return () => controller.abort()
  }, [snapshot, selected])

  useEffect(() => {
    const onStorage = (event: StorageEvent) => { if (event.key === REVIEW_STORAGE_KEY) setReviewState(loadReviews()) }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const allRows = useMemo(() => snapshot ? allCorpusRows(snapshot) : [], [snapshot])
  const overall = useMemo(() => corpusProgress(allRows, reviewState.entries), [allRows, reviewState.entries])
  const scoped = useMemo(() => scope === 'no-final' ? allRows.filter((row) => row.identity.finalJamo === null) : allRows, [allRows, scope])
  const progress = useMemo(() => corpusProgress(scoped, reviewState.entries), [scoped, reviewState.entries])
  // 격자에서는 조건에 맞지 않는 칸을 숨기지 않고 흐리게만 한다.
  const matchesFilter = (row: CorpusRow) => {
    if (filter === 'processed') return row.stages.outline.status !== 'unprocessed'
    if (filter === 'candidate') return isCompleteCandidate(row) && !isReviewed(row, reviewState.entries)
    if (filter === 'missing') return Object.values(row.stages).some((stage) => ['partial', 'abstained', 'blocked', 'error'].includes(stage.status))
    if (filter === 'unsupported') return Object.values(row.stages).some((stage) => stage.status === 'unsupported')
    if (filter === 'unprocessed') return row.stages.outline.status === 'unprocessed'
    if (filter === 'reviewed') return isReviewed(row, reviewState.entries)
    if (filter === 'rejected') return hasRejection(row, reviewState.entries)
    return true
  }
  const searchHits = useMemo(() => [...new Set(query)].map((character) => character.codePointAt(0) ?? 0).filter((codepoint) => codepoint >= 0xac00 && codepoint < 0xac00 + CORPUS_TOTAL).slice(0, 48), [query])
  const selectedRow = allRows.find((row) => row.identity.codepoint === selected)
  const visible = Object.fromEntries(PART_STAGES.map((stage) => [stage, showGuides && parts[stage]])) as Record<PartStage, boolean>
  const selectCharacter = (codepoint: number) => {
    if (scope === 'no-final' && corpusIdentity(codepoint).finalJamo !== null) setScope('all')
    setSelected(codepoint)
  }
  const showNoFinal = () => {
    const identity = corpusIdentity(selected)
    setScope('no-final')
    setSelected(corpusCodepoint(identity.initialJamo, identity.medialJamo, null))
  }

  const saveReview = (stage: PartStage, verdict: 'approved' | 'rejected' | null) => {
    if (!detail || detail.identity.codepoint !== selected) return
    const entry = detail.row.stages[stage]
    if (!entry.reviewKey || verdict === 'approved' && (entry.status !== 'candidate' || !visible[stage] || detail.row.stages.outline.status !== 'candidate')) return
    try {
      const latest = parseCorpusReviews(localStorage.getItem(REVIEW_STORAGE_KEY))
      if (verdict === null) delete latest[entry.reviewKey]
      else latest[entry.reviewKey] = { verdict, note: reviewFor(detail.row, stage, latest)?.note ?? '', reviewedAt: new Date().toISOString() }
      localStorage.setItem(REVIEW_STORAGE_KEY, JSON.stringify({ schema: REVIEW_STORAGE_KEY, entries: latest }))
      setReviewState({ entries: latest, error: '' })
    } catch (failure) { setReviewState((current) => ({ ...current, error: failure instanceof Error ? failure.message : '검수 기록 저장 실패' })) }
  }

  return <main className={styles.page} data-testid="noto-corpus-lab">
    <header className={styles.hero}><div><span className={styles.eyebrow}>NOTO SANS KR · 추출에서 프리셋까지</span><h1>얼마나 뽑았고,<br />어디까지 확인했나.</h1><p>자동 추출 후보와 사람이 확인한 기준선은 다릅니다.<br />글자 상세 아래에서 승인 입력 57자의 마스터와 기준선 편집을 비교할 수 있습니다.</p></div><nav><a href="/font-guide-lab?font=noto-sans-kr">기준선 조율 랩</a><a href="/preset-candidate-lab">기존 프리셋 비교 실험</a><button type="button" onClick={() => setRefresh((value) => value + 1)}>최신 집계 다시 읽기</button></nav></header>
    {error && <p role="alert" className={styles.alert}>{error}</p>}
    {!snapshot ? <p className={styles.notice}>로컬 추출 보고서를 읽는 중입니다.</p> : <>
      <section className={styles.scopeBar}><div><strong>분모 선택</strong><button type="button" aria-pressed={scope === 'all'} onClick={() => setScope('all')}>현대 한글 전체 11,172자</button><button type="button" aria-pressed={scope === 'no-final'} onClick={showNoFinal}>무받침 399자</button></div><small>보고서 시각 {new Date(snapshot.updatedAt).toLocaleString('ko-KR')}</small></section>
      <div className={styles.metrics}>
        <Metric title="추출 시도" value={progress.attempted} total={progress.total} description="배치가 처리한 글자" />
        <Metric title="필수 역할 후보" value={progress.complete} total={progress.total} description="모든 자모 필수값 확보 · 정확도 승인 아님" />
        <Metric title="내가 확인한 글자" value={progress.reviewed} total={progress.total} description="이 브라우저에서 필요한 자모 모두 확인" />
        <Metric title="아직 미처리" value={progress.total - progress.attempted} total={progress.total} description="레거시 좌표로 채우지 않음" />
      </div>
      <section className={styles.coverage} aria-label="역할별 추출 범위">{(['outline', ...PART_STAGES] as const).map((stage) => <div key={stage}><span>{STAGE_LABEL[stage]}</span><strong>{number(progress[stage])} / {number(stage === 'final' ? progress.finalTotal : progress.total)}</strong><small>{percent(progress[stage], stage === 'final' ? progress.finalTotal : progress.total)} · {stage === 'outline' ? '윤곽 확보' : '필수값 후보'}</small></div>)}</section>
      <p className={styles.notice}>코드 테스트 통과는 글자 검수 통과가 아닙니다. 기존 가·고·과 등의 승인 원본은 유지하며, 이 새 배치에는 승인을 자동 상속하지 않습니다. 검수 기록은 이 브라우저에만 저장되고 프리셋·OTF에 자동 적용되지 않습니다.</p>
      {reviewState.error && <p role="alert" className={styles.alert}>{reviewState.error}</p>}
      {snapshot.warnings.map((warning) => <p key={warning} className={styles.alert}>{warning}</p>)}
      <section className={styles.stagePanel} aria-label="전체 개발 단계 진척" data-testid="corpus-stage-progress">
        <header><h2>전체 개발 단계 진척</h2><p>서로 다른 작업을 임의의 종합 %로 합치지 않습니다. 수치는 최신 로컬 배치 보고서와 승인 입력 artifact 기준입니다.</p></header>
        <ol>
          <li data-testid="stage-extraction"><strong>1 · 기준선 추출</strong><progress max={11172} value={overall.attempted} /><span>{number(overall.attempted)} / 11,172자 시도 ({percent(overall.attempted, 11172)}) · 모든 필수 역할 후보 {number(overall.complete)}자</span></li>
          <li data-testid="stage-analysis"><strong>2 · 변화량 분석</strong><span>같은 홀자·받침의 ㄱ 첫닿자 대비 역할 비교 {number(snapshot.deltaCount)}건 수집 · 편집 규칙 변환은 미완료</span></li>
          <li data-testid="stage-generation"><strong>3 · 생성 규칙 연결</strong><span>{snapshot.approvedInputCount === null ? '승인 입력 artifact 기록 없음' : `사용자 승인 입력 ${number(snapshot.approvedInputCount)}자만 마스터 결속`} · 자동 후보는 연결하지 않음</span></li>
          <li data-testid="stage-editing"><strong>4 · 기준선 편집</strong><span>승인 입력의 임시 편집·복원만 가능 · 편집 저장과 프리셋 적용 미구현</span></li>
          <li data-testid="stage-otf"><strong>5 · OTF 출력</strong><span>미착수 · 미지원 글자를 레거시로 채워 내보내지 않습니다</span></li>
        </ol>
      </section>
      <div className={styles.workspace}>
        <section className={styles.browser} aria-label="전체 글자 탐색"><header><h2>글자 격자</h2><p>시트를 고르고 문제 칸이 몰린 줄부터 확인하세요. 상태 강조는 칸을 숨기지 않고 흐리게만 합니다.</p></header><div className={styles.filters}>
          <label>상태 강조<select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">전체 보기</option><option value="processed">추출 시도한 글자</option><option value="candidate">필수값 후보 · 검수 대기</option><option value="missing">누락·자동 포기·오류</option><option value="unsupported">문맥 미지원</option><option value="unprocessed">아직 미추출</option><option value="reviewed">내 검수 완료</option><option value="rejected">문제 표시한 글자</option></select></label>
          <label className={styles.search}>글자 검색<input placeholder="예: 가고과너" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        </div>
          {searchHits.length > 0 && <div className={styles.searchHits} aria-label="검색한 글자">{searchHits.map((codepoint) => <button key={codepoint} type="button" data-testid="corpus-character" aria-pressed={codepoint === selected} onClick={() => selectCharacter(codepoint)}>{String.fromCodePoint(codepoint)}</button>)}</div>}
          <NotoCorpusMatrix rows={allRows} reviews={reviewState.entries} selected={selected} onSelect={selectCharacter} isHighlighted={matchesFilter} noFinal={scope === 'no-final'} />
        </section>
        <section className={styles.inspector} aria-label="선택 글자 검수" data-testid="corpus-inspector"><header><div><span className={styles.eyebrow}>실제 원본과 관측</span><h2>{selectedRow?.identity.character ?? '가'} <small>{selectedRow ? `${selectedRow.identity.initialJamo} + ${selectedRow.identity.medialJamo} · ${selectedRow.identity.finalJamo ?? '무받침'}` : ''}</small></h2></div><button type="button" onClick={() => setShowGuides((value) => !value)} aria-pressed={showGuides}>{showGuides ? '기준선 숨기기' : '기준선 보이기'}</button></header>
          <div className={styles.legend}>{PART_STAGES.map((stage) => <label key={stage} style={{ color: PART_COLOR[stage] }}><input type="checkbox" checked={parts[stage]} onChange={(event) => setParts((current) => ({ ...current, [stage]: event.target.checked }))} />{STAGE_LABEL[stage]}</label>)}<div className={styles.guideStyle} role="group" aria-label="기준선 표시 방식"><button type="button" aria-pressed={guideStyle === 'line'} onClick={() => setGuideStyle('line')}>선</button><button type="button" aria-pressed={guideStyle === 'box'} onClick={() => setGuideStyle('box')}>박스</button></div></div>
          {detailError && <p role="alert" className={styles.alert}>{detailError}</p>}
          {detail && detail.identity.codepoint === selected ? <><GuideCanvas detail={detail} visible={visible} guideStyle={guideStyle} model={detail.model} /><p className={styles.caption}>{guideStyle === 'line' ? '선: 역할 기준면을 캔버스 끝까지 연장' : '박스: 닿자 구조 선택 영역 · 홀자 실제 노출 구간'}<br />검은 윤곽은 Noto 원본입니다. 생성본이나 레거시 자모가 아닙니다.</p>
          {detail.model.length > 0 && <div className={styles.modelPanel} data-testid="corpus-model-panel">
            <header><strong style={{ color: MODEL_COLOR }}>변화량 모델 예측</strong><span>실측(주황 실선) vs 예측(보라 점선). 대표값 + 첫닿·홀자·받침 효과. 승인이 아니라 확인용입니다.</span></header>
            {detail.model.map((prediction) => <div key={prediction.target} data-testid={`corpus-model-${prediction.target}`} data-exception={prediction.exception}>
              <span>{MODEL_TARGET_LABEL[prediction.target] ?? prediction.target}<small> · {prediction.layer}{prediction.confidence === 'low' ? ' · 저신뢰' : ''}</small></span>
              <span>실측 {(prediction.actual / 1000).toFixed(5)} · 예측 {(prediction.predicted / 1000).toFixed(5)}</span>
              <strong>잔차 {prediction.residual >= 0 ? '+' : ''}{prediction.residual.toFixed(1)}u {prediction.exception ? `· 예외(임계 ${prediction.threshold}u 초과) 실측 보존` : '· 모델 내'}</strong>
            </div>)}
          </div>}
          <div className={styles.partReviews}>{PART_STAGES.map((stage) => {
            const value = detail.row.stages[stage]
            const review = reviewFor(detail.row, stage, reviewState.entries)
            const canReview = Boolean(value.reviewKey && detail.stages[stage]?.observation && detail.stages.outline?.status === 'candidate' && !reviewState.error)
            const roleConflict = notoConflictingParts(detail).has(stage)
            return <article key={stage} data-testid={`corpus-review-${stage}`}>
              <header><strong style={{ color: PART_COLOR[stage] }}>{STAGE_LABEL[stage]}</strong><span>{roleConflict ? '역할 충돌 · 승인 차단' : STATUS_LABEL[value.status]}</span></header>
              {roleConflict && <p role="alert">다른 자모와 원본 윤곽을 공유합니다. 추출 수정 전에는 기준선 맞음으로 승인할 수 없습니다.</p>}
              {value.reasonCodes.filter((reason) => reason !== 'no-final').map((reason) => <p key={reason}>{REASON_LABEL[reason] ?? reason}</p>)}
              {review && <p className={styles.reviewVerdict}>{review.verdict === 'approved' ? '내 검수: 맞음' : '내 검수: 문제 있음'}</p>}
              {value.status !== 'not-applicable' && <>
                <div className={styles.reviewButtons}>
                  <button type="button" disabled={!canReview || roleConflict || value.status !== 'candidate' || !visible[stage] || detail.row.stages.initial.reasonCodes.includes('medial-anchor-role-conflict')} onClick={() => saveReview(stage, 'approved')}>기준선 맞음</button>
                  <button type="button" disabled={!canReview} onClick={() => saveReview(stage, 'rejected')}>문제 있음</button>
                  <button type="button" disabled={!review} onClick={() => saveReview(stage, null)}>검수 취소</button>
                </div>
                {value.status === 'candidate' && !value.reviewKey && <p>검수 버전 키가 없습니다. 배치를 한 번 갱신하세요.</p>}
              </>}
            </article>
          })}</div><NotoPresetInspector detail={detail} rejected={hasRejection(detail.row, reviewState.entries)} showGuides={showGuides} /><details className={styles.source}><summary>수치·근거 JSON 보기</summary><p>폰트 SHA {detail.font.fileSha256}</p><p>추출 버전·관측 내용이 바뀌면 이전 검수 결과를 자동 상속하지 않습니다.</p><a href={`/api/noto-corpus/glyph/${selected}`} target="_blank" rel="noreferrer">이 글자 원본 관측 JSON 열기</a><pre>{JSON.stringify(Object.fromEntries(PART_STAGES.map((stage) => [stage, detail.stages[stage]?.measurements ?? null])), null, 2)}</pre></details></> : !detailError && <p className={styles.notice}>선택한 글자의 윤곽만 읽는 중입니다.</p>}
        </section>
      </div>
      <footer className={styles.footer}>개발 완료율 하나로 합산하지 않습니다. 전수 추출 → 분석 규칙 → 생성·편집 → 출력이 각각 완성되어야 합니다. 이 화면은 로컬 배치의 마지막 보고서를 읽습니다.</footer>
    </>}
  </main>
}
