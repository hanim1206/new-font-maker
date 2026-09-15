export const CORPUS_TOTAL = 11172
export const CORPUS_STAGES = ['outline', 'initial', 'medial', 'final'] as const
export const PART_STAGES = ['initial', 'medial', 'final'] as const
export const CORPUS_INITIALS = [...'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ']
export const CORPUS_MEDIALS = [...'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ']
export const CORPUS_FINALS = [null, ...'ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ']
export const REVIEW_STORAGE_KEY = 'noto-corpus-local-reviews-v1'
export type CorpusStage = typeof CORPUS_STAGES[number]
export type PartStage = typeof PART_STAGES[number]
export type CorpusStatus = 'candidate' | 'partial' | 'abstained' | 'unsupported' | 'blocked' | 'error' | 'not-applicable' | 'unprocessed'
export const STAGE_LABEL: Record<CorpusStage, string> = { outline: '원본 윤곽', initial: '첫닿자', medial: '홀자', final: '끝닿자' }
export const STATUS_LABEL: Record<CorpusStatus, string> = { candidate: '필수값 후보', partial: '일부 누락', abstained: '자동 포기', unsupported: '문맥 미지원', blocked: '선행 입력 없음', error: '실행 오류', 'not-applicable': '해당 없음', unprocessed: '미추출' }

export interface CorpusIdentity {
  character: string
  codepoint: number
  initialJamo: string
  medialJamo: string
  finalJamo: string | null
  contextId: string
}
export interface CorpusStageSummary {
  status: CorpusStatus
  reasonCodes: string[]
  payloadSha256?: string
  reviewKey?: string
}
export interface CorpusRow { identity: CorpusIdentity; stages: Record<CorpusStage, CorpusStageSummary> }
export interface CorpusFont { id: string; fileSha256: string; axes: Record<string, number>; unitsPerEm: number }
export interface CorpusSnapshot {
  schema: 'noto-corpus-dashboard-v1'
  runId: string
  font: CorpusFont
  updatedAt: string
  rows: CorpusRow[]
  warnings: string[]
  deltaCount: number
  /** 승인 입력 artifact의 글자 수. 파일이 없거나 승인 표시가 아니면 null. */
  approvedInputCount: number | null
}
export interface ComponentMeasurement { roleFaces?: Record<string, number>; selectionArea?: { x: number; y: number; width: number; height: number } }
export interface MedialMeasurement { orientation: 'vertical' | 'horizontal'; faceSide: string; face: number; visibleSpans: { from: number; to: number }[]; visibleLength: number }
export interface RecordingOperation { operation: string; arguments: ([number, number] | null)[] }
export interface RawCorpusOutline { unitsPerEm: number; operations: RecordingOperation[] }
export interface CorpusPayload { status: CorpusStatus; reasonCodes: string[]; observation: unknown; measurements: Record<string, unknown> }
export interface CorpusDetail { schema: 'noto-corpus-detail-v1'; identity: CorpusIdentity; font: CorpusFont; row: CorpusRow; stages: Record<CorpusStage, CorpusPayload | null> }
export interface CorpusReview { verdict: 'approved' | 'rejected'; note: string; reviewedAt: string }
export type CorpusReviews = Record<string, CorpusReview>

export function corpusIdentity(codepoint: number): CorpusIdentity {
  const offset = codepoint - 0xac00
  if (!Number.isInteger(offset) || offset < 0 || offset >= CORPUS_TOTAL) throw new Error('현대 한글 범위가 아닙니다.')
  const medialJamo = CORPUS_MEDIALS[Math.floor((offset % 588) / 28)]
  const finalJamo = CORPUS_FINALS[offset % 28]
  const family = 'ㅘㅙㅚㅝㅞㅟㅢ'.includes(medialJamo) ? 'mixed' : 'ㅗㅛㅜㅠㅡ'.includes(medialJamo) ? 'bottom' : 'right'
  return { codepoint, character: String.fromCodePoint(codepoint), initialJamo: CORPUS_INITIALS[Math.floor(offset / 588)], medialJamo, finalJamo, contextId: family + (finalJamo ? '-final' : '') }
}

export function corpusCodepoint(initial: string, medial: string, final: string | null): number {
  const [i, m, f] = [CORPUS_INITIALS.indexOf(initial), CORPUS_MEDIALS.indexOf(medial), CORPUS_FINALS.indexOf(final)]
  if (i < 0 || m < 0 || f < 0) throw new Error('현대 한글 자모 조합이 아닙니다.')
  return 0xac00 + (i * 21 + m) * 28 + f
}

export function emptyCorpusRow(codepoint: number): CorpusRow {
  const identity = corpusIdentity(codepoint)
  const pending: CorpusStageSummary = { status: 'unprocessed', reasonCodes: [] }
  return { identity, stages: { outline: pending, initial: pending, medial: pending, final: identity.finalJamo ? pending : { status: 'not-applicable', reasonCodes: [] } } }
}

export function allCorpusRows(snapshot: CorpusSnapshot): CorpusRow[] {
  const observed = new Map(snapshot.rows.map((row) => [row.identity.codepoint, row]))
  return Array.from({ length: CORPUS_TOTAL }, (_, index) => observed.get(0xac00 + index) ?? emptyCorpusRow(0xac00 + index))
}

export function requiredParts(row: CorpusRow): PartStage[] { return row.identity.finalJamo ? [...PART_STAGES] : ['initial', 'medial'] }
export function isCompleteCandidate(row: CorpusRow): boolean { return row.stages.outline.status === 'candidate' && requiredParts(row).every((stage) => row.stages[stage].status === 'candidate') }
export function reviewFor(row: CorpusRow, stage: PartStage, reviews: CorpusReviews): CorpusReview | undefined {
  const key = row.stages[stage].reviewKey
  return key ? reviews[key] : undefined
}
export function isReviewed(row: CorpusRow, reviews: CorpusReviews): boolean { return isCompleteCandidate(row) && requiredParts(row).every((stage) => reviewFor(row, stage, reviews)?.verdict === 'approved') }
export function hasRejection(row: CorpusRow, reviews: CorpusReviews): boolean { return requiredParts(row).some((stage) => reviewFor(row, stage, reviews)?.verdict === 'rejected') }

// 격자 칸 하나의 대표 상태. 검수 판정이 추출 상태보다 우선한다.
export type CorpusCellStatus = 'reviewed' | 'candidate' | 'missing' | 'unsupported' | 'rejected' | 'unprocessed'
export const CELL_STATUS_LABEL: Record<CorpusCellStatus, string> = { reviewed: '내 검수 완료', candidate: '필수값 후보', missing: '누락·포기·오류', unsupported: '문맥 미지원', rejected: '문제 표시', unprocessed: '미추출' }
export function corpusCellStatus(row: CorpusRow, reviews: CorpusReviews): CorpusCellStatus {
  if (hasRejection(row, reviews)) return 'rejected'
  if (isReviewed(row, reviews)) return 'reviewed'
  if (isCompleteCandidate(row)) return 'candidate'
  if (row.stages.outline.status === 'unprocessed') return 'unprocessed'
  return requiredParts(row).some((stage) => row.stages[stage].status === 'unsupported') ? 'unsupported' : 'missing'
}
export function corpusPartStatus(row: CorpusRow, stage: PartStage, reviews: CorpusReviews): CorpusCellStatus | 'not-applicable' {
  const status = row.stages[stage].status
  if (status === 'not-applicable') return status
  const verdict = reviewFor(row, stage, reviews)?.verdict
  if (verdict) return verdict === 'approved' ? 'reviewed' : 'rejected'
  return status === 'candidate' || status === 'unsupported' || status === 'unprocessed' ? status : 'missing'
}

export function corpusProgress(rows: CorpusRow[], reviews: CorpusReviews) {
  return {
    total: rows.length,
    attempted: rows.filter((row) => row.stages.outline.status !== 'unprocessed').length,
    outline: rows.filter((row) => row.stages.outline.status === 'candidate').length,
    initial: rows.filter((row) => row.stages.initial.status === 'candidate').length,
    medial: rows.filter((row) => row.stages.medial.status === 'candidate').length,
    final: rows.filter((row) => row.stages.final.status === 'candidate').length,
    finalTotal: rows.filter((row) => row.identity.finalJamo !== null).length,
    complete: rows.filter(isCompleteCandidate).length,
    reviewed: rows.filter((row) => isReviewed(row, reviews)).length,
    rejected: rows.filter((row) => hasRejection(row, reviews)).length,
  }
}

export function parseCorpusReviews(raw: string | null): CorpusReviews {
  if (raw === null) return {}
  const value = JSON.parse(raw) as { schema?: string; entries?: CorpusReviews }
  if (value.schema !== REVIEW_STORAGE_KEY || !value.entries || typeof value.entries !== 'object' || Array.isArray(value.entries)) throw new Error('검수 기록 형식이 다릅니다. 기존 기록은 덮어쓰지 않습니다.')
  for (const entry of Object.values(value.entries)) {
    if (!entry || !['approved', 'rejected'].includes(entry.verdict) || typeof entry.note !== 'string' || typeof entry.reviewedAt !== 'string') throw new Error('검수 기록이 손상되었습니다. 기존 기록은 보존합니다.')
  }
  return value.entries
}

// TrueType의 암시적 on-curve 점을 복원한다. 기준선 좌표나 곡률을 보정하지 않는다.
export function corpusRecordingPath(operations: RecordingOperation[]): string {
  const path: string[] = []
  const point = (value: [number, number] | null): [number, number] => {
    if (!Array.isArray(value) || value.length !== 2 || !value.every(Number.isFinite)) throw new Error('원본 곡선 좌표가 올바르지 않습니다.')
    return value
  }
  const midpoint = (a: [number, number], b: [number, number]): [number, number] => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
  for (const { operation, arguments: args } of operations) {
    if (operation === 'moveTo' || operation === 'lineTo') {
      if (args.length !== 1) throw new Error('원본 선 명령이 올바르지 않습니다.')
      path.push(`${operation === 'moveTo' ? 'M' : 'L'}${point(args[0]).join(' ')}`)
    } else if (operation === 'qCurveTo') {
      if (!args.length) throw new Error('원본 이차 곡선이 비어 있습니다.')
      const controls = args.slice(0, -1).map(point)
      const last = args[args.length - 1]
      if (last === null && !controls.length) throw new Error('암시적 곡선 시작점이 없습니다.')
      const end = last === null ? midpoint(controls[0], controls[controls.length - 1]) : point(last)
      if (last === null) path.push(`M${end.join(' ')}`)
      if (!controls.length) path.push(`L${end.join(' ')}`)
      controls.forEach((control, index) => path.push(`Q${control.join(' ')} ${(index + 1 < controls.length ? midpoint(control, controls[index + 1]) : end).join(' ')}`))
    } else if (operation === 'curveTo') {
      if (args.length !== 3) throw new Error('이 화면은 3개 점의 cubic 곡선만 지원합니다. 원본은 보존했습니다.')
      path.push(`C${args.map((value) => point(value).join(' ')).join(' ')}`)
    } else if (operation === 'closePath') path.push('Z')
    else if (operation !== 'endPath') throw new Error(`미지원 원본 곡선 명령: ${operation}`)
  }
  return path.join(' ')
}
