import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { Check, ChevronDown, ChevronRight, Dices, RotateCcw } from 'lucide-react'
import type { PenPoint } from '../src/services/penStrokeFit'
import { useJamoStore } from '../src/stores/jamoStore'
import { propagatedJungseong } from '../src/stores/stemMasterStore'
import type { JamoData, LayoutType, ResolvedStrokeInkSource } from '../src/types'
import { decomposeSyllable } from '../src/utils/hangulUtils'
import { pointsToSvgD } from '../src/utils/pathUtils'
import { Button } from './components/ui/button'
import { ChoiceGroup, ChoiceItem } from './components/ui/choice-group'
import { Switch } from './components/ui/switch'
import { EDIT_COLOR } from './editColors'
import { FENCE_NAMES, summarize, type FencePull, type FenceSummaryRow, type ShakeLevel } from './fenceBand'
import { FencedGlyph } from './FencedGlyph'
import { randomSampleSentence } from './sampleSentences'
import { consonantBoxesOf, consonantShapesOf, consonantStemKeys, drawnStem, LAYOUTS, mastersOf, shapeConsonants, STEMS, stemInfo, vowelStemKeys, type DrawnStem, type StemKind } from './strokeLab'
import styles from './PillarLabPage.module.css'

/**
 * 획 긋기 시험판(학습 단계 프로토타입). 줄기 여섯(세로선 · 세로 짧은 선 · 가로선 · 가로 긴 선 · 대각선 · 동그라미)을 한 번씩 그으면
 * 예시 글줄의 그 줄기가 전부 내 선으로 바뀐다. 언제든 다시 긋는다. 주사위는 문장을 바꾸고, `자리 보기`는 지금 줄기가 쓰인 획을 색으로 보인다.
 * 폰에서 손가락 · 펜슬로 긋는 화면이 먼저다. 저장하지 않고 제품 값(자모 스토어 · 마스터)도 바꾸지 않는다 — 미리보기는 자모 덮어쓰기(override)로만.
 * 계산은 `strokeLab.ts`. 기획: 고양이 `학습-단계-뼈대-2026-11-20.md`.
 */

const FIRST_SENTENCE = '숲속 옹달샘에 토끼가 물을 마신다'
/** 긋는 판: 높이 1, 가로 0.75. */
const PAD_W = 0.75
const VIEW = 1000
const VIEWBOX = `0 0 ${PAD_W * VIEW} ${VIEW}`
/** 판에 보이는 잉크 굵기. 그은 선을 굵게 보여 줄 뿐, 글자 굵기는 서비스가 정한다. */
const PAD_INK = 0.06
const UNIT_BOX = { x: 0, y: 0, width: 1, height: 1 }

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

/** 받침 있는 말 뒤엔 `이에요`, 없으면 `예요`. */
function withCopula(word: string): string {
  const code = word.charCodeAt(word.length - 1) - 0xac00
  return code >= 0 && code < 11172 && code % 28 !== 0 ? `${word}이에요` : `${word}예요`
}

function reasonText(stem: Exclude<DrawnStem, { ok: true }>): string {
  if (stem.reason === 'short') return '조금 더 크게 그어 주세요'
  if (stem.reason === 'open') return '한 바퀴 이어서 그어 주세요'
  if (stem.reason === 'fit') return '다시 한 번 그어 주세요'
  if (stem.kind === 'diagonal') return '비스듬히 그어 주세요'
  return stem.kind === 'vertical' || stem.kind === 'shortVertical' ? '세로로 그어 주세요' : '가로로 그어 주세요'
}

const percent = (value: number) => `${(value * 100).toFixed(1)}%`
/** 값 하나의 결과 한 줄: 당긴 글자 수와 가장 크게 당긴 양, 못 당기고 남은 것. */
function fenceRowText(row: FenceSummaryRow): string {
  if (row.checked === 0) return '잴 글자 없음'
  const moved = row.count > 0 ? (row.value === 'clearance' ? `${row.count}자 넘친 획 ${percent(row.max)} 넣음` : `${row.count}자 ${percent(row.max)} ${row.word}`) : ''
  const stuck = row.stuck > 0 ? (row.value === 'clearance' ? `${row.stuck}자 아직 좁음` : `${row.stuck}자 ${percent(row.left)} 남음`) : ''
  return [moved, stuck].filter(Boolean).join(' · ') || '울타리 안'
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

export function PillarLabPage() {
  const [sentence, setSentence] = useState(FIRST_SENTENCE)
  const [raws, setRaws] = useState<Partial<Record<StemKind, PenPoint[]>>>({})
  const [current, setCurrent] = useState<PenPoint[] | null>(null)
  const [kind, setKind] = useState<StemKind>('vertical')
  const [view, setView] = useState<View>('mine')
  const [marked, setMarked] = useState(true)
  // 울타리 보정: 켜면 배치 값이 울타리(안전선) 밖인 글자를 당긴다. 흔들기는 보정이 당기는 걸 보려고 배치를 일부러 민다.
  const [fenceOn, setFenceOn] = useState(true)
  const [shake, setShake] = useState<ShakeLevel>(0)
  // 자세히(값 넷 · 흔들기)는 접어 둔다 — 폰에서 긋는 판까지 한 화면에 들어와야 긋다가 화면이 안 밀린다.
  const [fenceOpen, setFenceOpen] = useState(false)
  const [pulls, setPulls] = useState<Record<number, readonly FencePull[]>>({})
  const reportPulls = useCallback((index: number, list: readonly FencePull[]) => setPulls((all) => (all[index] === list ? all : { ...all, [index]: list })), [])
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

  const choseong = useJamoStore((state) => state.choseong)
  const jungseong = useJamoStore((state) => state.jungseong)
  const jongseong = useJamoStore((state) => state.jongseong)

  const stems = useMemo(() => Object.fromEntries(STEMS.flatMap((info) => {
    const raw = raws[info.kind]
    return raw ? [[info.kind, drawnStem(raw, info.kind)]] : []
  })) as Partial<Record<StemKind, DrawnStem>>, [raws])
  const overrides = useMemo(() => {
    const masters = mastersOf(stems, jungseong)
    const shapes = consonantShapesOf(stems)
    // 닿자 칸은 짜임마다 비율이 달라 짜임별로 따로 입힌다.
    const consonants = Object.fromEntries(LAYOUTS.map((layout) => {
      const box = consonantBoxesOf(layout)
      return [layout, { choseong: shapeConsonants(choseong, shapes, box.CH).changed, jongseong: shapeConsonants(jongseong, shapes, box.JO).changed }]
    })) as Record<LayoutType, { choseong: Record<string, JamoData>; jongseong: Record<string, JamoData> }>
    return {
      jungseong: Object.keys(masters).length ? propagatedJungseong(jungseong, {}, masters) : undefined,
      consonants,
    }
  }, [stems, choseong, jungseong, jongseong])
  const layoutOf = useCallback((char: string): LayoutType => decomposeSyllable(char, choseong, jungseong, jongseong).layoutType, [choseong, jungseong, jongseong])

  const vowelKeys = useMemo(() => vowelStemKeys(jungseong), [jungseong])
  const initialKeys = useMemo(() => consonantStemKeys(choseong), [choseong])
  const finalKeys = useMemo(() => consonantStemKeys(jongseong), [jongseong])
  const markColor = useCallback((source: ResolvedStrokeInkSource) => {
    const key = `${source.jamoId}:${source.strokeId}`
    const hit = source.part.startsWith('JU') ? vowelKeys.get(key) === kind
      : source.part === 'CH' ? initialKeys.get(key)?.includes(kind)
      : finalKeys.get(key)?.includes(kind)
    return hit ? EDIT_COLOR.editSelect : undefined
  }, [vowelKeys, initialKeys, finalKeys, kind])
  const strokeColorOf = marked ? markColor : undefined

  const stem = stems[kind]
  const raw = raws[kind]
  const info = stemInfo(kind)
  const accepted = !!stem?.ok
  const doneCount = STEMS.filter((item) => stems[item.kind]?.ok).length
  const kindIndex = STEMS.findIndex((item) => item.kind === kind)
  const next = STEMS[kindIndex + 1]
  const mine = view === 'mine'

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
    // 줄기 하나에 한 번 긋기. 새로 그으면 앞의 것을 바꾼다(다시 긋기).
    if (points && points.length >= 2) {
      setRaws((all) => ({ ...all, [kind]: points }))
      setView('mine')
    }
  }

  const chars = [...sentence]
  const livePulls = chars.map((char, index) => (char === ' ' ? [] : pulls[index] ?? []))
  const fenceRows = summarize(livePulls)
  const pulledCount = livePulls.filter((list) => list.some((item) => item.pulled !== 0)).length
  const stuckCount = livePulls.filter((list) => list.some((item) => item.left > 0)).length
  const fenceNote = [pulledCount > 0 ? `${fenceOn ? '' : '켜면 '}${pulledCount}자 당김` : '', stuckCount > 0 ? `${stuckCount}자는 다 못 당김` : ''].filter(Boolean).join(' · ') || '모두 울타리 안'
  const note = stem && !stem.ok ? reasonText(stem) : accepted ? `방금 그은 게 ${withCopula(info.term)}. 길이와 자리, 굵기는 우리가 맞췄어요.` : info.hint

  return <main className={styles.page} data-open={fenceOpen || undefined}>
    <header className={styles.header}>
      <span className={styles.eyebrow}>시험판 · 줄기 {doneCount}/{STEMS.length}</span>
      <h1>획 긋기</h1>
    </header>

    <section className={styles.lineCard} aria-label="예시 글줄">
      <div className={styles.line} data-testid="pillar-line">
        {chars.map((char, index) => char === ' '
          ? <span key={index} className={styles.space} />
          : <span key={index} className={styles.glyph} data-pulled={livePulls[index].some((item) => item.pulled !== 0) || undefined}>
            <FencedGlyph char={char} size={40}
              jungseongOverride={mine ? overrides.jungseong : undefined}
              choseongOverride={mine ? overrides.consonants[layoutOf(char)]?.choseong : undefined}
              jongseongOverride={mine ? overrides.consonants[layoutOf(char)]?.jongseong : undefined}
              strokeColorOf={strokeColorOf}
              fence={{ on: fenceOn, line: 'safe', shake, index }} onPulls={reportPulls} />
          </span>)}
      </div>
      <div className={styles.lineTools}>
        <Button variant="soft" size="chip" onClick={() => setSentence((now) => randomSampleSentence(now))} data-testid="pillar-roll"><Dices aria-hidden="true" />다른 문장</Button>
        <Button variant="chip" size="chip" aria-pressed={marked} onClick={() => setMarked((on) => !on)} data-testid="pillar-mark">자리 보기</Button>
        <ChoiceGroup variant="segment" aria-label="보기" className={styles.viewSwitch}>
          <ChoiceItem checked={mine} disabled={doneCount === 0} onClick={() => setView('mine')}>내 줄기</ChoiceItem>
          <ChoiceItem checked={!mine} onClick={() => setView('base')}>기본</ChoiceItem>
        </ChoiceGroup>
      </div>
      <div className={styles.fence} data-testid="fence-card">
        <div className={styles.fenceHead}>
          <Button variant="ghost" size="chip" aria-expanded={fenceOpen} onClick={() => setFenceOpen((open) => !open)} data-testid="fence-more">
            <strong>울타리 보정</strong><span data-testid="fence-count">{fenceNote}</span><ChevronDown aria-hidden="true" data-open={fenceOpen || undefined} />
          </Button>
          <Switch checked={fenceOn} onCheckedChange={setFenceOn} aria-label="울타리 보정" data-testid="fence-switch" />
        </div>
        {fenceOpen && <>
          <ul className={styles.fenceRows}>
            {fenceRows.map((row) => <li key={row.value} data-moved={row.count > 0 || undefined} data-stuck={row.stuck > 0 || undefined} data-testid={`fence-row-${row.value}`}>
              <span>{FENCE_NAMES[row.value]}</span>
              <b>{fenceRowText(row)}</b>
            </li>)}
          </ul>
          <div className={styles.fenceShake}>
            <span>일부러 흔들기</span>
            <ChoiceGroup variant="segment" aria-label="일부러 흔들기" className={styles.shakeSwitch}>
              {([[0, '끔'], [1, '조금'], [2, '많이']] as const).map(([level, name]) => <ChoiceItem key={level} checked={shake === level} onClick={() => setShake(level)} data-testid={`fence-shake-${level}`}>{name}</ChoiceItem>)}
            </ChoiceGroup>
          </div>
        </>}
      </div>
    </section>

    <nav className={styles.stems} aria-label="줄기">
      {STEMS.map((item, index) => {
        const done = !!stems[item.kind]?.ok
        return <Button key={item.kind} variant="chip" size="chip" aria-selected={item.kind === kind} data-done={done || undefined} onClick={() => setKind(item.kind)} data-testid={`pillar-stem-${item.kind}`}>
          {done ? <Check aria-hidden="true" /> : <span className={styles.stemNo}>{index + 1}</span>}{item.label}
        </Button>
      })}
    </nav>

    <section className={styles.padWrap} aria-label="긋는 판">
      <div className={styles.padBox}><svg ref={padRef} viewBox={VIEWBOX} className={styles.pad} data-testid="pillar-pad"
        onPointerDown={begin} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish}>
        <Guide kind={kind} />
        {!current && stem?.ok && <path d={pointsToSvgD(stem.fit.stroke.points, kind === 'circle', UNIT_BOX, VIEW)} fill="none" stroke={EDIT_COLOR.foreground} strokeWidth={PAD_INK * VIEW} strokeLinecap="round" strokeLinejoin="round" data-testid="pillar-fitted" />}
        {!current && raw && <path d={rawPath(raw)} fill="none" stroke={EDIT_COLOR.editSelect} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" opacity={0.7} />}
        {current && <path d={rawPath(current)} fill="none" stroke={EDIT_COLOR.foreground} strokeWidth={PAD_INK * VIEW} strokeLinecap="round" strokeLinejoin="round" />}
      </svg></div>
      <p className={styles.padNote} data-testid="pillar-note" data-state={stem && !stem.ok ? 'warn' : accepted ? 'done' : 'idle'}>{note}</p>
      <div className={styles.padActions}>
        <Button variant="outline" size="block" onClick={() => setRaws((all) => ({ ...all, [kind]: undefined }))} disabled={!raw} data-testid="pillar-reset"><RotateCcw aria-hidden="true" />다시 긋기</Button>
        {next && <Button variant={accepted ? 'default' : 'outline'} size="block" onClick={() => setKind(next.kind)} data-testid="pillar-next">{next.label}<ChevronRight aria-hidden="true" /></Button>}
      </div>
    </section>
  </main>
}
