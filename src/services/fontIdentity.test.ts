import { describe, expect, it } from 'vitest'
import {
  asciiFamilyNameOf,
  createFontIdentity,
  isValidPostScriptName,
  romanizeHangulSyllable,
  styleFlagsOf,
  styleNameForWeight,
} from './fontIdentity'

describe('폰트 이름 체계', () => {
  it('한글 음절을 로마자 표기법으로 옮긴다', () => {
    expect(['꾸', '불', '체'].map(romanizeHangulSyllable)).toEqual(['kku', 'bul', 'che'])
    expect(['한', '글', '닭', '값', '앉'].map(romanizeHangulSyllable)).toEqual(['han', 'geul', 'dak', 'gap', 'an'])
    expect(romanizeHangulSyllable('A')).toBe('')
    expect(romanizeHangulSyllable('ㄱ')).toBe('')
  })

  it('사용자 이름 → ASCII 가족 이름. 낱말 첫 글자는 대문자, 그 밖의 비ASCII는 버린다', () => {
    expect(asciiFamilyNameOf('꾸불체')).toBe('Kkubulche')
    expect(asciiFamilyNameOf('감사 폰트')).toBe('Gamsa Ponteu')
    expect(asciiFamilyNameOf('Font Maker')).toBe('Font Maker')
    expect(asciiFamilyNameOf('한글Sans 2')).toBe('HangeulSans 2')
    expect(asciiFamilyNameOf('★☆')).toBe('')
  })

  it('같은 입력이면 항상 같은 이름 — 무작위 해시가 없다', () => {
    const first = createFontIdentity('꾸불체', 'Regular')
    const second = createFontIdentity('꾸불체', 'Regular')
    expect(first).toEqual(second)
    expect(first).toEqual({
      asciiFamilyName: 'Kkubulche',
      styleName: 'Regular',
      fullName: 'Kkubulche Regular',
      postScriptName: 'Kkubulche-Regular',
      localizedFamilyName: '꾸불체',
      localizedFullName: '꾸불체 Regular',
    })
    expect(first.postScriptName).not.toMatch(/[0-9A-F]{8}/)
  })

  it('영문 이름을 직접 주면 그걸 정식 이름으로 쓰고 한글은 localized 이름이 된다', () => {
    const identity = createFontIdentity('꾸불체', 'Regular', { asciiFamilyName: 'Kkubul' })
    expect(identity.asciiFamilyName).toBe('Kkubul')
    expect(identity.fullName).toBe('Kkubul Regular')
    expect(identity.postScriptName).toBe('Kkubul-Regular')
    expect(identity.localizedFamilyName).toBe('꾸불체')
  })

  it('영문 이름만 적으면 localized 이름을 만들지 않는다', () => {
    const identity = createFontIdentity('Font Maker', 'Regular')
    expect(identity.asciiFamilyName).toBe('Font Maker')
    expect(identity.postScriptName).toBe('FontMaker-Regular')
    expect(identity.localizedFamilyName).toBeUndefined()
  })

  it('PostScript 이름은 공백 · 한글 없이 63자 이하', () => {
    const long = createFontIdentity('가'.repeat(40), 'Regular')
    expect(long.postScriptName.length).toBeLessThanOrEqual(63)
    expect(isValidPostScriptName(long.postScriptName)).toBe(true)
    expect(isValidPostScriptName('Kkubul Regular')).toBe(false)
    expect(isValidPostScriptName('꾸불체-Regular')).toBe(false)
    expect(isValidPostScriptName('A[1]')).toBe(false)
    expect(isValidPostScriptName('')).toBe(false)
    expect(createFontIdentity('', 'Regular').postScriptName).toBe('FontMaker-Regular')
  })

  it('굵기 600부터 Bold. 스타일 이름이 비트를 정한다', () => {
    expect(styleNameForWeight(400)).toBe('Regular')
    expect(styleNameForWeight(599)).toBe('Regular')
    expect(styleNameForWeight(600)).toBe('Bold')
    expect(styleFlagsOf('Bold')).toEqual({ bold: true, italic: false })
    expect(styleFlagsOf('Bold Italic')).toEqual({ bold: true, italic: true })
    expect(styleFlagsOf('Regular')).toEqual({ bold: false, italic: false })
    expect(createFontIdentity('꾸불체', 'Bold').postScriptName).toBe('Kkubulche-Bold')
  })
})
