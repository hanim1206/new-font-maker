/**
 * 스타일 가이드 미리보기에서 고르는 화면 목록. 평소 화면은 주소로, 상황 화면(오류 · 잠김 · 로그인 등)은
 * 개발 서버의 `?preview=<key>`로 연다(`devPreview.tsx`). 상황 화면을 더하면 두 곳을 같이 고친다.
 */
export interface PreviewCase { label: string; route: string }
export interface PreviewCaseGroup { label: string; cases: PreviewCase[] }

export const PREVIEW_SITUATIONS = [
  { key: 'not-found', label: '없는 주소 (404)', group: '오류' },
  { key: 'error', label: '오류 화면', group: '오류' },
  { key: 'migration', label: '옛 작업을 못 옮김', group: '오류' },
  { key: 'font-failed-network', label: '폰트 못 불러옴 · 연결', group: '오류' },
  { key: 'font-failed-invalid', label: '폰트 못 불러옴 · 읽기', group: '오류' },
  { key: 'auth-misconfigured', label: '서버 설정 빠짐', group: '오류' },
  { key: 'edit-locked', label: '다른 탭에서 편집 중', group: '탭 잠김' },
  { key: 'edit-lost', label: '다른 탭에 넘겨줌', group: '탭 잠김' },
  { key: 'login', label: '로그인 (카카오)', group: '로그인 · 탈퇴' },
  { key: 'login-code', label: '로그인 (베타 초대 코드)', group: '로그인 · 탈퇴' },
  { key: 'copy-choice', label: '로그인 뒤 사본 고르기', group: '로그인 · 탈퇴' },
  { key: 'withdrawn', label: '탈퇴한 계정', group: '로그인 · 탈퇴' },
  { key: 'withdrawn-now', label: '방금 탈퇴', group: '로그인 · 탈퇴' },
] as const

export type PreviewSituation = typeof PREVIEW_SITUATIONS[number]['key']

const situationsOf = (group: string): PreviewCase[] =>
  PREVIEW_SITUATIONS.filter((situation) => situation.group === group).map(({ key, label }) => ({ label, route: `/dashboard?preview=${key}` }))

export const PREVIEW_CASE_GROUPS: PreviewCaseGroup[] = [
  {
    label: '대시보드',
    cases: [
      { label: '내 폰트', route: '/dashboard' },
      { label: '섹션 홈 · 초성', route: '/dashboard/choseong' },
      { label: '섹션 홈 · 중성', route: '/dashboard/jungseong' },
      { label: '섹션 홈 · 종성', route: '/dashboard/jongseong' },
    ],
  },
  {
    label: '편집',
    cases: [
      { label: '스타일', route: '/workspace/font' },
      { label: '레이아웃 편집', route: '/workspace/jamo' },
      { label: '자소 편집', route: '/workspace/jamo?char=간&mode=stroke' },
      { label: '검수', route: '/workspace/review' },
      { label: '폰트 완성', route: '/workspace/font/export' },
    ],
  },
  {
    label: '계정',
    cases: [
      { label: '계정', route: '/account' },
      { label: '내가 보낸 의견', route: '/account/feedback' },
    ],
  },
  {
    label: '약관',
    cases: [
      { label: '이용약관', route: '/terms' },
      { label: '개인정보 처리방침', route: '/privacy' },
    ],
  },
  { label: '오류', cases: situationsOf('오류') },
  { label: '탭 잠김', cases: situationsOf('탭 잠김') },
  { label: '로그인 · 탈퇴', cases: situationsOf('로그인 · 탈퇴') },
]

/** 목록 오른쪽에 붙일 주소. 상황 화면은 `?preview=` 쪽만. */
export function previewHintOf(route: string): string {
  const preview = route.match(/\?preview=.*/)
  return preview ? preview[0] : route
}
