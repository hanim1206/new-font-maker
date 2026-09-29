import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { VariationModel } from '../../src/services/notoVariationModel'
import { houseSaveProblemOf } from '../../scripts/housePresetApi'
import { houseLayoutFromNoto } from '../../src/services/houseLayoutModel'
import { PRESET_LAYOUTS, handlesOf, identityOfChar, predictionOf, representativeFor, targetLabel } from './presetEditor'

const noto = (JSON.parse(readFileSync('public/noto-preset/model.json', 'utf8')) as { model: VariationModel }).model

describe('프리셋 편집 규칙', () => {
  it('레이아웃마다 대표 글자 8자는 모두 그 문맥 칸에 든다', () => {
    expect(PRESET_LAYOUTS.map((layout) => layout.id).sort()).toEqual(['bottom', 'bottom-final', 'mixed', 'mixed-final', 'right', 'right-final'])
    for (const layout of PRESET_LAYOUTS) {
      expect([...layout.samples]).toHaveLength(8)
      for (const char of layout.samples) expect(identityOfChar(char)?.contextId, `${layout.id} ${char}`).toBe(layout.id)
    }
  })

  it('완성 글자 → 자모', () => {
    expect(identityOfChar('흙')).toMatchObject({ initialJamo: 'ㅎ', medialJamo: 'ㅡ', finalJamo: 'ㄺ', contextId: 'bottom-final' })
    expect(identityOfChar('a')).toBeNull()
  })

  it('끌 수 있는 선: 받침 없는 레이아웃엔 받침 변이 없고, 모든 선은 이 레이아웃 글자에서 예측값이 있다', () => {
    for (const layout of PRESET_LAYOUTS) {
      const handles = handlesOf(noto, layout.id)
      const hasFinal = layout.id.endsWith('-final')
      expect(handles.some((handle) => handle.part === 'final')).toBe(hasFinal)
      expect(handles.filter((handle) => handle.part === 'initial')).toHaveLength(4)
      const identity = identityOfChar(layout.samples[0])!
      for (const handle of handles) {
        expect(predictionOf(noto, handle.target, identity), handle.target).not.toBeNull()
        if (handle.span) for (const span of handle.span) expect(predictionOf(noto, span, identity), span).not.toBeNull()
      }
    }
    // 가로줄기는 위아래로, 기둥 · 세로줄기는 좌우로 움직인다.
    const right = handlesOf(noto, 'right')
    expect(right.find((handle) => handle.target === 'medial.primaryBeam.face')?.axis).toBe('y')
    expect(right.find((handle) => handle.target === 'medial.outerPillar.face')?.axis).toBe('x')
    // 가(ㅏ)에는 기둥 하나와 곁줄기 하나만.
    expect(handlesOf(noto, 'right', 'ㅏ').filter((handle) => handle.part === 'medial').map((handle) => handle.target).sort()).toEqual(['medial.outerPillar.face', 'medial.primaryBeam.face'])
  })

  it('선을 옮긴 만큼 대푯값이 움직인다', () => {
    expect(representativeFor(500, 520, 530)).toBe(510)
  })

  it('이름표', () => {
    expect(targetLabel('initial.roleFaces.right')).toBe('첫닿자 오른변')
    expect(targetLabel('medial.upperBeam.visibleLength')).toBe('위 가로줄기 보이는 길이')
  })

  it('저장 API는 v1(노토)과 틀린 파일을 받지 않는다', () => {
    const v2 = houseLayoutFromNoto(noto, 'basic-gothic-v2', 't0')
    expect(houseSaveProblemOf(v2)).toBeNull()
    expect(houseSaveProblemOf({ ...v2, preset: 'basic-gothic' })).toMatch(/동결/)
    expect(houseSaveProblemOf({ ...v2, preset: 'x' })).toMatch(/모르는/)
    expect(houseSaveProblemOf({})).toMatch(/형식/)
  })
})
