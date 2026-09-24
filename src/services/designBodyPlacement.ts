import type { BoxConfig, Padding } from '../types'

/**
 * Noto 모델 상자는 기본 네모꼴 기준의 em 좌표다. 기본 네모꼴 = Noto 여섯 레이아웃 잉크의 합집합(840 × 910).
 * 여백은 위 50 · 아래 40 · 왼 50 · 오른 110. 오른쪽이 넓은 건 Noto 한글이 글자 칸 왼쪽으로 치우쳐 앉아서다(데이터 그대로).
 * 사용자가 네모꼴을 바꾸면 그 기준 틀을 사용자 틀로 옮기는 선형 변환을 상자에 얹는다 — 틀을 줄이면 글자도 같이 준다.
 * 중심선 상자만 옮기므로 획 두께는 그대로다(원칙: 두께는 고정). 기본 네모꼴에서는 아무것도 바꾸지 않는다.
 * 2026-09-24 이전의 기본 네모꼴은 850 정네모(사방 0.075)였다. 그때 저장된 값은 `normalizeReferencePadding`이 새 기본으로 읽는다.
 */
export const REFERENCE_BODY_PADDING: Padding = { top: 0.05, bottom: 0.04, left: 0.05, right: 0.11 }
export const LEGACY_REFERENCE_BODY_PADDING: Padding = { top: 0.075, bottom: 0.075, left: 0.075, right: 0.075 }

const EPSILON = 1e-9
const SIDES = ['top', 'bottom', 'left', 'right'] as const
export const REFERENCE_WIDTH = 1 - REFERENCE_BODY_PADDING.left - REFERENCE_BODY_PADDING.right
export const REFERENCE_HEIGHT = 1 - REFERENCE_BODY_PADDING.top - REFERENCE_BODY_PADDING.bottom

const samePadding = (a: Padding, b: Padding) => SIDES.every((side) => Math.abs(a[side] - b[side]) < EPSILON)

export function isReferenceBody(padding: Padding | undefined): boolean {
  if (!padding) return true
  return samePadding(padding, REFERENCE_BODY_PADDING)
}

/** 옛 기본 네모꼴(사방 0.075)로 저장된 여백은 "기본"이라는 뜻이므로 새 기본으로 읽는다. 그 외는 그대로. */
export function normalizeReferencePadding(padding: Padding): Padding {
  return samePadding(padding, LEGACY_REFERENCE_BODY_PADDING) ? { ...REFERENCE_BODY_PADDING } : padding
}

/**
 * 가로 · 세로 크기로 여백을 만든다. 남는 칸은 기본 네모꼴의 여백 비율(왼 50 : 오른 110, 위 50 : 아래 40)로 나눈다.
 * 그래서 기본 크기로 돌아오면 정확히 기본 네모꼴이 되고, 글자는 Noto와 같은 자리에 앉는다.
 */
export function designBodyPaddingForSize(width: number, height: number, fontSpace: { width: number; height: number }): Padding {
  const spareX = Math.max(0, fontSpace.width - width) / fontSpace.width
  const spareY = Math.max(0, fontSpace.height - height) / fontSpace.height
  const ratioX = REFERENCE_BODY_PADDING.left / (REFERENCE_BODY_PADDING.left + REFERENCE_BODY_PADDING.right)
  const ratioY = REFERENCE_BODY_PADDING.top / (REFERENCE_BODY_PADDING.top + REFERENCE_BODY_PADDING.bottom)
  return { left: spareX * ratioX, right: spareX * (1 - ratioX), top: spareY * ratioY, bottom: spareY * (1 - ratioY) }
}

export function designBodyScale(padding: Padding): { x: number; y: number } {
  return { x: (1 - padding.left - padding.right) / REFERENCE_WIDTH, y: (1 - padding.top - padding.bottom) / REFERENCE_HEIGHT }
}

/** 기준 틀 안의 상자를 사용자 네모꼴 안의 같은 비율 자리로 옮긴다. */
export function mapBoxToDesignBody(box: BoxConfig, padding: Padding | undefined): BoxConfig {
  if (!padding || isReferenceBody(padding)) return box
  const scale = designBodyScale(padding)
  return {
    x: padding.left + (box.x - REFERENCE_BODY_PADDING.left) * scale.x,
    y: padding.top + (box.y - REFERENCE_BODY_PADDING.top) * scale.y,
    width: box.width * scale.x,
    height: box.height * scale.y,
  }
}

/** 기준 틀 좌표로 그린 SVG 요소(Noto 고스트 등)를 사용자 네모꼴로 옮기는 transform. 기본 네모꼴이면 undefined. */
export function designBodySvgTransform(padding: Padding | undefined, viewBoxSize: number): string | undefined {
  if (!padding || isReferenceBody(padding)) return undefined
  const scale = designBodyScale(padding)
  const tx = (padding.left - REFERENCE_BODY_PADDING.left * scale.x) * viewBoxSize
  const ty = (padding.top - REFERENCE_BODY_PADDING.top * scale.y) * viewBoxSize
  return `translate(${tx} ${ty}) scale(${scale.x} ${scale.y})`
}

/** 잉크 바깥면(네 변)도 같은 변환으로 옮긴다. 화면의 부품 상자 표시용. */
export function mapFacesToDesignBody<T extends { left: number; right: number; top: number; bottom: number }>(faces: T, padding: Padding | undefined): T {
  if (!padding || isReferenceBody(padding)) return faces
  const scale = designBodyScale(padding)
  const x = (value: number) => padding.left + (value - REFERENCE_BODY_PADDING.left) * scale.x
  const y = (value: number) => padding.top + (value - REFERENCE_BODY_PADDING.top) * scale.y
  return { ...faces, left: x(faces.left), right: x(faces.right), top: y(faces.top), bottom: y(faces.bottom) }
}
