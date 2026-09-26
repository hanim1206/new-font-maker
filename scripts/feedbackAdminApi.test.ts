import { expect, it } from 'vitest'
import { failureOf } from './feedbackAdminApi'

it('Supabase 오류는 문장으로, 테이블이 없으면 마이그레이션 안내', () => {
  expect(failureOf({ code: 'PGRST205', message: "Could not find the table 'public.feedback_messages'" })).toContain('20260927120000_feedback_messages.sql')
  expect(failureOf({ code: '23514', message: 'check violated' })).toBe('check violated')
  expect(failureOf(new Error('끊김'))).toBe('끊김')
})
