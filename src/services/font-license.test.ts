import { describe, expect, it } from 'vitest'
import { licenseNamingOf, reservedFontNameIn } from './fontLicense'

describe('fontLicense', () => {
  it('예약 이름 Noto · Source를 대소문자 상관없이 찾는다', () => {
    expect(reservedFontNameIn('My NOTO Sans')).toBe('Noto')
    expect(reservedFontNameIn('opensource')).toBe('Source')
    expect(reservedFontNameIn('칸글체')).toBeNull()
  })

  it('라이선스 표기는 ASCII이고 제작 번호와 OFL 전문을 담는다', () => {
    const naming = licenseNamingOf('abc-r3', 2026)
    for (const value of Object.values(naming)) expect(/^[\x00-\x7f]*$/.test(value)).toBe(true)
    expect(naming.copyright).toContain("Reserved Font Name 'Source'")
    expect(naming.description).toContain('Serial abc-r3.')
    expect(naming.license).toContain('SIL OPEN FONT LICENSE Version 1.1')
    expect(naming.licenseUrl).toBe('https://openfontlicense.org')
  })
})
