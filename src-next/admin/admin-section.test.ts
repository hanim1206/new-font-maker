import { describe, expect, it } from 'vitest'
import { sectionOf } from './adminSections'

describe('관리자 주소 → 메뉴', () => {
  it('/admin은 초대', () => expect(sectionOf('/admin')).toBe('invite'))
  it('/admin/<메뉴>는 그 메뉴', () => {
    expect(sectionOf('/admin/accounts')).toBe('accounts')
    expect(sectionOf('/admin/feedback')).toBe('feedback')
    expect(sectionOf('/admin/triage/')).toBe('triage')
  })
  it('모르는 메뉴는 초대', () => expect(sectionOf('/admin/nope')).toBe('invite'))
})
