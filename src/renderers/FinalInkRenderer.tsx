import type { DeepReadonly } from '../types'
import type { FinalGlyphInk } from '../services/finalGlyphInk'
import { finalGlyphInkToSvgPath } from '../services/finalGlyphInk'

interface FinalInkRendererProps {
  ink: DeepReadonly<FinalGlyphInk>
  size?: number
  fillColor?: string
  backgroundColor?: string
  className?: string
  ariaLabel?: string
}

const VIEW_BOX_SIZE = 100

/**
 * 공통 final regions를 그대로 그리는 Shape 전용 출력 경계다.
 * 이 컴포넌트는 중심선을 다시 확장하거나 Boolean을 다시 수행하지 않는다.
 */
export function FinalInkRenderer({
  ink,
  size = 100,
  fillColor = '#1a1a1a',
  backgroundColor = 'transparent',
  className,
  ariaLabel = 'Shape 최종 윤곽',
}: FinalInkRendererProps) {
  const path = finalGlyphInkToSvgPath(ink, VIEW_BOX_SIZE)
  return (
    <svg
      viewBox={`0 0 ${VIEW_BOX_SIZE} ${VIEW_BOX_SIZE}`}
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label={ariaLabel}
    >
      {backgroundColor !== 'transparent' && (
        <rect width={VIEW_BOX_SIZE} height={VIEW_BOX_SIZE} fill={backgroundColor} />
      )}
      <path d={path} fill={fillColor} fillRule="evenodd" clipRule="evenodd" pointerEvents="none" data-final-ink="true" />
    </svg>
  )
}
