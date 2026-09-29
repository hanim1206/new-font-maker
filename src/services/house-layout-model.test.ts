import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { houseLayoutFromNoto, isHouseLayoutModel, withHouseRepresentatives, withRepresentative } from './houseLayoutModel'
import type { HouseLayoutModel } from './houseLayoutModel'
import { modelIdentityOf, predictNotoTarget } from './notoVariationModel'
import type { VariationModel } from './notoVariationModel'

const noto = (JSON.parse(readFileSync('public/noto-preset/model.json', 'utf8')) as { model: VariationModel }).model
const committed = JSON.parse(readFileSync('public/house-preset/basic-gothic-v2.json', 'utf8')) as unknown

const INITIALS = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'
const MEDIALS = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ'
const FINALS = ['', ...'ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ']
const allIdentities = () => [...INITIALS].flatMap((initial) => [...MEDIALS].flatMap((medial) => FINALS.map((final) => modelIdentityOf(initial, medial, final || null))))

describe('하우스 레이아웃 모델', () => {
  it('레포의 v2 초안은 형식이 맞고 모든 타깃 · 레이아웃을 적는다', () => {
    expect(isHouseLayoutModel(committed)).toBe(true)
    const house = committed as HouseLayoutModel
    expect(house.preset).toBe('basic-gothic-v2')
    expect(house.effectsSource).toBe('noto-measured')
    for (const [target, { layers }] of Object.entries(noto.targets)) {
      expect(Object.keys(house.representatives[target] ?? {}).sort()).toEqual(Object.keys(layers).sort())
    }
  })

  it('손댄 값이 없으면 v2 = v1: 11,172자 × 모든 타깃 예측이 같다', () => {
    const house = committed as HouseLayoutModel
    const merged = withHouseRepresentatives(noto, house)
    const unchanged = house.authored.length === 0
    let compared = 0
    for (const identity of allIdentities()) {
      for (const target of Object.keys(noto.targets)) {
        const before = predictNotoTarget(noto, target, identity)?.predicted ?? null
        const after = predictNotoTarget(merged, target, identity)?.predicted ?? null
        if (before === null) { expect(after).toBeNull(); continue }
        compared += 1
        // 손댄 값이 있으면 그 줄만 다르다.
        const authored = house.authored.find((entry) => entry.target === target && entry.layer === identity.contextId)
        expect(after).toBeCloseTo(authored && !unchanged ? before + (authored.value - authored.noto) : before, 6)
      }
    }
    expect(compared).toBeGreaterThan(100_000)
  })

  it('대푯값을 바꾸면 그 레이아웃 글자 전부가 같은 만큼 움직이고, 다른 레이아웃은 그대로다', () => {
    const house = houseLayoutFromNoto(noto, 'basic-gothic-v2', 't0')
    const target = 'initial.roleFaces.right'
    const before = noto.targets[target].layers.right.representative
    const edited = withRepresentative(house, noto, target, 'right', before + 20, 't1')
    const merged = withHouseRepresentatives(noto, edited)
    for (const [initial, medial] of [['ㄱ', 'ㅏ'], ['ㅎ', 'ㅣ'], ['ㅆ', 'ㅕ']]) {
      const identity = modelIdentityOf(initial, medial, null)
      expect(predictNotoTarget(merged, target, identity)!.predicted - predictNotoTarget(noto, target, identity)!.predicted).toBeCloseTo(20, 6)
    }
    const other = modelIdentityOf('ㄱ', 'ㅏ', 'ㄱ')
    expect(predictNotoTarget(merged, target, other)!.predicted).toBeCloseTo(predictNotoTarget(noto, target, other)!.predicted, 6)
    expect(edited.authored).toEqual([{ target, layer: 'right', noto: Math.round(before * 1000) / 1000, value: Math.round((before + 20) * 1000) / 1000, at: 't1' }])
  })

  it('노토값으로 되돌리면 손댄 목록에서 빠진다. 없는 타깃은 무시한다', () => {
    const house = houseLayoutFromNoto(noto, 'basic-gothic-v2', 't0')
    const target = 'final.roleFaces.top'
    const notoValue = noto.targets[target].layers['right-final'].representative
    const moved = withRepresentative(house, noto, target, 'right-final', notoValue - 7, 't1')
    expect(moved.authored).toHaveLength(1)
    expect(withRepresentative(moved, noto, target, 'right-final', notoValue, 't2').authored).toHaveLength(0)
    expect(withRepresentative(house, noto, 'nope', 'right', 1, 't1')).toBe(house)
    expect(withRepresentative(house, noto, target, 'right', 1, 't1')).toBe(house)
  })

  it('형식 검사', () => {
    expect(isHouseLayoutModel(null)).toBe(false)
    expect(isHouseLayoutModel({ ...(committed as object), schema: 'x' })).toBe(false)
    expect(isHouseLayoutModel({ ...(committed as object), representatives: { a: { b: 'x' } } })).toBe(false)
    expect(isHouseLayoutModel({ ...(committed as object), effectsSource: 'ours' })).toBe(false)
  })
})
