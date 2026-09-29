import { describe, expect, it } from 'vitest'
import baseJamos from '../data/baseJamos.json'
import type { BoxConfig, JamoData, StrokeDataV2 } from '../types'
import { placeStemStroke, storedStemDelta } from './stemBend'
import { instanceOf, JAMO_CHANNELS, medialBoxEmOf, stemReferenceBox, type StemMaster } from './stemMaster'

const baseJungseong = (baseJamos as unknown as { jungseong: Record<string, JamoData> }).jungseong
const bow: StemMaster = { name: 'gyeotjulgi', points: [{ t: 0, o: 0, handleOut: { t: 0.35, o: 0.02 } }, { t: 1, o: 0, handleIn: { t: 0.65, o: 0.02 } }] }
const bent: StemMaster = { name: 'gidung', points: [{ t: 0, o: 0, handleOut: { t: 0.4, o: 0.03 } }, { t: 1, o: 0, handleIn: { t: 0.7, o: -0.01 } }] }
const at = (size: { width: number; height: number }): BoxConfig => ({ x: 0.4, y: 0.1, ...size })
const OPEN = at(medialBoxEmOf('ㅏ', 'strokes', 'open'))
const CLOSED = at(medialBoxEmOf('ㅏ', 'strokes', 'closed'))

/** 자모 한 획을 마스터 인스턴스로 바꾼 자모. */
function withInstance(char: string, strokeId: string, master: StemMaster): JamoData {
  const jamo = structuredClone(baseJungseong[char])
  const channel = JAMO_CHANNELS.find((item) => jamo[item]?.some((stroke) => stroke.id === strokeId))!
  jamo[channel] = jamo[channel]!.map((stroke) => stroke.id === strokeId ? instanceOf(stroke, master, stemReferenceBox(char, channel, stroke)) : stroke)
  return jamo
}
const strokeOf = (jamo: JamoData, id: string) => JAMO_CHANNELS.flatMap((channel) => jamo[channel] ?? []).find((stroke) => stroke.id === id)!
/** 놓인 획의 한 점을 em으로. */
const emOf = (placed: { box: BoxConfig }, point: { x: number; y: number }) => ({ x: placed.box.x + point.x * placed.box.width, y: placed.box.y + point.y * placed.box.height })

describe('홀자 줄기 휨은 칸이 바뀌어도 em 그대로', () => {
  it('받침 있는 칸에서 곁줄기의 위아래 휨이 받침 없는 칸과 같은 em이다(짜부되지 않는다)', () => {
    const a = withInstance('ㅏ', 'ㅏ-2', bow)
    const stroke = strokeOf(a, 'ㅏ-2')
    const lift = (placed: { stroke: StrokeDataV2; box: BoxConfig }) => emOf(placed, placed.stroke.points[0]).y - emOf(placed, placed.stroke.points[0].handleOut!).y
    const open = placeStemStroke(a, stroke, OPEN)
    const closed = placeStemStroke(a, stroke, CLOSED)
    expect(lift(open)).toBeCloseTo(0.02, 9)
    expect(lift(closed)).toBeCloseTo(0.02, 9)
    // 저장 좌표를 그대로 칸에 놓았다면 휨이 칸 높이 비율로 눌렸다.
    expect(lift({ stroke, box: CLOSED })).toBeLessThan(0.02 * 0.6)
    expect(closed.box).toBe(CLOSED)
    expect(closed.stroke.points[0]).toMatchObject({ x: stroke.points[0].x, y: stroke.points[0].y })
    expect(closed.stroke.points.at(-1)).toMatchObject({ x: stroke.points.at(-1)!.x, y: stroke.points.at(-1)!.y })
  })

  it('곧은 줄기는 어느 칸에서도 획 · 칸 모두 그대로다 — 기본 홀자 전부(마스터 없는 폰트는 같다)', () => {
    for (const jamo of Object.values(baseJungseong)) {
      for (const channel of JAMO_CHANNELS) {
        const closed = at(medialBoxEmOf(jamo.char, channel, 'closed'))
        for (const stroke of jamo[channel] ?? []) {
          const placed = placeStemStroke(jamo, stroke, closed, channel)
          expect(placed.stroke, stroke.id).toBe(stroke)
          expect(placed.box, stroke.id).toBe(closed)
        }
      }
    }
  })

  it('두께 0인 칸(ㅣ · ㅡ · ㅚ 세로부)도 휜 만큼 em으로 휘고, 칸은 그 변만 넓어진다', () => {
    for (const [char, id, master] of [['ㅣ', 'ㅣ-1', bent], ['ㅚ', 'ㅚ-3', bent], ['ㅡ', 'ㅡ-1', { ...bent, name: 'bo' }]] as const) {
      const jamo = withInstance(char, id, master)
      const stroke = strokeOf(jamo, id)
      const channel = JAMO_CHANNELS.find((item) => jamo[item]?.includes(stroke))!
      for (const final of ['open', 'closed'] as const) {
        const box = at(medialBoxEmOf(char, channel, final))
        const placed = placeStemStroke(jamo, stroke, box)
        const start = emOf(placed, placed.stroke.points[0])
        const end = emOf(placed, placed.stroke.points.at(-1)!)
        const handle = emOf(placed, placed.stroke.points[0].handleOut!)
        const vertical = char !== 'ㅡ'
        // 끝점은 받은 칸의 자리 그대로.
        expect(start.x, `${char} ${final}`).toBeCloseTo(box.x + stroke.points[0].x * box.width, 9)
        expect(end.y, `${char} ${final}`).toBeCloseTo(box.y + stroke.points.at(-1)!.y * box.height, 9)
        // 휨은 0.03em(세로는 오른쪽, 가로는 위).
        expect(vertical ? handle.x - start.x : start.y - handle.y, `${char} ${final}`).toBeCloseTo(0.03, 9)
        expect(vertical ? placed.box.width : placed.box.height, `${char} ${final}`).toBeGreaterThan(0.1)
      }
    }
  })

  it('편집기에서 놓인 칸의 핸들을 끈 만큼, 놓인 핸들이 정확히 그만큼 간다(곁줄기 받침 있는 칸 · ㅣ)', () => {
    for (const [jamo, id, box] of [[withInstance('ㅏ', 'ㅏ-2', bow), 'ㅏ-2', CLOSED], [withInstance('ㅣ', 'ㅣ-1', bent), 'ㅣ-1', at(medialBoxEmOf('ㅣ', 'strokes', 'closed'))]] as const) {
      const stroke = strokeOf(jamo, id)
      const shown = placeStemStroke(jamo, stroke, box)
      const drag = { x: 0.03, y: -0.05 }
      const stored = storedStemDelta(jamo, stroke, shown.box, drag, 'bend')
      const handle = stroke.points[0].handleOut!
      const moved: StrokeDataV2 = { ...stroke, points: [{ ...stroke.points[0], handleOut: { x: handle.x + stored.x, y: handle.y + stored.y } }, ...stroke.points.slice(1)] }
      const before = emOf(shown, shown.stroke.points[0].handleOut!)
      const next = placeStemStroke(jamo, moved, box)
      const after = emOf(next, next.stroke.points[0].handleOut!)
      expect(after.x - before.x, id).toBeCloseTo(drag.x * shown.box.width, 9)
      expect(after.y - before.y, id).toBeCloseTo(drag.y * shown.box.height, 9)
    }
  })

  it('ㅒ · ㅖ(통째 칸에 그리고 획은 세로 채널)의 두 기둥도 ㅐ와 같은 em만큼 휜다', () => {
    const bentBy = (char: string, id: string) => {
      const jamo = withInstance(char, id, bent)
      const stroke = strokeOf(jamo, id)
      const placed = placeStemStroke(jamo, stroke, at(medialBoxEmOf(char, 'strokes', 'open')))
      return emOf(placed, placed.stroke.points[0].handleOut!).x - emOf(placed, placed.stroke.points[0]).x
    }
    expect(bentBy('ㅐ', 'ㅐ-3')).toBeCloseTo(0.03, 9)
    for (const [char, ids] of [['ㅒ', ['ㅒ-1', 'ㅒ-4']], ['ㅖ', ['ㅖ-1', 'ㅖ-4']]] as const) {
      for (const id of ids) if (baseJungseong[char] && strokeOf(baseJungseong[char], id)) expect(bentBy(char, id), id).toBeCloseTo(0.03, 9)
    }
  })

  it('이름 없는 획 · 닿자는 대상이 아니다', () => {
    const a = withInstance('ㅏ', 'ㅏ-2', bow)
    const free: StrokeDataV2 = { id: 'free', points: [{ x: 0, y: 0, handleOut: { x: 0.5, y: 0.2 } }, { x: 1, y: 0 }], closed: false, thickness: 0.07 }
    expect(placeStemStroke({ ...a, strokes: [...a.strokes!, free] }, free, CLOSED).stroke).toBe(free)
    const stroke = strokeOf(a, 'ㅏ-2')
    expect(placeStemStroke({ ...a, type: 'choseong' }, stroke, CLOSED).stroke).toBe(stroke)
  })
})
