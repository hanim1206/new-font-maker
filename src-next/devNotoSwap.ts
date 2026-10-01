import { create } from 'zustand'

/**
 * 개발 서버 전용 — 검수 격자의 글자를 노토 산스 KR(같은 굵기)로 바꿔 그려 우리 글자와 견준다.
 * 프로덕션에서는 쓰는 쪽 분기(`import.meta.env.DEV`)가 사라져 항상 꺼져 있다.
 */
export const useDevNotoSwap = create<{ on: boolean; toggle: () => void }>((set) => ({
  on: false,
  toggle: () => set((state) => ({ on: !state.on })),
}))

/** 노토 산스 KR 가변 폰트(100~900)를 한 번만 불러온다 — 구글 폰트, 개발 확인용. */
export function ensureDevNotoFont(): void {
  if (document.getElementById('dev-noto-font')) return
  const link = document.createElement('link')
  link.id = 'dev-noto-font'
  link.rel = 'stylesheet'
  link.href = 'https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@100..900&display=swap'
  document.head.appendChild(link)
}
