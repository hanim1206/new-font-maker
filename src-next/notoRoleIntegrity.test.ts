import { describe, expect, it } from 'vitest'
import type { CorpusDetail } from './notoCorpus'
import { notoConflictingParts } from './notoRoleIntegrity'

function detail(initial: number[], medial: number[], final: number[]): CorpusDetail {
  const group = (contourIds: number[]) => ({ componentGroup: { status: 'candidate', value: { contourIds } } })
  return {
    stages: {
      initial: { observation: group(initial) },
      medial: { observation: { elements: medial.map((contourId) => ({ face: { status: 'candidate', evidence: { contourId } } })) } },
      final: { observation: group(final) },
    },
  } as unknown as CorpusDetail
}

describe('실측 윤곽의 역할 간 소유권', () => {
  it('분리된 역할은 차단하지 않는다', () => {
    expect(notoConflictingParts(detail([0, 1], [2, 3], [4]))).toEqual(new Set())
  })

  it('팍 유형의 첫닿자·끝닿자 중복만 차단한다', () => {
    expect(notoConflictingParts(detail([0, 1, 2, 3], [4, 5], [1, 6]))).toEqual(new Set(['initial', 'final']))
  })

  it('똫 유형의 홀자·끝닿자 중복을 차단한다', () => {
    expect(notoConflictingParts(detail([], [4, 9], [6, 7, 8, 9]))).toEqual(new Set(['medial', 'final']))
  })

  it('윤곽 번호 0도 유효한 충돌 근거다', () => {
    expect(notoConflictingParts(detail([0], [0], []))).toEqual(new Set(['initial', 'medial']))
  })

  it('같은 홀자의 여러 역할이 한 윤곽을 공유하는 것은 허용한다', () => {
    expect(notoConflictingParts(detail([0], [1, 1, 2], [3]))).toEqual(new Set())
  })

  it('포기한 홀자 면의 잔여 근거는 후보로 쓰지 않는다', () => {
    const value = detail([0], [], [2])
    value.stages.medial!.observation = { elements: [{ face: { status: 'abstained', evidence: { contourId: 2 } } }] }
    expect(notoConflictingParts(value)).toEqual(new Set())
  })
})
