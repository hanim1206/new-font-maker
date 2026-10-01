import { useEffect, useState, useSyncExternalStore } from 'react'
import { isAnnouncementRead, markAnnouncementRead, nextAnnouncement } from './announcements'
import type { AnnouncementPlace } from './announcements'
import { loadAnnouncementFeed } from './announcementApi'
import type { AnnouncementFeed } from './announcementApi'
import { SlideSheet } from './SlideSheet'

/** 한 번에 하나만. 먼저 잡은 자리가 닫을 때까지 다른 자리는 기다린다. */
let showing: string | null = null
const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
const setShowing = (id: string | null) => { showing = id; for (const listener of listeners) listener() }

/**
 * 공지 자리. 그 화면(패널)이 처음 열릴 때 이 자리의 안 읽은 공지를 하나 띄운다. 닫으면 읽음 — 이 기기에선 다시 안 뜬다.
 * 같은 자리에 여럿이면 닫을 때마다 다음 것. `paused`면 기다린다(둘러보기가 떠 있을 때).
 */
export function AnnouncementSpot({ place, paused = false }: { place: AnnouncementPlace; paused?: boolean }) {
  const [feed, setFeed] = useState<AnnouncementFeed | null>(null)
  const current = useSyncExternalStore(subscribe, () => showing)

  useEffect(() => {
    let alive = true
    void loadAnnouncementFeed().then((value) => { if (alive) setFeed(value) })
    return () => { alive = false }
  }, [])

  const next = feed && !paused
    ? nextAnnouncement(feed.announcements, place, (id) => isAnnouncementRead(window.localStorage, id), feed.signedUpAt)
    : null

  // 비었을 때만 잡는다. 이 자리가 사라지면 놓는다.
  useEffect(() => {
    if (next && showing === null) setShowing(next.id)
  }, [next, current])
  useEffect(() => () => { if (next && showing === next.id) setShowing(null) }, [next])

  if (!next || current !== next.id) return null

  const close = () => {
    // 읽음을 먼저 적는다 — 놓으면서 다시 그릴 때 다음 공지를 고른다.
    markAnnouncementRead(window.localStorage, next.id)
    setShowing(null)
  }

  return <SlideSheet
    key={next.id}
    slides={next.slides}
    label={next.title}
    eyebrow={next.title}
    centered
    testId="announcement"
    firstLabel="닫기"
    lastLabel="확인"
    onClose={close}
  />
}
