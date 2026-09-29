import { describe, expect, it } from 'vitest'
import baseJamos from '../data/baseJamos.json'
import type { JamoData, StrokeDataV2 } from '../types'
import { placeStemStroke, storedStemDelta } from './stemBend'
import { instanceOf, JAMO_CHANNELS, medialBoxEmOf, type StemMaster } from './stemMaster'

const baseJungseong = (baseJamos as unknown as { jungseong: Record<string, JamoData> }).jungseong
const bow: StemMaster = { name: 'gyeotjulgi', points: [{ t: 0, o: 0, handleOut: { t: 0.35, o: 0.02 } }, { t: 1, o: 0, handleIn: { t: 0.65, o: 0.02 } }] }
const OPEN = medialBoxEmOf('ㅏ', 'strokes', 'open')
const CLOSED = medialBoxEmOf('ㅏ', 'strokes', 'closed')

/** ㅏ의 곁줄기를 받침 없는 칸에서 휜 자모. */
function bentA(): JamoData {
  const a = structuredClone(baseJungseong['ㅏ'])
  a.strokes = a.strokes!.map((stroke) => stroke.id === 'ㅏ-2' ? instanceOf(stroke, bow, OPEN) : stroke)
  return a
}

describe('홀자 줄기 휨은 칸이 바뀌어도 em 그대로', () => {
  it('받침 있는 칸에서 곁줄기의 위아래 휨이 받침 없는 칸과 같은 em이다(짜부되지 않는다)', () => {
    const a = bentA()
    const stroke = a.strokes!.find((item) => item.id === 'ㅏ-2')!
    const liftEm = (placed: StrokeDataV2, box: { height: number }) => (placed.points[0].y - placed.points[0].handleOut!.y) * box.height
    const open = placeStemStroke(a, stroke, OPEN)
    const closed = placeStemStroke(a, stroke, CLOSED)
    expect(open).toBe(stroke)
    expect(liftEm(closed, CLOSED)).toBeCloseTo(liftEm(stroke, OPEN), 9)
    expect(liftEm(closed, CLOSED)).toBeCloseTo(0.02, 9)
    // 저장 좌표를 그대로 칸에 놓았다면 휨이 칸 높이 비율로 눌렸다.
    expect(liftEm(stroke, CLOSED)).toBeLessThan(0.02 * 0.6)
    // 끝점은 그대로다.
    expect(closed.points[0]).toMatchObject({ x: stroke.points[0].x, y: stroke.points[0].y })
    expect(closed.points.at(-1)).toMatchObject({ x: stroke.points.at(-1)!.x, y: stroke.points.at(-1)!.y })
  })

  it('곧은 줄기는 어느 칸에서도 그대로다 — 기본 홀자 전부(마스터 없는 폰트는 같다)', () => {
    for (const jamo of Object.values(baseJungseong)) {
      for (const channel of JAMO_CHANNELS) {
        const closed = medialBoxEmOf(jamo.char, channel, 'closed')
        for (const stroke of jamo[channel] ?? []) {
          expect(placeStemStroke(jamo, stroke, closed, channel), stroke.id).toBe(stroke)
        }
      }
    }
  })

  it('편집기에서 받침 있는 칸의 핸들을 끈 만큼, 놓인 핸들이 정확히 그만큼 간다', () => {
    const a = bentA()
    const stroke = a.strokes!.find((item) => item.id === 'ㅏ-2')!
    const drag = { x: 0.03, y: -0.05 }
    const stored = storedStemDelta(a, stroke, CLOSED, drag)
    const handle = stroke.points[0].handleOut!
    const moved: StrokeDataV2 = { ...stroke, points: [{ ...stroke.points[0], handleOut: { x: handle.x + stored.x, y: handle.y + stored.y } }, ...stroke.points.slice(1)] }
    const before = placeStemStroke(a, stroke, CLOSED).points[0].handleOut!
    const after = placeStemStroke(a, moved, CLOSED).points[0].handleOut!
    expect(after.x - before.x).toBeCloseTo(drag.x, 9)
    expect(after.y - before.y).toBeCloseTo(drag.y, 9)
  })

  it('이름 없는 획 · 닿자 · 얇은 상자(ㅣ)는 대상이 아니다', () => {
    const i = baseJungseong['ㅣ']
    const bentI: StrokeDataV2 = { ...i.strokes![0], points: [{ ...i.strokes![0].points[0], handleOut: { x: 0.9, y: 0.3 } }, i.strokes![0].points.at(-1)!] }
    expect(placeStemStroke(i, bentI, medialBoxEmOf('ㅣ', 'strokes', 'closed'))).toBe(bentI)
    const a = bentA()
    const free: StrokeDataV2 = { id: 'free', points: [{ x: 0, y: 0, handleOut: { x: 0.5, y: 0.2 } }, { x: 1, y: 0 }], closed: false, thickness: 0.07 }
    expect(placeStemStroke({ ...a, strokes: [...a.strokes!, free] }, free, CLOSED)).toBe(free)
    const giyeok = { ...a, type: 'choseong' as const }
    const stroke = a.strokes!.find((item) => item.id === 'ㅏ-2')!
    expect(placeStemStroke(giyeok, stroke, CLOSED)).toBe(stroke)
  })
})
