import rawInputs from '../reference-data/preset-candidates/noto-approved-guide-inputs.v1.json'
import { corpusRecordingPath } from './notoCorpus'
import type { ComponentMeasurement, CorpusDetail, CorpusFont, CorpusIdentity, CorpusPayload, MedialMeasurement, RawCorpusOutline, RecordingOperation } from './notoCorpus'

type Part = 'initial' | 'medial'
type Axis = 'x' | 'y'
interface InitialObservation { componentGroup: { value: { contourIds: number[] } } }
interface MedialObservation { elements: { elementId: string; face: { evidence: { contourId: number } } }[] }
export interface ApprovedNotoInput {
  identity: CorpusIdentity
  sourcePayloadSha256: Record<'outline' | Part, string>
  stages: Record<'outline' | Part, CorpusPayload>
}
interface InputBundle {
  schema: string
  font: CorpusFont
  caseCount: number
  inputApproved: boolean
  generatedFontApproved: boolean
  productionEligible: boolean
  automaticVersionTransfer: boolean
  approval: { fileSha256: string; recordedAt: string }
  cases: ApprovedNotoInput[]
}
const inputs = rawInputs as unknown as InputBundle
const NOTO_SHA = '194018e6b2b293a7964f037b25c0249ce1418bc9ab3c971060a03aa57861e252'
const MAX_EDIT = 0.06
const MIN_SEPARATION = 0.002
const ROLE_LABELS: Record<string, string> = { outerPillar: '바깥 기둥', innerPillar: '안 기둥', baseStem: '바탕 줄기', primaryBeam: '가로 보', upperBeam: '위 가로 보', lowerBeam: '아래 가로 보' }

export interface BoundRail { id: string; label: string; axis: Axis; part: Part; value: number; editable: boolean }
interface AxisBinding { from: string; to: string; ratio: number }
interface BoundPoint { x: AxisBinding; y: AxisBinding }
interface BoundOperation { operation: string; arguments: (BoundPoint | null)[] }
export interface BoundMaster {
  schema: 'noto-bound-outline-master-v1'
  character: string
  approvalSha256: string
  sourcePayloadSha256: ApprovedNotoInput['sourcePayloadSha256']
  rails: BoundRail[]
  axes: Record<Part, Record<Axis, string[]>>
  operations: Record<Part, BoundOperation[]>
  sourceOperations: RecordingOperation[]
  sourceGuides: Record<string, MedialMeasurement>
}
export type RailEdits = Record<string, number>
export interface MasterDrawing {
  operations: Record<Part, RecordingOperation[]>
  paths: Record<Part, string>
  initialArea: { x: number; y: number; width: number; height: number }
  guides: { id: string; x1: number; y1: number; x2: number; y2: number }[]
}

function requireValue(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (value !== null && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',')}}`
  return JSON.stringify(value) ?? 'undefined'
}

export function approvedNotoInputs(): readonly ApprovedNotoInput[] {
  requireValue(inputs.schema === 'noto-approved-guide-inputs-v1' && inputs.inputApproved === true
    && inputs.generatedFontApproved === false && inputs.productionEligible === false && inputs.automaticVersionTransfer === false
    && inputs.font.fileSha256 === NOTO_SHA && inputs.font.unitsPerEm === 1000 && stable(inputs.font.axes) === '{"wght":400}'
    && inputs.caseCount === inputs.cases.length && new Set(inputs.cases.map((entry) => entry.identity.character)).size === inputs.caseCount,
  '승인 입력 묶음의 출처 또는 승인 범위가 다릅니다.')
  return inputs.cases
}

export function connectApprovedNotoInput(detail: CorpusDetail, rejected = false): { input: ApprovedNotoInput | null; reason: string } {
  const input = approvedNotoInputs().find((entry) => entry.identity.character === detail.identity.character)
  if (!input) return { input: null, reason: '승인 당시 입력 묶음에 없는 글자입니다. 자동 후보나 레거시 좌표로 생성하지 않습니다.' }
  if (rejected) return { input: null, reason: '현재 글자에 문제 표시가 있어 생성 연결을 차단했습니다.' }
  if (stable(detail.font) !== stable(inputs.font) || stable(input.identity) !== stable(detail.identity)) return { input: null, reason: '승인 원본과 현재 폰트·축·글자 문맥이 다릅니다.' }
  for (const stage of ['outline', 'initial', 'medial'] as const) {
    if (detail.row.stages[stage].status !== 'candidate' || detail.stages[stage]?.status !== 'candidate'
      || stable(detail.stages[stage]?.measurements) !== stable(input.stages[stage].measurements)) return { input: null, reason: '현재 추출 상태 또는 측정값이 승인 당시 입력과 다릅니다. 연결을 차단했습니다.' }
  }
  const currentInitial = detail.stages.initial?.observation as InitialObservation
  const currentMedial = detail.stages.medial?.observation as MedialObservation
  const sourceInitial = input.stages.initial.observation as InitialObservation
  const sourceMedial = input.stages.medial.observation as MedialObservation
  if (stable(detail.stages.outline?.observation) !== stable(input.stages.outline.observation)
    || stable(currentInitial?.componentGroup?.value) !== stable(sourceInitial.componentGroup.value)
    || stable(currentMedial?.elements?.map((element) => [element.elementId, element.face.evidence.contourId])) !== stable(sourceMedial.elements.map((element) => [element.elementId, element.face.evidence.contourId]))) {
    return { input: null, reason: '현재 윤곽 또는 역할 배정이 승인 원본과 다릅니다. 연결을 차단했습니다.' }
  }
  return { input, reason: '' }
}

function bindAxis(value: number, ids: string[], rails: Map<string, BoundRail>): AxisBinding {
  let index = ids.findIndex((id, i) => i > 0 && value <= rails.get(id)!.value) - 1
  if (index < 0) index = ids.length - 2
  const from = ids[index]
  const to = ids[index + 1]
  return { from, to, ratio: (value - rails.get(from)!.value) / (rails.get(to)!.value - rails.get(from)!.value) }
}

/** 윤곽은 Noto에서, 좌표의 재계산은 불변 Rail 결속식에서 가져온다. 획 문법 복원은 아니다. */
export function createNotoBoundMaster(input: ApprovedNotoInput): BoundMaster {
  requireValue(approvedNotoInputs().includes(input), '검증된 승인 입력 객체만 마스터로 연결할 수 있습니다.')
  const outline = input.stages.outline.observation as RawCorpusOutline
  const area = (input.stages.initial.measurements as ComponentMeasurement).selectionArea!
  const faces = (input.stages.initial.measurements as ComponentMeasurement).roleFaces!
  requireValue(area.width > 0 && area.height > 0 && Object.values(faces).every(Number.isFinite), '첫닿자 기준 영역이 올바르지 않습니다.')
  const guides = input.stages.medial.measurements as Record<string, MedialMeasurement>
  const rails: BoundRail[] = (['left', 'right', 'top', 'bottom'] as const).map((side) => ({
    id: `CH:${side}`, label: `첫닿자 ${{ left: '왼선', right: '오른선', top: '윗선', bottom: '밑선' }[side]}`,
    axis: side === 'left' || side === 'right' ? 'x' : 'y', part: 'initial', value: faces[side], editable: true,
  }))
  for (const [id, guide] of Object.entries(guides)) rails.push({ id: `JU:${id}`, label: `홀자 ${ROLE_LABELS[id] ?? id}`, axis: guide.orientation === 'vertical' ? 'x' : 'y', part: 'medial', value: guide.face, editable: true })
  for (const axis of ['x', 'y'] as const) {
    rails.push({ id: `JU:${axis}:min`, label: '고정 Font Space 경계', axis, part: 'medial', value: -0.1, editable: false })
    rails.push({ id: `JU:${axis}:max`, label: '고정 Font Space 경계', axis, part: 'medial', value: 1.1, editable: false })
  }
  const axes: BoundMaster['axes'] = { initial: { x: [], y: [] }, medial: { x: [], y: [] } }
  for (const part of ['initial', 'medial'] as const) for (const axis of ['x', 'y'] as const) {
    const selected = rails.filter((rail) => rail.part === part && rail.axis === axis).sort((a, b) => a.value - b.value)
    requireValue(selected.length >= 2 && selected.every((rail, index) => Number.isFinite(rail.value) && (!index || rail.value - selected[index - 1].value >= MIN_SEPARATION)), '역할 기준선 순서를 결속할 수 없습니다.')
    axes[part][axis] = selected.map((rail) => rail.id)
  }
  const railMap = new Map(rails.map((rail) => [rail.id, rail]))
  const initialIds = new Set((input.stages.initial.observation as InitialObservation).componentGroup.value.contourIds)
  const medialIds = new Set((input.stages.medial.observation as MedialObservation).elements.map((element) => element.face.evidence.contourId))
  const operations: BoundMaster['operations'] = { initial: [], medial: [] }
  const sourceOperations: RecordingOperation[] = []
  let contourId = -1
  for (const op of outline.operations) {
    if (op.operation === 'moveTo') contourId += 1
    requireValue(initialIds.has(contourId) !== medialIds.has(contourId), '자모 역할이 충돌하거나 비어 있습니다.')
    const part = initialIds.has(contourId) ? 'initial' : 'medial'
    const normalized = op.arguments.map((point): [number, number] | null => point === null ? null : [point[0] / outline.unitsPerEm, 0.88 - point[1] / outline.unitsPerEm])
    requireValue(normalized.every((point) => point === null || point.every(Number.isFinite)), '윤곽 제어점이 올바르지 않습니다.')
    sourceOperations.push({ operation: op.operation, arguments: normalized })
    operations[part].push({ operation: op.operation, arguments: normalized.map((point) => point === null ? null : ({ x: bindAxis(point[0], axes[part].x, railMap), y: bindAxis(point[1], axes[part].y, railMap) })) })
  }
  return { schema: 'noto-bound-outline-master-v1', character: input.identity.character, approvalSha256: inputs.approval.fileSha256, sourcePayloadSha256: { ...input.sourcePayloadSha256 }, rails, axes, operations, sourceOperations, sourceGuides: structuredClone(guides) }
}

export function railEditRange(master: BoundMaster, id: string): { min: number; max: number } {
  const rail = master.rails.find((item) => item.id === id)
  requireValue(rail?.editable, '편집 가능한 기준선이 아닙니다.')
  return { min: rail.value - MAX_EDIT, max: rail.value + MAX_EDIT }
}

export function renderNotoBoundMaster(master: BoundMaster, edits: RailEdits = {}): MasterDrawing {
  const originals = new Map(master.rails.map((rail) => [rail.id, rail]))
  for (const [id, value] of Object.entries(edits)) {
    const rail = originals.get(id)
    requireValue(rail?.editable && Number.isFinite(value) && Math.abs(value - rail.value) <= MAX_EDIT + 1e-12, '기준선 변경 범위는 원본에서 ±60 unit입니다.')
  }
  const values = new Map(master.rails.map((rail) => [rail.id, edits[rail.id] ?? rail.value]))
  for (const part of ['initial', 'medial'] as const) for (const axis of ['x', 'y'] as const) {
    const ids = master.axes[part][axis]
    requireValue(ids.every((id, index) => !index || values.get(id)! - values.get(ids[index - 1])! >= MIN_SEPARATION), '기준선 순서를 뒤집거나 겹칠 수 없습니다.')
  }
  const coordinate = (binding: AxisBinding) => values.get(binding.from)! + binding.ratio * (values.get(binding.to)! - values.get(binding.from)!)
  const operations = Object.fromEntries((['initial', 'medial'] as const).map((part) => [part, master.operations[part].map((op) => ({ operation: op.operation, arguments: op.arguments.map((point): [number, number] | null => point === null ? null : [coordinate(point.x), coordinate(point.y)]) }))])) as MasterDrawing['operations']
  const transformGuide = (x: number, y: number) => ({ x: coordinate(bindAxis(x, master.axes.medial.x, originals)), y: coordinate(bindAxis(y, master.axes.medial.y, originals)) })
  const guides = Object.entries(master.sourceGuides).flatMap(([id, guide]) => guide.visibleSpans.map((span) => {
    const vertical = guide.orientation === 'vertical'
    const from = transformGuide(vertical ? guide.face : span.from, vertical ? span.from : guide.face)
    const to = transformGuide(vertical ? guide.face : span.to, vertical ? span.to : guide.face)
    return { id, x1: from.x, y1: from.y, x2: to.x, y2: to.y }
  }))
  const left = values.get('CH:left')!
  const top = values.get('CH:top')!
  return { operations, paths: { initial: corpusRecordingPath(operations.initial), medial: corpusRecordingPath(operations.medial) }, initialArea: { x: left, y: top, width: values.get('CH:right')! - left, height: values.get('CH:bottom')! - top }, guides }
}
