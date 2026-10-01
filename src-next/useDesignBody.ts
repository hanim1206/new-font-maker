import { useMemo } from 'react'
import { useLayoutStore } from '../src/stores/layoutStore'
import { isReferenceBody } from '../src/services/designBodyPlacement'
import type { LayoutType, Padding } from '../src/types'

/**
 * 이 레이아웃의 사용자 네모꼴 여백(폰트 전체 + 레이아웃별 덮어쓰기). 문장 줄이 글자에 얹는 것과 같은 값이다.
 * 기본 네모꼴이면 undefined — 레이아웃 캔버스 · 카드는 그때 좌표를 한 번도 안 옮긴다.
 * 값이 같으면 같은 객체를 돌려줘서 받는 쪽 메모가 안 깨진다.
 */
export function useDesignBodyPadding(layoutType: LayoutType): Padding | undefined {
  const global = useLayoutStore((state) => state.globalPadding)
  const override = useLayoutStore((state) => state.paddingOverrides[layoutType])
  return useMemo(() => bodyOf(global, override), [global, override])
}

/** 레이아웃을 여럿 그리는 곳(여섯 칸 표지)용. 레이아웃 → 사용자 네모꼴 여백. */
export function useDesignBodyPaddingOf(): (layoutType: LayoutType) => Padding | undefined {
  const global = useLayoutStore((state) => state.globalPadding)
  const overrides = useLayoutStore((state) => state.paddingOverrides)
  return useMemo(() => (layoutType: LayoutType) => bodyOf(global, overrides[layoutType]), [global, overrides])
}

function bodyOf(global: Padding, override: Partial<Padding> | undefined): Padding | undefined {
  const padding = override ? { ...global, ...override } : global
  return isReferenceBody(padding) ? undefined : padding
}
