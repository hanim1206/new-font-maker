import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/** 글자 크기 단계(`tailwind.config.js` fontSize). 알려 주지 않으면 `text-13`을 글자색으로 보고 `text-text-dim-2`를 지운다. */
const twMerge = extendTailwindMerge({
  extend: { classGroups: { 'font-size': [{ text: ['10', '11', '12', '13', '14', '16', '18', '20', '24', '28', 'micro'] }] } },
})

/** shadcn 부품의 클래스 합치기. 뒤에 온 Tailwind 클래스가 이긴다. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
