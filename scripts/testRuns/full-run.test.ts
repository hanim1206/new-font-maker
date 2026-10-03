import { describe, expect, it } from 'vitest'
import { isFullRun } from './testRunStore'

describe('전체 실행인지 가리기', () => {
  it('명령 뒤가 비었거나 있는 폴더뿐이면 전체', () => {
    expect(isFullRun(['run', 'src', 'src-next'])).toBe(true)
    expect(isFullRun(['test'])).toBe(true)
    expect(isFullRun(['test', '--workers=1'])).toBe(true)
  })

  it('파일 · 부분 이름 · 거르는 옵션이 있으면 전체가 아니다', () => {
    expect(isFullRun(['run', 'src-next/admin'])).toBe(true)
    expect(isFullRun(['run', 'src-next/style-guard.test.ts'])).toBe(false)
    expect(isFullRun(['run', 'account-font'])).toBe(false)
    expect(isFullRun(['test', '--grep', '스모크'])).toBe(false)
    expect(isFullRun(['run', 'src', '-t', '이름'])).toBe(false)
  })
})
