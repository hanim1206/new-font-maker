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

  it('묶음은 더하고 빼며, 빼면 그 묶음 글자만 빠진다', () => {
    const { add, remove } = useWorkbenchStore.getState()
    add('choseong', ['ㄲ', 'ㄸ'])
    add('choseong', ['ㅇ', 'ㅎ'])
    expect(useWorkbenchStore.getState().chars).toEqual(['ㄲ', 'ㄸ', 'ㅇ', 'ㅎ'])
    useWorkbenchStore.getState().toggle('choseong', 'ㄸ')
    remove('choseong', ['ㄲ', 'ㄸ'])
    expect(useWorkbenchStore.getState().chars).toEqual(['ㅇ', 'ㅎ'])
    remove('jungseong', ['ㅇ'])
    expect(useWorkbenchStore.getState().chars).toEqual(['ㅇ', 'ㅎ'])
    add('jungseong', ['ㅗ'])
    expect(useWorkbenchStore.getState()).toMatchObject({ type: 'jungseong', chars: ['ㅗ'] })
    remove('jungseong', ['ㅗ'])
    expect(useWorkbenchStore.getState()).toMatchObject({ type: null, chars: [] })
  })

  it('돌아갈 곳은 편집기로 들고 갈 때만 바뀌고, 한 번 꺼내면 비운다', () => {
    const store = useWorkbenchStore.getState()
    store.place('choseong', ['ㄱ', 'ㅅ'], '/dashboard/choseong?group=stem')
    useWorkbenchStore.getState().toggle('choseong', 'ㅋ')
    expect(useWorkbenchStore.getState().returnTo).toBe('/dashboard/choseong?group=stem')
    expect(useWorkbenchStore.getState().takeReturnTo()).toBe('/dashboard/choseong?group=stem')
    expect(useWorkbenchStore.getState().takeReturnTo()).toBeNull()
    // 대시보드 카드는 null로 덮는다 — 옛 홈으로 잘못 돌아가지 않는다.
    useWorkbenchStore.getState().place('choseong', ['ㄱ'], '/dashboard/choseong')
    useWorkbenchStore.getState().place('choseong', ['ㄴ'], null)
    expect(useWorkbenchStore.getState().takeReturnTo()).toBeNull()
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
