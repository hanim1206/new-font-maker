import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { JUNGSEONG_LIST } from '../src/data/Hangul'
import { useJamoStore } from '../src/stores/jamoStore'
import { useStemMasterStore } from '../src/stores/stemMasterStore'
import {
  axisReversed,
  boundStrokesOf,
  instanceOf,
  isStraight,
  isUnder,
  masterOf,
  medialBoxEmOf,
  mirroredMaster,
  reverseStroke,
  stemReferenceBox,
  straightMaster,
  STEM_MASTER_LABEL,
  STEM_MASTER_NAMES,
  STEM_MASTER_SAMPLE,
  type AxisPoint,
  type BoxEm,
  type JamoChannel,
  type StemMaster,
  type StemMasterName,
} from '../src/services/stemMaster'
import type { AnchorPoint, ResolvedStrokeInkSource, StrokeDataV2 } from '../src/types'
import { AppGlyph } from './AppGlyph'
import styles from './StemMasterLabPage.module.css'

/**
 * 홀자 줄기 마스터 랩. 마스터 하나를 대표 홀자의 평균 칸(받침 없음 · 있음)에서 휘게 그리고, 같은 이름의 형제 획이 따라오는지 본다.
 * 여기서 그리면 진짜 자모 획이 바뀐다 — 문장 줄 · 카드 · OTF에도 나온다. 플랜: docs/plans/2026-09-29_홀자-줄기-마스터.md
 */

/** 1em을 이 픽셀로. 받침 없음 칸(높이 0.9em)이 약 290px. */
const EM_PX = 320
/** 줄기 하나짜리(ㅣ)는 상자가 두께만큼이라 캔버스 폭을 최소 이만큼 둔다. */
const MIN_CANVAS_EM = 0.42
const PAD = 40
const FINALS = [{ id: 'open', label: '받침 없음' }, { id: 'closed', label: '받침 있음' }] as const

const CHANNEL_LABEL: Record<JamoChannel, string> = { strokes: '', horizontalStrokes: '가로부', verticalStrokes: '세로부' }

/** 대표 글자: ㅇ + 홀자 (+ 받침 ㅇ). */
function sampleSyllable(jung: string, final: 'open' | 'closed'): string {
  const index = JUNGSEONG_LIST.indexOf(jung as (typeof JUNGSEONG_LIST)[number])
  return String.fromCharCode(0xac00 + (11 * 21 + index) * 28 + (final === 'closed' ? 21 : 0))
}

function channelOfStroke(strokeId: string, jamo: { strokes?: StrokeDataV2[]; horizontalStrokes?: StrokeDataV2[]; verticalStrokes?: StrokeDataV2[] }): JamoChannel {
  if (jamo.horizontalStrokes?.some((stroke) => stroke.id === strokeId)) return 'horizontalStrokes'
  if (jamo.verticalStrokes?.some((stroke) => stroke.id === strokeId)) return 'verticalStrokes'
  return 'strokes'
}

/** 상자 좌표의 점을 마스터 축 좌표(t · o)로. `instanceOf`의 역. */
function toAxis(point: { x: number; y: number }, stroke: StrokeDataV2, box: BoxEm): { t: number; o: number } {
  const start = stroke.points[0]
  const end = stroke.points[stroke.points.length - 1]
  const uxEm = (end.x - start.x) * box.width
  const uyEm = (end.y - start.y) * box.height
  const length = Math.hypot(uxEm, uyEm) || 1
  const dxEm = (point.x - start.x) * box.width
  const dyEm = (point.y - start.y) * box.height
  const t = (dxEm * uxEm + dyEm * uyEm) / (length * length)
  const o = (dxEm * uyEm - dyEm * uxEm) / length
  return { t: Math.min(0.98, Math.max(0.02, t)), o }
}

function pathOf(points: AnchorPoint[], at: (p: { x: number; y: number }) => string): string {
  const parts = [`M ${at(points[0])}`]
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1]
    const to = points[index]
    parts.push(from.handleOut || to.handleIn ? `C ${at(from.handleOut ?? from)} ${at(to.handleIn ?? to)} ${at(to)}` : `L ${at(to)}`)
  }
  return parts.join(' ')
}

type Handle = { point: 0 | 1; key: 'handleOut' | 'handleIn' }
const HANDLES: readonly Handle[] = [{ point: 0, key: 'handleOut' }, { point: 1, key: 'handleIn' }]

/**
 * 마스터 편집 캔버스 하나. 대표 홀자를 그 평균 칸 비율로 그리고, 마스터 획의 핸들 둘(시작 쪽 · 끝 쪽)을 끌게 한다.
 * 끄는 동안은 초안만 그리고, 놓으면 스토어에 쓴다(형제 전부에 전파).
 */
function MasterCanvas({ name, final, draft, onDraft, onCommit }: {
  name: StemMasterName
  final: 'open' | 'closed'
  draft: StemMaster | null
  onDraft: (master: StemMaster | null) => void
  onCommit: (master: StemMaster) => void
}) {
  const sample = STEM_MASTER_SAMPLE[name]
  const jamo = useJamoStore((state) => state.jungseong[sample.char])
  const masters = useStemMasterStore((state) => state.masters)
  const channel = channelOfStroke(sample.strokeId, jamo)
  const strokes = jamo[channel] ?? []
  const stored = strokes.find((stroke) => stroke.id === sample.strokeId)
  // 짧은기둥은 보에 닿는 끝 → 빈 끝이 축이다. 캔버스도 그 방향으로 놓아 마스터의 시작 핸들이 닿는 끝 쪽에 온다.
  const reversed = Boolean(stored && axisReversed(jamo, strokes, stored))
  const target = stored && reversed ? reverseStroke(stored) : stored
  // 뒤집힌 축은 거울 마스터로 놓인다(`orientedInstance`). 캔버스도 같게 보여 주고, 끈 자리는 거울을 풀어 적는다.
  const view = (shape: StemMaster) => reversed ? mirroredMaster(shape) : shape
  const unview = (axis: { t: number; o: number }) => reversed ? { t: axis.t, o: -axis.o } : axis
  const box = stored ? stemReferenceBox(sample.char, channel, stored, final) : medialBoxEmOf(sample.char, channel, final)
  const master = draft ?? masterOf(masters, name)
  const svgRef = useRef<SVGSVGElement>(null)
  const dragging = useRef<Handle | null>(null)

  const boxPx = { width: box.width * EM_PX, height: box.height * EM_PX }
  const canvasWidth = Math.max(boxPx.width, MIN_CANVAS_EM * EM_PX)
  const offsetX = (canvasWidth - boxPx.width) / 2
  const width = canvasWidth + PAD * 2
  const height = boxPx.height + PAD * 2
  const at = (point: { x: number; y: number }) => `${(PAD + offsetX + point.x * boxPx.width).toFixed(1)} ${(PAD + point.y * boxPx.height).toFixed(1)}`
  const px = (point: { x: number; y: number }) => ({ x: PAD + offsetX + point.x * boxPx.width, y: PAD + point.y * boxPx.height })
  const strokeWidth = 0.07 * EM_PX

  if (!target) return null
  const shown = draft ? instanceOf(target, view(draft), box) : target
  const straight = { ...target, points: [target.points[0], target.points[target.points.length - 1]] }

  const toBox = (event: ReactPointerEvent<SVGElement>) => {
    const svg = svgRef.current!
    const matrix = svg.getScreenCTM()!.inverse()
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix)
    return { x: (point.x - PAD - offsetX) / boxPx.width, y: (point.y - PAD) / boxPx.height }
  }
  const masterWith = (handle: Handle, axis: { t: number; o: number }): StemMaster => {
    const base = master.points.length === 2 ? master.points : [master.points[0], master.points[master.points.length - 1]]
    const points: AxisPoint[] = [{ ...base[0], t: 0, o: 0 }, { ...base[1], t: 1, o: 0 }]
    points[handle.point] = { ...points[handle.point], [handle.key]: axis }
    return { name, points }
  }
  const onPointerDown = (handle: Handle) => (event: ReactPointerEvent<SVGCircleElement>) => {
    dragging.current = handle
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const onPointerMove = (event: ReactPointerEvent<SVGCircleElement>) => {
    if (!dragging.current) return
    onDraft(masterWith(dragging.current, unview(toAxis(toBox(event), straight, box))))
  }
  const onPointerUp = (event: ReactPointerEvent<SVGCircleElement>) => {
    if (!dragging.current) return
    const next = masterWith(dragging.current, unview(toAxis(toBox(event), straight, box)))
    dragging.current = null
    onDraft(null)
    onCommit(next)
  }

  // 핸들 자리: 마스터에 핸들이 없으면 축 위 1/3 · 2/3.
  const handleAt = (handle: Handle) => {
    const point = shown.points[handle.point === 0 ? 0 : shown.points.length - 1]
    const own = point[handle.key]
    if (own) return px(own)
    const axis = instanceOf(straight, { name, points: [{ t: 0, o: 0, handleOut: { t: 1 / 3, o: 0 } }, { t: 1, o: 0, handleIn: { t: 2 / 3, o: 0 } }] }, box)
    return px(axis.points[handle.point][handle.key]!)
  }

  return (
    <figure className={styles.canvas} data-testid={`master-canvas-${final}`} data-final={final}>
      <svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label={`${STEM_MASTER_LABEL[name]} 마스터 · ${FINALS.find((item) => item.id === final)!.label}`}>
        <rect x={PAD + offsetX} y={PAD} width={boxPx.width} height={boxPx.height} className={styles.box} />
        {strokes.filter((stroke) => stroke.id !== target.id).map((stroke) => (
          <path key={stroke.id} d={pathOf(stroke.points, at)} className={styles.other} strokeWidth={strokeWidth} />
        ))}
        <path d={pathOf(straight.points, at)} className={styles.guide} />
        <path d={pathOf(shown.points, at)} className={styles.target} strokeWidth={strokeWidth} data-testid="master-stroke" data-curved={shown.points.some((point) => point.handleIn || point.handleOut)} />
        {HANDLES.map((handle) => {
          const anchor = px(shown.points[handle.point === 0 ? 0 : shown.points.length - 1])
          const grip = handleAt(handle)
          return (
            <g key={handle.key}>
              <line x1={anchor.x} y1={anchor.y} x2={grip.x} y2={grip.y} className={styles.handleLine} />
              <circle cx={grip.x} cy={grip.y} r={11} className={styles.handle} data-testid={`master-handle-${handle.key}`} onPointerDown={onPointerDown(handle)} onPointerMove={onPointerMove} onPointerUp={onPointerUp} />
            </g>
          )
        })}
      </svg>
      <figcaption>{FINALS.find((item) => item.id === final)!.label} · {box.width.toFixed(2)} × {box.height.toFixed(2)} em</figcaption>
    </figure>
  )
}

/** 캔버스의 `.target`과 같은 색. */
const ACTIVE_STROKE_COLOR = '#d9480f'

/** 위 탭은 줄기 이름. 갈래(역할)는 아래 형제 묶음에서 고른다. */
const BASES: readonly StemMasterName[] = ['gidung', 'gyeotjulgi', 'jjalbeungidung', 'bo', 'geolchim']

/** 갈래 묶음 머리 이름. 줄기 이름 그대로인 갈래(기둥의 바깥 기둥)는 따로 부른다. */
const ROLE_LABEL: Partial<Record<StemMasterName, string>> = { gidung: '기둥.바깥' }
const roleLabel = (role: StemMasterName) => ROLE_LABEL[role] ?? STEM_MASTER_LABEL[role]

/** 형제 카드 하나. 대표 글자 둘(받침 없음 · 있음)과 이 갈래에 귀속된 획의 따름 여부. 글자를 누르면 이 갈래를 고르거나 뺀다. */
function SiblingCard({ char, role, picked, onToggle }: { char: string; role: StemMasterName; picked: boolean; onToggle: () => void }) {
  const jamo = useJamoStore((state) => state.jungseong[char])
  const masters = useStemMasterStore((state) => state.masters)
  const refollow = useStemMasterStore((state) => state.refollow)
  const bound = boundStrokesOf(jamo, masters).filter((item) => item.name === role)
  if (bound.length === 0) return null
  const follows = bound.every((item) => item.follows)
  const curved = bound.some((item) => item.stroke.points.some((point) => point.handleIn || point.handleOut))
  // 고른 갈래의 줄기만 캔버스와 같은 색으로.
  const activeIds = new Set(bound.map((item) => item.stroke.id))
  const activeColor = (source: ResolvedStrokeInkSource) => picked && source.jamoId === char && activeIds.has(source.strokeId) ? ACTIVE_STROKE_COLOR : undefined
  return (
    <article className={styles.sibling} data-char={char} data-follow={follows} data-curved={curved} data-picked={picked}>
      <button type="button" className={styles.siblingPick} aria-pressed={picked} aria-label={`${char} ${roleLabel(role)} ${picked ? '빼기' : '고르기'}`} onClick={onToggle}>
        <h3>{char}</h3>
        <span className={styles.siblingGlyphs}>
          {FINALS.map((final) => <AppGlyph key={final.id} char={sampleSyllable(char, final.id)} size={72} strokeColorOf={activeColor} />)}
        </span>
      </button>
      <ul>
        {bound.map((item) => (
          <li key={item.stroke.id}>
            <code>{item.stroke.id}</code>
            {CHANNEL_LABEL[item.channel] && <small>{CHANNEL_LABEL[item.channel]}</small>}
            <strong data-follow={item.follows}>{item.follows ? '따름' : '풀림'}</strong>
            {!item.follows && <button type="button" onClick={() => refollow(char, item.channel, item.stroke.id)}>다시 따르기</button>}
          </li>
        ))}
      </ul>
    </article>
  )
}

/**
 * 고른 갈래에만 마스터를 쓴다. 쓰는 갈래 아래에 안 고른 갈래가 부모를 따르고 있으면(예: 바깥 기둥만 고르면 안쪽 기둥) 먼저 지금 모양으로 굳혀 같이 안 움직이게 한다.
 */
function writeRoles(roles: readonly StemMasterName[], picked: readonly StemMasterName[], shape: StemMaster) {
  const store = useStemMasterStore.getState()
  for (const role of picked) {
    for (const child of roles) {
      if (child !== role && !picked.includes(child) && isUnder(child, role) && !useStemMasterStore.getState().masters[child]) {
        store.setMaster({ ...masterOf(useStemMasterStore.getState().masters, child), name: child })
      }
    }
    store.setMaster({ ...shape, name: role })
  }
}

export function StemMasterLabPage() {
  const [base, setBase] = useState<StemMasterName>('gidung')
  const [unpicked, setUnpicked] = useState<ReadonlySet<StemMasterName>>(new Set())
  const [draft, setDraft] = useState<StemMaster | null>(null)
  const masters = useStemMasterStore((state) => state.masters)
  const jungseong = useJamoStore((state) => state.jungseong)
  const refollowAll = useStemMasterStore((state) => state.refollowAll)
  const resetAll = useStemMasterStore((state) => state.resetAll)
  /** 이 줄기의 갈래와 갈래마다 형제 홀자. 획이 실제로 있는 갈래만. */
  const groups = useMemo(() => {
    const byRole = new Map<StemMasterName, string[]>()
    for (const char of JUNGSEONG_LIST) {
      if (!jungseong[char]) continue
      for (const item of boundStrokesOf(jungseong[char], masters)) {
        if (!isUnder(item.name, base)) continue
        const chars = byRole.get(item.name) ?? []
        if (!chars.includes(char)) chars.push(char)
        byRole.set(item.name, chars)
      }
    }
    return STEM_MASTER_NAMES.filter((role) => byRole.has(role)).map((role) => ({ role, chars: byRole.get(role)! }))
  }, [jungseong, masters, base])
  const roles = groups.map((group) => group.role)
  const picked = roles.filter((role) => !unpicked.has(role))
  const primary = picked[0] ?? roles[0] ?? base
  const master = masterOf(masters, primary)
  const released = useMemo(
    () => JUNGSEONG_LIST.reduce((sum, char) => sum + (jungseong[char] ? boundStrokesOf(jungseong[char], masters).filter((item) => picked.includes(item.name) && !item.follows).length : 0), 0),
    [jungseong, masters, picked],
  )
  // 체크 = 지금 그린 모양을 그 갈래에 적용, 해제 = 그 갈래는 기본 획(곧게)으로 돌아간다. 하나는 늘 고른 채로 둔다.
  const toggle = (role: StemMasterName) => {
    const turningOff = !unpicked.has(role)
    if (turningOff && picked.length === 1) return
    setDraft(null)
    const shape = masterOf(useStemMasterStore.getState().masters, primary)
    writeRoles(roles, [role], turningOff ? straightMaster(role) : shape)
    setUnpicked((current) => {
      const next = new Set(current)
      if (turningOff) next.add(role)
      else next.delete(role)
      return next
    })
  }
  const allStraight = picked.every((role) => isStraight(masterOf(masters, role)))

  return (
    <main className={styles.page} data-testid="stem-master-lab">
      <header className={styles.hero}>
        <span>Stem Master Lab</span>
        <h1>홀자 줄기 마스터</h1>
        <p>줄기를 한 곳에서 그리면 같은 이름의 형제 획이 따라온다. 핸들 둘을 끌어 휘게 그린다. 같은 줄기라도 역할이 다른 갈래(솟는 짧은기둥 · 내리는 짧은기둥, 섞임홀자의 보 등)는 아래 형제 묶음에서 골라 그 갈래에만 반영한다. <strong>여기서 그리면 진짜 자모 획이 바뀐다</strong> — 문장 줄 · 카드 · OTF에도 나온다. 자소 편집에서 획을 만지면 그 획만 풀린다.</p>
        <div className={styles.names} role="radiogroup" aria-label="줄기">
          {BASES.map((item) => (
            <button key={item} type="button" role="radio" aria-checked={base === item} data-master={item} onClick={() => { setDraft(null); setUnpicked(new Set()); setBase(item) }}>
              {STEM_MASTER_LABEL[item]}{STEM_MASTER_NAMES.some((name) => isUnder(name, item) && masters[name] && !isStraight(masters[name]!)) ? ' ●' : ''}
            </button>
          ))}
        </div>
        <button type="button" className={styles.reset} data-testid="reset-all" onClick={() => { setDraft(null); resetAll() }}>전체 리셋 — 마스터를 지우고 줄기를 전부 곧게</button>
      </header>

      <div className={styles.workspace}>
      <section className={styles.editor} aria-label="마스터 편집">
        <div className={styles.canvases}>
          {FINALS.map((final) => <MasterCanvas key={`${primary}-${final.id}`} name={primary} final={final.id} draft={draft} onDraft={setDraft} onCommit={(shape) => writeRoles(roles, picked, shape)} />)}
        </div>
        <aside className={styles.side}>
          <h2>{picked.length === roles.length ? `${STEM_MASTER_LABEL[base]} 전부` : picked.map(roleLabel).join(' · ')}</h2>
          <p>{picked.length === roles.length ? '갈래를 다 골랐다 — 그리면 전부 같이 바뀐다.' : `고른 갈래 ${picked.length}개에만 반영한다. 캔버스는 ${roleLabel(primary)}.`}</p>
          <dl>
            {master.points.map((point, index) => (
              <div key={index}><dt>{index === 0 ? '시작' : '끝'}</dt><dd>{point.handleOut ? `→ t ${point.handleOut.t.toFixed(2)} · o ${point.handleOut.o.toFixed(3)}` : point.handleIn ? `← t ${point.handleIn.t.toFixed(2)} · o ${point.handleIn.o.toFixed(3)}` : '핸들 없음'}</dd></div>
            ))}
          </dl>
          <button type="button" className={styles.reset} disabled={allStraight} onClick={() => writeRoles(roles, picked, straightMaster(primary))}>고른 갈래 곧게</button>
        </aside>
      </section>

      <section className={styles.siblings} aria-label="형제">
        <h2>형제 <small>{groups.reduce((sum, group) => sum + group.chars.length, 0)}</small></h2>
        {released > 0 && <button type="button" data-testid="refollow-all" onClick={() => picked.forEach((role) => refollowAll(role))}>풀린 획 {released}개 모두 다시 따르기</button>}
        <div className={styles.roleGroups} data-testid="siblings">
          {groups.map(({ role, chars }) => {
            const on = picked.includes(role)
            return (
              <div key={role} className={styles.roleGroup} data-role={role} data-picked={on}>
                <button type="button" className={styles.roleHead} role="checkbox" aria-checked={on} onClick={() => toggle(role)}>
                  <span className={styles.check} aria-hidden="true">✓</span>
                  {roleLabel(role)} <small>{chars.length}</small>
                  {masters[role] && !isStraight(masters[role]!) && <em>휨</em>}
                </button>
                <div className={styles.siblingGrid}>
                  {chars.map((char) => <SiblingCard key={char} char={char} role={role} picked={on} onToggle={() => toggle(role)} />)}
                </div>
              </div>
            )
          })}
        </div>
      </section>
      </div>
    </main>
  )
}
