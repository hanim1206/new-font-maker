import { Filter, MessageSquare, Users } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export const ADMIN_PATH = '/admin'

/** 초대는 계정 화면에 합쳤다(`초대하기` 패널). 옛 `/admin/invite` 주소는 계정으로 간다. */
export type Section = 'accounts' | 'feedback' | 'triage'
export const SECTIONS: { key: Section; label: string; icon: LucideIcon; hint: string }[] = [
  { key: 'accounts', label: '계정', icon: Users, hint: '초대 · 보냄 체크 · 새 코드 · 정지 · 삭제' },
  { key: 'feedback', label: '의견', icon: MessageSquare, hint: '친구가 보낸 의견 읽고 답장' },
  { key: 'triage', label: '선별', icon: Filter, hint: '의견을 묶고 걸러 보드로' },
]

/** `/admin` → 계정, `/admin/<메뉴>` → 그 메뉴. 모르는 주소(옛 초대 포함)는 계정. */
export function sectionOf(pathname: string): Section {
  const key = pathname.slice(ADMIN_PATH.length + 1).split('/')[0]
  return SECTIONS.some((section) => section.key === key) ? key as Section : 'accounts'
}

/** `/admin/accounts/<이메일>` → 그 계정(폰트 미리보기). 계정 목록이면 null. */
export function accountOf(pathname: string): string | null {
  const [key, email] = pathname.slice(ADMIN_PATH.length + 1).split('/')
  return key === 'accounts' && email ? decodeURIComponent(email) : null
}

export const accountPathOf = (email: string) => `${ADMIN_PATH}/accounts/${encodeURIComponent(email)}`

/** 주소창을 메뉴 주소로 맞출 때 쓸 주소. 이미 맞으면 null(`/admin`, `/admin/invite` → `/admin/accounts`). */
export function canonicalPathOf(pathname: string): string | null {
  const account = accountOf(pathname)
  const path = account ? accountPathOf(account) : `${ADMIN_PATH}/${sectionOf(pathname)}`
  return path === pathname ? null : path
}
