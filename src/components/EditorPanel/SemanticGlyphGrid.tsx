import { useCallback, useEffect, useMemo, useRef } from 'react'
import { buildSyllableGridSheets, formatAxisValue, type SyllableGridMeta } from '../../utils/syllableGridUtils'
import type { LayoutType } from '../../types'

interface SemanticGlyphGridProps {
  syllables: SyllableGridMeta[]
  editingJamoType: 'choseong' | 'jungseong' | 'jongseong' | null
  selectedLayoutType: LayoutType | null
  selectedChars: Set<string>
  selectable: boolean
  renderCell: (meta: SyllableGridMeta, selected: boolean) => React.ReactNode
  onToggleCell: (char: string) => void
  onToggleRange: (chars: string[]) => void
  onSetSelection: (chars: Set<string>) => void
  onNavigate: (meta: SyllableGridMeta) => void
}

const CELL_SIZE = 44
const HEADER_SIZE = 38

export function SemanticGlyphGrid({
  syllables,
  editingJamoType,
  selectedLayoutType,
  selectedChars,
  selectable,
  renderCell,
  onToggleCell,
  onToggleRange,
  onSetSelection,
  onNavigate,
}: SemanticGlyphGridProps) {
  const sheets = useMemo(
    () => buildSyllableGridSheets(syllables, { editingJamoType, selectedLayoutType }),
    [syllables, editingJamoType, selectedLayoutType],
  )
  const dragStartRef = useRef<{ sheetId: string; row: number; column: number } | null>(null)
  const selectionBeforeDragRef = useRef<Set<string>>(new Set())
  const dragMovedRef = useRef(false)
  const activePointerIdRef = useRef<number | null>(null)
  const capturedElementRef = useRef<HTMLElement | null>(null)

  const selectRectangle = useCallback((sheetId: string, endRow: number, endColumn: number) => {
    const start = dragStartRef.current
    const sheet = sheets.find((candidate) => candidate.id === sheetId)
    if (!start || start.sheetId !== sheetId || !sheet) return
    if (start.row === endRow && start.column === endColumn) return
    dragMovedRef.current = true
    const minRow = Math.min(start.row, endRow)
    const maxRow = Math.max(start.row, endRow)
    const minColumn = Math.min(start.column, endColumn)
    const maxColumn = Math.max(start.column, endColumn)
    const chars: string[] = []
    for (let row = minRow; row <= maxRow; row += 1) {
      for (let column = minColumn; column <= maxColumn; column += 1) {
        const meta = sheet.cells[row]?.[column]
        if (meta) chars.push(meta.char)
      }
    }
    const next = new Set(selectionBeforeDragRef.current)
    const shouldDeselect = chars.length > 0 && chars.every((char) => selectionBeforeDragRef.current.has(char))
    chars.forEach((char) => {
      if (shouldDeselect) next.delete(char)
      else next.add(char)
    })
    onSetSelection(next)
  }, [sheets, onSetSelection])

  const endDrag = useCallback(() => {
    const pointerId = activePointerIdRef.current
    const capturedElement = capturedElementRef.current

    // 먼저 상태를 비워 lostpointercapture 재진입 시에도 안전하게 종료한다.
    dragStartRef.current = null
    activePointerIdRef.current = null
    capturedElementRef.current = null

    if (pointerId !== null && capturedElement?.hasPointerCapture(pointerId)) {
      capturedElement.releasePointerCapture(pointerId)
    }
  }, [])

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      if (dragStartRef.current === null || activePointerIdRef.current !== event.pointerId) return
      if (event.buttons === 0) {
        endDrag()
        return
      }

      const target = document.elementFromPoint(event.clientX, event.clientY)
      const cell = target?.closest<HTMLElement>('[data-semantic-grid-cell]')
      if (!cell) return
      const sheetId = cell.dataset.gridSheet
      const row = Number(cell.dataset.gridRow)
      const column = Number(cell.dataset.gridColumn)
      if (sheetId && Number.isInteger(row) && Number.isInteger(column)) selectRectangle(sheetId, row, column)
    }
    const handlePointerEnd = (event: PointerEvent) => {
      if (activePointerIdRef.current === null || activePointerIdRef.current === event.pointerId) endDrag()
    }
    const handleMouseEnd = () => endDrag()
    const handleBlur = () => endDrag()

    document.addEventListener('pointermove', handlePointerMove)
    document.addEventListener('pointerup', handlePointerEnd, true)
    document.addEventListener('pointercancel', handlePointerEnd, true)
    document.addEventListener('mouseup', handleMouseEnd, true)
    window.addEventListener('pointerup', handlePointerEnd, true)
    window.addEventListener('pointercancel', handlePointerEnd, true)
    window.addEventListener('mouseup', handleMouseEnd, true)
    window.addEventListener('blur', handleBlur)
    return () => {
      endDrag()
      document.removeEventListener('pointermove', handlePointerMove)
      document.removeEventListener('pointerup', handlePointerEnd, true)
      document.removeEventListener('pointercancel', handlePointerEnd, true)
      document.removeEventListener('mouseup', handleMouseEnd, true)
      window.removeEventListener('pointerup', handlePointerEnd, true)
      window.removeEventListener('pointercancel', handlePointerEnd, true)
      window.removeEventListener('mouseup', handleMouseEnd, true)
      window.removeEventListener('blur', handleBlur)
    }
  }, [endDrag, selectRectangle])

  if (sheets.length === 0) {
    return <div className="p-4 text-xs text-text-dim-5">표시할 음절이 없습니다.</div>
  }

  return (
    <div className="flex-1 min-h-0 overflow-auto bg-white select-none">
      {sheets.map((sheet) => {
        const allChars = sheet.cells.flatMap((row) => row.flatMap((meta) => meta ? [meta.char] : []))
        return (
        <section key={sheet.id} className="w-max min-w-full border-b-4 border-[#080808] last:border-b-0">
          <div className="sticky left-0 z-20 px-3 py-1.5 bg-[#111111] border-b border-border-subtle text-[11px] font-semibold text-text-dim-2">
            {sheet.label}
          </div>
        <div
          className="grid w-max min-w-full"
          style={{ gridTemplateColumns: `${HEADER_SIZE}px repeat(${sheet.columns.length}, ${CELL_SIZE}px)` }}
        >
          <button
            type="button"
            disabled={!selectable}
            onClick={() => onToggleRange(allChars)}
            title="현재 시트 전체 선택/해제"
            className="sticky top-0 left-0 z-30 border-r border-b border-neutral-300 bg-neutral-100 text-[8px] leading-tight text-neutral-600 disabled:cursor-default"
            style={{ width: HEADER_SIZE, height: HEADER_SIZE }}
          >
            전체
          </button>
          {sheet.columns.map((column, columnIndex) => {
            const chars = sheet.cells.flatMap((row) => row[columnIndex] ? [row[columnIndex]!.char] : [])
            return (
              <button
                key={`column-${column}`}
                type="button"
                disabled={!selectable}
                onClick={() => onToggleRange(chars)}
                title={`${sheet.columnLabel} ${formatAxisValue(column)} 전체 선택/해제`}
                className="sticky top-0 z-20 border-r border-b border-neutral-300 bg-neutral-100 text-[11px] font-medium text-neutral-700 disabled:cursor-default"
                style={{ width: CELL_SIZE, height: HEADER_SIZE }}
              >
                {formatAxisValue(column)}
              </button>
            )
          })}

          {sheet.rows.map((row, rowIndex) => (
            <div key={`row-${row}`} className="contents">
              <button
                type="button"
                disabled={!selectable}
                onClick={() => onToggleRange(sheet.cells[rowIndex].flatMap((meta) => meta ? [meta.char] : []))}
                title={`${sheet.rowLabel} ${formatAxisValue(row)} 전체 선택/해제`}
                className="sticky left-0 z-10 border-r border-b border-neutral-300 bg-neutral-100 text-[10px] font-medium text-neutral-700 disabled:cursor-default"
                style={{ width: HEADER_SIZE, height: CELL_SIZE }}
              >
                {formatAxisValue(row)}
              </button>
              {sheet.cells[rowIndex].map((meta, columnIndex) => (
                meta ? (
                  <div
                    key={meta.char}
                    data-semantic-grid-cell
                    data-grid-sheet={sheet.id}
                    data-grid-row={rowIndex}
                    data-grid-column={columnIndex}
                    title={`${meta.char} · 더블클릭하여 중앙에서 보기`}
                    className={`relative overflow-hidden border-r border-b border-neutral-200 flex items-center justify-center ${selectable ? 'cursor-pointer' : 'cursor-default'}`}
                    style={{ width: CELL_SIZE, height: CELL_SIZE }}
                    onPointerDown={selectable ? (event) => {
                      event.preventDefault()
                      dragStartRef.current = { sheetId: sheet.id, row: rowIndex, column: columnIndex }
                      selectionBeforeDragRef.current = new Set(selectedChars)
                      dragMovedRef.current = false
                      activePointerIdRef.current = event.pointerId
                      capturedElementRef.current = event.currentTarget
                      event.currentTarget.setPointerCapture(event.pointerId)
                    } : undefined}
                    onLostPointerCapture={endDrag}
                    onClick={selectable ? () => {
                      if (!dragMovedRef.current) onToggleCell(meta.char)
                      dragMovedRef.current = false
                    } : undefined}
                    onDoubleClick={() => onNavigate(meta)}
                  >
                    {renderCell(meta, selectable && selectedChars.has(meta.char))}
                  </div>
                ) : (
                  <div
                    key={`empty-${rowIndex}-${columnIndex}`}
                    className="border-r border-b border-neutral-200 bg-neutral-50"
                    style={{ width: CELL_SIZE, height: CELL_SIZE }}
                  />
                )
              ))}
            </div>
          ))}
        </div>
        </section>
        )
      })}
    </div>
  )
}
