import * as React from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from './button'

/**
 * 묶음 좌우 단추(글자 문지르기 판). 이름은 가운데, 옆에 작게 몇째인지. 끝이면 그쪽 단추가 꺼진다.
 * 판 끝에서 더 당겨 넘기는 손짓은 판이 하고, 이 부품은 단추와 이름만.
 */
export function PagerBar({ index, count, label, onPrev, onNext, className, ...props }: {
  index: number
  count: number
  label: React.ReactNode
  onPrev: () => void
  onNext: () => void
  className?: string
} & React.HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="pager-bar" className={cn('flex min-h-10 items-center', className)} {...props}>
    <Button variant="ghost" size="icon" onClick={onPrev} disabled={index <= 0} aria-label="앞 묶음" data-testid="pager-prev"><ChevronLeft aria-hidden="true" /></Button>
    <span className="flex min-w-0 flex-1 items-baseline justify-center gap-2 truncate text-14 font-bold" aria-live="polite">
      <span className="truncate">{label}</span>
      <span className="text-11 font-medium tabular-nums text-text-dim-4">{index + 1}/{count}</span>
    </span>
    <Button variant="ghost" size="icon" onClick={onNext} disabled={index >= count - 1} aria-label="다음 묶음" data-testid="pager-next"><ChevronRight aria-hidden="true" /></Button>
  </div>
}
