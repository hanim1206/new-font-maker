import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { flattenStrokeCenterline } from '../src/services/brushGeometry'
import type { StemMaster } from '../src/services/stemMaster'
import type { NotoPresetModelBundle } from './notoPresetGlyphs'

/**
 * 홀자 줄기 마스터 G2 집계. 11,172자를 화면 · 추출과 같은 상자(모델 상자 + 배치 Δ)로 놓고
 * 마스터 없을 때와 휜 마스터 다섯을 걸었을 때, 자소끼리 잉크 간격이 0 아래(닿음)인 글자 수를 견준다.
 * 오래 걸려서 `STEM_MASTER_CENSUS=1`일 때만 돈다: `STEM_MASTER_CENSUS=1 npx vitest run src-next/stem-master-census.test.ts`
 */

const MODEL = JSON.parse(readFileSync(fileURLToPath(new URL('../public/noto-preset/model.json', import.meta.url)), 'utf8')) as NotoPresetModelBundle

/** 눈에 띄게 휜 마스터 다섯. 기둥은 스토어 테스트와 같은 값, 나머지는 같은 크기로 휜다. */
const BENT: StemMaster[] = [
  { name: 'gidung', points: [{ t: 0, o: 0, handleOut: { t: 0.4, o: 0.03 } }, { t: 1, o: 0, handleIn: { t: 0.7, o: -0.01 } }] },
  { name: 'gyeotjulgi', points: [{ t: 0, o: 0, handleOut: { t: 0.35, o: 0.02 } }, { t: 1, o: 0, handleIn: { t: 0.65, o: 0.02 } }] },
  { name: 'jjalbeungidung', points: [{ t: 0, o: 0, handleOut: { t: 0.35, o: 0.02 } }, { t: 1, o: 0, handleIn: { t: 0.65, o: 0.02 } }] },
  { name: 'bo', points: [{ t: 0, o: 0, handleOut: { t: 0.4, o: 0.03 } }, { t: 1, o: 0, handleIn: { t: 0.7, o: -0.01 } }] },
  { name: 'geolchim', points: [{ t: 0, o: 0, handleOut: { t: 0.35, o: 0.02 } }, { t: 1, o: 0, handleIn: { t: 0.65, o: 0.02 } }] },
]

type Vec = { x: number; y: number }
function distanceToSegment(point: Vec, a: Vec, b: Vec): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSquared = dx * dx + dy * dy
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared))
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy))
}
/** 두 중심선 사이 최소 거리. 꼭짓점 → 상대 선분을 양쪽으로 잰다(곡선은 잘게 펴져 있어 충분하다). */
function lineDistance(a: Vec[], b: Vec[]): number {
  let best = Infinity
  for (const [from, to] of [[a, b], [b, a]] as const) {
    for (const point of from) for (let at = 1; at < to.length; at += 1) best = Math.min(best, distanceToSegment(point, to[at - 1], to[at]))
  }
  return best
}

describe.skipIf(!process.env.STEM_MASTER_CENSUS)('홀자 줄기 마스터 G2 집계', () => {
  beforeAll(() => {
    const memory = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => memory.set(key, value), removeItem: (key: string) => memory.delete(key) })
  })
  afterAll(() => { vi.unstubAllGlobals() })

  it('11,172자 — 마스터 전후 닿는 글자 수 · 스키마 폴백 · 합치기 실패', async () => {
    const [exportUtils, generator, deltaStore, exportStore, masterStore] = await Promise.all([
      import('../src/services/fontExportUtils'), import('../src/services/fontGenerator'), import('./layoutDeltaStore'),
      import('./fontExportStore'), import('../src/stores/stemMasterStore'),
    ])

    /** 글자마다 서로 다른 자소 사이 최소 잉크 간격(em). 간격 = 중심선 거리 − 두 획 반폭. */
    const survey = () => {
      const placementOf = exportStore.placementResolverOf(MODEL, deltaStore.layoutDeltaSnapshot())
      const gaps = new Map<string, number>()
      const shapes = new Map<string, string>()
      let schemaFallback = 0
      let mergeFailures = 0
      for (let code = 0xac00; code <= 0xd7a3; code += 1) {
        const char = String.fromCharCode(code)
        const data = exportUtils.collectGlyphDataWithPlacement(char, placementOf)
        if (!data) continue
        if (data.placementKind !== 'boxes') schemaFallback += 1
        try { generator.glyphDataToFontContours(data) } catch { mergeFailures += 1 }
        const sources = data.strokes.map((item) => ({
          part: (item.beakGroup ?? '').split(':')[0],
          half: item.stroke.thickness * data.weightMultiplier / 2,
          line: flattenStrokeCenterline(item.stroke, item.box),
        }))
        let gap = Infinity
        for (let i = 0; i < sources.length; i += 1) for (let j = i + 1; j < sources.length; j += 1) {
          if (sources[i].part === sources[j].part) continue
          gap = Math.min(gap, lineDistance(sources[i].line, sources[j].line) - sources[i].half - sources[j].half)
        }
        gaps.set(char, gap)
        shapes.set(char, JSON.stringify(data.strokes.map((item) => [item.stroke.points, item.box])))
      }
      return { gaps, shapes, schemaFallback, mergeFailures }
    }

    const before = survey()
    for (const master of BENT) masterStore.useStemMasterStore.getState().setMaster(master)
    try {
      const after = survey()
      const chars = [...before.gaps.keys()]
      const touching = (gaps: Map<string, number>) => chars.filter((char) => gaps.get(char)! < 0)
      const changed = chars.filter((char) => before.shapes.get(char) !== after.shapes.get(char))
      const newlyTouching = chars.filter((char) => before.gaps.get(char)! >= 0 && after.gaps.get(char)! < 0)
      const freed = chars.filter((char) => before.gaps.get(char)! < 0 && after.gaps.get(char)! >= 0)
      const worst = [...changed].sort((a, b) => (after.gaps.get(a)! - before.gaps.get(a)!) - (after.gaps.get(b)! - before.gaps.get(b)!)).slice(0, 12)
      console.info([
        `글자 ${chars.length} · 마스터로 모양이 바뀐 글자 ${changed.length}`,
        `닿는 글자 ${touching(before.gaps).length} → ${touching(after.gaps).length} (새로 닿음 ${newlyTouching.length} · 떨어짐 ${freed.length})`,
        `스키마 폴백 ${before.schemaFallback} → ${after.schemaFallback} · 합치기 실패 ${before.mergeFailures} → ${after.mergeFailures}`,
        `간격이 가장 많이 준 글자: ${worst.map((char) => `${char} ${(before.gaps.get(char)! * 1000).toFixed(0)}→${(after.gaps.get(char)! * 1000).toFixed(0)}`).join(' · ')} (1/1000 em)`,
        `새로 닿은 예: ${newlyTouching.slice(0, 40).join('')}`,
      ].join('\n'))
      expect(changed.length).toBeGreaterThan(0)
      expect(after.schemaFallback).toBe(0)
      expect(after.mergeFailures).toBe(0)
    } finally {
      for (const master of BENT) masterStore.useStemMasterStore.getState().resetMaster(master.name)
    }
  }, 1_800_000)
})
