import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** shadcn 부품의 클래스 합치기. 뒤에 온 Tailwind 클래스가 이긴다. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
