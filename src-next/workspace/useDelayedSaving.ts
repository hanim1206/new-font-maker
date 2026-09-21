import { useEffect, useState } from 'react'

/**
 * 저장이 금방 끝나면 `저장 중` 표시가 깜빡이기만 한다.
 * `delay`보다 오래 걸릴 때만 참이 되어, 흐림과 토스트가 같은 시점에 함께 켜진다.
 */
export function useDelayedSaving(saving: boolean, delay = 300): boolean {
  const [late, setLate] = useState(false)
  useEffect(() => {
    if (!saving) {
      setLate(false)
      return
    }
    const timer = window.setTimeout(() => setLate(true), delay)
    return () => window.clearTimeout(timer)
  }, [saving, delay])
  return late
}
