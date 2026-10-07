import { useEffect } from 'react'

const SERVICE_NAME = '한글칸글'

/** 브라우저 탭 제목. 화면 이름이 있으면 `이름 · 한글칸글`, 없으면 서비스 이름만. */
export function pageTitleOf(name: string | null | undefined): string {
  const trimmed = name?.trim()
  return trimmed ? `${trimmed} · ${SERVICE_NAME}` : SERVICE_NAME
}

/** 이 화면이 떠 있는 동안 탭 제목을 바꾼다. */
export function usePageTitle(name: string | null | undefined): void {
  useEffect(() => { document.title = pageTitleOf(name) }, [name])
}
