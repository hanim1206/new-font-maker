import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { Dices, RotateCcw } from 'lucide-react'
import type { PenPoint } from '../src/services/penStrokeFit'
import { useJamoStore } from '../src/stores/jamoStore'
import { propagatedJungseong } from '../src/stores/stemMasterStore'
import type { ResolvedStrokeInkSource } from '../src/types'
import { pointsToSvgD } from '../src/utils/pathUtils'
import { AppGlyph } from './AppGlyph'
import { Button } from './components/ui/button'
import { ChoiceGroup, ChoiceItem } from './components/ui/choice-group'
import { EDIT_COLOR } from './editColors'
import { CALM_PRESETS, pillarFromDrawn, pillarStrokeKeys, type PillarResult } from './pillarStroke'
import { randomSampleSentence } from './sampleSentences'
import styles from './PillarLabPage.module.css'

/**
 * 기둥 긋기 시험판(학습 1단계). 세로로 한 번 그으면 예시 글줄의 홀자 기둥이 전부 내 선으로 바뀐다.
 * 떨림 정리는 중간으로 고정했다(세 벌 비교 뒤 하니무스 결정). 주사위는 문장을 바꾸고, `기둥 자리`는 내 줄기가 쓰인 획을 색으로 보인다.
 * 폰에서 손가락 · 펜슬로 긋는 화면이 먼저다. 저장하지 않고 제품 값(자모 스토어 · 마스터)도 바꾸지 않는다 — 미리보기는 `jungseongOverride`로만.
 * 기획: 고양이 `학습-단계-뼈대-2026-11-20.md`.
 */

const FIRST_SENTENCE = '하늘을 우러러 한 점 부끄럼 없기를'
/** 긋는 판: 높이 1em, 가로 0.75em. */
const PAD_W = 0.75
const VIEW = 1000
const VIEWBOX = `0 0 ${PAD_W * VIEW} ${VIEW}`
/** 판에 보이는 잉크 굵기(em). 그은 선을 굵게 보여 줄 뿐, 글자 굵기는 서비스가 정한다. */
const PAD_INK = 0.06
/** 떨림 정리는 중간으로 고정(하니무스 2026-11-20, 세 벌 고르기는 노출 안 함). */
const CALM_PRESET = CALM_PRESETS.find((preset) => preset.level === 'medium')!

type View = 'mine' | 'base'

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

const REASON_TEXT: Record<Exclude<PillarResult, { ok: true }>['reason'], string> = {
  short: '조금 더 길게 그어 주세요',
  'not-vertical': '세로로 그어 주세요',
  fit: '다시 한 번 그어 주세요',
}

export function PillarLabPage() {
  const [sentence, setSentence] = useState(FIRST_SENTENCE)
  const [raw, setRaw] = useState<PenPoint[] | null>(null)
  const [current, setCurrent] = useState<PenPoint[] | null>(null)
  const [view, setView] = useState<View>('mine')
  const [marked, setMarked] = useState(true)
  const drawing = useRef<PenPoint[] | null>(null)
  const activePointer = useRef<number | null>(null)
  const padRef = useRef<SVGSVGElement>(null)

  // iOS Safari는 SVG의 `touch-action: none`을 건너뛰기도 해서 세로로 그으면 화면이 스크롤된다. 터치 이동을 직접 막는다(passive 아님).
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

  const jungseong = useJamoStore((state) => state.jungseong)
  const pillarKeys = useMemo(() => pillarStrokeKeys(jungseong), [jungseong])

  const chosen = useMemo(() => (raw ? pillarFromDrawn(raw, CALM_PRESET) : null), [raw])
  const override = useMemo(() => (chosen?.ok ? propagatedJungseong(jungseong, {}, { gidung: chosen.master }) : undefined), [chosen, jungseong])
  const failed = chosen && !chosen.ok ? REASON_TEXT[chosen.reason] : null
  const accepted = !!chosen?.ok
  const lineOverride = view === 'mine' ? override : undefined

  const markColor = useCallback((source: ResolvedStrokeInkSource) => (
    source.part.startsWith('JU') && pillarKeys.has(`${source.jamoId}:${source.strokeId}`) ? EDIT_COLOR.editSelect : undefined
  ), [pillarKeys])
  const strokeColorOf = marked ? markColor : undefined

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
    // 한 번 긋기가 기둥 하나다. 새로 그으면 앞의 것을 바꾼다(다시 긋기).
    if (points && points.length >= 2) {
      setRaw(points)
      setView('mine')
    }
  }

  const chars = [...sentence]

  return <main className={styles.page}>
    <header className={styles.header}>
      <span className={styles.eyebrow}>시험판 · 1단계</span>
      <h1>기둥 긋기</h1>
      <p>아래 판에 세로로 한 번 그어 보세요.</p>
    </header>

    <section className={styles.lineCard} aria-label="예시 글줄">
      <div className={styles.line} data-testid="pillar-line">
        {chars.map((char, index) => char === ' '
          ? <span key={index} className={styles.space} />
          : <AppGlyph key={index} char={char} size={40} jungseongOverride={lineOverride} strokeColorOf={strokeColorOf} />)}
      </div>
      <div className={styles.lineTools}>
        <Button variant="soft" size="chip" onClick={() => setSentence((now) => randomSampleSentence(now))} data-testid="pillar-roll"><Dices aria-hidden="true" />다른 문장</Button>
        <Button variant="chip" size="chip" aria-pressed={marked} onClick={() => setMarked((on) => !on)} data-testid="pillar-mark">기둥 자리</Button>
        <ChoiceGroup variant="segment" aria-label="보기" className={styles.viewSwitch}>
          <ChoiceItem checked={view === 'mine'} disabled={!accepted} onClick={() => setView('mine')}>내 기둥</ChoiceItem>
          <ChoiceItem checked={view === 'base'} onClick={() => setView('base')}>기본</ChoiceItem>
        </ChoiceGroup>
      </div>
    </section>

    <section className={styles.padWrap} aria-label="긋는 판">
      <svg ref={padRef} viewBox={VIEWBOX} className={styles.pad} data-testid="pillar-pad"
        onPointerDown={begin} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish}>
        <line x1={PAD_W * VIEW / 2} y1={150} x2={PAD_W * VIEW / 2} y2={850} stroke={EDIT_COLOR.editGuide} strokeWidth={4} strokeDasharray="12 16" />
        {!current && chosen?.ok && <path d={pointsToSvgD(chosen.fit.stroke.points, false, { x: 0, y: 0, width: 1, height: 1 }, VIEW)} fill="none" stroke={EDIT_COLOR.foreground} strokeWidth={PAD_INK * VIEW} strokeLinecap="round" strokeLinejoin="round" data-testid="pillar-fitted" />}
        {!current && raw && <path d={rawPath(raw)} fill="none" stroke={EDIT_COLOR.editSelect} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" opacity={0.7} />}
        {current && <path d={rawPath(current)} fill="none" stroke={EDIT_COLOR.foreground} strokeWidth={PAD_INK * VIEW} strokeLinecap="round" strokeLinejoin="round" />}
      </svg>
      <p className={styles.padNote} data-testid="pillar-note" data-state={failed ? 'warn' : accepted ? 'done' : 'idle'}>
        {failed ?? (accepted ? '방금 그은 게 기둥이에요. 길이와 자리, 굵기는 우리가 맞췄어요.' : '점선을 따라 위에서 아래로')}
      </p>
      <Button variant="outline" size="block" onClick={() => { setRaw(null); setView('mine') }} disabled={!raw} data-testid="pillar-reset"><RotateCcw aria-hidden="true" />다시 긋기</Button>
    </section>
  </main>
}
