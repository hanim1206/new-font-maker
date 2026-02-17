import { useUIStore } from '../../stores/uiStore'
import type { StrokeData } from '../../types'
import { isRectStroke } from '../../types'
import { cn } from '@/lib/utils'

interface StrokeListProps {
  strokes: StrokeData[]
}

export function StrokeList({ strokes }: StrokeListProps) {
  const { selectedStrokeId, setSelectedStrokeId } = useUIStore()

  if (strokes.length === 0) {
    return (
      <div className="flex flex-col">
        <h3 className="text-xs text-muted block mb-3">획 목록</h3>
        <div className="p-8 text-center text-text-dim-5 text-sm">획이 없습니다</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      <h3 className="text-xs text-muted block mb-3">획 목록</h3>
      <div className="flex flex-col gap-2 p-4 bg-surface-2 rounded-md border border-border max-h-[200px] overflow-y-auto">
        {strokes.map((stroke) => (
          <button
            key={stroke.id}
            className={cn(
              'py-3 px-4 bg-[#0f0f0f] text-[#e5e5e5] border border-border-lighter rounded text-sm text-left cursor-pointer transition-all duration-150 ease-in-out',
              'hover:bg-surface-3 hover:border-[#444]',
              selectedStrokeId === stroke.id && 'bg-primary border-primary text-white'
            )}
            onClick={() => setSelectedStrokeId(stroke.id)}
          >
            {stroke.id} ({isRectStroke(stroke) ? `${stroke.angle}°` : '패스'})
          </button>
        ))}
      </div>
    </div>
  )
}
