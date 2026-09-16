import { describe, expect, it } from 'vitest'
import type { ComponentFitPart } from './notoComponentFitView'
import type { EditableRail, MedialFitPart } from './notoMedialFitView'
import { corpusIdentity } from './notoCorpus'
import { applyFacesDelta, applyMedialDelta, editKindOf, hasLayoutEdit, hasShapeEdit, propagationCandidates, propagationEditOf, shapeDeltaToEm } from './reviewPropagation'

/** 검수 rail 편집 → 배치·형태 Δ → 다른 글자 표본. 순수 계산만 본다. */

const slot = { x: 0.5, y: 0.1, width: 0.4, height: 0.8 }
const medialPart = (part: MedialFitPart['part'], railsEm: Record<string, number>): MedialFitPart => ({ part, role: 'JU_VERTICAL', roleIds: [], fit: { railsEm, slot } as unknown as MedialFitPart['fit'] })
// family는 닿자 획 변형용 필드. 이 테스트엔 안 쓰이므로 있든 없든 통과하게 단언으로 둔다.
const componentPart = (part: ComponentFitPart['part'], faces: ComponentFitPart['faces']): ComponentFitPart => ({ part, jamoId: 'ㄱ', family: null, faces } as ComponentFitPart)
const faces = { left: 0.1, right: 0.5, top: 0.1, bottom: 0.5 }
const rail = (over: Partial<EditableRail> & Pick<EditableRail, 'id' | 'role' | 'kind' | 'value' | 'original'>): EditableRail => ({ partIndex: 0, axis: 'x', label: over.id, ...over })

describe('editKindOf', () => {
  it('중심 rail·닿자 변 = 배치, 시작·끝 rail = 형태', () => {
    expect(editKindOf({ kind: 'center' })).toBe('layout')
    expect(editKindOf({ kind: 'face' })).toBe('layout')
    expect(editKindOf({ kind: 'start' })).toBe('shape')
    expect(editKindOf({ kind: 'end' })).toBe('shape')
  })
})

describe('propagationEditOf', () => {
  const medialParts = [medialPart('JU', { 'outer-right': 0.7, 'outer-top': 0.4, 'aux-x-1': 0.55 })]
  const componentParts = [componentPart('CH', faces)]
  it('안 바뀐 rail은 빠지고, 중심은 em Δ로 배치에, 시작은 슬롯 비율로 형태에 들어간다', () => {
    const edit = propagationEditOf({
      editable: [
        rail({ id: '0:outer-right', role: 'outer-right', kind: 'center', value: 0.712, original: 0.7 }),
        rail({ id: '0:outer-top', role: 'outer-top', kind: 'center', axis: 'y', value: 0.4, original: 0.4 }),
        rail({ id: '0:aux-x-1', role: 'aux-x-1', kind: 'start', value: 0.59, original: 0.55 }),
        rail({ id: 'c0:right', partIndex: 0, role: 'right', kind: 'face', value: 0.48, original: 0.5 }),
      ],
      medialParts, componentParts,
    })
    expect(edit.layout.medial.JU).toEqual({ 'outer-right': expect.closeTo(0.012, 9) })
    expect(edit.layout.component.CH).toEqual({ right: expect.closeTo(-0.02, 9) })
    // 0.04 / 슬롯 폭 0.4 = 0.1
    expect(edit.shape.medial.JU).toEqual({ 'aux-x-1': expect.closeTo(0.1, 9) })
    expect(hasLayoutEdit(edit)).toBe(true)
    expect(hasShapeEdit(edit)).toBe(true)
  })
  it('편집이 없으면 둘 다 비어 있다', () => {
    const edit = propagationEditOf({ editable: [rail({ id: '0:outer-right', role: 'outer-right', kind: 'center', value: 0.7, original: 0.7 })], medialParts, componentParts })
    expect(hasLayoutEdit(edit)).toBe(false)
    expect(hasShapeEdit(edit)).toBe(false)
  })
})

describe('applyMedialDelta · shapeDeltaToEm · applyFacesDelta', () => {
  it('같은 역할 rail에만 Δ를 얹고 없는 키는 건너뛴 수로 알려준다', () => {
    const out = applyMedialDelta({ primaryBeam: 0.5 }, { primaryBeam: 0.01, baseStem: 0.02 })
    expect(out.rails.primaryBeam).toBeCloseTo(0.51, 9)
    expect(out).toMatchObject({ applied: 1, skipped: 1 })
  })
  it('비율 Δ는 대상 슬롯 길이에 곱해 em이 된다', () => {
    const em = shapeDeltaToEm({ 'aux-x-1': 0.1, primaryBeam: -0.05 }, { x: 0, y: 0, width: 0.2, height: 0.6 }, (key) => key === 'primaryBeam' ? 'y' : 'x')
    expect(em['aux-x-1']).toBeCloseTo(0.02, 9)
    expect(em.primaryBeam).toBeCloseTo(-0.03, 9)
  })
  it('네 변 Δ는 준 변만 옮긴다', () => {
    expect(applyFacesDelta(faces, { top: -0.01 })).toEqual({ ...faces, top: expect.closeTo(0.09, 9) })
  })
})

describe('propagationCandidates', () => {
  const source = corpusIdentity('멈'.codePointAt(0)!)
  it('이 층 = 같은 문맥(홀자 계열·받침 유무), 홀자는 섞이고 원본은 빠진다', () => {
    const picked = propagationCandidates({ source, scope: 'layer', count: 8 })
    expect(picked).toHaveLength(8)
    expect(picked.every((item) => item.contextId === source.contextId && item.codepoint !== source.codepoint)).toBe(true)
    expect(new Set(picked.map((item) => item.medialJamo)).size).toBeGreaterThan(1)
  })
  it('같은 홀자 묶음은 초성·받침이 섞인다', () => {
    const picked = propagationCandidates({ source, scope: 'jamo', count: 8 })
    expect(picked.every((item) => item.medialJamo === 'ㅓ')).toBe(true)
    expect(new Set(picked.map((item) => item.initialJamo)).size).toBeGreaterThan(1)
    expect(new Set(picked.map((item) => item.finalJamo)).size).toBeGreaterThan(1)
  })
  it('배치 Δ의 이 자모 = 바꾼 부품 자모만 같게. 홀자 중심을 옮기면 같은 홀자, 받침 변을 옮기면 같은 받침', () => {
    const ae = corpusIdentity('배'.codePointAt(0)!)
    const medialOnly = propagationCandidates({ source: ae, scope: 'jamo', count: 8, edit: { layout: { medial: { JU: { 'outer-right': 0.01 } }, component: {} }, shape: { medial: {} } } })
    expect(medialOnly.every((item) => item.medialJamo === 'ㅐ')).toBe(true)
    expect(medialOnly.some((item) => item.finalJamo !== null)).toBe(true)
    const finalOnly = propagationCandidates({ source, scope: 'jamo', count: 8, edit: { layout: { medial: {}, component: { JO: { top: 0.01 } } }, shape: { medial: {} } } })
    expect(finalOnly.every((item) => item.finalJamo === 'ㅁ')).toBe(true)
    expect(new Set(finalOnly.map((item) => item.medialJamo)).size).toBeGreaterThan(1)
  })
  it('전체는 문맥이 섞이고, 다음 묶음은 다른 글자', () => {
    const all = propagationCandidates({ source, scope: 'all', count: 8 })
    expect(new Set(all.map((item) => item.contextId)).size).toBeGreaterThan(1)
    const next = propagationCandidates({ source, scope: 'all', count: 8, page: 1 })
    expect(next.map((item) => item.codepoint)).not.toEqual(all.map((item) => item.codepoint))
  })
})
