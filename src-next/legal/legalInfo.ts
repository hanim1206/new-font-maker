/**
 * 약관 · 처리방침의 빈칸. 본문(`terms.md` · `privacy.md`)의 `{이름}`을 여기 값으로 채운다.
 * 값이 비어 있으면 화면에 `{이름}`이 그대로 보인다 — 공개 전에 다 채웠는지 눈으로 확인할 수 있게.
 */
export const LEGAL_FIELDS: Record<string, string> = {
  운영자: '김한임',
  '문의 이메일': 'hangulkangul@gmail.com',
  시행일: '2026년 10월 9일',
  'Supabase 리전': '',
  '의견 보관 기간': '1년',
  '호스팅 로그 보관 기간': '30일',
}
