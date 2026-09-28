import { describe, expect, it } from 'vitest'
import { accountOf, accountPathOf, sectionOf } from './adminSections'

describe('관리자 주소 → 메뉴', () => {
  it('/admin은 초대', () => expect(sectionOf('/admin')).toBe('invite'))
  it('/admin/<메뉴>는 그 메뉴', () => {
    expect(sectionOf('/admin/accounts')).toBe('accounts')
    expect(sectionOf('/admin/feedback')).toBe('feedback')
    expect(sectionOf('/admin/triage/')).toBe('triage')
  })
  it('모르는 메뉴는 초대', () => expect(sectionOf('/admin/nope')).toBe('invite'))
})

describe('계정 상세 주소', () => {
  it('/admin/accounts/<이메일>은 계정 메뉴의 그 계정', () => {
    const path = accountPathOf('abcd@beta.example')
    expect(sectionOf(path)).toBe('accounts')
    expect(accountOf(path)).toBe('abcd@beta.example')
  })
  it('목록 · 다른 메뉴는 계정 없음', () => {
    expect(accountOf('/admin/accounts')).toBeNull()
    expect(accountOf('/admin/accounts/')).toBeNull()
    expect(accountOf('/admin/feedback/abcd@beta.example')).toBeNull()
  })
})
