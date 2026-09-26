import { describe, expect, it } from 'vitest'
import { WELCOME_NAME_KEY, welcomeNameOf } from './betaWelcome'

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    values,
  }
}

describe('로그인 화면 인사 이름', () => {
  it('링크의 to를 부르고 기억한다', () => {
    const storage = memoryStorage()
    expect(welcomeNameOf('?to=%EB%AF%BC%EC%A7%80', storage)).toBe('민지')
    expect(storage.values.get(WELCOME_NAME_KEY)).toBe('민지')
  })

  it('링크 없이 다시 들어오면 기억한 이름', () => {
    expect(welcomeNameOf('', memoryStorage({ [WELCOME_NAME_KEY]: '준호' }))).toBe('준호')
  })

  it('새 링크가 기억을 바꾼다', () => {
    const storage = memoryStorage({ [WELCOME_NAME_KEY]: '준호' })
    expect(welcomeNameOf('?to=민지', storage)).toBe('민지')
    expect(storage.values.get(WELCOME_NAME_KEY)).toBe('민지')
  })

  it('한글 음절이 아니거나 너무 길면 부르지 않고, 기억도 덮지 않는다', () => {
    const storage = memoryStorage({ [WELCOME_NAME_KEY]: '준호' })
    expect(welcomeNameOf('?to=test1', storage)).toBe('준호')
    expect(welcomeNameOf('?to=ㅁㅈ', memoryStorage())).toBeNull()
    expect(welcomeNameOf('?to=가나다라마바사', memoryStorage())).toBeNull()
    expect(storage.values.get(WELCOME_NAME_KEY)).toBe('준호')
  })

  it('아무것도 없으면 null', () => {
    expect(welcomeNameOf('', memoryStorage())).toBeNull()
  })

  it('저장소가 막혀도 링크 이름은 부른다', () => {
    const blocked = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
    expect(welcomeNameOf('?to=민지', blocked)).toBe('민지')
    expect(welcomeNameOf('', blocked)).toBeNull()
  })
})
