import { useEffect, useState } from 'react'
import { FONT_LIMIT } from './accountFont'
import { loadProfile } from './profileApi'
import type { Profile } from './profileApi'

/** 내 프로필. 읽기 전이거나 못 읽으면 null — 한도는 `fontLimitOf`로 기본값을 쓴다. */
export function useProfile(me: string | null): Profile | null {
  const [profile, setProfile] = useState<Profile | null>(null)
  useEffect(() => {
    if (!me) return
    let alive = true
    void loadProfile(me).then((got) => { if (alive) setProfile(got) })
    return () => { alive = false }
  }, [me])
  return profile
}

/** 화면에 쓰는 폰트 한도. 프로필을 아직 못 읽었으면 옛 기본값(3). */
export const fontLimitOf = (profile: Profile | null): number => profile?.fontLimit ?? FONT_LIMIT
