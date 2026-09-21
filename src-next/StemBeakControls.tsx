import { useRef } from 'react'
import { DEFAULT_STEM_BEAK, STEM_BEAK_SHAPES, stemBeakInkGroups, type StemBeakShape, type StemBeakStyle } from '../src/services/stemBeak'
import type { StrokeDataV2 } from '../src/types'
import styles from './StemBeakControls.module.css'

const UNIT_BOX = { x: 0, y: 0, width: 1, height: 1 }
/** 모양 고르기 버튼의 그림. 실제 부리 함수로 그리므로 버튼에서 본 모양이 그대로 글자에 나온다. */
const THUMB_STEM: StrokeDataV2 = { id: 'thumb', points: [{ x: 0.56, y: 0.3 }, { x: 0.56, y: 1.1 }], closed: false, thickness: 0.2 }

export function BeakShapeThumb({ shape, size, angle }: { shape: StemBeakShape | null; size: number; angle: number }) {
  const half = THUMB_STEM.thickness / 2
  const contour = shape ? stemBeakInkGroups([{ stroke: THUMB_STEM, box: UNIT_BOX, weightMultiplier: 1, group: 'thumb' }], { enabled: true, shape, size, angle })[0]?.[0]?.[0] : null
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <rect x={(0.56 - half) * 100} y={30} width={half * 200} height={80} />
      {contour && <polygon points={contour.map((point) => `${point.x * 100},${point.y * 100}`).join(' ')} />}
    </svg>
  )
}

/**
 * 세로줄기 일괄 부리. 모양은 그림 버튼에서 고르면 바로 적용, 크기 · 각도는 끄는 동안 미리보기만 하고 손을 떼면 적용한다.
 * 저장과 되돌리기 기록은 부모가 맡는다.
 */
export function StemBeakControls({ committed, draft, onDraftChange, onCommit }: {
  committed: StemBeakStyle
  draft: StemBeakStyle | null
  onDraftChange: (beak: StemBeakStyle | null) => void
  onCommit: (before: StemBeakStyle, after: StemBeakStyle) => void
}) {
  const beak = draft ?? committed
  const latest = useRef(beak)
  latest.current = beak
  const pick = (next: Partial<StemBeakStyle>) => onCommit(committed, { ...committed, ...next })
  const preview = (next: Partial<StemBeakStyle>) => { latest.current = { ...latest.current, ...next }; onDraftChange(latest.current) }
  const commit = () => { if (draft) onCommit(committed, latest.current) }
  const isDefault = !committed.enabled && committed.shape === DEFAULT_STEM_BEAK.shape && committed.size === DEFAULT_STEM_BEAK.size && committed.angle === DEFAULT_STEM_BEAK.angle
  return <div className={styles.controls} role="tabpanel" aria-label="부리 설정">
    <p><strong>세로줄기의 열린 머리에 한 번에</strong><span>획 데이터는 그대로입니다</span></p>
    <div className={styles.shapes} role="radiogroup" aria-label="부리 모양">
      <button type="button" role="radio" aria-checked={!beak.enabled} data-beak-shape="none" onClick={() => pick({ enabled: false })}>
        <BeakShapeThumb shape={null} size={beak.size} angle={beak.angle} /><span>없음</span>
      </button>
      {STEM_BEAK_SHAPES.map(({ id, label, note }) => (
        <button key={id} type="button" role="radio" aria-checked={beak.enabled && beak.shape === id} title={note} data-beak-shape={id} onClick={() => pick({ enabled: true, shape: id })}>
          <BeakShapeThumb shape={id} size={beak.size} angle={beak.angle} /><span>{label}</span>
        </button>
      ))}
    </div>
    <div className={styles.sliders}>
      <label><span>크기 <output>{beak.size.toFixed(1)}</output></span><input aria-label="부리 크기" type="range" min={0.5} max={2} step={0.1} value={beak.size} disabled={!beak.enabled} onChange={(event) => preview({ size: Number(event.target.value) })} onPointerUp={commit} onKeyUp={commit} onBlur={commit} /></label>
      <label><span>각도 <output>{beak.angle}°</output></span><input aria-label="부리 각도" type="range" min={-60} max={60} step={5} value={beak.angle} disabled={!beak.enabled || beak.shape !== 'angled'} onChange={(event) => preview({ angle: Number(event.target.value) })} onPointerUp={commit} onKeyUp={commit} onBlur={commit} /></label>
    </div>
    <button type="button" disabled={isDefault} onClick={() => onCommit(committed, { ...DEFAULT_STEM_BEAK })}>부리 처음 값으로</button>
  </div>
}
