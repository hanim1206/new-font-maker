import { Filter, MessageSquare, Ticket, Users } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export const ADMIN_PATH = '/admin'

export type Section = 'invite' | 'accounts' | 'feedback' | 'triage'
export const SECTIONS: { key: Section; label: string; icon: LucideIcon; hint: string }[] = [
  { key: 'invite', label: '초대', icon: Ticket, hint: '닉네임 · 메모를 적어 여러 명 한 번에' },
  { key: 'accounts', label: '계정', icon: Users, hint: '새 코드 · 정지 · 되살리기' },
  { key: 'feedback', label: '의견', icon: MessageSquare, hint: '친구가 보낸 의견 읽고 답장' },
  { key: 'triage', label: '선별', icon: Filter, hint: '의견을 묶고 걸러 보드로' },
]

/** `/admin` → 초대, `/admin/<메뉴>` → 그 메뉴. 모르는 주소는 초대. */
export function sectionOf(pathname: string): Section {
  const key = pathname.slice(ADMIN_PATH.length + 1).split('/')[0]
  return SECTIONS.some((section) => section.key === key) ? key as Section : 'invite'
}
