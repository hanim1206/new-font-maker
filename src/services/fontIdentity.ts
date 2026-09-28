/**
 * 폰트 이름 체계. 사용자가 적은 이름(한글 가능)에서 OS가 요구하는 ASCII 정식 이름을 안정적으로 만든다.
 *
 * - 정식 이름(name ID 1 · 4 · 6, CFF FontName · FamilyName · FullName)은 ASCII만.
 *   한글은 국어의 로마자 표기법으로 옮긴다(꾸불체 → Kkubulche). 같은 입력이면 항상 같은 이름이 나온다.
 * - 사용자가 적은 이름이 ASCII와 다르면(한글 등) 한국어 localized 이름(3,1,0x412)으로 같이 넣는다.
 * - 재설치 구분은 이름이 아니라 버전(`fontRevision.ts`: name ID 3 · 5, head.fontRevision)이 맡는다.
 */

export interface FontIdentity {
  /** name ID 1 · CFF FamilyName. ASCII만. */
  asciiFamilyName: string
  /** name ID 2. `Regular` · `Bold`. */
  styleName: string
  /** name ID 4 · CFF FullName. `Kkubulche Regular`. */
  fullName: string
  /** name ID 6 · CFF FontName. 공백 · 한글 없음, 63자 이하. */
  postScriptName: string
  /** 사용자가 적은 이름이 ASCII 이름과 다를 때만. name ID 1 (3,1,0x412). */
  localizedFamilyName?: string
  /** name ID 4 (3,1,0x412). */
  localizedFullName?: string
}

export interface FontIdentityOptions {
  /** 사용자가 직접 정한 영문 이름. 있으면 로마자 변환 대신 이걸 쓴다. */
  asciiFamilyName?: string
}

export const DEFAULT_ASCII_FAMILY_NAME = 'FontMaker'
const POSTSCRIPT_NAME_MAX_LENGTH = 63

const HANGUL_BASE = 0xac00
const HANGUL_END = 0xd7a3
const MEDIAL_COUNT = 21
const FINAL_COUNT = 28

// 국어의 로마자 표기법(2000) 자모 표. 음운 변동(연음 · 동화)은 적용하지 않는다 — 이름은 예측 가능해야 한다.
const INITIAL_ROMAN = ['g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's', 'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h'] as const
const MEDIAL_ROMAN = ['a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa', 'wae', 'oe', 'yo', 'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i'] as const
const FINAL_ROMAN = ['', 'k', 'k', 'k', 'n', 'n', 'n', 't', 'l', 'k', 'm', 'l', 'l', 'l', 'p', 'l', 'm', 'p', 'p', 't', 't', 'ng', 't', 't', 'k', 't', 'p', 't'] as const

/** 한글 음절 하나를 로마자로. 음절이 아니면 빈 문자열. */
export function romanizeHangulSyllable(char: string): string {
  const code = char.codePointAt(0)
  if (code === undefined || code < HANGUL_BASE || code > HANGUL_END) return ''
  const index = code - HANGUL_BASE
  const initial = Math.floor(index / (MEDIAL_COUNT * FINAL_COUNT))
  const medial = Math.floor((index % (MEDIAL_COUNT * FINAL_COUNT)) / FINAL_COUNT)
  const final = index % FINAL_COUNT
  return `${INITIAL_ROMAN[initial]}${MEDIAL_ROMAN[medial]}${FINAL_ROMAN[final]}`
}

function capitalize(word: string): string {
  return word ? word[0].toUpperCase() + word.slice(1) : word
}

/**
 * 사용자가 적은 이름 → ASCII 가족 이름. 한글 음절은 로마자로, 그 밖의 비ASCII는 버린다.
 * 낱말마다 첫 글자를 대문자로 쓴다(`꾸불체` → `Kkubulche`, `감사 폰트` → `Gamsa Ponteu`).
 */
export function asciiFamilyNameOf(familyName: string): string {
  const words = familyName.trim().split(/\s+/).map((word) => {
    let romanBuffer = ''
    let out = ''
    const flush = () => { out += capitalize(romanBuffer); romanBuffer = '' }
    for (const char of word) {
      const roman = romanizeHangulSyllable(char)
      if (roman) { romanBuffer += roman; continue }
      flush()
      if (/[A-Za-z0-9-]/.test(char)) out += char
    }
    flush()
    return out
  }).filter(Boolean)
  return words.join(' ').replace(/^[-\s]+|[-\s]+$/g, '')
}

/** PostScript 이름에 허용되는 문자만 남긴다: 영문 · 숫자 · 하이픈. */
export function postScriptSafe(text: string): string {
  return text.replace(/[^A-Za-z0-9-]/g, '')
}

/** name ID 6가 규격에 맞는지: 인쇄 가능한 ASCII, `[](){}<>/%`와 공백 없음, 1~63자. */
export function isValidPostScriptName(name: string): boolean {
  return name.length > 0 && name.length <= POSTSCRIPT_NAME_MAX_LENGTH && /^[\x21-\x7e]+$/.test(name) && !/[[\](){}<>/% ]/.test(name)
}

/** 굵기 등급으로 스타일 이름. OpenType 관례대로 600 이상이면 Bold. */
export function styleNameForWeight(weightClass: number): 'Regular' | 'Bold' {
  return weightClass >= 600 ? 'Bold' : 'Regular'
}

/** 스타일 이름이 뜻하는 비트. head.macStyle · OS/2.fsSelection · name ID 2가 같은 답을 내게 한다. */
export function styleFlagsOf(styleName: string): { bold: boolean; italic: boolean } {
  return { bold: /bold/i.test(styleName), italic: /italic|oblique/i.test(styleName) }
}

/** 사용자 이름 + 스타일 → 정식 ASCII 이름과 한국어 localized 이름. */
export function createFontIdentity(familyName: string, styleName = 'Regular', options: FontIdentityOptions = {}): FontIdentity {
  const displayName = familyName.trim() || DEFAULT_ASCII_FAMILY_NAME
  const explicitAscii = options.asciiFamilyName?.trim()
  const asciiFamilyName = (explicitAscii ? asciiFamilyNameOf(explicitAscii) : asciiFamilyNameOf(displayName)) || DEFAULT_ASCII_FAMILY_NAME
  const safeStyle = postScriptSafe(styleName) || 'Regular'
  const postScriptFamily = postScriptSafe(asciiFamilyName) || DEFAULT_ASCII_FAMILY_NAME
  const postScriptName = `${postScriptFamily}-${safeStyle}`.slice(0, POSTSCRIPT_NAME_MAX_LENGTH)
  const identity: FontIdentity = {
    asciiFamilyName,
    styleName: safeStyle,
    fullName: `${asciiFamilyName} ${safeStyle}`,
    postScriptName,
  }
  if (displayName !== asciiFamilyName) {
    identity.localizedFamilyName = displayName
    identity.localizedFullName = `${displayName} ${safeStyle}`
  }
  return identity
}
