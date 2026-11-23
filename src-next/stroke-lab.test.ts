import { describe, expect, it } from 'vitest'
import { getBaseJamo } from '../src/stores/jamoStore'
import { propagatedJungseong } from '../src/stores/stemMasterStore'
import type { JamoData } from '../src/types'
import { consonantShapesOf, drawnStem, mastersOf, penThicknessOf, shapeConsonants, shapeConsonantStroke, withPenThicknessVowels, type DrawnStem, type StemKind } from './strokeLab'

type P = { x: number; y: number }
/** a→b로 가며 진행 방향 오른쪽(+)으로 `bow`만큼 부푼 선. 잔떨림을 얹는다. */
function bowed(a: P, b: P, bow = 0.05, jitter = 0.003): P[] {
  const d = { x: b.x - a.x, y: b.y - a.y }
  const length = Math.hypot(d.x, d.y)
  const normal = { x: d.y / length, y: -d.x / length }
  return Array.from({ length: 80 }, (_, i) => {
    const t = i / 79
    const off = Math.sin(Math.PI * t) * bow + (i % 2 ? jitter : -jitter)
    return { x: a.x + d.x * t + normal.x * off, y: a.y + d.y * t + normal.y * off }
  })
}
function loop(cx = 0.37, cy = 0.5, r = 0.25): P[] {
  return Array.from({ length: 90 }, (_, i) => ({ x: cx + Math.sin(i / 88 * Math.PI * 2) * r, y: cy - Math.cos(i / 88 * Math.PI * 2) * r }))
}
const peak = (stem: DrawnStem) => (stem.ok && stem.shape ? Math.max(...stem.shape.flatMap((p) => [p.r, p.handleIn?.r ?? 0, p.handleOut?.r ?? 0])) : 0)
const jamos = (type: JamoData['type'], chars: string[]) => Object.fromEntries(chars.map((char) => [char, getBaseJamo(type, char)]).filter(([, jamo]) => jamo)) as Record<string, JamoData>

describe('획 긋기 시험판', () => {
  it('줄기마다 방향이 맞아야 받는다', () => {
    expect(drawnStem(bowed({ x: 0.37, y: 0.1 }, { x: 0.37, y: 0.9 }), 'vertical').ok).toBe(true)
    expect(drawnStem(bowed({ x: 0.1, y: 0.5 }, { x: 0.65, y: 0.5 }), 'vertical')).toMatchObject({ ok: false, reason: 'direction' })
    expect(drawnStem(bowed({ x: 0.1, y: 0.5 }, { x: 0.65, y: 0.5 }), 'longHorizontal').ok).toBe(true)
    expect(drawnStem(bowed({ x: 0.6, y: 0.2 }, { x: 0.15, y: 0.8 }), 'diagonal').ok).toBe(true)
    expect(drawnStem(bowed({ x: 0.37, y: 0.4 }, { x: 0.37, y: 0.45 }), 'shortVertical')).toMatchObject({ ok: false, reason: 'short' })
    expect(drawnStem(loop(), 'circle').ok).toBe(true)
    expect(drawnStem(bowed({ x: 0.1, y: 0.2 }, { x: 0.6, y: 0.8 }), 'circle')).toMatchObject({ ok: false, reason: 'open' })
  })

  it('거꾸로 그어도 같은 모양 — 오른→왼 가로선은 왼→오른으로 돌려 잰다', () => {
    const forward = drawnStem(bowed({ x: 0.1, y: 0.5 }, { x: 0.6, y: 0.5 }), 'horizontal')
    // 같은 선을 반대로 그으면 진행 방향의 오른쪽이 뒤집히니 부푼 쪽도 반대로 그어 같은 선을 만든다.
    const backward = drawnStem(bowed({ x: 0.6, y: 0.5 }, { x: 0.1, y: 0.5 }, -0.05), 'horizontal')
    expect(Math.abs(peak(forward) - peak(backward))).toBeLessThan(0.02)
  })

  it('모음 줄기 넷은 기둥 · 짧은기둥 · 곁줄기 · 보 마스터가 되어 홀자에 퍼진다', () => {
    const jungseong = jamos('jungseong', ['ㅏ', 'ㅗ', 'ㅡ', 'ㅣ'])
    const stems: Partial<Record<StemKind, DrawnStem>> = {
      vertical: drawnStem(bowed({ x: 0.37, y: 0.1 }, { x: 0.37, y: 0.9 }), 'vertical'),
      shortVertical: drawnStem(bowed({ x: 0.37, y: 0.3 }, { x: 0.37, y: 0.7 }), 'shortVertical'),
      horizontal: drawnStem(bowed({ x: 0.2, y: 0.5 }, { x: 0.55, y: 0.5 }), 'horizontal'),
      longHorizontal: drawnStem(bowed({ x: 0.05, y: 0.5 }, { x: 0.7, y: 0.5 }), 'longHorizontal'),
    }
    const masters = mastersOf(stems, jungseong)
    expect(Object.keys(masters).sort()).toEqual(['bo', 'gidung', 'gyeotjulgi', 'jjalbeungidung'])
    expect(Object.keys(propagatedJungseong(jungseong, {}, masters)).sort()).toEqual(['ㅏ', 'ㅗ', 'ㅡ', 'ㅣ'])
  })

  it('닿자: ㄱ은 꺾임을 두고 가로 · 세로 마디만 바뀐다', () => {
    const stems: Partial<Record<StemKind, DrawnStem>> = {
      vertical: drawnStem(bowed({ x: 0.37, y: 0.1 }, { x: 0.37, y: 0.9 }), 'vertical'),
      horizontal: drawnStem(bowed({ x: 0.2, y: 0.5 }, { x: 0.55, y: 0.5 }), 'horizontal'),
    }
    const giyeok = getBaseJamo('choseong', 'ㄱ')!.strokes![0]
    const { stroke, kinds } = shapeConsonantStroke(giyeok, consonantShapesOf(stems))
    expect(kinds.sort()).toEqual(['horizontal', 'vertical'])
    const corner = giyeok.points[1]
    expect(stroke.points.some((point) => Math.hypot(point.x - corner.x, point.y - corner.y) < 1e-9)).toBe(true)
    expect(stroke.points[0]).toMatchObject({ x: giyeok.points[0].x, y: giyeok.points[0].y })
    expect(stroke.points[stroke.points.length - 1]).toMatchObject({ x: giyeok.points[2].x, y: giyeok.points[2].y })
  })

  it('닿자: 긴 가로 마디는 가로 긴 선, 짧은 세로 마디는 세로 짧은 선 — 안 그었으면 짝으로', () => {
    const vertical = drawnStem(bowed({ x: 0.37, y: 0.1 }, { x: 0.37, y: 0.9 }), 'vertical')
    const shortVertical = drawnStem(bowed({ x: 0.37, y: 0.3 }, { x: 0.37, y: 0.7 }), 'shortVertical')
    const horizontal = drawnStem(bowed({ x: 0.2, y: 0.5 }, { x: 0.55, y: 0.5 }), 'horizontal')
    const longHorizontal = drawnStem(bowed({ x: 0.05, y: 0.5 }, { x: 0.7, y: 0.5 }), 'longHorizontal')
    const hieut = jamos('choseong', ['ㅎ', 'ㄱ'])
    const all = shapeConsonants(hieut, consonantShapesOf({ vertical, shortVertical, horizontal, longHorizontal })).keys
    expect(all.get('ㅎ:ㅎ-1')).toEqual(['shortVertical'])
    expect(all.get('ㅎ:ㅎ-2')).toEqual(['longHorizontal'])
    expect(all.get('ㄱ:ㄱ-1')?.sort()).toEqual(['longHorizontal', 'vertical'])
    const pairOnly = shapeConsonants(hieut, consonantShapesOf({ vertical, horizontal })).keys
    expect(pairOnly.get('ㅎ:ㅎ-1')).toEqual(['vertical'])
    expect(pairOnly.get('ㅎ:ㅎ-2')).toEqual(['horizontal'])
  })

  it('닿자: 납작한 칸에서도 em으로 잰 휨은 정사각 칸과 같다', () => {
    const shapes = consonantShapesOf({ longHorizontal: drawnStem(bowed({ x: 0.05, y: 0.5 }, { x: 0.7, y: 0.5 }, 0.08, 0), 'longHorizontal') })
    const stroke = getBaseJamo('choseong', 'ㅎ')!.strokes!.find((item) => item.id === 'ㅎ-2')!
    // 휜 정도 = 가장 먼 앵커 · 손잡이의 옆 어긋남(em) ÷ 마디 길이(em).
    const bendEm = (box: { width: number; height: number }) => {
      const { stroke: placed } = shapeConsonantStroke(stroke, shapes, box)
      const y0 = stroke.points[0].y
      const off = Math.max(...placed.points.flatMap((p) => [p, p.handleIn, p.handleOut]).filter(Boolean).map((p) => Math.abs(p!.y - y0) * box.height))
      return off / (Math.abs(stroke.points[1].x - stroke.points[0].x) * box.width)
    }
    const square = bendEm({ width: 1, height: 1 })
    expect(square).toBeGreaterThan(0.02)
    expect(bendEm({ width: 0.62, height: 0.3 })).toBeCloseTo(square, 6)
    expect(bendEm({ width: 0.45, height: 0.6 })).toBeCloseTo(square, 6)
  })

  it('닿자: ㅅ의 두 사선은 대각선 하나를 뒤집어 쓰고, ㅇ은 동그라미, ㅁ은 닫힌 채로', () => {
    const stems: Partial<Record<StemKind, DrawnStem>> = {
      vertical: drawnStem(bowed({ x: 0.37, y: 0.1 }, { x: 0.37, y: 0.9 }), 'vertical'),
      horizontal: drawnStem(bowed({ x: 0.2, y: 0.5 }, { x: 0.55, y: 0.5 }), 'horizontal'),
      diagonal: drawnStem(bowed({ x: 0.6, y: 0.2 }, { x: 0.15, y: 0.8 }), 'diagonal'),
      circle: drawnStem(loop(), 'circle'),
    }
    const { changed, keys } = shapeConsonants(jamos('choseong', ['ㅅ', 'ㅇ', 'ㅁ', 'ㅎ']), consonantShapesOf(stems))
    expect(Object.keys(changed).sort()).toEqual(['ㅁ', 'ㅅ', 'ㅇ', 'ㅎ'])
    expect(keys.get('ㅅ:ㅅ-left')).toEqual(['diagonal'])
    expect(keys.get('ㅅ:ㅅ-right')).toEqual(['diagonal'])
    expect(keys.get('ㅇ:ㅇ-circle')).toEqual(['circle'])
    expect(changed['ㅁ'].strokes![0].closed).toBe(true)
    // 끝점(자리)은 그대로다.
    const before = getBaseJamo('choseong', 'ㅅ')!.strokes!
    changed['ㅅ'].strokes!.forEach((stroke, index) => {
      const a = before[index].points, b = stroke.points
      expect(b[0]).toMatchObject({ x: a[0].x, y: a[0].y })
      expect(Math.hypot(b[b.length - 1].x - a[a.length - 1].x, b[b.length - 1].y - a[a.length - 1].y)).toBeLessThan(1e-9)
    })
  })
  it('그은 획은 펜 두께 하나 — 저장소에서 ㄹ · ㅇ · ㅅ만 가늘어도 그은 획은 「ㅣ」 기둥 두께로 고르다', () => {
    const thin = (jamo: JamoData): JamoData => ({ ...jamo, strokes: jamo.strokes!.map((stroke) => ({ ...stroke, thickness: 0.05 })) })
    const consonants = Object.fromEntries(Object.entries(jamos('choseong', ['ㄹ', 'ㅇ', 'ㅅ', 'ㄱ'])).map(([char, jamo]) => [char, char === 'ㄱ' ? jamo : thin(jamo)]))
    const vowels = jamos('jungseong', ['ㅣ', 'ㅡ', 'ㅏ'])
    const pen = penThicknessOf(vowels)
    expect(pen).toBe(vowels['ㅣ'].strokes![0].thickness)
    const stems: Partial<Record<StemKind, DrawnStem>> = {
      vertical: drawnStem(bowed({ x: 0.37, y: 0.1 }, { x: 0.37, y: 0.9 }), 'vertical'),
      horizontal: drawnStem(bowed({ x: 0.2, y: 0.5 }, { x: 0.55, y: 0.5 }), 'horizontal'),
      longHorizontal: drawnStem(bowed({ x: 0.05, y: 0.5 }, { x: 0.7, y: 0.5 }), 'longHorizontal'),
      diagonal: drawnStem(bowed({ x: 0.6, y: 0.2 }, { x: 0.15, y: 0.8 }), 'diagonal'),
      circle: drawnStem(loop(), 'circle'),
    }
    // 그대로 물려받으면(예전) ㄹ · ㅇ · ㅅ만 0.05로 남는다.
    const old = shapeConsonants(consonants, consonantShapesOf(stems)).changed
    expect(old['ㄹ'].strokes!.every((stroke) => stroke.thickness === 0.05)).toBe(true)
    const { changed } = shapeConsonants(consonants, consonantShapesOf(stems), undefined, pen)
    for (const char of ['ㄹ', 'ㅇ', 'ㅅ', 'ㄱ']) for (const stroke of changed[char].strokes!) expect(stroke.thickness).toBe(pen)
    // 홀자: 그은 줄기가 입혀진 획만 펜 두께, 안 그은 것은 그대로.
    const thinVowels = { ...vowels, 'ㅡ': thin(vowels['ㅡ']) }
    expect(withPenThicknessVowels(thinVowels, new Set<StemKind>(['longHorizontal']), pen)['ㅡ'].strokes![0].thickness).toBe(pen)
    expect(withPenThicknessVowels(thinVowels, new Set<StemKind>(['vertical']), pen)['ㅡ'].strokes![0].thickness).toBe(0.05)
  })
})
