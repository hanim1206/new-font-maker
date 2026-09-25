import { beforeEach, describe, expect, it } from 'vitest'
import { dismissAppNotice, resetAppNoticeForTest, showAppNotice, topAppNotice, useAppNoticeStore } from './appNotice'
import { ERROR_LOG_LIMIT, isQuotaExceeded, recentErrors, recordError, resetErrorLogForTest } from './errorLog'
import { buildWorkBackup, resetWorkGuardForTest } from './workGuard'
import { editLockName, EDIT_LOCK_STEAL_KEY, takeStealRequest } from './editLock'

const memoryStorage = (entries: Record<string, string> = {}): Storage => {
  const values = new Map(Object.entries(entries))
  return {
    get length() { return values.size },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => [...values.keys()][index] ?? null,
    removeItem: (key: string) => { values.delete(key) },
    setItem: (key: string, value: string) => { values.set(key, value) },
  }
}

const top = () => topAppNotice(useAppNoticeStore.getState())

describe('아래 한 줄 알림', () => {
  beforeEach(() => resetAppNoticeForTest())

  it('한 번에 하나, 작업을 잃을 수 있는 것부터', () => {
    showAppNotice('update', { tone: 'info', message: '새 버전' })
    showAppNotice('conflict', { tone: 'error', message: '충돌' })
    expect(top()?.kind).toBe('conflict')
    dismissAppNotice('conflict')
    expect(top()?.kind).toBe('update')
  })

  it('`once`로 띄운 것은 이 탭에서 닫으면 다시 안 뜬다', () => {
    showAppNotice('update', { tone: 'info', message: '새 버전' }, { once: true })
    dismissAppNotice('update')
    showAppNotice('update', { tone: 'info', message: '새 버전' }, { once: true })
    expect(top()).toBeNull()
  })
})

describe('오류 기록', () => {
  beforeEach(() => resetErrorLogForTest())

  it('최근 10개만 남긴다', () => {
    for (let index = 0; index < ERROR_LOG_LIMIT + 3; index += 1) recordError(new Error(`e${index}`), 'event')
    expect(recentErrors()).toHaveLength(ERROR_LOG_LIMIT)
    expect(recentErrors()[0].message).toBe('Error: e3')
  })

  it('저장 공간 초과를 알아본다', () => {
    expect(isQuotaExceeded(new DOMException('full', 'QuotaExceededError'))).toBe(true)
    expect(isQuotaExceeded(new Error('QuotaExceededError'))).toBe(false)
  })
})

describe('작업 백업', () => {
  beforeEach(() => resetWorkGuardForTest())

  it('편집 화면이 없으면(스토어를 못 읽으면) 브라우저 사본 원문을 그대로 담는다', () => {
    const backup = buildWorkBackup(memoryStorage({ 'font-maker-jamo-data': '{"a":1}' }), new Date(2026, 8, 25))
    expect(backup.raw).toBe(true)
    expect(backup.fileName).toBe('내 폰트_2026-09-25.json')
    expect(backup.data).toMatchObject({ kind: 'font-maker-raw-backup', keys: { 'font-maker-jamo-data': '{"a":1}', 'font-maker-global-style': null } })
  })
})

describe('탭 잠금', () => {
  it('계정 폰트는 사람 · 폰트마다, 게이트가 꺼졌으면 사본 하나', () => {
    expect(editLockName('me', 'f1')).toBe('font-edit:me:f1')
    expect(editLockName('me', null)).toBe('font-edit:me:new')
    expect(editLockName(undefined, 'f1')).toBe('font-edit:local')
  })

  it('`여기서 열기` 표시는 한 번 읽으면 지운다', () => {
    const storage = memoryStorage({ [EDIT_LOCK_STEAL_KEY]: '1' })
    expect(takeStealRequest(storage)).toBe(true)
    expect(takeStealRequest(storage)).toBe(false)
  })
})
