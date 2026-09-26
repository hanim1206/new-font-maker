import { useCallback, useEffect, useState } from 'react'
import { authGateMode, sessionUser } from './betaAuth'
import { hasUnseenReply, readSeen, threadsOf } from './feedback'
import type { FeedbackThread } from './feedback'
import { listMyFeedback } from './feedbackApi'
import { LOCAL_OWNER } from './localFontApi'

/** 계정 페이지 · 대시보드 아바타가 같이 쓰는 계정 · 의견 훅. 게이트가 꺼지면 계정 대신 `local`. */

export interface Me { id: string; nickname: string | null; joinedAt: string | null }

export function useMe(): Me | null {
  const [me, setMe] = useState<Me | null>(null)
  useEffect(() => {
    if (authGateMode() !== 'on') { setMe({ id: LOCAL_OWNER, nickname: null, joinedAt: null }); return }
    void sessionUser().then((user) => { if (user) setMe({ id: user.id, nickname: user.nickname, joinedAt: user.createdAt }) }).catch(() => undefined)
  }, [])
  return me
}

/** 내 의견 대화. `failed`면 목록 자리에 다시 해 달라는 한 줄. */
export function useThreads(me: Me | null) {
  const [threads, setThreads] = useState<FeedbackThread[] | null>(null)
  const [failed, setFailed] = useState(false)
  const reload = useCallback(async () => {
    if (!me) return
    const listed = await listMyFeedback(me.id)
    setFailed(!listed.ok)
    if (listed.ok) setThreads(threadsOf(listed.value))
  }, [me])
  useEffect(() => { void reload() }, [reload])
  return { threads, failed, reload, setThreads }
}

/** 대시보드 아바타 빨간 점. 안 본 한임 답이 있으면 true. */
export function useUnseenReply(): boolean {
  const me = useMe()
  const { threads } = useThreads(me)
  if (!me || !threads) return false
  const seen = readSeen(window.localStorage, me.id)
  return threads.some((thread) => hasUnseenReply(thread, seen))
}

