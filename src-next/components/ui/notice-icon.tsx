/** 알림 · 토스트 왼쪽의 꽉 찬 동그라미 아이콘(토스식). 안의 표시는 뚫려 있어 바탕색이 비친다. 색은 `currentColor`. */
export function NoticeIcon({ tone, className }: { tone: 'info' | 'error' | 'done'; className?: string }) {
  const mark = tone === 'error'
    ? 'M10.8 6.5h2.4v7h-2.4zM12 15.1a1.45 1.45 0 1 1 0 2.9a1.45 1.45 0 1 1 0-2.9z'
    : tone === 'done'
      ? 'M7.2 12.3l1.7-1.7l2.1 2.1l4.2-4.2l1.7 1.7l-5.9 5.9z'
      : 'M10.8 10.5h2.4v6.5h-2.4zM12 6.2a1.45 1.45 0 1 1 0 2.9a1.45 1.45 0 1 1 0-2.9z'
  return <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
    <path fill="currentColor" fillRule="evenodd" d={`M12 2a10 10 0 1 1 0 20a10 10 0 1 1 0-20z${mark}`} />
  </svg>
}
