import type { CorpusFont, CorpusIdentity, CorpusStage, RawCorpusOutline } from './notoCorpus'

/** `export_noto_preset.py` 산출물(글자별 Noto 윤곽 + 0~1 역할면 기준선)의 계약. 서버 API와 클라이언트가 함께 쓴다. */
export const NOTO_PRESET_SCHEMA = 'noto-preset-outlines-v1'

export interface NotoPresetGlyph {
  identity: CorpusIdentity
  outline: RawCorpusOutline & { inkBounds?: { left: number; right: number; top: number; bottom: number } | null }
  /** 0~1 역할면 기준선. 측정이 있는 타깃만. */
  baselines: Record<string, number>
}

/** 검수 화면이 획 마스터를 fit할 때 쓰는 모델 묶음. 변화량 모델은 예측에 필요한 필드만 남긴다. */
export const NOTO_PRESET_MODEL_SCHEMA = 'noto-preset-model-v1'
export interface NotoPresetModelBundle {
  schema: typeof NOTO_PRESET_MODEL_SCHEMA
  stageKeys: Record<CorpusStage, string>
  model: {
    schema: string
    stageKeys: Record<string, string>
    targets: Record<string, { layers: Record<string, {
      representative: number
      effects: Record<'initial' | 'medial' | 'final', Record<string, number>>
      defaultThreshold: number
      confidence: 'low' | 'normal'
      interaction?: { applied: boolean; pair?: string; cells?: { cell: [string, string]; term: number }[] }
    }> }>
  }
  /** 홀자 → 역할 → 대표 두께(em 비율). corpus 전수 중앙값. */
  thickness: Record<string, Record<string, number>>
}

export interface NotoPresetManifest {
  schema: typeof NOTO_PRESET_SCHEMA
  font: CorpusFont
  stageKeys: Record<CorpusStage, string>
  coordinateFrame: string
  glyphCount: number
  runId: string
  updatedAt: string
  /** 모델·두께 파일 버전. 바뀌면 클라이언트가 모델 묶음을 다시 받는다. */
  modelKey?: string
}
