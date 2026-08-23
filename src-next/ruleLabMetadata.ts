import type { AnchorPoint, StrokeDataV2 } from '../src/types'

export type RuleLabJamo = 'ㄱ' | 'ㄴ' | 'ㄷ' | 'ㄹ'
export type TerminalSide = 'start' | 'end'
export type ApplicationScope = '이 지점만' | '같은 자모' | '같은 끝 형태' | '직접 지정'

export interface TerminalGeometry {
  side: TerminalSide
  position: { x: number; y: number }
  tangentAngle: number
}

export interface RuleLabObservation {
  jamo: RuleLabJamo
  role: '초성 참고 형태'
  pathId: string
  selection: { kind: 'terminal'; side: TerminalSide }
  geometry: TerminalGeometry
  rule: {
    etiquette: string
    scope: ApplicationScope
    scopeNote?: string
    status: '사용자 검토 중'
  }
}

export const JAMO_REFERENCE: Record<RuleLabJamo, { structure: string; note: string }> = {
  ㄱ: { structure: '열린 꺾임형', note: '가로 진입 뒤 세로로 전환되는 기본 참고 형태' },
  ㄴ: { structure: '열린 꺾임형', note: '세로 진행 뒤 가로로 이탈하는 기본 참고 형태' },
  ㄷ: { structure: '삼면 개방형', note: '상단·좌측·하단을 잇는 기본 참고 형태' },
  ㄹ: { structure: '다중 꺾임형', note: '방향 전환이 반복되는 기본 참고 형태' },
}

function normalizeAngle(degrees: number): number {
  let value = degrees
  while (value <= -180) value += 360
  while (value > 180) value -= 360
  return Math.round(value * 10) / 10
}

export function terminalTangentPoints(stroke: StrokeDataV2, side: TerminalSide): [AnchorPoint, AnchorPoint] {
  if (side === 'start') {
    const first = stroke.points[0]
    const next = stroke.points[1]
    return [first, first.handleOut ?? next.handleIn ?? next]
  }
  const previous = stroke.points[stroke.points.length - 2]
  const last = stroke.points[stroke.points.length - 1]
  return [last.handleIn ?? previous.handleOut ?? previous, last]
}

export function directionOf(angle: number): '오른쪽' | '아래쪽' | '왼쪽' | '위쪽' | '대각선' {
  if (Math.abs(angle) <= 15) return '오른쪽'
  if (Math.abs(Math.abs(angle) - 180) <= 15) return '왼쪽'
  if (Math.abs(angle - 90) <= 15) return '아래쪽'
  if (Math.abs(angle + 90) <= 15) return '위쪽'
  return '대각선'
}

export function inwardTerminalAngle(stroke: StrokeDataV2, side: TerminalSide): number {
  const pathAngle = analyzeTerminal(stroke, side).tangentAngle
  return side === 'start' ? pathAngle : pathAngle > 0 ? pathAngle - 180 : pathAngle + 180
}

export function writingTerminalSides(stroke: StrokeDataV2): { start: TerminalSide; end: TerminalSide } {
  const first = stroke.points[0]
  const last = stroke.points.at(-1)!
  const firstComesFirst = Math.abs(first.y - last.y) > .05 ? first.y < last.y : first.x <= last.x
  return firstComesFirst ? { start: 'start', end: 'end' } : { start: 'end', end: 'start' }
}

export function writingTerminalAngle(stroke: StrokeDataV2, role: 'start' | 'end'): number {
  const sides = writingTerminalSides(stroke)
  const side = sides[role]
  if (role === 'start') return inwardTerminalAngle(stroke, side)
  const pathAngle = analyzeTerminal(stroke, side).tangentAngle
  if (side === 'end') return pathAngle
  return pathAngle > 0 ? pathAngle - 180 : pathAngle + 180
}

export function analyzeTerminal(stroke: StrokeDataV2, side: TerminalSide): TerminalGeometry {
  if (stroke.closed || stroke.points.length < 2) throw new Error('열린 경로의 시작점과 끝점만 분석할 수 있습니다.')
  const [from, to] = terminalTangentPoints(stroke, side)
  const angle = normalizeAngle(Math.atan2(to.y - from.y, to.x - from.x) * 180 / Math.PI)
  const position = side === 'start' ? stroke.points[0] : stroke.points[stroke.points.length - 1]
  return {
    side,
    position: { x: position.x, y: position.y },
    tangentAngle: angle,
  }
}

export function createObservation(
  jamo: RuleLabJamo,
  stroke: StrokeDataV2,
  side: TerminalSide,
  etiquette: string,
  scope: ApplicationScope,
  scopeNote: string,
): RuleLabObservation {
  return {
    jamo,
    role: '초성 참고 형태',
    pathId: stroke.id,
    selection: { kind: 'terminal', side },
    geometry: analyzeTerminal(stroke, side),
    rule: {
      etiquette,
      scope,
      ...(scopeNote.trim() ? { scopeNote: scopeNote.trim() } : {}),
      status: '사용자 검토 중',
    },
  }
}
