import { useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { fitPenStroke, PEN_FIT_EPSILON, PEN_FIT_EPSILON_CANDIDATES } from '../src/services/penStrokeFit'
import type { PenFitResult, PenPoint } from '../src/services/penStrokeFit'
import type { BoxConfig } from '../src/types'
import { pointsToSvgD } from '../src/utils/pathUtils'
import { Button } from './components/ui/button'
import { EDIT_COLOR } from './editColors'
import styles from './PenLabPage.module.css'

/**
 * 펜 그리기 실험실. 플랜 `docs/plans/2026-10-05_펜으로-획-그리기.md`의 G0 · G1 화면이다.
 * 빈 자모 상자에 펜(또는 마우스)으로 긋고, 왼쪽은 그은 점 그대로, 오른쪽은 `fitPenStroke`가 만든 획을 겹쳐 본다.
 * 허용오차 `ε` 후보 셋의 앵커 수 · 최대 이탈을 획마다 표로 낸다. 펜 · 손가락 · 마우스 전부 긋는다.
 * 저장하지 않고 제품 값도 안 바꾼다. `점 복사`는 G1 녹화용 — 그은 점을 JSON으로 복사한다.
 */

const VIEW = 1000
const BOX: BoxConfig = { x: 0, y: 0, width: 1, height: 1 }
const THICKNESS = 0.07
/** 표의 거리 단위. 0–1 값을 1000 단위로 보인다. */
const toUnits = (value: number) => (value * VIEW).toFixed(1)

type Epsilon = typeof PEN_FIT_EPSILON_CANDIDATES[number]

interface Fitted {
  raw: PenPoint[]
  /** ε 후보별 결과. 점이 모자라면 null. */
  byEpsilon: Record<Epsilon, PenFitResult | null>
}

const GRID = Array.from({ length: 9 }, (_, i) => ((i + 1) / 10) * VIEW)

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))

/** 화면 좌표 → 상자 0–1. 캡처 중 상자 밖으로 끌면 가장자리에 붙인다. */
function toBox(rect: DOMRect, clientX: number, clientY: number): PenPoint {
  return { x: clamp01((clientX - rect.left) / rect.width), y: clamp01((clientY - rect.top) / rect.height) }
}

function pointOf(event: ReactPointerEvent<SVGSVGElement>): PenPoint {
  return toBox(event.currentTarget.getBoundingClientRect(), event.clientX, event.clientY)
}

/** 펜은 한 프레임에 여러 점을 보낸다 — 합쳐진 이벤트를 풀어 떨림까지 그대로 받는다. */
function pointsOf(event: ReactPointerEvent<SVGSVGElement>): PenPoint[] {
  const rect = event.currentTarget.getBoundingClientRect()
  const native = event.nativeEvent as globalThis.PointerEvent & { getCoalescedEvents?: () => globalThis.PointerEvent[] }
  const events = native.getCoalescedEvents?.() ?? []
  if (events.length === 0) return [pointOf(event)]
  return events.map((item) => toBox(rect, item.clientX, item.clientY))
}

export function PenLabPage() {
  const [strokes, setStrokes] = useState<PenPoint[][]>([])
  const [current, setCurrent] = useState<PenPoint[] | null>(null)
  const [epsilon, setEpsilon] = useState<Epsilon>(PEN_FIT_EPSILON)
  const [copied, setCopied] = useState(false)
  const drawing = useRef<PenPoint[] | null>(null)
  /** 지금 긋는 포인터. 다른 손가락이 닿아도 이 획에 섞이지 않는다. */
  const activePointer = useRef<number | null>(null)
  const canvasRef = useRef<SVGSVGElement>(null)

  // iOS Safari는 SVG의 `touch-action: none`을 건너뛰기도 해서 세로로 그으면 화면이 스크롤된다. 터치 이동을 직접 막는다(passive 아님).
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const block = (event: TouchEvent) => { if (event.cancelable) event.preventDefault() }
    canvas.addEventListener('touchstart', block, { passive: false })
    canvas.addEventListener('touchmove', block, { passive: false })
    return () => {
      canvas.removeEventListener('touchstart', block)
      canvas.removeEventListener('touchmove', block)
    }
  }, [])

  const fitted = useMemo<Fitted[]>(() => strokes.map((raw, index) => ({
    raw,
    byEpsilon: Object.fromEntries(PEN_FIT_EPSILON_CANDIDATES.map((candidate) => [candidate, fitPenStroke(raw, { epsilon: candidate, thickness: THICKNESS, id: `pen-${index}` })])) as Record<Epsilon, PenFitResult | null>,
  })), [strokes])

  const begin = (event: ReactPointerEvent<SVGSVGElement>) => {
    // 펜 · 손가락 · 마우스 전부 긋는다(10-05 사용자 결정 — 폰에서는 손가락뿐이다). 마우스는 왼쪽 단추만.
    if (event.pointerType === 'mouse' && event.button !== 0) return
    if (activePointer.current !== null) return
    event.currentTarget.setPointerCapture(event.pointerId)
    activePointer.current = event.pointerId
    drawing.current = [pointOf(event)]
    setCurrent(drawing.current)
    setCopied(false)
  }
  const move = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!drawing.current || event.pointerId !== activePointer.current) return
    drawing.current = [...drawing.current, ...pointsOf(event)]
    setCurrent(drawing.current)
  }
  const finish = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.pointerId !== activePointer.current) return
    activePointer.current = null
    const raw = drawing.current
    drawing.current = null
    setCurrent(null)
    if (raw && raw.length >= 2) setStrokes((list) => [...list, raw])
  }

  const copyPoints = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(strokes.map((raw) => raw.map((point) => ({ x: Number(point.x.toFixed(4)), y: Number(point.y.toFixed(4)) })))))
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  const rawPath = (raw: PenPoint[]) => raw.map((point, i) => `${i === 0 ? 'M' : 'L'}${(point.x * VIEW).toFixed(1)} ${(point.y * VIEW).toFixed(1)}`).join(' ')

  return <div className={styles.page}>
    <header className={styles.header}>
      <span>Lab</span>
      <h1>펜 그리기</h1>
      <p>빈 자모 상자에 펜이나 손가락으로 그으면 획 하나가 된다. 왼쪽은 그은 점 그대로, 오른쪽은 허용오차 ε로 줄인 앵커와 핸들. 상자 안에서는 스크롤되지 않는다.</p>
    </header>

    <div className={styles.controls}>
      <div className={styles.group} role="radiogroup" aria-label="허용오차 ε">
        <span>ε</span>
        {PEN_FIT_EPSILON_CANDIDATES.map((candidate) => <Button key={candidate} size="sm" variant={candidate === epsilon ? 'primary' : 'default'} role="radio" aria-checked={candidate === epsilon} onClick={() => setEpsilon(candidate)} data-testid={`pen-lab-eps-${candidate}`}>{candidate}</Button>)}
      </div>
      <div className={styles.group}>
        <Button size="sm" onClick={() => setStrokes((list) => list.slice(0, -1))} disabled={strokes.length === 0}>마지막 획 지우기</Button>
        <Button size="sm" onClick={() => setStrokes([])} disabled={strokes.length === 0}>모두 지우기</Button>
        <Button size="sm" onClick={() => void copyPoints()} disabled={strokes.length === 0}>{copied ? '복사했어요' : '점 복사(JSON)'}</Button>
      </div>
    </div>

    <div className={styles.boards}>
      <figure className={`${styles.board} ${styles.drawBoard}`}>
        <svg ref={canvasRef} viewBox={`0 0 ${VIEW} ${VIEW}`} className={styles.canvas} data-testid="pen-lab-canvas"
          onPointerDown={begin} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish}>
          <rect width={VIEW} height={VIEW} fill={EDIT_COLOR.surface} />
          {GRID.map((at) => <g key={at} stroke={EDIT_COLOR.border} strokeWidth={1}><line x1={at} y1={0} x2={at} y2={VIEW} /><line x1={0} y1={at} x2={VIEW} y2={at} /></g>)}
          {strokes.map((raw, i) => <path key={i} d={rawPath(raw)} fill="none" stroke={EDIT_COLOR.foreground} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />)}
          {current && <path d={rawPath(current)} fill="none" stroke={EDIT_COLOR.editSelect} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />}
        </svg>
        <figcaption>그은 것 — 여기에 긋는다</figcaption>
      </figure>

      <figure className={styles.board}>
        <svg viewBox={`0 0 ${VIEW} ${VIEW}`} className={styles.result} data-testid="pen-lab-fitted">
          <rect width={VIEW} height={VIEW} fill={EDIT_COLOR.surface} />
          {GRID.map((at) => <g key={at} stroke={EDIT_COLOR.border} strokeWidth={1}><line x1={at} y1={0} x2={at} y2={VIEW} /><line x1={0} y1={at} x2={VIEW} y2={at} /></g>)}
          {fitted.map(({ raw, byEpsilon }, i) => {
            const result = byEpsilon[epsilon]
            if (!result) return null
            const points = result.stroke.points
            return <g key={i}>
              <path d={pointsToSvgD(points, false, BOX, VIEW)} fill="none" stroke={EDIT_COLOR.foreground} strokeWidth={THICKNESS * VIEW} strokeLinecap="round" strokeLinejoin="round" opacity={0.25} />
              <path d={rawPath(raw)} fill="none" stroke={EDIT_COLOR.text5} strokeWidth={2} />
              <path d={pointsToSvgD(points, false, BOX, VIEW)} fill="none" stroke={EDIT_COLOR.editSelect} strokeWidth={2} />
              {points.map((point, j) => <g key={j}>
                {point.handleIn && <line x1={point.x * VIEW} y1={point.y * VIEW} x2={point.handleIn.x * VIEW} y2={point.handleIn.y * VIEW} stroke={EDIT_COLOR.editHandle} strokeWidth={1.5} />}
                {point.handleOut && <line x1={point.x * VIEW} y1={point.y * VIEW} x2={point.handleOut.x * VIEW} y2={point.handleOut.y * VIEW} stroke={EDIT_COLOR.editHandle} strokeWidth={1.5} />}
                {point.handleIn && <circle cx={point.handleIn.x * VIEW} cy={point.handleIn.y * VIEW} r={5} fill={EDIT_COLOR.editHandle} />}
                {point.handleOut && <circle cx={point.handleOut.x * VIEW} cy={point.handleOut.y * VIEW} r={5} fill={EDIT_COLOR.editHandle} />}
                <circle cx={point.x * VIEW} cy={point.y * VIEW} r={8} fill={EDIT_COLOR.surface} stroke={EDIT_COLOR.editSelect} strokeWidth={3} />
              </g>)}
            </g>
          })}
        </svg>
        <figcaption>맞춘 획 — ε {epsilon} · 연한 띠는 두께 {THICKNESS}</figcaption>
      </figure>
    </div>

    <table className={styles.table} data-testid="pen-lab-table">
      <thead>
        <tr>
          <th rowSpan={2}>획</th>
          <th rowSpan={2}>점</th>
          <th rowSpan={2}>꺾임</th>
          {PEN_FIT_EPSILON_CANDIDATES.map((candidate) => <th key={candidate} colSpan={2} className={candidate === epsilon ? styles.chosen : undefined}>ε {candidate}</th>)}
        </tr>
        <tr>
          {PEN_FIT_EPSILON_CANDIDATES.map((candidate) => <HeadPair key={candidate} chosen={candidate === epsilon} />)}
        </tr>
      </thead>
      <tbody>
        {fitted.map(({ raw, byEpsilon }, i) => <tr key={i}>
          <td>{i + 1}</td>
          <td>{raw.length}</td>
          <td>{byEpsilon[epsilon]?.corners.length ?? '-'}</td>
          {PEN_FIT_EPSILON_CANDIDATES.map((candidate) => {
            const result = byEpsilon[candidate]
            const over = result ? result.maxDeviation > candidate : false
            return <ResultPair key={candidate} chosen={candidate === epsilon} anchors={result?.anchorCount} deviation={result ? toUnits(result.maxDeviation) : undefined} over={over} />
          })}
        </tr>)}
        {fitted.length === 0 && <tr><td colSpan={3 + PEN_FIT_EPSILON_CANDIDATES.length * 2} className={styles.empty}>아직 그은 획이 없다. 왼쪽 상자에 긋는다.</td></tr>}
      </tbody>
    </table>
    <p className={styles.note}>이탈은 1000 단위(ε 0.01 = 10). 앵커 수는 프리셋 획이 직선 2 · 꺾임 3 · 호 4–5쯤이다.</p>
  </div>
}

function HeadPair({ chosen }: { chosen: boolean }) {
  const className = chosen ? styles.chosen : undefined
  return <><th className={className}>앵커</th><th className={className}>이탈</th></>
}

function ResultPair({ chosen, anchors, deviation, over }: { chosen: boolean; anchors?: number; deviation?: string; over: boolean }) {
  const className = chosen ? styles.chosen : undefined
  return <><td className={className}>{anchors ?? '-'}</td><td className={`${className ?? ''} ${over ? styles.over : ''}`}>{deviation ?? '-'}</td></>
}
