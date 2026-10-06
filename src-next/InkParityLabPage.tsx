import { useMemo } from 'react'
import { DEFAULT_MITER_LIMIT } from '../src/services/strokeJoin'
import type { StrokeLinecap, StrokeLinejoin } from '../src/types'
import { INK_CAPS, INK_JOINS, INK_SAMPLE_BOX, measureInkCell, PEN_INK_SAMPLES, PRESET_INK_FEATURED, PRESET_INK_SAMPLES } from './inkParitySamples'
import type { InkCell, InkSample } from './inkParitySamples'
import styles from './InkParityLabPage.module.css'

/**
 * 면 그리기 견줌 실험실. 플랜 `2026-10-06_획-편집-캔버스-면-그리기.md`의 G0 그림표다.
 * 같은 획을 선 그리기(브라우저 SVG stroke)와 면 그리기(레이아웃 · 추출이 쓰는 길)로 나란히 그리고, 칸마다 두 그림의 다른 면적을 잉크에 대한 비율로 적는다.
 * 줄 = 견본(대표 자모의 획 → 펜 견본), 칸 = 끝 셋 × 꺾임 셋. 견본과 재는 함수는 `inkParitySamples.ts` — 여기서는 그리기만 한다.
 */

const VIEW = 100
/** 차이가 이 비율을 넘으면 눈에 띈다고 본다(G0 통과 기준 0.5%). */
const DIFF_LIMIT = 0.005
const CAP_LABEL: Record<StrokeLinecap, string> = { butt: '네모', round: '둥긂', square: '사각' }
const JOIN_LABEL: Record<StrokeLinejoin, string> = { miter: '뾰족', round: '둥긂', bevel: '깎음' }
const COLUMNS = INK_CAPS.flatMap((cap) => INK_JOINS.map((join) => ({ cap, join })))
const SAMPLE_RECT = { x: INK_SAMPLE_BOX.x * VIEW, y: INK_SAMPLE_BOX.y * VIEW, width: INK_SAMPLE_BOX.width * VIEW, height: INK_SAMPLE_BOX.height * VIEW }

interface Row { sample: InkSample; cells: InkCell[] }

const measureRows = (samples: readonly InkSample[]): Row[] =>
  samples.map((sample) => ({ sample, cells: COLUMNS.map(({ cap, join }) => measureInkCell(sample.stroke, cap, join)) }))
const percent = (ratio: number) => `${(ratio * 100).toFixed(2)}%`
/** 요약의 최대 차이. 둘째 자리에서 0으로 뭉개지는 작은 값은 다섯째 자리까지 적는다. */
const finePercent = (ratio: number) => ratio > 0 && ratio < 0.0001 ? `${(ratio * 100).toFixed(5)}%` : percent(ratio)

/** 기본 프리셋 전 획을 끝 네모 · 꺾임 뾰족 한 가지로만 잰다. */
function measurePreset() {
  let max = 0, over = 0, failed = 0
  for (const sample of PRESET_INK_SAMPLES) {
    const cell = measureInkCell(sample.stroke, 'butt', 'miter')
    if (!cell.ok) failed += 1
    if (cell.diffRatio === null) continue
    max = Math.max(max, cell.diffRatio)
    if (cell.diffRatio > DIFF_LIMIT) over += 1
  }
  return { count: PRESET_INK_SAMPLES.length, max, over, failed }
}

function InkPair({ cell, cap, join }: { cell: InkCell; cap: StrokeLinecap; join: StrokeLinejoin }) {
  return <div className={styles.pair}>
    <svg viewBox={`0 0 ${VIEW} ${VIEW}`} className={styles.figure} role="img" aria-label="선 그리기">
      <rect className={styles.box} {...SAMPLE_RECT} />
      <path className={styles.native} d={cell.nativeD} strokeWidth={cell.nativeWidth} strokeLinecap={cap} strokeLinejoin={join} strokeMiterlimit={DEFAULT_MITER_LIMIT} />
    </svg>
    <svg viewBox={`0 0 ${VIEW} ${VIEW}`} className={styles.figure} role="img" aria-label="면 그리기">
      <rect className={styles.box} {...SAMPLE_RECT} />
      {cell.filledPaths.map((d, index) => <path key={index} className={styles.filled} d={d} fillRule="evenodd" />)}
    </svg>
  </div>
}

function InkRows({ title, rows }: { title: string; rows: Row[] }) {
  return <tbody>
    <tr className={styles.groupRow}><th className={styles.rowHead} scope="rowgroup">{title}</th><td colSpan={COLUMNS.length} /></tr>
    {rows.map((row) => <tr key={row.sample.name}>
      <th className={styles.rowHead} scope="row">{row.sample.name}</th>
      {row.cells.map((cell, index) => {
        const { cap, join } = COLUMNS[index]
        return <td key={`${cap}-${join}`} data-ink-fail={cell.ok ? undefined : ''}>
          <InkPair cell={cell} cap={cap} join={join} />
          {cell.ok
            ? <span className={cell.diffRatio !== null && cell.diffRatio > DIFF_LIMIT ? styles.over : styles.diff}>{cell.diffRatio === null ? '–' : percent(cell.diffRatio)}</span>
            : <span className={styles.fail} title={cell.message}>면 실패</span>}
        </td>
      })}
    </tr>)}
  </tbody>
}

export function InkParityLabPage() {
  const { featured, pen, preset } = useMemo(() => ({ featured: measureRows(PRESET_INK_FEATURED), pen: measureRows(PEN_INK_SAMPLES), preset: measurePreset() }), [])
  const penCells = pen.length * COLUMNS.length
  const penFailed = pen.reduce((sum, row) => sum + row.cells.filter((cell) => !cell.ok).length, 0)

  return (
    <main className={styles.page} data-testid="ink-parity-lab">
      <header className={styles.header}>
        <span>Ink Parity Lab</span>
        <h1>면 그리기 견줌</h1>
        <p>같은 획을 두 방식으로 그려 견준다. 칸마다 왼쪽이 선 그리기(브라우저 stroke), 오른쪽이 면 그리기(레이아웃 · 추출과 같은 길)다. 아래 숫자는 두 그림의 다른 면적 / 잉크 면적이고, {percent(DIFF_LIMIT)}를 넘으면 눈에 띈다고 본다. 옅은 사각은 견본을 놓은 칸.</p>
      </header>

      <p className={styles.summary} data-testid="ink-parity-summary">
        <span>펜 견본 <strong>{penCells}</strong>칸 · 면 실패 <strong className={penFailed > 0 ? styles.fail : undefined}>{penFailed}</strong></span>
        <span>기본 프리셋 <strong>{preset.count}</strong>획({CAP_LABEL.butt} · {JOIN_LABEL.miter}) · 최대 차이 <strong className={preset.max > DIFF_LIMIT ? styles.over : undefined}>{finePercent(preset.max)}</strong> · {percent(DIFF_LIMIT)} 넘는 획 <strong className={preset.over > 0 ? styles.over : undefined}>{preset.over}</strong>{preset.failed > 0 && <> · 면 실패 <strong className={styles.fail}>{preset.failed}</strong></>}</span>
      </p>

      <div className={styles.scroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.rowHead} rowSpan={2} scope="col">견본</th>
              {INK_CAPS.map((cap) => <th key={cap} colSpan={INK_JOINS.length} scope="colgroup">끝 {CAP_LABEL[cap]}</th>)}
            </tr>
            <tr>
              {COLUMNS.map(({ cap, join }) => <th key={`${cap}-${join}`} scope="col">{JOIN_LABEL[join]}</th>)}
            </tr>
          </thead>
          <InkRows title="대표 자모" rows={featured} />
          <InkRows title="펜 견본" rows={pen} />
        </table>
      </div>
      <p className={styles.note}>선 그리기의 뾰족 한계는 {DEFAULT_MITER_LIMIT}. 차이는 화면 픽셀이 아니라 같은 뜻의 기하(Clipper2 오프셋)로 잰 값이다.</p>
    </main>
  )
}
