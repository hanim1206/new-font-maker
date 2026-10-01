import { describe, expect, it } from 'vitest'
import { calculateBoxes, DEFAULT_LAYOUT_SCHEMAS } from '../utils/layoutCalculator'
import { designBodyAxis, LEGACY_REFERENCE_BODY_PADDING, mapBoxToDesignBody, mapFacesToDesignBody, normalizeReferencePadding, NOTO_SOLO_CONSONANT_BOX, REFERENCE_BODY_PADDING } from './designBodyPlacement'

describe('네모꼴을 바꾸면 모델 상자도 같이 옮겨진다', () => {
  // 기준 틀(왼 0.05 ~ 오른 0.89) 전폭 상자
  const box = { x: 0.05, y: 0.2, width: 0.84, height: 0.4 }

  it('기본 네모꼴에서는 같은 객체를 돌려준다(아무것도 안 바뀐다)', () => {
    expect(mapBoxToDesignBody(box, { ...REFERENCE_BODY_PADDING })).toBe(box)
    expect(mapBoxToDesignBody(box, undefined)).toBe(box)
  })

  it('가로 600이면 기준 틀 전폭 상자가 사용자 틀 전폭이 된다. 세로는 그대로', () => {
    const mapped = mapBoxToDesignBody(box, { ...REFERENCE_BODY_PADDING, left: 0.2, right: 0.2 })
    expect(mapped.x).toBeCloseTo(0.2, 9)
    expect(mapped.x + mapped.width).toBeCloseTo(0.8, 9)
    expect(mapped.y).toBeCloseTo(0.2, 9)
    expect(mapped.height).toBeCloseTo(0.4, 9)
  })

  it('기본 네모꼴은 Noto 몸통이다: 위 50 · 아래 40 · 왼 50 · 오른 110', () => {
    expect(REFERENCE_BODY_PADDING).toEqual({ top: 0.05, bottom: 0.04, left: 0.05, right: 0.11 })
  })

  it('옛 기본(사방 0.075)으로 저장된 여백은 새 기본으로 읽고, 사용자가 고른 여백은 그대로 둔다', () => {
    expect(normalizeReferencePadding({ ...LEGACY_REFERENCE_BODY_PADDING })).toEqual(REFERENCE_BODY_PADDING)
    const chosen = { top: 0.1, bottom: 0.1, left: 0.2, right: 0.2 }
    expect(normalizeReferencePadding(chosen)).toBe(chosen)
  })

  it('틀 가운데는 틀 가운데로 간다', () => {
    // 기준 틀 가운데 = 왼 0.05 + 0.84 / 2, 위 0.05 + 0.91 / 2
    const mapped = mapFacesToDesignBody({ left: 0.47, right: 0.47, top: 0.505, bottom: 0.505 }, { top: 0.1, bottom: 0.3, left: 0.25, right: 0.05 })
    expect(mapped.left).toBeCloseTo(0.25 + 0.7 / 2, 9)
    expect(mapped.top).toBeCloseTo(0.1 + 0.6 / 2, 9)
  })
})

describe('편집기 좌표 옮기기(기준 틀 em ↔ 사용자 네모꼴)', () => {
  const narrow = { ...REFERENCE_BODY_PADDING, left: 0.2, right: 0.2 }

  it('기본 네모꼴이면 값을 그대로 돌려준다', () => {
    for (const padding of [undefined, { ...REFERENCE_BODY_PADDING }]) {
      const axis = designBodyAxis(padding, 'x')
      expect(axis.scale).toBe(1)
      expect(axis.to(0.3217)).toBe(0.3217)
      expect(axis.from(0.3217)).toBe(0.3217)
    }
  })

  it('상자 옮기기와 같은 자리로 가고, 되돌리면 제자리다', () => {
    const box = { x: 0.3, y: 0.2, width: 0.25, height: 0.4 }
    const mapped = mapBoxToDesignBody(box, narrow)
    const x = designBodyAxis(narrow, 'x')
    const y = designBodyAxis(narrow, 'y')
    expect(x.to(box.x)).toBeCloseTo(mapped.x, 12)
    expect(x.to(box.x + box.width)).toBeCloseTo(mapped.x + mapped.width, 12)
    expect(x.scale).toBeCloseTo(0.6 / 0.84, 12)
    expect(x.from(x.to(0.4321))).toBeCloseTo(0.4321, 12)
    // 세로는 안 바꿨다.
    expect(y.scale).toBe(1)
    expect(y.to(box.y)).toBeCloseTo(box.y, 12)
  })
})

describe('첫닿자 단독(ㄷ)은 노토 호환 자모 크기로 선다', () => {
  const soloSchema = (padding: typeof REFERENCE_BODY_PADDING) => ({ ...DEFAULT_LAYOUT_SCHEMAS['choseong-only'], padding, designBodyPadding: padding })

  it('기본 네모꼴에서는 노토 상자 그대로다 — 음절 몸통보다 한참 작다', () => {
    expect(calculateBoxes(soloSchema({ ...REFERENCE_BODY_PADDING })).CH).toEqual(NOTO_SOLO_CONSONANT_BOX)
    expect(NOTO_SOLO_CONSONANT_BOX.width).toBeLessThan(0.5)
    expect(NOTO_SOLO_CONSONANT_BOX.height).toBeLessThan(0.4)
  })

  it('네모꼴을 좁히면 같이 좁아진다', () => {
    const narrow = calculateBoxes(soloSchema({ ...REFERENCE_BODY_PADDING, left: 0.2, right: 0.2 })).CH!
    expect(narrow.width).toBeLessThan(NOTO_SOLO_CONSONANT_BOX.width)
    expect(narrow.height).toBeCloseTo(NOTO_SOLO_CONSONANT_BOX.height, 9)
  })

  it('옛 850 틀(사방 .075) 입력은 옛 스키마 해석 그대로다', () => {
    expect(calculateBoxes(soloSchema({ ...LEGACY_REFERENCE_BODY_PADDING })).CH!.width).toBeCloseTo(0.7, 9)
  })
})
