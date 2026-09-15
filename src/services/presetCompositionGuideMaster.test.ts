import { describe, expect, it } from 'vitest'
import { buildPresetCompositionTarget } from '../../src-next/presetCompositionInput'
import { createPresetCompositionGuideMaster } from './presetCompositionGuideMaster'

describe('프리셋 조합 기준선 마스터', () => {
  it('같은 실제 Noto 조합의 초성·홀자 기준선만 자모 생성 입력으로 연다', () => {
    const master = createPresetCompositionGuideMaster(buildPresetCompositionTarget({
      initialJamo: 'ㄱ', medialJamo: 'ㅏ', finalJamo: null,
    }))
    expect(master.status).toBe('ready-direct-guide-master')
    expect(master.initial).toMatchObject({ sourceCharacter: '가', direct: true })
    expect(master.medial).toMatchObject({ sourceCharacter: '가', direct: true })
    expect(master.productionEligible).toBe(false)
  })

  it('문맥 투영은 출처를 표시해 열고 미검수 종성은 열지 않는다', () => {
    expect(createPresetCompositionGuideMaster(buildPresetCompositionTarget({
      initialJamo: 'ㅍ', medialJamo: 'ㅝ', finalJamo: null,
    })).status).toBe('ready-projected-guide-master')
    expect(createPresetCompositionGuideMaster(buildPresetCompositionTarget({
      initialJamo: 'ㄱ', medialJamo: 'ㅏ', finalJamo: 'ㄱ',
    })).status).toBe('blocked-review')
  })
})
