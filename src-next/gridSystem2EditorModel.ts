export const GRID2_JAMOS = ['ㄱ', 'ㄴ', 'ㄷ', 'ㅁ', 'ㅇ'] as const

export type Grid2Jamo = (typeof GRID2_JAMOS)[number]
export type Grid2Tool = 'rails' | 'fill' | 'curve' | 'diagonal'
export type Grid2CurveMode = 'square' | 'grid-rounded'
export type Grid2CutCorner = 'top-left' | 'top-right' | 'bottom-right' | 'bottom-left'
export type Grid2Axis = 'x' | 'y'
export type Grid2CutSide = 'above' | 'below'

export interface Grid2GridPoint { xIndex: number; yIndex: number }
export interface Grid2CutGuide { from: Grid2GridPoint; to: Grid2GridPoint }
export interface Grid2AppliedCut { guide: Grid2CutGuide; side: Grid2CutSide }
export interface Grid2CellRef { row: number; column: number }
export interface Grid2LocalCut { guide: Grid2CutGuide; anchor: Grid2GridPoint; target: Grid2CellRef; side: Grid2CutSide }
export interface Grid2LocalCurve { vertex: Grid2GridPoint; incoming: Grid2GridPoint; outgoing: Grid2GridPoint }
export interface Grid2DiagonalEdge { vertex: Grid2GridPoint; from: Grid2GridPoint; to: Grid2GridPoint }

export interface Grid2GlyphDesign {
  cells: boolean[][]
  /** 이전 저장 데이터 호환용. 새 곡률은 curves에 저장한다. */
  curve: Grid2CurveMode
  /** 이전 저장 데이터 호환용. 새 절단은 cut에 저장한다. */
  cuts: Grid2CutCorner[]
  cut: Grid2AppliedCut | null
  localCuts: Grid2LocalCut[]
  curves: Grid2LocalCurve[]
  diagonalEdges: Grid2DiagonalEdge[]
}

export interface Grid2CurveCornerCandidate {
  vertex: Grid2GridPoint
  previous: Grid2GridPoint
  next: Grid2GridPoint
  incomingOptions: Grid2GridPoint[]
  outgoingOptions: Grid2GridPoint[]
}

export interface Grid2Project {
  version: 1
  snapUnit: number
  cutGuide: Grid2CutGuide
  xRails: number[]
  yRails: number[]
  glyphs: Record<Grid2Jamo, Grid2GlyphDesign>
}

export interface Grid2Point { x: number; y: number }
export interface Grid2Bounds { x0: number; y0: number; x1: number; y1: number }

const DEFAULT_RAILS = [100, 225, 350, 500, 650, 775, 900]
const MIN_RAIL_GAP = 50
const MAX_RAILS_PER_AXIS = 12
const DEFAULT_CELLS: Record<Grid2Jamo, string[]> = {
  'ㄱ': ['111111', '000001', '000001', '000001', '000001', '000001'],
  'ㄴ': ['100000', '100000', '100000', '100000', '100000', '111111'],
  'ㄷ': ['111111', '100000', '100000', '100000', '100000', '111111'],
  'ㅁ': ['111111', '100001', '100001', '100001', '100001', '111111'],
  'ㅇ': ['011110', '110011', '100001', '100001', '110011', '011110'],
}

function rowsToCells(rows: string[]): boolean[][] {
  return rows.map((row) => [...row].map((cell) => cell === '1'))
}

function createDefaultCutGuide(xRailCount = DEFAULT_RAILS.length, yRailCount = DEFAULT_RAILS.length): Grid2CutGuide {
  return {
    from: { xIndex: 0, yIndex: Math.min(2, yRailCount - 1) },
    to: { xIndex: Math.min(3, xRailCount - 1), yIndex: 0 },
  }
}

export function createDefaultGrid2Project(): Grid2Project {
  const glyphs = {} as Record<Grid2Jamo, Grid2GlyphDesign>
  for (const jamo of GRID2_JAMOS) glyphs[jamo] = {
    cells: rowsToCells(DEFAULT_CELLS[jamo]),
    curve: 'square',
    cuts: [],
    cut: null,
    localCuts: [],
    curves: [],
    diagonalEdges: [],
  }
  return {
    version: 1,
    snapUnit: 25,
    cutGuide: createDefaultCutGuide(),
    xRails: [...DEFAULT_RAILS],
    yRails: [...DEFAULT_RAILS],
    glyphs,
  }
}

export function cloneGrid2Project(project: Grid2Project): Grid2Project {
  const glyphs = {} as Record<Grid2Jamo, Grid2GlyphDesign>
  for (const jamo of GRID2_JAMOS) glyphs[jamo] = {
    cells: project.glyphs[jamo].cells.map((row) => [...row]),
    curve: project.glyphs[jamo].curve,
    cuts: [...project.glyphs[jamo].cuts],
    cut: project.glyphs[jamo].cut ? {
      side: project.glyphs[jamo].cut.side,
      guide: {
        from: { ...project.glyphs[jamo].cut.guide.from },
        to: { ...project.glyphs[jamo].cut.guide.to },
      },
    } : null,
    localCuts: project.glyphs[jamo].localCuts.map((cut) => ({
      guide: { from: { ...cut.guide.from }, to: { ...cut.guide.to } },
      anchor: { ...cut.anchor }, target: { ...cut.target }, side: cut.side,
    })),
    curves: project.glyphs[jamo].curves.map((curve) => ({
      vertex: { ...curve.vertex },
      incoming: { ...curve.incoming },
      outgoing: { ...curve.outgoing },
    })),
    diagonalEdges: project.glyphs[jamo].diagonalEdges.map((edge) => ({
      vertex: { ...edge.vertex }, from: { ...edge.from }, to: { ...edge.to },
    })),
  }
  return {
    version: 1,
    snapUnit: project.snapUnit,
    cutGuide: {
      from: { ...project.cutGuide.from },
      to: { ...project.cutGuide.to },
    },
    xRails: [...project.xRails],
    yRails: [...project.yRails],
    glyphs,
  }
}

function isBooleanGrid(value: unknown, rows: number, columns: number): value is boolean[][] {
  return Array.isArray(value) && value.length === rows
    && value.every((row) => Array.isArray(row) && row.length === columns && row.every((cell) => typeof cell === 'boolean'))
}

function isGridPoint(value: unknown, xRailCount: number, yRailCount: number): value is Grid2GridPoint {
  if (!value || typeof value !== 'object') return false
  const point = value as Partial<Grid2GridPoint>
  return Number.isInteger(point.xIndex) && Number.isInteger(point.yIndex)
    && point.xIndex! >= 0 && point.xIndex! < xRailCount
    && point.yIndex! >= 0 && point.yIndex! < yRailCount
}

function isDiagonalGuide(guide: Grid2CutGuide): boolean {
  return guide.from.xIndex !== guide.to.xIndex && guide.from.yIndex !== guide.to.yIndex
}

function parseGuide(value: unknown, xRailCount: number, yRailCount: number): Grid2CutGuide | null {
  if (!value || typeof value !== 'object') return null
  const guide = value as Partial<Grid2CutGuide>
  if (!isGridPoint(guide.from, xRailCount, yRailCount) || !isGridPoint(guide.to, xRailCount, yRailCount)) return null
  return isDiagonalGuide({ from: guide.from, to: guide.to })
    ? { from: { ...guide.from }, to: { ...guide.to } }
    : null
}

function parseLocalCurve(value: unknown, xRailCount: number, yRailCount: number): Grid2LocalCurve | null {
  if (!value || typeof value !== 'object') return null
  const curve = value as Partial<Grid2LocalCurve>
  if (!isGridPoint(curve.vertex, xRailCount, yRailCount)
    || !isGridPoint(curve.incoming, xRailCount, yRailCount)
    || !isGridPoint(curve.outgoing, xRailCount, yRailCount)) return null
  return { vertex: { ...curve.vertex }, incoming: { ...curve.incoming }, outgoing: { ...curve.outgoing } }
}

function parseDiagonalEdge(value: unknown, xRailCount: number, yRailCount: number): Grid2DiagonalEdge | null {
  if (!value || typeof value !== 'object') return null
  const edge = value as Partial<Grid2DiagonalEdge>
  if (!isGridPoint(edge.vertex, xRailCount, yRailCount)
    || !isGridPoint(edge.from, xRailCount, yRailCount)
    || !isGridPoint(edge.to, xRailCount, yRailCount)) return null
  if (!isDiagonalGuide({ from: edge.from, to: edge.to })) return null
  return { vertex: { ...edge.vertex }, from: { ...edge.from }, to: { ...edge.to } }
}

function parseLocalCut(value: unknown, xRailCount: number, yRailCount: number): Grid2LocalCut | null {
  if (!value || typeof value !== 'object') return null
  const cut = value as Partial<Grid2LocalCut>
  const guide = parseGuide(cut.guide, xRailCount, yRailCount)
  if (!guide || !isGridPoint(cut.anchor, xRailCount, yRailCount) || !cut.target || typeof cut.target !== 'object') return null
  const target = cut.target as Partial<Grid2CellRef>
  if (!Number.isInteger(target.row) || !Number.isInteger(target.column) || target.row! < 0 || target.row! >= yRailCount - 1 || target.column! < 0 || target.column! >= xRailCount - 1) return null
  if (cut.side !== 'above' && cut.side !== 'below') return null
  return { guide, anchor: { ...cut.anchor }, target: { row: target.row!, column: target.column! }, side: cut.side }
}

export function parseGrid2Project(value: unknown): Grid2Project | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<Grid2Project>
  if (candidate.version !== 1 || !Array.isArray(candidate.xRails) || !Array.isArray(candidate.yRails)) return null
  if (candidate.xRails.length < 3 || candidate.yRails.length < 3) return null
  if (![...candidate.xRails, ...candidate.yRails].every((rail) => typeof rail === 'number' && Number.isFinite(rail))) return null
  if (!candidate.xRails.every((rail, index) => index === 0 || rail > candidate.xRails![index - 1])) return null
  if (!candidate.yRails.every((rail, index) => index === 0 || rail > candidate.yRails![index - 1])) return null
  if (!candidate.glyphs || typeof candidate.glyphs !== 'object') return null
  const rows = candidate.yRails.length - 1
  const columns = candidate.xRails.length - 1
  const project = createDefaultGrid2Project()
  project.snapUnit = typeof candidate.snapUnit === 'number' && Number.isFinite(candidate.snapUnit)
    ? Math.max(5, Math.min(100, Math.round(candidate.snapUnit / 5) * 5))
    : 25
  project.xRails = [...candidate.xRails]
  project.yRails = [...candidate.yRails]
  project.cutGuide = parseGuide(candidate.cutGuide, candidate.xRails.length, candidate.yRails.length)
    ?? createDefaultCutGuide(candidate.xRails.length, candidate.yRails.length)
  for (const jamo of GRID2_JAMOS) {
    const glyph = candidate.glyphs[jamo]
    if (!glyph || !isBooleanGrid(glyph.cells, rows, columns)) return null
    project.glyphs[jamo] = {
      cells: glyph.cells.map((row) => [...row]),
      curve: glyph.curve === 'grid-rounded' ? 'grid-rounded' : 'square',
      cuts: Array.isArray(glyph.cuts)
        ? glyph.cuts.filter((corner): corner is Grid2CutCorner => ['top-left', 'top-right', 'bottom-right', 'bottom-left'].includes(corner))
        : [],
      cut: (() => {
        if (!glyph.cut || typeof glyph.cut !== 'object') return null
        const cut = glyph.cut as Partial<Grid2AppliedCut>
        const guide = parseGuide(cut.guide, project.xRails.length, project.yRails.length)
        return guide && (cut.side === 'above' || cut.side === 'below') ? { guide, side: cut.side } : null
      })(),
      localCuts: Array.isArray(glyph.localCuts)
        ? glyph.localCuts.map((cut) => parseLocalCut(cut, project.xRails.length, project.yRails.length)).filter((cut): cut is Grid2LocalCut => cut !== null)
        : [],
      curves: Array.isArray(glyph.curves)
        ? glyph.curves.map((curve) => parseLocalCurve(curve, project.xRails.length, project.yRails.length)).filter((curve): curve is Grid2LocalCurve => curve !== null)
        : [],
      diagonalEdges: Array.isArray(glyph.diagonalEdges)
        ? glyph.diagonalEdges.map((edge) => parseDiagonalEdge(edge, project.xRails.length, project.yRails.length)).filter((edge): edge is Grid2DiagonalEdge => edge !== null)
        : [],
    }
  }
  return project
}

export function moveGrid2Rail(project: Grid2Project, axis: Grid2Axis, index: number, value: number): Grid2Project {
  const next = cloneGrid2Project(project)
  const rails = axis === 'x' ? next.xRails : next.yRails
  if (!Number.isFinite(value) || index <= 0 || index >= rails.length - 1) return next
  const min = rails[index - 1] + MIN_RAIL_GAP
  const max = rails[index + 1] - MIN_RAIL_GAP
  const unit = next.snapUnit
  const snapped = Math.round(value / unit) * unit
  const snappedMin = Math.ceil(min / unit) * unit
  const snappedMax = Math.floor(max / unit) * unit
  rails[index] = snappedMin <= snappedMax
    ? Math.max(snappedMin, Math.min(snappedMax, snapped))
    : Math.max(min, Math.min(max, value))
  return next
}

export function setGrid2SnapUnit(project: Grid2Project, value: number): Grid2Project {
  const next = cloneGrid2Project(project)
  if (!Number.isFinite(value)) return next
  next.snapUnit = Math.max(5, Math.min(100, Math.round(value / 5) * 5))
  return next
}

export function setGrid2CutGuide(project: Grid2Project, from: Grid2GridPoint, to: Grid2GridPoint): Grid2Project {
  const next = cloneGrid2Project(project)
  if (!isGridPoint(from, next.xRails.length, next.yRails.length) || !isGridPoint(to, next.xRails.length, next.yRails.length)) return next
  const guide = { from: { ...from }, to: { ...to } }
  if (!isDiagonalGuide(guide)) return next
  next.cutGuide = guide
  return next
}

export function getGrid2CutGuideCoordinates(project: Grid2Project, guide = project.cutGuide): { from: Grid2Point; to: Grid2Point } {
  return {
    from: { x: project.xRails[guide.from.xIndex], y: project.yRails[guide.from.yIndex] },
    to: { x: project.xRails[guide.to.xIndex], y: project.yRails[guide.to.yIndex] },
  }
}

export function getGrid2CutAngle(project: Grid2Project, guide = project.cutGuide): number {
  const { from, to } = getGrid2CutGuideCoordinates(project, guide)
  return Math.atan2(Math.abs(to.y - from.y), Math.abs(to.x - from.x)) * 180 / Math.PI
}

export function setGrid2GlyphCut(project: Grid2Project, jamo: Grid2Jamo, side: Grid2CutSide | null): Grid2Project {
  const next = cloneGrid2Project(project)
  next.glyphs[jamo].cut = side ? {
    side,
    guide: { from: { ...next.cutGuide.from }, to: { ...next.cutGuide.to } },
  } : null
  return next
}

export function addGrid2LocalCut(project: Grid2Project, jamo: Grid2Jamo, cut: Grid2LocalCut): Grid2Project {
  const next = cloneGrid2Project(project)
  next.glyphs[jamo].cut = null
  next.glyphs[jamo].localCuts.push({ guide: { from: { ...cut.guide.from }, to: { ...cut.guide.to } }, anchor: { ...cut.anchor }, target: { ...cut.target }, side: cut.side })
  return next
}

function findWidestGap(rails: number[]): number {
  let widestIndex = 0
  let widest = -Infinity
  for (let index = 0; index < rails.length - 1; index += 1) {
    const width = rails[index + 1] - rails[index]
    if (width > widest) { widest = width; widestIndex = index }
  }
  return widestIndex
}

export function getGrid2RailInsertGap(project: Grid2Project, axis: Grid2Axis, preferredGap?: number): number | null {
  const rails = axis === 'x' ? project.xRails : project.yRails
  if (rails.length >= MAX_RAILS_PER_AXIS) return null
  const candidate = preferredGap !== undefined && preferredGap >= 0 && preferredGap < rails.length - 1
    ? preferredGap
    : findWidestGap(rails)
  if (rails[candidate + 1] - rails[candidate] >= MIN_RAIL_GAP * 2) return candidate
  const available = rails.map((rail, index) => index < rails.length - 1 ? rails[index + 1] - rail : -Infinity)
    .map((width, index) => ({ width, index }))
    .filter(({ width }) => width >= MIN_RAIL_GAP * 2)
    .sort((a, b) => b.width - a.width)[0]
  return available?.index ?? null
}

function getGridPointReferences(project: Grid2Project): Grid2GridPoint[] {
  const points = [project.cutGuide.from, project.cutGuide.to]
  for (const jamo of GRID2_JAMOS) {
    const glyph = project.glyphs[jamo]
    if (glyph.cut) points.push(glyph.cut.guide.from, glyph.cut.guide.to)
    for (const cut of glyph.localCuts) points.push(cut.guide.from, cut.guide.to, cut.anchor)
    for (const curve of glyph.curves) points.push(curve.vertex, curve.incoming, curve.outgoing)
    for (const edge of glyph.diagonalEdges) points.push(edge.vertex, edge.from, edge.to)
  }
  return points
}

export function addGrid2Rail(project: Grid2Project, axis: Grid2Axis, preferredGap?: number): Grid2Project {
  const gap = getGrid2RailInsertGap(project, axis, preferredGap)
  if (gap === null) return cloneGrid2Project(project)
  const next = cloneGrid2Project(project)
  const rails = axis === 'x' ? next.xRails : next.yRails
  const min = rails[gap] + MIN_RAIL_GAP
  const max = rails[gap + 1] - MIN_RAIL_GAP
  const midpoint = (rails[gap] + rails[gap + 1]) / 2
  const snapped = Math.max(min, Math.min(max, Math.round(midpoint / next.snapUnit) * next.snapUnit))
  rails.splice(gap + 1, 0, snapped)
  const insertedIndex = gap + 1
  for (const point of getGridPointReferences(next)) {
    if (axis === 'x' && point.xIndex >= insertedIndex) point.xIndex += 1
    if (axis === 'y' && point.yIndex >= insertedIndex) point.yIndex += 1
  }
  for (const jamo of GRID2_JAMOS) {
    const cells = next.glyphs[jamo].cells
    for (const cut of next.glyphs[jamo].localCuts) {
      if (axis === 'x' && cut.target.column > gap) cut.target.column += 1
      if (axis === 'y' && cut.target.row > gap) cut.target.row += 1
    }
    if (axis === 'x') cells.forEach((row) => row.splice(gap + 1, 0, row[gap]))
    else cells.splice(gap + 1, 0, [...cells[gap]])
  }
  return next
}

export function removeGrid2Rail(project: Grid2Project, axis: Grid2Axis, index: number): Grid2Project {
  const next = cloneGrid2Project(project)
  const rails = axis === 'x' ? next.xRails : next.yRails
  if (rails.length <= 3 || index <= 0 || index >= rails.length - 1) return next
  rails.splice(index, 1)
  for (const point of getGridPointReferences(next)) {
    if (axis === 'x') point.xIndex = point.xIndex === index ? index - 1 : point.xIndex > index ? point.xIndex - 1 : point.xIndex
    else point.yIndex = point.yIndex === index ? index - 1 : point.yIndex > index ? point.yIndex - 1 : point.yIndex
  }
  for (const jamo of GRID2_JAMOS) {
    const cells = next.glyphs[jamo].cells
    for (const cut of next.glyphs[jamo].localCuts) {
      if (axis === 'x') cut.target.column = cut.target.column >= index ? Math.max(0, cut.target.column - 1) : cut.target.column
      else cut.target.row = cut.target.row >= index ? Math.max(0, cut.target.row - 1) : cut.target.row
    }
    if (axis === 'x') cells.forEach((row) => {
      row[index - 1] = row[index - 1] || row[index]
      row.splice(index, 1)
    })
    else {
      cells[index - 1] = cells[index - 1].map((filled, column) => filled || cells[index][column])
      cells.splice(index, 1)
    }
  }
  if (!isDiagonalGuide(next.cutGuide)) next.cutGuide = createDefaultCutGuide(next.xRails.length, next.yRails.length)
  for (const jamo of GRID2_JAMOS) {
    const cut = next.glyphs[jamo].cut
    if (cut && !isDiagonalGuide(cut.guide)) next.glyphs[jamo].cut = null
    next.glyphs[jamo].localCuts = next.glyphs[jamo].localCuts.filter((localCut) => isDiagonalGuide(localCut.guide))
    next.glyphs[jamo].diagonalEdges = next.glyphs[jamo].diagonalEdges.filter((edge) => isDiagonalGuide({ from: edge.from, to: edge.to }))
  }
  return next
}

function gridPointTouchesCell(point: Grid2GridPoint, row: number, column: number): boolean {
  return (point.xIndex === column || point.xIndex === column + 1)
    && (point.yIndex === row || point.yIndex === row + 1)
}

export function getGrid2CellPaintValue(project: Grid2Project, jamo: Grid2Jamo, row: number, column: number): boolean {
  const glyph = project.glyphs[jamo]
  const cell = glyph.cells[row]?.[column]
  if (cell === undefined) return false
  const hasLocalEdit = glyph.curves.some((curve) => gridPointTouchesCell(curve.vertex, row, column))
    || glyph.diagonalEdges.some((edge) => gridPointTouchesCell(edge.vertex, row, column))
  return hasLocalEdit || !cell
}

export function paintGrid2Cell(project: Grid2Project, jamo: Grid2Jamo, row: number, column: number, filled: boolean): Grid2Project {
  const next = cloneGrid2Project(project)
  if (next.glyphs[jamo].cells[row]?.[column] === undefined) return next
  const touchesCell = (point: Grid2GridPoint) => (
    gridPointTouchesCell(point, row, column)
  )
  const remainingCurves = next.glyphs[jamo].curves.filter((curve) => !touchesCell(curve.vertex))
  const remainingDiagonalEdges = next.glyphs[jamo].diagonalEdges.filter((edge) => !touchesCell(edge.vertex))
  next.glyphs[jamo].curves = remainingCurves
  next.glyphs[jamo].diagonalEdges = remainingDiagonalEdges
  next.glyphs[jamo].cells[row][column] = filled
  return next
}

export function toggleGrid2Cell(project: Grid2Project, jamo: Grid2Jamo, row: number, column: number): Grid2Project {
  return paintGrid2Cell(project, jamo, row, column, getGrid2CellPaintValue(project, jamo, row, column))
}

export function setGrid2Curve(project: Grid2Project, jamo: Grid2Jamo, curve: Grid2CurveMode): Grid2Project {
  const next = cloneGrid2Project(project)
  next.glyphs[jamo].curve = curve
  return next
}

function sameGridPoint(a: Grid2GridPoint, b: Grid2GridPoint): boolean {
  return a.xIndex === b.xIndex && a.yIndex === b.yIndex
}

export function setGrid2LocalCurve(project: Grid2Project, jamo: Grid2Jamo, curve: Grid2LocalCurve): Grid2Project {
  const next = cloneGrid2Project(project)
  const curves = next.glyphs[jamo].curves.filter((value) => !sameGridPoint(value.vertex, curve.vertex))
  curves.push({ vertex: { ...curve.vertex }, incoming: { ...curve.incoming }, outgoing: { ...curve.outgoing } })
  next.glyphs[jamo].curves = curves
  next.glyphs[jamo].diagonalEdges = next.glyphs[jamo].diagonalEdges.filter((edge) => !sameGridPoint(edge.vertex, curve.vertex))
  return next
}

export function removeGrid2LocalCurve(project: Grid2Project, jamo: Grid2Jamo, vertex?: Grid2GridPoint): Grid2Project {
  const next = cloneGrid2Project(project)
  next.glyphs[jamo].curves = vertex
    ? next.glyphs[jamo].curves.filter((curve) => !sameGridPoint(curve.vertex, vertex))
    : []
  return next
}

export function setGrid2DiagonalEdge(project: Grid2Project, jamo: Grid2Jamo, edge: Grid2DiagonalEdge): Grid2Project {
  const next = cloneGrid2Project(project)
  const candidate = getGrid2DiagonalEdgeCandidates(next, jamo)
    .find((value) => sameGridPoint(value.vertex, edge.vertex))
  if (!candidate) return next
  const fromIsIncoming = candidate.incomingOptions.some((point) => sameGridPoint(point, edge.from))
  const toIsOutgoing = candidate.outgoingOptions.some((point) => sameGridPoint(point, edge.to))
  const fromIsOutgoing = candidate.outgoingOptions.some((point) => sameGridPoint(point, edge.from))
  const toIsIncoming = candidate.incomingOptions.some((point) => sameGridPoint(point, edge.to))
  if ((!fromIsIncoming || !toIsOutgoing) && (!fromIsOutgoing || !toIsIncoming)) return next
  next.glyphs[jamo].diagonalEdges = next.glyphs[jamo].diagonalEdges
    .filter((value) => !sameGridPoint(value.vertex, edge.vertex))
  next.glyphs[jamo].diagonalEdges.push({ vertex: { ...edge.vertex }, from: { ...edge.from }, to: { ...edge.to } })
  next.glyphs[jamo].curves = next.glyphs[jamo].curves.filter((curve) => !sameGridPoint(curve.vertex, edge.vertex))
  next.glyphs[jamo].cut = null
  next.glyphs[jamo].localCuts = []
  return next
}

export function toggleGrid2Cut(project: Grid2Project, jamo: Grid2Jamo, corner: Grid2CutCorner): Grid2Project {
  const next = cloneGrid2Project(project)
  const cuts = next.glyphs[jamo].cuts
  next.glyphs[jamo].cuts = cuts.includes(corner) ? cuts.filter((value) => value !== corner) : [...cuts, corner]
  return next
}

function pointKey(point: Grid2Point): string { return `${point.x},${point.y}` }
function edgeKey(from: Grid2Point, to: Grid2Point): string { return `${pointKey(from)}>${pointKey(to)}` }
function samePoint(a: Grid2Point, b: Grid2Point): boolean { return a.x === b.x && a.y === b.y }

function simplifyContour(points: Grid2Point[]): Grid2Point[] {
  if (points.length < 3) return points
  return points.filter((point, index) => {
    const previous = points[(index - 1 + points.length) % points.length]
    const next = points[(index + 1) % points.length]
    return (point.x - previous.x) * (next.y - point.y) !== (point.y - previous.y) * (next.x - point.x)
  })
}

export function getGrid2Contours(project: Grid2Project, jamo: Grid2Jamo): Grid2Point[][] {
  const boundary = new Map<string, { from: Grid2Point; to: Grid2Point }>()
  const cells = project.glyphs[jamo].cells
  const addEdge = (from: Grid2Point, to: Grid2Point) => {
    const reverse = edgeKey(to, from)
    if (boundary.has(reverse)) boundary.delete(reverse)
    else boundary.set(edgeKey(from, to), { from, to })
  }
  cells.forEach((row, rowIndex) => row.forEach((filled, columnIndex) => {
    if (!filled) return
    const x0 = project.xRails[columnIndex]
    const x1 = project.xRails[columnIndex + 1]
    const y0 = project.yRails[rowIndex]
    const y1 = project.yRails[rowIndex + 1]
    addEdge({ x: x0, y: y0 }, { x: x1, y: y0 })
    addEdge({ x: x1, y: y0 }, { x: x1, y: y1 })
    addEdge({ x: x1, y: y1 }, { x: x0, y: y1 })
    addEdge({ x: x0, y: y1 }, { x: x0, y: y0 })
  }))

  const remaining = [...boundary.values()]
  const contours: Grid2Point[][] = []
  while (remaining.length > 0) {
    const first = remaining.pop()!
    const contour = [first.from, first.to]
    let current = first.to
    while (!samePoint(current, contour[0])) {
      const nextIndex = remaining.findIndex((edge) => samePoint(edge.from, current))
      if (nextIndex < 0) break
      const [next] = remaining.splice(nextIndex, 1)
      current = next.to
      if (!samePoint(current, contour[0])) contour.push(current)
    }
    if (contour.length >= 3) contours.push(simplifyContour(contour))
  }
  return contours
}

function format(value: number): string { return Number(value.toFixed(2)).toString() }
function pathPoint(point: Grid2Point): string { return `${format(point.x)} ${format(point.y)}` }

function pointToGridPoint(project: Grid2Project, point: Grid2Point): Grid2GridPoint | null {
  const xIndex = project.xRails.indexOf(point.x)
  const yIndex = project.yRails.indexOf(point.y)
  return xIndex >= 0 && yIndex >= 0 ? { xIndex, yIndex } : null
}

function gridPointToPoint(project: Grid2Project, point: Grid2GridPoint): Grid2Point {
  return { x: project.xRails[point.xIndex], y: project.yRails[point.yIndex] }
}

function pointsAlongSegment(from: Grid2GridPoint, to: Grid2GridPoint): Grid2GridPoint[] {
  const points: Grid2GridPoint[] = []
  const xStep = Math.sign(to.xIndex - from.xIndex)
  const yStep = Math.sign(to.yIndex - from.yIndex)
  const steps = Math.max(Math.abs(to.xIndex - from.xIndex), Math.abs(to.yIndex - from.yIndex))
  for (let step = 1; step <= steps; step += 1) points.push({
    xIndex: from.xIndex + xStep * step,
    yIndex: from.yIndex + yStep * step,
  })
  return points
}

export function getGrid2CurveCornerCandidates(project: Grid2Project, jamo: Grid2Jamo): Grid2CurveCornerCandidate[] {
  return getGrid2Contours(project, jamo).flatMap((contour) => contour.flatMap((point, index) => {
    const vertex = pointToGridPoint(project, point)
    const previous = pointToGridPoint(project, contour[(index - 1 + contour.length) % contour.length])
    const next = pointToGridPoint(project, contour[(index + 1) % contour.length])
    if (!vertex || !previous || !next) return []
    return [{
      vertex,
      previous,
      next,
      incomingOptions: pointsAlongSegment(vertex, previous),
      outgoingOptions: pointsAlongSegment(vertex, next),
    }]
  }))
}

export function getGrid2DiagonalEdgeCandidates(project: Grid2Project, jamo: Grid2Jamo): Grid2CurveCornerCandidate[] {
  const cells = project.glyphs[jamo].cells
  return getGrid2CurveCornerCandidates(project, jamo).filter(({ vertex }) => {
    const adjacent = [
      cells[vertex.yIndex - 1]?.[vertex.xIndex - 1],
      cells[vertex.yIndex - 1]?.[vertex.xIndex],
      cells[vertex.yIndex]?.[vertex.xIndex - 1],
      cells[vertex.yIndex]?.[vertex.xIndex],
    ]
    return adjacent.filter(Boolean).length === 1
  })
}

export function getGrid2CutPointCandidates(project: Grid2Project, jamo: Grid2Jamo): Grid2GridPoint[] {
  const candidates = new Map<string, Grid2GridPoint>()
  getGrid2Contours(project, jamo).forEach((contour) => contour.forEach((point, index) => {
    const from = pointToGridPoint(project, point)
    const to = pointToGridPoint(project, contour[(index + 1) % contour.length])
    if (!from || !to) return
    ;[from, ...pointsAlongSegment(from, to)].forEach((candidate) => {
      candidates.set(`${candidate.xIndex}-${candidate.yIndex}`, candidate)
    })
  }))
  return [...candidates.values()]
}

function contourToPath(project: Grid2Project, points: Grid2Point[], curves: Grid2LocalCurve[], diagonalEdges: Grid2DiagonalEdge[]): string {
  if (points.length < 3) return ''
  const inside = [...points]
  const out = [...points]
  const rounded = new Set<number>()
  const diagonal = new Set<number>()
  points.forEach((point, index) => {
    const vertex = pointToGridPoint(project, point)
    if (!vertex) return
    const previous = pointToGridPoint(project, points[(index - 1 + points.length) % points.length])
    const next = pointToGridPoint(project, points[(index + 1) % points.length])
    if (!previous || !next) return
    const previousOptions = pointsAlongSegment(vertex, previous)
    const nextOptions = pointsAlongSegment(vertex, next)
    const edge = diagonalEdges.find((value) => sameGridPoint(value.vertex, vertex))
    if (edge) {
      const fromOnPrevious = previousOptions.some((value) => sameGridPoint(value, edge.from))
      const toOnNext = nextOptions.some((value) => sameGridPoint(value, edge.to))
      const fromOnNext = nextOptions.some((value) => sameGridPoint(value, edge.from))
      const toOnPrevious = previousOptions.some((value) => sameGridPoint(value, edge.to))
      if (fromOnPrevious && toOnNext) {
        inside[index] = gridPointToPoint(project, edge.from)
        out[index] = gridPointToPoint(project, edge.to)
        diagonal.add(index)
        return
      }
      if (fromOnNext && toOnPrevious) {
        inside[index] = gridPointToPoint(project, edge.to)
        out[index] = gridPointToPoint(project, edge.from)
        diagonal.add(index)
        return
      }
    }
    const curve = curves.find((value) => sameGridPoint(value.vertex, vertex))
    if (!curve) return
    const incomingOnPrevious = previousOptions.some((value) => sameGridPoint(value, curve.incoming))
    const outgoingOnNext = nextOptions.some((value) => sameGridPoint(value, curve.outgoing))
    const incomingOnNext = nextOptions.some((value) => sameGridPoint(value, curve.incoming))
    const outgoingOnPrevious = previousOptions.some((value) => sameGridPoint(value, curve.outgoing))
    if (incomingOnPrevious && outgoingOnNext) {
      inside[index] = gridPointToPoint(project, curve.incoming)
      out[index] = gridPointToPoint(project, curve.outgoing)
      rounded.add(index)
    } else if (incomingOnNext && outgoingOnPrevious) {
      inside[index] = gridPointToPoint(project, curve.outgoing)
      out[index] = gridPointToPoint(project, curve.incoming)
      rounded.add(index)
    }
  })
  let path = `M ${pathPoint(out[0])}`
  for (let index = 1; index < points.length; index += 1) {
    path += ` L ${pathPoint(inside[index])}`
    if (rounded.has(index)) path += ` Q ${pathPoint(points[index])} ${pathPoint(out[index])}`
    else if (diagonal.has(index)) path += ` L ${pathPoint(out[index])}`
  }
  path += ` L ${pathPoint(inside[0])}`
  if (rounded.has(0)) path += ` Q ${pathPoint(points[0])} ${pathPoint(out[0])}`
  else if (diagonal.has(0)) path += ` L ${pathPoint(out[0])}`
  return `${path} Z`
}

export function getGrid2ShapePath(project: Grid2Project, jamo: Grid2Jamo): string {
  return getGrid2Contours(project, jamo)
    .map((contour) => contourToPath(project, contour, project.glyphs[jamo].curves, project.glyphs[jamo].diagonalEdges))
    .join(' ')
}

export function getGrid2OccupiedBounds(project: Grid2Project, jamo: Grid2Jamo): Grid2Bounds | null {
  const cells = project.glyphs[jamo].cells
  const occupied: Array<{ row: number; column: number }> = []
  cells.forEach((row, rowIndex) => row.forEach((filled, columnIndex) => { if (filled) occupied.push({ row: rowIndex, column: columnIndex }) }))
  if (occupied.length === 0) return null
  return {
    x0: Math.min(...occupied.map(({ column }) => project.xRails[column])),
    y0: Math.min(...occupied.map(({ row }) => project.yRails[row])),
    x1: Math.max(...occupied.map(({ column }) => project.xRails[column + 1])),
    y1: Math.max(...occupied.map(({ row }) => project.yRails[row + 1])),
  }
}

export function getGrid2ClipPolygon(project: Grid2Project, jamo: Grid2Jamo): string {
  const cut = project.glyphs[jamo].cut
  if (!cut) return '0,0 1000,0 1000,1000 0,1000'
  const { from, to } = getGrid2CutGuideCoordinates(project, cut.guide)
  const signedDistance = (point: Grid2Point) => (to.x - from.x) * (point.y - from.y) - (to.y - from.y) * (point.x - from.x)
  const midpoint = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }
  const removedReference = { x: midpoint.x, y: midpoint.y + (cut.side === 'above' ? -100 : 100) }
  const removedSign = Math.sign(signedDistance(removedReference)) || 1
  const source: Grid2Point[] = [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 1000 }, { x: 0, y: 1000 }]
  const points: Grid2Point[] = []
  source.forEach((current, index) => {
    const previous = source[(index - 1 + source.length) % source.length]
    const previousDistance = signedDistance(previous)
    const currentDistance = signedDistance(current)
    const previousInside = previousDistance * removedSign <= 0.0001
    const currentInside = currentDistance * removedSign <= 0.0001
    if (previousInside !== currentInside) {
      const amount = previousDistance / (previousDistance - currentDistance)
      points.push({
        x: previous.x + (current.x - previous.x) * amount,
        y: previous.y + (current.y - previous.y) * amount,
      })
    }
    if (currentInside) points.push(current)
  })
  return points.map((point) => `${format(point.x)},${format(point.y)}`).join(' ')
}

export function getGrid2LocalCutRemovalPolygon(project: Grid2Project, cut: Grid2LocalCut): string {
  const { from, to } = getGrid2CutGuideCoordinates(project, cut.guide)
  const anchor = { x: project.xRails[cut.anchor.xIndex], y: project.yRails[cut.anchor.yIndex] }
  const direction = { x: to.x - from.x, y: to.y - from.y }
  const signedDistance = (point: Grid2Point) => direction.x * (point.y - anchor.y) - direction.y * (point.x - anchor.x)
  const reference = { x: anchor.x, y: anchor.y + (cut.side === 'above' ? -100 : 100) }
  const removedSign = Math.sign(signedDistance(reference)) || 1
  const x0 = project.xRails[cut.target.column]
  const x1 = project.xRails[cut.target.column + 1]
  const y0 = project.yRails[cut.target.row]
  const y1 = project.yRails[cut.target.row + 1]
  const source: Grid2Point[] = [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]
  const points: Grid2Point[] = []
  source.forEach((current, index) => {
    const previous = source[(index - 1 + source.length) % source.length]
    const previousDistance = signedDistance(previous) * removedSign
    const currentDistance = signedDistance(current) * removedSign
    const previousInside = previousDistance >= -0.0001
    const currentInside = currentDistance >= -0.0001
    if (previousInside !== currentInside) {
      const amount = previousDistance / (previousDistance - currentDistance)
      points.push({ x: previous.x + (current.x - previous.x) * amount, y: previous.y + (current.y - previous.y) * amount })
    }
    if (currentInside) points.push(current)
  })
  return points.map((point) => `${format(point.x)},${format(point.y)}`).join(' ')
}
