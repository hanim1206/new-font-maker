import { describe, expect, it } from 'vitest'
import { getBaseJamo } from '../src/stores/jamoStore'
import { propagatedJungseong } from '../src/stores/stemMasterStore'
import type { AxisPoint } from '../src/services/stemMaster'
import type { JamoData } from '../src/types'
import { CALM_PRESETS, pillarFromDrawn, pillarStrokeKeys } from './pillarStroke'

const medium = CALM_PRESETS[1]
/** 위에서 아래로, 가운데가 오른쪽으로 부푼 선에 잔떨림을 얹는다. */
function bowed(from = 0.1, to = 0.9, bow = 0.05, jitter = 0.004): { x: number; y: number }[] {
  return Array.from({ length: 80 }, (_, i) => {
    const t = i / 79
    return { x: 0.5 + Math.sin(Math.PI * t) * bow + (i % 2 ? jitter : -jitter), y: from + (to - from) * t }
  })
}

describe('기둥 긋기 시험판', () => {
  it('세로로 그은 선은 기둥 마스터가 된다 — 시작 t 0, 끝 t 1, 가운데는 오른쪽(+o)으로 휜다', () => {
    const result = pillarFromDrawn(bowed(), medium)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const { points } = result.master
    expect(points[0]).toMatchObject({ t: 0, o: 0 })
    expect(points[points.length - 1].t).toBe(1)
    // 휨은 앵커나 손잡이에 담긴다(한 마디 곡선이면 손잡이에만).
    const offsets = points.flatMap((point) => [point.o, point.handleIn?.o ?? 0, point.handleOut?.o ?? 0])
    expect(Math.max(...offsets)).toBeGreaterThan(0.02)
  })

  it('아래에서 위로 그어도 같은 기둥이 된다', () => {
    const down = pillarFromDrawn(bowed(), medium)
    const up = pillarFromDrawn(bowed().reverse(), medium)
    expect(down.ok && up.ok).toBe(true)
    if (!down.ok || !up.ok) return
    expect(up.master.points[0]).toMatchObject({ t: 0, o: 0 })
    expect(Math.abs(up.master.points[up.master.points.length - 1].o - down.master.points[down.master.points.length - 1].o)).toBeLessThan(0.01)
  })

  it('짧게 찍거나 가로로 그으면 받지 않는다', () => {
    expect(pillarFromDrawn([{ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.55 }], medium)).toEqual({ ok: false, reason: 'short' })
    expect(pillarFromDrawn([{ x: 0.1, y: 0.5 }, { x: 0.9, y: 0.55 }], medium)).toEqual({ ok: false, reason: 'not-vertical' })
  })

  it('긋는 길이가 달라도 휨의 비율은 같다', () => {
    const long = pillarFromDrawn(bowed(0.1, 0.9, 0.06, 0), medium)
    const short = pillarFromDrawn(bowed(0.3, 0.7, 0.03, 0), medium)
    if (!long.ok || !short.ok) throw new Error('fit')
    const peak = (points: AxisPoint[]) => Math.max(...points.flatMap((point) => [point.o, point.handleIn?.o ?? 0, point.handleOut?.o ?? 0]))
    expect(Math.abs(peak(long.master.points) - peak(short.master.points))).toBeLessThan(0.01)
  })

  it('마스터를 퍼뜨리면 ㅏ · ㅣ · ㅢ의 기둥이 바뀌고, 그 자리가 기둥 목록에 든다', () => {
    const jungseong = Object.fromEntries(['ㅏ', 'ㅣ', 'ㅢ', 'ㅗ'].map((char) => [char, getBaseJamo('jungseong', char)]).filter(([, jamo]) => jamo)) as Record<string, JamoData>
    const result = pillarFromDrawn(bowed(), medium)
    if (!result.ok) throw new Error('fit')
    const changed = propagatedJungseong(jungseong, {}, { gidung: result.master })
    expect(Object.keys(changed).sort()).toEqual(['ㅏ', 'ㅢ', 'ㅣ'])
    const keys = pillarStrokeKeys(jungseong)
    expect([...keys].some((key) => key.startsWith('ㅏ:'))).toBe(true)
    expect([...keys].some((key) => key.startsWith('ㅗ:'))).toBe(false)
  })
})
