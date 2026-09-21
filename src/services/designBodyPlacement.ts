import type { BoxConfig, Padding } from '../types'

/**
 * Noto 모델 상자는 기본 네모꼴(850 × 850, 사방 여백 0.075) 기준의 em 좌표다.
 * 사용자가 네모꼴을 바꾸면 그 기준 틀을 사용자 틀로 옮기는 선형 변환을 상자에 얹는다 — 틀을 줄이면 글자도 같이 준다.
 * 중심선 상자만 옮기므로 획 두께는 그대로다(원칙: 두께는 고정). 기본 네모꼴에서는 아무것도 바꾸지 않는다.
 */
export const REFERENCE_BODY_PADDING: Padding = { top: 0.075, bottom: 0.075, left: 0.075, right: 0.075 }

const EPSILON = 1e-9
const REFERENCE_WIDTH = 1 - REFERENCE_BODY_PADDING.left - REFERENCE_BODY_PADDING.right
const REFERENCE_HEIGHT = 1 - REFERENCE_BODY_PADDING.top - REFERENCE_BODY_PADDING.bottom

export function isReferenceBody(padding: Padding | undefined): boolean {
  if (!padding) return true
  return (['top', 'bottom', 'left', 'right'] as const).every((side) => Math.abs(padding[side] - REFERENCE_BODY_PADDING[side]) < EPSILON)
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
