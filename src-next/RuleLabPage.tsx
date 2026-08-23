import { useEffect, useMemo, useState } from 'react'
import { CHOSEONG_MAP } from '../src/data/Hangul'
import type { StrokeDataV2 } from '../src/types'
import { pointsToSvgD } from '../src/utils/pathUtils'
import {
  JAMO_REFERENCE,
  analyzeTerminal,
  createObservation,
  directionOf,
  type ApplicationScope,
  type RuleLabJamo,
  type TerminalSide,
} from './ruleLabMetadata'
import styles from './RuleLabPage.module.css'

const JAMO_OPTIONS: RuleLabJamo[] = ['ㄱ', 'ㄴ', 'ㄷ', 'ㄹ']
const SCOPE_OPTIONS: ApplicationScope[] = ['이 지점만', '같은 자모', '같은 끝 형태', '직접 지정']
const STORAGE_KEY = 'font-maker-rule-lab-drafts'
const VIEW_BOX = 1000
const BOX = { x: 0.16, y: 0.16, width: 0.68, height: 0.68 }

interface DraftAnnotation {
  etiquette: string
  scope: ApplicationScope
  scopeNote: string
}

type DraftMap = Record<string, DraftAnnotation>

function loadDrafts(): DraftMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const saved = JSON.parse(raw) as Record<string, Partial<DraftAnnotation>>
    return Object.fromEntries(Object.entries(saved).map(([key, value]) => [key, {
      etiquette: typeof value.etiquette === 'string' ? value.etiquette : '',
      scope: SCOPE_OPTIONS.includes(value.scope as ApplicationScope) ? value.scope as ApplicationScope : '이 지점만',
      scopeNote: typeof value.scopeNote === 'string' ? value.scopeNote : '',
    }]))
  } catch {
    return {}
  }
}

function terminalKey(jamo: RuleLabJamo, pathId: string, side: TerminalSide): string {
  return `${jamo}:${pathId}:${side}`
}

function absolutePoint(point: { x: number; y: number }): { x: number; y: number } {
  return { x: (BOX.x + point.x * BOX.width) * VIEW_BOX, y: (BOX.y + point.y * BOX.height) * VIEW_BOX }
}

export function RuleLabPage() {
  const [jamo, setJamo] = useState<RuleLabJamo>('ㄱ')
  const [side, setSide] = useState<TerminalSide>('start')
  const [drafts, setDrafts] = useState<DraftMap>(loadDrafts)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const data = CHOSEONG_MAP[jamo]
  const stroke = data.strokes?.[0] as StrokeDataV2
  const key = terminalKey(jamo, stroke.id, side)
  const draft = drafts[key] ?? { etiquette: '', scope: '이 지점만', scopeNote: '' }
  const observation = useMemo(
    () => createObservation(jamo, stroke, side, draft.etiquette, draft.scope, draft.scopeNote),
    [draft.etiquette, draft.scope, draft.scopeNote, jamo, side, stroke],
  )
  const json = JSON.stringify({ reference: JAMO_REFERENCE[jamo], observation }, null, 2)
  const path = pointsToSvgD(stroke.points, stroke.closed, BOX, VIEW_BOX)
  const start = absolutePoint(stroke.points[0])
  const end = absolutePoint(stroke.points[stroke.points.length - 1])
  const comparisonRows = JAMO_OPTIONS.flatMap((rowJamo) => {
    const rowStroke = CHOSEONG_MAP[rowJamo].strokes?.[0] as StrokeDataV2
    return (['start', 'end'] as TerminalSide[]).map((rowSide) => {
      const rowKey = terminalKey(rowJamo, rowStroke.id, rowSide)
      return {
        jamo: rowJamo,
        side: rowSide,
        key: rowKey,
        geometry: analyzeTerminal(rowStroke, rowSide),
        draft: drafts[rowKey] ?? { etiquette: '', scope: '이 지점만' as ApplicationScope, scopeNote: '' },
      }
    })
  })

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts))
  }, [drafts])

  const updateDraft = (patch: Partial<DraftAnnotation>) => {
    setDrafts((current) => ({ ...current, [key]: { ...draft, ...patch } }))
  }

  const updateRowDraft = (rowKey: string, rowDraft: DraftAnnotation, patch: Partial<DraftAnnotation>) => {
    setDrafts((current) => ({ ...current, [rowKey]: { ...rowDraft, ...patch } }))
  }

  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(json)
      setCopyState('copied')
    } catch {
      setCopyState('failed')
    }
    window.setTimeout(() => setCopyState('idle'), 1400)
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div><span>실험 도구</span><h1>형태 규칙 실험실</h1><p>형태의 예절과 일괄 적용 범위를 사용자와 AI가 함께 정합니다.</p></div>
        <a href="/">보정 화면으로</a>
      </header>

      <div className={styles.layout}>
        <section className={styles.stage} aria-label="자모 형태 선택">
          <div className={styles.jamoTabs} role="tablist" aria-label="자모 선택">
            {JAMO_OPTIONS.map((option) => <button key={option} type="button" role="tab" aria-selected={jamo === option} onClick={() => { setJamo(option); setSide('start') }}>{option}</button>)}
          </div>

          <div className={styles.canvas}>
            <svg viewBox={`0 0 ${VIEW_BOX} ${VIEW_BOX}`} role="img" aria-label={`${jamo} 시작점과 끝점 선택`}>
              {Array.from({ length: 9 }, (_, index) => (index + 1) * 100).flatMap((position) => [
                <line key={`v-${position}`} x1={position} y1={0} x2={position} y2={VIEW_BOX} className={styles.gridLine} />,
                <line key={`h-${position}`} x1={0} y1={position} x2={VIEW_BOX} y2={position} className={styles.gridLine} />,
              ])}
              <rect x={BOX.x * VIEW_BOX} y={BOX.y * VIEW_BOX} width={BOX.width * VIEW_BOX} height={BOX.height * VIEW_BOX} className={styles.designBody} />
              <path d={path} className={styles.jamoPath} />
              <circle cx={start.x} cy={start.y} r={side === 'start' ? 31 : 23} className={side === 'start' ? styles.activeTerminal : styles.terminal} onClick={() => setSide('start')} role="button" tabIndex={0} aria-label="시작점 선택" onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') setSide('start') }} />
              <circle cx={end.x} cy={end.y} r={side === 'end' ? 31 : 23} className={side === 'end' ? styles.activeTerminal : styles.terminal} onClick={() => setSide('end')} role="button" tabIndex={0} aria-label="끝점 선택" onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') setSide('end') }} />
            </svg>
            <div className={styles.legend}><span><i className={styles.activeDot} />선택됨</span><span><i />선택 가능</span></div>
          </div>

          <article className={styles.referenceCard}>
            <span>{jamo} · {JAMO_REFERENCE[jamo].structure}</span>
            <p>{JAMO_REFERENCE[jamo].note}</p>
            <small>자모 이름은 참고 사례이고, 규칙 판단은 선택된 형상을 기준으로 합니다.</small>
          </article>
        </section>

        <section className={styles.comparison} aria-labelledby="comparison-title">
          <header><div><span>전체 비교</span><h2 id="comparison-title">형태 예절표</h2></div><p>행을 누르면 캔버스가 함께 바뀝니다.</p></header>
          <div className={styles.tableScroll}>
            <table>
              <thead><tr><th>자모</th><th>지점</th><th>접선 방향</th><th>형태의 예절</th><th>일괄 적용 범위</th></tr></thead>
              <tbody>
                {comparisonRows.map((row) => {
                  const selected = row.jamo === jamo && row.side === side
                  return (
                    <tr key={row.key} data-selected={selected} onClick={() => { setJamo(row.jamo); setSide(row.side) }}>
                      <th scope="row">{row.jamo}</th>
                      <td><button type="button" className={styles.rowSelect} aria-label={`${row.jamo} ${row.side === 'start' ? '시작점' : '끝점'} 보기`}>{row.side === 'start' ? '시작' : '끝'}</button></td>
                      <td>{directionOf(row.geometry.tangentAngle)} · {row.geometry.tangentAngle}°</td>
                      <td><input aria-label={`${row.jamo} ${row.side === 'start' ? '시작' : '끝'} 형태의 예절`} value={row.draft.etiquette} onClick={(event) => event.stopPropagation()} onChange={(event) => updateRowDraft(row.key, row.draft, { etiquette: event.target.value })} placeholder="예절 입력" /></td>
                      <td><select aria-label={`${row.jamo} ${row.side === 'start' ? '시작' : '끝'} 적용 범위`} value={row.draft.scope} onClick={(event) => event.stopPropagation()} onChange={(event) => updateRowDraft(row.key, row.draft, { scope: event.target.value as ApplicationScope })}>{SCOPE_OPTIONS.map((option) => <option key={option}>{option}</option>)}</select></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className={styles.inspector} aria-label="형태 규칙 입력">
          <header><div><span>{side === 'start' ? '시작점' : '끝점'} 선택</span><h2>형태 예절</h2></div><button type="button" onClick={copyJson} data-state={copyState}>{copyState === 'copied' ? '복사됨' : copyState === 'failed' ? '복사 실패' : 'JSON 복사'}</button></header>

          <dl className={styles.geometryGrid}>
            <div><dt>선택 지점</dt><dd>{side === 'start' ? '경로 시작' : '경로 끝'}</dd></div>
            <div><dt>접선 방향</dt><dd>{directionOf(observation.geometry.tangentAngle)} · {observation.geometry.tangentAngle}°</dd></div>
          </dl>

          <label className={styles.field}>범위 조건 <small>선택 사항</small>
            <textarea value={draft.scopeNote} onChange={(event) => updateDraft({ scopeNote: event.target.value })} placeholder="예: 초성에서 아래로 노출된 끝에만 적용" />
          </label>

          <div className={styles.jsonPanel}>
            <div className={styles.jsonHeader}><strong>공유할 JSON</strong><span>자동 저장 · 사용자 검토 중</span></div>
            <pre>{json}</pre>
          </div>
        </section>
      </div>
    </main>
  )
}
