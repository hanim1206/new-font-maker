import { describe, expect, it } from 'vitest'
import type { DecomposedSyllable } from '../src/types'
import { HALO_END_GAP, HALO_ENGINE, HALO_TOLERANCE, haloFit, haloScope, haloStemOf, type HaloStroke } from './moldHalo'

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
    expect(haloScope(syllable('ㄱ', 'ㅏ', 'ㄱ'))).toBe(false) // 받침은 3단계
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
