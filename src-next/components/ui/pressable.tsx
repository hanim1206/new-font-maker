import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * 누를 수 있는 내용 덩어리(카드 · 글자 칸 · 목록 줄 · 그림 칸). 브라우저 단추 생김새만 지운 `<button type="button">`.
 * 생김새는 화면 CSS가 토큰으로 그린다 — 단추처럼 보이는 것(글자 · 아이콘 단추)은 여기 말고 `Button`을 쓴다.
 */
export const Pressable = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(({ className, type = 'button', ...props }, ref) => (
  <button
    ref={ref}
    type={type}
    className={cn('cursor-pointer appearance-none border-0 bg-transparent p-0 text-inherit [font:inherit] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-default', className)}
    {...props}
  />
))
Pressable.displayName = 'Pressable'
