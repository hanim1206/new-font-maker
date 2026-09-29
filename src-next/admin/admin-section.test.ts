import { describe, expect, it } from 'vitest'
import { accountOf, accountPathOf, canonicalPathOf, sectionOf } from './adminSections'

describe('관리자 주소 → 메뉴', () => {
  it('/admin은 계정', () => expect(sectionOf('/admin')).toBe('accounts'))
  it('/admin/<메뉴>는 그 메뉴', () => {
    expect(sectionOf('/admin/accounts')).toBe('accounts')
    expect(sectionOf('/admin/feedback')).toBe('feedback')
    expect(sectionOf('/admin/triage/')).toBe('triage')
  })
  it('옛 초대 주소 · 모르는 메뉴는 계정', () => {
    expect(sectionOf('/admin/invite')).toBe('accounts')
    expect(sectionOf('/admin/nope')).toBe('accounts')
  })
})

describe('주소창 맞추기', () => {
  it('/admin · 옛 초대 주소는 계정 주소로', () => {
    expect(canonicalPathOf('/admin')).toBe('/admin/accounts')
    expect(canonicalPathOf('/admin/invite')).toBe('/admin/accounts')
  })
  it('맞는 주소는 그대로', () => {
    expect(canonicalPathOf('/admin/feedback')).toBeNull()
    expect(canonicalPathOf(accountPathOf('abcd@beta.example'))).toBeNull()
  })
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
