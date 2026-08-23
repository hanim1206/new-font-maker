import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { ArrowLeft, Circle, Grid3X3, PaintBucket, Plus, Redo2, RotateCcw, Slash, Trash2, Undo2 } from 'lucide-react'
import {
  GRID2_JAMOS,
  addGrid2Rail,
  cloneGrid2Project,
  createDefaultGrid2Project,
  getGrid2ClipPolygon,
  getGrid2CellPaintValue,
  getGrid2LocalCutRemovalPolygon,
  getGrid2CurveCornerCandidates,
  getGrid2DiagonalEdgeCandidates,
  getGrid2RailInsertGap,
  getGrid2ShapePath,
  moveGrid2Rail,
  parseGrid2Project,
  paintGrid2Cell,
  removeGrid2Rail,
  setGrid2DiagonalEdge,
  setGrid2LocalCurve,
  setGrid2SnapUnit,
  removeGrid2LocalCurve,
  toggleGrid2Cell,
  type Grid2Axis,
  type Grid2DiagonalEdge,
  type Grid2Jamo,
  type Grid2GridPoint,
  type Grid2Project,
  type Grid2Tool,
} from './gridSystem2EditorModel'
import styles from './GridSystem2LabPage.module.css'

interface SelectedRail { axis: Grid2Axis; index: number }
interface CurveDraft { vertex: Grid2GridPoint; incoming: Grid2GridPoint; outgoing: Grid2GridPoint }
interface DiagonalDraft { vertex: Grid2GridPoint; from: Grid2GridPoint; to: Grid2GridPoint }

const STORAGE_KEY = 'font-maker-grid-system-2-lab-v1'
const TOOL_OPTIONS: Array<{ tool: Grid2Tool; label: string; icon: typeof Grid3X3 }> = [
  { tool: 'rails', label: '레일', icon: Grid3X3 },
  { tool: 'fill', label: '채우기', icon: PaintBucket },
  { tool: 'curve', label: '곡률', icon: Circle },
  { tool: 'diagonal', label: '사선', icon: Slash },
]
function loadProject(): Grid2Project {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return createDefaultGrid2Project()
    return parseGrid2Project(JSON.parse(raw)) ?? createDefaultGrid2Project()
  } catch {
    return createDefaultGrid2Project()
  }
}

function Grid2Glyph({ project, jamo, tool, interactive, selectedRail, curveDraft, diagonalDraft, onCellToggle, onCellPaintStart, onCellPaintMove, onCellPaintEnd, onCurveCornerClick, onCurveExtentPreview, onCurveExtentCommit, onCurveCancel, onDiagonalCornerClick, onDiagonalExtentPreview, onDiagonalExtentCommit, onDiagonalCancel, onRailStart, onRailMove, onRailEnd, onRailNudge }: {
  project: Grid2Project
  jamo: Grid2Jamo
  tool?: Grid2Tool
  interactive?: boolean
  selectedRail?: SelectedRail | null
  curveDraft?: CurveDraft | null
  diagonalDraft?: DiagonalDraft | null
  onCellToggle?: (row: number, column: number) => void
  onCellPaintStart?: (event: ReactPointerEvent<SVGRectElement>, row: number, column: number) => void
  onCellPaintMove?: (event: ReactPointerEvent<SVGRectElement>) => void
  onCellPaintEnd?: (event: ReactPointerEvent<SVGRectElement>) => void
  onCurveCornerClick?: (point: Grid2GridPoint) => void
  onCurveExtentPreview?: (incoming: Grid2GridPoint, outgoing: Grid2GridPoint) => void
  onCurveExtentCommit?: (incoming: Grid2GridPoint, outgoing: Grid2GridPoint) => void
  onCurveCancel?: () => void
  onDiagonalCornerClick?: (point: Grid2GridPoint) => void
  onDiagonalExtentPreview?: (from: Grid2GridPoint, to: Grid2GridPoint) => void
  onDiagonalExtentCommit?: (from: Grid2GridPoint, to: Grid2GridPoint) => void
  onDiagonalCancel?: () => void
  onRailStart?: (event: ReactPointerEvent<SVGLineElement>, axis: Grid2Axis, index: number) => void
  onRailMove?: (event: ReactPointerEvent<SVGLineElement>) => void
  onRailEnd?: (event: ReactPointerEvent<SVGLineElement>) => void
  onRailNudge?: (axis: Grid2Axis, index: number, delta: number) => void
}) {
  const rawId = useId()
  const diagonalCornerGesture = useRef<{ pointerId: number; startX: number; startY: number; moved: boolean } | null>(null)
  const clipId = `grid2-clip-${rawId.replaceAll(':', '')}`
  const maskId = `grid2-mask-${rawId.replaceAll(':', '')}`
  const path = getGrid2ShapePath(project, jamo)
  const curveCandidates = interactive && tool === 'curve' ? getGrid2CurveCornerCandidates(project, jamo) : []
  const activeCurveCandidate = curveDraft
    ? curveCandidates.find((candidate) => candidate.vertex.xIndex === curveDraft.vertex.xIndex && candidate.vertex.yIndex === curveDraft.vertex.yIndex)
    : undefined
  const diagonalCandidates = interactive && tool === 'diagonal' ? getGrid2DiagonalEdgeCandidates(project, jamo) : []
  const activeDiagonalCandidate = diagonalDraft
    ? diagonalCandidates.find((candidate) => candidate.vertex.xIndex === diagonalDraft.vertex.xIndex && candidate.vertex.yIndex === diagonalDraft.vertex.yIndex)
    : undefined
  const pointPosition = (point: Grid2GridPoint) => ({ x: project.xRails[point.xIndex], y: project.yRails[point.yIndex] })
  const curvePreviewPath = (vertexPoint: Grid2GridPoint, incomingPoint: Grid2GridPoint, outgoingPoint: Grid2GridPoint) => {
    const vertex = pointPosition(vertexPoint)
    const incoming = pointPosition(incomingPoint)
    const outgoing = pointPosition(outgoingPoint)
    return {
      area: `M ${incoming.x} ${incoming.y} L ${vertex.x} ${vertex.y} L ${outgoing.x} ${outgoing.y} Q ${vertex.x} ${vertex.y} ${incoming.x} ${incoming.y} Z`,
      arc: `M ${incoming.x} ${incoming.y} Q ${vertex.x} ${vertex.y} ${outgoing.x} ${outgoing.y}`,
    }
  }
  return <svg viewBox="0 0 1000 1000" role={interactive ? 'application' : 'img'} aria-label={`${jamo} 형태 그리드`}>
    <defs>
      <clipPath id={clipId}><polygon points={getGrid2ClipPolygon(project, jamo)} /></clipPath>
      <mask id={maskId} maskUnits="userSpaceOnUse"><rect x="0" y="0" width="1000" height="1000" fill="white" />
        {project.glyphs[jamo].localCuts.map((cut, index) => <polygon key={index} points={getGrid2LocalCutRemovalPolygon(project, cut)} fill="black" />)}
      </mask>
    </defs>
    <rect className={styles.designBody} x="75" y="75" width="850" height="850" rx="8" />
    {project.xRails.map((value, index) => <line key={`x-${index}`} className={styles.gridLine} x1={value} y1={project.yRails[0]} x2={value} y2={project.yRails.at(-1)} />)}
    {project.yRails.map((value, index) => <line key={`y-${index}`} className={styles.gridLine} x1={project.xRails[0]} y1={value} x2={project.xRails.at(-1)} y2={value} />)}
    <path className={styles.glyphShape} d={path} fillRule="evenodd" clipPath={`url(#${clipId})`} mask={`url(#${maskId})`} data-grid2-shape={jamo} />
    {interactive && tool === 'fill' && project.glyphs[jamo].cells.map((row, rowIndex) => row.map((filled, columnIndex) => <rect
      key={`${rowIndex}-${columnIndex}`}
      className={styles.cellHit}
      x={project.xRails[columnIndex]}
      y={project.yRails[rowIndex]}
      width={project.xRails[columnIndex + 1] - project.xRails[columnIndex]}
      height={project.yRails[rowIndex + 1] - project.yRails[rowIndex]}
      data-filled={filled}
      data-grid2-cell={`${rowIndex}-${columnIndex}`}
      aria-label={`${rowIndex + 1}행 ${columnIndex + 1}열 ${filled ? '비우기' : '채우기'}`}
      role="button"
      tabIndex={0}
      onPointerDown={(event) => onCellPaintStart?.(event, rowIndex, columnIndex)}
      onPointerMove={onCellPaintMove}
      onPointerUp={onCellPaintEnd}
      onPointerCancel={onCellPaintEnd}
      onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onCellToggle?.(rowIndex, columnIndex) } }}
    />))}
    {interactive && tool === 'rails' && <>
      {project.xRails.slice(1, -1).map((value, offset) => <line key={`x-handle-${offset}`} className={styles.railHit} x1={value} y1={project.yRails[0]} x2={value} y2={project.yRails.at(-1)}
        role="slider" tabIndex={0} aria-label={`세로 레일 ${offset + 1}`} aria-valuemin={project.xRails[offset] + 50} aria-valuemax={project.xRails[offset + 2] - 50} aria-valuenow={value}
        data-axis="x" data-selected={selectedRail?.axis === 'x' && selectedRail.index === offset + 1}
        onPointerDown={(event) => onRailStart?.(event, 'x', offset + 1)} onPointerMove={onRailMove} onPointerUp={onRailEnd} onPointerCancel={onRailEnd}
        onKeyDown={(event) => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); onRailNudge?.('x', offset + 1, event.key === 'ArrowRight' ? project.snapUnit : -project.snapUnit) } }} />)}
      {project.yRails.slice(1, -1).map((value, offset) => <line key={`y-handle-${offset}`} className={styles.railHit} x1={project.xRails[0]} y1={value} x2={project.xRails.at(-1)} y2={value}
        role="slider" tabIndex={0} aria-label={`가로 레일 ${offset + 1}`} aria-valuemin={project.yRails[offset] + 50} aria-valuemax={project.yRails[offset + 2] - 50} aria-valuenow={value}
        data-axis="y" data-selected={selectedRail?.axis === 'y' && selectedRail.index === offset + 1}
        onPointerDown={(event) => onRailStart?.(event, 'y', offset + 1)} onPointerMove={onRailMove} onPointerUp={onRailEnd} onPointerCancel={onRailEnd}
        onKeyDown={(event) => { if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { event.preventDefault(); onRailNudge?.('y', offset + 1, event.key === 'ArrowDown' ? project.snapUnit : -project.snapUnit) } }} />)}
    </>}
    {interactive && tool === 'curve' && !activeCurveCandidate && curveCandidates.map((candidate) => {
      const position = pointPosition(candidate.vertex)
      const applied = project.glyphs[jamo].curves.some((curve) => curve.vertex.xIndex === candidate.vertex.xIndex && curve.vertex.yIndex === candidate.vertex.yIndex)
      const preview = curvePreviewPath(candidate.vertex, candidate.incomingOptions[0], candidate.outgoingOptions[0])
      return <g key={`corner-${candidate.vertex.xIndex}-${candidate.vertex.yIndex}`} className={styles.curveCandidateGroup}>
        <path className={styles.curveAreaPreview} d={preview.area} data-grid2-curve-area-preview="candidate" />
        <path className={styles.curveArcPreview} d={preview.arc} />
        <circle className={styles.curveGridPoint} cx={position.x} cy={position.y} r="22" role="button" tabIndex={0} data-active={applied}
          aria-label={`곡률 모서리 ${candidate.vertex.xIndex + 1}-${candidate.vertex.yIndex + 1}`}
          onClick={() => onCurveCornerClick?.(candidate.vertex)}
          onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onCurveCornerClick?.(candidate.vertex) } }} />
      </g>
    })}
    {interactive && tool === 'curve' && activeCurveCandidate && (() => {
      const incoming = curveDraft?.incoming ?? activeCurveCandidate.incomingOptions[0]
      const outgoing = curveDraft?.outgoing ?? activeCurveCandidate.outgoingOptions[0]
      const preview = curvePreviewPath(activeCurveCandidate.vertex, incoming, outgoing)
      const pairs = activeCurveCandidate.incomingOptions.flatMap((incomingPoint) => activeCurveCandidate.outgoingOptions.map((outgoingPoint) => {
        const vertex = activeCurveCandidate.vertex
        const control = {
          xIndex: incomingPoint.xIndex !== vertex.xIndex ? incomingPoint.xIndex : outgoingPoint.xIndex,
          yIndex: incomingPoint.yIndex !== vertex.yIndex ? incomingPoint.yIndex : outgoingPoint.yIndex,
        }
        return { incoming: incomingPoint, outgoing: outgoingPoint, position: pointPosition(control) }
      }))
      const currentPair = pairs.find((pair) => pair.incoming.xIndex === incoming.xIndex && pair.incoming.yIndex === incoming.yIndex
        && pair.outgoing.xIndex === outgoing.xIndex && pair.outgoing.yIndex === outgoing.yIndex) ?? pairs[0]
      if (!currentPair) return null
      const vertexPosition = pointPosition(activeCurveCandidate.vertex)
      const xValues = [vertexPosition.x, ...pairs.map((pair) => pair.position.x)]
      const yValues = [vertexPosition.y, ...pairs.map((pair) => pair.position.y)]
      const plane = {
        x: Math.min(...xValues),
        y: Math.min(...yValues),
        width: Math.max(...xValues) - Math.min(...xValues),
        height: Math.max(...yValues) - Math.min(...yValues),
      }
      const nearestPair = (event: ReactPointerEvent<SVGRectElement>) => {
        const rect = event.currentTarget.ownerSVGElement?.getBoundingClientRect()
        if (!rect) return currentPair
        const pointer = { x: (event.clientX - rect.left) / rect.width * 1000, y: (event.clientY - rect.top) / rect.height * 1000 }
        return pairs.reduce((nearest, pair) => {
          const distance = (pair.position.x - pointer.x) ** 2 + (pair.position.y - pointer.y) ** 2
          const nearestDistance = (nearest.position.x - pointer.x) ** 2 + (nearest.position.y - pointer.y) ** 2
          return distance < nearestDistance ? pair : nearest
        }, currentPair)
      }
      const handleKeyboard = (event: ReactKeyboardEvent<SVGCircleElement>) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onCurveExtentCommit?.(currentPair.incoming, currentPair.outgoing)
          return
        }
        if (event.key === 'Escape') {
          event.preventDefault()
          onCurveCancel?.()
          return
        }
        const direction: [number, number] | null = event.key === 'ArrowLeft' ? [-1, 0]
          : event.key === 'ArrowRight' ? [1, 0]
            : event.key === 'ArrowUp' ? [0, -1]
              : event.key === 'ArrowDown' ? [0, 1] : null
        if (!direction) return
        event.preventDefault()
        const nextPair = pairs.filter((pair) => {
          const dx = pair.position.x - currentPair.position.x
          const dy = pair.position.y - currentPair.position.y
          return direction[0] !== 0 ? dy === 0 && Math.sign(dx) === direction[0] : dx === 0 && Math.sign(dy) === direction[1]
        }).sort((a, b) => Math.hypot(a.position.x - currentPair.position.x, a.position.y - currentPair.position.y)
          - Math.hypot(b.position.x - currentPair.position.x, b.position.y - currentPair.position.y))[0]
        if (nextPair) onCurveExtentPreview?.(nextPair.incoming, nextPair.outgoing)
      }
      return <g className={styles.curveSelectionPreview} data-grid2-curve-preview="active">
        <path className={styles.curveAreaPreview} d={preview.area} data-grid2-curve-area-preview="selected" />
        <path className={styles.curveArcPreview} d={preview.arc} />
        <line className={styles.curveExtentProjection} x1={currentPair.position.x} y1={currentPair.position.y} x2={pointPosition(incoming).x} y2={pointPosition(incoming).y} />
        <line className={styles.curveExtentProjection} x1={currentPair.position.x} y1={currentPair.position.y} x2={pointPosition(outgoing).x} y2={pointPosition(outgoing).y} />
        <rect className={styles.curveExtentPlane} {...plane} data-grid2-curve-plane="active"
          onPointerEnter={(event) => { const pair = nearestPair(event); onCurveExtentPreview?.(pair.incoming, pair.outgoing) }}
          onPointerMove={(event) => { const pair = nearestPair(event); onCurveExtentPreview?.(pair.incoming, pair.outgoing) }}
          onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); const pair = nearestPair(event); onCurveExtentPreview?.(pair.incoming, pair.outgoing) }}
          onPointerUp={(event) => { const pair = nearestPair(event); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); onCurveExtentCommit?.(pair.incoming, pair.outgoing) }}
          onPointerCancel={(event) => { const pair = nearestPair(event); onCurveExtentCommit?.(pair.incoming, pair.outgoing) }} />
        <circle className={styles.curveExtentHandle} cx={currentPair.position.x} cy={currentPair.position.y} r="19" data-grid2-curve-handle="active" />
        <circle className={styles.curveExtentKeyboardTarget} cx={currentPair.position.x} cy={currentPair.position.y} r="30" role="button" tabIndex={0}
          aria-label="곡률 범위 핸들" onKeyDown={handleKeyboard} />
      </g>
    })()}
    {interactive && tool === 'diagonal' && diagonalCandidates.map((candidate) => {
      const position = pointPosition(candidate.vertex)
      const from = pointPosition(candidate.incomingOptions[0])
      const to = pointPosition(candidate.outgoingOptions[0])
      const pairs = candidate.incomingOptions.flatMap((fromPoint) => candidate.outgoingOptions.map((toPoint) => {
        const control = {
          xIndex: fromPoint.xIndex !== candidate.vertex.xIndex ? fromPoint.xIndex : toPoint.xIndex,
          yIndex: fromPoint.yIndex !== candidate.vertex.yIndex ? fromPoint.yIndex : toPoint.yIndex,
        }
        return { from: fromPoint, to: toPoint, position: pointPosition(control) }
      }))
      const nearestPair = (event: ReactPointerEvent<SVGCircleElement>) => {
        const rect = event.currentTarget.ownerSVGElement?.getBoundingClientRect()
        const fallback = pairs[0]
        if (!rect || !fallback) return fallback
        const pointer = { x: (event.clientX - rect.left) / rect.width * 1000, y: (event.clientY - rect.top) / rect.height * 1000 }
        return pairs.reduce((nearest, pair) => {
          const distance = (pair.position.x - pointer.x) ** 2 + (pair.position.y - pointer.y) ** 2
          const nearestDistance = (nearest.position.x - pointer.x) ** 2 + (nearest.position.y - pointer.y) ** 2
          return distance < nearestDistance ? pair : nearest
        }, fallback)
      }
      const selected = activeDiagonalCandidate?.vertex.xIndex === candidate.vertex.xIndex
        && activeDiagonalCandidate.vertex.yIndex === candidate.vertex.yIndex
      const applied = project.glyphs[jamo].diagonalEdges.some((edge) => edge.vertex.xIndex === candidate.vertex.xIndex && edge.vertex.yIndex === candidate.vertex.yIndex)
      return <g key={`diagonal-${candidate.vertex.xIndex}-${candidate.vertex.yIndex}`} className={styles.diagonalCandidateGroup}
        data-selected={selected} data-muted={Boolean(activeDiagonalCandidate && !selected)}>
        <path className={styles.diagonalAreaPreview} d={`M ${from.x} ${from.y} L ${position.x} ${position.y} L ${to.x} ${to.y} Z`} data-grid2-diagonal-area-preview="candidate" />
        <line className={styles.diagonalLinePreview} x1={from.x} y1={from.y} x2={to.x} y2={to.y} />
        <circle className={styles.diagonalGridPoint} cx={position.x} cy={position.y} r="22" role="button" tabIndex={0} data-active={applied}
          aria-label={`사선 모서리 ${candidate.vertex.xIndex + 1}-${candidate.vertex.yIndex + 1}`}
          onPointerDown={(event) => {
            event.preventDefault()
            event.currentTarget.setPointerCapture(event.pointerId)
            diagonalCornerGesture.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, moved: false }
            onDiagonalCornerClick?.(candidate.vertex)
          }}
          onPointerMove={(event) => {
            const gesture = diagonalCornerGesture.current
            if (!gesture || gesture.pointerId !== event.pointerId) return
            if (!gesture.moved && Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) >= 8) gesture.moved = true
            if (!gesture.moved) return
            const pair = nearestPair(event)
            if (pair) onDiagonalExtentPreview?.(pair.from, pair.to)
          }}
          onPointerUp={(event) => {
            const gesture = diagonalCornerGesture.current
            if (!gesture || gesture.pointerId !== event.pointerId) return
            if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
            diagonalCornerGesture.current = null
            if (!gesture.moved) return
            const pair = nearestPair(event)
            if (pair) onDiagonalExtentCommit?.(pair.from, pair.to)
          }}
          onPointerCancel={(event) => {
            if (diagonalCornerGesture.current?.pointerId !== event.pointerId) return
            diagonalCornerGesture.current = null
            onDiagonalCancel?.()
          }}
          onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onDiagonalCornerClick?.(candidate.vertex) } }} />
      </g>
    })}
    {interactive && tool === 'diagonal' && activeDiagonalCandidate && (() => {
      const from = diagonalDraft?.from ?? activeDiagonalCandidate.incomingOptions[0]
      const to = diagonalDraft?.to ?? activeDiagonalCandidate.outgoingOptions[0]
      const pairs = activeDiagonalCandidate.incomingOptions.flatMap((fromPoint) => activeDiagonalCandidate.outgoingOptions.map((toPoint) => {
        const vertex = activeDiagonalCandidate.vertex
        const control = {
          xIndex: fromPoint.xIndex !== vertex.xIndex ? fromPoint.xIndex : toPoint.xIndex,
          yIndex: fromPoint.yIndex !== vertex.yIndex ? fromPoint.yIndex : toPoint.yIndex,
        }
        return { from: fromPoint, to: toPoint, position: pointPosition(control) }
      }))
      const currentPair = pairs.find((pair) => pair.from.xIndex === from.xIndex && pair.from.yIndex === from.yIndex
        && pair.to.xIndex === to.xIndex && pair.to.yIndex === to.yIndex) ?? pairs[0]
      if (!currentPair) return null
      const vertexPosition = pointPosition(activeDiagonalCandidate.vertex)
      const fromPosition = pointPosition(currentPair.from)
      const toPosition = pointPosition(currentPair.to)
      const xValues = [vertexPosition.x, ...pairs.map((pair) => pair.position.x)]
      const yValues = [vertexPosition.y, ...pairs.map((pair) => pair.position.y)]
      const plane = { x: Math.min(...xValues), y: Math.min(...yValues), width: Math.max(...xValues) - Math.min(...xValues), height: Math.max(...yValues) - Math.min(...yValues) }
      const nearestPair = (event: ReactPointerEvent<SVGRectElement>) => {
        const rect = event.currentTarget.ownerSVGElement?.getBoundingClientRect()
        if (!rect) return currentPair
        const pointer = { x: (event.clientX - rect.left) / rect.width * 1000, y: (event.clientY - rect.top) / rect.height * 1000 }
        return pairs.reduce((nearest, pair) => {
          const distance = (pair.position.x - pointer.x) ** 2 + (pair.position.y - pointer.y) ** 2
          const nearestDistance = (nearest.position.x - pointer.x) ** 2 + (nearest.position.y - pointer.y) ** 2
          return distance < nearestDistance ? pair : nearest
        }, currentPair)
      }
      return <g className={styles.diagonalSelectionPreview} data-grid2-diagonal-preview="active">
        <path className={styles.diagonalAreaPreview} d={`M ${fromPosition.x} ${fromPosition.y} L ${vertexPosition.x} ${vertexPosition.y} L ${toPosition.x} ${toPosition.y} Z`} data-grid2-diagonal-area-preview="selected" />
        <line className={styles.diagonalLinePreview} x1={fromPosition.x} y1={fromPosition.y} x2={toPosition.x} y2={toPosition.y} />
        <rect className={styles.diagonalExtentPlane} {...plane} data-grid2-diagonal-plane="active"
          onPointerEnter={(event) => { const pair = nearestPair(event); onDiagonalExtentPreview?.(pair.from, pair.to) }}
          onPointerMove={(event) => { const pair = nearestPair(event); onDiagonalExtentPreview?.(pair.from, pair.to) }}
          onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); const pair = nearestPair(event); onDiagonalExtentPreview?.(pair.from, pair.to) }}
          onPointerUp={(event) => { const pair = nearestPair(event); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); onDiagonalExtentCommit?.(pair.from, pair.to) }} />
        <circle className={styles.diagonalExtentHandle} cx={currentPair.position.x} cy={currentPair.position.y} r="19" data-grid2-diagonal-handle="active" />
        <circle className={styles.diagonalExtentKeyboardTarget} cx={currentPair.position.x} cy={currentPair.position.y} r="30" role="button" tabIndex={0}
          aria-label="사선 범위 핸들" onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onDiagonalExtentCommit?.(currentPair.from, currentPair.to) }
            if (event.key === 'Escape') { event.preventDefault(); onDiagonalCancel?.() }
          }} />
      </g>
    })()}
  </svg>
}

export function GridSystem2LabPage() {
  const [project, setProject] = useState<Grid2Project>(loadProject)
  const [selectedJamo, setSelectedJamo] = useState<Grid2Jamo>('ㄱ')
  const [tool, setTool] = useState<Grid2Tool>('fill')
  const [selectedRail, setSelectedRail] = useState<SelectedRail>({ axis: 'x', index: 1 })
  const [curveDraft, setCurveDraft] = useState<CurveDraft | null>(null)
  const [diagonalDraft, setDiagonalDraft] = useState<DiagonalDraft | null>(null)
  const [past, setPast] = useState<Grid2Project[]>([])
  const [future, setFuture] = useState<Grid2Project[]>([])
  const projectRef = useRef(project)
  const railGesture = useRef<{ axis: Grid2Axis; index: number; before: Grid2Project } | null>(null)
  const fillGesture = useRef<{ before: Grid2Project; filled: boolean; visited: Set<string> } | null>(null)
  const diagonalGestureCommitted = useRef(false)
  projectRef.current = project

  useEffect(() => { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(project)) }, [project])

  const commit = (next: Grid2Project) => {
    if (JSON.stringify(next) === JSON.stringify(projectRef.current)) return
    const before = cloneGrid2Project(projectRef.current)
    setPast((history) => [...history.slice(-39), before])
    setFuture([])
    projectRef.current = next
    setProject(next)
  }
  const undo = () => {
    const previous = past.at(-1)
    if (!previous) return
    const current = cloneGrid2Project(projectRef.current)
    setPast((history) => history.slice(0, -1))
    setFuture((history) => [current, ...history.slice(0, 39)])
    const next = cloneGrid2Project(previous)
    projectRef.current = next
    setProject(next)
  }
  const redo = () => {
    const nextProject = future[0]
    if (!nextProject) return
    const current = cloneGrid2Project(projectRef.current)
    setFuture((history) => history.slice(1))
    setPast((history) => [...history.slice(-39), current])
    const next = cloneGrid2Project(nextProject)
    projectRef.current = next
    setProject(next)
  }
  const reset = () => commit(createDefaultGrid2Project())

  const paintCellDuringGesture = (row: number, column: number) => {
    const gesture = fillGesture.current
    if (!gesture || row < 0 || column < 0 || row >= projectRef.current.yRails.length - 1 || column >= projectRef.current.xRails.length - 1) return
    const key = `${row}-${column}`
    if (gesture.visited.has(key)) return
    gesture.visited.add(key)
    setProject((current) => {
      const next = paintGrid2Cell(current, selectedJamo, row, column, gesture.filled)
      projectRef.current = next
      return next
    })
  }
  const handleCellPaintStart = (event: ReactPointerEvent<SVGRectElement>, row: number, column: number) => {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    fillGesture.current = {
      before: cloneGrid2Project(projectRef.current),
      filled: getGrid2CellPaintValue(projectRef.current, selectedJamo, row, column),
      visited: new Set<string>(),
    }
    paintCellDuringGesture(row, column)
  }
  const handleCellPaintMove = (event: ReactPointerEvent<SVGRectElement>) => {
    if (!fillGesture.current || !event.currentTarget.hasPointerCapture(event.pointerId)) return
    const rect = event.currentTarget.ownerSVGElement?.getBoundingClientRect()
    if (!rect) return
    const x = (event.clientX - rect.left) / rect.width * 1000
    const y = (event.clientY - rect.top) / rect.height * 1000
    const column = projectRef.current.xRails.findIndex((rail, index, rails) => index < rails.length - 1 && x >= rail && x < rails[index + 1])
    const row = projectRef.current.yRails.findIndex((rail, index, rails) => index < rails.length - 1 && y >= rail && y < rails[index + 1])
    paintCellDuringGesture(row, column)
  }
  const handleCellPaintEnd = (event: ReactPointerEvent<SVGRectElement>) => {
    const gesture = fillGesture.current
    if (!gesture) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    fillGesture.current = null
    if (JSON.stringify(gesture.before) === JSON.stringify(projectRef.current)) return
    setPast((history) => [...history.slice(-39), gesture.before])
    setFuture([])
  }

  const handleRailStart = (event: ReactPointerEvent<SVGLineElement>, axis: Grid2Axis, index: number) => {
    setSelectedRail({ axis, index })
    event.currentTarget.setPointerCapture(event.pointerId)
    railGesture.current = { axis, index, before: cloneGrid2Project(projectRef.current) }
  }
  const handleRailMove = (event: ReactPointerEvent<SVGLineElement>) => {
    const gesture = railGesture.current
    if (!gesture || !event.currentTarget.hasPointerCapture(event.pointerId)) return
    const rect = event.currentTarget.ownerSVGElement?.getBoundingClientRect()
    if (!rect) return
    const value = gesture.axis === 'x'
      ? (event.clientX - rect.left) / rect.width * 1000
      : (event.clientY - rect.top) / rect.height * 1000
    setProject((current) => {
      const next = moveGrid2Rail(current, gesture.axis, gesture.index, value)
      projectRef.current = next
      return next
    })
  }
  const handleRailEnd = (event: ReactPointerEvent<SVGLineElement>) => {
    const gesture = railGesture.current
    if (!gesture) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    railGesture.current = null
    if (JSON.stringify(gesture.before) === JSON.stringify(projectRef.current)) return
    setPast((history) => [...history.slice(-39), gesture.before])
    setFuture([])
  }

  const handleAddRail = (axis: Grid2Axis) => {
    const preferredGap = selectedRail.axis === axis ? selectedRail.index : undefined
    const gap = getGrid2RailInsertGap(projectRef.current, axis, preferredGap)
    if (gap === null) return
    commit(addGrid2Rail(projectRef.current, axis, gap))
    setSelectedRail({ axis, index: gap + 1 })
  }
  const handleRemoveRail = () => {
    const rails = selectedRail.axis === 'x' ? projectRef.current.xRails : projectRef.current.yRails
    if (rails.length <= 3) return
    const next = removeGrid2Rail(projectRef.current, selectedRail.axis, selectedRail.index)
    commit(next)
    const nextRails = selectedRail.axis === 'x' ? next.xRails : next.yRails
    setSelectedRail({ axis: selectedRail.axis, index: Math.max(1, Math.min(nextRails.length - 2, selectedRail.index - 1)) })
  }
  const handleCurveCornerClick = (point: Grid2GridPoint) => {
    const candidate = getGrid2CurveCornerCandidates(projectRef.current, selectedJamo)
      .find((value) => value.vertex.xIndex === point.xIndex && value.vertex.yIndex === point.yIndex)
    if (!candidate) return
    const applied = projectRef.current.glyphs[selectedJamo].curves
      .find((curve) => curve.vertex.xIndex === point.xIndex && curve.vertex.yIndex === point.yIndex)
    setCurveDraft({
      vertex: point,
      incoming: applied?.incoming ?? candidate.incomingOptions[0],
      outgoing: applied?.outgoing ?? candidate.outgoingOptions[0],
    })
  }
  const handleCurveExtentPreview = (incoming: Grid2GridPoint, outgoing: Grid2GridPoint) => {
    setCurveDraft((current) => current ? { ...current, incoming, outgoing } : current)
  }
  const handleCurveExtentCommit = (incoming: Grid2GridPoint, outgoing: Grid2GridPoint) => {
    if (!curveDraft) return
    commit(setGrid2LocalCurve(projectRef.current, selectedJamo, {
      vertex: curveDraft.vertex,
      incoming,
      outgoing,
    }))
    setCurveDraft(null)
  }
  const handleDiagonalCornerClick = (point: Grid2GridPoint) => {
    const candidate = getGrid2DiagonalEdgeCandidates(projectRef.current, selectedJamo)
      .find((value) => value.vertex.xIndex === point.xIndex && value.vertex.yIndex === point.yIndex)
    if (!candidate) return
    diagonalGestureCommitted.current = false
    const applied = projectRef.current.glyphs[selectedJamo].diagonalEdges
      .find((edge) => edge.vertex.xIndex === point.xIndex && edge.vertex.yIndex === point.yIndex)
    setDiagonalDraft({
      vertex: point,
      from: applied?.from ?? candidate.incomingOptions[0],
      to: applied?.to ?? candidate.outgoingOptions[0],
    })
  }
  const handleDiagonalExtentPreview = (from: Grid2GridPoint, to: Grid2GridPoint) => {
    setDiagonalDraft((current) => current ? { ...current, from, to } : current)
  }
  const handleDiagonalExtentCommit = (from: Grid2GridPoint, to: Grid2GridPoint) => {
    if (!diagonalDraft || diagonalGestureCommitted.current) return
    diagonalGestureCommitted.current = true
    const edge: Grid2DiagonalEdge = { vertex: diagonalDraft.vertex, from, to }
    commit(setGrid2DiagonalEdge(projectRef.current, selectedJamo, edge))
    setDiagonalDraft(null)
  }
  const handleJamoSelect = (jamo: Grid2Jamo) => {
    setSelectedJamo(jamo)
    setCurveDraft(null)
    setDiagonalDraft(null)
  }
  const handleToolSelect = (nextTool: Grid2Tool) => {
    setTool(nextTool)
    setCurveDraft(null)
    setDiagonalDraft(null)
  }

  const glyph = project.glyphs[selectedJamo]
  const selectedRails = selectedRail.axis === 'x' ? project.xRails : project.yRails
  const selectedRailIndex = Math.max(1, Math.min(selectedRails.length - 2, selectedRail.index))
  const activeSelectedRail = { axis: selectedRail.axis, index: selectedRailIndex }
  const selectedRailValue = selectedRails[selectedRailIndex]
  const instruction = tool === 'rails' ? `캔버스의 레일을 직접 밀면 ${project.snapUnit} unit마다 딱 맞춰집니다.`
    : tool === 'fill' ? '칸을 누르거나 드래그해 면을 연속으로 채우거나 비웁니다. 외곽선은 즉시 하나의 벡터 면으로 합쳐집니다.'
      : tool === 'curve' ? !curveDraft ? '곡률을 줄 외곽 모서리를 고르세요.'
        : '주황 핸들을 끌거나 원하는 교점을 누르면 두 방향의 곡률 범위가 함께 적용됩니다.'
        : !diagonalDraft ? '사선으로 바꿀 볼록한 외곽 모서리를 고르세요.' : '쐐기 면 안을 끌거나 눌러 교체할 외곽 구간을 정하세요.'

  return <main className={styles.page} data-grid2-history-count={past.length}>
    <header className={styles.header}>
      <a href="/editor-v2" aria-label="보정 화면으로 돌아가기"><ArrowLeft size={18} /><span>보정 화면</span></a>
      <div><span>Grid System 2 · 실험</span><h1>형태 그리드</h1><p>레일 안의 면을 점유해 글자를 만들고, 같은 그리드의 곡률과 사선만 사용합니다.</p></div>
      <div className={styles.historyActions}>
        <button type="button" onClick={undo} disabled={past.length === 0} aria-label="실행 취소"><Undo2 size={18} /></button>
        <button type="button" onClick={redo} disabled={future.length === 0} aria-label="다시 실행"><Redo2 size={18} /></button>
        <button type="button" onClick={reset} aria-label="기본안 복원"><RotateCcw size={17} /></button>
      </div>
    </header>

    <section className={styles.workspace}>
      <div className={styles.editorCard}>
        <nav className={styles.jamoTabs} aria-label="실험 자모">
          {GRID2_JAMOS.map((jamo) => <button key={jamo} type="button" aria-selected={selectedJamo === jamo} onClick={() => handleJamoSelect(jamo)}>{jamo}</button>)}
        </nav>
        <div className={styles.canvas} data-grid2-tool={tool}>
          <Grid2Glyph project={project} jamo={selectedJamo} tool={tool} interactive selectedRail={activeSelectedRail} curveDraft={curveDraft} diagonalDraft={diagonalDraft}
            onCellToggle={(row, column) => commit(toggleGrid2Cell(projectRef.current, selectedJamo, row, column))}
            onCellPaintStart={handleCellPaintStart}
            onCellPaintMove={handleCellPaintMove}
            onCellPaintEnd={handleCellPaintEnd}
            onCurveCornerClick={handleCurveCornerClick}
            onCurveExtentPreview={handleCurveExtentPreview}
            onCurveExtentCommit={handleCurveExtentCommit}
            onCurveCancel={() => setCurveDraft(null)}
            onDiagonalCornerClick={handleDiagonalCornerClick}
            onDiagonalExtentPreview={handleDiagonalExtentPreview}
            onDiagonalExtentCommit={handleDiagonalExtentCommit}
            onDiagonalCancel={() => setDiagonalDraft(null)}
            onRailStart={handleRailStart} onRailMove={handleRailMove} onRailEnd={handleRailEnd}
            onRailNudge={(axis, index, delta) => commit(moveGrid2Rail(projectRef.current, axis, index, (axis === 'x' ? projectRef.current.xRails : projectRef.current.yRails)[index] + delta))} />
          <span className={styles.canvasBadge}>원본 획 보존 · 별도 형태 데이터</span>
          {tool === 'rails' && <output className={styles.railValueBadge}>{selectedRail.axis === 'x' ? '세로' : '가로'} {selectedRailIndex} · {selectedRailValue}</output>}
          {tool === 'diagonal' && <output className={styles.railValueBadge}>사선 · {glyph.diagonalEdges.length}개</output>}
        </div>
      </div>

      <aside className={styles.controls}>
        <div className={styles.toolTabs} role="radiogroup" aria-label="형태 그리드 도구">
          {TOOL_OPTIONS.map(({ tool: option, label, icon: Icon }) => <button key={option} type="button" role="radio" aria-checked={tool === option} onClick={() => handleToolSelect(option)}><Icon size={17} /><span>{label}</span></button>)}
        </div>
        <p className={styles.instruction}>{instruction}</p>
        {tool === 'rails' && <div className={styles.railControls}>
          <div className={styles.railActions}>
            <button type="button" onClick={() => handleAddRail('x')} disabled={getGrid2RailInsertGap(project, 'x', selectedRail.axis === 'x' ? selectedRailIndex : undefined) === null}><Plus size={15} />세로선 추가</button>
            <button type="button" onClick={() => handleAddRail('y')} disabled={getGrid2RailInsertGap(project, 'y', selectedRail.axis === 'y' ? selectedRailIndex : undefined) === null}><Plus size={15} />가로선 추가</button>
            <button type="button" onClick={handleRemoveRail} disabled={selectedRails.length <= 3}><Trash2 size={15} />선 삭제</button>
          </div>
          <div className={styles.railNumbers}>
            <label><span>선택 위치</span><input key={`${selectedRail.axis}-${selectedRailIndex}-${selectedRailValue}`} type="number" min={selectedRails[selectedRailIndex - 1] + 50} max={selectedRails[selectedRailIndex + 1] - 50} step={project.snapUnit} defaultValue={selectedRailValue} aria-label="선택 레일 위치"
              onBlur={(event) => commit(moveGrid2Rail(projectRef.current, selectedRail.axis, selectedRailIndex, Number(event.target.value)))} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }} /><small>unit</small></label>
            <label><span>드래그 스냅</span><input key={project.snapUnit} type="number" min="5" max="100" step="5" defaultValue={project.snapUnit} aria-label="레일 스냅 단위"
              onBlur={(event) => commit(setGrid2SnapUnit(projectRef.current, Number(event.target.value)))} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }} /><small>unit</small></label>
          </div>
          <p>레일 추가는 선택한 선 다음 칸을 나누고, 삭제는 양쪽 칸을 합칩니다.</p>
        </div>}
        {tool === 'curve' && <div className={styles.curveOptions} aria-label="부분 곡률 설정">
          <p>{!curveDraft ? '모서리 선택' : '곡률 범위 조절'}</p>
          <button type="button" onClick={() => setCurveDraft(null)} disabled={!curveDraft}>선택 취소</button>
          <button type="button" onClick={() => {
            if (!curveDraft) return
            commit(removeGrid2LocalCurve(projectRef.current, selectedJamo, curveDraft.vertex))
            setCurveDraft(null)
          }} disabled={!curveDraft || !glyph.curves.some((curve) => curve.vertex.xIndex === curveDraft.vertex.xIndex && curve.vertex.yIndex === curveDraft.vertex.yIndex)}>이 모서리 곡률 해제</button>
          <button type="button" onClick={() => { commit(removeGrid2LocalCurve(projectRef.current, selectedJamo)); setCurveDraft(null) }} disabled={glyph.curves.length === 0}>전체 곡률 해제</button>
        </div>}
        <dl className={styles.ruleSummary}>
          <div><dt>공통 레일</dt><dd>{project.xRails.length - 1} × {project.yRails.length - 1}칸</dd></div>
          <div><dt>스냅</dt><dd>{project.snapUnit} unit</dd></div>
          <div><dt>곡률</dt><dd>{glyph.curves.length > 0 ? `${glyph.curves.length}개 모서리` : '직각'}</dd></div>
          <div><dt>사선</dt><dd>{glyph.diagonalEdges.length > 0 ? `${glyph.diagonalEdges.length}개 외곽` : glyph.localCuts.length > 0 || glyph.cut ? '이전 절단' : '없음'}</dd></div>
        </dl>
        <button type="button" className={styles.resetButton} onClick={reset}><RotateCcw size={15} />전체 초기화</button>
      </aside>

      <section className={styles.livePreview} aria-label="공통 그리드 미리보기">
        <header><div><span>LIVE SET</span><h2>같은 레일에서 비교</h2></div><p>움직인 레일을 경계로 쓰는 글자들이 함께 반응합니다.</p></header>
        <div className={styles.previewGrid}>{GRID2_JAMOS.map((jamo) => <button key={jamo} type="button" data-selected={selectedJamo === jamo} onClick={() => handleJamoSelect(jamo)}><Grid2Glyph project={project} jamo={jamo} /><strong>{jamo}</strong></button>)}</div>
      </section>
    </section>
  </main>
}
