import { describe, expect, it } from 'vitest'
import { BETA_GUIDE_KEY, markBetaGuidePending, markBetaGuideSeen, shouldShowBetaGuide } from './betaGuide'

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    values,
  }
}

describe('처음 들어온 사람 안내', () => {
  it('로그인하면 띄우고, 닫으면 다시 안 띄운다', () => {
    const storage = memoryStorage()
    expect(shouldShowBetaGuide('', storage)).toBe(false)
    markBetaGuidePending(storage)
    expect(shouldShowBetaGuide('', storage)).toBe(true)
    markBetaGuideSeen(storage)
    expect(shouldShowBetaGuide('', storage)).toBe(false)
  })

  it('이 기기에서 본 사람은 다시 로그인해도 안 띄운다', () => {
    const storage = memoryStorage({ [BETA_GUIDE_KEY]: 'seen' })
    markBetaGuidePending(storage)
    expect(shouldShowBetaGuide('', storage)).toBe(false)
  })

  it('?guide면 본 사람도 띄운다', () => {
    expect(shouldShowBetaGuide('?guide', memoryStorage({ [BETA_GUIDE_KEY]: 'seen' }))).toBe(true)
  })

  it('저장소가 막혀도 죽지 않는다', () => {
    const blocked = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
    markBetaGuidePending(blocked)
    expect(shouldShowBetaGuide('', blocked)).toBe(false)
  })
})
