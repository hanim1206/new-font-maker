import { describe, expect, it } from 'vitest'
import { approvedNotoInputs, connectApprovedNotoInput, createNotoBoundMaster, renderNotoBoundMaster } from './notoBoundMaster'
import type { ApprovedNotoInput } from './notoBoundMaster'
import type { CorpusDetail, CorpusPayload, RawCorpusOutline, RecordingOperation } from './notoCorpus'

const entries = approvedNotoInputs()
const entry = (character: string) => entries.find((item) => item.identity.character === character)!
function detail(input: ApprovedNotoInput): CorpusDetail {
  return {
    schema: 'noto-corpus-detail-v1', identity: structuredClone(input.identity),
    font: { id: 'noto-sans-kr', fileSha256: '194018e6b2b293a7964f037b25c0249ce1418bc9ab3c971060a03aa57861e252', axes: { wght: 400 }, unitsPerEm: 1000 },
    row: { identity: structuredClone(input.identity), stages: { outline: { status: 'candidate', reasonCodes: [] }, initial: { status: 'candidate', reasonCodes: [] }, medial: { status: 'candidate', reasonCodes: [] }, final: { status: 'not-applicable', reasonCodes: [] } } },
    stages: { ...structuredClone(input.stages), final: null },
    model: [],
  }
}

describe('승인 Noto 입력의 기준선 결속 마스터', () => {
  it('57자 모두 원본 곡선 명령·제어점·구멍을 영변경에서 재현한다', () => {
    expect(entries).toHaveLength(57)
    for (const input of entries) {
      expect(connectApprovedNotoInput(detail(input)).input).toBe(input)
      const before = JSON.stringify(input)
      const master = createNotoBoundMaster(input)
      const drawing = renderNotoBoundMaster(master)
      const initialIds = new Set((input.stages.initial.observation as { componentGroup: { value: { contourIds: number[] } } }).componentGroup.value.contourIds)
      const expected: Record<'initial' | 'medial', RecordingOperation[]> = { initial: [], medial: [] }
      let contour = -1
      for (const op of (input.stages.outline.observation as RawCorpusOutline).operations) {
        if (op.operation === 'moveTo') contour++
        expected[initialIds.has(contour) ? 'initial' : 'medial'].push(op)
      }
      for (const part of ['initial', 'medial'] as const) {
        expect(drawing.operations[part]).toHaveLength(expected[part].length)
        drawing.operations[part].forEach((op, index) => {
          const source = expected[part][index]
          expect(op.operation).toBe(source.operation)
          expect(op.arguments).toHaveLength(source.arguments.length)
          op.arguments.forEach((point, i) => {
            const original = source.arguments[i]
            if (original === null) expect(point).toBeNull()
            else {
              expect(point![0]).toBeCloseTo(original[0] / 1000, 12)
              expect(point![1]).toBeCloseTo(.88 - original[1] / 1000, 12)
            }
          })
        })
      }
      expect(JSON.stringify(input)).toBe(before)
    }
  })

  it('57자 모든 편집 기준선이 실제 생성 경로를 바꾸고 원본 복원이 정확하다', () => {
    for (const input of entries) {
      const master = createNotoBoundMaster(input)
      const unchanged = JSON.stringify(master)
      const before = renderNotoBoundMaster(master)
      for (const rail of master.rails.filter((item) => item.editable)) {
        const after = renderNotoBoundMaster(master, { [rail.id]: rail.value + .001 })
        expect(after.paths[rail.part], `${input.identity.character}/${rail.id}`).not.toBe(before.paths[rail.part])
        expect(after.paths[rail.part === 'initial' ? 'medial' : 'initial']).toBe(before.paths[rail.part === 'initial' ? 'medial' : 'initial'])
        expect(Object.values(after.operations).flat().flatMap((op) => op.arguments).every((point) => point === null || point.every(Number.isFinite))).toBe(true)
      }
      expect(renderNotoBoundMaster(master)).toEqual(before)
      expect(JSON.stringify(master)).toBe(unchanged)
    }
  })

  it('홀자 외곽면과 유한 구간이 같은 결속식으로 이동한다', () => {
    const master = createNotoBoundMaster(entry('과'))
    const pillar = master.rails.find((rail) => rail.id === 'JU:outerPillar')!
    const after = renderNotoBoundMaster(master, { [pillar.id]: pillar.value + .02 })
    for (const guide of after.guides.filter((line) => line.id === 'outerPillar')) {
      expect(guide.x1).toBeCloseTo(pillar.value + .02, 12)
      expect(guide.x2).toBeCloseTo(pillar.value + .02, 12)
    }
    expect(after.guides.filter((line) => line.id === 'lowerBeam')).toHaveLength(master.sourceGuides.lowerBeam.visibleSpans.length)
  })

  it('초성 네 기준선의 편집이 구조 선택 영역에 반영된다', () => {
    const master = createNotoBoundMaster(entry('고'))
    const right = master.rails.find((rail) => rail.id === 'CH:right')!
    const after = renderNotoBoundMaster(master, { [right.id]: right.value - .03 })
    expect(after.initialArea.x + after.initialArea.width).toBeCloseTo(right.value - .03, 12)
  })

  it('승인 없는 글자와 새 임의 입력 객체를 생성하지 않는다', () => {
    const current = detail(entry('가'))
    current.identity.character = '너'
    expect(connectApprovedNotoInput(current).input).toBeNull()
    expect(() => createNotoBoundMaster(structuredClone(entry('가')))).toThrow('검증된 승인 입력')
  })

  it('현재 폰트·측정값·윤곽·문제 표시가 달라지면 연결을 차단한다', () => {
    for (const change of ['font', 'axis', 'measurement', 'outline', 'status'] as const) {
      const current = detail(entry('가'))
      if (change === 'font') current.font.fileSha256 = '0'.repeat(64)
      if (change === 'axis') current.font.axes.wght = 700
      if (change === 'measurement') current.stages.initial!.measurements = {}
      if (change === 'outline') (current.stages.outline!.observation as RawCorpusOutline).operations.pop()
      if (change === 'status') current.row.stages.initial.status = 'abstained'
      expect(connectApprovedNotoInput(current).input, change).toBeNull()
    }
    expect(connectApprovedNotoInput(detail(entry('가')), true).input).toBeNull()
  })

  it('알 수 없는 기준선·비유한 수치·과도한 이동·역전은 차단한다', () => {
    const master = createNotoBoundMaster(entry('가'))
    const invalidEdits: Record<string, number>[] = [{ other: .5 }, { 'CH:right': NaN }, { 'CH:right': Infinity }, { 'CH:right': 3 }, { 'JU:x:min': 0 }]
    for (const edits of invalidEdits) {
      expect(() => renderNotoBoundMaster(master, edits)).toThrow()
    }
    const invalid = structuredClone(master)
    invalid.rails.find((rail) => rail.id === 'CH:right')!.value = invalid.rails.find((rail) => rail.id === 'CH:left')!.value
    expect(() => renderNotoBoundMaster(invalid)).toThrow('순서')
  })

  it('추출 method 버전만 바뀌어도 승인 당시 입력 자체를 사용한다', () => {
    const current = detail(entry('가'))
    const observed = current.stages.medial as CorpusPayload
    observed.observation = { ...(observed.observation as object), extractorVersion: 'new-version' }
    expect(connectApprovedNotoInput(current).input).toBe(entry('가'))
    expect(connectApprovedNotoInput(current).input?.stages.medial).not.toBe(current.stages.medial)
  })
})
