import { memo, useMemo, useState } from 'react'
import { useJamoStore } from '../src/stores/jamoStore'
import { mergePadding, useLayoutStore } from '../src/stores/layoutStore'
import { useContextPlacement } from './notoModel'
import type { GlobalStyle } from '../src/stores/globalStyleStore'
import { SvgRenderer } from '../src/renderers/SvgRenderer'
import { resolveGlyphInkPrimitives } from '../src/services/glyphInkResolver'
import { describeStrokeGeometry, grammarOf, STEM_NAME_LABEL, STEM_SHAPE_LABEL } from '../src/services/strokeGrammar'
import type { JamoType } from '../src/services/strokeGrammar'
import { weightToMultiplier } from '../src/utils/globalStyleUtils'
import { decomposeSyllable } from '../src/utils/hangulUtils'
import type { BoxConfig, JamoData, Part, ResolvedStrokeInkSource, StrokeDataV2 } from '../src/types'
import { EDIT_COLOR } from './editColors'
import styles from './HandwritingAnatomy.module.css'

/**
 * 선택한 글자 해부(손글씨 실험실 오른쪽). 프리셋 글자를 크게 그리고 첫닿자 · 홀자 · 받침을 색과 점선 상자로 나눠 보인다.
 * 자모 하나를 누르면 그 자모만 색이 남고, 획 문법(`strokeGrammar`)이 읽은 줄기 · 꺾임 · 머리 · 맺음에 번호를 붙여 펼친다.
 * 이름은 획 문법 표에서, 모양은 지금 그려지는 획(가른 벌 · 문맥 보정이 끝난 획)에서 읽는다.
 */

type Slot = 'CH' | 'JU' | 'JO'
const SLOT_OF: Record<Part, Slot> = { CH: 'CH', JU: 'JU', JU_H: 'JU', JU_V: 'JU', JO: 'JO' }
const SLOT_TYPE: Record<Slot, JamoType> = { CH: 'choseong', JU: 'jungseong', JO: 'jongseong' }
const SLOT_NAME: Record<Slot, string> = { CH: '첫닿자', JU: '홀자', JO: '받침' }
const SLOT_COLOR: Record<Slot, string> = { CH: EDIT_COLOR.editSlotCh, JU: EDIT_COLOR.editSlotJu, JO: EDIT_COLOR.editSlotJo }
const SLOT_VAR: Record<Slot, string> = { CH: '--color-edit-slot-ch', JU: '--color-edit-slot-ju', JO: '--color-edit-slot-jo' }
const V = 100

interface AnatomyItem {
  n: number
  strokeId: string
  /** 표의 줄기 이름 또는 마디 모양. */
  label: string
  kind: 'segment' | 'corner' | 'head' | 'tail'
  note: string
  /** 글자 상자(viewBox 0–100) 안 표시 자리. */
  at: { x: number; y: number }
  /** 마디면 그 마디의 중심선(강조할 때 덧그림). */
  line?: { x: number; y: number }[]
}

const vowelKind = (char: string): string => {
  if ('ㅏㅐㅑㅒㅓㅔㅕㅖㅣ'.includes(char)) return '세로홀자'
  if ('ㅗㅛㅜㅠㅡ'.includes(char)) return '가로홀자'
  return '섞임홀자'
}

const toView = (p: { x: number; y: number }, box: Readonly<BoxConfig>) => ({ x: (box.x + p.x * box.width) * V, y: (box.y + p.y * box.height) * V })

function itemsOf(primitives: { stroke: StrokeDataV2; box: Readonly<BoxConfig>; source: ResolvedStrokeInkSource }[], jamo: JamoData, type: JamoType): AnatomyItem[] {
  const table = grammarOf(type, jamo.char)
  const out: AnatomyItem[] = []
  let n = 1
  for (const { stroke, box, source } of primitives) {
    const others = primitives.filter((p) => p.source.channel === source.channel && p.stroke.id !== stroke.id).map((p) => p.stroke)
    const geo = describeStrokeGeometry(stroke, others)
    const name = table[stroke.id] ?? null
    const pts = stroke.points
    // 끝 표시는 획 끝에서 바깥으로 조금 밀어 마디 번호와 안 겹치게.
    const endMark = (i: number) => {
      const end = toView(pts[i], box)
      const nb = i === 0 ? (pts[0].handleOut ?? pts[1]) : (pts[i].handleIn ?? pts[i - 1])
      const from = toView(nb, box)
      const d = Math.hypot(end.x - from.x, end.y - from.y) || 1
      return { x: end.x + (end.x - from.x) / d * 4.5, y: end.y + (end.y - from.y) / d * 4.5 }
    }
    // 쓰는 차례대로: 머리 → 마디 · 꺾임 번갈아 → 맺음. 머리가 끝 점 쪽이면 거꾸로 센다.
    const reversed = !!geo.head && geo.head.point !== 0
    const steps: ({ seg: (typeof geo.segments)[number] } | { corner: (typeof geo.corners)[number] })[] = []
    geo.segments.forEach((seg, i) => {
      if (stroke.closed && geo.corners[i]) steps.push({ corner: geo.corners[i] })
      steps.push({ seg })
      if (!stroke.closed && geo.corners[i]) steps.push({ corner: geo.corners[i] })
    })
    if (reversed) steps.reverse()
    if (geo.head?.open) out.push({ n: n++, strokeId: stroke.id, kind: 'head', label: '머리', note: '열린 끝', at: endMark(geo.head.point) })
    for (const step of steps) {
      if ('corner' in step) { const c = step.corner; out.push({ n: n++, strokeId: stroke.id, kind: 'corner', label: '꺾임', note: `${Math.round(c.turn)}° 돎`, at: toView(c, box) }); continue }
      const seg = step.seg
      const shape = STEM_SHAPE_LABEL[seg.shape]
      if (seg.shape === 'dunggeunjulgi') {
        const c = pts.reduce((a, p) => ({ x: a.x + p.x / pts.length, y: a.y + p.y / pts.length }), { x: 0, y: 0 })
        const top = pts.reduce((a, p) => (p.y < a.y ? p : a), pts[0])
        out.push({ n: n++, strokeId: stroke.id, label: name ? STEM_NAME_LABEL[name] : shape, kind: 'segment', note: name ? shape : '닫힌 획', at: toView({ x: c.x, y: top.y }, box) })
        continue
      }
      const a = pts[seg.fromPoint], b = pts[seg.toPoint]
      const line = [a, b].map((p) => toView(p, box))
      const curved = !!(a.handleOut || b.handleIn)
      const one = geo.segments.length === 1
      out.push({
        n: n++, strokeId: stroke.id, kind: 'segment',
        label: name && one ? STEM_NAME_LABEL[name] : shape,
        note: [name && one ? shape : name ? `${STEM_NAME_LABEL[name]}의 한 마디` : '', curved ? '휜 마디' : ''].filter(Boolean).join(' · ') || '곧은 마디',
        at: { x: (line[0].x + line[1].x) / 2, y: (line[0].y + line[1].y) / 2 }, line,
      })
    }
    if (geo.tail?.open) out.push({ n: n++, strokeId: stroke.id, kind: 'tail', label: '맺음', note: '열린 끝', at: endMark(geo.tail.point) })
  }
  // 번호가 앞 번호와 겹치면 마디를 따라 옆으로 옮긴다.
  const near = (p: { x: number; y: number }, upto: number) => out.slice(0, upto).some((o) => Math.hypot(o.at.x - p.x, o.at.y - p.y) < 6)
  out.forEach((it, k) => {
    if (!it.line || !near(it.at, k)) return
    const [a, b] = it.line
    for (const t of [0.3, 0.7, 0.2, 0.8]) {
      const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
      if (!near(p, k)) { it.at = p; return }
    }
  })
  return out
}

export const HandwritingAnatomy = memo(function HandwritingAnatomy({ char, style, size = 360 }: { char: string; style: GlobalStyle; size?: number }) {
  const choseong = useJamoStore((state) => state.choseong)
  const jungseong = useJamoStore((state) => state.jungseong)
  const jongseong = useJamoStore((state) => state.jongseong)
  const schemas = useLayoutStore((state) => state.layoutSchemas)
  const globalPadding = useLayoutStore((state) => state.globalPadding)
  const paddingOverrides = useLayoutStore((state) => state.paddingOverrides)
  const syllable = useMemo(() => decomposeSyllable(char, choseong, jungseong, jongseong), [char, choseong, jungseong, jongseong])
  const schema = useMemo(() => {
    const padding = mergePadding(globalPadding, paddingOverrides[syllable.layoutType])
    return { ...schemas[syllable.layoutType], padding, designBodyPadding: padding }
  }, [schemas, globalPadding, paddingOverrides, syllable.layoutType])
  const { placement } = useContextPlacement(syllable, schema, style)
  const [focus, setFocus] = useState<{ char: string; slot: Slot } | null>(null)
  const [hot, setHot] = useState<number | null>(null)
  const slot = focus?.char === char ? focus.slot : null

  // 렌더러와 같은 입력으로 획을 풀어, 그려지는 그 획에서 부위를 읽는다.
  const resolved = useMemo(() => resolveGlyphInkPrimitives({
    syllable,
    placement: placement.kind === 'schema' ? { kind: 'schema', schema: placement.schema } : { kind: 'boxes', boxes: placement.boxes },
    weightMultiplier: weightToMultiplier(style.weight),
    globalLinecap: style.linecap,
    globalLinejoin: style.linejoin,
    horizontalInkBounds: { min: 0, max: 1 },
  }), [syllable, placement, style.weight, style.linecap, style.linejoin])

  const slots = useMemo(() => {
    const jamoOf: Record<Slot, JamoData | undefined> = { CH: syllable.choseong ?? undefined, JU: syllable.jungseong ?? undefined, JO: syllable.jongseong ?? undefined }
    return (['CH', 'JU', 'JO'] as Slot[]).flatMap((s) => {
      const jamo = jamoOf[s]
      if (!jamo) return []
      const prims = resolved.primitives.filter((p) => SLOT_OF[p.source.part] === s).map((p) => ({ stroke: p.stroke as StrokeDataV2, box: p.box, source: p.source }))
      const parts = (Object.entries(resolved.boxes) as [Part, BoxConfig][]).filter(([part]) => SLOT_OF[part] === s).map(([, b]) => b)
      return [{ slot: s, jamo, prims, parts, items: itemsOf(prims, jamo, SLOT_TYPE[s]) }]
    })
  }, [resolved, syllable])

  const active = slots.find((s) => s.slot === slot) ?? null
  const hotItem = active?.items.find((it) => it.n === hot) ?? null
  const colorOf = (source: ResolvedStrokeInkSource) => {
    const s = SLOT_OF[source.part]
    if (!slot) return SLOT_COLOR[s]
    if (s !== slot) return EDIT_COLOR.editSlotOff
    if (hotItem && hotItem.strokeId !== source.strokeId) return EDIT_COLOR.editGuide
    return SLOT_COLOR[s]
  }
  const pick = (s: Slot) => { setHot(null); setFocus(slot === s ? null : { char, slot: s }) }

  return <div className={styles.wrap} data-testid="handwriting-anatomy">
    <div className={styles.big}>
      <SvgRenderer syllable={syllable} schema={placement.kind === 'schema' ? placement.schema : undefined} boxes={placement.kind === 'boxes' ? placement.boxes : undefined}
        size={size} globalStyle={style} overflow="visible" clipGlyphs={false} strokeColorOf={colorOf}>
        {slots.filter((s) => !slot || s.slot === slot).flatMap((s) => s.parts.map((b, i) => <rect key={`${s.slot}-${i}`} x={b.x * V} y={b.y * V} width={b.width * V} height={b.height * V}
          fill="none" stroke={SLOT_COLOR[s.slot]} strokeWidth={0.35} strokeDasharray="1.2 1" pointerEvents="none" />))}
        {hotItem?.line && <polyline points={hotItem.line.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke={EDIT_COLOR.foreground} strokeWidth={0.6} strokeDasharray="1.5 1" pointerEvents="none" />}
        {active?.items.map((it) => <g key={it.n} className={styles.mark} onClick={() => setHot(hot === it.n ? null : it.n)}>
          <circle cx={it.at.x} cy={it.at.y} r={hot === it.n ? 3.6 : 3} fill={hot === it.n ? EDIT_COLOR.foreground : SLOT_COLOR[active.slot]} stroke={EDIT_COLOR.surface} strokeWidth={0.5} />
          <text x={it.at.x} y={it.at.y + 1.25} fontSize={3.4} fontWeight={700} textAnchor="middle" fill={EDIT_COLOR.surface}>{it.n}</text>
        </g>)}
      </SvgRenderer>
    </div>

    <div className={styles.slots}>
      {slots.map((s) => <button key={s.slot} type="button" className={`${styles.slot}${slot === s.slot ? ` ${styles.slotOn}` : ''}`} style={{ ['--slot' as string]: `var(${SLOT_VAR[s.slot]})` }}
        onClick={() => pick(s.slot)} data-testid={`handwriting-anatomy-${s.slot}`}>
        <i aria-hidden="true" /><b>{SLOT_NAME[s.slot]} {s.jamo.char}</b>{s.slot === 'JU' && <small>{vowelKind(s.jamo.char)}</small>}
        {slot !== s.slot && <span className={styles.chips}>{[...new Set(s.items.map((it) => it.label))].map((l) => <em key={l}>{l}</em>)}</span>}
      </button>)}
    </div>

    {active && <ol className={styles.rows}>
      {active.items.map((it) => <li key={it.n}>
        <button type="button" className={`${styles.row}${hot === it.n ? ` ${styles.rowOn}` : ''}`} style={{ ['--slot' as string]: `var(${SLOT_VAR[active.slot]})` }} onClick={() => setHot(hot === it.n ? null : it.n)}>
          <span className={styles.n}>{it.n}</span><b>{it.label}</b><small>{it.note}</small><code>{it.strokeId}</code>
        </button>
      </li>)}
    </ol>}
    {!active && <p className={styles.hint}>자모를 누르면 그 자모의 부위가 번호로 펼쳐져요.</p>}
  </div>
})
