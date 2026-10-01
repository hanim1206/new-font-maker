import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { areaPathsD } from 'clipper2-ts'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { judgeGlyphInk, measureGlyphInk, OPENING_RATIO, REF_OPENING, referenceOfGlyph, shrinkPaths, withCounterKeep } from '../src/services/inkCounterMeasure'
import type { GlyphInk, GlyphReference } from '../src/services/inkCounterMeasure'
import { DEFAULT_COUNTER_FLOOR } from '../src/services/counterKeep'
import type { NotoPresetModelBundle } from './notoPresetGlyphs'

/**
 * 속공간 지키기 1단계 — 진짜 잉크로 재는 조합표. 플랜 `docs/plans/2026-10-01_속공간-지키기.md`.
 * 재는 셈(닿음 · 막힘 · 자소 안 닿음)은 `src/services/inkCounterMeasure.ts`에 있다 — 네모꼴 실험실의 진행 지도와 같은 셈이다.
 * - 검기: 잉크 넓이 ÷ 네모꼴 넓이.
 * 오래 걸려서 환경 변수가 있을 때만 돈다:
 *   INK_COUNTER_CENSUS=1 CENSUS_OUT=/tmp/ink-counter.json npx vitest run src-next/ink-counter-census.test.ts
 * `CENSUS_STRIDE`(기본 3 = 3,724자) · `CENSUS_WIDTHS` · `CENSUS_WEIGHTS`(쉼표)로 줄인다.
 * 한 프로세스로 12조건이 2분 남짓이다. 조건을 나눠 여러 프로세스로 돌리고 JSON을 합치면 1분 안이다(조건마다 기준을 다시 잰다).
 * `CENSUS_SHEET=빼,를 CENSUS_SHEET_OUT=/tmp/sheet.html`: 그 글자들을 조건마다 자소별 색으로 그린 한 장.
 */

const MODEL = JSON.parse(readFileSync(fileURLToPath(new URL('../public/noto-preset/model.json', import.meta.url)), 'utf8')) as NotoPresetModelBundle
const FONT_SPACE = { width: 1000, height: 1000 }
const BODY_H = 910
/** 사용자가 굵기 900에서 덩어리로 본 글자 + 대조군. 표본에 없어도 늘 잰다. */
const WATCH = ['빼', '를', '뷁', '이', '한', '웨', '쏟', '밭']

const listOf = (value: string | undefined, fallback: number[]) => value ? value.split(',').map(Number) : fallback
const WIDTHS = listOf(process.env.CENSUS_WIDTHS, [840, 720, 600])
const WEIGHTS = listOf(process.env.CENSUS_WEIGHTS, [400, 600, 700, 900])
const STRIDE = Number(process.env.CENSUS_STRIDE ?? 3)
/** `CENSUS_FLOOR=24,0.5,0.25`: 최소 속공간 하한선(고정 u, 두께 비율, 쌓인 가로줄기 비율 — 셋째는 없어도 됨)을 미리 얹어 잰다. 없으면 지금 제품 그대로. */
const FLOOR = process.env.CENSUS_FLOOR ? (([fixed, ratio, horizontalRatio]) => ({ fixed: fixed / 1000, ratio, horizontalRatio }))(process.env.CENSUS_FLOOR.split(',').map(Number)) : undefined

describe.skipIf(!process.env.INK_COUNTER_CENSUS)('속공간 지키기 — 진짜 잉크 조합표', () => {
  beforeAll(() => {
    const memory = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => memory.set(key, value), removeItem: (key: string) => memory.delete(key) })
  })
  afterAll(() => { vi.unstubAllGlobals() })

  it('가로 × 굵기', async () => {
    const [exportUtils, deltaStore, exportStore, layout, style, placement] = await Promise.all([
      import('../src/services/fontExportUtils'), import('./layoutDeltaStore'), import('./fontExportStore'),
      import('../src/stores/layoutStore'), import('../src/stores/globalStyleStore'), import('../src/services/designBodyPlacement'),
    ])
    const placementOf = exportStore.placementResolverOf(MODEL, deltaStore.layoutDeltaSnapshot())
    const chars: string[] = []
    for (let code = 0xac00; code <= 0xd7a3; code += STRIDE) chars.push(String.fromCharCode(code))
    for (const char of [...WATCH, ...(process.env.CENSUS_SHEET?.split(',') ?? [])]) if (!chars.includes(char)) chars.push(char)

    const measure = (char: string): GlyphInk | null => {
      const collected = exportUtils.collectGlyphDataWithPlacement(char, placementOf)
      if (!collected) return null
      return measureGlyphInk(FLOOR === undefined ? collected : withCounterKeep(collected, FLOOR).data)
    }
    const setCondition = (width: number, weight: number) => {
      layout.useLayoutStore.getState().setGlobalPadding(placement.designBodyPaddingForSize(width, BODY_H, FONT_SPACE))
      style.useGlobalStyleStore.getState().updateStyle('weight', weight)
    }

    // 기준: 기본 가로 · 굵기 400. 자소별 속공간과, 원래 닿아 있는 자소 쌍(`딱 붙음` — 며의 ㅕ 곁줄기가 ㅁ 기둥에 박힌 것 등).
    setCondition(840, 400)
    const reference = new Map<string, GlyphReference>()
    for (const char of chars) {
      const ink = measure(char)
      if (ink) reference.set(char, referenceOfGlyph(ink))
    }

    // `CENSUS_SHEET=갰,빼 CENSUS_SHEET_OUT=/tmp/sheet.html`: 그 글자들을 조건마다 자소별 색으로 그린 한 장(눈으로 맞춰 보기).
    const sheet: string[] = []
    const sheetChars = process.env.CENSUS_SHEET?.split(',') ?? []
    const COLOR: Record<string, string> = { CH: '#2e9d57', JU: '#2f6fd6', JO: '#8a4fd1' }
    const svgOf = (ink: GlyphInk, label: string) => {
      const d = ink.parts.map((item) => `<path fill="${COLOR[item.part] ?? '#000'}" fill-opacity="0.85" fill-rule="nonzero" d="${item.ink.map((path) => `M${path.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join('L')}Z`).join('')}"/>`).join('')
      return `<figure><svg viewBox="0 0 1000 1000" width="160" height="160" style="background:#fff"><g transform="matrix(1 0 0 -1 0 880)">${d}</g></svg><figcaption>${label}</figcaption></figure>`
    }

    // `CENSUS_SCALES=이,쏟`: 굵기 900 · 기본 하한선에서 자소별 굵기 배율.
    for (const char of process.env.CENSUS_SCALES?.split(',') ?? []) {
      setCondition(840, 900)
      const data = exportUtils.collectGlyphDataWithPlacement(char, placementOf)!
      const kept = withCounterKeep(data, DEFAULT_COUNTER_FLOOR).data
      const scaleOf = new Map<string, number>()
      data.strokes.forEach((item, index) => scaleOf.set(item.stroke.id, kept.strokes[index].stroke.thickness / item.stroke.thickness))
      console.info(`SCALES ${char} ${[...scaleOf].map(([id, value]) => `${id} ${value.toFixed(3)}`).join(' · ')}`)
    }
    setCondition(840, 400)

    // `CENSUS_OPENINGS=뭐`: 조건마다 자소별 흰 덩어리의 열린 폭(u)과 넓이(u²)를 찍는다.
    for (const char of process.env.CENSUS_OPENINGS?.split(',') ?? []) for (const width of WIDTHS) for (const weight of WEIGHTS) {
      setCondition(width, weight)
      for (const item of measure(char)?.parts ?? []) {
        const widths = item.white.map((piece) => {
          let lo = 0
          let hi = 400
          for (let step = 0; step < 12; step += 1) { const mid = (lo + hi) / 2; if (shrinkPaths(piece, mid).length) lo = mid; else hi = mid }
          return `${Math.round(lo)}u(${Math.round(areaPathsD(piece))})`
        })
        console.info(`OPENINGS ${char} ${width}x${weight} ${item.part}: ${widths.join(' ')}`)
      }
      console.info(`OPENINGS ${char} ${width}x${weight} 획 닿음: ${measure(char)?.inner.join(' ')}`)
      const data = exportUtils.collectGlyphDataWithPlacement(char, placementOf)
      for (const item of data?.strokes ?? []) console.info(`OPENINGS ${char} ${width}x${weight} ${item.stroke.id} 두께 ${Math.round(item.stroke.thickness * data!.weightMultiplier * 1000)} ${JSON.stringify(item.stroke.points.map((p) => [Math.round((item.box.x + p.x * item.box.width) * 1000), Math.round((item.box.y + p.y * item.box.height) * 1000)]))}`)
    }

    const table: Record<string, unknown>[] = []
    const watch: Record<string, Record<string, unknown>> = {}
    const perChar: Record<string, Record<string, { touch: string[]; closed: string[]; split: string[] }>> = {}
    for (const width of WIDTHS) for (const weight of WEIGHTS) {
      setCondition(width, weight)
      const started = Date.now()
      let touched = 0
      let closed = 0
      let both = 0
      let splitCount = 0
      let closedOrSplit = 0
      let inkArea = 0
      const closedByPart: Record<string, number> = {}
      const touchByPair: Record<string, number> = {}
      const key = `${width}x${weight}`
      perChar[key] = {}
      for (const char of chars) {
        const ink = measure(char)
        if (!ink) continue
        const { touch, closed: lost, split } = judgeGlyphInk(ink, reference.get(char))
        if (touch.length) touched += 1
        if (lost.length) closed += 1
        if (split.length) splitCount += 1
        if (lost.length || split.length) closedOrSplit += 1
        if (touch.length && lost.length) both += 1
        for (const part of lost) closedByPart[part] = (closedByPart[part] ?? 0) + 1
        for (const pair of touch) touchByPair[pair] = (touchByPair[pair] ?? 0) + 1
        if (WATCH.includes(char)) {
          watch[char] = { ...watch[char], [key]: { touch, closed: lost, split } }
        }
        if (touch.length || lost.length || split.length) perChar[key][char] = { touch, closed: lost, split }
        if (sheetChars.includes(char)) sheet.push(svgOf(ink, `${char} ${key}${lost.length ? ` 막힘 ${lost.join(' ')}` : ''}${split.length ? ` 안닿음 ${split.join(' ')}` : ''}${touch.length ? ` 닿음 ${touch.join(' ')}` : ''}`))
        inkArea += ink.area
      }
      const bodyArea = width * BODY_H
      const row = { width, weight, touched, closed, split: splitCount, closedOrSplit, both, closedByPart, touchByPair, darkness: Math.round(inkArea / chars.length / bodyArea * 1000) / 10, seconds: Math.round((Date.now() - started) / 1000) }
      table.push(row)
      console.info(JSON.stringify(row))
    }
    if (sheet.length) writeFileSync(process.env.CENSUS_SHEET_OUT ?? '/tmp/ink-sheet.html', `<!doctype html><meta charset=utf-8><style>body{display:flex;flex-wrap:wrap;gap:6px;font:11px sans-serif;background:#eee}figure{margin:0;width:160px}</style>${sheet.join('')}`)
    writeFileSync(process.env.CENSUS_OUT ?? '/tmp/ink-counter.json', JSON.stringify({ chars: chars.length, floor: FLOOR ?? null, openingRatio: OPENING_RATIO, refOpening: REF_OPENING, table, watch, perChar }))
    console.info(JSON.stringify(watch, null, 1))
    expect(table).toHaveLength(WIDTHS.length * WEIGHTS.length)
  }, 3_600_000)
})
