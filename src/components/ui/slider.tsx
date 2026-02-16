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

interface SliderProps
  extends React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> {
  colorScheme?: SliderColorScheme
}

const Slider = React.forwardRef<
  React.ComponentRef<typeof SliderPrimitive.Root>,
  SliderProps
>(({ className, colorScheme = 'default', ...props }, ref) => {
  const colors = colorSchemes[colorScheme]
  return (
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
      <SliderPrimitive.Thumb
        className={cn(
          'block h-[18px] w-[18px] rounded-full border-2 border-surface-3 shadow-md transition-transform hover:scale-110 focus-visible:outline-none',
          colors.thumb
        )}
      />
    </SliderPrimitive.Root>
  )
})
Slider.displayName = SliderPrimitive.Root.displayName

export { Slider }
