import { dotToLook, LOOK_WALL, lookOf, lookToDot, type DotKey, type Look } from './moldLab'
import { LAYOUT_CONTEXT_IDS, LAYOUT_CONTEXT_LABEL, SAMPLE_BATCHES } from './reviewPropagation'

/**
 * 글자 문지르기 판(하니무스 2026-11-27, 인상 잡기 도트판 대신). 시안 study/font-key/rub/.
 * 왼쪽 세로 휠로 속성 하나를 고르고, 아래 눈금 섬으로 그 값만 바꾼다. 글자 판은 묶음마다 고정 격자를 보는 창이다.
 * 이 파일은 값 눈금과 창 계산만(화면 없음). 화면은 `MoldRubPlate.tsx`.
 */

/** 속성 여덟: 엔진 판 일곱 + 네모 ↔ 탈네모(부엉이 추천, 하니무스 "ㅇㅇ구현"). 폭 · 키는 따로(`frame` · `height`). */
export const RUB_KEYS = ['weight', 'open', 'jamo', 'center', 'round', 'contrast', 'frame', 'height'] as const
export type RubKey = (typeof RUB_KEYS)[number]
export const RUB_ROWS = 20

export const RUB_NAMES: Record<RubKey, string> = { weight: '굵기', open: '탈네모', jamo: '닿자 크기', center: '무게중심', round: '둥글기', contrast: '대비', frame: '폭', height: '키' }
export const RUB_ENDS: Record<RubKey, readonly [string, string]> = {
  weight: ['가늘게', '굵게'], open: ['네모', '탈네모'], jamo: ['작게', '크게'], center: ['낮게', '높게'],
  round: ['각지게', '둥글게'], contrast: ['같게', '가로 가늘게'], frame: ['좁게', '넓게'], height: ['낮게', '높게'],
}

/**
 * 키(`height`)는 도트판에 없던 값이라 눈금이 없다. 임시 눈금: 칸 0 = 0.8배 · 칸 10 = 엔진 · 칸 20 = 1.2배.
 * 폰트에서 잰 값이 아니다(가설). 벽 `LOOK_WALL.height` 안.
 */
export const HEIGHT_SCALE = [0.8, 1, 1.2] as const

const isDot = (key: RubKey): key is RubKey & DotKey => key !== 'height'

/** 칸(0~20, 소수 가능) → 엔진 값. */
export function rubToLook(key: RubKey, k: number): number {
  const t = Math.max(0, Math.min(RUB_ROWS, k))
  if (isDot(key)) return dotToLook(key, t)
  const [lo, mid, hi] = HEIGHT_SCALE, half = RUB_ROWS / 2
  const value = t <= half ? lo + (mid - lo) * t / half : mid + (hi - mid) * (t - half) / half
  return Math.max(LOOK_WALL.height[0], Math.min(LOOK_WALL.height[1], value))
}
/** 엔진 값 → 가장 가까운 칸. */
export function lookToRub(key: RubKey, value: number): number {
  if (isDot(key)) return lookToDot(key, value)
  let best = 0, gap = Infinity
  for (let k = 0; k <= RUB_ROWS; k++) { const d = Math.abs(rubToLook(key, k) - value); if (d < gap - 1e-9) { gap = d; best = k } }
  return best
}
export const rubOf = (look: Look, key: RubKey) => lookToRub(key, lookOf(look, key))

/**
 * 한 값만 칸 k로. 처음 값(`home`)의 칸으로 돌아오면 처음 값 그대로 쓴다(칸 값으로 반올림하지 않는다, 도트판과 같음).
 * 다른 값은 건드리지 않는다(하니무스 2026-11-21 "각 좌표는 절댓값만").
 */
export function setRub(look: Look, home: Look, key: RubKey, k: number): Look {
  const out: Look = { ...look }
  if (k === lookToRub(key, lookOf(home, key))) { if (home[key] === undefined) delete out[key]; else out[key] = home[key] }
  else out[key] = rubToLook(key, k)
  return out
}

/** 주사위: 여덟 값을 칸 1~19 사이에서 아무렇게나(양 끝 벽은 피함). 출발점일 뿐 정답이 아니다. */
export function rollRub(look: Look, home: Look, random: () => number = Math.random, locks: Partial<Record<RubKey, number>> = {}): Look {
  let out = look
  for (const key of RUB_KEYS) out = setRub(out, home, key, Math.min(locks[key] ?? RUB_ROWS, 1 + Math.floor(random() * (RUB_ROWS - 1))))
  return out
}

// ── 묶음: 레이아웃 여섯 칸의 고른 글자(`SAMPLE_BATCHES`), 묶음마다 8열 × 3행 고정 격자 ──
export interface RubBatch { id: string; name: string; rows: string[][] }
export const RUB_BATCHES: RubBatch[] = LAYOUT_CONTEXT_IDS.map((id) => ({ id, name: LAYOUT_CONTEXT_LABEL[id], rows: (SAMPLE_BATCHES[id] ?? []).map((row) => [...row]) }))
export const batchCols = (batch: RubBatch) => Math.max(...batch.rows.map((row) => row.length))

// ── 창: 확대 = 한 화면에 보이는 열 수(1~4). 창만 움직이고 글자 자리는 그대로 ──
export const ZOOM_MIN = 1
export const ZOOM_MAX = 4
/** 끝에서 이만큼(칸) 더 당겼다 놓으면 옆 묶음. */
export const EDGE_PULL = 0.55

export interface RubView { cell: number; visRows: number; maxX: number; maxY: number }
export function rubView(cols: number, rows: number, zoom: number, width: number, height: number): RubView {
  const cell = width / zoom
  const visRows = height / cell
  return { cell, visRows, maxX: Math.max(0, cols - zoom), maxY: Math.max(0, rows - visRows) }
}
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
/** 끝 밖으로 끌면 끈 만큼의 0.3만 간다(고무줄). */
export const soft = (v: number, a: number, b: number) => (v < a ? a - (a - v) * 0.3 : v > b ? b + (v - b) * 0.3 : v)

/** 놓을 때: 빠르게 밀었으면 그 속도만큼 더(최대 2.5칸), 칸에 앉힌다. 여러 칸 넘기기가 된다. */
export function settle(cam: number, velocity: number, max: number, still: boolean): number {
  const fling = still ? 0 : clamp(velocity * 0.16, -2.5, 2.5)
  return clamp(Math.round(cam + fling), 0, max)
}

/** 톡: 한 단계 확대(열 하나 줄임). 누른 칸이 창 안에 남도록 창을 옮긴다. */
export function tapZoom(zoom: number, cam: { x: number; y: number }, at: { c: number; r: number }, cols: number, rows: number, width: number, height: number) {
  if (zoom <= ZOOM_MIN) return null
  const next = zoom - 1, view = rubView(cols, rows, next, width, height)
  const x = clamp(at.c - Math.floor((at.c - Math.round(cam.x)) * next / zoom + 0.001), 0, view.maxX)
  const y = clamp(at.r - Math.floor((at.r - Math.round(cam.y)) * next / zoom + 0.001), 0, view.maxY)
  return { zoom: next, cam: { x, y } }
}

/** 확대 단계를 바꾸며 가운데(c, r)를 붙든다. 오므리기 · 축소 단추가 같이 쓴다. */
export function zoomAround(zoom: number, centre: { c: number; r: number }, cols: number, rows: number, width: number, height: number) {
  const next = clamp(Math.round(zoom), ZOOM_MIN, ZOOM_MAX), view = rubView(cols, rows, next, width, height)
  return { zoom: next, cam: { x: clamp(Math.round(centre.c - next / 2), 0, view.maxX), y: clamp(Math.round(centre.r - view.visRows / 2), 0, view.maxY) } }
}

/** 옆으로 끌 때 끝을 넘은 양(칸). 끝에 앉아 있던 채로 시작했을 때만 센다 — 넘기다 끝에 닿은 것은 묶음을 안 바꾼다. */
export function edgeOver(raw: number, startCam: number, max: number): number {
  if (raw > max && startCam >= max - 0.02) return raw - max
  if (raw < 0 && startCam <= 0.02) return raw
  return 0
}
