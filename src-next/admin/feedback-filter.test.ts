import { describe, expect, it } from 'vitest'
import { threadsOf } from '../feedback'
import { EMPTY_FEEDBACK_FILTER, matchesFeedback } from './feedbackFilter'
import type { AdminMessage } from './feedbackFilter'

const message = (id: string, thread: string, author: 'friend' | 'hanim', body: string, extra: Partial<AdminMessage> = {}): AdminMessage => ({
  id, threadId: thread, userId: 'u1', author, body, context: null, createdAt: `2026-09-28T0${id.length}:00:00Z`, readAt: null, ...extra,
})

const [pending] = threadsOf([message('a', 'a', 'friend', '아이폰에서 저장이 안 돼요', { context: { path: '/workspace', font: '둥근체', device: 'iPhone', build: 'x' } })])
const [replied] = threadsOf([message('b', 'b', 'friend', '추출 어디서 해요', { readAt: 'r' }), message('bb', 'b', 'hanim', '대시보드에서요')])
const [readOnly] = threadsOf([message('c', 'c', 'friend', '좋아요', { readAt: 'r', userId: 'u2' })])

describe('의견 검색 · 필터', () => {
  const only = (status: typeof EMPTY_FEEDBACK_FILTER.status) =>
    [pending, replied, readOnly].filter((thread) => matchesFeedback(thread, { ...EMPTY_FEEDBACK_FILTER, status }, null)).map((thread) => thread.id)

  it('상태: 새 의견 · 답장함 · 답장 안 함', () => {
    expect(only('all')).toEqual(['a', 'b', 'c'])
    expect(only('pending')).toEqual(['a'])
    expect(only('replied')).toEqual(['b'])
    expect(only('unreplied')).toEqual(['c'])
  })

  it('검색: 글 · 답장 · 닉네임 · 보낸 자리, 띄어 쓴 말은 모두', () => {
    const find = (query: string, nickname: string | null = null) => matchesFeedback(pending, { ...EMPTY_FEEDBACK_FILTER, query }, nickname)
    expect(find('저장')).toBe(true)
    expect(find('iphone 둥근체')).toBe(true)
    expect(find('저장 안드로이드')).toBe(false)
    expect(find('민지', '민지')).toBe(true)
    expect(matchesFeedback(replied, { ...EMPTY_FEEDBACK_FILTER, query: '대시보드' }, null)).toBe(true)
  })

  it('친구', () => {
    expect(matchesFeedback(readOnly, { ...EMPTY_FEEDBACK_FILTER, friend: 'u1' }, null)).toBe(false)
    expect(matchesFeedback(readOnly, { ...EMPTY_FEEDBACK_FILTER, friend: 'u2' }, null)).toBe(true)
  })
})

describe('제보 판 태그 검색', () => {
  const [reported] = threadsOf([message('d', 'd', 'friend', 'ㄲ이 뚱뚱해요', { context: { path: '/workspace/review', screen: '검수', tag: 'odd', font: null, fontId: 'f1', device: 'Mac · Chrome', build: 'x' } })])
  it('화면 이름 · 갈래 태그로도 찾는다', () => {
    expect(matchesFeedback(reported, { ...EMPTY_FEEDBACK_FILTER, query: '검수 이상해' }, null)).toBe(true)
  })
})
