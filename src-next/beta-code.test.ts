import { describe, expect, it } from 'vitest'
import {
  BETA_CODE_ALPHABET,
  betaCredentialsOf,
  betaInviteLinkOf,
  betaInviteMessage,
  formatBetaCode,
  generateBetaCode,
  normalizeBetaCode,
} from './betaCode'

describe('베타 초대 코드', () => {
  it('헷갈리는 글자 0 O 1 I L이 없는 31자다', () => {
    expect(BETA_CODE_ALPHABET).toHaveLength(31)
    for (const char of '0O1IL') expect(BETA_CODE_ALPHABET).not.toContain(char)
  })

  it('소문자 · 공백 · 하이픈이 섞여도 같은 코드로 편다', () => {
    expect(normalizeBetaCode('K7QM-4XPA-9TRD')).toBe('K7QM4XPA9TRD')
    expect(normalizeBetaCode(' k7qm 4xpa-9trd ')).toBe('K7QM4XPA9TRD')
    expect(normalizeBetaCode('k7qm4xpa9trd')).toBe('K7QM4XPA9TRD')
  })

  it('길이가 틀리거나 없는 글자가 있으면 null', () => {
    expect(normalizeBetaCode('K7QM-4XPA')).toBeNull()
    expect(normalizeBetaCode('K7QM-4XPA-9TRDX')).toBeNull()
    expect(normalizeBetaCode('K7QM-4XPA-9TR0')).toBeNull()
    expect(normalizeBetaCode('')).toBeNull()
  })

  it('앞 네 글자가 계정 이름, 하이픈 넣은 코드 전체가 비번', () => {
    expect(betaCredentialsOf('k7qm 4xpa 9trd', 'beta.example')).toEqual({ email: 'k7qm@beta.example', password: 'K7QM-4XPA-9TRD' })
    expect(betaCredentialsOf('K7QM-4XPA')).toBeNull()
  })

  it('만든 코드는 늘 모양이 맞고, 쏠린 바이트(248 이상)는 버린다', () => {
    let calls = 0
    // 첫 호출은 전부 버려질 바이트, 다음부터는 0..11.
    const bytes = (length: number) => {
      calls += 1
      return calls === 1 ? new Uint8Array(length).fill(250) : Uint8Array.from({ length }, (_, index) => index)
    }
    const code = generateBetaCode(bytes)
    expect(code).toBe(formatBetaCode(BETA_CODE_ALPHABET.slice(0, 12)))
    expect(calls).toBe(2)
    for (let index = 0; index < 50; index += 1) {
      expect(normalizeBetaCode(generateBetaCode((length) => crypto.getRandomValues(new Uint8Array(length))))).not.toBeNull()
    }
  })

  it('초대 메시지 한 통에 링크 · 코드 · 제보 안내가 들어가고, 설치 안내는 있을 때만', () => {
    const base = { nickname: '민지', code: 'K7QM-4XPA-9TRD', appUrl: 'https://font.example' }
    const withoutGuide = betaInviteMessage(base)
    expect(withoutGuide).toContain('민지님')
    expect(withoutGuide).toContain('https://font.example/?to=%EB%AF%BC%EC%A7%80')
    expect(withoutGuide).toContain('K7QM-4XPA-9TRD')
    expect(withoutGuide).toContain('피드백은 한임에게')
    expect(withoutGuide).not.toContain('설치')
    expect(betaInviteMessage({ ...base, installGuideUrl: 'https://guide.example' })).toContain('3. 받은 폰트 설치하는 법: https://guide.example')
  })

  it('초대 링크에 이름이 `to`로 붙고, 앱 주소의 다른 파라미터는 남는다', () => {
    const link = betaInviteLinkOf('https://font.example/?ref=kakao', '민지')
    expect(new URL(link).searchParams.get('to')).toBe('민지')
    expect(new URL(link).searchParams.get('ref')).toBe('kakao')
  })
})
