import { useEffect, useId, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ArrowRight } from 'lucide-react'
import type { JamoData, MedialFamily } from '../src/types'
import { useJamoStore } from '../src/stores/jamoStore'
import { withFrameFrom } from '../src/utils/jamoFrame'
import { mergeFamilyStrokes } from '../src/utils/jamoContextStrokes'
import { AppGlyph } from './AppGlyph'
import { Button } from './components/ui/button'
import { Switch } from './components/ui/switch'
import { initialRowExamples } from './reviewPropagation'
import { Pressable } from './components/ui/pressable'
import styles from './VariantGateCard.module.css'

/* eslint-disable react-refresh/only-export-components -- 계열 이름표는 편집기 · 줄이 같이 쓴다 */

/** 홀자 계열 이름. 어휘사전의 세로홀자 · 가로홀자 · 섞임홀자. */
export const MEDIAL_FAMILY_LABEL: Readonly<Record<MedialFamily, string>> = { right: '세로홀자', bottom: '가로홀자', mixed: '섞임홀자' }
const FAMILIES: readonly MedialFamily[] = ['right', 'bottom', 'mixed']
/** 트리 자리. 그림(svg)은 332×240, 가지 가운데 y 셋, 기본 칸 오른쪽 끝 · 가지 왼쪽 끝 x. CSS `.root` · `.branch`와 같은 값. */
const BRANCH_Y = [40, 120, 200] as const
const ROOT_CY = 120
const ROOT_RIGHT = 120
/** 가지 칸의 왼쪽 끝. 이어진 가지는 기본 쪽으로 4px 붙어 서므로(CSS `--shift`) 선도 거기서 끝난다 — 칸 위로 겹치지 않게. */
const BRANCH_LEFT = 192
const BRANCH_H = 72
/** 토글을 끈 뒤: 선이 파랗게 물들며 끊기고(0.5초) 그 다음 칸이 자리를 옮긴다(0.45초, 0.45초 뒤). 선 먼저 · 칸 나중(10-07 사용자). CSS `snapLine` → `snapBranch` · `snapRoot`와 같다. */
const SNAP_MS = 920
/** 토글을 켠 뒤: 파란 선이 기본에서 가지로 뻗어 나와 회색으로 가라앉고(0.6초), 닿으면 가지가 자리를 옮긴다(0.4초, 0.42초 뒤). CSS `joinLine` → `joinBranch`와 같다. */
const JOIN_MS = 840

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
 * 첫닿자 변형 트리. 왼쪽 큰 칸이 기본 ㅈ, 오른쪽 세 가지가 홀자 계열(보기 글자 둘 · 이름표, 가운데 정렬). 기본에 선이 이어진 가지는 기본을 따라오고 기본 쪽(왼쪽)에 살짝 붙어 서고, 따로 그린 가지는 선이 끊겨 살짝 오른쪽에 혼자 선다(토글의 임시값도 같이).
 * 칸은 전부 고를 수 있고, 고르면 옅은 바탕 + 파란 이름표(테두리 없음). 카드 탭은 "아래가 누굴 가리키나"만 정한다 — 윗줄 · 캔버스는 안 바뀌고 이동도 없다(10-07 사용자). 아래가 맡는다:
 * - 가지를 고르면 토글 `기본 ㅈ과 연결` + `적용`. 토글을 끄면 선이 튕기며 끊기고(미리보기), 켜면 선이 돌아온다. 임시값은 카드마다 남아 여러 카드를 바꾼 뒤
 *   `적용` 한 번에 전부 간다(10-07 사용자) — 끊는 것은 가르고, 잇는 것은 확인 시트(지금 → 덮어쓴 뒤, 계열마다 한 줄) 한 번 뒤 변형을 지운다. `적용`은 바뀐 게 있을 때만 켜진다.
 * - 기본을 고르면 토글 없이 `기본 ㅈ 고치기`: 상속받는 글자에서 열렸으면 그 자리에서 기본을 고치게 열고, 아니면 단독 칸으로 간다. 이미 기본 칸이면 눌리지 않는다.
 * 말로 된 설명은 두지 않는다.
 * 두 자리에 선다: 상속받는 글자(안 가른 계열)에 처음 손댈 때 묻는 창, 그리고 `닿는 글자` 줄 `⋯`로 여는 지도.
 */
export function VariantGateCard({ jamo, viewing, splitFamilies, onApply, onEditBase }: {
  jamo: string
  /** 지금 보는 칸. 열릴 때 이 칸이 골라져 있다. */
  viewing: VariantNode
  /** 따로 그려 둔 계열. 선이 끊긴다. */
  splitFamilies: readonly string[]
  /** `적용`. 끌어 둔 계열은 가르고(`split`), 켜 둔 계열은 기본 형태로 덮어쓴다(`merge`, 확인 시트에서 `덮어쓰기`를 누른 뒤). 한 번에 저장 하나. */
  onApply: (changes: { split: MedialFamily[]; merge: MedialFamily[] }) => void
  /** 기본 칸의 `기본 ㅈ 고치기`. 상속 글자에서는 그 자리에서 기본 고치기, 가른 글자에서는 단독 칸으로. */
  onEditBase: () => void
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
  const connected = (family: MedialFamily) => !splitFamilies.includes(family)
  // 토글의 임시값(가지가 기본과 이어져 있나). 카드마다 남는다 — 저장값이 바뀌면(적용 · 되돌리기) 전부 저장값으로 돌아간다.
  const [drafts, setDrafts] = useState<Partial<Record<MedialFamily, boolean>>>({})
  const splitKey = splitFamilies.join(',')
  useEffect(() => { setDrafts({}) }, [splitKey])
  const draftOf = (family: MedialFamily) => drafts[family] ?? connected(family)
  // 토글을 끄면 바로 숨기지 않고, 그 가지의 선이 튕기며 끊기는 걸 보여 준 뒤 숨긴다. 움직임 줄이기 설정이면 바로.
  const [snapping, setSnapping] = useState<MedialFamily | null>(null)
  useEffect(() => {
    if (!snapping) return
    const timer = window.setTimeout(() => setSnapping(null), reducedMotion() ? 0 : SNAP_MS)
    return () => window.clearTimeout(timer)
  }, [snapping])
  // 토글을 켜면 선이 기본에서 가지로 뻗어 나온다(끊겨 있던 선이면 늘 — 저장값과 무관).
  const [joining, setJoining] = useState<MedialFamily | null>(null)
  useEffect(() => {
    if (!joining) return
    const timer = window.setTimeout(() => setJoining(null), reducedMotion() ? 0 : JOIN_MS)
    return () => window.clearTimeout(timer)
  }, [joining])
  // 덮어쓰기 확인 시트가 묻는 계열(과 같이 가를 계열). 닫히면 null.
  const [merging, setMerging] = useState<{ merge: MedialFamily[]; split: MedialFamily[] } | null>(null)
  // 칸을 누르면 고르기만. 아래 토글 · 단추가 그 칸을 가리킨다.
  const press = (node: VariantNode) => setPicked(node)
  const labelOf = (node: VariantNode) => node === 'base' ? `기본 ${jamo}` : `${MEDIAL_FAMILY_LABEL[node]} ${jamo}`
  const toggle = (next: boolean) => {
    if (picked === 'base') return
    const shown = draftOf(picked)
    setDrafts((current) => ({ ...current, [picked]: next }))
    if (!next && shown) { setJoining(null); setSnapping(picked) }
    if (next && !shown) { setSnapping(null); setJoining(picked) }
  }
  // 바뀐 것: 끌어 둔 이어진 가지 = 가를 것, 켜 둔 끊긴 가지 = 덮어쓸 것.
  const toSplit = FAMILIES.filter((item) => connected(item) && drafts[item] === false)
  const toMerge = FAMILIES.filter((item) => !connected(item) && drafts[item] === true)
  const changed = toSplit.length > 0 || toMerge.length > 0
  // 아래: 가지면 토글 + 적용(바뀐 게 있을 때만), 기본이면 `기본 ㅈ 고치기`.
  const apply = () => {
    if (!changed) return
    if (toMerge.length) setMerging({ merge: toMerge, split: toSplit })
    else onApply({ split: toSplit, merge: [] })
  }
  return <section className={styles.card} aria-label={`${jamo} 변형 트리`} data-testid="variant-gate" data-family={viewing === 'base' ? undefined : viewing} data-picked={picked}>
    <div className={styles.tree}>
      <svg className={styles.lines} viewBox="0 0 332 240" aria-hidden="true">
        {/* 이어진 선(고른 가지는 토글의 임시값). 물결이면 가지마다 반 파도씩 어긋나게. 끊기는 중인 선은 가만히(끊김 움직임이 `pathLength` 기준이라). 토글로 다시 이은 선은 기본에서 가지로 그려 나온다. */}
        {FAMILIES.map((item, index) => (draftOf(item) || snapping === item) ? <path key={item} id={`${lineId}${item}`} pathLength={1} d={linePath(index, snapping === item || joining === item || wave === null ? null : wave + index / 3)} data-snapping={snapping === item || undefined} data-joining={joining === item || undefined} /> : null)}
        {/* 기본에서 가지로 넘어가는 작은 공(`LINE_MOTION = 'ball'`). 이어진 선에만, 가지마다 조금씩 어긋나게. 끊기는 중인 선에는 없다. */}
        {LINE_MOTION === 'ball' && !reducedMotion() && FAMILIES.map((item, index) => !draftOf(item) || snapping === item ? null : <circle key={item} className={styles.pulse} r="5">
          <animateMotion dur="1.8s" begin={`${index * 0.45}s`} repeatCount="indefinite" calcMode="spline" keyTimes="0;1" keySplines=".45 0 .55 1"><mpath href={`#${lineId}${item}`} /></animateMotion>
        </circle>)}
      </svg>
      <div className={styles.root} data-picked={picked === 'base' || undefined} data-snapping={snapping ? true : undefined} data-testid="variant-gate-root">
        <Pressable type="button" className={styles.pick} onClick={() => press('base')} aria-pressed={picked === 'base'} aria-current={viewing === 'base' || undefined} aria-label={labelOf('base')}>
          <AppGlyph char={jamo} size={96} choseongOverride={breathing} />
          <span className={styles.label}>기본</span>
        </Pressable>
      </div>
      {FAMILIES.map((item, index) => {
        const examples = initialRowExamples(jamo, item)
        return <div key={item} className={styles.branch} style={{ top: BRANCH_Y[index] + 14 - BRANCH_H / 2 }} data-family={item} data-picked={picked === item || undefined} data-split={!connected(item) || undefined} data-connected={draftOf(item) || undefined} data-snapping={snapping === item || undefined} data-joining={joining === item || undefined} data-testid="variant-gate-branch">
          {/* 보기 글자 둘 위 · 이름표 아래, 가운데. 이어진 가지는 기본과 같이 숨쉰다. */}
          <Pressable type="button" className={styles.pick} onClick={() => press(item)} aria-pressed={picked === item} aria-current={viewing === item || undefined} aria-label={labelOf(item)}>
            <span className={styles.glyph}>{(examples.length ? examples : [jamo]).map((char) => <AppGlyph key={char} char={char} size={40} choseongOverride={breathing} />)}</span>
            <span className={styles.label}>{MEDIAL_FAMILY_LABEL[item]}</span>
          </Pressable>
        </div>
      })}
    </div>
    {picked === 'base'
      ? <Button type="button" size="sheet" variant="primary" className={styles.cta} onClick={onEditBase} disabled={viewing === 'base'} data-testid="variant-gate-go">기본 {jamo} 고치기</Button>
      : <>
        {/* 연결 토글. 이름표를 누르면 토글이 바뀐다. */}
        <label className={styles.toggleRow}>
          <span>기본 {jamo}과 연결</span>
          <Switch checked={draftOf(picked)} onCheckedChange={toggle} data-testid="variant-gate-toggle" />
        </label>
        <Button type="button" size="sheet" variant="primary" className={styles.cta} onClick={apply} disabled={!changed} data-action={changed ? (toMerge.length ? 'merge' : 'split') : undefined} data-testid="variant-gate-apply">적용</Button>
      </>}
    {merging && stored && <VariantMergeSheet jamo={jamo} families={merging.merge} stored={stored} onCancel={() => setMerging(null)} onConfirm={() => { const changes = merging; setMerging(null); onApply(changes) }} />}
  </section>
}

/** 시트가 내려가는 시간. CSS `sheetDown`과 같다. */
const SHEET_CLOSE_MS = 260

/**
 * 아래에서 올라오는 떠 있는 시트(대시보드 폰트 메뉴와 같은 꼴). 드로어가 transform을 쓰므로 body에 띄운다.
 * 안의 단추가 `close(이유)`를 부르면 내려간 뒤 `onClose(이유)`. 막 탭 · Esc는 `'cancel'`.
 */
function VariantSheet({ label, testId, onClose, children }: { label: string; testId: string; onClose: (reason: string) => void; children: (close: (reason: string) => void, closing: boolean) => ReactNode }) {
  const [closing, setClosing] = useState<string | null>(null)
  const close = (reason: string) => setClosing((current) => current ?? reason)
  useEffect(() => {
    if (closing === null) return
    const timer = window.setTimeout(() => onClose(closing), reducedMotion() ? 0 : SHEET_CLOSE_MS)
    return () => window.clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 닫기 시작한 순간의 콜백으로 한 번만.
  }, [closing])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close('cancel') }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])
  return createPortal(
    <div className={styles.sheetLayer} data-closing={closing !== null || undefined} onPointerDown={(event) => { if (event.target === event.currentTarget) close('cancel') }} data-testid={testId}>
      <div className={styles.sheet} role="dialog" aria-label={label}>{children(close, closing !== null)}</div>
    </div>,
    document.body,
  )
}

/**
 * 덮어쓰기 확인. 제목 · 한 줄 · 계열마다 지금 → 덮어쓴 뒤 미리보기 한 줄 · 취소 | 덮어쓰기.
 * 덮어쓴 뒤 그림은 그 계열 변형을 지운 사본으로 그린다(저장 전 미리보기).
 */
function VariantMergeSheet({ jamo, families, stored, onCancel, onConfirm }: { jamo: string; families: readonly MedialFamily[]; stored: JamoData; onCancel: () => void; onConfirm: () => void }) {
  const merged = useMemo(() => ({ [jamo]: families.reduce((jamoData, family) => mergeFamilyStrokes(jamoData, family), stored) }), [jamo, stored, families])
  const names = families.map((family) => MEDIAL_FAMILY_LABEL[family]).join(' · ')
  return <VariantSheet label={`${names} ${jamo} 덮어쓰기`} testId="variant-merge-sheet" onClose={(reason) => reason === 'confirm' ? onConfirm() : onCancel()}>
    {(close, closing) => <>
      <h3>기본 {jamo} 모양으로 덮어쓸까요?</h3>
      <p>{names} 레이아웃에 적용된 형태가 기본 닿자 형태로 바뀝니다.</p>
      {families.map((family) => {
        const example = initialRowExamples(jamo, family)[0] ?? jamo
        return <div key={family} className={styles.preview} data-family={family}>
          <figure><AppGlyph char={example} size={88} /><figcaption>지금</figcaption></figure>
          <ArrowRight size={22} aria-hidden="true" />
          <figure data-after><AppGlyph char={example} size={88} choseongOverride={merged} /><figcaption>덮어쓴 뒤</figcaption></figure>
        </div>
      })}
      <div className={styles.sheetActions}>
        <Button type="button" size="sheet" variant="secondary" onClick={() => close('cancel')} data-testid="variant-merge-cancel">취소</Button>
        <Button type="button" size="sheet" variant="default" data-primary onClick={() => close('confirm')} disabled={closing} data-testid="variant-merge-confirm">덮어쓰기</Button>
      </div>
    </>}
  </VariantSheet>
}
