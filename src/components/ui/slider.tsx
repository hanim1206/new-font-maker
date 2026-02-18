import * as React from 'react'
import * as SliderPrimitive from '@radix-ui/react-slider'
import { cn } from '@/lib/utils'

const colorSchemes = {
  default: {
    track: 'bg-accent-blue-light',
    thumb: 'bg-accent-blue-light hover:bg-accent-blue-lighter',
  },
  x: {
    track: 'bg-accent-red',
    thumb: 'bg-accent-red hover:bg-accent-red-light',
  },
  y: {
    track: 'bg-accent-cyan',
    thumb: 'bg-accent-cyan hover:bg-accent-cyan-light',
  },
  padding: {
    track: 'bg-accent-purple',
    thumb: 'bg-accent-purple hover:bg-accent-purple-light',
  },
  override: {
    track: 'bg-accent-orange',
    thumb: 'bg-accent-orange hover:bg-accent-orange-light',
  },
} as const

export type SliderColorScheme = keyof typeof colorSchemes

export interface SliderMark {
  value: number
  label?: string
}

interface SliderProps
  extends React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> {
  colorScheme?: SliderColorScheme
  /** 스냅 포인트에 점(mark) 표시 */
  marks?: SliderMark[]
  /** 하드코딩된 앱 기본값 — 트랙 위에 다이아몬드 마커로 표시 */
  originValue?: number
}

const Slider = React.forwardRef<
  React.ComponentRef<typeof SliderPrimitive.Root>,
  SliderProps
>(({ className, colorScheme = 'default', marks, originValue, ...props }, ref) => {
  const colors = colorSchemes[colorScheme]
  const min = props.min ?? 0
  const max = props.max ?? 100
  const currentValue = (props.value ?? props.defaultValue ?? [min])[0]
  const isAtOrigin = originValue !== undefined && currentValue === originValue

  return (
    <div className="relative">
      <SliderPrimitive.Root
        ref={ref}
        className={cn(
          'relative flex w-full touch-none select-none items-center',
          className
        )}
        {...props}
      >
        <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-surface-2">
          <SliderPrimitive.Range className={cn('absolute h-full', colors.track)} />
        </SliderPrimitive.Track>

        {/* 기본값 마커 (다이아몬드) */}
        {originValue !== undefined && !isAtOrigin && (() => {
          const pct = ((originValue - min) / (max - min)) * 100
          return (
            <span
              className="absolute top-1/2 -translate-y-1/2 pointer-events-none z-[5]"
              style={{ left: `${pct}%` }}
            >
              <span
                className="block w-[8px] h-[8px] -ml-[4px] rotate-45 rounded-[1px] bg-white/60 border border-white/30"
              />
            </span>
          )
        })()}

        {/* 마크 점 (트랙 위에 렌더링) */}
        {marks && marks.map((mark) => {
          const pct = ((mark.value - min) / (max - min)) * 100
          const isActive = mark.value <= currentValue
          // 기본값과 같은 위치의 마크는 다이아몬드가 대신 표시하므로 숨김
          const isOriginMark = originValue !== undefined && mark.value === originValue && !isAtOrigin
          if (isOriginMark) return null
          return (
            <span
              key={mark.value}
              className="absolute top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ left: `${pct}%` }}
            >
              <span
                className={cn(
                  'block w-[6px] h-[6px] rounded-full -ml-[3px] transition-colors',
                  isActive ? 'bg-white/50' : 'bg-white/15'
                )}
              />
            </span>
          )
        })}

        <SliderPrimitive.Thumb
          className={cn(
            'block h-[18px] w-[18px] rounded-full border-2 border-surface-3 shadow-md transition-transform hover:scale-110 focus-visible:outline-none z-10',
            colors.thumb
          )}
        />
      </SliderPrimitive.Root>

      {/* 마크 라벨 (슬라이더 아래) */}
      {marks && marks.some(m => m.label) && (
        <div className="relative w-full mt-1.5 h-4">
          {marks.map((mark) => {
            if (!mark.label) return null
            const pct = ((mark.value - min) / (max - min)) * 100
            const isActive = mark.value === currentValue
            const isOriginLabel = originValue !== undefined && mark.value === originValue
            return (
              <span
                key={mark.value}
                className={cn(
                  'absolute text-[0.6rem] -translate-x-1/2 tabular-nums',
                  isActive ? 'text-text-dim-2 font-semibold'
                    : isOriginLabel && !isAtOrigin ? 'text-white/50 font-medium'
                    : 'text-text-dim-5'
                )}
                style={{ left: `${pct}%` }}
              >
                {mark.label}
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
})
Slider.displayName = SliderPrimitive.Root.displayName

export { Slider }
