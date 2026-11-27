import { createContext, useContext } from 'react'
import type { PenPoint } from '../src/services/penStrokeFit'
import { useGlobalStyleStore } from '../src/stores/globalStyleStore'
import { useJamoStore } from '../src/stores/jamoStore'
import type { BrushStyle, JamoData, StrokeRenderStyle } from '../src/types'
import { layoutDeltaSnapshot, useLayoutDeltaStore, type LayoutDeltaSnapshot } from './layoutDeltaStore'
import type { LayoutEdits, Look } from './moldLab'
import type { StemKind } from './strokeLab'

/**
 * 빚기 원본(하니무스 2026-11-21 "각 좌표는 객관적인 절댓값만"): 처음 써 넣기 직전의 저장소를 떠 둔다.
 * 화면은 늘 원본 + 판 값으로 그리고, 써 넣기는 원본으로 되돌린 뒤 판 값을 한 번만 얹는다.
 * 그래서 써 넣은 뒤에도 판은 제자리에 남고, 다시 움직여 써 넣어도 저장된 모양 위에 또 얹히지 않는다.
 * 써 넣은 뒤 다른 화면에서 저장소를 고치면(도장이 달라지면) 원본은 버린다 — 그 고침을 덮지 않게.
 */
export interface MoldOriginStyle { weight: number; letterSpacing: number; brush: BrushStyle; strokeStyle: StrokeRenderStyle }
export interface MoldSaved { look: Look; edits: LayoutEdits; raws: Partial<Record<StemKind, PenPoint[]>> }
export interface MoldOrigin {
  layout: LayoutDeltaSnapshot
  choseong: Record<string, JamoData>
  jungseong: Record<string, JamoData>
  jongseong: Record<string, JamoData>
  style: MoldOriginStyle
  /** 마지막으로 써 넣은 판 값. 다시 열면 여기서 시작한다. */
  saved: MoldSaved
  /** 마지막으로 써 넣은 직후 저장소의 도장. */
  stamp: string
}

const KEY = 'mold-origin-v1'

/** 저장소(짜임 Δ · 자모) 도장. 문자열 해시(FNV-1a). 굵기 · 자간은 판이 들고 있어 안 넣는다. */
export function storesStamp(): string {
  const jamo = useJamoStore.getState()
  const text = JSON.stringify([useLayoutDeltaStore.getState().rules, jamo.choseong, jamo.jungseong, jamo.jongseong])
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) }
  return `${text.length}:${(h >>> 0).toString(36)}`
}

/** 지금 저장소를 원본으로 뜬다. */
export function captureOrigin(): Omit<MoldOrigin, 'saved' | 'stamp'> {
  const jamo = useJamoStore.getState(), style = useGlobalStyleStore.getState().style
  return {
    layout: layoutDeltaSnapshot(),
    choseong: structuredClone(jamo.choseong), jungseong: structuredClone(jamo.jungseong), jongseong: structuredClone(jamo.jongseong),
    style: structuredClone({ weight: style.weight, letterSpacing: style.letterSpacing, brush: style.brush, strokeStyle: style.strokeStyle }),
  }
}

/** 저장소를 원본으로 되돌린다(짜임 Δ · 자모). 굵기 · 붓 · 자간은 써 넣기가 절댓값으로 다시 쓴다. */
export function restoreOrigin(origin: Omit<MoldOrigin, 'saved' | 'stamp'>): void {
  useLayoutDeltaStore.getState().restore(origin.layout)
  useJamoStore.setState({ choseong: structuredClone(origin.choseong), jungseong: structuredClone(origin.jungseong), jongseong: structuredClone(origin.jongseong) })
}

export function readOrigin(): MoldOrigin | null {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return null
    const value = JSON.parse(raw) as MoldOrigin
    return value && value.layout && value.choseong && value.saved && typeof value.stamp === 'string' ? value : null
  } catch {
    return null
  }
}
export function writeOrigin(origin: MoldOrigin): void {
  try { window.localStorage.setItem(KEY, JSON.stringify(origin)) } catch { /* 저장 공간이 모자라면 원본 없이(예전처럼) 간다 */ }
}
export function dropOrigin(): void {
  try { window.localStorage.removeItem(KEY) } catch { /* 없음 */ }
}

export const MoldOriginContext = createContext<MoldOrigin | null>(null)
export const useMoldOrigin = () => useContext(MoldOriginContext)
