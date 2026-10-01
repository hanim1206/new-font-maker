import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createNotoPresetReader } from '../../scripts/reference-lab/notoPresetApi'
import { CHOSEONG_MAP, JONGSEONG_MAP, JUNGSEONG_MAP } from '../data/Hangul'
import { decomposeSyllable } from '../utils/hangulUtils'
import { identityOfSyllable, medialDragRange, resolveContextBoxes, type ContextBoxDelta, type MedialPart } from './contextBoxResolver'
import { applyRailEdits } from './notoMedialMasterFit'
import { furthestValid, GLYPH_BODY, medialLimitIssue } from './railLimits'

const CORPUS = path.resolve(__dirname, '../../.reference-fonts/guide-corpus')

describe('furthestValid', () => {
  it('끝이 한계 안이면 그대로, 밖이면 경계까지', () => {
    expect(furthestValid(0, 0.5, (value) => value <= 1)).toBe(0.5)
    expect(furthestValid(0, 3, (value) => value <= 1)).toBeCloseTo(1, 4)
    expect(furthestValid(0, -3, (value) => value >= -0.25)).toBeCloseTo(-0.25, 4)
  })
})

// corpus(.reference-fonts)가 있을 때만: 실제 모델로 칸을 풀어 한계에서 멈추는지 본다.
describe.skipIf(!existsSync(CORPUS))('보선 한계 — 글자 몸 · 순서 · 두께 간격', () => {
  const bundle = createNotoPresetReader(CORPUS).model()
  async function resolve(char: string, delta?: ContextBoxDelta) {
    const model = await bundle
    const identity = identityOfSyllable(decomposeSyllable(char, CHOSEONG_MAP, JUNGSEONG_MAP, JONGSEONG_MAP))!
    const resolved = resolveContextBoxes({ identity, model, delta })
    const fit = (part: MedialPart = 'JU') => resolved.medial.find((group) => group.part === part)!.fit!
    const rail = (role: string, kind: 'centerRail' | 'fromRail' | 'toRail', part: MedialPart = 'JU') => fit(part).railsEm[fit(part).bindings.find((binding) => binding.roleId === role)![kind]]
    const thickness = (role: string, part: MedialPart = 'JU') => fit(part).bindings.find((binding) => binding.roleId === role)!.thickness
    return { resolved, fit, rail, thickness, identity, model }
  }

  it('Δ가 없으면 모델 그대로(기본 폰트는 안 바뀐다)', async () => {
    for (const char of ['아', '계', '와', '의', '웨', '굔']) {
      const plain = await resolve(char)
      const zero = await resolve(char, { medial: { JU: {} } })
      expect(zero.resolved.boxes).toEqual(plain.resolved.boxes)
    }
  })

  it('계: 바깥 기둥 아래 끝을 한없이 내려도 잉크 칸이 글자 몸 아래에서 멈춘다', async () => {
    const moved = await resolve('계', { medial: { JU: { 'outerPillar.end': 0.5 } } })
    const slot = moved.fit().slot
    expect(slot.y + slot.height).toBeCloseTo(GLYPH_BODY.bottom, 3)
  })

  it('계: 바깥 기둥 위 끝을 한없이 올려도 글자 몸 위에서 멈춘다', async () => {
    const moved = await resolve('계', { medial: { JU: { 'outerPillar.start': -0.5 } } })
    expect(moved.fit().slot.y).toBeCloseTo(GLYPH_BODY.top, 3)
  })

  it('아: 곁줄기를 한없이 올려도 기둥 위 끝을 넘지 않고 두께만큼 떨어져 멈춘다', async () => {
    const base = await resolve('아')
    const moved = await resolve('아', { medial: { JU: { 'primaryBeam.center': -0.8 } } })
    const gap = moved.rail('primaryBeam', 'centerRail') - moved.rail('outerPillar', 'fromRail')
    expect(gap).toBeCloseTo(Math.min(base.rail('primaryBeam', 'centerRail') - base.rail('outerPillar', 'fromRail'), base.thickness('primaryBeam')), 3)
  })

  it('아: 네모꼴을 세로로 줄이면 곁줄기와 기둥 끝 사이를 기준 틀에서 그만큼 더 벌려야 한다(화면에서 두께만큼)', async () => {
    const base = await resolve('아')
    const fit = base.fit()
    const binding = fit.bindings.find((item) => item.roleId === 'primaryBeam')!
    const pillarTop = base.rail('outerPillar', 'fromRail')
    // 곁줄기를 기둥 위 끝에서 두께의 1.2배 자리에 둔다. 기본 네모꼴이면 통과, 세로가 0.6배면 화면 간격이 두께의 0.72배라 막힌다.
    const moved = applyRailEdits(fit, { ...fit.railsEm, [binding.centerRail]: pillarTop + binding.thickness * 1.2 })
    expect(moved.ok).toBe(true)
    if (!moved.ok) return
    expect(medialLimitIssue(fit, moved.fit)).toBeNull()
    expect(medialLimitIssue(fit, moved.fit, { x: 1, y: 1 })).toBeNull()
    expect(medialLimitIssue(fit, moved.fit, { x: 0.6, y: 1 })).toBeNull()
    expect(medialLimitIssue(fit, moved.fit, { x: 1, y: 0.6 })).toMatch(/두께보다 좁습니다/)
  })

  it('야: 윗 곁줄기를 아래로 한없이 내려도 아랫 곁줄기와 두께만큼 떨어진다', async () => {
    const moved = await resolve('야', { medial: { JU: { 'upperBeam.center': 0.8 } } })
    const gap = moved.rail('lowerBeam', 'centerRail') - moved.rail('upperBeam', 'centerRail')
    expect(gap).toBeGreaterThanOrEqual(moved.thickness('upperBeam') - 1e-4)
    expect(gap).toBeLessThan(moved.thickness('upperBeam') + 2e-3)
  })

  it('예전에는 버려지던 넘친 Δ도 경계까지는 얹힌다(한계 안 몫은 산다)', async () => {
    const base = await resolve('아')
    const moved = await resolve('아', { medial: { JU: { 'outerPillar.end': 0.5 } } })
    expect(moved.rail('outerPillar', 'toRail')).toBeGreaterThan(base.rail('outerPillar', 'toRail') + 1e-3)
  })

  it('첫닿자 변도 글자 몸 밖으로 못 나간다', async () => {
    const moved = await resolve('아', { faces: { CH: { top: -0.5, left: -0.5 } } })
    const ch = moved.resolved.parts.find((part) => part.part === 'CH')!.faces
    expect(ch.top).toBeCloseTo(GLYPH_BODY.top, 9)
    expect(ch.left).toBeCloseTo(GLYPH_BODY.left, 9)
  })

  it('획 편집 끌기 범위: 기둥 아래 끝은 글자 몸 아래까지만 내려간다', async () => {
    const base = await resolve('계')
    const range = medialDragRange({ identity: base.identity, model: base.model, part: 'JU', keys: ['outerPillar.end'] })!
    expect(range.high).toBeGreaterThan(0)
    expect(range.low).toBeLessThan(0)
    const limit = await resolve('계', { medial: { JU: { 'outerPillar.end': range.high } } })
    expect(limit.fit().slot.y + limit.fit().slot.height).toBeCloseTo(GLYPH_BODY.bottom, 3)
  })

  it('획 편집 끌기 범위: 이미 넘친 저장 Δ가 있으면 넘친 만큼 빼고 준다 — 끄는 순간 경계로 온다', async () => {
    const base = await resolve('계')
    const clean = medialDragRange({ identity: base.identity, model: base.model, part: 'JU', keys: ['outerPillar.end'] })!
    const over = medialDragRange({ identity: base.identity, model: base.model, delta: { medial: { JU: { 'outerPillar.end': clean.high + 0.2 } } }, part: 'JU', keys: ['outerPillar.end'] })!
    expect(over.high).toBeCloseTo(-0.2, 3)
  })
})
