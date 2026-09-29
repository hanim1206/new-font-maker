import { describe, expect, it } from 'vitest'
import {
  announcementDraftProblem, announcementOf, isAnnouncementRead, markAnnouncementRead, nextAnnouncement,
} from './announcements'
import type { Announcement } from './announcements'

const slide = { image: '', title: '붓 크기', body: '트랙패드로 붓 크기를 바꿔요.' }

function announcement(id: string, patch: Partial<Announcement> = {}): Announcement {
  return {
    id, title: id, place: 'dashboard', slides: [slide], status: 'published',
    publishedAt: '2026-09-29T10:00:00Z', createdAt: '2026-09-29T09:00:00Z', updatedAt: '2026-09-29T09:00:00Z',
    ...patch,
  }
}

const unread = () => false

describe('nextAnnouncement', () => {
  it('이 자리의 게시 중인 공지만, 오래된 것부터 하나', () => {
    const list = [
      announcement('new', { publishedAt: '2026-09-29T12:00:00Z' }),
      announcement('old', { publishedAt: '2026-09-29T11:00:00Z' }),
      announcement('elsewhere', { place: 'review', publishedAt: '2026-09-29T08:00:00Z' }),
      announcement('draft', { status: 'draft', publishedAt: null }),
      announcement('archived', { status: 'archived', publishedAt: '2026-09-29T07:00:00Z' }),
    ]
    expect(nextAnnouncement(list, 'dashboard', unread, null)?.id).toBe('old')
  })

  it('읽은 공지는 건너뛴다', () => {
    const list = [announcement('a', { publishedAt: '2026-09-29T11:00:00Z' }), announcement('b', { publishedAt: '2026-09-29T12:00:00Z' })]
    expect(nextAnnouncement(list, 'dashboard', (id) => id === 'a', null)?.id).toBe('b')
    expect(nextAnnouncement(list, 'dashboard', () => true, null)).toBeNull()
  })

  it('가입보다 먼저 게시된 공지는 새 사람에게 안 띄운다', () => {
    const list = [announcement('before', { publishedAt: '2026-09-20T00:00:00Z' }), announcement('after', { publishedAt: '2026-09-30T00:00:00Z' })]
    expect(nextAnnouncement(list, 'dashboard', unread, '2026-09-25T00:00:00Z')?.id).toBe('after')
    expect(nextAnnouncement(list, 'dashboard', unread, null)?.id).toBe('before')
  })

  it('장이 없는 공지는 안 띄운다', () => {
    expect(nextAnnouncement([announcement('empty', { slides: [] })], 'dashboard', unread, null)).toBeNull()
  })
})

describe('읽음 표시', () => {
  it('닫으면 그 공지만 읽음', () => {
    const map = new Map<string, string>()
    const storage = { getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, value: string) => { map.set(key, value) } }
    markAnnouncementRead(storage, 'a')
    expect(isAnnouncementRead(storage, 'a')).toBe(true)
    expect(isAnnouncementRead(storage, 'b')).toBe(false)
    expect([...map.keys()]).toEqual(['announcement-read:a'])
  })

  it('저장소가 막혀도 던지지 않는다', () => {
    const blocked = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
    expect(isAnnouncementRead(blocked, 'a')).toBe(false)
    expect(() => markAnnouncementRead(blocked, 'a')).not.toThrow()
  })
})

describe('announcementDraftProblem', () => {
  it('이름 · 자리 · 장을 본다', () => {
    expect(announcementDraftProblem({ title: '붓', place: 'style.brush', slides: [slide] })).toBeNull()
    expect(announcementDraftProblem({ title: ' ', place: 'style.brush', slides: [slide] })).toMatch('공지 이름')
    expect(announcementDraftProblem({ title: '붓', place: 'nowhere' as never, slides: [slide] })).toMatch('자리')
    expect(announcementDraftProblem({ title: '붓', place: 'style.brush', slides: [] })).toMatch('장을 하나')
    expect(announcementDraftProblem({ title: '붓', place: 'style.brush', slides: [{ ...slide, title: '' }] })).toMatch('1번째 장 제목')
  })
})

describe('announcementOf', () => {
  it('모르는 자리는 버리고, 깨진 장은 빼고 받는다', () => {
    const row = { id: 'a', title: 'a', status: 'published' as const, published_at: null, created_at: '', updated_at: '' }
    expect(announcementOf({ ...row, place: 'nowhere', slides: [] })).toBeNull()
    expect(announcementOf({ ...row, place: 'dashboard', slides: [slide, { title: 1 }, null] })?.slides).toEqual([slide])
  })
})
