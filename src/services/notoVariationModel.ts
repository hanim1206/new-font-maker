/**
 * 변화량 모델(`build_variation_model.py` v1/v2)의 예측기.
 * 예측 = 층 대표값 + 첫닿·홀자·받침 주효과 + (v2) 자모쌍 셀 보정. 단위는 1000u.
 * 서버 API(notoCorpusApi)와 획 마스터 fit이 같은 수식을 쓰도록 여기 한 곳에 둔다.
 */

export const NOTO_MODEL_SCHEMAS = ['noto-variation-model-v1', 'noto-variation-model-v2'] as const
export const MODEL_NO_FINAL = '∅'

export interface VariationInteractionCell { cell: [string, string]; term: number }
export interface VariationInteraction { applied: boolean; pair?: string; cells?: VariationInteractionCell[] }
export interface VariationLayer {
  representative: number
  effects: Record<'initial' | 'medial' | 'final', Record<string, number>>
  defaultThreshold: number
  confidence: 'low' | 'normal'
  interaction?: VariationInteraction
}
export interface VariationModel {
  schema: string
  stageKeys: Record<string, string>
  targets: Record<string, { layers: Record<string, VariationLayer> }>
}

/** 예측에 필요한 최소 identity. src-next의 CorpusIdentity와 구조 호환. */
export interface ModelIdentity {
  initialJamo: string
  medialJamo: string
  finalJamo: string | null
  contextId: string
}

export interface ModelPrediction {
  target: string
  layer: string
  representative: number
  effects: { initial: number; medial: number; final: number }
  cellTerm: number
  cell: string | null
  /** 1000u */
  predicted: number
  threshold: number
  confidence: 'low' | 'normal'
}

export function isVariationModel(value: unknown): value is VariationModel {
  const candidate = value as Partial<VariationModel> | null
  return Boolean(candidate && typeof candidate === 'object' && typeof candidate.schema === 'string'
    && (NOTO_MODEL_SCHEMAS as readonly string[]).includes(candidate.schema) && candidate.targets && typeof candidate.targets === 'object')
}

/** 자모쌍 셀 보정항. v2 층의 interaction이 이 글자 자모쌍에 걸리면 그 값, 아니면 0. */
export function cellCorrection(layer: VariationLayer, identity: ModelIdentity): { term: number; cell: string | null } {
  const interaction = layer.interaction
  if (!interaction?.applied || !interaction.pair || !interaction.cells) return { term: 0, cell: null }
  const level: Record<string, string> = { initial: identity.initialJamo, medial: identity.medialJamo, final: identity.finalJamo ?? MODEL_NO_FINAL }
  const [factorA, factorB] = interaction.pair.split('×')
  const match = interaction.cells.find((entry) => entry.cell[0] === level[factorA] && entry.cell[1] === level[factorB])
  return match ? { term: match.term, cell: match.cell.join('×') } : { term: 0, cell: null }
}

/** 한 타깃의 예측. 이 글자 문맥(contextId) 층이 없으면 null. */
export function predictNotoTarget(model: VariationModel, target: string, identity: ModelIdentity): ModelPrediction | null {
  const layer = model.targets[target]?.layers[identity.contextId]
  if (!layer) return null
  const effects = {
    initial: layer.effects.initial[identity.initialJamo] ?? 0,
    medial: layer.effects.medial[identity.medialJamo] ?? 0,
    final: layer.effects.final[identity.finalJamo ?? MODEL_NO_FINAL] ?? 0,
  }
  const { term, cell } = cellCorrection(layer, identity)
  return {
    target, layer: identity.contextId, representative: layer.representative, effects, cellTerm: term, cell,
    predicted: layer.representative + effects.initial + effects.medial + effects.final + term,
    threshold: layer.defaultThreshold, confidence: layer.confidence,
  }
}

/** 홀자별 역할 구성. corpus 전수(11,172자)에서 예외 없이 이 조합만 나온다. */
export const MEDIAL_ROLE_SETS: Readonly<Record<string, readonly string[]>> = {
  ㅏ: ['outerPillar', 'primaryBeam'], ㅓ: ['outerPillar', 'primaryBeam'], ㅢ: ['outerPillar', 'primaryBeam'],
  ㅐ: ['innerPillar', 'outerPillar', 'primaryBeam'], ㅔ: ['innerPillar', 'outerPillar', 'primaryBeam'],
  ㅑ: ['lowerBeam', 'outerPillar', 'upperBeam'], ㅕ: ['lowerBeam', 'outerPillar', 'upperBeam'],
  ㅒ: ['innerPillar', 'lowerBeam', 'outerPillar', 'upperBeam'], ㅖ: ['innerPillar', 'lowerBeam', 'outerPillar', 'upperBeam'],
  ㅗ: ['baseStem', 'primaryBeam'], ㅜ: ['baseStem', 'primaryBeam'],
  ㅛ: ['leftStem', 'primaryBeam', 'rightStem'], ㅠ: ['leftStem', 'primaryBeam', 'rightStem'],
  ㅡ: ['primaryBeam'], ㅣ: ['outerPillar'],
  ㅘ: ['baseStem', 'lowerBeam', 'outerPillar', 'upperBeam'], ㅝ: ['baseStem', 'lowerBeam', 'outerPillar', 'upperBeam'],
  ㅙ: ['baseStem', 'innerPillar', 'lowerBeam', 'outerPillar', 'upperBeam'], ㅞ: ['baseStem', 'innerPillar', 'lowerBeam', 'outerPillar', 'upperBeam'],
  ㅚ: ['baseStem', 'outerPillar', 'primaryBeam'], ㅟ: ['baseStem', 'outerPillar', 'primaryBeam'],
}

/** 역할 기하는 corpus 전수에서 상수다: 줄기·기둥은 세로·오른면, 보는 가로·윗면. */
export function medialRoleGeometry(roleId: string): { orientation: 'vertical' | 'horizontal'; faceSide: 'right' | 'top' } {
  return roleId.endsWith('Beam') ? { orientation: 'horizontal', faceSide: 'top' } : { orientation: 'vertical', faceSide: 'right' }
}
