import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { NotoPresetModelBundle } from './notoPresetGlyphs'
import { describe, expect, it, vi } from 'vitest'
import legacyJamos from '../src/data/fixtures/baseJamosLegacy2026-02.json'
import type { JamoData } from '../src/types'
import type { BoxConfig, StrokeDataV2 } from '../src/types'
import type { Contour } from '../src/services/strokeToOutline'
import { strokeToContours } from '../src/services/strokeToOutline'
import { mergeStrokeContourGroupsForCff } from '../src/services/contourBoolean'
import { normalizeClosedStrokePoints } from '../src/utils/strokePathUtils'


/** 이 파일의 교차부·구멍 검사는 옛 기본 획(2026-02) 골격을 전제한다. 다듬은 기본 획은 획 끝·교차 위치가 다르다. */
async function useLegacyJamos(): Promise<void> {
  const { useJamoStore } = await import('../src/stores/jamoStore')
  const legacy = legacyJamos as unknown as Record<'choseong' | 'jungseong' | 'jongseong', Record<string, JamoData>>
  useJamoStore.setState({ choseong: structuredClone(legacy.choseong), jungseong: structuredClone(legacy.jungseong), jongseong: structuredClone(legacy.jongseong) })
}

const UPM = 1000
const ASCENDER = 880
const STYLE = {
  weightMultiplier: 1,
  slant: 0,
  globalLinecap: 'butt' as const,
  globalLinejoin: 'round' as const,
  ascender: ASCENDER,
}

function contour(points: Array<[number, number]>): Contour {
  return points.map(([x, y]) => ({ x, y, onCurve: true }))
}

function pointInContour(target: { x: number; y: number }, ring: Contour): boolean {
  let inside = false
  for (let currentIndex = 0, previousIndex = ring.length - 1; currentIndex < ring.length; previousIndex = currentIndex++) {
    const current = ring[currentIndex]
    const previous = ring[previousIndex]
    const crosses = (current.y > target.y) !== (previous.y > target.y)
      && target.x < ((previous.x - current.x) * (target.y - current.y)) / (previous.y - current.y) + current.x
    if (crosses) inside = !inside
  }
  return inside
}

function evenOddFilled(target: { x: number; y: number }, contours: Contour[]): boolean {
  return contours.filter((ring) => pointInContour(target, ring)).length % 2 === 1
}

function contourSignedArea(ring: Contour): number {
  return ring.reduce((area, point, index) => {
    const next = ring[(index + 1) % ring.length]
    return area + point.x * next.y - next.x * point.y
  }, 0) / 2
}

function findEvenOverlapPoint(groups: Contour[][]): { x: number; y: number } | null {
  const points = groups.flat(2)
  const bounds = points.reduce((result, point) => ({
    minX: Math.min(result.minX, point.x),
    minY: Math.min(result.minY, point.y),
    maxX: Math.max(result.maxX, point.x),
    maxY: Math.max(result.maxY, point.y),
  }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity })
  for (let y = bounds.minY + 1; y < bounds.maxY; y += 3) {
    for (let x = bounds.minX + 1; x < bounds.maxX; x += 3) {
      const target = { x, y }
      const overlapCount = groups.filter((group) => evenOddFilled(target, group)).length
      if (overlapCount >= 2 && overlapCount % 2 === 0) return target
    }
  }
  return null
}

describe('CFF 컨투어 정규화와 겹침 제거', () => {
  it('닫힌 획의 중복 마지막 시작점을 제거하고 닫힘 핸들을 보존한다', () => {
    const points = [
      { x: 0, y: 0, handleOut: { x: 0.2, y: 0 } },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
      { x: 0, y: 0, handleIn: { x: 0, y: 0.2 } },
    ]
    const normalized = normalizeClosedStrokePoints(points, true)
    expect(normalized).toHaveLength(4)
    expect(normalized[0].handleIn).toEqual({ x: 0, y: 0.2 })
    expect(points).toHaveLength(5)
  })

  it('중복 시작점이 있는 닫힌 획과 없는 획이 같은 윤곽을 만든다', () => {
    const uniquePoints = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ]
    const box: BoxConfig = { x: 0.1, y: 0.1, width: 0.8, height: 0.8 }
    const unique: StrokeDataV2 = { id: 'square', points: uniquePoints, closed: true, thickness: 0.08 }
    const repeated: StrokeDataV2 = { ...unique, points: [...uniquePoints, { ...uniquePoints[0] }] }
    expect(strokeToContours(repeated, box, UPM, STYLE)).toEqual(strokeToContours(unique, box, UPM, STYLE))
  })

  it('교차하는 별도 획을 하나의 CFF 잉크 영역으로 합친다', () => {
    const vertical = contour([[40, 0], [60, 0], [60, 100], [40, 100]])
    const horizontal = contour([[0, 40], [100, 40], [100, 60], [0, 60]])
    expect(evenOddFilled({ x: 50, y: 50 }, [vertical, horizontal])).toBe(false)

    const merged = mergeStrokeContourGroupsForCff([[vertical], [horizontal]])
    expect(evenOddFilled({ x: 50, y: 50 }, merged)).toBe(true)
    expect(merged).toHaveLength(1)
  })

  it('레거시 CFF facade는 중복점으로 퇴화한 선행 링 뒤의 첫 유효 링을 유지한다', () => {
    const degenerate = contour([[0, 0], [0.0000001, 0], [0, 0.0000001]])
    const valid = contour([[0, 0], [0, 100], [100, 100], [100, 0]])
    expect(mergeStrokeContourGroupsForCff([[degenerate, valid]])).toEqual([valid])
  })

  it('실제 ㅂ의 세로·가로 획 교차부를 채운다', async () => {
    const memory = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => memory.set(key, value),
      removeItem: (key: string) => memory.delete(key),
    })
    const { collectGlyphDataForChar } = await import('../src/services/fontExportUtils')
    await useLegacyJamos()
    const glyph = collectGlyphDataForChar('ㅂ')
    if (!glyph) throw new Error('ㅂ 출력 데이터를 만들 수 없습니다.')
    const groups = glyph.strokes.map((resolved) => strokeToContours(resolved.stroke, resolved.box, UPM, {
      weightMultiplier: glyph.weightMultiplier,
      slant: glyph.slant,
      globalLinecap: resolved.effectiveLinecap,
      globalLinejoin: resolved.effectiveLinejoin,
      ascender: ASCENDER,
    }))
    const horizontal = glyph.strokes.find((item) => item.stroke.id === 'ㅂ-3')
    if (!horizontal) throw new Error('ㅂ 가로획을 찾을 수 없습니다.')
    const overlap = {
      x: horizontal.box.x * UPM,
      y: ASCENDER - (horizontal.box.y + 0.5 * horizontal.box.height) * UPM,
    }
    const rawContours = groups.flat()
    expect(evenOddFilled(overlap, rawContours)).toBe(false)
    expect(evenOddFilled(overlap, mergeStrokeContourGroupsForCff(groups))).toBe(true)
    vi.unstubAllGlobals()
  })

  it('실제 ㅇ의 중심 hole과 ring 잉크를 union 뒤에도 유지한다', async () => {
    const memory = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => memory.set(key, value),
      removeItem: (key: string) => memory.delete(key),
    })

    try {
      const { collectGlyphDataForChar } = await import('../src/services/fontExportUtils')
      await useLegacyJamos()
      const glyph = collectGlyphDataForChar('ㅇ')
      if (!glyph) throw new Error('ㅇ 출력 데이터를 만들 수 없습니다.')
      const circle = glyph.strokes.find((resolved) => resolved.stroke.closed)
      if (!circle) throw new Error('ㅇ 닫힌 원형 획을 찾을 수 없습니다.')

      const groups = glyph.strokes.map((resolved) => strokeToContours(resolved.stroke, resolved.box, UPM, {
        weightMultiplier: glyph.weightMultiplier,
        slant: glyph.slant,
        globalLinecap: resolved.effectiveLinecap,
        globalLinejoin: resolved.effectiveLinejoin,
        ascender: ASCENDER,
      }))
      const merged = mergeStrokeContourGroupsForCff(groups)
      const bounds = merged.flat().reduce((result, point) => ({
        minX: Math.min(result.minX, point.x),
        minY: Math.min(result.minY, point.y),
        maxX: Math.max(result.maxX, point.x),
        maxY: Math.max(result.maxY, point.y),
      }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity })
      const holeCenter = {
        x: (bounds.minX + bounds.maxX) / 2,
        y: (bounds.minY + bounds.maxY) / 2,
      }

      const anchor = circle.stroke.points[0]
      const ringY = ASCENDER - (circle.box.y + anchor.y * circle.box.height) * UPM
      const verticalCenter = ASCENDER - UPM / 2
      const ringPoint = {
        x: (circle.box.x + anchor.x * circle.box.width) * UPM
          + (ringY - verticalCenter) * Math.tan(glyph.slant * Math.PI / 180),
        y: ringY,
      }

      expect(evenOddFilled(holeCenter, merged)).toBe(false)
      expect(evenOddFilled(ringPoint, merged)).toBe(true)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('실제 ㅁ과 ㅎ의 내부 공간을 union 뒤에도 유지한다', async () => {
    const memory = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => memory.set(key, value),
      removeItem: (key: string) => memory.delete(key),
    })

    try {
      const { collectGlyphDataForChar } = await import('../src/services/fontExportUtils')
      await useLegacyJamos()
      for (const char of ['ㅁ', 'ㅎ']) {
        const glyph = collectGlyphDataForChar(char)
        if (!glyph) throw new Error(`${char} 출력 데이터를 만들 수 없습니다.`)
        const groups = glyph.strokes.map((resolved) => strokeToContours(resolved.stroke, resolved.box, UPM, {
          weightMultiplier: glyph.weightMultiplier,
          slant: glyph.slant,
          globalLinecap: resolved.effectiveLinecap,
          globalLinejoin: resolved.effectiveLinejoin,
          ascender: ASCENDER,
        }))
        const merged = mergeStrokeContourGroupsForCff(groups)
        const holes = merged.filter((ring) => contourSignedArea(ring) > 0)
        expect(holes.length, `${char} hole`).toBeGreaterThan(0)
        for (const hole of holes) {
          const center = hole.reduce((point, current) => ({
            x: point.x + current.x / hole.length,
            y: point.y + current.y / hole.length,
          }), { x: 0, y: 0 })
          expect(evenOddFilled(center, merged), `${char} hole center`).toBe(false)
        }
        expect(merged.some((ring) => contourSignedArea(ring) < 0), `${char} outer`).toBe(true)
      }
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('실제 ㅙ의 복합중성 교차부를 채운다', async () => {
    const { collectGlyphDataForChar } = await import('../src/services/fontExportUtils')
    await useLegacyJamos()
    const glyph = collectGlyphDataForChar('ㅙ')
    if (!glyph) throw new Error('ㅙ 출력 데이터를 만들 수 없습니다.')
    const groups = glyph.strokes.map((resolved) => strokeToContours(resolved.stroke, resolved.box, UPM, {
      weightMultiplier: glyph.weightMultiplier,
      slant: glyph.slant,
      globalLinecap: resolved.effectiveLinecap,
      globalLinejoin: resolved.effectiveLinejoin,
      ascender: ASCENDER,
    }))
    const overlap = findEvenOverlapPoint(groups)
    expect(overlap).not.toBeNull()
    expect(evenOddFilled(overlap!, groups.flat())).toBe(false)
    expect(evenOddFilled(overlap!, mergeStrokeContourGroupsForCff(groups))).toBe(true)
  })

  it('ㅁ의 의도된 내부 공간은 union 뒤에도 유지한다', () => {
    const outer = contour([[0, 0], [100, 0], [100, 100], [0, 100]])
    const hole = contour([[25, 25], [25, 75], [75, 75], [75, 25]])
    const merged = mergeStrokeContourGroupsForCff([[outer, hole]])
    expect(evenOddFilled({ x: 50, y: 50 }, merged)).toBe(false)
    expect(evenOddFilled({ x: 12, y: 50 }, merged)).toBe(true)
  })

  it('납작 붓촉 + 모델 상자에서 여러 항 union이 터지는 글자도 잉크를 합쳐 내보낸다', async () => {
    const memory = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => memory.set(key, value),
      removeItem: (key: string) => memory.delete(key),
    })
    const MODEL = JSON.parse(readFileSync(fileURLToPath(new URL('../public/noto-preset/model.json', import.meta.url)), 'utf8')) as NotoPresetModelBundle
    const [utils, generator, exportStore, deltaStore, style] = await Promise.all([
      import('../src/services/fontExportUtils'), import('../src/services/fontGenerator'),
      import('./fontExportStore'), import('./layoutDeltaStore'), import('../src/stores/globalStyleStore'),
    ])
    const brush = { tip: 'ellipse' as const, aspectRatio: 0.5, angle: 0 }
    style.useGlobalStyleStore.setState((state) => ({ style: { ...state.style, brush, strokeStyle: { mode: 'brush', brush } } }))
    try {
      const placementOf = exportStore.placementResolverOf(MODEL, deltaStore.layoutDeltaSnapshot())
      // 이 둘은 polygon-clipping의 여러 항 union이 SweepLine에서 터지던 글자다. 하나만 터져도 추출 전체가 실패했다.
      for (const char of ['쭈', '쮑']) {
        const glyph = utils.collectGlyphDataWithPlacement(char, placementOf)
        if (!glyph) throw new Error(`${char} 출력 데이터 없음`)
        const contours = generator.glyphDataToFontContours(glyph)
        expect(contours.length, char).toBeGreaterThan(0)
        // 합쳐졌으면 획 수(획당 최소 1링)보다 링이 적다. 안 합쳐지면 획마다 링이 그대로 남는다.
        expect(contours.length, char).toBeLessThan(glyph.strokes.length * 4)
      }
    } finally {
      style.useGlobalStyleStore.getState().resetStyle()
      vi.unstubAllGlobals()
    }
  })
})
