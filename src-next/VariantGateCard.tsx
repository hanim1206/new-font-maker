import { useEffect, useId, useMemo, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import type { JamoData, MedialFamily } from '../src/types'
import { useJamoStore } from '../src/stores/jamoStore'
import { withFrameFrom } from '../src/utils/jamoFrame'
import { AppGlyph } from './AppGlyph'
import { Pressable } from './components/ui/pressable'
import styles from './VariantGateCard.module.css'

/** 홀자 계열 이름. 어휘사전의 세로홀자 · 가로홀자 · 섞임홀자. */
export const MEDIAL_FAMILY_LABEL: Readonly<Record<MedialFamily, string>> = { right: '세로홀자', bottom: '가로홀자', mixed: '섞임홀자' }
const FAMILIES: readonly MedialFamily[] = ['right', 'bottom', 'mixed']
/** 트리 자리. 그림(svg)은 332×240, 가지 가운데 y 셋, 기본 칸 오른쪽 끝 · 가지 왼쪽 끝 x. CSS `.root` · `.branch`와 같은 값. */
const BRANCH_Y = [40, 120, 200] as const
const ROOT_CY = 120
const ROOT_RIGHT = 120
const BRANCH_LEFT = 196
const BRANCH_H = 72
/** 화살표를 누른 뒤 선이 끊기는 동안. CSS `snapLine` · `snapBranch`와 같은 길이. */
const SNAP_MS = 520

/** 숨쉬기 한 바퀴. 기본 ㅈ의 마지막 획이 길어졌다 짧아진다 — 선이 이어진 가지도 같이, 따로 그린 가지는 가만히. */
const BREATH_MS = 2400
/** 이어진 선의 움직임. `wiggle` = 선이 우글우글 물결친다, `ball` = 작은 공이 기본에서 가지로 넘어간다(보관). */
const LINE_MOTION: 'wiggle' | 'ball' = 'wiggle'
/** 물결: 선을 몇 토막으로 나누는지 · 흔들림 폭(px) · 선 하나에 파도 몇 개 · 숨 한 번에 파도가 몇 바퀴 가는지. */
const WAVE_STEPS = 28
const WAVE_AMP = 2.6
const WAVE_COUNT = 2.5
const WAVE_TURNS = 2

/** 기본 오른쪽 가운데에서 가지 왼쪽 가운데로 가는 S자 곡선의 점. `t` 0~1. */
function curvePoint(index: number, t: number): { x: number; y: number } {
  const y1 = BRANCH_Y[index]
  const p0 = { x: ROOT_RIGHT, y: ROOT_CY }, p1 = { x: ROOT_RIGHT + 40, y: ROOT_CY }, p2 = { x: BRANCH_LEFT - 40, y: y1 }, p3 = { x: BRANCH_LEFT, y: y1 }
  const u = 1 - t
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  }
}

/** 이어진 선. 가만히면 베지어 하나, 물결이면 곡선을 토막 내어 각 점을 법선 방향으로 흔든 꺾은선(양 끝은 고정). */
function linePath(index: number, wave: number | null): string {
  if (wave === null) return `M ${ROOT_RIGHT} ${ROOT_CY} C ${ROOT_RIGHT + 40} ${ROOT_CY} ${BRANCH_LEFT - 40} ${BRANCH_Y[index]} ${BRANCH_LEFT} ${BRANCH_Y[index]}`
  const parts: string[] = []
  for (let i = 0; i <= WAVE_STEPS; i += 1) {
    const t = i / WAVE_STEPS
    const p = curvePoint(index, t)
    const ahead = curvePoint(index, Math.min(1, t + 0.01)), behind = curvePoint(index, Math.max(0, t - 0.01))
    const dx = ahead.x - behind.x, dy = ahead.y - behind.y, len = Math.hypot(dx, dy) || 1
    const offset = WAVE_AMP * Math.sin(Math.PI * t) * Math.sin(Math.PI * 2 * (WAVE_COUNT * t - wave))
    parts.push(`${i === 0 ? 'M' : 'L'} ${(p.x - dy / len * offset).toFixed(2)} ${(p.y + dx / len * offset).toFixed(2)}`)
  }
  return parts.join(' ')
}
/** 마지막 획 길이의 변화 폭. 원래 길이보다 조금 짧아졌다가 꽤 길어진다. */
const BREATH_MIN = -0.12
const BREATH_MAX = 0.3

/**
 * 기본 획의 마지막 획 끝을 `amount`만큼 늘인 사본. 틀은 원래 획으로 굳혀 두어 나머지 획과 상자는 제자리고, 늘어난 끝만 밖으로 나간다.
 * 변형(`contextStrokes`)은 안 건드린다 — 그래서 따로 그린 가지는 숨쉬지 않는다.
 */
function breathe(jamo: JamoData, amount: number): JamoData {
  const strokes = jamo.strokes
  if (!strokes?.length) return jamo
  const last = strokes[strokes.length - 1]
  if (last.closed || last.points.length < 2) return jamo
  const tail = last.points[last.points.length - 1]
  const prev = last.points[last.points.length - 2]
  const end = { ...tail, x: prev.x + (tail.x - prev.x) * (1 + amount), y: prev.y + (tail.y - prev.y) * (1 + amount) }
  const next: JamoData = { ...jamo, strokes: [...strokes.slice(0, -1), { ...last, points: [...last.points.slice(0, -1), end] }] }
  return withFrameFrom(next, jamo)
}

/** 움직임 줄이기 설정. */
function reducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

/** 트리의 칸. `base` = 기본, 나머지 = 홀자 계열 가지. */
export type VariantNode = MedialFamily | 'base'

/**
 * 첫닿자 변형 트리. 왼쪽 큰 칸이 기본 ㅈ, 오른쪽 세 가지가 홀자 계열. 기본에 선이 이어진 가지는 기본을 따라오고, 따로 그린 가지는 선이 끊겨 혼자 선다.
 * 칸은 전부 고를 수 있다. 고른 칸은 옅은 바탕(테두리 없음)에 화살표 하나(기본은 오른쪽 아래). 화살표나 그 칸을 한 번 더 누르면 그리로 간다 —
 * 안 가른 가지는 선이 튕기며 끊긴 뒤 갈라져 간다. 합치기 단추는 없다(10-06 사용자 — 되돌리기로만). 말로 된 설명과 큰 단추는 두지 않는다.
 * 두 자리에 선다: 안 가른 계열의 글자를 열었을 때 조절판 자리(게이트), 그리고 `닿는 글자` 줄 `⋯`로 여는 토글.
 */
export function VariantGateCard({ jamo, viewing, splitFamilies, examples, onSplit, onGo, onPick }: {
  jamo: string
  /** 지금 보는 칸. 열릴 때 이 칸이 골라져 있다. */
  viewing: VariantNode
  /** 따로 그려 둔 계열. 선이 끊긴다. */
  splitFamilies: readonly string[]
  /** 계열마다 가지에 그릴 대표 글자(자 · 조 · 좌). */
  examples: Readonly<Partial<Record<MedialFamily, string>>>
  /** 안 가른 가지로 갈 때 먼저 가른다. 선이 끊기는 움직임 뒤에 온다. */
  onSplit: (family: MedialFamily) => void
  /** 고른 칸으로 간다(기본 = 단독 칸, 가지 = 그 계열 첫 글자). */
  onGo: (node: VariantNode) => void
  /** 칸을 고를 때마다. 위 `닿는 글자` 줄의 켜진 덩이가 따라온다. */
  onPick?: (node: VariantNode) => void
}) {
  const [picked, setPicked] = useState<VariantNode>(viewing)
  // 숨쉬기. 기본 ㅈ의 마지막 획을 늘였다 줄인 사본을 네 칸 그림에 모두 넣는다 — 이어진 가지만 따라 움직인다.
  const stored = useJamoStore((state) => state.choseong[jamo])
  // 한 바퀴 안의 자리(0~1). 숨쉬기와 선의 물결이 같은 시계를 쓴다. 움직임 줄이기면 멈춘 채.
  const [phase, setPhase] = useState<number | null>(null)
  useEffect(() => {
    if (reducedMotion()) return
    let frame = 0
    const start = performance.now()
    const tick = (now: number) => {
      setPhase(Math.round(((now - start) % BREATH_MS) / BREATH_MS * 120) / 120)
      frame = window.requestAnimationFrame(tick)
    }
    frame = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(frame)
  }, [])
  const breath = phase === null ? 0.3 : 0.5 - 0.5 * Math.cos(phase * Math.PI * 2)
  const wave = phase === null || LINE_MOTION !== 'wiggle' ? null : phase * WAVE_TURNS
  const breathing = useMemo(() => stored ? { [jamo]: breathe(stored, BREATH_MIN + breath * (BREATH_MAX - BREATH_MIN)) } : undefined, [stored, breath, jamo])
  const lineId = useId()
  useEffect(() => { setPicked(viewing) }, [viewing])
  // 안 가른 가지로 가면 바로 가르지 않고, 그 가지의 선이 튕기며 끊기는 걸 보여 준 뒤 가르고 간다. 움직임 줄이기 설정이면 바로.
  const [snapping, setSnapping] = useState<MedialFamily | null>(null)
  useEffect(() => {
    if (!snapping) return
    const reduce = reducedMotion()
    const timer = window.setTimeout(() => { onSplit(snapping); if (snapping !== viewing) onGo(snapping) }, reduce ? 0 : SNAP_MS)
    return () => window.clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 누른 순간의 콜백으로 한 번만 간다.
  }, [snapping])
  const needsSplit = (node: VariantNode) => node !== 'base' && !splitFamilies.includes(node)
  const go = (node: VariantNode) => {
    if (snapping) return
    if (node !== 'base' && needsSplit(node)) { setSnapping(node); return }
    if (node !== viewing) onGo(node)
  }
  // 칸을 누르면 고르고, 고른 칸을 한 번 더 누르면 간다.
  const press = (node: VariantNode) => { if (picked === node) go(node); else { setPicked(node); onPick?.(node) } }
  const labelOf = (node: VariantNode) => node === 'base' ? `기본 ${jamo}` : `${MEDIAL_FAMILY_LABEL[node]} ${jamo}`
  // 고른 칸의 화살표. 지금 보는 칸이면 안 선다 — 안 가른 가지(게이트)만 빼고, 거기선 화살표 = 따로 그리기.
  const arrow = (node: VariantNode) => picked === node && (node !== viewing || needsSplit(node)) && <Pressable type="button" className={styles.go} onClick={() => go(node)} disabled={snapping !== null} aria-label={needsSplit(node) ? `${labelOf(node)} 따로 그리기` : `${labelOf(node)}로 가기`} data-testid={needsSplit(node) ? 'variant-gate-split' : 'variant-gate-go'}><ArrowRight size={16} aria-hidden="true" /></Pressable>
  return <section className={styles.card} aria-label={`${jamo} 변형 트리`} data-testid="variant-gate" data-family={viewing === 'base' ? undefined : viewing} data-picked={picked}>
    <svg className={styles.lines} viewBox="0 0 332 240" aria-hidden="true">
      {/* 이어진 선. 물결이면 가지마다 반 파도씩 어긋나게. 끊기는 중인 선은 가만히(끊김 움직임이 `pathLength` 기준이라). */}
      {FAMILIES.map((item, index) => splitFamilies.includes(item) ? null : <path key={item} id={`${lineId}${item}`} pathLength={1} d={linePath(index, snapping === item || wave === null ? null : wave + index / 3)} data-snapping={snapping === item || undefined} />)}
      {/* 기본에서 가지로 넘어가는 작은 공(`LINE_MOTION = 'ball'`). 이어진 선에만, 가지마다 조금씩 어긋나게. 끊기는 중인 선에는 없다. */}
      {LINE_MOTION === 'ball' && !reducedMotion() && FAMILIES.map((item, index) => splitFamilies.includes(item) || snapping === item ? null : <circle key={item} className={styles.pulse} r="5">
        <animateMotion dur="1.8s" begin={`${index * 0.45}s`} repeatCount="indefinite" calcMode="spline" keyTimes="0;1" keySplines=".45 0 .55 1"><mpath href={`#${lineId}${item}`} /></animateMotion>
      </circle>)}
    </svg>
    {/* 칸 안에 단추가 둘(고르기 · 가기)이라 칸은 상자, 고르기 단추가 칸을 채운다. */}
    <div className={styles.root} data-picked={picked === 'base' || undefined} data-snapping={snapping ? true : undefined} data-testid="variant-gate-root">
      <Pressable type="button" className={styles.pick} onClick={() => press('base')} aria-pressed={picked === 'base'} aria-current={viewing === 'base' || undefined} aria-label={labelOf('base')}>
        <AppGlyph char={jamo} size={96} upright choseongOverride={breathing} />
        <span className={styles.label}>기본</span>
      </Pressable>
      {arrow('base')}
    </div>
    {FAMILIES.map((item, index) => {
      const split = splitFamilies.includes(item)
      return <div key={item} className={styles.branch} style={{ top: BRANCH_Y[index] + 14 - BRANCH_H / 2 }} data-family={item} data-picked={picked === item || undefined} data-split={split || undefined} data-snapping={snapping === item || undefined} data-testid="variant-gate-branch">
        {/* 글자 위 · 이름표 아래로 쌓아 오른쪽 화살표 자리를 비운다. */}
        <Pressable type="button" className={styles.pick} onClick={() => press(item)} aria-pressed={picked === item} aria-current={viewing === item || undefined} aria-label={labelOf(item)}>
          <span className={styles.glyph}>{examples[item] ? <AppGlyph char={examples[item]!} size={42} upright choseongOverride={breathing} /> : <AppGlyph char={jamo} size={42} upright choseongOverride={breathing} />}</span>
          <span className={styles.label}>{MEDIAL_FAMILY_LABEL[item]}</span>
        </Pressable>
        {arrow(item)}
      </div>
    })}
  </section>
}
