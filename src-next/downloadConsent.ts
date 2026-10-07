import { create } from 'zustand'
import { authGateMode, sessionUserId, storageMode } from './betaAuth'
import type { FontPresetId } from '../src/types/database'
import { LEGAL_FIELDS } from './legal/legalInfo'
import { agreeTerms, hasAgreed, loadProfile, rememberProfile } from './profileApi'

/**
 * 다운로드 직전 동의(플랜 `2026-10-06_카카오-로그인-다운로드-게이트.md`). 규칙 부분 — 시트 화면은 `ConsentSheet.tsx`.
 * 필수 넷: 약관 · 처리방침 / 만 14세 이상 / 공개 · 홍보 / 폰트 사용 조건. 넷 다 체크해야 받는다.
 * 동의는 프로필에 약관 버전(시행일) · 라이선스 id로 남고, 둘 중 하나가 바뀌면 다시 받는다.
 * 손님은 체크한 것과 "받던 중"을 sessionStorage에 두고 카카오로 갔다 온다(`PENDING_KEY`).
 */

/** 약관 버전 = 시행일. `legalInfo.ts`의 `2026년 10월 9일`을 `2026-10-09`로. */
export function termsVersionOf(effectiveDate: string): string {
  const match = /(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/.exec(effectiveDate)
  if (!match) return effectiveDate.trim()
  return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`
}
export const TERMS_VERSION = termsVersionOf(LEGAL_FIELDS.시행일)

/** 결과물 라이선스. 프리셋마다 하나(약관 제7조 2항). 둘 다 노토 바탕이라 OFL. */
export interface FontLicense { id: string; label: string; lines: readonly string[] }
export const PRESET_LICENSE: Record<FontPresetId, FontLicense> = {
  'basic-gothic': {
    id: 'ofl-1.1',
    label: 'SIL Open Font License 1.1',
    lines: ['문서 · 이미지 · 영상 · 상품에 자유롭게, 상업적으로도 써요.', '폰트 파일 자체를 팔 수는 없어요.', '이름에 "Noto" · "Source"를 쓸 수 없어요.'],
  },
  'basic-gothic-v2': {
    id: 'ofl-1.1',
    label: 'SIL Open Font License 1.1',
    lines: ['문서 · 이미지 · 영상 · 상품에 자유롭게, 상업적으로도 써요.', '폰트 파일 자체를 팔 수는 없어요.', '이름에 "Noto" · "Source"를 쓸 수 없어요.'],
  },
}

export const CONSENT_ITEMS = ['terms', 'age', 'public', 'license'] as const
export type ConsentItem = (typeof CONSENT_ITEMS)[number]
export type ConsentChecks = Record<ConsentItem, boolean>
export const NO_CHECKS: ConsentChecks = { terms: false, age: false, public: false, license: false }
export const allChecked = (checks: ConsentChecks): boolean => CONSENT_ITEMS.every((item) => checks[item])

/** 카카오 갔다 오는 동안 남기는 것. 돌아오면 `takePendingDownload`가 읽고 지운다. */
export interface PendingDownload { fontName: string; version: string; license: string }
export const PENDING_KEY = 'font-maker-pending-download-v1'

export function savePendingDownload(storage: Storage, pending: PendingDownload): void {
  storage.setItem(PENDING_KEY, JSON.stringify(pending))
}

export function takePendingDownload(storage: Storage): PendingDownload | null {
  try {
    const value = JSON.parse(storage.getItem(PENDING_KEY) ?? 'null') as Partial<PendingDownload> | null
    storage.removeItem(PENDING_KEY)
    if (!value || typeof value.fontName !== 'string' || typeof value.version !== 'string' || typeof value.license !== 'string') return null
    return { fontName: value.fontName, version: value.version, license: value.license }
  } catch { return null }
}

/** 시트가 열려 있을 때의 요청. `resolve(true)`면 받기로 이어지고, false면 취소하거나 카카오로 떠났다. */
export interface ConsentRequest { fontName: string; license: FontLicense; guest: boolean; resolve: (agreed: boolean) => void }

interface ConsentState { request: ConsentRequest | null }
export const useConsentStore = create<ConsentState>()(() => ({ request: null }))

/**
 * 받기 전에 동의가 있는지 본다. 있으면 true로 바로 지나가고, 없으면 시트를 열고 결과를 기다린다.
 * 게이트가 꺼진 개발 서버(e2e)는 시트 없이 지나간다. 손님은 시트에서 카카오로 가므로 false — 돌아와서 다시 받는다.
 */
export async function ensureDownloadConsent(fontName: string, preset: FontPresetId): Promise<boolean> {
  if (authGateMode() === 'off') return true
  const license = PRESET_LICENSE[preset]
  const guest = storageMode() === 'local'
  if (!guest) {
    const me = await sessionUserId()
    if (me && hasAgreed(await loadProfile(me), TERMS_VERSION, license.id)) return true
  }
  return new Promise<boolean>((resolve) => {
    useConsentStore.setState({ request: { fontName, license, guest, resolve: (agreed) => { useConsentStore.setState({ request: null }); resolve(agreed) } } })
  })
}

/** 회원이 시트에서 동의했다. 프로필에 적고 기억한다. 못 적으면 false — 받지 않는다. */
export async function recordConsent(license: FontLicense): Promise<boolean> {
  const me = await sessionUserId()
  if (!me) return false
  const agreed = await agreeTerms(me, TERMS_VERSION, license.id)
  if (!agreed.ok) return false
  rememberProfile(agreed.value)
  return true
}
