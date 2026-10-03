import { describe, expect, it } from 'vitest'
import { EMPTY_REVIEW, applyReview, fingerprintOf, isReviewFile, reviewStatusOf } from './styleReview'

describe('스타일가이드 검토판 상태', () => {
  const fp = fingerprintOf('bg-foreground text-surface')

  it('기록이 없으면 안 봄, 확정 · 요청은 지문이 같을 때만 그대로', () => {
    expect(reviewStatusOf(undefined, fp)).toBe('unseen')
    const file = applyReview(EMPTY_REVIEW, 'button.variant.default', { mark: 'ok', fingerprint: fp, at: '2026-10-03' })
    expect(reviewStatusOf(file.items['button.variant.default'], fp)).toBe('ok')
  })

  it('코드가 바뀌어 지문이 달라지면 고침(다시 봐야 함)으로 돌아간다', () => {
    const file = applyReview(EMPTY_REVIEW, 'button.size.sheet', { mark: 'request', fingerprint: fp, note: ' 높이 52로 ', at: '2026-10-03' })
    expect(file.items['button.size.sheet'].note).toBe('높이 52로')
    expect(reviewStatusOf(file.items['button.size.sheet'], fp)).toBe('request')
    expect(reviewStatusOf(file.items['button.size.sheet'], fingerprintOf('min-h-13'))).toBe('changed')
  })

  it('확정에는 요청 글을 남기지 않고, null이면 기록을 지운다 · 항목은 이름 순', () => {
    let file = applyReview(EMPTY_REVIEW, 'b', { mark: 'ok', fingerprint: fp, note: '무시', at: 'x' })
    file = applyReview(file, 'a', { mark: 'ok', fingerprint: fp, at: 'x' })
    expect(file.items.b.note).toBeUndefined()
    expect(Object.keys(file.items)).toEqual(['a', 'b'])
    expect(Object.keys(applyReview(file, 'a', null).items)).toEqual(['b'])
    expect(isReviewFile(file)).toBe(true)
    expect(isReviewFile({ version: 1, items: { a: { mark: 'maybe' } } })).toBe(false)
  })

  it('지문은 같은 글이면 같고 다르면 다르다', () => {
    expect(fingerprintOf('a', 'b')).toBe(fingerprintOf('a', 'b'))
    expect(fingerprintOf('a', 'b')).not.toBe(fingerprintOf('ab'))
  })
})
