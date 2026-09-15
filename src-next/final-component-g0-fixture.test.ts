import fixtureSource from '../reference-data/font-guide-calibrations/noto-sans-kr.final-component-g0.v1.json'
import verificationSource from '../reference-data/font-guide-calibrations/noto-sans-kr.final-component-g0.verification.v1.json'
import { describe, expect, it } from 'vitest'
import {
  FINAL_COMPONENT_P0_CONTRACT,
  parseFinalComponentCandidateResponse,
  parseFinalComponentVerification,
} from './finalComponentCandidateModel'

describe('받침 G0 fixture', () => {
  it('Noto ㄱ × ㅏ·ㅗ·ㅘ × 27받침 81자를 candidate로만 읽는다', () => {
    const response = parseFinalComponentCandidateResponse(fixtureSource)

    expect(response.lifecycle).toBe('candidate')
    expect(response.cases).toHaveLength(81)
    expect(response.cases.every((item) => item.state === 'candidate')).toBe(true)

    const expected = FINAL_COMPONENT_P0_CONTRACT.contexts.flatMap((context) =>
      FINAL_COMPONENT_P0_CONTRACT.finalJamos.map((finalJamo) =>
        `ㄱ:${context.medialJamo}:${finalJamo}:${context.id}`,
      ),
    )
    const actual = response.cases.map((item) =>
      `${item.identity.initialJamo}:${item.identity.medialJamo}:${item.identity.finalJamo}:${item.identity.contextId}`,
    )
    expect(actual).toEqual(expected)
  })

  it('겹·된받침 구성원과 candidate/verified 상태를 분리한다', () => {
    const response = parseFinalComponentCandidateResponse(fixtureSource)
    const paired = response.cases.filter((item) =>
      item.state === 'candidate' && item.structureKind !== 'single',
    )

    expect(paired).toHaveLength(39)
    for (const item of paired) {
      if (item.state !== 'candidate') continue
      expect(item.members.map((member) => member.id)).toEqual(['left', 'right'])
      expect(item.memberRelation?.direction).toBe('left-to-right')
    }
    expect('verification' in response).toBe(false)
    expect(parseFinalComponentVerification(verificationSource).state).toBe('verified')
  })
})
