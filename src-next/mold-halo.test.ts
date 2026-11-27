import { describe, expect, it } from 'vitest'
import type { DecomposedSyllable } from '../src/types'
import { FINAL_TOLERANCE, HALO_END_GAP, HALO_ENGINE, HALO_TOLERANCE, haloCorrect, haloFinalFit, haloFit, haloScope, haloStemOf, type HaloStroke } from './moldHalo'
import { haloGrownOf, haloPlacementOf } from './haloPlacement'

const syllable = (initial: string, medial: string, final?: string, layoutType = final ? 'choseong-jungseong-vertical-jongseong' : 'choseong-jungseong-vertical') =>
  ({ char: '', layoutType, choseong: { char: initial }, jungseong: { char: medial }, jongseong: final ? { char: final } : null }) as unknown as DecomposedSyllable

/** ㄷ(가로 둘 + 세로 하나)과 ㅏ 기둥. `arm`은 ㄷ 가로의 오른끝(글자 칸 좌표). */
function dieut(arm: number, t = 0.07): HaloStroke[] {
  return [
    { part: 'CH', points: [{ x: arm, y: 0.18 }, { x: 0.12, y: 0.18 }, { x: 0.12, y: 0.7 }, { x: arm, y: 0.7 }], thickness: t, cap: 'butt' },
    { part: 'JU', points: [{ x: 0.7, y: 0.05 }, { x: 0.7, y: 0.96 }], thickness: t, cap: 'butt' },
    { part: 'JU', points: [{ x: 0.7, y: 0.45 }, { x: 0.89, y: 0.45 }], thickness: t, cap: 'butt' },
  ]
}

describe('흐림 선(새 틈 규칙 1단계)', () => {
  it('홑닿자 + 오른쪽 곁줄기 세로홀자, 받침 없는 글자만 맡는다', () => {
    expect(haloScope(syllable('ㄷ', 'ㅏ'))).toBe(true)
    expect(haloScope(syllable('ㅎ', 'ㅐ'))).toBe(true)
    expect(haloScope(syllable('ㅃ', 'ㅏ'))).toBe(false) // 쌍닿자는 다음 단계
    expect(haloScope(syllable('ㅍ', 'ㅏ'))).toBe(false) // ㅍ도 다음 단계
    expect(haloScope(syllable('ㄱ', 'ㅓ'))).toBe(false) // ㅓ 곁줄기 규칙 없음
    expect(haloScope(syllable('ㄱ', 'ㅏ', 'ㄱ'))).toBe(true) // 받침 글자도 기둥 쪽은 흐림선(키는 글자 전체, 하니무스 2026-11-24)
  })

  it('기둥은 가장 왼쪽 세로 홀자 토막', () => {
    const stem = haloStemOf(dieut(0.5))!
    expect(stem.left).toBeCloseTo(0.665, 6)
    expect(stem.thickness).toBeCloseTo(0.07, 6)
  })

  it('자리가 남으면(「다」) 닿자 뼈대만 넓혀 선을 기둥까지 메우고, 끝 틈은 폰트 아래 끝을 지킨다', () => {
    const fit = haloFit(dieut(0.5), { ease: HALO_ENGINE.ease, spread: HALO_ENGINE.spread, grown: 1 })!
    expect(fit.err).toBeLessThan(-HALO_TOLERANCE)
    expect(fit.widen).toBeGreaterThan(1)
    expect(fit.push).toBe(0)
    expect(fit.after).toBeLessThanOrEqual(1e-9)
    expect(fit.gap).toBeGreaterThanOrEqual(HALO_END_GAP - 1e-6)
    expect(fit.anchor).toBeCloseTo(0.12 - 0.035, 6) // 닿자 잉크 왼끝은 그대로
  })

  it('선 가까이(빗나감 폭 안)면 아무것도 안 바꾼다', () => {
    const base = { ease: HALO_ENGINE.ease, spread: HALO_ENGINE.spread, grown: 1 }
    // 여유를 그 글자의 기둥 진하기로 맞추면 빗나감 0.
    const probe = haloFit(dieut(0.56), base)!
    const fit = haloFit(dieut(0.56), { ...base, ease: probe.ease })!
    expect(Math.abs(fit.err)).toBeLessThan(HALO_TOLERANCE)
    expect(fit.widen).toBe(1)
    expect(fit.push).toBe(0)
  })

  it('답답하면 기둥이 밖으로 나간다 — 넓어짐 지수가 작을수록 더 나간다', () => {
    const heavy = dieut(0.58, 0.13)
    const less = haloFit(heavy, { ease: 0.66, spread: 1.0, grown: 1.86 })!
    const more = haloFit(heavy, { ease: 0.66, spread: 0.33, grown: 1.86 })!
    expect(more.push).toBeGreaterThan(0)
    expect(more.push).toBeGreaterThan(less.push)
    expect(more.widen).toBe(1)
    expect(more.after).toBeCloseTo(HALO_TOLERANCE, 9)
  })

  it('여유를 늘리면(값을 낮추면) 선이 멀어져 같은 글자도 기둥이 밖으로 간다', () => {
    const tight = haloFit(dieut(0.56), { ease: 0.76, spread: 0.42, grown: 1 })!
    const loose = haloFit(dieut(0.56), { ease: 0.48, spread: 0.42, grown: 1 })!
    expect(loose.err).toBeGreaterThan(tight.err)
  })
})

/** 「간」꼴: ㄱ(가로 + 세로) · ㅏ 기둥 · ㄴ 받침(윗변 `top`). */
function gan(top: number, t = 0.07): HaloStroke[] {
  return [
    { part: 'CH', points: [{ x: 0.12, y: 0.08 }, { x: 0.5, y: 0.08 }, { x: 0.5, y: 0.5 }], thickness: t, cap: 'butt' },
    { part: 'JU', points: [{ x: 0.7, y: 0.04 }, { x: 0.7, y: 0.6 }], thickness: t, cap: 'butt' },
    { part: 'JU', points: [{ x: 0.7, y: 0.3 }, { x: 0.89, y: 0.3 }], thickness: t, cap: 'butt' },
    { part: 'JO', points: [{ x: 0.2, y: top }, { x: 0.2, y: 0.92 }, { x: 0.8, y: 0.92 }], thickness: t, cap: 'butt' },
  ]
}

describe('받침 위 흐림 선(셋째 방향)', () => {
  it('바짝 붙은 받침은 윗변을 내리고, 멀리 떨어진 받침은 올리고, 폭 안이면 그대로 둔다', () => {
    const tight = haloFinalFit(gan(0.54))!
    expect(tight.err).toBeGreaterThan(FINAL_TOLERANCE)
    expect(tight.move).toBeGreaterThan(0)
    const after = haloFinalFit(gan(0.54 + tight.move))!
    expect(Math.abs(after.err)).toBeLessThanOrEqual(FINAL_TOLERANCE)
    expect(after.move).toBe(0)
    const far = haloFinalFit(gan(0.7))!
    expect(far.err).toBeLessThan(-FINAL_TOLERANCE)
    expect(far.move).toBeLessThan(0)
    expect(haloFinalFit(gan(0.62))!.move).toBe(0)
  })

  it('받침을 반 넘게 줄이지 않는다', () => {
    const fit = haloFinalFit(gan(0.52))!
    expect(fit.move).toBeLessThanOrEqual(0.5 * (fit.bottom - fit.top) + 1e-9)
  })

  it('받침이 없으면 재지 않는다', () => {
    expect(haloFinalFit(gan(0.6).filter((s) => s.part !== 'JO'))).toBeNull()
  })
})

describe('흐림 선을 화면 · 파일에 같이(실험 6-앞 길 B)', () => {
  const boxes = { CH: { x: 0.05, y: 0.1, width: 0.5, height: 0.7 }, JU: { x: 0.6, y: 0, width: 0.35, height: 1 } }
  it('넓힐 자리가 남은 「다」는 첫닿자 칸만 왼변을 두고 넓힌다', () => {
    const out = haloCorrect({ syllable: syllable('ㄷ', 'ㅏ'), boxes, strokesOn: (on) => dieut(on === boxes ? 0.42 : 0.12 + (0.42 - 0.12) * on.CH!.width / boxes.CH.width), rule: { ...HALO_ENGINE, grown: 1 } })
    expect(out?.fit?.widen).toBeGreaterThan(1)
    expect(out?.boxes.CH?.width).toBeGreaterThan(boxes.CH.width)
    expect(out?.boxes.JU).toEqual(boxes.JU)
  })
  it('닿자를 줄였으면(닿자 크기 < 1) 줄이기 전 모양이 넓힐 만큼까지만 넓힌다 — 「가」 ㄱ 납작 막기', () => {
    const strokesOn = (on: Partial<typeof boxes>) => dieut(on === boxes ? 0.5 : 0.12 + (0.5 - 0.12) * on.CH!.width / boxes.CH.width)
    const free = haloCorrect({ syllable: syllable('ㄷ', 'ㅏ'), boxes, strokesOn, rule: { ...HALO_ENGINE, grown: 1 } })
    const shrunk = haloCorrect({ syllable: syllable('ㄷ', 'ㅏ'), boxes, strokesOn, rule: { ...HALO_ENGINE, grown: 1 }, jamo: 0.85 })
    expect(free!.fit!.widen).toBeGreaterThan(1)
    expect(shrunk?.fit?.widen).toBeLessThan(free!.fit!.widen)
  })
  it('범위 밖 글자 · 스키마로 그린 글자 · 굵은 글자는 받은 그대로', () => {
    expect(haloCorrect({ syllable: syllable('ㄲ', 'ㅏ'), boxes, strokesOn: () => [], rule: { ...HALO_ENGINE, grown: 1 } })).toBeNull()
    const style = { weight: 400, linecap: 'butt', linejoin: 'miter', strokeStyle: { mode: 'brush', brush: { tip: 'round', aspectRatio: 0.5, angle: 0 } } } as const
    const schema = { kind: 'schema', schema: {} } as never
    expect(haloPlacementOf(syllable('ㄷ', 'ㅏ'), schema, style)).toBe(schema)
    expect(haloGrownOf(style)).toBeCloseTo(1, 6)
    const heavy = { kind: 'boxes', boxes } as const
    expect(haloGrownOf({ ...style, weight: 700 })).toBeGreaterThan(1.02)
    expect(haloPlacementOf(syllable('ㄷ', 'ㅏ'), heavy, { ...style, weight: 700 })).toBe(heavy)
  })
})
