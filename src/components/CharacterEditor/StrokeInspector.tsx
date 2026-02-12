import { useUIStore } from '../../stores/uiStore'
import type { StrokeData } from '../../types'
import { isPathStroke } from '../../types'
import styles from './CharacterEditor.module.css'

type PathPointChangeHandler = (
  strokeId: string,
  pointIndex: number,
  field: 'x' | 'y' | 'handleIn' | 'handleOut',
  value: { x: number; y: number } | number
) => void

interface StrokeInspectorProps {
  strokes: StrokeData[]
  onChange: (strokeId: string, prop: keyof StrokeData, value: number) => void
  onPathPointChange?: PathPointChangeHandler
}

export function StrokeInspector({ strokes, onChange, onPathPointChange }: StrokeInspectorProps) {
  const { selectedStrokeId, selectedPointIndex, setSelectedPointIndex } = useUIStore()
  const selectedStroke = strokes.find((s) => s.id === selectedStrokeId)

  if (!selectedStroke) {
    return (
      <div className={styles.strokeInspector}>
        <h3 className={styles.sectionTitle}>Stroke Properties</h3>
        <div className={styles.emptyState}>획을 선택해주세요</div>
      </div>
    )
  }

  const isPath = isPathStroke(selectedStroke)
  const selectedPoint = isPath && selectedPointIndex !== null
    ? selectedStroke.pathData.points[selectedPointIndex]
    : null

  return (
    <div className={styles.strokeInspector}>
      <h3 className={styles.sectionTitle}>Stroke: {selectedStroke.id}</h3>

      {/* 바운딩 박스 속성 입력 */}
      <div className={styles.propertyList}>
        <div className={styles.propertyItem}>
          <label className={styles.propertyLabel}>X</label>
          <input
            type="number"
            min="0"
            max="1"
            step="0.01"
            value={selectedStroke.x.toFixed(2)}
            onChange={(e) => onChange(selectedStroke.id, 'x', parseFloat(e.target.value) || 0)}
            className={styles.propertyInput}
          />
        </div>
        <div className={styles.propertyItem}>
          <label className={styles.propertyLabel}>Y</label>
          <input
            type="number"
            min="0"
            max="1"
            step="0.01"
            value={selectedStroke.y.toFixed(2)}
            onChange={(e) => onChange(selectedStroke.id, 'y', parseFloat(e.target.value) || 0)}
            className={styles.propertyInput}
          />
        </div>
        <div className={styles.propertyItem}>
          <label className={styles.propertyLabel}>Width</label>
          <input
            type="number"
            min="0.01"
            max="1"
            step="0.01"
            value={selectedStroke.width.toFixed(2)}
            onChange={(e) => onChange(selectedStroke.id, 'width', parseFloat(e.target.value) || 0.01)}
            className={styles.propertyInput}
          />
        </div>
        <div className={styles.propertyItem}>
          <label className={styles.propertyLabel}>Height</label>
          <input
            type="number"
            min="0.01"
            max="1"
            step="0.01"
            value={selectedStroke.height.toFixed(2)}
            onChange={(e) => onChange(selectedStroke.id, 'height', parseFloat(e.target.value) || 0.01)}
            className={styles.propertyInput}
          />
        </div>
      </div>

      {/* 메타 정보 */}
      <div className={styles.metaInfo}>
        <span className={styles.metaLabel}>Direction:</span>
        <span className={styles.metaValue}>
          {selectedStroke.direction === 'horizontal' ? '가로 (Horizontal)' :
           selectedStroke.direction === 'vertical' ? '세로 (Vertical)' :
           '패스 (Path)'}
        </span>
      </div>

      {/* 패스 포인트 편집 UI */}
      {isPath && (
        <>
          {/* 포인트 목록 */}
          <h3 className={styles.sectionTitle}>Path Points</h3>
          <div className={styles.pointList}>
            {selectedStroke.pathData.points.map((_, i) => (
              <button
                key={i}
                className={i === selectedPointIndex ? styles.pointActive : styles.pointItem}
                onClick={() => setSelectedPointIndex(i)}
              >
                Point {i}
              </button>
            ))}
          </div>

          {/* 선택된 포인트 속성 */}
          {selectedPoint && onPathPointChange && (
            <div className={styles.pointProperties}>
              <h3 className={styles.sectionTitle}>Point {selectedPointIndex}</h3>
              <div className={styles.propertyList}>
                <div className={styles.propertyItem}>
                  <label className={styles.propertyLabel}>Point X</label>
                  <input
                    type="number"
                    min="0"
                    max="1"
                    step="0.01"
                    value={selectedPoint.x.toFixed(4)}
                    onChange={(e) => onPathPointChange(selectedStroke.id, selectedPointIndex!, 'x', parseFloat(e.target.value) || 0)}
                    className={styles.propertyInput}
                  />
                </div>
                <div className={styles.propertyItem}>
                  <label className={styles.propertyLabel}>Point Y</label>
                  <input
                    type="number"
                    min="0"
                    max="1"
                    step="0.01"
                    value={selectedPoint.y.toFixed(4)}
                    onChange={(e) => onPathPointChange(selectedStroke.id, selectedPointIndex!, 'y', parseFloat(e.target.value) || 0)}
                    className={styles.propertyInput}
                  />
                </div>
              </div>

              {/* Handle In */}
              {selectedPoint.handleIn && (
                <div className={styles.handleGroup}>
                  <span className={styles.metaLabel}>Handle In</span>
                  <div className={styles.propertyList}>
                    <div className={styles.propertyItem}>
                      <label className={styles.propertyLabel}>X</label>
                      <input
                        type="number"
                        step="0.01"
                        value={selectedPoint.handleIn.x.toFixed(4)}
                        onChange={(e) => onPathPointChange(
                          selectedStroke.id, selectedPointIndex!, 'handleIn',
                          { x: parseFloat(e.target.value) || 0, y: selectedPoint.handleIn!.y }
                        )}
                        className={styles.propertyInput}
                      />
                    </div>
                    <div className={styles.propertyItem}>
                      <label className={styles.propertyLabel}>Y</label>
                      <input
                        type="number"
                        step="0.01"
                        value={selectedPoint.handleIn.y.toFixed(4)}
                        onChange={(e) => onPathPointChange(
                          selectedStroke.id, selectedPointIndex!, 'handleIn',
                          { x: selectedPoint.handleIn!.x, y: parseFloat(e.target.value) || 0 }
                        )}
                        className={styles.propertyInput}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Handle Out */}
              {selectedPoint.handleOut && (
                <div className={styles.handleGroup}>
                  <span className={styles.metaLabel}>Handle Out</span>
                  <div className={styles.propertyList}>
                    <div className={styles.propertyItem}>
                      <label className={styles.propertyLabel}>X</label>
                      <input
                        type="number"
                        step="0.01"
                        value={selectedPoint.handleOut.x.toFixed(4)}
                        onChange={(e) => onPathPointChange(
                          selectedStroke.id, selectedPointIndex!, 'handleOut',
                          { x: parseFloat(e.target.value) || 0, y: selectedPoint.handleOut!.y }
                        )}
                        className={styles.propertyInput}
                      />
                    </div>
                    <div className={styles.propertyItem}>
                      <label className={styles.propertyLabel}>Y</label>
                      <input
                        type="number"
                        step="0.01"
                        value={selectedPoint.handleOut.y.toFixed(4)}
                        onChange={(e) => onPathPointChange(
                          selectedStroke.id, selectedPointIndex!, 'handleOut',
                          { x: selectedPoint.handleOut!.x, y: parseFloat(e.target.value) || 0 }
                        )}
                        className={styles.propertyInput}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
