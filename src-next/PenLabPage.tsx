import { useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { fitPenStroke, PEN_FIT_EPSILON, PEN_FIT_EPSILON_CANDIDATES } from '../src/services/penStrokeFit'
import type { PenFitResult, PenPoint } from '../src/services/penStrokeFit'
import { recognizePenJamo } from '../src/services/penJamo'
import { matchStrokeRoles, ROLE_MATCH_TAU, ROLE_MATCH_TAU_CANDIDATES } from '../src/services/strokeRoleMatch'
import type { JamoRecognition, RoleMatch } from '../src/services/strokeRoleMatch'
import { getBaseJamo } from '../src/stores/jamoStore'
import type { BoxConfig, JamoData, StrokeDataV2 } from '../src/types'
import { pointsToSvgD } from '../src/utils/pathUtils'
import { Button } from './components/ui/button'
import { EDIT_COLOR } from './editColors'
import styles from './PenLabPage.module.css'

/**
 * 펜 그리기 실험실. 플랜 `2026-10-05_펜으로-획-그리기.md`(맞춤 ε)와 `2026-10-05_고스트-따라-긋기.md`(역할 문턱 τ)의 확인 화면이다.
 * 자모를 고르면 프리셋 획이 고스트로 깔린다(끌 수 있다). 펜 · 손가락 · 마우스로 그으면 획 하나가 되고,
 * 오른쪽은 `fitPenStroke` → `matchStrokeRoles` → `adoptStrokeRoles`를 거친 결과 — 승계한 id와 자유 획, 자모 상태.
 * 표는 ε 후보별 앵커 수 · 이탈과 τ 후보별 짝을 획마다 낸다. 저장하지 않고 제품 값도 안 바꾼다. `점 복사`는 G1 녹화용.
 */

const VIEW = 1000
const BOX: BoxConfig = { x: 0, y: 0, width: 1, height: 1 }
const THICKNESS = 0.07
/** 상자 바깥 여백(viewBox 단위). 잉크가 칸 끝에서 두께/2만큼 나가므로 그만큼 보여 준다. */
const PAD = Math.ceil(THICKNESS / 2 * VIEW) + 5
const VIEWBOX = `${-PAD} ${-PAD} ${VIEW + PAD * 2} ${VIEW + PAD * 2}`
const toUnits = (value: number) => (value * VIEW).toFixed(1)

type Epsilon = typeof PEN_FIT_EPSILON_CANDIDATES[number]
type Tau = typeof ROLE_MATCH_TAU_CANDIDATES[number]
type JamoType = JamoData['type']
type Channel = 'strokes' | 'horizontalStrokes' | 'verticalStrokes'

const JAMO_TYPES: { key: JamoType; label: string }[] = [
  { key: 'choseong', label: '초성' },
  { key: 'jungseong', label: '중성' },
  { key: 'jongseong', label: '종성' },
]
const CHANNEL_LABEL: Record<Channel, string> = { strokes: '획', horizontalStrokes: '가로부', verticalStrokes: '세로부' }
const STATE_LABEL: Record<JamoRecognition, string> = { recognized: '인식됨', partial: '일부 자유', free: '자유' }

interface Fitted {
  raw: PenPoint[]
  byEpsilon: Record<Epsilon, PenFitResult | null>
}

const GRID = Array.from({ length: 9 }, (_, i) => ((i + 1) / 10) * VIEW)
const clamp01 = (value: number) => Math.max(0, Math.min(1, value))

function toBox(rect: DOMRect, clientX: number, clientY: number): PenPoint {
  const span = VIEW + PAD * 2
  return { x: clamp01(((clientX - rect.left) / rect.width * span - PAD) / VIEW), y: clamp01(((clientY - rect.top) / rect.height * span - PAD) / VIEW) }
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

/** 자모의 채널 목록. 섞임홀자는 가로부 · 세로부, 나머지는 획 하나. */
function channelsOf(jamo: JamoData | undefined): Channel[] {
  if (!jamo) return ['strokes']
  const channels: Channel[] = []
  if (jamo.strokes?.length) channels.push('strokes')
  if (jamo.horizontalStrokes?.length) channels.push('horizontalStrokes')
  if (jamo.verticalStrokes?.length) channels.push('verticalStrokes')
  return channels.length ? channels : ['strokes']
}

const rawPath = (raw: PenPoint[]) => raw.map((point, i) => `${i === 0 ? 'M' : 'L'}${(point.x * VIEW).toFixed(1)} ${(point.y * VIEW).toFixed(1)}`).join(' ')

/** 상자 바탕 · 테두리 · 눈금. viewBox가 상자보다 넓어 잉크가 칸 밖으로 나간 만큼도 보인다. */
function Grid() {
  return <><rect x={-PAD} y={-PAD} width={VIEW + PAD * 2} height={VIEW + PAD * 2} fill={EDIT_COLOR.surface} /><rect width={VIEW} height={VIEW} fill="none" stroke={EDIT_COLOR.border} strokeWidth={2} />{GRID.map((at) => <g key={at} stroke={EDIT_COLOR.border} strokeWidth={1}><line x1={at} y1={0} x2={at} y2={VIEW} /><line x1={0} y1={at} x2={VIEW} y2={at} /></g>)}</>
}

export function PenLabPage() {
  const [strokes, setStrokes] = useState<PenPoint[][]>([])
  const [current, setCurrent] = useState<PenPoint[] | null>(null)
  const [epsilon, setEpsilon] = useState<Epsilon>(PEN_FIT_EPSILON)
  const [tau, setTau] = useState<Tau>(ROLE_MATCH_TAU)
  const [jamoType, setJamoType] = useState<JamoType>('choseong')
  const [char, setChar] = useState('ㄱ')
  const [channel, setChannel] = useState<Channel>('strokes')
  const [ghost, setGhost] = useState(true)
  /** 그린 묶음을 프리셋 범위에 꽉 채운 뒤 판정한다(10-05 사용자 결정, 기본 켬). */
  const [fill, setFill] = useState(true)
  /** 연달아 그은 획의 끝점이 두께 안이면 한 획으로 잇는다(10-05 사용자 결정, 기본 켬). */
  const [join, setJoin] = useState(true)
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

  const jamo = useMemo(() => getBaseJamo(jamoType, char.trim().slice(0, 1)), [jamoType, char])
  const channels = channelsOf(jamo)
  const activeChannel: Channel = channels.includes(channel) ? channel : channels[0]
  const presets = useMemo<StrokeDataV2[]>(() => jamo?.[activeChannel] ?? [], [jamo, activeChannel])

  const fitted = useMemo<Fitted[]>(() => strokes.map((raw, index) => ({
    raw,
    byEpsilon: Object.fromEntries(PEN_FIT_EPSILON_CANDIDATES.map((candidate) => [candidate, fitPenStroke(raw, { epsilon: candidate, thickness: THICKNESS, id: `pen-${index}` })])) as Record<Epsilon, PenFitResult | null>,
  })), [strokes])

  /** 맞춤 → 잇기 → 채우기 → 판정은 편집기 펜과 같은 `recognizePenJamo`. 토글은 옵션으로 넘긴다. */
  const recognized = useMemo(
    () => recognizePenJamo({ [activeChannel]: strokes }, jamo ?? { char: 'jamo' }, { epsilon, tau, fill, join }).byChannel[activeChannel],
    [strokes, activeChannel, jamo, epsilon, tau, fill, join],
  )
  const drawn = useMemo(() => recognized?.drawn ?? [], [recognized])
  /** 판정 전 획에 τ 후보별 짝. */
  const matches = useMemo(() => Object.fromEntries(ROLE_MATCH_TAU_CANDIDATES.map((candidate) => [candidate, matchStrokeRoles(drawn, presets, { tau: candidate })])) as Record<Tau, RoleMatch>, [drawn, presets])
  const adopted = { strokes: recognized?.strokes ?? [], state: recognized?.state ?? 'free' }

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
      await navigator.clipboard.writeText(JSON.stringify({ jamo: jamo ? `${jamoType}/${jamo.char}/${activeChannel}` : null, strokes: strokes.map((raw) => raw.map((point) => ({ x: Number(point.x.toFixed(4)), y: Number(point.y.toFixed(4)) }))) }))
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  const pairLabel = (drawnIndex: number, candidate: Tau) => {
    const pair = matches[candidate].pairs.find((item) => item.drawn === drawnIndex)
    return pair ? `${presets[pair.preset].id} ${pair.score.toFixed(2)}` : '자유'
  }
  /** 표의 그린 획 번호 → drawn 인덱스(맞춤 실패한 획은 빠진다). */
  const drawnIndexOf = (fittedIndex: number) => fitted.slice(0, fittedIndex).filter((item) => item.byEpsilon[epsilon]).length

  return <div className={styles.page}>
    <header className={styles.header}>
      <span>Lab</span>
      <h1>펜 그리기</h1>
      <p>자모를 고르면 프리셋 획이 고스트로 깔린다. 펜이나 손가락으로 그으면 획 하나가 되고, 오른쪽은 허용오차 ε로 줄인 뒤 문턱 τ로 프리셋 획에 역할을 붙인 결과다. 상자 안에서는 스크롤되지 않는다.</p>
    </header>

    <div className={styles.controls}>
      <div className={styles.group} role="radiogroup" aria-label="자모 종류">
        {JAMO_TYPES.map((item) => <Button key={item.key} size="sm" variant={item.key === jamoType ? 'primary' : 'default'} role="radio" aria-checked={item.key === jamoType} onClick={() => { setJamoType(item.key); setStrokes([]) }}>{item.label}</Button>)}
        <input className={styles.char} value={char} maxLength={1} onChange={(event) => { setChar(event.target.value); setStrokes([]) }} aria-label="자모" data-testid="pen-lab-char" />
        {channels.length > 1 && channels.map((item) => <Button key={item} size="sm" variant={item === activeChannel ? 'primary' : 'default'} role="radio" aria-checked={item === activeChannel} onClick={() => { setChannel(item); setStrokes([]) }}>{CHANNEL_LABEL[item]}</Button>)}
        <Button size="sm" variant={ghost ? 'primary' : 'default'} aria-pressed={ghost} onClick={() => setGhost((on) => !on)}>고스트</Button>
        <Button size="sm" variant={fill ? 'primary' : 'default'} aria-pressed={fill} onClick={() => setFill((on) => !on)} data-testid="pen-lab-fill">꽉 채우기</Button>
        <Button size="sm" variant={join ? 'primary' : 'default'} aria-pressed={join} onClick={() => setJoin((on) => !on)} data-testid="pen-lab-join">이어 붙이기</Button>
        {!jamo && <small className={styles.warn}>프리셋에 없는 자모</small>}
      </div>
      <div className={styles.group} role="radiogroup" aria-label="허용오차 ε">
        <span>ε</span>
        {PEN_FIT_EPSILON_CANDIDATES.map((candidate) => <Button key={candidate} size="sm" variant={candidate === epsilon ? 'primary' : 'default'} role="radio" aria-checked={candidate === epsilon} onClick={() => setEpsilon(candidate)} data-testid={`pen-lab-eps-${candidate}`}>{candidate}</Button>)}
        <span>τ</span>
        {ROLE_MATCH_TAU_CANDIDATES.map((candidate) => <Button key={candidate} size="sm" variant={candidate === tau ? 'primary' : 'default'} role="radio" aria-checked={candidate === tau} onClick={() => setTau(candidate)} data-testid={`pen-lab-tau-${candidate}`}>{candidate}</Button>)}
      </div>
      <div className={styles.group}>
        <Button size="sm" onClick={() => setStrokes((list) => list.slice(0, -1))} disabled={strokes.length === 0}>마지막 획 지우기</Button>
        <Button size="sm" onClick={() => setStrokes([])} disabled={strokes.length === 0}>모두 지우기</Button>
        <Button size="sm" onClick={() => void copyPoints()} disabled={strokes.length === 0}>{copied ? '복사했어요' : '점 복사(JSON)'}</Button>
      </div>
    </div>

    <div className={styles.boards}>
      <figure className={`${styles.board} ${styles.drawBoard}`}>
        <svg ref={canvasRef} viewBox={VIEWBOX} className={styles.canvas} data-testid="pen-lab-canvas"
          onPointerDown={begin} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish}>
          <Grid />
          {ghost && presets.map((preset) => <path key={preset.id} d={pointsToSvgD(preset.points, preset.closed, BOX, VIEW)} fill="none" stroke={EDIT_COLOR.editGuide} strokeWidth={preset.thickness * VIEW} strokeLinecap="round" strokeLinejoin="round" opacity={0.6} />)}
          {strokes.map((raw, i) => <path key={i} d={rawPath(raw)} fill="none" stroke={EDIT_COLOR.foreground} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />)}
          {current && <path d={rawPath(current)} fill="none" stroke={EDIT_COLOR.editSelect} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />}
        </svg>
        <figcaption>그은 것 — 여기에 긋는다{jamo ? ` · ${jamo.char} ${CHANNEL_LABEL[activeChannel]} 프리셋 획 ${presets.length}개` : ''}</figcaption>
      </figure>

      <figure className={styles.board}>
        <svg viewBox={VIEWBOX} className={styles.result} data-testid="pen-lab-fitted">
          <Grid />
          {adopted.strokes.map((stroke) => {
            const isFree = stroke.id.startsWith('pen-')
            const d = pointsToSvgD(stroke.points, stroke.closed, BOX, VIEW)
            const label = stroke.points[0]
            return <g key={stroke.id} data-testid={`pen-lab-adopted-${stroke.id}`}>
              <path d={d} fill="none" stroke={isFree ? EDIT_COLOR.text5 : EDIT_COLOR.foreground} strokeWidth={stroke.thickness * VIEW} strokeLinecap="round" strokeLinejoin="round" opacity={0.25} />
              <path d={d} fill="none" stroke={isFree ? EDIT_COLOR.destructive : EDIT_COLOR.editSelect} strokeWidth={2} />
              {stroke.points.map((point, j) => <g key={j}>
                {point.handleIn && <line x1={point.x * VIEW} y1={point.y * VIEW} x2={point.handleIn.x * VIEW} y2={point.handleIn.y * VIEW} stroke={EDIT_COLOR.editHandle} strokeWidth={1.5} />}
                {point.handleOut && <line x1={point.x * VIEW} y1={point.y * VIEW} x2={point.handleOut.x * VIEW} y2={point.handleOut.y * VIEW} stroke={EDIT_COLOR.editHandle} strokeWidth={1.5} />}
                <circle cx={point.x * VIEW} cy={point.y * VIEW} r={j === 0 ? 10 : 7} fill={j === 0 ? EDIT_COLOR.editSelect : EDIT_COLOR.surface} stroke={EDIT_COLOR.editSelect} strokeWidth={3} />
              </g>)}
              <text x={label.x * VIEW + 14} y={label.y * VIEW - 14} fill={isFree ? EDIT_COLOR.destructive : EDIT_COLOR.foreground} fontSize={28} fontWeight={700}>{stroke.id}</text>
            </g>
          })}
        </svg>
        <figcaption>
          맞춘 획 — ε {epsilon} · τ {tau} · 큰 점이 시작점
          {drawn.length > 0 && <strong className={`${styles.state} ${styles[adopted.state]}`} data-testid="pen-lab-state">{STATE_LABEL[adopted.state]}{matches[tau].missing.length > 0 ? ` · 안 그린 획 ${matches[tau].missing.map((index) => presets[index].id).join(', ')}` : ''}</strong>}
        </figcaption>
      </figure>
    </div>

    <table className={styles.table} data-testid="pen-lab-table">
      <thead>
        <tr>
          <th rowSpan={2}>획</th>
          <th rowSpan={2}>점</th>
          <th rowSpan={2}>꺾임</th>
          {PEN_FIT_EPSILON_CANDIDATES.map((candidate) => <th key={candidate} colSpan={2} className={candidate === epsilon ? styles.chosen : undefined}>ε {candidate}</th>)}
          {ROLE_MATCH_TAU_CANDIDATES.map((candidate) => <th key={candidate} rowSpan={2} className={candidate === tau ? styles.chosen : undefined}>τ {candidate}</th>)}
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
          {ROLE_MATCH_TAU_CANDIDATES.map((candidate) => <td key={candidate} className={candidate === tau ? styles.chosen : undefined}>{byEpsilon[epsilon] ? pairLabel(drawnIndexOf(i), candidate) : '-'}</td>)}
        </tr>)}
        {fitted.length === 0 && <tr><td colSpan={3 + PEN_FIT_EPSILON_CANDIDATES.length * 2 + ROLE_MATCH_TAU_CANDIDATES.length} className={styles.empty}>아직 그은 획이 없다. 왼쪽 상자에 긋는다.</td></tr>}
      </tbody>
    </table>
    <p className={styles.note}>이탈은 1000 단위(ε 0.01 = 10). 짝 칸은 승계한 프리셋 획 id와 점수(각도 · 위치 · 크기 · 닫힘 가중합). 자유는 짝 없음.</p>
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
