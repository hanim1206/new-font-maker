/**
 * 관리자 API 부르기. 로컬 개발 서버의 미들웨어(`scripts/betaInviteApi.ts` · `feedbackAdminApi.ts`)가 받는다.
 * 서버 파일을 가져오면 node 모듈이 번들로 딸려 와서 주소 · 헤더를 옮겨 적는다.
 */
export const BETA_INVITE_API = '/api/beta-invites'
export const FEEDBACK_API = '/api/feedback'
/** 하우스 레이아웃 파일 저장(`scripts/housePresetApi.ts`). */
export const HOUSE_PRESET_API = '/api/house-preset'
/** 공지 만들기 · 게시(`scripts/announcementAdminApi.ts`). */
export const ANNOUNCEMENT_API = '/api/announcements'
/** 테스트 실행 기록 읽기(`scripts/testRunApi.ts`). */
export const TEST_RUNS_API = '/api/test-runs'
const HEADER = 'x-beta-admin'

export class AdminApiError extends Error {
  readonly body: Record<string, unknown>
  constructor(message: string, body: Record<string, unknown>) {
    super(message)
    this.body = body
  }
}

export async function adminCall<T>(api: string, method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET', payload?: unknown): Promise<T> {
  const response = await fetch(api, payload === undefined
    ? { method, headers: { [HEADER]: '1' } }
    : { method, headers: { [HEADER]: '1', 'content-type': 'application/json' }, body: JSON.stringify(payload) })
  const body = await response.json().catch(() => ({ error: `서버가 ${response.status}로 답했습니다.` }))
  if (!response.ok) throw new AdminApiError(body.error ?? '실패했습니다.', body)
  return body as T
}

/** 파일 하나를 본문 그대로 올린다(JSON이 아니다). 공지 이미지 → `{ url }`. */
export async function adminUpload<T>(api: string, file: File): Promise<T> {
  const response = await fetch(api, { method: 'POST', headers: { [HEADER]: '1', 'content-type': file.type }, body: file })
  const body = await response.json().catch(() => ({ error: `서버가 ${response.status}로 답했습니다.` }))
  if (!response.ok) throw new AdminApiError(body.error ?? '실패했습니다.', body)
  return body as T
}

export const dateOf = (iso: string | null) => iso
  ? new Date(iso).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '아직'

/** 날짜만(`9. 28.`). 보냄 체크처럼 시각이 필요 없는 칸. */
export const dayOf = (iso: string) => new Date(iso).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })
