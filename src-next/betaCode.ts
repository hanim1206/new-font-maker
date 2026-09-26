/**
 * 베타 초대 코드. 친구는 이메일 없이 카톡으로 받은 코드 하나로 들어온다.
 *
 * 코드 `K7QM-4XPA-9TRD`의 앞 네 글자가 계정 이름, 코드 전체가 비번이다.
 * 앱은 `k7qm@<가짜 도메인>`으로 Supabase에 로그인한다 — 코드와 계정을 잇는 표가 따로 없다.
 * 친구 닉네임은 계정 메타데이터에만 둔다(코드만으로는 닉네임을 알 수 없어서).
 *
 * 계정은 `scripts/beta-accounts.ts`로 미리 만든다. 앱과 스크립트가 이 파일 하나를 같이 쓴다.
 */

/** 헷갈리는 글자(0 O 1 I L)를 뺀 31자. */
export const BETA_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
export const BETA_CODE_GROUP = 4
export const BETA_CODE_LENGTH = BETA_CODE_GROUP * 3

/** 메일이 실제로 갈 일이 없는 가짜 도메인. 앱(`VITE_BETA_EMAIL_DOMAIN`)과 스크립트가 같은 값을 봐야 한다. */
export const DEFAULT_BETA_EMAIL_DOMAIN = 'beta.fontmaker.invalid'

/** 대소문자 · 하이픈 · 공백을 봐주고 12자 코드로 편다. 모양이 틀리면 null. */
export function normalizeBetaCode(input: string): string | null {
  const raw = input.toUpperCase().replace(/[\s-]/g, '')
  if (raw.length !== BETA_CODE_LENGTH) return null
  for (const char of raw) if (!BETA_CODE_ALPHABET.includes(char)) return null
  return raw
}

/** 12자 코드 → `XXXX-XXXX-XXXX`. */
export function formatBetaCode(normalized: string): string {
  return [0, 1, 2].map((group) => normalized.slice(group * BETA_CODE_GROUP, (group + 1) * BETA_CODE_GROUP)).join('-')
}

export interface BetaCredentials {
  email: string
  password: string
}

/** 코드 → Supabase 로그인 값. 비번은 하이픈을 넣은 정규형이라 입력 모양이 달라도 같다. */
export function betaCredentialsOf(code: string, domain: string = DEFAULT_BETA_EMAIL_DOMAIN): BetaCredentials | null {
  const normalized = normalizeBetaCode(code)
  if (!normalized) return null
  return {
    email: `${normalized.slice(0, BETA_CODE_GROUP).toLowerCase()}@${domain}`,
    password: formatBetaCode(normalized),
  }
}

/**
 * 무작위 코드 하나. `randomBytes`는 암호학적 난수여야 한다(`crypto.getRandomValues`).
 * 256을 31로 나눈 나머지 쏠림을 피하려고 248 이상은 버린다.
 */
export function generateBetaCode(randomBytes: (length: number) => Uint8Array): string {
  const limit = 256 - (256 % BETA_CODE_ALPHABET.length)
  let code = ''
  while (code.length < BETA_CODE_LENGTH) {
    for (const byte of randomBytes(BETA_CODE_LENGTH)) {
      if (byte >= limit) continue
      code += BETA_CODE_ALPHABET[byte % BETA_CODE_ALPHABET.length]
      if (code.length === BETA_CODE_LENGTH) break
    }
  }
  return formatBetaCode(code)
}

export interface BetaInviteMessageInput {
  nickname: string
  code: string
  appUrl: string
  /** 설치 안내 한 장(20번). 아직 없으면 줄을 뺀다. */
  installGuideUrl?: string
}

/** 카톡으로 한 번에 보내는 초대 메시지: 링크 · 코드 · 설치 안내 · 제보 안내. */
export function betaInviteMessage({ nickname, code, appUrl, installGuideUrl }: BetaInviteMessageInput): string {
  const lines = [
    '[한글 폰트 메이커 베타 초대]',
    `${nickname}님, 내 손으로 한글 폰트를 만들어 보는 베타에 초대해요.`,
    '',
    `1. 여기서 열어요: ${appUrl}`,
    `2. 초대 코드를 넣어요: ${code}`,
  ]
  if (installGuideUrl) lines.push(`3. 받은 폰트 설치하는 법: ${installGuideUrl}`)
  lines.push('', '피드백은 한임에게 편하게 보내 주세요. 코드를 잊으면 저한테 물어봐 주세요.')
  return lines.join('\n')
}
