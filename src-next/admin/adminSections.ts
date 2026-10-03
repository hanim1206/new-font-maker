import { Filter, FlaskConical, ListChecks, Megaphone, MessageSquare, SquareDashed, Users } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { labBySlug } from '../labCatalog'
import type { LabEntry } from '../labCatalog'

export const ADMIN_PATH = '/admin'

/** 초대는 계정 화면에 합쳤다(`초대하기` 패널). 옛 `/admin/invite` 주소는 계정으로 간다. */
export type Section = 'accounts' | 'feedback' | 'triage' | 'announcements' | 'preset' | 'tests' | 'labs'
export const SECTIONS: { key: Section; label: string; icon: LucideIcon; hint: string }[] = [
  { key: 'accounts', label: '계정', icon: Users, hint: '초대 · 보냄 체크 · 새 코드 · 정지 · 삭제' },
  { key: 'feedback', label: '의견', icon: MessageSquare, hint: '친구가 보낸 의견 읽고 답장' },
  { key: 'triage', label: '선별', icon: Filter, hint: '의견을 묶고 걸러 보드로' },
  { key: 'announcements', label: '공지', icon: Megaphone, hint: '업데이트 팝업 만들기 · 미리보기 · 게시' },
  { key: 'preset', label: '프리셋', icon: SquareDashed, hint: '프리셋 v2 레이아웃 대푯값 고치기 · v1과 비교' },
  { key: 'tests', label: '테스트', icon: ListChecks, hint: '전체 테스트가 무엇을 검사하는지 · 지금 어디까지 돌았는지' },
  { key: 'labs', label: '실험실', icon: FlaskConical, hint: '개발용 실험 화면. 고르면 이 안에서 열려요' },
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

/** `/admin/labs/<랩>` → 그 랩(`/admin/labs/weight-lab` → 굵기 보정). 목록이거나 모르는 랩이면 null. */
export function labOf(pathname: string): LabEntry | null {
  const [key, slug] = pathname.slice(ADMIN_PATH.length + 1).split('/')
  return key === 'labs' && slug ? labBySlug(slug) : null
}

export const labPathOf = (lab: LabEntry | null) => lab ? `${ADMIN_PATH}/labs/${lab.slug}` : `${ADMIN_PATH}/labs`

/** 주소창을 메뉴 주소로 맞출 때 쓸 주소. 이미 맞으면 null(`/admin`, `/admin/invite` → `/admin/accounts`). */
export function canonicalPathOf(pathname: string): string | null {
  const account = accountOf(pathname)
  const lab = labOf(pathname)
  const path = account ? accountPathOf(account) : lab ? labPathOf(lab) : `${ADMIN_PATH}/${sectionOf(pathname)}`
  return path === pathname ? null : path
}
