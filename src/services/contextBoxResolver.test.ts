import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createNotoPresetReader } from '../../scripts/reference-lab/notoPresetApi'
import { CHOSEONG_MAP, JONGSEONG_MAP, JUNGSEONG_MAP } from '../data/Hangul'
import { DEFAULT_STYLE } from '../stores/globalStyleStore'
import { decomposeSyllable } from '../utils/hangulUtils'
import { addContextBoxDelta, addFaceDelta, facesOffsets, hasContextBoxDelta, identityOfSyllable, medialPartGroups, predictComponentFaces, resolveContextBoxes } from './contextBoxResolver'
import { fitNotoComponent, inkOfComponentFit } from './notoComponentFit'
import { createUserPreset01 } from '../../src-next/userPreset01'
import { materializeFinalGlyphInk } from './finalGlyphInk'
import { resolveGlyphInkPrimitives } from './glyphInkResolver'
import { modelIdentityOf } from './notoVariationModel'

const CORPUS = path.resolve(__dirname, '../../.reference-fonts/guide-corpus')
const decompose = (char: string) => decomposeSyllable(char, CHOSEONG_MAP, JUNGSEONG_MAP, JONGSEONG_MAP)

describe('칸 해석 함수', () => {
  it('음절에서 모델 신원을 만들고, 자모 하나짜리는 null', () => {
    expect(identityOfSyllable(decompose('광'))).toEqual(modelIdentityOf('ㄱ', 'ㅘ', 'ㅇ'))
    expect(identityOfSyllable(decompose('가'))).toEqual({ initialJamo: 'ㄱ', medialJamo: 'ㅏ', finalJamo: null, contextId: 'right' })
    expect(identityOfSyllable(decompose('ㄱ'))).toBeNull()
  })

  it('홀자 역할을 part로 가른다 — 혼합은 가로부·세로부, 아래홀자는 JU_HORIZONTAL', () => {
    expect(medialPartGroups('ㅘ')?.map((g) => [g.part, g.roleIds.join(',')])).toEqual([['JU_H', 'baseStem,lowerBeam'], ['JU_V', 'outerPillar,upperBeam']])
    // ㅜ 계열은 윗보가 줄기 보다: ㅝ = ㅜ(줄기+윗보) + ㅓ(기둥+아래보).
    expect(medialPartGroups('ㅝ')?.map((g) => [g.part, g.roleIds.join(',')])).toEqual([['JU_H', 'baseStem,upperBeam'], ['JU_V', 'lowerBeam,outerPillar']])
    expect(medialPartGroups('ㅞ')?.map((g) => [g.part, g.roleIds.join(',')])).toEqual([['JU_H', 'baseStem,upperBeam'], ['JU_V', 'innerPillar,lowerBeam,outerPillar']])
    expect(medialPartGroups('ㅗ')?.[0]).toMatchObject({ part: 'JU', role: 'JU_HORIZONTAL' })
    expect(medialPartGroups('ㅏ')?.[0]).toMatchObject({ part: 'JU', role: 'JU_VERTICAL' })
    expect(medialPartGroups('ㅃ')).toBeNull()
  })

  it('Δ 더하기 — 전체 위에 이 레이아웃을 얹고, 0만 남으면 Δ 없음으로 본다', () => {
    const sum = addContextBoxDelta({ faces: { CH: { left: 0.01 } }, medial: { JU: { 'outerPillar.center': 0.02 } } }, { faces: { CH: { left: -0.01, right: 0.005 }, JO: { top: 0.003 } }, medial: { JU: { 'outerPillar.center': 0.01, 'primaryBeam.center': -0.004 } } })
    expect(sum.faces?.CH?.left).toBeCloseTo(0, 12)
    expect(sum.faces?.CH?.right).toBeCloseTo(0.005, 12)
    expect(sum.faces?.JO?.top).toBeCloseTo(0.003, 12)
    expect(sum.medial?.JU?.['outerPillar.center']).toBeCloseTo(0.03, 12)
    expect(sum.medial?.JU?.['primaryBeam.center']).toBeCloseTo(-0.004, 12)
    expect(addContextBoxDelta(undefined, undefined)).toEqual({})
    expect(hasContextBoxDelta(undefined)).toBe(false)
    expect(hasContextBoxDelta({ faces: { CH: { left: 0 } } })).toBe(false)
    expect(hasContextBoxDelta({ medial: { JU: { 'outerPillar.center': 0.001 } } })).toBe(true)
  })

  it('변 고정 — 좁은 층의 고정은 앞을 버리고 교체, 고정 뒤 더하기는 at + n, 고정은 0 자리여도 Δ 있음', () => {
    expect(addFaceDelta(0.01, { at: 0.7 })).toEqual({ at: 0.7 })
    expect(addFaceDelta({ at: 0.7 }, 0.01)).toEqual({ at: expect.closeTo(0.71, 12) })
    expect(addFaceDelta({ at: 0.7 }, { at: 0.2 })).toEqual({ at: 0.2 })
    expect(addFaceDelta(undefined, { at: 0.7 })).toEqual({ at: 0.7 })
    expect(addFaceDelta(0.01, undefined)).toBe(0.01)
    const sum = addContextBoxDelta({ faces: { CH: { top: 0.01, left: 0.02 } } }, { faces: { CH: { top: { at: 0.718 } } } })
    expect(sum.faces?.CH?.top).toEqual({ at: 0.718 })
    expect(sum.faces?.CH?.left).toBeCloseTo(0.02, 12)
    expect(hasContextBoxDelta({ faces: { CH: { top: { at: 0 } } } })).toBe(true)
    // 지금 변 기준 오프셋으로 풀기: 고정은 at - 지금 값.
    expect(facesOffsets({ left: 0.1, right: 0.5, top: 0.2, bottom: 0.6 }, { top: { at: 0.25 }, left: -0.01 })).toEqual({ top: expect.closeTo(0.05, 9), left: expect.closeTo(-0.01, 9) })
  })
})

// corpus(.reference-fonts)가 있을 때만: 실제 모델로 상자를 풀고 앱 획 잉크가 네 변에 닿는지 본다.
describe.skipIf(!existsSync(CORPUS))('칸 해석 — 모델', () => {
  const bundle = createNotoPresetReader(CORPUS).model()

  it.each(['가', '먈', '광', '뷁', '홋'])('%s: 부품 전부 풀리고 상자가 0~1 안에 있다', async (char) => {
    const model = await bundle
    const syllable = decompose(char)
    const identity = identityOfSyllable(syllable)!
    const resolved = resolveContextBoxes({ identity, model, syllable, ends: { linecap: DEFAULT_STYLE.linecap, linejoin: DEFAULT_STYLE.linejoin } })
    expect(resolved.issues).toEqual([])
    expect(resolved.complete).toBe(true)
    const expected = identity.finalJamo ? ['CH', 'JO'] : ['CH']
    const medialParts = 'ㅘㅙㅚㅝㅞㅟㅢ'.includes(identity.medialJamo) ? ['JU_H', 'JU_V'] : ['JU']
    expect(Object.keys(resolved.boxes).sort()).toEqual([...expected, ...medialParts].sort())
    for (const part of resolved.parts) {
      expect(part.fitted).toBe(true)
      for (const value of [part.faces.left, part.faces.top]) expect(value).toBeGreaterThanOrEqual(-0.05)
      for (const value of [part.faces.right, part.faces.bottom]) expect(value).toBeLessThanOrEqual(1.05)
    }
    // 앱 획을 이 상자에 놓으면 잉크 바깥 범위가 네 변에 온다(첫닿자).
    const ink = resolveGlyphInkPrimitives({ syllable, placement: { kind: 'boxes', boxes: resolved.boxes }, weightMultiplier: 1, globalLinecap: DEFAULT_STYLE.linecap, globalLinejoin: DEFAULT_STYLE.linejoin, horizontalInkBounds: { min: 0, max: 1 } })
    const ch = ink.primitives.filter((p) => p.source.part === 'CH')
    const final = materializeFinalGlyphInk(ch, DEFAULT_STYLE.strokeStyle, { unitsPerEm: 1000, maxCurveErrorFontUnits: 0.5 })
    expect(final.ok).toBe(true)
    if (!final.ok) return
    const points = final.ink.regions.flatMap((r) => r.outer)
    const faces = resolved.parts.find((p) => p.part === 'CH')!.faces
    expect(Math.min(...points.map((p) => p.x))).toBeCloseTo(faces.left, 3)
    expect(Math.max(...points.map((p) => p.x))).toBeCloseTo(faces.right, 3)
    expect(Math.min(...points.map((p) => p.y))).toBeCloseTo(faces.top, 3)
    expect(Math.max(...points.map((p) => p.y))).toBeCloseTo(faces.bottom, 3)
  })

  it.each(['궈', '귀', '규', '가'])('%s: 사용자 프리셋 01의 갈고리 ㄱ도 첫닿자 잉크가 나온다', async (char) => {
    // 납작한 첫닿자 상자에서 급한 곡선 오프셋이 제 몸을 지나 Boolean이 깨지던 경우.
    const model = await bundle
    const preset = createUserPreset01().choseong['ㄱ']
    const syllable = { ...decompose(char), choseong: preset }
    const identity = identityOfSyllable(syllable)!
    const faces = predictComponentFaces(identity, model, 'CH')!
    const fit = fitNotoComponent({ part: 'CH', jamo: preset, faces, glyphId: char })
    expect(fit.ok).toBe(true)
    if (!fit.ok) return
    const ink = inkOfComponentFit(fit.fit)
    expect(ink.ok ? 'ok' : ink.message).toBe('ok')
  })

  it('Δ는 네 변에 더해지고 상자는 저장값이 아니라 파생값이다', async () => {
    const model = await bundle
    const syllable = decompose('가')
    const identity = identityOfSyllable(syllable)!
    const base = resolveContextBoxes({ identity, model })
    const moved = resolveContextBoxes({ identity, model, delta: { faces: { CH: { left: -0.02 }, JU: { bottom: 0.01 } } } })
    const ch = (r: typeof base) => r.parts.find((p) => p.part === 'CH')!.faces
    const ju = (r: typeof base) => r.parts.find((p) => p.part === 'JU')!.faces
    expect(ch(moved).left).toBeCloseTo(ch(base).left - 0.02, 9)
    expect(ch(moved).right).toBeCloseTo(ch(base).right, 9)
    expect(ju(moved).bottom).toBeCloseTo(ju(base).bottom + 0.01, 9)
    // 획 없이 풀면 상자 = 네 변 그대로.
    expect(base.parts.every((p) => !p.fitted)).toBe(true)
    expect(base.boxes.CH).toEqual({ x: ch(base).left, y: ch(base).top, width: ch(base).right - ch(base).left, height: ch(base).bottom - ch(base).top })
  })

  it('변 고정 — 예측이 다른 글자들의 첫닿자 윗변이 같은 자리에 모이고, 홀자 변 고정은 slot 변이 그 자리에 간다', async () => {
    const model = await bundle
    const 노 = identityOfSyllable(decompose('노'))!
    const 로 = identityOfSyllable(decompose('로'))!
    const top = (r: ReturnType<typeof resolveContextBoxes>) => r.parts.find((p) => p.part === 'CH')!.faces.top
    const base노 = resolveContextBoxes({ identity: 노, model })
    const base로 = resolveContextBoxes({ identity: 로, model })
    // 더하기: 예측 차이가 그대로 남는다.
    const add노 = resolveContextBoxes({ identity: 노, model, delta: { faces: { CH: { top: 0.01 } } } })
    const add로 = resolveContextBoxes({ identity: 로, model, delta: { faces: { CH: { top: 0.01 } } } })
    expect(add노.parts.length).toBeGreaterThan(0)
    expect(top(add노) - top(add로)).toBeCloseTo(top(base노) - top(base로), 9)
    // 고정: 둘 다 같은 자리.
    const fix노 = resolveContextBoxes({ identity: 노, model, delta: { faces: { CH: { top: { at: 0.12 } } } } })
    const fix로 = resolveContextBoxes({ identity: 로, model, delta: { faces: { CH: { top: { at: 0.12 } } } } })
    expect(top(fix노)).toBeCloseTo(0.12, 9)
    expect(top(fix로)).toBeCloseTo(0.12, 9)
    // 홀자 변 고정: ㅗ 상자 윗변을 0.5로.
    const juTop = (r: ReturnType<typeof resolveContextBoxes>) => r.medial.find((m) => m.part === 'JU')!.fit!.slot.y
    const fixJu = resolveContextBoxes({ identity: 노, model, delta: { faces: { JU: { top: { at: 0.5 } } } } })
    expect(juTop(fixJu)).toBeCloseTo(0.5, 6)
    expect(juTop(base노)).not.toBeCloseTo(0.5, 3)
  })

  it('가: 첫닿자 네 변 Δ는 faces에 그대로 더해지고, 홀자 중심 rail Δ는 slot을 같은 만큼 옮긴다', async () => {
    const model = await bundle
    const syllable = decompose('가')
    const identity = identityOfSyllable(syllable)!
    const base = resolveContextBoxes({ identity, model, syllable })
    const moved = resolveContextBoxes({ identity, model, syllable, delta: { faces: { CH: { left: -0.02, right: 0.01 } }, medial: { JU: { 'outerPillar.center': 0.03 } } } })
    expect(moved.complete).toBe(true)
    const ch = (r: typeof base) => r.parts.find((p) => p.part === 'CH')!.faces
    expect(ch(moved).left).toBeCloseTo(ch(base).left - 0.02, 9)
    expect(ch(moved).right).toBeCloseTo(ch(base).right + 0.01, 9)
    expect(ch(moved).top).toBeCloseTo(ch(base).top, 9)
    // ㅏ의 기둥은 홀자 잉크의 왼쪽 끝이다. 기둥 중심이 30u 오른쪽으로 가면 slot 왼쪽도 30u 따라오고(보 끝은 그대로), 앱 상자도 좁아진다.
    const ju = (r: typeof base) => r.medial.find((m) => m.part === 'JU')!.fit!
    expect(ju(moved).railsEm['center-x']).toBeCloseTo(ju(base).railsEm['center-x'] + 0.03, 9)
    expect(ju(moved).slot.x).toBeCloseTo(ju(base).slot.x + 0.03, 9)
    expect(ju(moved).slot.x + ju(moved).slot.width).toBeCloseTo(ju(base).slot.x + ju(base).slot.width, 9)
    expect(moved.boxes.JU!.x).toBeGreaterThan(base.boxes.JU!.x)
    expect(moved.boxes.JU!.width).toBeLessThan(base.boxes.JU!.width)
  })

  it('가: 홀자 Δ가 순서를 뒤집으면 그 글자는 Δ를 받지 않고 모델 rail 그대로다(자동 예외)', async () => {
    const model = await bundle
    const syllable = decompose('가')
    const identity = identityOfSyllable(syllable)!
    const base = resolveContextBoxes({ identity, model, syllable })
    // 기둥 중심을 보 끝(outer-right) 너머로 보내면 보의 시작 > 끝이라 다시 놓지 못한다.
    const broken = resolveContextBoxes({ identity, model, syllable, delta: { medial: { JU: { 'outerPillar.center': 0.5 } } } })
    expect(broken.complete).toBe(true)
    expect(broken.medial.find((m) => m.part === 'JU')!.fit!.railsEm).toEqual(base.medial.find((m) => m.part === 'JU')!.fit!.railsEm)
    // 이 글자에 없는 획 역할 키(ㅏ에 안기둥 없음)도 그냥 건너뛴다.
    const missing = resolveContextBoxes({ identity, model, syllable, delta: { medial: { JU: { 'innerPillar.center': 0.05 } } } })
    expect(missing.boxes).toEqual(base.boxes)
  })
})
