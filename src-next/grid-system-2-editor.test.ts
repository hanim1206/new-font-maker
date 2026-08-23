import { describe, expect, it } from 'vitest'
import {
  addGrid2LocalCut,
  addGrid2Rail,
  createDefaultGrid2Project,
  getGrid2CutAngle,
  getGrid2CutPointCandidates,
  getGrid2ClipPolygon,
  getGrid2CellPaintValue,
  getGrid2Contours,
  getGrid2CurveCornerCandidates,
  getGrid2DiagonalEdgeCandidates,
  getGrid2LocalCutRemovalPolygon,
  getGrid2ShapePath,
  moveGrid2Rail,
  parseGrid2Project,
  paintGrid2Cell,
  removeGrid2Rail,
  setGrid2CutGuide,
  setGrid2DiagonalEdge,
  setGrid2GlyphCut,
  setGrid2LocalCurve,
  setGrid2SnapUnit,
  toggleGrid2Cell,
} from './gridSystem2EditorModel'

describe('Grid System 2 형태 그리드', () => {
  it('점유 셀을 하나의 닫힌 벡터 윤곽으로 합친다', () => {
    const project = createDefaultGrid2Project()
    const contours = getGrid2Contours(project, 'ㄱ')
    const path = getGrid2ShapePath(project, 'ㄱ')

    expect(contours).toHaveLength(1)
    expect(path).toContain('M ')
    expect(path.endsWith('Z')).toBe(true)
  })

  it('ㅇ의 바깥 면과 내부 공간을 서로 다른 윤곽으로 보존한다', () => {
    const project = createDefaultGrid2Project()
    expect(getGrid2Contours(project, 'ㅇ')).toHaveLength(2)
    expect(getGrid2ShapePath(project, 'ㅇ').match(/M /g)).toHaveLength(2)
  })

  it('셀 점유와 선택한 한 모서리의 곡률 범위가 실제 path를 바꾼다', () => {
    const project = createDefaultGrid2Project()
    const filled = toggleGrid2Cell(project, 'ㄱ', 1, 0)
    const candidate = getGrid2CurveCornerCandidates(filled, 'ㄱ')[0]
    const rounded = setGrid2LocalCurve(filled, 'ㄱ', {
      vertex: candidate.vertex,
      incoming: candidate.incomingOptions[0],
      outgoing: candidate.outgoingOptions[0],
    })

    expect(getGrid2ShapePath(filled, 'ㄱ')).not.toBe(getGrid2ShapePath(project, 'ㄱ'))
    expect(getGrid2ShapePath(rounded, 'ㄱ')).toContain(' Q ')
    expect(getGrid2ShapePath(rounded, 'ㄱ').match(/ Q /g)).toHaveLength(1)
  })

  it('채우기 드래그는 첫 칸의 목표 상태를 지나간 모든 칸에 같게 적용한다', () => {
    const project = createDefaultGrid2Project()
    const filled = getGrid2CellPaintValue(project, 'ㄱ', 1, 0)
    const first = paintGrid2Cell(project, 'ㄱ', 1, 0, filled)
    const second = paintGrid2Cell(first, 'ㄱ', 1, 1, filled)

    expect(filled).toBe(true)
    expect(second.glyphs['ㄱ'].cells[1][0]).toBe(true)
    expect(second.glyphs['ㄱ'].cells[1][1]).toBe(true)
    expect(paintGrid2Cell(second, 'ㄱ', 1, 0, false).glyphs['ㄱ'].cells[1][0]).toBe(false)
  })

  it('곡률이 닿은 칸을 채우면 그 곡률을 지우고 직각 면을 복원한다', () => {
    const project = createDefaultGrid2Project()
    const candidate = getGrid2CurveCornerCandidates(project, 'ㄱ')[0]
    const rounded = setGrid2LocalCurve(project, 'ㄱ', {
      vertex: candidate.vertex,
      incoming: candidate.incomingOptions[0],
      outgoing: candidate.outgoingOptions[0],
    })
    const adjacentCells = [
      { row: candidate.vertex.yIndex - 1, column: candidate.vertex.xIndex - 1 },
      { row: candidate.vertex.yIndex - 1, column: candidate.vertex.xIndex },
      { row: candidate.vertex.yIndex, column: candidate.vertex.xIndex - 1 },
      { row: candidate.vertex.yIndex, column: candidate.vertex.xIndex },
    ]
    const target = adjacentCells.find(({ row, column }) => rounded.glyphs['ㄱ'].cells[row]?.[column])!
    const restored = toggleGrid2Cell(rounded, 'ㄱ', target.row, target.column)

    expect(restored.glyphs['ㄱ'].cells[target.row][target.column]).toBe(true)
    expect(restored.glyphs['ㄱ'].curves).toEqual([])
    expect(getGrid2ShapePath(restored, 'ㄱ')).not.toContain(' Q ')
    expect(toggleGrid2Cell(restored, 'ㄱ', target.row, target.column).glyphs['ㄱ'].cells[target.row][target.column]).toBe(false)
  })

  it('볼록한 외곽 모서리의 직각 구간을 하나의 사선으로 치환한다', () => {
    const project = createDefaultGrid2Project()
    const candidates = getGrid2DiagonalEdgeCandidates(project, 'ㄱ')
    const candidate = candidates[0]
    const diagonal = setGrid2DiagonalEdge(project, 'ㄱ', {
      vertex: candidate.vertex,
      from: candidate.incomingOptions[0],
      to: candidate.outgoingOptions[0],
    })

    expect(candidates.length).toBeGreaterThan(0)
    expect(candidates.length).toBeLessThan(getGrid2CurveCornerCandidates(project, 'ㄱ').length)
    expect(diagonal.glyphs['ㄱ'].diagonalEdges).toHaveLength(1)
    expect(getGrid2ShapePath(diagonal, 'ㄱ')).not.toBe(getGrid2ShapePath(project, 'ㄱ'))
    expect(getGrid2ShapePath(diagonal, 'ㄱ')).not.toContain(' Q ')

    const adjacentCells = [
      { row: candidate.vertex.yIndex - 1, column: candidate.vertex.xIndex - 1 },
      { row: candidate.vertex.yIndex - 1, column: candidate.vertex.xIndex },
      { row: candidate.vertex.yIndex, column: candidate.vertex.xIndex - 1 },
      { row: candidate.vertex.yIndex, column: candidate.vertex.xIndex },
    ]
    const target = adjacentCells.find(({ row, column }) => diagonal.glyphs['ㄱ'].cells[row]?.[column])!
    const restored = toggleGrid2Cell(diagonal, 'ㄱ', target.row, target.column)
    expect(restored.glyphs['ㄱ'].diagonalEdges).toEqual([])
    expect(restored.glyphs['ㄱ'].cells[target.row][target.column]).toBe(true)
    expect(getGrid2ShapePath(restored, 'ㄱ')).toBe(getGrid2ShapePath(project, 'ㄱ'))
  })

  it('레일은 설정한 단위에 맞고 이웃 레일을 침범하지 않는다', () => {
    const project = createDefaultGrid2Project()
    expect(project.snapUnit).toBe(25)
    expect(moveGrid2Rail(project, 'x', 1, 287).xRails[1]).toBe(275)
    const snap50 = setGrid2SnapUnit(project, 50)
    expect(moveGrid2Rail(snap50, 'x', 1, 287).xRails[1]).toBe(300)
    expect(moveGrid2Rail(project, 'x', 1, 890).xRails[1]).toBe(project.xRails[2] - 50)
    expect(moveGrid2Rail(project, 'x', 0, 500).xRails[0]).toBe(project.xRails[0])
  })

  it('세로 레일 추가·삭제 시 점유 칸을 분할하고 다시 병합한다', () => {
    const project = createDefaultGrid2Project()
    const added = addGrid2Rail(project, 'x', 1)
    expect(added.xRails).toHaveLength(project.xRails.length + 1)
    expect(added.yRails).toHaveLength(project.yRails.length)
    expect(added.glyphs['ㄱ'].cells[0]).toHaveLength(project.glyphs['ㄱ'].cells[0].length + 1)
    expect(getGrid2ShapePath(added, 'ㄱ')).toBe(getGrid2ShapePath(project, 'ㄱ'))

    const removed = removeGrid2Rail(added, 'x', 2)
    expect(removed.xRails).toEqual(project.xRails)
    expect(removed.glyphs['ㄱ'].cells).toEqual(project.glyphs['ㄱ'].cells)
  })

  it('가로 레일도 모든 자모의 행을 함께 추가·삭제한다', () => {
    const project = createDefaultGrid2Project()
    const added = addGrid2Rail(project, 'y', 2)
    expect(added.glyphs['ㅇ'].cells).toHaveLength(project.glyphs['ㅇ'].cells.length + 1)
    expect(added.glyphs['ㅇ'].cells[3]).toEqual(added.glyphs['ㅇ'].cells[2])
    expect(removeGrid2Rail(added, 'y', 3).glyphs['ㅇ'].cells).toEqual(project.glyphs['ㅇ'].cells)
  })

  it('두 그리드 교점을 이은 실제 각도로 절단한다', () => {
    const project = createDefaultGrid2Project()
    const guide45 = setGrid2CutGuide(project, { xIndex: 0, yIndex: 1 }, { xIndex: 1, yIndex: 0 })
    const cutAbove = setGrid2GlyphCut(guide45, 'ㄱ', 'above')
    const cutBelow = setGrid2GlyphCut(guide45, 'ㄱ', 'below')

    expect(getGrid2CutAngle(guide45)).toBe(45)
    expect(guide45.cutGuide).toEqual({ from: { xIndex: 0, yIndex: 1 }, to: { xIndex: 1, yIndex: 0 } })
    expect(getGrid2ClipPolygon(cutAbove, 'ㄱ')).not.toBe(getGrid2ClipPolygon(project, 'ㄱ'))
    expect(getGrid2ClipPolygon(cutAbove, 'ㄱ')).not.toBe(getGrid2ClipPolygon(cutBelow, 'ㄱ'))
    const linePoints = getGrid2ClipPolygon(cutAbove, 'ㄱ').split(' ').map((value) => value.split(',').map(Number))
      .filter(([x, y]) => Math.abs((225 - 100) * (y - 225) - (100 - 225) * (x - 100)) < 0.01)
    expect(linePoints.length).toBeGreaterThanOrEqual(2)
    const moved = moveGrid2Rail(guide45, 'x', 1, 300)
    expect(getGrid2CutAngle(moved)).not.toBe(45)
  })

  it('절단은 선택한 한 칸에만 적용하고 같은 각도를 누적한다', () => {
    const project = setGrid2CutGuide(createDefaultGrid2Project(), { xIndex: 0, yIndex: 1 }, { xIndex: 1, yIndex: 0 })
    const firstCut = {
      guide: project.cutGuide,
      anchor: project.cutGuide.from,
      target: { row: 0, column: 0 },
      side: 'above' as const,
    }
    const once = addGrid2LocalCut(project, 'ㄱ', firstCut)
    const firstPolygon = getGrid2LocalCutRemovalPolygon(once, firstCut)
    const coordinates = firstPolygon.split(' ').flatMap((point) => point.split(',').map(Number))

    expect(once.glyphs['ㄱ'].localCuts).toHaveLength(1)
    expect(getGrid2ClipPolygon(once, 'ㄱ')).toBe('0,0 1000,0 1000,1000 0,1000')
    expect(Math.min(...coordinates)).toBeGreaterThanOrEqual(100)
    expect(Math.max(...coordinates)).toBeLessThanOrEqual(225)

    const twice = addGrid2LocalCut(once, 'ㄱ', {
      ...firstCut,
      anchor: { xIndex: 2, yIndex: 0 },
      target: { row: 0, column: 1 },
    })
    expect(twice.glyphs['ㄱ'].localCuts).toHaveLength(2)
    expect(twice.glyphs['ㄱ'].localCuts[1].guide).toEqual(firstCut.guide)
  })

  it('절단 교점은 글자 외곽선 위의 레일 교점만 제안한다', () => {
    const project = createDefaultGrid2Project()
    const candidates = getGrid2CutPointCandidates(project, 'ㄱ')

    expect(candidates).toContainEqual({ xIndex: 1, yIndex: 0 })
    expect(candidates).toContainEqual({ xIndex: 0, yIndex: 1 })
    expect(candidates).not.toContainEqual({ xIndex: 3, yIndex: 3 })
    expect(candidates.length).toBeLessThan(project.xRails.length * project.yRails.length)
  })

  it('레일 추가·삭제 후에도 절단 기준 교점의 위치를 이어간다', () => {
    const guide = setGrid2CutGuide(createDefaultGrid2Project(), { xIndex: 1, yIndex: 2 }, { xIndex: 3, yIndex: 0 })
    const candidate = getGrid2CurveCornerCandidates(guide, 'ㄱ').find((value) => value.vertex.xIndex > 0)!
    const curved = setGrid2LocalCurve(guide, 'ㄱ', { vertex: candidate.vertex, incoming: candidate.incomingOptions[0], outgoing: candidate.outgoingOptions[0] })
    const project = setGrid2GlyphCut(curved, 'ㄱ', 'above')
    const added = addGrid2Rail(project, 'x', 0)
    expect(added.cutGuide).toEqual({ from: { xIndex: 2, yIndex: 2 }, to: { xIndex: 4, yIndex: 0 } })
    expect(added.glyphs['ㄱ'].cut?.guide).toEqual({ from: { xIndex: 2, yIndex: 2 }, to: { xIndex: 4, yIndex: 0 } })
    expect(added.glyphs['ㄱ'].curves[0].vertex.xIndex).toBe(project.glyphs['ㄱ'].curves[0].vertex.xIndex + 1)
    expect(removeGrid2Rail(added, 'x', 1).cutGuide).toEqual(project.cutGuide)
  })

  it('저장 데이터가 훼손되면 기본안으로 안전하게 거부한다', () => {
    const project = createDefaultGrid2Project()
    expect(parseGrid2Project(JSON.parse(JSON.stringify(project)))).toEqual(project)
    const legacy = JSON.parse(JSON.stringify(project)) as Record<string, unknown>
    delete legacy.snapUnit
    delete legacy.cutGuide
    Object.values(legacy.glyphs as Record<string, Record<string, unknown>>).forEach((glyph) => {
      delete glyph.cut
      delete glyph.curves
      delete glyph.localCuts
      delete glyph.diagonalEdges
    })
    expect(parseGrid2Project(legacy)?.snapUnit).toBe(25)
    expect(parseGrid2Project(legacy)?.cutGuide).toEqual(project.cutGuide)
    expect(parseGrid2Project(legacy)?.glyphs['ㄱ'].cut).toBeNull()
    expect(parseGrid2Project(legacy)?.glyphs['ㄱ'].curves).toEqual([])
    expect(parseGrid2Project(legacy)?.glyphs['ㄱ'].localCuts).toEqual([])
    expect(parseGrid2Project(legacy)?.glyphs['ㄱ'].diagonalEdges).toEqual([])
    expect(parseGrid2Project({ version: 1, xRails: [1, 2], yRails: [1, 2], glyphs: {} })).toBeNull()
  })
})
