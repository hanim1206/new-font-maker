import { describe, expect, it } from 'vitest'
import type { ComponentFitPart } from './notoComponentFitView'
import type { EditableRail, MedialFitPart } from './notoMedialFitView'
import { corpusIdentity } from './notoCorpus'
import type { StrokeRailBinding } from '../src/services/notoMedialMasterFit'
import { applyFacesDelta, applyMedialDelta, editKindOf, hasLayoutEdit, hasShapeEdit, propagationCandidates, propagationEditOf, resolveSemanticRail, semanticKeyOf, shapeDeltaToEm, layoutDeltaOf } from './reviewPropagation'

/** 검수 rail 편집 → 배치·형태 Δ → 다른 글자 표본. 순수 계산만 본다. Δ는 획 역할 키(`primaryBeam.center`)로 든다. */

const slot = { x: 0.5, y: 0.1, width: 0.4, height: 0.8 }
const bind = (roleId: string, orientation: StrokeRailBinding['orientation'], centerRail: string, fromRail: string, toRail: string): StrokeRailBinding => ({ roleId, orientation, thickness: 0.08, centerRail, fromRail, toRail } as StrokeRailBinding)
// 실제 Noto fit 결속(샏 ㅐ, 간 ㅏ, 얌 ㅑ). 같은 보라도 ㅐ는 inner-bottom, ㅏ는 center-y에 매인다.
const AE_BINDINGS = [bind('innerPillar', 'vertical', 'inner-left', 'inner-top', 'outer-bottom'), bind('outerPillar', 'vertical', 'inner-right', 'outer-top', 'outer-bottom'), bind('primaryBeam', 'horizontal', 'inner-bottom', 'inner-left', 'inner-right')]
const A_BINDINGS = [bind('outerPillar', 'vertical', 'center-x', 'outer-top', 'outer-bottom'), bind('primaryBeam', 'horizontal', 'center-y', 'center-x', 'outer-right')]
const YA_BINDINGS = [bind('lowerBeam', 'horizontal', 'inner-bottom', 'center-x', 'outer-right'), bind('outerPillar', 'vertical', 'center-x', 'outer-top', 'outer-bottom'), bind('upperBeam', 'horizontal', 'inner-top', 'center-x', 'outer-right')]
const medialPart = (part: MedialFitPart['part'], railsEm: Record<string, number>, bindings: StrokeRailBinding[] = AE_BINDINGS): MedialFitPart => ({ part, role: 'JU_VERTICAL', roleIds: [], fit: { railsEm, slot, bindings } as unknown as MedialFitPart['fit'] })
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

describe('semanticKeyOf · resolveSemanticRail', () => {
  it('rail 키 → 획 역할 키. 중심으로 매인 획이 먼저, 아니면 시작·끝', () => {
    expect(semanticKeyOf(AE_BINDINGS, 'inner-bottom')).toBe('primaryBeam.center')
    expect(semanticKeyOf(AE_BINDINGS, 'inner-right')).toBe('outerPillar.center')
    expect(semanticKeyOf(AE_BINDINGS, 'inner-top')).toBe('innerPillar.start')
    // ㅏ의 center-x는 기둥 중심이면서 보 시작. 중심이 이긴다.
    expect(semanticKeyOf(A_BINDINGS, 'center-x')).toBe('outerPillar.center')
    expect(semanticKeyOf(A_BINDINGS, 'outer-right')).toBe('primaryBeam.end')
    expect(semanticKeyOf(A_BINDINGS, 'inner-left')).toBeNull()
  })
  it('획 역할 키 → 이 글자의 rail 키와 축. 없는 획은 null', () => {
    expect(resolveSemanticRail(A_BINDINGS, 'primaryBeam.center')).toEqual({ railKey: 'center-y', axis: 'y' })
    expect(resolveSemanticRail(A_BINDINGS, 'primaryBeam.end')).toEqual({ railKey: 'outer-right', axis: 'x' })
    expect(resolveSemanticRail(A_BINDINGS, 'outerPillar.end')).toEqual({ railKey: 'outer-bottom', axis: 'y' })
    expect(resolveSemanticRail(YA_BINDINGS, 'primaryBeam.center')).toBeNull()
    expect(resolveSemanticRail(A_BINDINGS, 'primaryBeam')).toBeNull()
  })
})

describe('propagationEditOf', () => {
  const medialParts = [medialPart('JU', { 'inner-right': 0.7, 'inner-bottom': 0.5, 'inner-top': 0.2, 'outer-top': 0.1 })]
  const componentParts = [componentPart('CH', faces)]
  it('안 바뀐 rail은 빠지고, 중심은 em Δ로 배치에, 시작은 슬롯 비율로 형태에 들어간다 — 획 역할 키로', () => {
    const edit = propagationEditOf({
      editable: [
        rail({ id: '0:inner-right', role: 'inner-right', kind: 'center', value: 0.712, original: 0.7 }),
        rail({ id: '0:outer-top', role: 'outer-top', kind: 'start', axis: 'y', value: 0.1, original: 0.1 }),
        rail({ id: '0:inner-top', role: 'inner-top', kind: 'start', axis: 'y', value: 0.28, original: 0.2 }),
        rail({ id: 'c0:right', partIndex: 0, role: 'right', kind: 'face', value: 0.48, original: 0.5 }),
      ],
      medialParts, componentParts,
    })
    expect(edit.layout.medial.JU).toEqual({ 'outerPillar.center': expect.closeTo(0.012, 9) })
    expect(edit.layout.component.CH).toEqual({ right: expect.closeTo(-0.02, 9) })
    // 0.08 / 슬롯 높이 0.8 = 0.1
    expect(edit.shape.medial.JU).toEqual({ 'innerPillar.start': expect.closeTo(0.1, 9) })
    expect(hasLayoutEdit(edit)).toBe(true)
    expect(hasShapeEdit(edit)).toBe(true)
  })
  it('고정한 변 rail은 Δ가 0이어도 `{ at }`으로 들고, 중심 rail의 고정 표시는 무시한다', () => {
    const edit = propagationEditOf({
      editable: [
        rail({ id: 'c0:top', partIndex: 0, role: 'top', kind: 'face', axis: 'y', value: 0.1, original: 0.1 }),
        rail({ id: 'c0:right', partIndex: 0, role: 'right', kind: 'face', value: 0.48, original: 0.5 }),
        rail({ id: 's0:bottom', partIndex: 0, role: 'bottom', kind: 'face', axis: 'y', value: 0.9, original: 0.88 }),
        rail({ id: '0:inner-right', role: 'inner-right', kind: 'center', value: 0.7, original: 0.7 }),
      ],
      medialParts, componentParts, fixed: new Set(['c0:top', 's0:bottom', '0:inner-right']),
    })
    expect(edit.layout.component.CH).toEqual({ top: { at: 0.1 }, right: expect.closeTo(-0.02, 9) })
    expect(edit.layout.slot.JU).toEqual({ bottom: { at: 0.9 } })
    expect(edit.layout.medial.JU).toBeUndefined()
    expect(layoutDeltaOf(edit).faces?.CH?.top).toEqual({ at: 0.1 })
    expect(applyFacesDelta(faces, { top: { at: 0.3 }, right: -0.02 })).toEqual({ ...faces, top: 0.3, right: expect.closeTo(faces.right - 0.02, 9) })
  })
  it('편집이 없으면 둘 다 비어 있다', () => {
    const edit = propagationEditOf({ editable: [rail({ id: '0:inner-right', role: 'inner-right', kind: 'center', value: 0.7, original: 0.7 })], medialParts, componentParts })
    expect(hasLayoutEdit(edit)).toBe(false)
    expect(hasShapeEdit(edit)).toBe(false)
  })
})

describe('applyMedialDelta · shapeDeltaToEm · applyFacesDelta', () => {
  const aRails = { 'center-x': 0.6, 'center-y': 0.5, 'outer-right': 0.9, 'outer-top': 0.1, 'outer-bottom': 0.9, 'inner-bottom': 0.7 }
  it('ㅐ 보 중심(inner-bottom) Δ가 ㅏ에선 center-y에 얹힌다. inner-bottom은 안 건드린다', () => {
    const out = applyMedialDelta({ railsEm: aRails, bindings: A_BINDINGS }, { 'primaryBeam.center': -0.11 })
    expect(out.rails['center-y']).toBeCloseTo(0.39, 9)
    expect(out.rails['inner-bottom']).toBe(0.7)
    expect(out).toMatchObject({ applied: 1, skipped: 0 })
  })
  it('그 획이 없는 홀자(ㅑ에 보 없음)는 건너뛴 수로 알려주고 아무 rail도 안 움직인다', () => {
    const yaRails = { ...aRails, 'inner-top': 0.3 }
    const out = applyMedialDelta({ railsEm: yaRails, bindings: YA_BINDINGS }, { 'primaryBeam.center': -0.11, 'outerPillar.center': 0.02 })
    expect(out.rails['inner-bottom']).toBe(0.7)
    expect(out.rails['center-x']).toBeCloseTo(0.62, 9)
    expect(out).toMatchObject({ applied: 1, skipped: 1 })
  })
  it('두 역할 키가 같은 rail로 풀리면 먼저 온 것만 얹는다', () => {
    const out = applyMedialDelta({ railsEm: aRails, bindings: A_BINDINGS }, { 'outerPillar.center': 0.02, 'primaryBeam.start': 0.05 })
    expect(out.rails['center-x']).toBeCloseTo(0.62, 9)
    expect(out).toMatchObject({ applied: 1, skipped: 1 })
  })
  it('비율 Δ는 대상 슬롯 길이에 곱해 em이 된다', () => {
    // 보 시작은 x축(슬롯 폭 0.2), 기둥 끝은 y축(슬롯 높이 0.6)
    const em = shapeDeltaToEm({ 'primaryBeam.start': 0.1, 'outerPillar.end': -0.05 }, { x: 0, y: 0, width: 0.2, height: 0.6 }, A_BINDINGS)
    expect(em['primaryBeam.start']).toBeCloseTo(0.02, 9)
    expect(em['outerPillar.end']).toBeCloseTo(-0.03, 9)
  })
  it('네 변 Δ는 준 변만 옮긴다', () => {
    expect(applyFacesDelta(faces, { top: -0.01 })).toEqual({ ...faces, top: expect.closeTo(0.09, 9) })
  })
})

describe('propagationCandidates', () => {
  const source = corpusIdentity('멈'.codePointAt(0)!)
  it('이 레이아웃 = 같은 문맥(홀자 계열·받침 유무), 홀자는 섞이고 원본은 빠진다', () => {
    const picked = propagationCandidates({ source, scope: 'layer', count: 8 })
    expect(picked).toHaveLength(8)
    expect(picked.every((item) => item.contextId === source.contextId && item.codepoint !== source.codepoint)).toBe(true)
    expect(new Set(picked.map((item) => item.medialJamo)).size).toBeGreaterThan(1)
  })
  it('같은 홀자 묶음은 초성·받침이 섞인다', () => {
    const picked = propagationCandidates({ source, scope: 'sameJamo', count: 8 })
    expect(picked.every((item) => item.medialJamo === 'ㅓ')).toBe(true)
    expect(new Set(picked.map((item) => item.initialJamo)).size).toBeGreaterThan(1)
    expect(new Set(picked.map((item) => item.finalJamo)).size).toBeGreaterThan(1)
  })
  it('sameJamo(형태 카드 전용) = 잡은 부품 자모만 같게. 홀자를 잡으면 같은 홀자, 받침을 잡으면 같은 받침', () => {
    const ae = corpusIdentity('배'.codePointAt(0)!)
    const medialOnly = propagationCandidates({ source: ae, scope: 'sameJamo', count: 8, focus: 'JU' })
    expect(medialOnly.every((item) => item.medialJamo === 'ㅐ')).toBe(true)
    expect(medialOnly.some((item) => item.finalJamo !== null)).toBe(true)
    const finalOnly = propagationCandidates({ source, scope: 'sameJamo', count: 8, focus: 'JO' })
    expect(finalOnly.every((item) => item.finalJamo === 'ㅁ')).toBe(true)
    expect(new Set(finalOnly.map((item) => item.medialJamo)).size).toBeGreaterThan(1)
  })
  it('이 자모만 = 같은 문맥에서 잡은 부품의 자모가 고른 것 중 하나. 표본 밖 자모(ㅋ 받침)도 고르면 들어온다', () => {
    const initials = propagationCandidates({ source, scope: 'jamo', count: 8, focus: 'CH', jamos: ['ㅁ', 'ㅋ'] })
    expect(initials.length).toBeGreaterThan(0)
    expect(initials.every((item) => item.contextId === source.contextId && ['ㅁ', 'ㅋ'].includes(item.initialJamo))).toBe(true)
    expect(new Set(initials.map((item) => item.initialJamo)).size).toBe(2)
    const finals = propagationCandidates({ source, scope: 'jamo', count: 8, focus: 'JO', jamos: ['ㅋ'] })
    expect(finals.length).toBeGreaterThan(0)
    expect(finals.every((item) => item.contextId === source.contextId && item.finalJamo === 'ㅋ')).toBe(true)
    const medials = propagationCandidates({ source, scope: 'jamo', count: 8, focus: 'JU', jamos: ['ㅓ'] })
    expect(medials.every((item) => item.contextId === source.contextId && item.medialJamo === 'ㅓ')).toBe(true)
    expect(propagationCandidates({ source, scope: 'jamo', count: 8, focus: 'CH', jamos: [] })).toEqual([])
  })
  it('전체는 문맥이 섞이고, 다음 묶음은 다른 글자', () => {
    const all = propagationCandidates({ source, scope: 'all', count: 8 })
    expect(new Set(all.map((item) => item.contextId)).size).toBeGreaterThan(1)
    const next = propagationCandidates({ source, scope: 'all', count: 8, page: 1 })
    expect(next.map((item) => item.codepoint)).not.toEqual(all.map((item) => item.codepoint))
  })
})
