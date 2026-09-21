import { describe, expect, it } from 'vitest'
import { criterionFor, groupsOf, JAMO_LITERATURE_GROUPS, sameGroupJamos, sameTraitJamos } from './jamoLiteratureGroups'
import type { LiteratureCriterion } from './jamoLiteratureGroups'

/**
 * 이용제 구조군 표. 출처는 `src/data/jamoLiteratureGroups.json` 하나다(옵시디언 `자모 데이터/`는 거울).
 * 아래 묶음은 표를 레포로 옮기기 전 `ReferenceGroupLabPage`에 박혀 있던 값이고, 옵시디언 노트 30장과도 대조해 같았다.
 * 이게 깨지면 표가 바뀐 것이니 옵시디언 거울도 다시 써야 한다.
 */

const FROZEN: Record<LiteratureCriterion, string[]> = {
  initialHorizontal: ['ㄱ', 'ㄴㄷㅁㅅㅇ', 'ㅈㅋ', 'ㅍㄲㅆ', 'ㄹㅂㅊㅌㄸ', 'ㅎㅃㅉ'],
  initialHorizontalNoFinal: ['ㄱ', 'ㄴㄷㅁㅅㅇ', 'ㅈ', 'ㅍㄲㅆ', 'ㅋ', 'ㄹㅂㅊㅌㄸ', 'ㅎ', 'ㅃㅉ'],
  initialVertical: ['ㄱㅅ', 'ㄴ', 'ㄷㅁㅇㅈㅋ', 'ㅍㄲㅆ', 'ㄹㅂㅊㅌㄸ', 'ㅎㅃㅉ'],
  initialVerticalNoFinal: ['ㄱㅅ', 'ㄴ', 'ㄷㅁㅇㅈ', 'ㅍㄲㅆ', 'ㅋ', 'ㄹㅂㅊㅌㄸ', 'ㅎ', 'ㅃㅉ'],
  finalHorizontalMixed: ['ㄱㄷㅁㅅㅇ', 'ㄴ', 'ㅈㅋㅍㄲ', 'ㄹㅂㅌㄳㅆ', 'ㅊㅎ', 'ㄵㄶㄺㄻㄼㄽㄾㄿㅀㅄ'],
  finalVertical: ['ㄱㄷㅁㅇ', 'ㄴ', 'ㅅㅈㅋㅍㄲ', 'ㄹㅂㅌㄳㅆ', 'ㅊㅎ', 'ㄵㄶㄺㄻㄼㄽㄾㄿㅀㅄ'],
}

describe('구조군 표', () => {
  it('기준 여섯의 묶음이 표와 같다', () => {
    for (const [criterion, frozen] of Object.entries(FROZEN) as [LiteratureCriterion, string[]][]) {
      const groups = groupsOf(criterion)
      expect(groups.map(({ id }) => id)).toEqual(frozen.map((_, index) => index + 1))
      expect(groups.map(({ jamos }) => [...jamos].sort().join(''))).toEqual(frozen.map((group) => [...group].sort().join('')))
    }
  })

  it('첫닿자 19 · 받침 27자모를 덮고, 없는 자리는 비어 있다', () => {
    expect(Object.keys(JAMO_LITERATURE_GROUPS)).toHaveLength(30)
    // 겹받침은 첫닿자가 못 된다.
    expect(JAMO_LITERATURE_GROUPS['ㄳ'].initialHorizontal).toBeUndefined()
    // ㄸ·ㅃ·ㅉ는 받침이 못 된다.
    expect(JAMO_LITERATURE_GROUPS['ㄸ'].finalVertical).toBeUndefined()
    // 높이·속공간은 30자모 모두 있다.
    expect(Object.values(JAMO_LITERATURE_GROUPS).every((record) => record.height && record.inkSpaceGroup)).toBe(true)
  })

  it('문맥이 기준을 고른다: 홀자 자리와 받침 유무까지', () => {
    expect(criterionFor('initial', 'right')).toBe('initialHorizontalNoFinal')
    expect(criterionFor('initial', 'right-final')).toBe('initialHorizontal')
    expect(criterionFor('initial', 'bottom')).toBe('initialVerticalNoFinal')
    expect(criterionFor('initial', 'bottom-final')).toBe('initialVertical')
    expect(criterionFor('final', 'bottom-final')).toBe('finalVertical')
    expect(criterionFor('final', 'mixed-final')).toBe('finalHorizontalMixed')
    // 섞임 첫닿자 기준은 표에 없어 가로모임 것을 쓴다.
    expect(criterionFor('initial', 'mixed-final')).toBe('initialHorizontal')
  })

  it('같은 구조군 자모를 뽑는다. 그 기준이 없는 자모는 빈 배열', () => {
    expect(sameGroupJamos('initialVertical', 'ㅁ').sort()).toEqual([...'ㄷㅁㅇㅈㅋ'].sort())
    expect(sameGroupJamos('initialHorizontal', 'ㄱ')).toEqual(['ㄱ'])
    expect(sameGroupJamos('initialVertical', 'ㄳ')).toEqual([])
  })

  it('속공간·높이로도 묶는다', () => {
    expect(sameTraitJamos('inkSpaceGroup', 'ㄱ')).toContain('ㅅ')
    expect(sameTraitJamos('height', 'ㅋ')).toContain('ㅎ')
    expect(sameTraitJamos('height', 'ㄱ')).not.toContain('ㅋ')
  })
})
