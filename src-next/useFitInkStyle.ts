import { useMemo } from 'react'
import type { FitInkStyle } from '../src/services/notoComponentFit'
import { useGlobalStyleStore } from '../src/stores/globalStyleStore'

/** 검수 캔버스·카드가 fit 잉크를 그릴 때 쓰는 글로벌 끝 모양. 자소 탭 렌더와 같은 값이라 두 화면 획이 같은 폰트로 보인다. */
export function useFitInkStyle(): FitInkStyle {
  const linecap = useGlobalStyleStore((state) => state.style.linecap)
  const linejoin = useGlobalStyleStore((state) => state.style.linejoin)
  const strokeStyle = useGlobalStyleStore((state) => state.style.strokeStyle)
  return useMemo(() => ({ linecap, linejoin, strokeStyle }), [linecap, linejoin, strokeStyle])
}
