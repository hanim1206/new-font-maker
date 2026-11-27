import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * 세로 휠(글자 문지르기 판의 속성 고르기). 굴리면 칸에 앉고, 고른 줄은 맨 위 표시 자리에 선다.
 * 줄마다 이름과 그 밑에 작은 값. 줄을 눌러도 그 줄이 맨 위로 온다. 위아래 화살표 키로도 고른다.
 */
export interface WheelItem { id: string; label: React.ReactNode; detail?: React.ReactNode }

const ROW = 52
/** 고른 줄이 서는 자리(휠 위에서 첫 줄 가운데까지). */
const FOCUS_TOP = 8

export function WheelPicker({ items, value, onValueChange, className, ...props }: {
  items: readonly WheelItem[]
  value: number
  onValueChange: (index: number) => void
  className?: string
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'>) {
  const listRef = React.useRef<HTMLDivElement>(null)
  const [pos, setPos] = React.useState(value)
  const valueRef = React.useRef(value)
  valueRef.current = value
  // 밖에서 값이 바뀌면(주사위 · 처음 값) 휠도 그 줄로. 굴리는 중에 온 같은 값은 무시한다.
  React.useEffect(() => {
    const list = listRef.current
    if (!list || Math.round(list.scrollTop / ROW) === value) return
    list.scrollTo({ top: value * ROW, behavior: 'auto' })
    setPos(value)
  }, [value])
  const onScroll = () => {
    const list = listRef.current
    if (!list) return
    const now = list.scrollTop / ROW
    setPos(now)
    const at = Math.max(0, Math.min(items.length - 1, Math.round(now)))
    if (at !== valueRef.current) onValueChange(at)
  }
  const go = (at: number) => listRef.current?.scrollTo({ top: at * ROW, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  const onKeyDown = (event: React.KeyboardEvent) => {
    const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0
    if (!step) return
    event.preventDefault()
    go(Math.max(0, Math.min(items.length - 1, value + step)))
  }
  return <div data-slot="wheel-picker" className={cn('relative h-full min-h-0 overflow-hidden', className)} {...props}>
    {/* 고른 줄 자리 표시: 위 칸에 옅은 면 + 왼쪽 주색 막대 */}
    <span aria-hidden="true" className="pointer-events-none absolute inset-x-1 rounded-md bg-surface-3" style={{ top: FOCUS_TOP, height: ROW }} />
    <span aria-hidden="true" className="pointer-events-none absolute left-1 w-1 rounded-full bg-primary" style={{ top: FOCUS_TOP + 12, height: ROW - 24 }} />
    <div
      ref={listRef}
      role="listbox"
      aria-orientation="vertical"
      aria-activedescendant={items[value] ? `wheel-${items[value].id}` : undefined}
      tabIndex={0}
      onScroll={onScroll}
      onKeyDown={onKeyDown}
      className="relative h-full snap-y snap-mandatory overflow-y-auto overscroll-contain [scrollbar-width:none] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 [&::-webkit-scrollbar]:hidden"
      style={{ scrollPaddingTop: FOCUS_TOP, paddingTop: FOCUS_TOP, touchAction: 'pan-y' }}
    >
      {items.map((item, at) => {
        const d = Math.abs(at - pos)
        return <div
          key={item.id}
          id={`wheel-${item.id}`}
          role="option"
          aria-selected={at === value}
          data-testid={`wheel-${item.id}`}
          onClick={() => go(at)}
          className={cn('flex cursor-pointer snap-start flex-col justify-center pl-4 pr-1 text-text-dim-4 transition-colors', at === value && 'text-foreground')}
          style={{ height: ROW, opacity: Math.max(0.45, 1 - d * 0.14), transform: `scale(${Math.max(0.88, 1.04 - d * 0.06).toFixed(3)})`, transformOrigin: 'left center' }}
        >
          <span className={cn('truncate text-13 font-semibold', at === value && 'text-14 font-bold')}>{item.label}</span>
          {item.detail !== undefined && <span className={cn('text-12 font-medium tabular-nums', at === value ? 'text-16 font-bold text-primary' : 'text-text-dim-5')}>{item.detail}</span>}
        </div>
      })}
      {/* 마지막 줄도 맨 위 자리까지 올라오게 바닥을 비운다 */}
      <div aria-hidden="true" style={{ height: `calc(100% - ${ROW + FOCUS_TOP}px)` }} />
    </div>
  </div>
}
