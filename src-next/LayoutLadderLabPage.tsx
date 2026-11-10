import { useEffect, useRef, useState } from 'react'
import baseJamos from '../src/data/baseJamos.json'
import { NOTO_FONT_PRESET } from '../src/types/database'
import type { DeepReadonly } from '../src/types'
import { LADDER_HYPS, LADDER_KINDS, LADDER_V, ladderBase, ladderMedian, ladderPools, ladderStep } from './layoutLadder'
import type { LadderPool, LadderRow } from './layoutLadder'
import type { JamoMaps, ScoreInput, ScoredGlyph } from './layoutRulesScore'
import { LADDER_CSS, LADDER_CSS_WORK, LADDER_HTML, mountLadderView } from './layoutLadderView'
import { useNotoModel } from './notoModel'
import { notoPresetGlyphs } from './notoPresetGlyphs'

/**
 * 가설 사다리 실험실. 아티팩트로 굽던 화면을 옮겨 왔다 — 모든 조합을 미리 굽지 않고, 고른 조합과
 * "이것만 켜고 끄면"에 필요한 이웃 조합만 그 자리에서 잰다(잰 것은 다시 재지 않는다).
 * 자모는 측정 스크립트와 같게 기본 자모(`baseJamos.json`), 모델은 노토 프리셋 그대로 쓴다.
 */

const maps = baseJamos as unknown as JamoMaps
const BATCH = 12
const yieldFrame = () => new Promise((resolve) => setTimeout(resolve, 0))

interface Glyph { row: LadderRow; table: ScoredGlyph; outline: DeepReadonly<ScoreInput['outline']> }
interface Summary { n: number; raw: number; table: number; steps: Record<number, number> }

/** 조합 sel을 보려면 잴 것: 자기 자신, 패턴만(0), 가설 하나씩 뒤집은 이웃. 자기 자신이 먼저. */
const masksFor = (sel: number) => [sel, 0, ...LADDER_HYPS.map((_, i) => sel ^ (1 << i))].filter((mask, i, all) => all.indexOf(mask) === i)

export function LayoutLadderLabPage() {
  const { bundle, error } = useNotoModel(NOTO_FONT_PRESET)
  const host = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState('노토 모델을 읽는 중')

  useEffect(() => {
    const root = host.current
    if (!bundle || !root) return
    let alive = true
    const model = bundle as unknown as ScoreInput['model']
    const glyphs: Glyph[] = []
    const summary: Record<LadderPool, Summary> = { 588: { n: 0, raw: NaN, table: NaN, steps: {} }, 171: { n: 0, raw: NaN, table: NaN, steps: {} } }
    const svgs: Record<string, { table: string; steps: Record<number, string> }> = {}
    const D = { V: LADDER_V, hyps: LADDER_HYPS.map(({ id, name, who }) => ({ id, name, who })), kinds: LADDER_KINDS, rows: [] as LadderRow[], summary, svgs }
    const done = new Set<number>()
    let queue: number[] = []
    let running = false

    root.innerHTML = LADDER_HTML
    const view = mountLadderView(root, D, (sel) => { want(sel) })

    const summarize = (mask: number) => {
      for (const pool of ['588', '171'] as const) summary[pool].steps[mask] = ladderMedian(D.rows.filter((r) => r.pool === pool && r.xs[mask] !== undefined).map((r) => r.xs[mask])) ?? NaN
    }
    const want = (sel: number) => {
      queue = masksFor(sel).filter((mask) => !done.has(mask))
      void pump()
    }
    const pump = async () => {
      if (running) return
      running = true
      while (alive && queue.length) {
        const mask = queue[0]
        for (let i = 0; i < glyphs.length; i += BATCH) {
          for (const g of glyphs.slice(i, i + BATCH)) ladderStep({ row: g.row, table: g.table, mask, maps, model, outline: g.outline })
          if (!alive) return
          setStatus(`조합 ${maskName(mask)} 재는 중 ${Math.min(i + BATCH, glyphs.length)} / ${glyphs.length}자 · 남은 조합 ${queue.length - 1}`)
          await yieldFrame()
        }
        done.add(mask)
        summarize(mask)
        queue = queue.filter((m) => m !== mask)
        view.render()
      }
      running = false
      if (alive) setStatus(`잰 조합 ${done.size}개 — 체크를 바꾸면 필요한 조합만 더 잰다`)
    }

    const load = async () => {
      const all = ladderPools().flatMap(({ pool, chars }) => chars.map((char) => ({ pool, char })))
      for (let i = 0; i < all.length; i += BATCH) {
        const slice = all.slice(i, i + BATCH)
        const loaded = await Promise.all(slice.map(({ pool, char }) => notoPresetGlyphs.glyph(char.codePointAt(0) ?? 0).then((glyph) => ({ pool, char, outline: glyph.outline }), () => null)))
        if (!alive) return
        for (const item of loaded) {
          if (!item?.outline) continue
          const base = ladderBase({ char: item.char, pool: item.pool, maps, model, outline: item.outline })
          if (!base) continue
          glyphs.push({ row: base.row, table: base.table, outline: item.outline })
          D.rows.push(base.row)
          svgs[item.char] = { table: base.row.svgTable, steps: base.row.svgSteps }
        }
        setStatus(`노토 글자와 외운 표를 재는 중 ${Math.min(i + BATCH, all.length)} / ${all.length}자`)
        await yieldFrame()
      }
      for (const pool of ['588', '171'] as const) {
        const rows = D.rows.filter((r) => r.pool === pool)
        summary[pool].n = rows.length
        summary[pool].raw = ladderMedian(rows.map((r) => r.raw)) ?? NaN
        summary[pool].table = ladderMedian(rows.map((r) => r.table)) ?? NaN
      }
      view.render()
      want(view.mask())
    }
    void load()
    return () => { alive = false; root.innerHTML = ''; root.classList.remove('pk') }
  }, [bundle])

  return <>
    <style>{LADDER_CSS + LADDER_CSS_WORK}</style>
    <div className="LL-status" style={{ position: 'sticky', top: 0, zIndex: 30, padding: '6px 20px', fontSize: 12, background: '#1d1d1f', color: '#fff' }}>{error ? `모델을 못 읽었다: ${error}` : status}</div>
    <div ref={host} className="LL" />
  </>
}

const maskName = (mask: number) => mask === 0 ? '패턴만' : '패턴만 + ' + LADDER_HYPS.map((_, i) => (mask >> i) & 1 ? i + 1 : null).filter(Boolean).join(' · ')
