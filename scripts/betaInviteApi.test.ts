import { describe, expect, it } from 'vitest'
import { BETA_INVITE_HEADER, rejectReasonOf } from './betaInviteApi'

const request = (remoteAddress: string, headers: Record<string, string> = {}) => ({
  socket: { remoteAddress },
  headers: { host: 'localhost:5173', [BETA_INVITE_HEADER]: '1', ...headers },
})

describe('로컬 발급 API 문지기', () => {
  it('이 맥에서 전용 헤더로 오면 통과', () => {
    expect(rejectReasonOf(request('127.0.0.1'))).toBeNull()
    expect(rejectReasonOf(request('::1', { origin: 'http://localhost:5173' }))).toBeNull()
  })

  it('같은 와이파이의 다른 기기는 막는다', () => {
    expect(rejectReasonOf(request('192.168.0.12'))).not.toBeNull()
  })

  it('전용 헤더가 없거나 다른 사이트에서 온 요청은 막는다', () => {
    expect(rejectReasonOf(request('127.0.0.1', { [BETA_INVITE_HEADER]: '' }))).not.toBeNull()
    expect(rejectReasonOf(request('127.0.0.1', { origin: 'https://evil.example' }))).not.toBeNull()
  })
})
