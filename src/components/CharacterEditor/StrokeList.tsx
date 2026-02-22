import { useUIStore } from '../../stores/uiStore'
import type { StrokeDataV2 } from '../../types'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'

interface StrokeListProps {
  strokes: StrokeDataV2[]
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
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-4 gap-2 max-h-[200px] overflow-y-auto">
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
                {stroke.id} ({stroke.label || (stroke.closed ? '도형' : `${stroke.points.length}pt`)})
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
