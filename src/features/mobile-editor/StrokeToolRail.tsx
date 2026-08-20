import { Link2, Plus, Spline, Trash2, Unlink } from 'lucide-react'
import styles from './MobileEditorV2.module.css'

interface StrokeToolRailProps {
  onAdd: () => void
  curveMode?: 'curve' | 'line'
  onToggleCurve?: () => void
  onConnect?: () => void
  onDisconnect?: () => void
  deleteLabel?: '꼭짓점 삭제' | '획 삭제'
  onDelete?: () => void
}

export function StrokeToolRail({
  onAdd,
  curveMode,
  onToggleCurve,
  onConnect,
  onDisconnect,
  deleteLabel,
  onDelete,
}: StrokeToolRailProps) {
  return (
    <aside className={styles.strokeToolRail} aria-label="획 편집 도구" onPointerDown={(event) => event.stopPropagation()}>
      <button type="button" onClick={onAdd} aria-label="선 추가"><Plus size={18} aria-hidden="true" /><span>추가</span></button>
      {curveMode && onToggleCurve && <button type="button" onClick={onToggleCurve} aria-label={curveMode === 'line' ? '직선화' : '곡선화'}><Spline size={18} aria-hidden="true" /><span>{curveMode === 'line' ? '직선' : '곡선'}</span></button>}
      {onConnect && <button type="button" onClick={onConnect} aria-label="가까운 선 연결"><Link2 size={18} aria-hidden="true" /><span>연결</span></button>}
      {onDisconnect && <button type="button" onClick={onDisconnect} aria-label="선 끊기"><Unlink size={18} aria-hidden="true" /><span>끊기</span></button>}
      {deleteLabel && onDelete && <button type="button" onClick={onDelete} aria-label={deleteLabel}><Trash2 size={18} aria-hidden="true" /><span>삭제</span></button>}
    </aside>
  )
}
