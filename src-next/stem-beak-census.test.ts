import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { flattenStrokeCenterline } from '../src/services/brushGeometry'
import { stemBeakInkGroups } from '../src/services/stemBeak'
import type { NotoPresetModelBundle } from './notoPresetGlyphs'

/**
 * 세로줄기 부리 G2 집계. 11,172자를 화면 · 추출과 같은 상자(모델 상자 + 배치 Δ)로 놓고
 * 부리가 몇 개 붙는지, 그 부리가 다른 자소의 잉크에 닿는 글자가 몇인지 센다.
 * 오래 걸려서 `STEM_BEAK_CENSUS=1`일 때만 돈다: `STEM_BEAK_CENSUS=1 npx vitest run src-next/stem-beak-census.test.ts`
 */

const MODEL = JSON.parse(readFileSync(fileURLToPath(new URL('../public/noto-preset/model.json', import.meta.url)), 'utf8')) as NotoPresetModelBundle
const EDGE_SAMPLES = 6

type Vec = { x: number; y: number }
function distanceToLine(point: Vec, a: Vec, b: Vec): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSquared = dx * dx + dy * dy
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared))
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy))
}

describe.skipIf(!process.env.STEM_BEAK_CENSUS)('세로줄기 부리 G2 집계', () => {
  beforeAll(() => {
    const memory = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => memory.set(key, value), removeItem: (key: string) => memory.delete(key) })
  })
  afterAll(() => { vi.unstubAllGlobals() })

  it('11,172자', async () => {
    const [exportUtils, generator, deltaStore, exportStore, style] = await Promise.all([
      import('../src/services/fontExportUtils'), import('../src/services/fontGenerator'), import('./layoutDeltaStore'), import('./fontExportStore'), import('../src/stores/globalStyleStore'),
    ])
    const sizes = [1, 2] as const
    const report: string[] = []
    for (const size of sizes) {
      style.useGlobalStyleStore.getState().setStemBeak({ enabled: true, size, angle: 25 })
      const placementOf = exportStore.placementResolverOf(MODEL, deltaStore.layoutDeltaSnapshot())
      let glyphsWithBeak = 0
      let beaks = 0
      let touching = 0
      let schemaFallback = 0
      let mergeFailures = 0
      const examples: string[] = []
      // 부리를 낳은 자소(CH · JU · JU_H · JU_V · JO)별로, 다른 자소에 닿은 부리 수.
      const touchingByOwner = new Map<string, number>()
      const beaksByOwner = new Map<string, number>()
      for (let code = 0xac00; code <= 0xd7a3; code += 1) {
        const char = String.fromCharCode(code)
        const data = exportUtils.collectGlyphDataWithPlacement(char, placementOf)
        if (!data) continue
        if (data.placementKind !== 'boxes') schemaFallback += 1
        const sources = data.strokes.map((item, index) => ({ stroke: item.stroke, box: item.box, weightMultiplier: data.weightMultiplier, group: item.beakGroup ?? `stroke-${index}` }))
        const groups = stemBeakInkGroups(sources, data.stemBeak, data.strokeStyle)
        const count = groups.reduce((sum, group) => sum + group.length, 0)
        if (count === 0) continue
        glyphsWithBeak += 1
        beaks += count
        const lines = sources.map((source) => flattenStrokeCenterline(source.stroke, source.box))
        let hit = false
        groups.forEach((group, owner) => group.flat().forEach((contour) => {
          const ownerPart = sources[owner].group.split(':')[0]
          beaksByOwner.set(ownerPart, (beaksByOwner.get(ownerPart) ?? 0) + 1)
          let beakHit = false
          const probes = contour.flatMap((point, index) => {
            const next = contour[(index + 1) % contour.length]
            return Array.from({ length: EDGE_SAMPLES }, (_, step) => ({ x: point.x + (next.x - point.x) * step / EDGE_SAMPLES, y: point.y + (next.y - point.y) * step / EDGE_SAMPLES }))
          })
          sources.forEach((other, index) => {
            // 같은 자소의 같은 채널은 부리를 낳은 쪽이라 본다. 다른 자소 · 다른 채널의 잉크만 센다.
            if (index === owner || other.group === sources[owner].group) return
            const half = other.stroke.thickness * other.weightMultiplier / 2
            const line = lines[index]
            for (const probe of probes) for (let at = 1; at < line.length; at += 1) if (distanceToLine(probe, line[at - 1], line[at]) < half) { hit = true; beakHit = true; return }
          })
          if (beakHit) touchingByOwner.set(ownerPart, (touchingByOwner.get(ownerPart) ?? 0) + 1)
        }))
        if (hit) {
          touching += 1
          if (examples.length < 24 && (code - 0xac00) % 97 === 0 || examples.length < 8) examples.push(char)
        }
        if ((code - 0xac00) % 16 === 0) {
          try { generator.glyphDataToFontContours(data) } catch { mergeFailures += 1 }
        }
      }
      report.push(`크기 ${size}: 부리 붙은 글자 ${glyphsWithBeak} · 부리 ${beaks}개 · 다른 자소에 닿는 글자 ${touching} · 스키마로 떨어진 글자 ${schemaFallback} · 합치기 실패(1/16 표본) ${mergeFailures} · 자소별 닿은 부리/전체 ${[...beaksByOwner.keys()].sort().map((part) => `${part} ${touchingByOwner.get(part) ?? 0}/${beaksByOwner.get(part)}`).join(' · ')} · 예 ${examples.join('')}`)
      expect(glyphsWithBeak).toBeGreaterThan(0)
      expect(mergeFailures).toBe(0)
    }
    style.useGlobalStyleStore.getState().resetStyle()
    console.info(report.join('\n'))
  }, 900_000)
})
