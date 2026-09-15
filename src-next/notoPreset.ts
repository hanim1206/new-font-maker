import type { CorpusFont, CorpusIdentity, CorpusStage, RawCorpusOutline } from './notoCorpus'

/** `export_noto_preset.py` 산출물(글자별 Noto 윤곽 + 0~1 역할면 기준선)의 계약. 서버 API와 클라이언트가 함께 쓴다. */
export const NOTO_PRESET_SCHEMA = 'noto-preset-outlines-v1'

export interface NotoPresetGlyph {
  identity: CorpusIdentity
  outline: RawCorpusOutline & { inkBounds?: { left: number; right: number; top: number; bottom: number } | null }
  /** 0~1 역할면 기준선. 측정이 있는 타깃만. */
  baselines: Record<string, number>
}

export interface NotoPresetManifest {
  schema: typeof NOTO_PRESET_SCHEMA
  font: CorpusFont
  stageKeys: Record<CorpusStage, string>
  coordinateFrame: string
  glyphCount: number
  runId: string
  updatedAt: string
}
