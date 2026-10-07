import oflText from './OFL-1.1.txt?raw'

/**
 * 내보낸 폰트에 넣는 출처 · 라이선스 표기. 프리셋 v1은 노토 산스(OFL 1.1)를 바탕으로 해서 결과물도 OFL을 따른다(약관 제7조).
 * OFL 2항: 고지와 라이선스 전문은 별도 파일 대신 "사용자가 쉽게 볼 수 있는 메타데이터"에 넣어도 된다 — 그래서 name ID 13에 전문을 넣는다.
 * 사람을 알아볼 수 있는 정보(이름 · 이메일 · 계정)는 넣지 않는다. 제작 번호는 폰트 id라 운영자만 대조할 수 있다.
 */

export const SERVICE_NAME = 'Hangulkangul'
export const SERVICE_URL = 'https://hangulkangul.com'
export const OFL_URL = 'https://openfontlicense.org'

/** 노토 산스 KR 원저작권 줄(`public/noto-preset/OFL.txt`와 같다). */
export const NOTO_SANS_KR_COPYRIGHT = "(c) 2014-2021 Adobe (http://www.adobe.com/), with Reserved Font Name 'Source'."

/** OFL이 파생 글꼴 이름에 쓰지 못하게 한 이름. 노토 산스 KR은 'Source'를 예약했고, 'Noto'는 구글 상표라 같이 막는다. */
export const RESERVED_FONT_NAMES = ['Noto', 'Source'] as const

/** 이름에 예약 이름이 들어 있으면 그 말을, 없으면 null. 대소문자는 가리지 않는다. */
export function reservedFontNameIn(name: string): string | null {
  const lower = name.toLowerCase()
  return RESERVED_FONT_NAMES.find((reserved) => lower.includes(reserved.toLowerCase())) ?? null
}

export interface FontLicenseNaming {
  copyright: string
  manufacturer: string
  description: string
  vendorUrl: string
  license: string
  licenseUrl: string
}

/** name ID 0 · 8 · 10 · 11 · 13 · 14. ASCII만 — Macintosh 레코드에도 같은 값이 들어간다. */
export function licenseNamingOf(serial?: string, year = new Date().getFullYear()): FontLicenseNaming {
  return {
    copyright: `Copyright (c) ${year} the font author, made with ${SERVICE_NAME} (${SERVICE_URL}). Derived from Noto Sans KR ${NOTO_SANS_KR_COPYRIGHT}`,
    manufacturer: SERVICE_NAME,
    description: `Made with ${SERVICE_NAME} (${SERVICE_URL}).${serial ? ` Serial ${serial}.` : ''} Based on Noto Sans KR. Licensed under the SIL Open Font License 1.1: the font may be used commercially but may not be sold by itself.`,
    vendorUrl: SERVICE_URL,
    license: `This Font Software is licensed under the SIL Open Font License, Version 1.1.\nThis license is copied below, and is also available with a FAQ at: ${OFL_URL}\n\n${oflText.trim()}`,
    licenseUrl: OFL_URL,
  }
}
