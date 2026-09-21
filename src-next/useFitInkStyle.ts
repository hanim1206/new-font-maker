import { useMemo } from 'react'
import type { FitInkStyle } from '../src/services/notoComponentFit'
import { useEffectiveGlobalStyle } from '../src/stores/globalStyleStore'
import type { LayoutType } from '../src/types'
import { weightToMultiplier } from '../src/utils/globalStyleUtils'

/**
 * 검수 캔버스·카드가 fit 잉크를 그릴 때 쓰는 글로벌 끝 모양과 굵기. 자소 탭 렌더와 같은 값이라 두 화면 획이 같은 폰트로 보인다.
 * 기울기는 일부러 안 읽는다 — 레이아웃 편집의 보선은 직각이라 글자만 기울면 보선과 어긋난다.
 */
export function useFitInkStyle(layoutType: LayoutType): FitInkStyle {
  const { linecap, linejoin, strokeStyle, weight } = useEffectiveGlobalStyle(layoutType)
  return useMemo(() => ({ linecap, linejoin, strokeStyle, weightMultiplier: weightToMultiplier(weight) }), [linecap, linejoin, strokeStyle, weight])
}
