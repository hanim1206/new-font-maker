import { beforeEach, describe, expect, it } from 'vitest'
import { useWorkbenchStore, workbenchJamoOf, workbenchSyllable } from './workbenchStore'

describe('도마', () => {
  beforeEach(() => useWorkbenchStore.getState().clear())

  it('올리면 ㄱㄴㄷ 순으로 정렬되고 중복은 하나만 남는다', () => {
    useWorkbenchStore.getState().place('choseong', ['ㅋ', 'ㄱ', 'ㄱ', 'ㄲ'])
    expect(useWorkbenchStore.getState()).toMatchObject({ type: 'choseong', chars: ['ㄱ', 'ㄲ', 'ㅋ'] })
  })

  it('카드 탭은 담기 · 빼기이고, 다른 종류면 도마를 그 하나로 바꾼다', () => {
    const { toggle } = useWorkbenchStore.getState()
    toggle('choseong', 'ㅅ')
    toggle('choseong', 'ㄱ')
    expect(useWorkbenchStore.getState().chars).toEqual(['ㄱ', 'ㅅ'])
    toggle('choseong', 'ㅅ')
    expect(useWorkbenchStore.getState().chars).toEqual(['ㄱ'])
    toggle('jungseong', 'ㅗ')
    expect(useWorkbenchStore.getState()).toMatchObject({ type: 'jungseong', chars: ['ㅗ'] })
    toggle('jungseong', 'ㅗ')
    expect(useWorkbenchStore.getState()).toMatchObject({ type: null, chars: [] })
  })

  it('대표 글자는 초성엔 ㅏ, 홀자엔 ㅇ, 받침엔 아', () => {
    expect(workbenchSyllable('choseong', 'ㄱ')).toBe('가')
    expect(workbenchSyllable('jungseong', 'ㅘ')).toBe('와')
    expect(workbenchSyllable('jongseong', 'ㄳ')).toBe('앇')
  })

  it('글자에서 도마 종류의 자소를 꺼낸다', () => {
    expect(workbenchJamoOf('choseong', '카')).toBe('ㅋ')
    expect(workbenchJamoOf('jungseong', '카')).toBe('ㅏ')
    expect(workbenchJamoOf('jongseong', '카')).toBeNull()
    expect(workbenchJamoOf('jongseong', '각')).toBe('ㄱ')
    expect(workbenchJamoOf('choseong', 'ㄱ')).toBe('ㄱ')
  })
})
