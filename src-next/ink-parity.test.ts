import { describe, expect, it } from 'vitest'
import { INK_CAPS, INK_JOINS, PEN_INK_SAMPLES, PRESET_INK_SAMPLES, measureInkCell } from './inkParitySamples'

/** 플랜 `2026-10-06_획-편집-캔버스-면-그리기`의 G0 기준을 재는 테스트. 실험실 그림표(`InkParityLabPage`)와 같은 견본 · 같은 함수. */
describe('선 그리기와 면 그리기가 같은 그림을 낸다', () => {
  it('펜으로 흘려 그은 모양 13개 × 끝 3 × 꺾임 3 — 면 그리기가 전부 받는다(실패 0)', () => {
    const failures = PEN_INK_SAMPLES.flatMap((sample) => INK_CAPS.flatMap((cap) => INK_JOINS.map((join) => ({ name: `${sample.name} ${cap}/${join}`, cell: measureInkCell(sample.stroke, cap, join) }))))
      .filter((item) => !item.cell.ok)
      .map((item) => `${item.name}: ${item.cell.message}`)
    expect(failures).toEqual([])
  })

  it('기본 프리셋의 모든 획 — 끝 네모 · 꺾임 뾰족에서 두 그림의 다른 면적이 잉크의 0.5% 아래', () => {
    expect(PRESET_INK_SAMPLES.length).toBeGreaterThan(150)
    const worst = PRESET_INK_SAMPLES.map((sample) => ({ name: sample.name, cell: measureInkCell(sample.stroke, 'butt', 'miter') }))
      .sort((a, b) => (b.cell.diffRatio ?? 1) - (a.cell.diffRatio ?? 1))[0]
    expect(worst.cell.ok, worst.name).toBe(true)
    expect(worst.cell.diffRatio ?? 1, worst.name).toBeLessThan(0.005)
  })

  it('고리 · 좁은 U자처럼 제 몸과 겹치는 획도 선 그리기와 같은 면이 나온다(끝 네모 · 꺾임 뾰족, 2% 아래)', () => {
    for (const name of ['고리', '8자(고리 둘)', '좁은 U자(둥글게 접힘)', '좁은 U자(각지게 접힘)', '급한 굽이(반지름 < 반폭)']) {
      const sample = PEN_INK_SAMPLES.find((item) => item.name === name)!
      const cell = measureInkCell(sample.stroke, 'butt', 'miter')
      expect(cell.ok, name).toBe(true)
      expect(cell.diffRatio ?? 1, name).toBeLessThan(0.02)
    }
  })

  it('끝 사각이 몸을 뚫는 6자도 몸통이 다 그려진다(전에는 머리 한 토막만 남았다)', () => {
    const sample = PEN_INK_SAMPLES.find((item) => item.name === '6자(끝이 몸에 닿음)')!
    for (const join of INK_JOINS) {
      const cell = measureInkCell(sample.stroke, 'square', join)
      expect(cell.ok, join).toBe(true)
      expect(cell.diffRatio ?? 1, join).toBeLessThan(0.02)
    }
  })
})
