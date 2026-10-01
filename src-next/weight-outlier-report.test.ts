import { writeFileSync } from 'node:fs'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, it, vi } from 'vitest'
import {
  betweenKeepScales, counterKeepScale, strokeGrowthOf, strokeVerticalness,
  DEFAULT_BETWEEN_OPENING, DEFAULT_COUNTER_FLOOR, DEFAULT_TOTAL_MINSCALE, jamoOfPart,
} from '../src/services/counterKeep'
import { stemScaleOf } from '../src/services/strokeRenderGeometry'
import type { NotoPresetModelBundle } from './notoPresetGlyphs'

/**
 * 속공간 지키기 — 튀는 글자 자동 골라내기. 플랜 `docs/plans/2026-10-01_속공간-지키기.md` 눈 ③ 보조.
 * 획마다 "제 목표 성장(누운 만큼 섞은 가로 몫 성장) 대비 실제 성장"의 비율을 재서,
 * 극단적으로 얇아진 획을 가진 글자를 전수로 뽑고 원인 층(자소 바닥 · 자소 사이 깎임)별로 묶는다.
 * Clipper 없이 배율 셈만이라 전수(11,172자)도 1~2분.
 *
 *   WEIGHT_OUTLIERS=1 npx vitest run --dir src-next weight-outlier-report
 * - `OUTLIER_WEIGHT`(기본 900) · `OUTLIER_STRIDE`(기본 1 = 전수) · `OUTLIER_OUT`(JSON 경로)
 */

const MODEL = JSON.parse(readFileSync(fileURLToPath(new URL('../public/noto-preset/model.json', import.meta.url)), 'utf8')) as NotoPresetModelBundle
const FONT_SPACE = { width: 1000, height: 1000 }
const WEIGHT = Number(process.env.OUTLIER_WEIGHT ?? 900)
const STRIDE = Number(process.env.OUTLIER_STRIDE ?? 1)
const OUT = process.env.OUTLIER_OUT ?? '/tmp/weight-outliers.json'
/** 손잡이 — 기본은 제품 값(10-02 뒤집힘: 가로 몫 1 · 자소 바닥 끔 · 사이 0.25 · 합성 바닥 0.8). 옛 조합은 env로 되살린다. */
const BETWEEN_MIN = Number(process.env.OUTLIER_BETWEEN_MIN ?? 0)
const TOTAL_MIN = Number(process.env.OUTLIER_TOTAL_MIN ?? DEFAULT_TOTAL_MINSCALE)
const HSHARE = Number(process.env.OUTLIER_HSHARE ?? 1)
const MINSCALE = Number(process.env.OUTLIER_MINSCALE ?? 1)

describe.skipIf(!process.env.WEIGHT_OUTLIERS)('속공간 지키기 — 튀는 글자 골라내기', () => {
  beforeAll(() => {
    const memory = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => memory.set(key, value), removeItem: (key: string) => memory.delete(key) })
  })
  afterAll(() => { vi.unstubAllGlobals() })

  it('획별 성장 비율 전수', { timeout: 600_000 }, async () => {
    const [exportUtils, deltaStore, exportStore, layout, style, placement] = await Promise.all([
      import('../src/services/fontExportUtils'), import('./layoutDeltaStore'), import('./fontExportStore'),
      import('../src/stores/layoutStore'), import('../src/stores/globalStyleStore'), import('../src/services/designBodyPlacement'),
    ])
    const placementOf = exportStore.placementResolverOf(MODEL, deltaStore.layoutDeltaSnapshot())
    layout.useLayoutStore.getState().setGlobalPadding(placement.designBodyPaddingForSize(840, 910, FONT_SPACE))
    style.useGlobalStyleStore.getState().updateStyle('weight', WEIGHT)

    interface StrokeRow { part: string; id: string; vertical: number; target: number; eff: number; ratio: number; jamoScale: number; between: number }
    interface CharRow { char: string; minRatio: number; band: number; strokes: StrokeRow[] }
    const rows: CharRow[] = []
    let multiplier = 1

    for (let code = 0xac00; code <= 0xd7a3; code += STRIDE) {
      const char = String.fromCharCode(code)
      const data = exportUtils.collectGlyphDataWithPlacement(char, placementOf, { counterKeep: false })
      if (!data) continue
      const k = data.weightMultiplier
      if (!(k > 1)) continue
      multiplier = k
      const stemScale = stemScaleOf(data.strokeStyle)
      const parted = data.strokes.map((item) => ({ stroke: item.stroke, box: item.box, part: jamoOfPart((item.beakGroup ?? '').split(':')[0]) }))
      const parts = [...new Set(parted.map((item) => item.part))]
      const jamoScaleOf = new Map(parts.map((part) => [part, Math.max(MINSCALE, counterKeepScale(parted.filter((item) => item.part === part), k, DEFAULT_COUNTER_FLOOR, stemScale, HSHARE))]))
      const between = betweenKeepScales(parted, parted.map((item) => parts.indexOf(item.part)), k, stemScale, HSHARE, DEFAULT_BETWEEN_OPENING, BETWEEN_MIN)
      const strokes = parted.map((item, index): StrokeRow => {
        const vertical = strokeVerticalness(item.stroke, item.box)
        const growth = strokeGrowthOf(vertical, k, HSHARE)
        const jamoScale = jamoScaleOf.get(item.part) ?? 1
        let clamped = Math.max(between[index], growth > 0 ? 1 / (growth * jamoScale) : between[index])
        // 합성 바닥 후보 — 제품 셈(counterKeepStrokeFactors)의 totalMinScale과 같은 뜻.
        if (TOTAL_MIN > 0 && jamoScale * clamped < TOTAL_MIN) clamped = TOTAL_MIN / jamoScale
        const eff = growth * jamoScale * clamped
        return { part: item.part, id: item.stroke.id, vertical, target: growth, eff, ratio: eff / growth, jamoScale, between: clamped }
      })
      const effs = strokes.map((row) => row.eff)
      rows.push({ char, minRatio: Math.min(...strokes.map((row) => row.ratio)), band: Math.min(...effs) / Math.max(...effs), strokes })
    }

    // 분포와 묶음 — 기준은 분포를 보고 고르라고 사분위도 같이 찍는다.
    const sorted = [...rows].sort((a, b) => a.minRatio - b.minRatio)
    const q = (list: number[], at: number) => list[Math.floor((list.length - 1) * at)]
    const minRatios = rows.map((row) => row.minRatio).sort((a, b) => a - b)
    const bands = rows.map((row) => row.band).sort((a, b) => a - b)
    console.info(`전수 ${rows.length}자 · 굵기 ${WEIGHT} (k=${multiplier.toFixed(3)})`)
    console.info(`획 최저 비율(제 목표 대비): p1 ${q(minRatios, 0.01).toFixed(2)} · p5 ${q(minRatios, 0.05).toFixed(2)} · p25 ${q(minRatios, 0.25).toFixed(2)} · 중앙 ${q(minRatios, 0.5).toFixed(2)}`)
    console.info(`글자 안 굵기 띠(min/max): p1 ${q(bands, 0.01).toFixed(2)} · p5 ${q(bands, 0.05).toFixed(2)} · 중앙 ${q(bands, 0.5).toFixed(2)}`)

    // 원인 묶음: 가장 눌린 획 기준 — 어느 자소의 어느 획이, 어느 층(자소 사이 깎임 / 자소 바닥) 때문에 눌렸나.
    const worstStrokeOf = (row: CharRow) => row.strokes.reduce((a, b) => (b.ratio < a.ratio ? b : a))
    const causeOf = (stroke: StrokeRow) => (stroke.between < stroke.jamoScale ? '자소 사이 깎임' : stroke.jamoScale <= MINSCALE + 1e-9 ? '자소 바닥(0.8)' : '자소 하한선')
    const clusters = new Map<string, { count: number; chars: string[] }>()
    const FLAG = 0.75
    const flagged = sorted.filter((row) => row.minRatio < FLAG)
    for (const row of flagged) {
      const stroke = worstStrokeOf(row)
      const key = `${stroke.part} ${stroke.id} · ${causeOf(stroke)}`
      const cluster = clusters.get(key) ?? { count: 0, chars: [] }
      cluster.count += 1
      if (cluster.chars.length < 12) cluster.chars.push(row.char)
      clusters.set(key, cluster)
    }
    console.info(`비율 ${FLAG} 아래(제 목표의 3/4도 못 굵어진 획을 가진 글자): ${flagged.length}자 / ${rows.length}자`)
    for (const [key, cluster] of [...clusters].sort((a, b) => b[1].count - a[1].count).slice(0, 25)) {
      console.info(`묶음 ${key}: ${cluster.count}자 — ${cluster.chars.join(' ')}`)
    }
    console.info(`최악 40자: ${sorted.slice(0, 40).map((row) => `${row.char}(${row.minRatio.toFixed(2)})`).join(' ')}`)
    writeFileSync(OUT, JSON.stringify({ weight: WEIGHT, stride: STRIDE, flagThreshold: FLAG, chars: rows.length, flagged: flagged.length, rows: sorted.slice(0, 400) }, null, 1))
    console.info(`OUTLIER_OUT ${OUT}`)
  })
})
