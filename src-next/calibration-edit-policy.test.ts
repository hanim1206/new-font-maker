import { describe, expect, it } from 'vitest'
import type { JamoData } from '../src/types'
import { moveHandle, movePoint, moveStroke, scaleStroke } from '../src/services/editorCommands'
import { CALIBRATION_FREEFORM_BOUNDS, calibrationEditBounds } from './calibrationEditPolicy'

const jamo: JamoData = {
  char: 'ㅏ',
  type: 'jungseong',
  strokes: [{
    id: 'ㅏ-1',
    points: [
      { x: 0, y: 0, handleOut: { x: 0.1, y: 0.1 } },
      { x: 1, y: 1 },
    ],
    closed: false,
    thickness: 0.07,
  }],
}

describe('신규 보정 화면 자유 편집 경계', () => {
  it('점과 핸들이 레이아웃 슬롯의 0–1 범위를 넘어간다', () => {
    const movedPoint = movePoint(jamo, 'ㅏ-1', 1, { x: 0.25, y: 0.2 }, CALIBRATION_FREEFORM_BOUNDS)
    const movedHandle = moveHandle(jamo, 'ㅏ-1', 0, 'out', { x: -0.3, y: -0.2 }, CALIBRATION_FREEFORM_BOUNDS)

    expect(movedPoint.jamo.strokes?.[0].points[1]).toMatchObject({ x: 1.25, y: 1.2 })
    expect(movedHandle.jamo.strokes?.[0].points[0].handleOut?.x).toBeCloseTo(-0.2)
    expect(movedHandle.jamo.strokes?.[0].points[0].handleOut?.y).toBeCloseTo(-0.1)
  })

  it('획 전체 이동과 확대도 슬롯 경계에 막히지 않는다', () => {
    const moved = moveStroke(jamo, 'ㅏ-1', { x: -0.25, y: 0.3 }, CALIBRATION_FREEFORM_BOUNDS)
    const scaled = scaleStroke(jamo, 'ㅏ-1', { x: 1.5, y: 1.5 }, CALIBRATION_FREEFORM_BOUNDS)

    expect(moved.jamo.strokes?.[0].points[0]).toMatchObject({ x: -0.25, y: 0.3 })
    expect(scaled.jamo.strokes?.[0].points[0].x).toBeLessThan(0)
    expect(scaled.jamo.strokes?.[0].points[1].x).toBeGreaterThan(1)
  })

  it('경계를 명시하는 기존 편집 흐름은 계속 0–1 안에서 제한된다', () => {
    const constrained = movePoint(
      jamo,
      'ㅏ-1',
      1,
      { x: 0.25, y: 0.2 },
      { minX: 0, maxX: 1, minY: 0, maxY: 1 },
    )
    expect(constrained.changed).toBe(false)
    expect(constrained.jamo.strokes?.[0].points[1]).toMatchObject({ x: 1, y: 1 })
  })
})

describe('글자 칸 끝 경계', () => {
  const box = { x: 0.1, y: 0.1, width: 0.4, height: 0.4 }
  const strokes = jamo.strokes ?? []
  // 45° 대각 획은 두께 절반이 두 축에 1/√2씩 나뉘어 든다.
  const diagonalMargin = 0.035 / Math.SQRT2

  it('점을 칸 왼쪽 밖으로 끌면 잉크가 칸 끝에 닿는 자리에서 멈추고 다른 점은 그대로다', () => {
    const bounds = calibrationEditBounds(box, strokes)
    const moved = movePoint(jamo, 'ㅏ-1', 0, { x: -2, y: 0 }, bounds)
    const [first, second] = moved.jamo.strokes?.[0].points ?? []
    expect(box.x + first.x * box.width).toBeCloseTo(diagonalMargin)
    expect(second).toMatchObject({ x: 1, y: 1 })
  })

  it('점을 칸 아래 밖으로 끌면 세로도 잉크가 칸 끝에 닿는 자리에서 멈춘다', () => {
    const bounds = calibrationEditBounds(box, strokes)
    const moved = movePoint(jamo, 'ㅏ-1', 0, { x: 0, y: 5 }, bounds)
    const [first] = moved.jamo.strokes?.[0].points ?? []
    // 이 점은 아래로 0.1 나간 핸들을 달고 있다. 핸들이 먼저 칸 끝에 닿고 점은 그만큼 안쪽에서 멈춘다.
    expect(box.y + first.handleOut!.y * box.height).toBeCloseTo(1 - diagonalMargin)
    expect(first.handleOut!.y - first.y).toBeCloseTo(0.1)
    // 핸들이 없는 점은 칸 끝까지 간다.
    const plain: JamoData = { ...jamo, strokes: [{ ...strokes[0], points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }] }
    const [bare] = movePoint(plain, 'ㅏ-1', 0, { x: 0, y: 5 }, calibrationEditBounds(box, plain.strokes ?? [])).jamo.strokes?.[0].points ?? []
    expect(box.y + bare.y * box.height).toBeCloseTo(1 - diagonalMargin)
  })

  it('이미 칸 밖에 있는 점은 가로 · 세로 모두 그 자리까지 허용한다', () => {
    const outside: JamoData = { ...jamo, strokes: [{ ...strokes[0], points: [{ x: -1, y: -2 }, { x: 1, y: 3 }] }] }
    const bounds = calibrationEditBounds(box, outside.strokes ?? [])
    expect(bounds.minX).toBe(-1)
    expect(bounds.minY).toBe(-2)
    expect(bounds.maxY).toBe(3)
  })

  it('굵기 배율만큼 끝이 더 안쪽이다', () => {
    const heavy = calibrationEditBounds(box, strokes, 2)
    expect(box.x + heavy.minX * box.width).toBeCloseTo(diagonalMargin * 2)
  })

  it('보(가로 획)는 끝점이 칸 끝까지 가고, 위아래로만 두께 절반 안쪽이다', () => {
    const beam: JamoData = { ...jamo, strokes: [{ id: 'ㅜ-보', points: [{ x: 0, y: 0.5 }, { x: 1, y: 0.5 }], closed: false, thickness: 0.08 }] }
    const bounds = calibrationEditBounds(box, beam.strokes ?? [], 1.9502)
    // 잉크는 진행 방향으로 안 나간다 — 중심선 끝이 글자 칸 끝(0 · 1)까지 간다. 굵은 굵기(900)에서도 같다.
    expect(box.x + bounds.minX * box.width).toBeCloseTo(0)
    expect(box.x + bounds.maxX * box.width).toBeCloseTo(1)
    // 위아래는 잉크 두께 절반(두께 × 배율 ÷ 2)만큼 안쪽에서 멈춘다.
    expect(box.y + bounds.minY * box.height).toBeCloseTo((0.08 * 1.9502) / 2)
    expect(box.y + bounds.maxY * box.height).toBeCloseTo(1 - (0.08 * 1.9502) / 2)
  })

  it('기둥(세로 획)은 좌우로만 두께 절반 안쪽이고 위아래는 칸 끝까지 간다', () => {
    const stem: JamoData = { ...jamo, strokes: [{ id: 'ㅣ-기둥', points: [{ x: 0.5, y: 0 }, { x: 0.5, y: 1 }], closed: false, thickness: 0.08 }] }
    const bounds = calibrationEditBounds(box, stem.strokes ?? [], 1.9502)
    expect(box.y + bounds.minY * box.height).toBeCloseTo(0)
    expect(box.y + bounds.maxY * box.height).toBeCloseTo(1)
    expect(box.x + bounds.minX * box.width).toBeCloseTo((0.08 * 1.9502) / 2)
  })
})
