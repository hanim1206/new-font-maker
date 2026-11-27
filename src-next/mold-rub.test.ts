import { describe, expect, it } from 'vitest'
import { LOOK_ENGINE } from './moldLab'
import { edgeOver, lookToRub, rollRub, RUB_BATCHES, RUB_KEYS, RUB_STEPS, rubToLook, snapRub, rubView, setRub, settle, tapZoom, zoomAround } from './moldRub'

describe('글자 문지르기 판', () => {
  it('속성 아홉 · 묶음 여섯(4열까지, 옆으로 안 넘침)', () => {
    expect(RUB_KEYS).toHaveLength(9)
    expect(RUB_BATCHES.map((batch) => batch.name)).toHaveLength(6)
    for (const batch of RUB_BATCHES) { expect(batch.rows.length).toBeGreaterThanOrEqual(5); expect(Math.max(...batch.rows.map((row) => row.length))).toBe(4) }
  })

  it('칸 → 값 → 칸이 제자리로 온다', () => {
    for (const key of RUB_KEYS) for (let k = 0; k <= 20; k++) expect(lookToRub(key, rubToLook(key, k))).toBe(snapRub(key, k))
  })

  it('탈네모는 두 칸뿐 — 네모(키 그대로) · 탈네모(끝), 사이 값 없음', () => {
    expect(RUB_STEPS.open).toEqual([0, 20])
    expect(rubToLook('open', 0)).toBe(1)
    expect(rubToLook('open', 8)).toBe(1)
    expect(rubToLook('open', 12)).toBe(rubToLook('open', 20))
    expect(rubToLook('open', 20)).toBeLessThan(1)
    for (const r of [0, 0.3, 0.7, 0.99]) expect([0, 20]).toContain(lookToRub('open', rollRub({}, {}, () => r).open ?? 1))
  })

  it('한 값만 바꾸고, 처음 칸으로 오면 처음 값 그대로', () => {
    const home = {}
    const moved = setRub({ round: 0.4 }, home, 'weight', 15)
    expect(moved.round).toBe(0.4)
    expect(moved.weight).toBeGreaterThan(1)
    const back = setRub(moved, home, 'weight', lookToRub('weight', LOOK_ENGINE.weight))
    expect(back.weight).toBeUndefined()
  })

  it('주사위는 잠긴 칸을 넘지 않는다', () => {
    const rolled = rollRub({}, {}, () => 0.99, { weight: 12 })
    expect(lookToRub('weight', rolled.weight!)).toBeLessThanOrEqual(12)
  })

  it('창: 끝에서 멈추고, 빨리 밀면 여러 칸, 톡은 한 단계 확대', () => {
    const view = rubView(8, 3, 2, 260, 300)
    expect(view.maxX).toBe(6)
    expect(settle(5.6, 30, view.maxX, false)).toBe(6)
    expect(settle(1.2, 20, view.maxX, false)).toBe(4)
    expect(settle(1.2, 20, view.maxX, true)).toBe(1)
    expect(tapZoom(2, { x: 0, y: 0 }, { c: 1, r: 0 }, 8, 3, 260, 300)?.zoom).toBe(1)
    expect(tapZoom(1, { x: 0, y: 0 }, { c: 0, r: 0 }, 8, 3, 260, 300)).toBeNull()
    expect(zoomAround(9, { c: 4, r: 1 }, 8, 3, 260, 300).zoom).toBe(4)
  })

  it('끝 당기기는 끝에 앉은 채로 시작했을 때만 센다', () => {
    expect(edgeOver(6.8, 6, 6)).toBeCloseTo(0.8)
    expect(edgeOver(6.8, 4, 6)).toBe(0)
    expect(edgeOver(-0.7, 0, 6)).toBeCloseTo(-0.7)
  })
})
