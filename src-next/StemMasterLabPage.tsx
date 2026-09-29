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
  STEM_BASES,
  STEM_FACETS,
  facetValuesOf,
  stemMasterLabel,
  type AxisPoint,
  type BoxEm,
  type JamoChannel,
  type StemBase,
  type StemMaster,
  type StemMasterName,
} from '../src/services/stemMaster'
import { STEM_NAME_LABEL } from '../src/services/strokeGrammar'
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
function MasterCanvas({ name, sample, final, draft, onDraft, onCommit }: {
  name: StemMasterName
  sample: { char: string; strokeId: string }
  final: 'open' | 'closed'
  draft: StemMaster | null
  onDraft: (master: StemMaster | null) => void
  onCommit: (master: StemMaster) => void
}) {
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
      <svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label={`${stemMasterLabel(name)} 마스터 · ${FINALS.find((item) => item.id === final)!.label}`}>
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

/** 이 줄기에 귀속된 획 하나(홀자 · 채널 · 획)와 그 갈래(잎 이름 · 질문 답). */
interface StemEntry { char: string; channel: JamoChannel; strokeId: string; name: StemMasterName; values: Record<string, string>; follows: boolean; curved: boolean }

type Picks = Record<string, ReadonlySet<string>>

/** 질문 앞쪽까지의 답으로 거른 획들. `upTo`는 몇 번째 질문 전까지 볼지. */
function filterEntries(entries: readonly StemEntry[], facets: readonly { key: string }[], picks: Picks, upTo = facets.length): StemEntry[] {
  return entries.filter((entry) => facets.slice(0, upTo).every((facet) => picks[facet.key]?.has(entry.values[facet.key]) ?? true))
}

const uniqueChars = (entries: readonly StemEntry[]) => [...new Set(entries.map((entry) => entry.char))]

/** 형제 카드 하나(상태 보기). 대표 글자 둘과 이 갈래의 따름 여부. 누르면 캔버스가 이 획을 고친다. */
function SiblingCard({ entry, marked, editing, onEdit }: { entry: StemEntry; marked: boolean; editing: boolean; onEdit: () => void }) {
  const refollow = useStemMasterStore((state) => state.refollow)
  const activeColor = (source: ResolvedStrokeInkSource) => source.jamoId === entry.char && source.strokeId === entry.strokeId ? ACTIVE_STROKE_COLOR : undefined
  return (
    <article className={styles.sibling} data-char={entry.char} data-stroke={entry.strokeId} data-follow={entry.follows} data-curved={entry.curved} data-picked={marked} data-editing={editing || undefined}>
      <button type="button" className={styles.siblingPick} aria-pressed={editing} aria-label={`${entry.char} ${entry.strokeId} 고치기`} onClick={onEdit}>
        <h3>{entry.char}</h3>
        <span className={styles.siblingGlyphs}>
          {FINALS.map((final) => <AppGlyph key={final.id} char={sampleSyllable(entry.char, final.id)} size={72} strokeColorOf={activeColor} />)}
        </span>
      </button>
      <ul>
        <li>
          <code>{entry.strokeId}</code>
          {CHANNEL_LABEL[entry.channel] && <small>{CHANNEL_LABEL[entry.channel]}</small>}
          <strong data-follow={entry.follows}>{entry.follows ? '따름' : '풀림'}</strong>
          {!entry.follows && <button type="button" onClick={() => refollow(entry.char, entry.channel, entry.strokeId)}>다시 따르기</button>}
        </li>
      </ul>
    </article>
  )
}

/**
 * 반영 질문. 줄기를 고친 뒤 "어디까지 반영할까요?"를 질문 하나씩 묻는다. 처음엔 전부 골라져 있고(좁히기),
 * 질문마다 보기가 카드로 나온다 — 카드에는 앞 질문 답 안에서 그 보기에 드는 홀자와 개수. 방금 고친 획이 든 카드에 표시.
 */
function ApplyQuestions({ base, entries, picks, editing, onPick, onApply, onCancel }: {
  base: StemBase
  entries: readonly StemEntry[]
  picks: Picks
  editing: StemEntry | null
  onPick: (key: string, value: string) => void
  onApply: () => void
  onCancel: () => void
}) {
  const facets = STEM_FACETS[base]
  const selected = filterEntries(entries, facets, picks)
  const chars = uniqueChars(selected)
  return (
    <section className={styles.questions} aria-label="반영 범위" data-testid="apply-questions">
      <header>
        <h2>{STEM_NAME_LABEL[base]}을 고쳤어요. 어디까지 반영할까요?</h2>
        <p>바뀌는 홀자 <strong data-testid="apply-count">{chars.length}</strong> · {chars.join(' ')}</p>
      </header>
      {facets.map((facet, index) => {
        const before = filterEntries(entries, facets, picks, index)
        return (
          <div key={facet.key} className={styles.question} data-facet={facet.key}>
            <h3>{index + 1}. {facet.question}</h3>
            <div className={styles.options}>
              {facet.options.map((option) => {
                const inOption = uniqueChars(before.filter((entry) => entry.values[facet.key] === option.value))
                if (inOption.length === 0) return null
                const on = picks[facet.key]?.has(option.value) ?? true
                const mine = editing?.values[facet.key] === option.value
                return (
                  <button key={option.value} type="button" className={styles.option} data-option={option.value} aria-pressed={on} onClick={() => onPick(facet.key, option.value)}>
                    <span className={styles.optionHead}>
                      <span className={styles.check} aria-hidden="true">✓</span>
                      {option.label} <small>{inOption.length}</small>
                      {mine && <em>고친 획</em>}
                    </span>
                    <span className={styles.optionChars}>
                      {inOption.map((char) => <AppGlyph key={char} char={sampleSyllable(char, 'open')} size={34} />)}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
      <footer>
        <button type="button" className={styles.reset} onClick={onCancel}>취소</button>
        <button type="button" className={styles.apply} data-testid="apply" disabled={selected.length === 0} onClick={onApply}>{chars.length}개 홀자에 반영</button>
      </footer>
    </section>
  )
}

const allPicks = (base: StemBase): Picks => Object.fromEntries(STEM_FACETS[base].map((facet) => [facet.key, new Set(facet.options.map((option) => option.value))]))

export function StemMasterLabPage() {
  const [base, setBase] = useState<StemBase>('gidung')
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [draft, setDraft] = useState<StemMaster | null>(null)
  /** 고쳤지만 아직 반영하지 않은 모양. 있으면 반영 질문이 뜬다. */
  const [pending, setPending] = useState<StemMaster | null>(null)
  const [picks, setPicks] = useState<Picks>(() => allPicks('gidung'))
  const masters = useStemMasterStore((state) => state.masters)
  const setMaster = useStemMasterStore((state) => state.setMaster)
  const jungseong = useJamoStore((state) => state.jungseong)
  const refollowAll = useStemMasterStore((state) => state.refollowAll)
  const resetAll = useStemMasterStore((state) => state.resetAll)

  const entries = useMemo(() => JUNGSEONG_LIST.flatMap((char) => {
    const jamo = jungseong[char]
    if (!jamo) return []
    return boundStrokesOf(jamo, masters).filter((item) => isUnder(item.name, base)).map((item): StemEntry => ({
      char, channel: item.channel, strokeId: item.stroke.id, name: item.name, values: facetValuesOf(item.name), follows: item.follows,
      curved: item.stroke.points.some((point) => point.handleIn || point.handleOut),
    }))
  }), [jungseong, masters, base])
  const keyOf = (entry: StemEntry) => `${entry.char}:${entry.strokeId}`
  const editing = entries.find((entry) => keyOf(entry) === editingKey) ?? entries[0] ?? null
  const leaves = [...new Set(entries.map((entry) => entry.name))]
  const selected = pending ? new Set(filterEntries(entries, STEM_FACETS[base], picks).map(keyOf)) : null
  const released = entries.filter((entry) => !entry.follows).length

  const startEdit = (shape: StemMaster) => {
    setPending(shape)
    setPicks(allPicks(base))
  }
  const cancel = () => { setPending(null); setDraft(null) }
  const apply = () => {
    if (!pending) return
    const names = [...new Set(filterEntries(entries, STEM_FACETS[base], picks).map((entry) => entry.name))]
    for (const name of names) setMaster({ ...pending, name })
    setPending(null)
  }
  const pick = (key: string, value: string) => setPicks((current) => {
    const next = new Set(current[key])
    if (next.has(value)) next.delete(value)
    else next.add(value)
    return { ...current, [key]: next }
  })
  const chooseBase = (next: StemBase) => { cancel(); setEditingKey(null); setPicks(allPicks(next)); setBase(next) }

  return (
    <main className={styles.page} data-testid="stem-master-lab">
      <header className={styles.hero}>
        <span>Stem Master Lab</span>
        <h1>홀자 줄기 마스터</h1>
        <p>줄기를 고치면 어디까지 반영할지 묻는다 — 전부에서 시작해 질문마다 카드를 골라 좁힌다. 같은 줄기라도 역할(바깥 · 안 기둥, 솟는 · 내리는 짧은기둥, 섞임홀자 등)이 달라 갈래로 나뉜다. 오른쪽 카드를 누르면 그 획을 고친다. <strong>여기서 반영하면 진짜 자모 획이 바뀐다</strong> — 문장 줄 · 카드 · OTF에도 나온다.</p>
        <div className={styles.names} role="radiogroup" aria-label="줄기">
          {STEM_BASES.map((item) => (
            <button key={item} type="button" role="radio" aria-checked={base === item} data-master={item} onClick={() => chooseBase(item)}>
              {STEM_NAME_LABEL[item]}{Object.entries(masters).some(([name, shape]) => isUnder(name, item) && shape && !isStraight(shape)) ? ' ●' : ''}
            </button>
          ))}
        </div>
        <button type="button" className={styles.reset} data-testid="reset-all" onClick={() => { cancel(); resetAll() }}>전체 리셋 — 마스터를 지우고 줄기를 전부 곧게</button>
      </header>

      <div className={styles.workspace}>
        <section className={styles.editor} aria-label="마스터 편집">
          {editing && (
            <div className={styles.canvases}>
              {FINALS.map((final) => (
                <MasterCanvas key={`${keyOf(editing)}-${final.id}`} name={editing.name} sample={editing} final={final.id} draft={draft ?? pending} onDraft={setDraft} onCommit={(shape) => { setDraft(null); startEdit(shape) }} />
              ))}
            </div>
          )}
          <aside className={styles.side}>
            <h2>{editing ? `${editing.char} · ${stemMasterLabel(editing.name)}` : STEM_NAME_LABEL[base]}</h2>
            <p>{pending ? '고친 모양 — 아래에서 반영할 곳을 고른다.' : editing && isStraight(masterOf(masters, editing.name)) ? '곧다 — 핸들을 끌어 고친다.' : '휘어 있다 — 핸들을 끌어 고친다.'}</p>
            <button type="button" className={styles.reset} disabled={Boolean(pending) || !editing || isStraight(masterOf(masters, editing.name))} onClick={() => editing && startEdit(straightMaster(editing.name))}>곧게 고치기</button>
            {pending && <ApplyQuestions base={base} entries={entries} picks={picks} editing={editing} onPick={pick} onApply={apply} onCancel={cancel} />}
          </aside>
        </section>

        <section className={styles.siblings} aria-label="형제">
          <h2>형제 <small>{uniqueChars(entries).length}</small></h2>
          {released > 0 && <button type="button" data-testid="refollow-all" onClick={() => leaves.forEach((name) => refollowAll(name))}>풀린 획 {released}개 모두 다시 따르기</button>}
          <div className={styles.roleGroups} data-testid="siblings">
            {leaves.map((leaf) => {
              const inLeaf = entries.filter((entry) => entry.name === leaf)
              return (
                <div key={leaf} className={styles.roleGroup} data-role={leaf} data-picked={selected ? inLeaf.some((entry) => selected.has(keyOf(entry))) : undefined}>
                  <h3 className={styles.roleHead}>{stemMasterLabel(leaf)} <small>{inLeaf.length}</small>{masters[leaf] && !isStraight(masters[leaf]!) && <em>휨</em>}</h3>
                  <div className={styles.siblingGrid}>
                    {inLeaf.map((entry) => (
                      <SiblingCard key={keyOf(entry)} entry={entry} marked={selected ? selected.has(keyOf(entry)) : true} editing={editing ? keyOf(editing) === keyOf(entry) : false} onEdit={() => { cancel(); setEditingKey(keyOf(entry)) }} />
                    ))}
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
