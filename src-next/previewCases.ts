/**
 * 스타일 가이드 미리보기에서 고르는 화면 목록. 평소 화면은 주소로, 상황 화면(오류 · 잠김 · 로그인 등)은
 * 개발 서버의 `?preview=<key>`로 연다(`devPreview.tsx`). 상황 화면을 더하면 두 곳을 같이 고친다.
 */
export interface PreviewCase { label: string; route: string }
export interface PreviewCaseGroup { label: string; cases: PreviewCase[] }

export const PREVIEW_SITUATIONS = [
  { key: 'not-found', label: '없는 주소 (404)' },
  { key: 'error', label: '오류 화면' },
  { key: 'migration', label: '옛 작업을 못 옮김' },
  { key: 'edit-locked', label: '다른 탭에서 편집 중' },
  { key: 'edit-lost', label: '다른 탭에 넘겨줌' },
  { key: 'font-failed-network', label: '폰트 못 불러옴 · 연결' },
  { key: 'font-failed-invalid', label: '폰트 못 불러옴 · 읽기' },
  { key: 'auth-misconfigured', label: '서버 설정 빠짐' },
  { key: 'login', label: '로그인 (카카오)' },
  { key: 'login-code', label: '로그인 (베타 초대 코드)' },
  { key: 'copy-choice', label: '로그인 뒤 사본 고르기' },
  { key: 'withdrawn', label: '탈퇴한 계정' },
  { key: 'withdrawn-now', label: '방금 탈퇴' },
] as const

export type PreviewSituation = typeof PREVIEW_SITUATIONS[number]['key']

export const PREVIEW_CASE_GROUPS: PreviewCaseGroup[] = [
  {
    label: '화면',
    cases: [
      { label: '대시보드', route: '/dashboard' },
      { label: '섹션 홈 · 초성', route: '/dashboard/choseong' },
      { label: '스타일', route: '/workspace/font' },
      { label: '레이아웃 편집', route: '/workspace/jamo' },
      { label: '자소 편집', route: '/workspace/jamo?char=간&mode=stroke' },
      { label: '검수', route: '/workspace/review' },
      { label: '폰트 완성', route: '/workspace/font/export' },
      { label: '계정', route: '/account' },
      { label: '내가 보낸 의견', route: '/account/feedback' },
      { label: '이용약관', route: '/terms' },
      { label: '개인정보 처리방침', route: '/privacy' },
    ],
  },
  { label: '상황', cases: PREVIEW_SITUATIONS.map(({ key, label }) => ({ label, route: `/dashboard?preview=${key}` })) },
]
