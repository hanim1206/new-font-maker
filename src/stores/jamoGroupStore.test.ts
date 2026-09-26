import { describe, expect, it } from 'vitest'
import { groupBeakResolverOf, groupMatching, groupStemBeakFor, type JamoGroup } from './jamoGroupStore'
import type { StemBeakStyle } from '../services/stemBeak'

const slab: StemBeakStyle = { enabled: true, shape: 'slab', size: 1, angle: 25 }
const round: StemBeakStyle = { enabled: true, shape: 'round', size: 1, angle: 25 }
const off: StemBeakStyle = { enabled: false, shape: 'angled', size: 1, angle: 25 }

const group = (id: string, chars: string[], stemBeak?: StemBeakStyle, styledAt?: number): JamoGroup => ({ id, name: id, type: 'choseong', chars, stemBeak, styledAt })

describe('사용자 묶음 부리', () => {
  it('부리를 가진 묶음이 없으면 전역을 따른다', () => {
    expect(groupStemBeakFor([group('a', ['ㄱ', 'ㅋ'])], 'choseong', 'ㄱ')).toBeUndefined()
  })

  it('두 묶음에 들면 글자 수가 적은 묶음이 이긴다', () => {
    const groups = [group('삐침', ['ㄱ', 'ㄲ', 'ㅋ', 'ㅅ', 'ㅆ', 'ㅈ', 'ㅉ', 'ㅊ'], slab, 2), group('내 부리', ['ㄱ', 'ㄲ', 'ㅋ'], round, 1)]
    expect(groupStemBeakFor(groups, 'choseong', 'ㄱ')).toBe(round)
    expect(groupStemBeakFor(groups, 'choseong', 'ㅅ')).toBe(slab)
  })

  it('크기가 같으면 나중에 값을 준 쪽이 이긴다', () => {
    const groups = [group('a', ['ㄱ', 'ㅋ'], slab, 5), group('b', ['ㄱ', 'ㄴ'], round, 3)]
    expect(groupStemBeakFor(groups, 'choseong', 'ㄱ')).toBe(slab)
  })

  it('꺼진 부리도 값이다 — 전역 부리를 뺀다', () => {
    expect(groupStemBeakFor([group('a', ['ㄱ'], off)], 'choseong', 'ㄱ')).toBe(off)
  })

  it('묶음을 이름으로 가리킨다 — 글자를 넣으면 그 글자도 따른다', () => {
    const before = [group('a', ['ㄱ', 'ㅋ'], slab)]
    expect(groupStemBeakFor(before, 'choseong', 'ㅊ')).toBeUndefined()
    const after = [{ ...before[0], chars: ['ㄱ', 'ㅊ', 'ㅋ'] }]
    expect(groupStemBeakFor(after, 'choseong', 'ㅊ')).toBe(slab)
  })

  it('미리보기는 그 묶음의 값을 잠시 바꾼다', () => {
    const groups = [group('a', ['ㄱ', 'ㅋ'], slab)]
    expect(groupStemBeakFor(groups, 'choseong', 'ㄱ', { groupId: 'a', beak: round })).toBe(round)
  })

  it('종류가 다른 자소는 따르지 않는다', () => {
    const resolve = groupBeakResolverOf([group('a', ['ㄱ'], slab)])
    expect(resolve({ kind: 'stroke', glyphId: '각', part: 'CH', channel: 'strokes', jamoId: 'ㄱ', strokeId: 's' })).toBe(slab)
    expect(resolve({ kind: 'stroke', glyphId: '각', part: 'JO', channel: 'strokes', jamoId: 'ㄱ', strokeId: 's' })).toBeUndefined()
  })

  it('도마와 글자가 똑같은 묶음을 찾는다(순서 무관)', () => {
    const groups = [group('a', ['ㄱ', 'ㅋ'])]
    expect(groupMatching(groups, 'choseong', ['ㅋ', 'ㄱ'])?.id).toBe('a')
    expect(groupMatching(groups, 'choseong', ['ㄱ'])).toBeNull()
  })
})
