import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
// opentype.js는 이 저장소에서 별도 타입 선언 없이 사용한다.
// @ts-expect-error opentype.js에 타입 정의 파일 없음
import opentype from 'opentype.js'
import { FinalInkRenderer } from '../src/renderers/FinalInkRenderer'
import {
  canonicalizeInkRegions,
  finalGlyphInkToSvgPath,
  materializeFinalGlyphInk,
  projectFinalGlyphInkToFontContours,
  type FinalGlyphInk,
} from '../src/services/finalGlyphInk'
import { createGridCellId, createJamoRoleMasterId } from '../src/services/jamoConstruction'
import { createBasePartGrid } from '../src/services/railGridResolver'
import { resolveShapeGlyphInkPrimitives } from '../src/services/shapeGlyphInkResolver'
import type { DeepReadonly, GridCellRef, InkPoint, InkRegion, JamoConstructionElement, RoleConstructionScope, StrokeRenderStyle } from '../src/types'

let buildFinalRegionPrototypeFontBuffer: typeof import('../src/services/fontGenerator')['buildFinalRegionPrototypeFontBuffer']

interface OpenTypeCommand {
  type: 'M' | 'L' | 'C' | 'Q' | 'Z'
  x?: number
  y?: number
}

interface OpenTypeFont {
  charToGlyph(char: string): { path: { commands: OpenTypeCommand[] }; advanceWidth: number }
}

function contourArea(contour: readonly Readonly<{ x: number; y: number }>[]): number {
  return contour.reduce((sum, point, index) => {
    const next = contour[(index + 1) % contour.length]
    return sum + point.x * next.y - next.x * point.y
  }, 0) / 2
}

const INK: FinalGlyphInk = {
  regions: [{
    outer: [
      { x: 0.1, y: 0.1 }, { x: 0.1, y: 0.9 },
      { x: 0.9, y: 0.9 }, { x: 0.9, y: 0.1 },
    ],
    holes: [[
      { x: 0.3, y: 0.3 }, { x: 0.7, y: 0.3 },
      { x: 0.7, y: 0.7 }, { x: 0.3, y: 0.7 },
    ]],
  }],
}

const ROUND_STYLE: StrokeRenderStyle = { mode: 'brush', brush: { tip: 'round', aspectRatio: 1, angle: 0 } }
const MATERIALIZATION_OPTIONS = { unitsPerEm: 1000, maxCurveErrorFontUnits: 0.5 } as const

function createIeungScope(withCenterline = false): RoleConstructionScope {
  const grid = createBasePartGrid({
    role: 'CH',
    xCorePositions: { 'outer-left': 0.1, 'inner-left': 0.3, 'center-x': 0.5, 'inner-right': 0.7, 'outer-right': 0.9 },
    yCorePositions: { 'outer-top': 0.1, 'inner-top': 0.3, 'center-y': 0.5, 'inner-bottom': 0.7, 'outer-bottom': 0.9 },
    snapStep: 0.025,
    minGap: 0.1,
  })
  const masterId = createJamoRoleMasterId('ㅇ', 'CH')
  const elementId = 'area:ieung-ring'
  const cells: GridCellRef[] = []
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      if (row > 0 && row < 3 && column > 0 && column < 3) continue
      const bounds = {
        leftRailId: grid.xRails[column].id,
        rightRailId: grid.xRails[column + 1].id,
        topRailId: grid.yRails[row].id,
        bottomRailId: grid.yRails[row + 1].id,
      }
      cells.push({
        id: createGridCellId({ masterId, channel: 'main', elementId, ...bounds }),
        ...bounds,
      })
    }
  }
  const elements: JamoConstructionElement[] = [{ id: elementId, kind: 'area', filledCells: cells, boundaryTreatments: [] }]
  if (withCenterline) elements.push({
    id: 'centerline:ieung-hole',
    kind: 'centerline',
    closed: false,
    thickness: 0.08,
    anchors: [
      {
        id: 'anchor:hole-left',
        point: { id: 'point:hole-left', xRailId: grid.xRails[0].id, yRailId: grid.yRails[2].id },
      },
      {
        id: 'anchor:hole-right',
        point: { id: 'point:hole-right', xRailId: grid.xRails[4].id, yRailId: grid.yRails[2].id },
      },
    ],
  })
  return {
    schema: 'role-construction',
    version: 1,
    grid,
    masters: [{
      id: masterId,
      jamoId: 'ㅇ',
      role: 'CH',
      construction: { channels: { main: { role: 'CH', gridId: grid.id, elements } } },
    }],
  }
}

function pointInRing(target: InkPoint, ring: readonly InkPoint[]): boolean {
  let inside = false
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const current = ring[index]
    const prior = ring[previous]
    if ((current.y > target.y) !== (prior.y > target.y)
      && target.x < (prior.x - current.x) * (target.y - current.y) / (prior.y - current.y) + current.x) inside = !inside
  }
  return inside
}

function isFilled(target: InkPoint, regions: readonly DeepReadonly<InkRegion>[]): boolean {
  return regions.flatMap((region) => [region.outer, ...region.holes])
    .filter((ring) => pointInRing(target, ring)).length % 2 === 1
}

describe('Shape final ink SVG/OTF 공통 소비자', () => {
  it('두 소비자가 final regions 이후 Boolean·획 확장을 다시 호출하지 않는다', () => {
    const renderer = readFileSync(new URL('../src/renderers/FinalInkRenderer.tsx', import.meta.url), 'utf8')
    const generator = readFileSync(new URL('../src/services/fontGenerator.ts', import.meta.url), 'utf8')
    const finalGlyphBody = generator.slice(
      generator.indexOf('function createFinalRegionGlyph'),
      generator.indexOf('export function buildFinalRegionPrototypeFontBuffer'),
    )
    expect(renderer).not.toMatch(/unionInkRegions|strokeToRenderInkGroups|strokeToContours/)
    expect(finalGlyphBody).toContain('projectFinalGlyphInkToFontContours')
    expect(finalGlyphBody).not.toMatch(/unionInkRegions|mergeStrokeContourGroupsForCff|strokeToContours|strokeToBrushInkGroups|strokeToRenderInkGroups/)
  })

  it('서로 떨어진 region·복수 hole의 입력 순서와 ring 시작점에 무관하게 canonical하다', () => {
    const second = {
      outer: [{ x: 1.1, y: 0.1 }, { x: 1.1, y: 0.9 }, { x: 1.9, y: 0.9 }, { x: 1.9, y: 0.1 }],
      holes: [
        [{ x: 1.2, y: 0.2 }, { x: 1.4, y: 0.2 }, { x: 1.4, y: 0.4 }, { x: 1.2, y: 0.4 }],
        [{ x: 1.6, y: 0.6 }, { x: 1.8, y: 0.6 }, { x: 1.8, y: 0.8 }, { x: 1.6, y: 0.8 }],
      ],
    }
    const rotate = <T,>(items: readonly T[], offset: number) => [...items.slice(offset), ...items.slice(0, offset)]
    const expected = canonicalizeInkRegions([INK.regions[0], second])
    for (let index = 0; index < 10; index += 1) {
      const first = { ...INK.regions[0], outer: rotate(INK.regions[0].outer, index % 4) }
      const shifted = {
        outer: rotate(second.outer, (index + 1) % 4),
        holes: [...second.holes].reverse().map((hole, holeIndex) => rotate(hole, (index + holeIndex) % 4)),
      }
      expect(canonicalizeInkRegions(index % 2 ? [shifted, first] : [first, shifted])).toEqual(expected)
    }
  })

  beforeAll(async () => {
    const values = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value) },
      removeItem: (key: string) => { values.delete(key) },
    })
    ;({ buildFinalRegionPrototypeFontBuffer } = await import('../src/services/fontGenerator'))
  })

  afterAll(() => vi.unstubAllGlobals())

  it('SVG는 공통 regions를 한 evenodd path로만 직렬화한다', () => {
    const frozen = JSON.stringify(INK)
    const markup = renderToStaticMarkup(
      <FinalInkRenderer ink={INK} size={240} fillColor="#123456" />,
    )
    expect(markup.match(/<path\b/g)).toHaveLength(1)
    expect(markup).toContain(`d="${finalGlyphInkToSvgPath(INK)}"`)
    expect(markup).toContain('fill="#123456"')
    expect(markup).toContain('fill-rule="evenodd"')
    expect(markup).toContain('clip-rule="evenodd"')
    expect(JSON.stringify(INK)).toBe(frozen)
  })

  it('실제 OTF는 같은 regions에 origin/slant/UPM 투영만 적용한다', () => {
    const frozen = JSON.stringify(INK)
    const options = { upm: 1000, ascender: 880, slant: 8, originX: 0.05 }
    const expectedContours = projectFinalGlyphInkToFontContours(INK, options)
    const buffer = buildFinalRegionPrototypeFontBuffer({
      unicode: 'ㅇ'.charCodeAt(0),
      char: 'ㅇ',
      advanceWidth: 900,
      finalInk: INK,
      originX: options.originX,
      slant: options.slant,
    })
    const font = opentype.parse(buffer) as OpenTypeFont
    const glyph = font.charToGlyph('ㅇ')
    const expectedCommands = expectedContours.flatMap((contour) => [
      { type: 'M', x: contour[0].x, y: contour[0].y },
      ...contour.slice(1).map((point) => ({ type: 'L', x: point.x, y: point.y })),
      { type: 'Z' },
    ])
    expect(glyph.path.commands.map(({ type, x, y }) => ({
      type,
      ...(x === undefined ? {} : { x }),
      ...(y === undefined ? {} : { y }),
    }))).toEqual(expectedCommands)
    expect(glyph.advanceWidth).toBe(900)
    expect(JSON.stringify(INK)).toBe(frozen)
  })

  it('실제 Shape ㅇ source를 resolver부터 SVG와 parsed OTF까지 한 번에 연결한다', () => {
    const source = createIeungScope()
    const masterId = createJamoRoleMasterId('ㅇ', 'CH')
    const primitives = resolveShapeGlyphInkPrimitives({
      source,
      masterId,
      glyphId: 'ㅇ',
      part: 'CH',
      slot: { x: 0, y: 0, width: 1, height: 1 },
      weightMultiplier: 1,
    })
    expect(primitives.ok).toBe(true)
    if (!primitives.ok) return
    const final = materializeFinalGlyphInk(primitives.primitives, ROUND_STYLE, MATERIALIZATION_OPTIONS)
    expect(final.ok).toBe(true)
    if (!final.ok) return
    expect(final.ink.regions).toHaveLength(1)
    expect(final.ink.regions[0].holes).toHaveLength(1)
    const markup = renderToStaticMarkup(<FinalInkRenderer ink={final.ink} />)
    expect(markup).toContain(`d="${finalGlyphInkToSvgPath(final.ink)}"`)
    const buffer = buildFinalRegionPrototypeFontBuffer({
      unicode: 'ㅇ'.charCodeAt(0), char: 'ㅇ', advanceWidth: 1000,
      finalInk: final.ink, originX: 0, slant: 0,
    })
    const font = opentype.parse(buffer) as OpenTypeFont
    const commands = font.charToGlyph('ㅇ').path.commands
    const projected = projectFinalGlyphInkToFontContours(final.ink, { upm: 1000, ascender: 880, slant: 0, originX: 0 })
    expect(contourArea(projected[0])).toBeGreaterThan(0)
    expect(contourArea(projected[1])).toBeLessThan(0)
    expect(commands.filter(({ type }) => type === 'M')).toHaveLength(2)
    expect(commands.filter(({ type }) => type === 'Z')).toHaveLength(2)
  })

  it('실제 ㅇ hole을 지나는 중심선도 SVG와 parsed OTF에서 같은 2개 hole로 남긴다', () => {
    const source = createIeungScope(true)
    const primitives = resolveShapeGlyphInkPrimitives({
      source,
      masterId: createJamoRoleMasterId('ㅇ', 'CH'),
      glyphId: 'ㅇ',
      part: 'CH',
      slot: { x: 0, y: 0, width: 1, height: 1 },
      weightMultiplier: 1,
    })
    if (!primitives.ok) throw new Error(primitives.issues[0]?.message)
    const final = materializeFinalGlyphInk(primitives.primitives, ROUND_STYLE, MATERIALIZATION_OPTIONS)
    if (!final.ok) throw new Error(final.message)
    expect(final.ink.regions[0].holes).toHaveLength(2)
    expect(isFilled({ x: 0.5, y: 0.5 }, final.ink.regions)).toBe(true)
    expect(isFilled({ x: 0.5, y: 0.4 }, final.ink.regions)).toBe(false)
    const markup = renderToStaticMarkup(<FinalInkRenderer ink={final.ink} />)
    expect(markup).toContain(`d="${finalGlyphInkToSvgPath(final.ink)}"`)
    const buffer = buildFinalRegionPrototypeFontBuffer({
      unicode: 'ㅇ'.charCodeAt(0), char: 'ㅇ', advanceWidth: 1000,
      finalInk: final.ink, originX: 0, slant: 0,
    })
    const commands = (opentype.parse(buffer) as OpenTypeFont).charToGlyph('ㅇ').path.commands
    expect(commands.filter(({ type }) => type === 'M')).toHaveLength(3)
    expect(commands.filter(({ type }) => type === 'Z')).toHaveLength(3)
  })

  it('투영 뒤 소실되는 미소 ring과 잘못된 옵션을 fail-loud 처리한다', () => {
    expect(() => projectFinalGlyphInkToFontContours(INK, { upm: 0, ascender: 880, slant: 0 })).toThrow()
    const tiny: FinalGlyphInk = {
      regions: [{ outer: [{ x: 0, y: 0 }, { x: 0.0001, y: 0 }, { x: 0, y: 0.0001 }], holes: [] }],
    }
    expect(() => projectFinalGlyphInkToFontContours(tiny, { upm: 1000, ascender: 880, slant: 0 })).toThrow()
    const windingFlip: FinalGlyphInk = {
      regions: [{
        outer: [
          { x: 0.5013503119, y: 0.5002258173 },
          { x: 0.5005691775, y: 0.4987436251 },
          { x: 0.5019701736, y: 0.5014397861 },
        ],
        holes: [],
      }],
    }
    expect(() => projectFinalGlyphInkToFontContours(windingFlip, { upm: 1000, ascender: 880, slant: 0 }))
      .toThrow(/winding/)
  })

  it('OTF ingress에서 빈 면·잘못된 winding·char/unicode 불일치를 거부한다', () => {
    const base = {
      unicode: 'ㅇ'.charCodeAt(0),
      char: 'ㅇ',
      advanceWidth: 900,
      originX: 0,
      slant: 0,
    }
    expect(() => buildFinalRegionPrototypeFontBuffer({ ...base, finalInk: { regions: [] } })).toThrow(/비어/)
    expect(() => buildFinalRegionPrototypeFontBuffer({
      ...base,
      finalInk: { regions: [{ outer: [...INK.regions[0].outer].reverse(), holes: [] }] },
    })).toThrow(/시계 방향/)
    expect(() => buildFinalRegionPrototypeFontBuffer({ ...base, unicode: 'ㄱ'.charCodeAt(0), finalInk: INK })).toThrow(/일치/)
  })
})
