import { useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { ChevronLeft, ChevronRight, Link2, RotateCcw, Unlink } from 'lucide-react'
import { getBaseJamo } from '../src/stores/jamoStore'
import { FAMILY_STORE_KEY, loadFamilyEdits } from './familyEditsStore'
import type { StrokeDataV2 } from '../src/types'
import {
  cutFamilyStroke, FAMILY_STAGES, familyStrokes, findFamilyLinks, linkOf, moveFamilyPoint,
  presetConsonantStrokes, relinkFamilyStroke,
} from '../src/services/jamoFamily'
import type { FamilyEdits, FamilyLinks, XY } from '../src/services/jamoFamily'
import { Button } from './components/ui/button'
import { Pressable } from './components/ui/pressable'
import { EDIT_COLOR } from './editColors'
import styles from './FamilyLabPage.module.css'

/** 캔버스 칸 수. 점은 이 칸에 붙는다. */
const GRID = 20
const CANVAS = 440
/** 자모 상자를 캔버스 안에 놓는 여백(캔버스 비율). */
const PAD = 0.16

/** 상자 좌표(0~1) → 캔버스 좌표. */
const toCanvas = (p: XY, size: number): XY => ({ x: (PAD + p.x * (1 - 2 * PAD)) * size, y: (PAD + p.y * (1 - 2 * PAD)) * size })
const fromCanvas = (p: XY, size: number): XY => ({ x: (p.x / size - PAD) / (1 - 2 * PAD), y: (p.y / size - PAD) / (1 - 2 * PAD) })
/** 상자 좌표를 캔버스 칸에 붙인다. */
const snap = (p: XY): XY => {
  const c = toCanvas(p, GRID)
  return fromCanvas({ x: Math.round(c.x), y: Math.round(c.y) }, GRID)
}

function strokeD(s: StrokeDataV2, size: number): string {
  const pts = s.points
  if (!pts.length) return ''
  const P = (p: XY) => { const c = toCanvas(p, size); return `${c.x.toFixed(2)} ${c.y.toFixed(2)}` }
  let d = `M${P(pts[0])}`
  const seg = (a: typeof pts[number], b: typeof pts[number]) => {
    d += a.handleOut || b.handleIn ? ` C${P(a.handleOut ?? a)} ${P(b.handleIn ?? b)} ${P(b)}` : ` L${P(b)}`
  }
  for (let i = 1; i < pts.length; i++) seg(pts[i - 1], pts[i])
  if (s.closed) { seg(pts[pts.length - 1], pts[0]); d += ' Z' }
  return d
}

type StrokeTie = 'own' | 'linked' | 'mixed'
const tieOf = (links: FamilyLinks, edits: FamilyEdits, ch: string, s: StrokeDataV2): StrokeTie => {
  const n = s.points.filter((_, i) => linkOf(links, edits, ch, s.id, i)).length
  return n === 0 ? 'own' : n === s.points.length ? 'linked' : 'mixed'
}

/** 작은 자모 그림(가족 띠 · 전체 지도). */
function JamoThumb({ strokes, size, faint }: { strokes: StrokeDataV2[]; size: number; faint?: boolean }) {
  return <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden>
    {strokes.map((s) => <path key={s.id} d={strokeD(s, size)} fill="none" stroke={faint ? EDIT_COLOR.text5 : EDIT_COLOR.foreground} strokeWidth={s.thickness * size * (1 - 2 * PAD)} strokeLinejoin="miter" strokeLinecap="butt" />)}
  </svg>
}

export function FamilyLabPage() {
  return <div className={styles.page}>
    <header className={styles.header}>
      <span>Family Lab</span>
      <h1>닿자 가족 캔버스</h1>
      <p>가족마다 맨 앞 자모를 먼저 만든다. 옆으로 넘기면 다음 자모가 앞 꼴을 이어받은 채로 열린다. 파란 점은 앞 자모를 가리켜서 여기선 못 움직이고, 앞을 고치면 같이 바뀐다. 따로 가려면 획을 고르고 끊는다. 점은 칸에 붙는다. 저장은 이 브라우저에만.</p>
    </header>
    <FamilyCanvas />
  </div>
}

/** 다섯 단계 띠 + 편집 캔버스 + 가족 띠 · 전체 지도. 실험실 페이지와 글자 해부 팝업이 같이 쓴다. */
export function FamilyCanvas({ start, compact }: { start?: string; compact?: boolean }) {
  const presets = useMemo(() => presetConsonantStrokes((ch) => getBaseJamo('choseong', ch)), [])
  const links = useMemo(() => findFamilyLinks(presets), [presets])
  const [edits, setEdits] = useState<FamilyEdits>(loadFamilyEdits)
  const startAt = start ? FAMILY_STAGES.findIndex((s) => s.members.includes(start)) : -1
  const [stageIdx, setStageIdx] = useState(Math.max(0, startAt))
  const [memberIdx, setMemberIdx] = useState(startAt >= 0 ? FAMILY_STAGES[startAt].members.indexOf(start!) : 0)
  const [picked, setPicked] = useState<string | null>(null)
  const [drag, setDrag] = useState<{ stroke: string; index: number } | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => { localStorage.setItem(FAMILY_STORE_KEY, JSON.stringify(edits)) }, [edits])

  const stage = FAMILY_STAGES[stageIdx]
  const ch = stage.members[memberIdx]
  const strokes = familyStrokes(presets, links, edits, ch)
  const touched = (c: string) => Object.values(edits.moves[c] ?? {}).some((pts) => Object.values(pts).some((d) => d.x || d.y))
  const inherits = (c: string) => Object.values(links[c] ?? {}).some((row) => row.some(Boolean))
  const parentsOf = (c: string) => [...new Set(Object.values(links[c] ?? {}).flatMap((row) => row.filter(Boolean).map((l) => l!.parent)))]
  const affected = (c: string, depth = 0): boolean => touched(c) || (depth < 6 && parentsOf(c).some((p) => affected(p, depth + 1)))
  const pickedStroke = picked ? strokes.find((s) => s.id === picked) : undefined
  const pickedTie = pickedStroke ? tieOf(links, edits, ch, pickedStroke) : null
  const pickedCut = !!picked && !!edits.cut[ch]?.includes(picked)

  const go = (stage: number, member: number) => { setStageIdx(stage); setMemberIdx(member); setPicked(null) }
  const step = (dir: 1 | -1) => {
    const m = memberIdx + dir
    if (m >= 0 && m < stage.members.length) return go(stageIdx, m)
    const s = stageIdx + dir
    if (s < 0 || s >= FAMILY_STAGES.length) return
    go(s, dir === 1 ? 0 : FAMILY_STAGES[s].members.length - 1)
  }

  const pointer = (e: ReactPointerEvent): XY | null => {
    const svg = svgRef.current
    if (!svg) return null
    const r = svg.getBoundingClientRect()
    return fromCanvas({ x: (e.clientX - r.left) / r.width * CANVAS, y: (e.clientY - r.top) / r.height * CANVAS }, CANVAS)
  }
  const onMove = (e: ReactPointerEvent) => {
    if (!drag) return
    const at = pointer(e)
    const s = strokes.find((t) => t.id === drag.stroke)
    if (!at || !s) return
    const target = snap(at), now = s.points[drag.index]
    const by = { x: target.x - now.x, y: target.y - now.y }
    if (Math.abs(by.x) < 1e-6 && Math.abs(by.y) < 1e-6) return
    setEdits((ed) => moveFamilyPoint(links, ed, ch, drag.stroke, drag.index, by))
  }

  const resetJamo = () => setEdits((ed) => {
    const moves = { ...ed.moves }; delete moves[ch]
    const cut = { ...ed.cut }; delete cut[ch]
    return { moves, cut }
  })

  const unit = CANVAS / GRID
  return <div className={styles.body} data-compact={compact || undefined}>
    <nav className={styles.stages} aria-label="단계">
      {FAMILY_STAGES.map((s, i) => <Pressable key={s.id} type="button" className={styles.stage} data-on={i === stageIdx || undefined} onClick={() => go(i, 0)} data-testid={`family-stage-${s.id}`}>
        <small>{i + 1}단계{s.members.some(touched) ? ' · 손댐' : ''}</small>
        <b>{s.members.join(' ')}</b>
      </Pressable>)}
    </nav>

    <div className={styles.work}>
      <section className={styles.canvasCard}>
        <div className={styles.canvasHead}>
          <b data-testid="family-current">{ch}</b>
          <span>{!inherits(ch) ? (memberIdx === 0 ? '가족의 첫 자모 · 여기서 시작' : '따로 시작 · 앞 자모를 잇지 않음') : `${parentsOf(ch).join(' · ')}에서 이어받아 열림`}</span>
        </div>
        <svg ref={svgRef} viewBox={`0 0 ${CANVAS} ${CANVAS}`} className={styles.canvas} data-testid="family-canvas"
          onPointerMove={onMove} onPointerUp={() => setDrag(null)} onPointerLeave={() => setDrag(null)}
          onPointerDown={(e) => { if (e.target === e.currentTarget) setPicked(null) }}>
          {Array.from({ length: GRID + 1 }, (_, i) => <g key={i} pointerEvents="none">
            <line x1={i * unit} y1={0} x2={i * unit} y2={CANVAS} stroke={EDIT_COLOR.border} strokeWidth={i % 5 === 0 ? 1 : 0.5} />
            <line x1={0} y1={i * unit} x2={CANVAS} y2={i * unit} stroke={EDIT_COLOR.border} strokeWidth={i % 5 === 0 ? 1 : 0.5} />
          </g>)}
          {strokes.map((s) => {
            const tie = tieOf(links, edits, ch, s)
            return <path key={s.id} d={strokeD(s, CANVAS)} fill="none" strokeLinejoin="miter" strokeLinecap="butt"
              stroke={tie === 'linked' ? EDIT_COLOR.editSelect : EDIT_COLOR.foreground} strokeOpacity={picked && picked !== s.id ? 0.55 : 1}
              strokeWidth={s.thickness * CANVAS * (1 - 2 * PAD)} onPointerDown={() => setPicked(s.id)} data-testid={`family-stroke-${s.id}`} />
          })}
          {picked && <path d={strokeD(strokes.find((s) => s.id === picked)!, CANVAS)} fill="none" stroke={EDIT_COLOR.editSlotCh} strokeWidth={2} pointerEvents="none" />}
          {strokes.flatMap((s) => s.points.map((p, i) => {
            const c = toCanvas(p, CANVAS)
            const linked = !!linkOf(links, edits, ch, s.id, i)
            return <circle key={`${s.id}-${i}`} cx={c.x} cy={c.y} r={linked ? 5 : 7}
              fill={linked ? EDIT_COLOR.editSelect : EDIT_COLOR.surface} stroke={linked ? EDIT_COLOR.surface : EDIT_COLOR.editSlotCh} strokeWidth={2.5}
              style={{ cursor: linked ? 'not-allowed' : 'grab' }} data-testid={`family-point-${s.id}-${i}`}
              onPointerDown={(e) => {
                e.stopPropagation(); setPicked(s.id)
                if (linked) return
                ;(e.currentTarget.ownerSVGElement as SVGSVGElement).setPointerCapture(e.pointerId)
                setDrag({ stroke: s.id, index: i })
              }} />
          }))}
        </svg>
        <div className={styles.legend}><span><i data-k="linked" />앞 자모에서 이어 옴</span><span><i data-k="own" />이 자모 것 · 끌어서 고침</span></div>
        <div className={styles.actions}>
          <Button size="sm" onClick={() => step(-1)} disabled={stageIdx === 0 && memberIdx === 0} data-testid="family-prev"><ChevronLeft />앞</Button>
          {pickedStroke && pickedTie !== 'own' && <Button size="sm" onClick={() => setEdits((ed) => cutFamilyStroke(presets, links, ed, ch, pickedStroke.id))} data-testid="family-cut"><Unlink />이 획만 따로(끊기)</Button>}
          {pickedCut && <Button size="sm" onClick={() => setEdits((ed) => relinkFamilyStroke(ed, ch, picked!))} data-testid="family-relink"><Link2 />다시 잇기</Button>}
          <Button size="sm" onClick={resetJamo} disabled={!touched(ch) && !edits.cut[ch]?.length}><RotateCcw />이 자모 처음으로</Button>
          <Button size="sm" variant="primary" onClick={() => step(1)} disabled={stageIdx === FAMILY_STAGES.length - 1 && memberIdx === stage.members.length - 1} data-testid="family-next">다음<ChevronRight /></Button>
        </div>
      </section>

      <aside className={styles.side}>
        <h2>{stage.name}</h2>
        <p>앞에서 고친 것이 뒤로 퍼지는지 여기서 본다.</p>
        <div className={styles.strip}>
          {stage.members.map((m, i) => <Pressable key={m} type="button" className={styles.member} data-on={i === memberIdx || undefined} onClick={() => go(stageIdx, i)} data-testid={`family-member-${m}`}>
            <JamoThumb strokes={familyStrokes(presets, links, edits, m)} size={76} />
            <small>{m} · {touched(m) ? '손댐' : inherits(m) ? '이어받음' : '프리셋'}</small>
          </Pressable>)}
        </div>
        <h2>다섯 단계 전체</h2>
        <div className={styles.map}>
          {FAMILY_STAGES.map((s, si) => <div key={s.id} className={styles.mapRow}>
            {s.members.map((m, mi) => <Pressable key={m} type="button" className={styles.mapCell} data-on={si === stageIdx && mi === memberIdx || undefined} onClick={() => go(si, mi)} aria-label={m}>
              <JamoThumb strokes={familyStrokes(presets, links, edits, m)} size={40} faint={!affected(m)} />
            </Pressable>)}
          </div>)}
        </div>
        <p className={styles.note}>ㅊ의 꼭지는 4단계 ㅎ의 꼭지를 이어받는다. 옅은 회색은 아직 아무도 손대지 않은 자모.</p>
      </aside>
    </div>
  </div>
}
