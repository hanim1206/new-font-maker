import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { Table2 } from 'lucide-react'
import { DevStickyToggle } from './DevGhostToggle'
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
// 검수 탭 칸 바탕 = 레이아웃(문맥 칸) 6개. 같은 레이아웃 규칙을 쓰는 글자끼리 같은 색이다. 색은 모듈 CSS의 `.plain[data-context]`. 범례는 안 보인다.
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
  /** 칸을 눌렀을 때. 없으면 `onSelect`(선택만). 검수 탭은 여기서 글자 화면으로 간다. 시트 탭·키보드 이동은 늘 `onSelect`다. */
  onOpen?: (codepoint: number) => void
  isHighlighted: (row: CorpusRow) => boolean
  noFinal: boolean
  /** 칸 안에 그릴 것. 없으면 글자를 텍스트로 쓴다. 검수 탭은 프로젝트 획으로 그린 글자를 넘긴다. */
  renderCell?: (row: CorpusRow) => ReactNode
  /**
   * `lab`(기본)은 추출 상태(칸 색·머리줄 막대·범례·자모 점·`크게` 전환)와 축 배치를 다 보인다.
   * `viewer`는 검수 탭용. 추출 결과를 안 읽으니 상태 표시가 없고, 칸은 늘 보통 크기, 축 배치는 개발용 스티키 토글 안으로 들어가며,
   * 격자가 부모의 남은 높이를 다 쓴다(부모가 높이를 정해 줘야 한다).
   */
  variant?: 'lab' | 'viewer'
}

export function NotoCorpusMatrix({ rows, reviews, selected, onSelect, onOpen, isHighlighted, noFinal, renderCell, variant = 'lab' }: Props) {
  const showStatus = variant === 'lab'
  const [pivotOpen, setPivotOpen] = useState(false)
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

  const pivotSelect = <label>축 배치<select value={pivot.id} onChange={(event) => setPivotId(event.target.value as PivotId)}>{PIVOTS.map((value) => <option key={value.id} value={value.id}>{value.label}</option>)}</select></label>
  return <div className={`${styles.matrix} ${large ? styles.large : ''} ${showStatus ? '' : styles.fill}`} data-testid="corpus-matrix">
    {!showStatus && !noFinal && <DevStickyToggle pressed={pivotOpen} onToggle={() => setPivotOpen((open) => !open)} testId="corpus-pivot-toggle" label="축 배치" icon={<Table2 size={18} />} panel={pivotSelect} />}
    {showStatus && <div className={styles.toolbar}>
      {noFinal ? <p className={styles.scopeNote}>무받침 범위는 행 홀자 × 열 첫닿자 한 장으로 봅니다.</p> : pivotSelect}
      <div className={styles.segment} role="group" aria-label="칸 크기"><button type="button" aria-pressed={!large} onClick={() => setLarge(false)}>보통</button><button type="button" aria-pressed={large} onClick={() => setLarge(true)}>크게 · 자모 점</button></div>
    </div>}
    {!noFinal && <div className={styles.tabs} role="group" aria-label={`${AXES[pivot.sheet].label} 시트`}>{sheets.map(({ value, total, counts }) => <button key={value ?? 'none'} type="button" aria-pressed={value === sheet} title={showStatus ? `${jamoLabel(value)} · 문제 ${issueCount(counts)}칸` : jamoLabel(value)} onClick={() => selectAlong(pivot.sheet, value)}><span>{jamoLabel(value)}</span>{showStatus && <StatusBar counts={counts} total={total} />}</button>)}</div>}
    {showStatus && <div className={styles.summary}>
      <strong>{`${noFinal ? '무받침' : `${AXES[pivot.sheet].label} ${jamoLabel(sheet)} 시트`} · ${rowItems.length * colItems.length}자`}</strong>
      <div className={styles.legend}>{LEGEND_ORDER.map((status) => <span key={status}><i className={styles[status]} />{CELL_STATUS_LABEL[status]} {sheetCounts[status]}</span>)}</div>
    </div>}
    <div ref={wrapRef} className={styles.gridWrap} onKeyDown={handleKeyDown}>
      <table className={styles.grid} aria-label="글자 격자">
        <thead>
          <tr className={styles.groupRow}>
            <th className={styles.corner} colSpan={2} rowSpan={2}>행 <b>{AXES[pivot.rows].label}</b> ↓<br />열 <b>{AXES[pivot.cols].label}</b> →</th>
            {AXES[pivot.cols].groups.map((group) => <th key={group.name} colSpan={group.items.length}>{group.name} · {group.items.length}</th>)}
          </tr>
          <tr className={styles.jamoRow}>{colItems.map((colValue) => {
            const counts = countStatuses(rowItems.map((rowValue) => statusAt(at(rowValue, colValue))))
            const label = jamoLabel(colValue)
            return <th key={colValue ?? 'none'} scope="col" className={`${styles.colHead} ${colGroupStarts.has(colValue) ? styles.colGroupStart : ''} ${colValue === selectedValues[pivot.cols] ? styles.current : ''}`}>
              {label}{showStatus && <><StatusBar counts={counts} total={rowItems.length} /><small>{issueCount(counts) || ''}</small></>}
            </th>
          })}</tr>
        </thead>
        <tbody>{AXES[pivot.rows].groups.flatMap((group) => group.items.map((rowValue, index) => {
          const codepoints = colItems.map((colValue) => at(rowValue, colValue))
          const counts = countStatuses(codepoints.map(statusAt))
          return <tr key={rowValue ?? 'none'} className={index === 0 ? styles.rowGroupStart : ''}>
            {index === 0 && <th className={styles.rowGroup} rowSpan={group.items.length} scope="rowgroup">{group.name}</th>}
            <th scope="row" className={`${styles.rowHead} ${rowValue === selectedValues[pivot.rows] ? styles.current : ''}`}>
              <span className={styles.rowLabel}><span>{jamoLabel(rowValue)}</span>{showStatus && <><StatusBar counts={counts} total={colItems.length} /><small>{issueCount(counts) || ''}</small></>}</span>
            </th>
            {codepoints.map((codepoint, colIndex) => {
              const row = rows[codepoint - 0xac00]
              const status = statusAt(codepoint)
              return <td key={codepoint} className={colGroupStarts.has(colItems[colIndex]) ? styles.colGroupStart : ''}>
                <button type="button" className={`${styles.cell} ${showStatus ? styles[status] : styles.plain}`} data-testid="corpus-cell" data-codepoint={codepoint} data-status={showStatus ? status : undefined} data-context={showStatus ? undefined : row.identity.contextId} data-dimmed={!isHighlighted(row)} aria-pressed={codepoint === selected} tabIndex={codepoint === selected ? 0 : -1} aria-label={showStatus ? `${row.identity.character} · ${CELL_STATUS_LABEL[status]}` : `${row.identity.character} 열기`} onClick={() => (onOpen ?? onSelect)(codepoint)}>
                  {renderCell ? renderCell(row) : <strong>{row.identity.character}</strong>}
                  {large && showStatus && <span className={styles.dots}>{PART_STAGES.map((stage) => {
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
    <p className={styles.hint}>{!showStatus && '칸을 누르면 글자를 엽니다 · '}<kbd>←</kbd><kbd>↑</kbd><kbd>→</kbd><kbd>↓</kbd> 칸 이동{!noFinal && <> · <kbd>[</kbd><kbd>]</kbd> 이전·다음 시트</>}{showStatus && <> · 머리글 막대는 그 줄의 상태 분포, 숫자는 문제 칸 수입니다. 승인은 오른쪽 검수 패널에서 기준선을 보고 합니다.</>}</p>
  </div>
}
