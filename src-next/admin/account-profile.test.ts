import { describe, expect, it } from 'vitest'
import { nicknameProblemOf } from './accountProfile'

describe('닉네임 고치기 검사', () => {
  it('한글 1~6자만', () => {
    expect(nicknameProblemOf('민지', [])).toBeNull()
    expect(nicknameProblemOf('  민지 ', [])).toBeNull()
    expect(nicknameProblemOf('', [])).toBe('닉네임을 적어 주세요')
    expect(nicknameProblemOf('minji', [])).toBe('한글 1~6자')
    expect(nicknameProblemOf('가나다라마바사', [])).toBe('한글 1~6자')
  })

  it('다른 계정과 겹치면 안 된다. 자기 자신은 부르는 쪽이 뺀다', () => {
    expect(nicknameProblemOf('민지', ['수아', null, '민지'])).toBe('이미 있는 닉네임')
    expect(nicknameProblemOf('민지', ['수아', null])).toBeNull()
  })
})
