import fixtureSource from '../reference-data/font-guide-calibrations/nanum-gothic.final-component-g1.v1.json'
import verificationSource from '../reference-data/font-guide-calibrations/nanum-gothic.final-component-g1.verification.v1.json'
import { describe, expect, it } from 'vitest'
import {
  parseFinalComponentCandidateResponse,
  parseFinalComponentVerification,
} from './finalComponentCandidateModel'

describe('받침 G1 나눔고딕 holdout fixture', () => {
  it('81자를 평가하고 후보와 안전 자동 포기를 분리한다', () => {
    const response = parseFinalComponentCandidateResponse(fixtureSource)
    const candidates = response.cases.filter((item) => item.state === 'candidate')
    const abstained = response.cases.filter((item) => item.state === 'abstained')
    const reasons = abstained.reduce<Record<string, number>>((result, item) => {
      if (item.state === 'abstained') result[item.reasonCode] = (result[item.reasonCode] ?? 0) + 1
      return result
    }, {})

    expect(response.font.id).toBe('nanum-gothic')
    expect(response.cases).toHaveLength(81)
    expect(candidates).toHaveLength(75)
    expect(abstained).toHaveLength(6)
    expect(reasons).toEqual({
      'merged-boundary-unresolved': 3,
      'medial-anchor-unavailable': 3,
    })
    expect('verification' in response).toBe(false)
    expect(parseFinalComponentVerification(verificationSource).state).toBe('verified')
  })
})
