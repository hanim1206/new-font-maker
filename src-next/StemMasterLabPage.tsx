import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { JUNGSEONG_LIST } from '../src/data/Hangul'
import { useJamoStore } from '../src/stores/jamoStore'
import { useStemMasterStore } from '../src/stores/stemMasterStore'
import {
  boundStrokesOf,
  instanceOf,
  isStraight,
  masterOf,
  medialBoxEmOf,
  STEM_MASTER_LABEL,
  STEM_MASTER_NAMES,
  STEM_MASTER_SAMPLE,
  type AxisPoint,
  type BoxEm,
  type JamoChannel,
  type StemMaster,
  type StemMasterName,
} from '../src/services/stemMaster'
import type { AnchorPoint, StrokeDataV2 } from '../src/types'
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
  const box = medialBoxEmOf(sample.char, channel, final)
  const strokes = jamo[channel] ?? []
  const target = strokes.find((stroke) => stroke.id === sample.strokeId)
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
  const shown = draft ? instanceOf(target, draft, box) : target
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
    onDraft(masterWith(dragging.current, toAxis(toBox(event), straight, box)))
  }
  const onPointerUp = (event: ReactPointerEvent<SVGCircleElement>) => {
    if (!dragging.current) return
    const next = masterWith(dragging.current, toAxis(toBox(event), straight, box))
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

/** 형제 카드 하나. 대표 글자 둘(받침 없음 · 있음)과 이 마스터에 귀속된 획의 따름 여부. */
function SiblingCard({ char, name }: { char: string; name: StemMasterName }) {
  const jamo = useJamoStore((state) => state.jungseong[char])
  const masters = useStemMasterStore((state) => state.masters)
  const refollow = useStemMasterStore((state) => state.refollow)
  const bound = boundStrokesOf(jamo, masters).filter((item) => item.name === name)
  if (bound.length === 0) return null
  const blocked = bound.every((item) => item.blocked)
  const follows = !blocked && bound.every((item) => item.follows || item.blocked)
  const curved = bound.some((item) => item.stroke.points.some((point) => point.handleIn || point.handleOut))
  return (
    <article className={styles.sibling} data-char={char} data-follow={blocked ? 'blocked' : follows} data-curved={curved}>
      <h3>{char}</h3>
      <div className={styles.siblingGlyphs}>
        {FINALS.map((final) => <AppGlyph key={final.id} char={sampleSyllable(char, final.id)} size={72} />)}
      </div>
      <ul>
        {bound.map((item) => (
          <li key={item.stroke.id}>
            <code>{item.stroke.id}</code>
            {CHANNEL_LABEL[item.channel] && <small>{CHANNEL_LABEL[item.channel]}</small>}
            <strong data-follow={item.blocked ? 'blocked' : item.follows}>{item.blocked ? '제외 · 상자 두께 0' : item.follows ? '따름' : '풀림'}</strong>
            {!item.follows && !item.blocked && <button type="button" onClick={() => refollow(char, item.channel, item.stroke.id)}>다시 따르기</button>}
          </li>
        ))}
      </ul>
    </article>
  )
}

export function StemMasterLabPage() {
  const [name, setName] = useState<StemMasterName>('gidung')
  const [draft, setDraft] = useState<StemMaster | null>(null)
  const masters = useStemMasterStore((state) => state.masters)
  const setMaster = useStemMasterStore((state) => state.setMaster)
  const resetMaster = useStemMasterStore((state) => state.resetMaster)
  const jungseong = useJamoStore((state) => state.jungseong)
  const master = masterOf(masters, name)
  const siblings = useMemo(
    () => JUNGSEONG_LIST.filter((char) => jungseong[char] && boundStrokesOf(jungseong[char], masters).some((item) => item.name === name)),
    [jungseong, masters, name],
  )
  const own = Boolean(masters[name])
  const refollowAll = useStemMasterStore((state) => state.refollowAll)
  const released = useMemo(
    () => JUNGSEONG_LIST.reduce((sum, char) => sum + (jungseong[char] ? boundStrokesOf(jungseong[char], masters).filter((item) => item.name === name && !item.follows).length : 0), 0),
    [jungseong, masters, name],
  )

  return (
    <main className={styles.page} data-testid="stem-master-lab">
      <header className={styles.hero}>
        <span>Stem Master Lab</span>
        <h1>홀자 줄기 마스터</h1>
        <p>줄기를 한 곳에서 그리면 같은 이름의 형제 획이 전부 따라온다. 핸들 둘을 끌어 휘게 그린다. 상자가 두께 0인 채널(ㅣ · ㅡ, ㅚ ㅟ ㅢ의 세로부)은 휠 방향만 ㅏ 칸 폭 · ㅗ 칸 높이를 빌려 휜다. <strong>여기서 그리면 진짜 자모 획이 바뀐다</strong> — 문장 줄 · 카드 · OTF에도 나온다. 자소 편집에서 획을 만지면 그 획만 풀린다.</p>
        <div className={styles.names} role="radiogroup" aria-label="마스터">
          {STEM_MASTER_NAMES.map((item) => (
            <button key={item} type="button" role="radio" aria-checked={name === item} data-master={item} onClick={() => { setDraft(null); setName(item) }}>
              {STEM_MASTER_LABEL[item]}{masters[item] && !isStraight(masters[item]!) ? ' ●' : ''}
            </button>
          ))}
        </div>
      </header>

      <section className={styles.editor} aria-label="마스터 편집">
        <div className={styles.canvases}>
          {FINALS.map((final) => <MasterCanvas key={`${name}-${final.id}`} name={name} final={final.id} draft={draft} onDraft={setDraft} onCommit={setMaster} />)}
        </div>
        <aside className={styles.side}>
          <h2>{STEM_MASTER_LABEL[name]}</h2>
          <p>{name === 'gidung.inner' && !own ? '따로 그리지 않아 기둥을 따르고 있다. 핸들을 끌면 갈라진다.' : isStraight(master) ? '곧다 — 프리셋 그대로.' : '휘어 있다.'}</p>
          <dl>
            {master.points.map((point, index) => (
              <div key={index}><dt>{index === 0 ? '시작' : '끝'}</dt><dd>{point.handleOut ? `→ t ${point.handleOut.t.toFixed(2)} · o ${point.handleOut.o.toFixed(3)}` : point.handleIn ? `← t ${point.handleIn.t.toFixed(2)} · o ${point.handleIn.o.toFixed(3)}` : '핸들 없음'}</dd></div>
            ))}
          </dl>
          <button type="button" className={styles.reset} disabled={!own} onClick={() => resetMaster(name)}>{name === 'gidung.inner' ? '기둥을 따르게' : '곧게'}</button>
        </aside>
      </section>

      <section className={styles.siblings} aria-label="형제">
        <h2>형제 <small>{siblings.length}</small></h2>
        {released > 0 && <button type="button" data-testid="refollow-all" onClick={() => refollowAll(name)}>풀린 획 {released}개 모두 다시 따르기</button>}
        <div className={styles.siblingGrid} data-testid="siblings">
          {siblings.map((char) => <SiblingCard key={char} char={char} name={name} />)}
        </div>
      </section>
    </main>
  )
}
