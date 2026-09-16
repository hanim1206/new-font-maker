import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { CELL_STATUS_LABEL, CORPUS_INITIALS, corpusCellStatus, corpusCodepoint, corpusIdentity, corpusPartStatus, PART_STAGES, STAGE_LABEL } from './notoCorpus'
import type { CorpusCellStatus, CorpusReviews, CorpusRow } from './notoCorpus'
import styles from './NotoCorpusMatrix.module.css'

type Axis = 'initial' | 'medial' | 'final'
type Jamo = string | null
type AxisValues = Record<Axis, Jamo>
type Counts = Record<CorpusCellStatus, number>

// 홀자는 레이아웃 계열(세로·가로·혼합), 받침은 없음·홑쌍·겹으로 묶는다.
const AXES: Record<Axis, { label: string; groups: { name: string; items: Jamo[] }[] }> = {
  initial: { label: '첫닿자', groups: [{ name: '첫닿자', items: CORPUS_INITIALS }] },
  medial: { label: '홀자', groups: [{ name: '세로', items: [...'ㅏㅐㅑㅒㅓㅔㅕㅖㅣ'] }, { name: '가로', items: [...'ㅗㅛㅜㅠㅡ'] }, { name: '혼합', items: [...'ㅘㅙㅚㅝㅞㅟㅢ'] }] },
  final: { label: '받침', groups: [{ name: '없음', items: [null] }, { name: '홑·쌍받침', items: [...'ㄱㄲㄴㄷㄹㅁㅂㅅㅆㅇㅈㅊㅋㅌㅍㅎ'] }, { name: '겹받침', items: [...'ㄳㄵㄶㄺㄻㄼㄽㄾㄿㅀㅄ'] }] },
}
const AXIS_ITEMS = Object.fromEntries(Object.entries(AXES).map(([axis, value]) => [axis, value.groups.flatMap((group) => group.items)])) as Record<Axis, Jamo[]>
const PIVOTS = [
  { id: 'medial-final', rows: 'medial', cols: 'final', sheet: 'initial', label: '행 홀자 × 열 받침 · 시트 첫닿자' },
  { id: 'medial-initial', rows: 'medial', cols: 'initial', sheet: 'final', label: '행 홀자 × 열 첫닿자 · 시트 받침' },
  { id: 'initial-final', rows: 'initial', cols: 'final', sheet: 'medial', label: '행 첫닿자 × 열 받침 · 시트 홀자' },
] as const satisfies readonly { id: string; rows: Axis; cols: Axis; sheet: Axis; label: string }[]
type PivotId = typeof PIVOTS[number]['id']
const BAR_ORDER: CorpusCellStatus[] = ['reviewed', 'candidate', 'missing', 'unsupported', 'rejected']
const LEGEND_ORDER: CorpusCellStatus[] = [...BAR_ORDER, 'unprocessed']

const jamoLabel = (value: Jamo) => value ?? '없음'
const codepointOf = (values: AxisValues) => corpusCodepoint(values.initial as string, values.medial as string, values.final)
function countStatuses(statuses: CorpusCellStatus[]): Counts {
  const counts: Counts = { reviewed: 0, candidate: 0, missing: 0, unsupported: 0, rejected: 0, unprocessed: 0 }
  for (const status of statuses) counts[status] += 1
  return counts
}
const issueCount = (counts: Counts) => counts.missing + counts.unsupported + counts.rejected

function StatusBar({ counts, total }: { counts: Counts; total: number }) {
  return <span className={styles.bar} aria-hidden="true">{BAR_ORDER.map((status) => counts[status] ? <b key={status} style={{ width: `${counts[status] / total * 100}%`, background: `var(--${status}-dot)` }} /> : null)}</span>
}

interface Props {
  rows: CorpusRow[]
  reviews: CorpusReviews
  selected: number
  onSelect: (codepoint: number) => void
  isHighlighted: (row: CorpusRow) => boolean
  noFinal: boolean
  /** 제품 검수 탭의 2층 표시. 편집 가능한 글자 칸에 테두리를 두른다. 랩에서는 넘기지 않는다. */
  tierOf?: (row: CorpusRow) => 'editable' | 'readonly'
  /** 칸 색을 추출 상태 대신 다른 척도로. 반환값은 CSS data-tone(good/mid/far/bad). */
  toneOf?: (row: CorpusRow) => 'good' | 'mid' | 'far' | 'bad' | undefined
}

export function NotoCorpusMatrix({ rows, reviews, selected, onSelect, isHighlighted, noFinal, tierOf, toneOf }: Props) {
  const [pivotId, setPivotId] = useState<PivotId>('medial-final')
  const [large, setLarge] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const focusPending = useRef(false)
  const pivot = PIVOTS.find((value) => value.id === (noFinal ? 'medial-initial' : pivotId)) ?? PIVOTS[0]
  const statuses = useMemo(() => rows.map((row) => corpusCellStatus(row, reviews)), [rows, reviews])
  const sheets = useMemo(() => AXIS_ITEMS[pivot.sheet].map((value) => {
    const codepoints = AXIS_ITEMS[pivot.rows].flatMap((rowValue) => AXIS_ITEMS[pivot.cols].map((colValue) => codepointOf({ [pivot.rows]: rowValue, [pivot.cols]: colValue, [pivot.sheet]: value } as AxisValues)))
    return { value, total: codepoints.length, counts: countStatuses(codepoints.map((codepoint) => statuses[codepoint - 0xac00])) }
  }), [pivot, statuses])

  useEffect(() => {
    if (!focusPending.current) return
    focusPending.current = false
    const cell = wrapRef.current?.querySelector<HTMLButtonElement>(`[data-codepoint="${selected}"]`)
    cell?.focus({ preventScroll: true })
    cell?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [selected])

  if (rows.length !== statuses.length || !rows.length) return null
  const identity = corpusIdentity(selected)
  const selectedValues: AxisValues = { initial: identity.initialJamo, medial: identity.medialJamo, final: identity.finalJamo }
  const sheet = selectedValues[pivot.sheet]
  const rowItems = AXIS_ITEMS[pivot.rows]
  const colItems = AXIS_ITEMS[pivot.cols]
  const colGroupStarts = new Set(AXES[pivot.cols].groups.map((group) => group.items[0]))
  const at = (rowValue: Jamo, colValue: Jamo) => codepointOf({ [pivot.rows]: rowValue, [pivot.cols]: colValue, [pivot.sheet]: sheet } as AxisValues)
  const statusAt = (codepoint: number) => statuses[codepoint - 0xac00]
  const sheetCounts = countStatuses(rowItems.flatMap((rowValue) => colItems.map((colValue) => statusAt(at(rowValue, colValue)))))
  const selectAlong = (axis: Axis, value: Jamo) => onSelect(codepointOf({ ...selectedValues, [axis]: value }))

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const arrows: Record<string, [Axis, number]> = { ArrowUp: [pivot.rows, -1], ArrowDown: [pivot.rows, 1], ArrowLeft: [pivot.cols, -1], ArrowRight: [pivot.cols, 1] }
    const move = arrows[event.key] ?? (!noFinal && (event.key === '[' || event.key === ']') ? [pivot.sheet, event.key === ']' ? 1 : -1] as [Axis, number] : null)
    if (!move) return
    event.preventDefault()
    const [axis, step] = move
    const items = AXIS_ITEMS[axis]
    const index = items.indexOf(selectedValues[axis])
    focusPending.current = true
    selectAlong(axis, items[Math.min(items.length - 1, Math.max(0, index + step))])
  }

  return <div className={`${styles.matrix} ${large ? styles.large : ''}`} data-testid="corpus-matrix">
    <div className={styles.toolbar}>
      {noFinal ? <p className={styles.scopeNote}>무받침 범위는 행 홀자 × 열 첫닿자 한 장으로 봅니다.</p> : <label>축 배치<select value={pivot.id} onChange={(event) => setPivotId(event.target.value as PivotId)}>{PIVOTS.map((value) => <option key={value.id} value={value.id}>{value.label}</option>)}</select></label>}
      <div className={styles.segment} role="group" aria-label="칸 크기"><button type="button" aria-pressed={!large} onClick={() => setLarge(false)}>보통</button><button type="button" aria-pressed={large} onClick={() => setLarge(true)}>크게 · 자모 점</button></div>
    </div>
    {!noFinal && <div className={styles.tabs} role="group" aria-label={`${AXES[pivot.sheet].label} 시트`}>{sheets.map(({ value, total, counts }) => <button key={value ?? 'none'} type="button" aria-pressed={value === sheet} title={`${jamoLabel(value)} · 문제 ${issueCount(counts)}칸`} onClick={() => selectAlong(pivot.sheet, value)}><span>{jamoLabel(value)}</span><StatusBar counts={counts} total={total} /></button>)}</div>}
    <div className={styles.summary}>
      <strong>{noFinal ? '무받침' : `${AXES[pivot.sheet].label} ${jamoLabel(sheet)} 시트`} · {rowItems.length * colItems.length}자</strong>
      <div className={styles.legend}>{LEGEND_ORDER.map((status) => <span key={status}><i className={styles[status]} />{CELL_STATUS_LABEL[status]} {sheetCounts[status]}</span>)}</div>
    </div>
    <div ref={wrapRef} className={styles.gridWrap} onKeyDown={handleKeyDown}>
      <table className={styles.grid} aria-label="글자 격자">
        <thead>
          <tr className={styles.groupRow}>
            <th className={styles.corner} colSpan={2} rowSpan={2}>행 <b>{AXES[pivot.rows].label}</b> ↓<br />열 <b>{AXES[pivot.cols].label}</b> →</th>
            {AXES[pivot.cols].groups.map((group) => <th key={group.name} colSpan={group.items.length}>{group.name} · {group.items.length}</th>)}
          </tr>
          <tr className={styles.jamoRow}>{colItems.map((colValue) => {
            const counts = countStatuses(rowItems.map((rowValue) => statusAt(at(rowValue, colValue))))
            return <th key={colValue ?? 'none'} scope="col" className={`${styles.colHead} ${colGroupStarts.has(colValue) ? styles.colGroupStart : ''} ${colValue === selectedValues[pivot.cols] ? styles.current : ''}`}>{jamoLabel(colValue)}<StatusBar counts={counts} total={rowItems.length} /><small>{issueCount(counts) || ''}</small></th>
          })}</tr>
        </thead>
        <tbody>{AXES[pivot.rows].groups.flatMap((group) => group.items.map((rowValue, index) => {
          const codepoints = colItems.map((colValue) => at(rowValue, colValue))
          const counts = countStatuses(codepoints.map(statusAt))
          return <tr key={rowValue ?? 'none'} className={index === 0 ? styles.rowGroupStart : ''}>
            {index === 0 && <th className={styles.rowGroup} rowSpan={group.items.length} scope="rowgroup">{group.name}</th>}
            <th scope="row" className={`${styles.rowHead} ${rowValue === selectedValues[pivot.rows] ? styles.current : ''}`}><span className={styles.rowLabel}><span>{jamoLabel(rowValue)}</span><StatusBar counts={counts} total={colItems.length} /><small>{issueCount(counts) || ''}</small></span></th>
            {codepoints.map((codepoint, colIndex) => {
              const row = rows[codepoint - 0xac00]
              const status = statusAt(codepoint)
              return <td key={codepoint} className={colGroupStarts.has(colItems[colIndex]) ? styles.colGroupStart : ''}>
                <button type="button" className={`${styles.cell} ${styles[status]}`} data-testid="corpus-cell" data-codepoint={codepoint} data-status={status} data-dimmed={!isHighlighted(row)} data-tier={tierOf?.(row)} data-tone={toneOf?.(row)} aria-pressed={codepoint === selected} tabIndex={codepoint === selected ? 0 : -1} aria-label={`${row.identity.character} · ${CELL_STATUS_LABEL[status]}`} onClick={() => onSelect(codepoint)}>
                  <strong>{row.identity.character}</strong>
                  {large && <span className={styles.dots}>{PART_STAGES.map((stage) => {
                    const part = corpusPartStatus(row, stage, reviews)
                    return <i key={stage} className={part === 'not-applicable' ? styles.notApplicable : ''} style={part === 'not-applicable' ? undefined : { background: `var(--${part}-dot)` }} title={`${STAGE_LABEL[stage]} · ${part === 'not-applicable' ? '해당 없음' : CELL_STATUS_LABEL[part]}`} />
                  })}</span>}
                </button>
              </td>
            })}
          </tr>
        }))}</tbody>
      </table>
    </div>
    <p className={styles.hint}>칸을 누른 뒤 <kbd>←</kbd><kbd>↑</kbd><kbd>→</kbd><kbd>↓</kbd> 칸 이동{!noFinal && <> · <kbd>[</kbd><kbd>]</kbd> 이전·다음 시트</>} · 머리글 막대는 그 줄의 상태 분포, 숫자는 문제 칸 수입니다. 승인은 오른쪽 검수 패널에서 기준선을 보고 합니다.</p>
  </div>
}
