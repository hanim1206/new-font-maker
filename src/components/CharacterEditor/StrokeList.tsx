import { useUIStore } from '../../stores/uiStore'
import type { StrokeData } from '../../types'
import styles from './CharacterEditor.module.css'

interface StrokeListProps {
  strokes: StrokeData[]
}

export function StrokeList({ strokes }: StrokeListProps) {
  const { selectedStrokeId, setSelectedStrokeId } = useUIStore()

  if (strokes.length === 0) {
    return (
      <div className={styles.strokeList}>
        <h3 className={styles.sectionTitle}>획 목록</h3>
        <div className={styles.emptyStrokeList}>획이 없습니다</div>
      </div>
    )
  }

  return (
    <div className={styles.strokeList}>
      <h3 className={styles.sectionTitle}>획 목록</h3>
      <div className={styles.list}>
        {strokes.map((stroke) => (
          <button
            key={stroke.id}
            className={selectedStrokeId === stroke.id ? styles.strokeActive : ''}
            onClick={() => setSelectedStrokeId(stroke.id)}
          >
            {stroke.id} ({stroke.direction === 'horizontal' ? '가로' : stroke.direction === 'vertical' ? '세로' : '패스'})
          </button>
        ))}
      </div>
    </div>
  )
}
