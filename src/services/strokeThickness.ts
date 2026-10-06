import type { StrokeDataV2 } from '../types'
import { PEN_DEFAULT_THICKNESS } from './penJamo'

/**
 * 획마다 굵기. 저장값은 획의 `thickness`(0–1) 그대로이고, 화면은 그 획의 기본 굵기에 대한 %로 보인다.
 * 기본 굵기는 프리셋의 같은 획 값이다. 프리셋에 없는 획(그은 획 · 넣은 획)은 펜 기본값.
 * 전역 굵기는 이 위에 곱해진다(`thickness × weightMultiplier`) — 여기서는 저장값만 다룬다.
 */
export const STROKE_THICKNESS_PERCENT = { min: 50, max: 200, step: 5, base: 100 } as const

const SAME = 1e-6

export function baseStrokeThickness(baseStrokes: readonly Pick<StrokeDataV2, 'id' | 'thickness'>[], strokeId: string): number {
  return baseStrokes.find((stroke) => stroke.id === strokeId)?.thickness ?? PEN_DEFAULT_THICKNESS
}

/** 기본 굵기에 대한 %(정수). 막대 범위 밖의 옛 저장값도 그대로 읽는다. */
export function thicknessPercent(thickness: number, base: number): number {
  return Math.round(thickness / base * 100)
}

/** 막대의 %를 저장 굵기로. 범위 밖 요청은 끝에서 멈춘다. */
export function thicknessAtPercent(percent: number, base: number): number {
  const clamped = Math.min(STROKE_THICKNESS_PERCENT.max, Math.max(STROKE_THICKNESS_PERCENT.min, percent))
  return clamped === STROKE_THICKNESS_PERCENT.base ? base : base * clamped / 100
}

export function isBaseThickness(thickness: number, base: number): boolean {
  return Math.abs(thickness - base) < SAME
}
