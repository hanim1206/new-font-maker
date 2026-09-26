import { describe, expect, it } from 'vitest'
import { deviceOf, hasUnseenReply, markSeen, readSeen, threadsOf, whenText } from './feedback'
import type { FeedbackMessage } from './feedback'

const message = (over: Partial<FeedbackMessage> & Pick<FeedbackMessage, 'id' | 'threadId' | 'createdAt'>): FeedbackMessage =>
  ({ author: 'friend', body: '글', context: null, readAt: null, ...over })

describe('threadsOf', () => {
  it('첫 메시지 기준으로 묶고, 안은 오래된 순 · 대화는 최근 순', () => {
    const threads = threadsOf([
      message({ id: 'b', threadId: 'b', createdAt: '2026-09-26T01:00:00Z' }),
      message({ id: 'a2', threadId: 'a', createdAt: '2026-09-27T02:00:00Z', author: 'hanim' }),
      message({ id: 'a', threadId: 'a', createdAt: '2026-09-25T00:00:00Z' }),
    ])
    expect(threads.map((thread) => thread.id)).toEqual(['a', 'b'])
    expect(threads[0].messages.map((m) => m.id)).toEqual(['a', 'a2'])
    expect(threads[0].first.id).toBe('a')
  })

  it('답이 있으면 replied, 읽기만 했으면 read, 아니면 sent', () => {
    const [replied, read, sent] = threadsOf([
      message({ id: 'r', threadId: 'r', createdAt: '2026-09-27T03:00:00Z' }),
      message({ id: 'r2', threadId: 'r', createdAt: '2026-09-27T04:00:00Z', author: 'hanim' }),
      message({ id: 'd', threadId: 'd', createdAt: '2026-09-27T02:00:00Z', readAt: '2026-09-27T02:30:00Z' }),
      message({ id: 's', threadId: 's', createdAt: '2026-09-27T01:00:00Z' }),
    ])
    expect([replied.status, read.status, sent.status]).toEqual(['replied', 'read', 'sent'])
    expect(replied.lastReplyAt).toBe('2026-09-27T04:00:00Z')
  })

  it('첫 메시지가 없는 대화는 뺀다', () => {
    expect(threadsOf([message({ id: 'x', threadId: 'gone', createdAt: '2026-09-27T00:00:00Z' })])).toEqual([])
  })
})

describe('빨간 점', () => {
  const [thread] = threadsOf([
    message({ id: 't', threadId: 't', createdAt: '2026-09-27T00:00:00Z' }),
    message({ id: 't2', threadId: 't', createdAt: '2026-09-27T05:00:00Z', author: 'hanim' }),
  ])

  it('답 뒤에 열어 봤으면 사라진다', () => {
    expect(hasUnseenReply(thread, {})).toBe(true)
    expect(hasUnseenReply(thread, { t: '2026-09-27T04:00:00Z' })).toBe(true)
    expect(hasUnseenReply(thread, { t: '2026-09-27T05:00:00Z' })).toBe(false)
  })

  it('본 때는 계정마다 따로 적는다', () => {
    const data = new Map<string, string>()
    const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value) } }
    markSeen(storage, 'me', 't', '2026-09-27T06:00:00Z')
    expect(readSeen(storage, 'me')).toEqual({ t: '2026-09-27T06:00:00Z' })
    expect(readSeen(storage, 'other')).toEqual({})
  })
})

it('기기 이름은 짧게', () => {
  expect(deviceOf('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1')).toBe('iPhone · Safari')
  expect(deviceOf('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/140.0 Safari/537.36')).toBe('Mac · Chrome')
  expect(deviceOf('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) KAKAOTALK 10.8.0')).toBe('iPhone · 카톡')
})

it('때는 오늘 · 어제 · 날짜', () => {
  const now = new Date(2026, 8, 27, 12)
  expect(whenText(new Date(2026, 8, 27, 9).toISOString(), now)).toBe('오늘')
  expect(whenText(new Date(2026, 8, 26, 23).toISOString(), now)).toBe('어제')
  expect(whenText(new Date(2026, 8, 20, 9).toISOString(), now)).toBe('9월 20일')
  expect(whenText(new Date(2026, 8, 27, 21, 5).toISOString(), now, true)).toBe('오늘 오후 9:05')
})
