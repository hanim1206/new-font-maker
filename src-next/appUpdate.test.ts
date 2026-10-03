import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('virtual:pwa-register', () => ({ registerSW: () => async () => {} }))

const { applyUpdateIfSafe, markUpdateReady, resetAppUpdateForTest, setPointerDownForTest, watchAppUpdate } = await import('./appUpdate')
const { resetAppNoticeForTest, topAppNotice, useAppNoticeStore } = await import('./appNotice')
const { registerWorkGuard, resetWorkGuardForTest } = await import('./workGuard')
const { useRouteStore } = await import('./router')

const top = () => topAppNotice(useAppNoticeStore.getState())
const flushed = (ok: boolean, calls: string[]) => registerWorkGuard({
  flush: async () => { calls.push('flush'); return ok },
  collect: () => ({}),
  name: () => null,
  suspend: () => {},
})

/** 플랜 `2026-10-03_새-버전-조용히-적용` G1: 화면 옮김 · 끄는 중 건너뛰기 · 저장 실패. */
describe('새 버전 조용히 적용', () => {
  beforeEach(() => {
    resetAppUpdateForTest()
    resetAppNoticeForTest()
    resetWorkGuardForTest()
  })
  afterEach(() => vi.unstubAllGlobals())

  it('새 버전이 없으면 아무것도 안 한다', async () => {
    const calls: string[] = []
    flushed(true, calls)
    expect(await applyUpdateIfSafe()).toBe(false)
    expect(calls).toEqual([])
  })

  it('화면을 옮기면 저장한 뒤 새로고침하고, 알림은 없다', async () => {
    vi.stubGlobal('window', Object.assign(new EventTarget(), { location: { href: 'http://localhost/workspace/jamo' } }))
    vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'visible' }))
    watchAppUpdate()
    const calls: string[] = []
    flushed(true, calls)
    const reloaded = new Promise<void>((resolve) => {
      markUpdateReady(async () => { calls.push('reload'); resolve() })
    })
    useRouteStore.setState({ pathname: '/dashboard', key: '/dashboard' })
    await reloaded
    expect(calls).toEqual(['flush', 'reload'])
    expect(top()).toBeNull()
  })

  it('끄는 중(포인터 눌림)이면 건너뛰고, 손을 떼면 다음 순간에 바꾼다', async () => {
    const calls: string[] = []
    flushed(true, calls)
    markUpdateReady(async () => { calls.push('reload') })
    setPointerDownForTest(1, true)
    expect(await applyUpdateIfSafe()).toBe(false)
    expect(calls).toEqual([])
    setPointerDownForTest(1, false)
    expect(await applyUpdateIfSafe()).toBe(true)
    expect(calls).toEqual(['flush', 'reload'])
  })

  it('저장을 못 하면 새로고침하지 않고 오류 알림을 띄운다', async () => {
    const calls: string[] = []
    flushed(false, calls)
    markUpdateReady(async () => { calls.push('reload') })
    expect(await applyUpdateIfSafe()).toBe(false)
    expect(calls).toEqual(['flush'])
    expect(top()).toMatchObject({ kind: 'update', notice: { tone: 'error' } })
  })
})
