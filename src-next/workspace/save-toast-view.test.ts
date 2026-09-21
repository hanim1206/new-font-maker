import { describe, expect, it } from 'vitest'
import { saveToastView } from './saveToastView'

describe('saveToastView', () => {
  it('성공과 대기는 띄우지 않는다', () => {
    expect(saveToastView('idle', null, false)).toBeNull()
    expect(saveToastView('saved', '이 기기에 저장했습니다.', false)).toBeNull()
  })

  it('저장 중은 300ms를 넘긴 뒤에만 띄운다', () => {
    expect(saveToastView('saving', null, false)).toBeNull()
    expect(saveToastView('saving', null, true)).toEqual({ tone: 'saving', message: '저장 중…', dismissable: false })
  })

  it('실패는 지연과 상관없이 바로 띄우고 사용자가 닫는다', () => {
    expect(saveToastView('error', '프로젝트 서버 저장에 실패했습니다.', false)).toEqual({
      tone: 'error',
      message: '프로젝트 서버 저장에 실패했습니다.',
      dismissable: true,
    })
  })

  it('실패 문구가 없으면 기본 문구로 대신한다', () => {
    expect(saveToastView('error', null, false)?.message).toBe('저장하지 못했습니다.')
  })
})
