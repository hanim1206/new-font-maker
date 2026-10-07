import { supabase } from '../src/lib/supabase'
import type { ApiResult } from './accountFontApi'
import { storageMode } from './betaAuth'

/**
 * `public.profiles` 호출(플랜 `2026-10-06_카카오-로그인-다운로드-게이트.md`). 계정마다 한 줄 — 폰트 한도 · 약관 동의 · 탈퇴.
 * 읽기는 RLS로 내 줄만, 쓰기는 함수 둘(`agree_terms` · `withdraw`)로만. 프로필이 없으면 `ensure_profile`로 만들어 받는다.
 * 게이트가 꺼진 개발 서버와 손님은 localStorage 한 키를 본다(한도 3 — `localFontApi`와 같은 숫자).
 */

export interface Profile {
  id: string
  /** 지우지 않은 폰트 한도. 새 카카오 계정 1, 베타 계정 3. */
  fontLimit: number
  /** 동의한 약관 버전(시행일). 없으면 아직 동의 전. */
  termsVersion: string | null
  agreedAt: string | null
  /** 동의한 결과물 라이선스 id. */
  licenseId: string | null
  /** 탈퇴 시각. 비어 있으면 정상. */
  withdrawnAt: string | null
}

export const LOCAL_PROFILE_KEY = 'font-maker-local-profile-v1'
const LOCAL_LIMIT = 3

interface Row { id: string; font_limit: number; terms_version: string | null; agreed_at: string | null; license_id: string | null; withdrawn_at: string | null }

const profileOf = (row: Row): Profile => ({
  id: row.id,
  fontLimit: row.font_limit,
  termsVersion: row.terms_version,
  agreedAt: row.agreed_at,
  licenseId: row.license_id,
  withdrawnAt: row.withdrawn_at,
})

const isLocal = () => storageMode() === 'local'

function readLocal(me: string): Profile {
  const base: Profile = { id: me, fontLimit: LOCAL_LIMIT, termsVersion: null, agreedAt: null, licenseId: null, withdrawnAt: null }
  try {
    const value = JSON.parse(localStorage.getItem(LOCAL_PROFILE_KEY) ?? 'null') as Partial<Profile> | null
    return value && typeof value === 'object' ? { ...base, ...value, id: me, fontLimit: LOCAL_LIMIT } : base
  } catch { return base }
}

function writeLocal(profile: Profile): Profile {
  localStorage.setItem(LOCAL_PROFILE_KEY, JSON.stringify(profile))
  return profile
}

export async function fetchProfile(me: string): Promise<ApiResult<Profile>> {
  if (isLocal()) return { ok: true, value: readLocal(me) }
  const { data, error } = await supabase.from('profiles').select('*').eq('id', me).maybeSingle()
  if (error) return { ok: false, message: error.message }
  if (data) return { ok: true, value: profileOf(data as Row) }
  // 트리거가 못 만든 계정(트리거 전 가입 · 실패). 한 번 만들어 달라고 한다.
  const made = await supabase.rpc('ensure_profile')
  if (made.error) return { ok: false, message: made.error.message }
  return { ok: true, value: profileOf(made.data as Row) }
}

/** 다운로드 직전 동의 시트. 약관 버전(시행일)과 라이선스 id를 적는다. */
export async function agreeTerms(me: string, version: string, license: string): Promise<ApiResult<Profile>> {
  if (isLocal()) return { ok: true, value: writeLocal({ ...readLocal(me), termsVersion: version, licenseId: license, agreedAt: new Date().toISOString() }) }
  const { data, error } = await supabase.rpc('agree_terms', { version, license })
  if (error) return { ok: false, message: error.message }
  return { ok: true, value: profileOf(data as Row) }
}

/** 탈퇴. 날짜만 적는다 — 이 뒤로 폰트가 안 보이고 다음 로그인에 막힌다. */
export async function withdraw(me: string): Promise<ApiResult<Profile>> {
  if (isLocal()) return { ok: true, value: writeLocal({ ...readLocal(me), withdrawnAt: new Date().toISOString() }) }
  const { data, error } = await supabase.rpc('withdraw')
  if (error) return { ok: false, message: error.message }
  return { ok: true, value: profileOf(data as Row) }
}

/**
 * 이번 동의가 아직 유효한지. 약관 버전(시행일)이나 라이선스가 바뀌었으면 다시 받는다.
 * 손님은 프로필이 없으니 늘 false — 로그인하고 나서 적는다.
 */
export function hasAgreed(profile: Profile | null, version: string, license: string): boolean {
  return profile !== null && profile.termsVersion === version && profile.licenseId === license
}

let loaded: { me: string; promise: Promise<Profile | null> } | null = null

/** 한 세션에 한 번만 읽는다. 못 읽으면 null(화면은 기본값으로). 동의 · 탈퇴 뒤엔 `rememberProfile`로 갱신. */
export function loadProfile(me: string): Promise<Profile | null> {
  if (loaded?.me !== me) loaded = { me, promise: fetchProfile(me).then((got) => got.ok ? got.value : null).catch(() => null) }
  return loaded.promise
}

export function rememberProfile(profile: Profile): void {
  loaded = { me: profile.id, promise: Promise.resolve(profile) }
}
