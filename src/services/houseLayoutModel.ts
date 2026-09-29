/**
 * 하우스 레이아웃 모델(프리셋 v2 이후). 플랜 `docs/plans/2026-09-29_하우스-레이아웃-프리셋-편집기.md`.
 *
 * 파일에는 레이아웃별 대푯값을 **절대값**(1000u)으로 전부 적는다. 노토와의 차이로 적지 않는다.
 * 자소별 효과 · 짝 칸은 아직 노토 측정값을 빌려 쓰고, 파일의 `effectsSource`가 그 사실을 적어 둔다(다음 플랜에서 우리 규칙으로 바꾼다).
 * 서버 · 브라우저 · 테스트가 같이 쓰므로 DOM · 스토어를 가져오지 않는다.
 */
import type { VariationModel } from './notoVariationModel'
import type { FontPresetId } from '../types/database'

export const HOUSE_LAYOUT_SCHEMA = 'house-layout-model-v1'
/** `public/` 아래 자리. 파일 이름 = 프리셋 id. */
export const HOUSE_PRESET_DIRECTORY = 'house-preset'
export const houseLayoutFile = (preset: FontPresetId) => `${HOUSE_PRESET_DIRECTORY}/${preset}.json`

/** 사용자가 손댄 대푯값 한 줄. 노토값은 비교용으로만 적는다. */
export interface HouseAuthoredValue {
  target: string
  layer: string
  noto: number
  value: number
  at: string
}

export interface HouseLayoutModel {
  schema: typeof HOUSE_LAYOUT_SCHEMA
  preset: FontPresetId
  updatedAt: string
  /** 자소별 효과 · 짝 칸의 출처. 아직 노토 측정값이다. */
  effectsSource: 'noto-measured'
  /** 타깃 → 레이아웃(문맥 칸) → 대푯값(1000u). 모든 타깃 · 레이아웃을 빠짐없이 적는다. */
  representatives: Record<string, Record<string, number>>
  /** 노토와 다른 대푯값만. 순서는 타깃 · 레이아웃. */
  authored: HouseAuthoredValue[]
}

export function isHouseLayoutModel(value: unknown): value is HouseLayoutModel {
  const candidate = value as Partial<HouseLayoutModel> | null
  if (!candidate || typeof candidate !== 'object' || candidate.schema !== HOUSE_LAYOUT_SCHEMA) return false
  if (typeof candidate.preset !== 'string' || typeof candidate.updatedAt !== 'string' || candidate.effectsSource !== 'noto-measured') return false
  if (!candidate.representatives || typeof candidate.representatives !== 'object' || !Array.isArray(candidate.authored)) return false
  return Object.values(candidate.representatives).every((layers) => layers && typeof layers === 'object'
    && Object.values(layers).every((value) => typeof value === 'number' && Number.isFinite(value)))
}

/** 노토 모델의 대푯값을 그대로 옮겨 적은 첫 파일. */
export function houseLayoutFromNoto(model: VariationModel, preset: FontPresetId, at: string): HouseLayoutModel {
  const representatives: HouseLayoutModel['representatives'] = {}
  for (const [target, { layers }] of Object.entries(model.targets)) {
    representatives[target] = Object.fromEntries(Object.entries(layers).map(([layer, entry]) => [layer, entry.representative]))
  }
  return { schema: HOUSE_LAYOUT_SCHEMA, preset, updatedAt: at, effectsSource: 'noto-measured', representatives, authored: [] }
}

/**
 * 노토 모델에 하우스 대푯값을 끼운 모델. 효과 · 짝 칸은 노토 것 그대로다.
 * 하우스 파일에 없는 타깃 · 레이아웃은 노토 대푯값을 쓴다(노토 모델이 늘어도 깨지지 않게).
 */
export function withHouseRepresentatives(model: VariationModel, house: HouseLayoutModel): VariationModel {
  const targets: VariationModel['targets'] = {}
  for (const [target, { layers }] of Object.entries(model.targets)) {
    const own = house.representatives[target] ?? {}
    targets[target] = {
      layers: Object.fromEntries(Object.entries(layers).map(([layer, entry]) => {
        const value = own[layer]
        return [layer, typeof value === 'number' && Number.isFinite(value) ? { ...entry, representative: value } : entry]
      })),
    }
  }
  return { ...model, targets }
}

const round = (value: number) => Math.round(value * 1000) / 1000

/**
 * 대푯값 하나를 바꾼 새 파일. 노토와 같아지면 `authored`에서 빠진다. 값은 1000u 소수 셋째 자리까지.
 * 없는 타깃 · 레이아웃이면 그대로 돌려준다.
 */
export function withRepresentative(house: HouseLayoutModel, noto: VariationModel, target: string, layer: string, value: number, at: string): HouseLayoutModel {
  const notoValue = noto.targets[target]?.layers[layer]?.representative
  if (notoValue === undefined || !Number.isFinite(value)) return house
  const next = round(value)
  const representatives = { ...house.representatives, [target]: { ...house.representatives[target], [layer]: next } }
  const others = house.authored.filter((entry) => entry.target !== target || entry.layer !== layer)
  const authored = Math.abs(next - notoValue) < 0.0005 ? others : [...others, { target, layer, noto: round(notoValue), value: next, at }]
  authored.sort((a, b) => a.target.localeCompare(b.target) || a.layer.localeCompare(b.layer))
  return { ...house, updatedAt: at, representatives, authored }
}

/** 파일 내용. 사람이 diff로 읽을 수 있게 들여 쓴다. */
export function serializeHouseLayout(house: HouseLayoutModel): string {
  return `${JSON.stringify(house, null, 2)}\n`
}
