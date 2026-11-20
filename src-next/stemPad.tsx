import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { PenPoint } from '../src/services/penStrokeFit'
import { pointsToSvgD } from '../src/utils/pathUtils'
import { EDIT_COLOR } from './editColors'
import type { DrawnStem, StemKind } from './strokeLab'

/**
 * 줄기 긋는 판과 그 미리보기 계산. 획 긋기 시험판(`/pillar-lab`)과 학습 입구(`/start`)가 같이 쓴다.
 * 판은 폰 한 손으로 긋는 SVG다. 그은 점은 날것 그대로 받고, 모양 맞추기 · 퍼뜨리기는 `strokeLab.ts` · `stemPreview.ts`.
 */

/** 긋는 판: 높이 1, 가로 0.75. */
const PAD_W = 0.75
const VIEW = 1000
const VIEWBOX = `0 0 ${PAD_W * VIEW} ${VIEW}`
/** 판에 보이는 잉크 굵기. 그은 선을 굵게 보여 줄 뿐, 글자 굵기는 서비스가 정한다. */
const PAD_INK = 0.06
const UNIT_BOX = { x: 0, y: 0, width: 1, height: 1 }

const clamp = (value: number, max: number) => Math.max(0, Math.min(max, value))
const rawPath = (raw: readonly PenPoint[]) => raw.map((point, i) => `${i === 0 ? 'M' : 'L'}${(point.x * VIEW).toFixed(1)} ${(point.y * VIEW).toFixed(1)}`).join(' ')

function toPad(rect: DOMRect, clientX: number, clientY: number): PenPoint {
  return { x: clamp((clientX - rect.left) / rect.width * PAD_W, PAD_W), y: clamp((clientY - rect.top) / rect.height, 1) }
}

/** 펜은 한 프레임에 여러 점을 보낸다 — 합쳐진 이벤트를 풀어 떨림까지 그대로 받는다(펜 실험실과 같다). */
function pointsOf(event: ReactPointerEvent<SVGSVGElement>): PenPoint[] {
  const rect = event.currentTarget.getBoundingClientRect()
  const native = event.nativeEvent as globalThis.PointerEvent & { getCoalescedEvents?: () => globalThis.PointerEvent[] }
  const events = native.getCoalescedEvents?.() ?? []
  if (events.length === 0) return [toPad(rect, event.clientX, event.clientY)]
  return events.map((item) => toPad(rect, item.clientX, item.clientY))
}

/** 판에 까는 점선 길잡이. 길이 · 자리는 서비스가 정하니 대충의 크기만 보인다. */
function Guide({ kind }: { kind: StemKind }) {
  const props = { fill: 'none', stroke: EDIT_COLOR.editGuide, strokeWidth: 4, strokeDasharray: '12 16', strokeLinecap: 'round' as const }
  const cx = PAD_W * VIEW / 2
  if (kind === 'vertical') return <line x1={cx} y1={150} x2={cx} y2={850} {...props} />
  if (kind === 'shortVertical') return <line x1={cx} y1={340} x2={cx} y2={660} {...props} />
  if (kind === 'horizontal') return <line x1={cx - 150} y1={500} x2={cx + 150} y2={500} {...props} />
  if (kind === 'longHorizontal') return <line x1={70} y1={500} x2={PAD_W * VIEW - 70} y2={500} {...props} />
  if (kind === 'diagonal') return <line x1={cx + 200} y1={240} x2={cx - 200} y2={760} {...props} />
  return <circle cx={cx} cy={500} r={240} {...props} />
}

/**
 * 긋는 판. 한 손가락(펜)만 받고, 손을 떼면 `onDrawn`으로 날것을 넘긴다. 맞춘 줄기는 검정, 그은 날것은 옅은 파랑으로 겹쳐 보인다.
 * iOS Safari는 SVG의 `touch-action: none`을 건너뛰기도 해서 터치 이동을 직접 막는다(passive 아님).
 */
export function StemPad({ kind, raw, stem, onDrawn, className, testId, fittedTestId }: { kind: StemKind; raw?: readonly PenPoint[]; stem?: DrawnStem; onDrawn: (points: PenPoint[]) => void; className?: string; testId?: string; fittedTestId?: string }) {
  const [current, setCurrent] = useState<PenPoint[] | null>(null)
  const drawing = useRef<PenPoint[] | null>(null)
  const activePointer = useRef<number | null>(null)
  const padRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    const pad = padRef.current
    if (!pad) return
    const block = (event: TouchEvent) => { if (event.cancelable) event.preventDefault() }
    pad.addEventListener('touchstart', block, { passive: false })
    pad.addEventListener('touchmove', block, { passive: false })
    return () => {
      pad.removeEventListener('touchstart', block)
      pad.removeEventListener('touchmove', block)
    }
  }, [])

  const begin = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    if (activePointer.current !== null) return
    event.currentTarget.setPointerCapture(event.pointerId)
    activePointer.current = event.pointerId
    drawing.current = pointsOf(event)
    setCurrent(drawing.current)
  }
  const move = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!drawing.current || event.pointerId !== activePointer.current) return
    drawing.current = [...drawing.current, ...pointsOf(event)]
    setCurrent(drawing.current)
  }
  const finish = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.pointerId !== activePointer.current) return
    activePointer.current = null
    const points = drawing.current
    drawing.current = null
    setCurrent(null)
    if (points && points.length >= 2) onDrawn(points)
  }

  return <svg ref={padRef} viewBox={VIEWBOX} className={className} data-testid={testId} data-pinch-lock
    onPointerDown={begin} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish}>
    <Guide kind={kind} />
    {!current && stem?.ok && <path d={pointsToSvgD(stem.fit.stroke.points, kind === 'circle', UNIT_BOX, VIEW)} fill="none" stroke={EDIT_COLOR.foreground} strokeWidth={PAD_INK * VIEW} strokeLinecap="round" strokeLinejoin="round" data-testid={fittedTestId} />}
    {!current && raw && <path d={rawPath(raw)} fill="none" stroke={EDIT_COLOR.editSelect} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" opacity={0.7} />}
    {current && <path d={rawPath(current)} fill="none" stroke={EDIT_COLOR.foreground} strokeWidth={PAD_INK * VIEW} strokeLinecap="round" strokeLinejoin="round" />}
  </svg>
}
