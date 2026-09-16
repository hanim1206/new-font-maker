import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createNotoPresetReader } from '../../scripts/reference-lab/notoPresetApi'
import { CHOSEONG_MAP, JONGSEONG_MAP, JUNGSEONG_MAP } from '../data/Hangul'
import { DEFAULT_STYLE } from '../stores/globalStyleStore'
import { decomposeSyllable } from '../utils/hangulUtils'
import { identityOfSyllable, medialPartGroups, resolveContextBoxes } from './contextBoxResolver'
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
    expect(medialPartGroups('ㅗ')?.[0]).toMatchObject({ part: 'JU', role: 'JU_HORIZONTAL' })
    expect(medialPartGroups('ㅏ')?.[0]).toMatchObject({ part: 'JU', role: 'JU_VERTICAL' })
    expect(medialPartGroups('ㅃ')).toBeNull()
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

  it('Δ는 네 변에 더해지고 상자는 저장값이 아니라 파생값이다', async () => {
    const model = await bundle
    const syllable = decompose('가')
    const identity = identityOfSyllable(syllable)!
    const base = resolveContextBoxes({ identity, model })
    const moved = resolveContextBoxes({ identity, model, delta: { CH: { left: -0.02 }, JU: { bottom: 0.01 } } })
    const ch = (r: typeof base) => r.parts.find((p) => p.part === 'CH')!.faces
    const ju = (r: typeof base) => r.parts.find((p) => p.part === 'JU')!.faces
    expect(ch(moved).left).toBeCloseTo(ch(base).left - 0.02, 9)
    expect(ch(moved).right).toBeCloseTo(ch(base).right, 9)
    expect(ju(moved).bottom).toBeCloseTo(ju(base).bottom + 0.01, 9)
    // 획 없이 풀면 상자 = 네 변 그대로.
    expect(base.parts.every((p) => !p.fitted)).toBe(true)
    expect(base.boxes.CH).toEqual({ x: ch(base).left, y: ch(base).top, width: ch(base).right - ch(base).left, height: ch(base).bottom - ch(base).top })
  })
})
