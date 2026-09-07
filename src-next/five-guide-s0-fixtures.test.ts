import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { finalGlyphInkToSvgPath, materializeFinalGlyphInk } from '../src/services/finalGlyphInk'
import { createJamoRoleMasterId } from '../src/services/jamoConstruction'
import { createLayoutGridSystemFromSchemas } from '../src/services/layoutGridConnectionV1'
import { parseRoleConstructionSourceV1 } from '../src/services/roleConstructionSourceV1'
import { resolveShapeGlyphInkPrimitives } from '../src/services/shapeGlyphInkResolver'
import { createFiveGuideShapeFixtureV0 } from '../src/test/fixtures/five-guide-square-p0/shape-source-v0'
import manifest from '../src/test/fixtures/five-guide-square-p0/manifest.json'
import xBaseline from '../src/test/fixtures/five-guide-square-p0/x-baseline-52a5c3f.json'
import type { LayoutSchema, LayoutType, Part, SharedLayoutType } from '../src/types'
import { BASE_PRESETS_SCHEMAS, calculateBoxes } from '../src/utils/layoutCalculator'

const CONTEXTS: Record<LayoutType, { char: string; cho: string; jung: string; jong: string }> = {
  'choseong-only': { char: 'ㄱ', cho: 'ㄱ', jung: '', jong: '' },
  'jungseong-vertical-only': { char: 'ㅏ', cho: '', jung: 'ㅏ', jong: '' },
  'jungseong-horizontal-only': { char: 'ㅗ', cho: '', jung: 'ㅗ', jong: '' },
  'jungseong-mixed-only': { char: 'ㅘ', cho: '', jung: 'ㅘ', jong: '' },
  'choseong-jungseong-vertical': { char: '가', cho: 'ㄱ', jung: 'ㅏ', jong: '' },
  'choseong-jungseong-horizontal': { char: '고', cho: 'ㄱ', jung: 'ㅗ', jong: '' },
  'choseong-jungseong-mixed': { char: '과', cho: 'ㄱ', jung: 'ㅘ', jong: '' },
  'choseong-jungseong-vertical-jongseong': { char: '각', cho: 'ㄱ', jung: 'ㅏ', jong: 'ㄱ' },
  'choseong-jungseong-horizontal-jongseong': { char: '곡', cho: 'ㄱ', jung: 'ㅗ', jong: 'ㄱ' },
  'choseong-jungseong-mixed-jongseong': { char: '곽', cho: 'ㄱ', jung: 'ㅘ', jong: 'ㄱ' },
}

const STANDALONE_LAYOUTS = new Set<LayoutType>([
  'jungseong-vertical-only',
  'jungseong-horizontal-only',
  'jungseong-mixed-only',
])

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (!value || typeof value !== 'object') return JSON.stringify(value)
  return `{${Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(',')}}`
}

function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex')
}

function collectRawX() {
  const connected = createLayoutGridSystemFromSchemas(BASE_PRESETS_SCHEMAS)
  expect(connected.ok).toBe(true)
  if (!connected.ok) throw new Error(connected.message)
  const xRails = connected.source.grid.xRails.map(({ id, position }) => ({
    id,
    value: position.kind === 'absolute' ? position.value : null,
  }))
  const xRailIds = new Set(xRails.map(({ id }) => id))
  const bindings = Object.fromEntries(Object.entries(connected.source.bindings).map(([layoutType, binding]) => [
    layoutType,
    {
      splitRailIds: Object.fromEntries(
        Object.entries(binding.splitRailIds).filter(([, railId]) => xRailIds.has(railId)),
      ),
      partEdges: Object.fromEntries(Object.entries(binding.partEdgeRailIds).map(([part, edges]) => [part, {
        left: edges!.left,
        right: edges!.right,
      }])),
    },
  ])) as Record<SharedLayoutType, unknown>
  return { xRails, bindings }
}

function collectEffectiveX() {
  const padding = { top: .075, right: .075, bottom: .075, left: .075 }
  const entries = Object.entries(CONTEXTS).map(([layoutType, context]) => {
    const schema = structuredClone(BASE_PRESETS_SCHEMAS[layoutType as LayoutType]) as LayoutSchema
    const boxes = calculateBoxes({ ...schema, padding, designBodyPadding: padding }, context)
    if (STANDALONE_LAYOUTS.has(layoutType as LayoutType)) return [layoutType, { context, boxes }]
    const parts = Object.fromEntries(Object.entries(boxes).map(([part, box]) => [part, {
      x: box!.x,
      width: box!.width,
    }])) as Partial<Record<Part, { x: number; width: number }>>
    return [layoutType, { context, parts }]
  })
  const all = Object.fromEntries(entries) as Record<LayoutType, unknown>
  return {
    sharedLayouts: Object.fromEntries(Object.entries(all).filter(([layoutType]) => !STANDALONE_LAYOUTS.has(layoutType as LayoutType))),
    standaloneLayouts: Object.fromEntries(Object.entries(all).filter(([layoutType]) => STANDALONE_LAYOUTS.has(layoutType as LayoutType))),
  }
}

function finalOutput(jamoId: 'ㄱ' | 'ㅁ') {
  const fixture = createFiveGuideShapeFixtureV0()
  const resolved = resolveShapeGlyphInkPrimitives({
    source: fixture.roleSources.STANDALONE,
    masterId: createJamoRoleMasterId(jamoId, 'STANDALONE'),
    glyphId: jamoId,
    part: 'CH',
    slot: { x: 0, y: 0, width: 1, height: 1 },
    weightMultiplier: 1,
    globalLinecap: 'round',
    globalLinejoin: 'round',
  })
  expect(resolved.ok).toBe(true)
  if (!resolved.ok) throw new Error(resolved.issues[0]?.message)
  const final = materializeFinalGlyphInk(
    resolved.primitives,
    { mode: 'brush', brush: { tip: 'round', aspectRatio: 1, angle: 0 } },
    { unitsPerEm: 1000, maxCurveErrorFontUnits: .5 },
  )
  expect(final.ok).toBe(true)
  if (!final.ok) throw new Error(final.message)
  return { ink: final.ink, svgPath: finalGlyphInkToSvgPath(final.ink) }
}

describe('S0 기준 동결 fixture', () => {
  it('현재 raw X seed와 effective X/width를 고정 baseline과 exact 비교한다', () => {
    expect(canonical(collectRawX())).toBe(canonical(xBaseline.raw))
    expect(canonical(collectEffectiveX())).toBe(canonical(xBaseline.effective))
  })

  it('X와 Shape source 파일 hash가 manifest provenance와 일치한다', () => {
    const xFile = readFileSync(new URL('../src/test/fixtures/five-guide-square-p0/x-baseline-52a5c3f.json', import.meta.url))
    const shapeFile = readFileSync(new URL('../src/test/fixtures/five-guide-square-p0/shape-source-v0.ts', import.meta.url))
    expect(sha256(xFile)).toBe(manifest.xBaseline.sha256)
    expect(sha256(shapeFile)).toBe(manifest.shapeFixture.sourceFileSha256)
  })

  it('역할별 Shape fixture는 strict source이고 canonical hash가 고정된다', () => {
    const fixture = createFiveGuideShapeFixtureV0()
    expect(Object.isFrozen(fixture)).toBe(true)
    expect(fixture.roleOrder).toEqual(['STANDALONE', 'CH', 'JU_VERTICAL', 'JU_HORIZONTAL', 'JU_H', 'JU_V', 'JO'])
    for (const role of fixture.roleOrder) expect(parseRoleConstructionSourceV1(fixture.roleSources[role]).ok).toBe(true)
    expect(sha256(canonical(fixture))).toBe(manifest.shapeFixture.canonicalJsonSha256)

    const standalone = fixture.roleSources.STANDALONE
    const mieum = standalone.masters.find(({ id }) => id === createJamoRoleMasterId('ㅁ', 'STANDALONE'))
    const area = mieum?.construction.channels.main?.elements[0]
    expect(area?.kind).toBe('area')
    if (area?.kind !== 'area') throw new Error('ㅁ area fixture가 필요합니다.')
    expect(area.filledCells).toHaveLength(12)
  })

  it.each(['ㄱ', 'ㅁ'] as const)('%s FinalGlyphInk와 SVG signature를 고정한다', (jamoId) => {
    expect(sha256(canonical(finalOutput(jamoId)))).toBe(manifest.outputSignatures[jamoId])
  })
})
