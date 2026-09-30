import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { flattenStrokeCenterline } from '../src/services/brushGeometry'
import type { NotoPresetModelBundle } from './notoPresetGlyphs'

/**
 * 홀자 줄기 끝점 = 보선 G2 전수. 11,172자를 화면 · 추출과 같은 상자로 놓고 글자마다 획 중심선 · 두께 · 자소 사이 잉크 간격 · 글자 몸 밖으로 나간 양을 JSON으로 떨군다.
 * `before`는 줄기 끝점을 보선에서 받지 않는다(`stemRailTargets` 끔 = 칸에 통째로 맞추던 때), `after`는 지금 그대로. 비교는 두 파일을 견준다.
 * 오래 걸려서 환경 변수가 있을 때만 돈다:
 *   MEDIAL_ENDPOINT_CENSUS=before CENSUS_OUT=/tmp/before.json npx vitest run src-next/medial-endpoint-census.test.ts
 */

const MODE = process.env.MEDIAL_ENDPOINT_CENSUS
vi.mock('../src/services/medialStemRails', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/medialStemRails')>()
  return { ...actual, stemRailTargets: process.env.MEDIAL_ENDPOINT_CENSUS === 'before' ? () => ({}) : actual.stemRailTargets }
})

const MODEL = JSON.parse(readFileSync(fileURLToPath(new URL('../public/noto-preset/model.json', import.meta.url)), 'utf8')) as NotoPresetModelBundle
/** 기준 몸통(노토) 840 × 910, 칸 1000 안 50 · 50에서. em. */
const BODY = { left: 0.05, right: 0.89, top: 0.05, bottom: 0.96 }

type Vec = { x: number; y: number }
function distanceToSegment(point: Vec, a: Vec, b: Vec): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSquared = dx * dx + dy * dy
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared))
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy))
}
function lineDistance(a: Vec[], b: Vec[]): number {
  let best = Infinity
  for (const [from, to] of [[a, b], [b, a]] as const) {
    for (const point of from) for (let at = 1; at < to.length; at += 1) best = Math.min(best, distanceToSegment(point, to[at - 1], to[at]))
  }
  return best
}
const round = (value: number) => Math.round(value * 1e4) / 1e4

describe.skipIf(MODE !== 'before' && MODE !== 'after')('홀자 줄기 끝점 = 보선 G2 전수', () => {
  beforeAll(() => {
    const memory = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => memory.set(key, value), removeItem: (key: string) => memory.delete(key) })
  })
  afterAll(() => { vi.unstubAllGlobals() })

  it(`11,172자 — ${MODE}`, async () => {
    const [exportUtils, generator, deltaStore, exportStore] = await Promise.all([
      import('../src/services/fontExportUtils'), import('../src/services/fontGenerator'), import('./layoutDeltaStore'), import('./fontExportStore'),
    ])
    const placementOf = exportStore.placementResolverOf(MODEL, deltaStore.layoutDeltaSnapshot())
    const out: Record<string, unknown> = {}
    let missing = 0
    let schemaFallback = 0
    let mergeFailures = 0
    const started = Date.now()
    // `CENSUS_LIMIT`: 앞에서 이만큼만(미리 돌려 보기).
    const last = process.env.CENSUS_LIMIT ? 0xac00 + Number(process.env.CENSUS_LIMIT) - 1 : 0xd7a3
    for (let code = 0xac00; code <= last; code += 1) {
      const char = String.fromCharCode(code)
      let data
      try { data = exportUtils.collectGlyphDataWithPlacement(char, placementOf) } catch (error) { out[char] = { error: String(error) }; missing += 1; continue }
      if (!data) { out[char] = { error: 'no data' }; missing += 1; continue }
      if (data.placementKind !== 'boxes') schemaFallback += 1
      let merge = true
      try { generator.glyphDataToFontContours(data) } catch { merge = false; mergeFailures += 1 }
      const strokes = data.strokes.map((item) => ({
        part: (item.beakGroup ?? '').split(':')[0],
        id: item.stroke.id,
        half: item.stroke.thickness * data.weightMultiplier / 2,
        line: flattenStrokeCenterline(item.stroke, item.box),
      }))
      let gap = Infinity
      for (let i = 0; i < strokes.length; i += 1) for (let j = i + 1; j < strokes.length; j += 1) {
        if (strokes[i].part === strokes[j].part) continue
        gap = Math.min(gap, lineDistance(strokes[i].line, strokes[j].line) - strokes[i].half - strokes[j].half)
      }
      // 잉크(중심선 ± 반폭)가 몸 밖으로 나간 가장 큰 양. 0이면 안.
      let outside = 0
      for (const stroke of strokes) for (const point of stroke.line) {
        outside = Math.max(outside, BODY.left - (point.x - stroke.half), (point.x + stroke.half) - BODY.right, BODY.top - (point.y - stroke.half), (point.y + stroke.half) - BODY.bottom)
      }
      out[char] = {
        placement: data.placementKind, merge, gap: round(gap), outside: round(outside),
        strokes: strokes.map((stroke) => ({ part: stroke.part, id: stroke.id, half: round(stroke.half), line: stroke.line.map((point) => [round(point.x), round(point.y)]) })),
      }
    }
    writeFileSync(process.env.CENSUS_OUT ?? `/tmp/medial-endpoint-${MODE}.json`, JSON.stringify(out))
    console.info(`${MODE}: 글자 ${Object.keys(out).length} · 못 만듦 ${missing} · 스키마 폴백 ${schemaFallback} · 합치기 실패 ${mergeFailures} · ${Math.round((Date.now() - started) / 1000)}s`)
    expect(Object.keys(out)).toHaveLength(last - 0xac00 + 1)
  }, 3_600_000)
})
