import { create } from 'zustand'
import { identityOfSyllable } from '../src/services/contextBoxResolver'
import type { GlyphPlacementResolver } from '../src/services/fontExportUtils'
import { generateAndDownloadFont } from '../src/services/fontGenerator'
import { effectiveLayoutDelta, layoutDeltaSnapshot } from './layoutDeltaStore'
import type { LayoutDeltaSnapshot } from './layoutDeltaStore'
import { contextPlacementOf, loadNotoModel } from './notoModel'
import type { NotoPresetModelBundle } from './notoPresetGlyphs'

/**
 * OTF 추출 상태. 추출 단추(문장 보정 머리, 셸 `…` 메뉴)가 어디 있든 같은 상태를 본다.
 * 단추는 `request`로 이름 묻는 창만 열고, 창에서 `confirm`해야 실제 추출이 돈다.
 */

export const FONT_NAME_STORAGE_KEY = 'font-export-family-name-v1'
export const DEFAULT_FONT_NAME = 'FontMaker'

export type FontExportStatus = 'idle' | 'exporting' | 'downloaded' | 'failed'

/**
 * 추출기에 넘길 상자 출처. 화면과 같은 규칙(`contextPlacementOf`)에 추출 시점의 모델과 Δ를 묶는다.
 * Δ는 추출을 시작할 때 한 번 떠서, 도는 동안 편집해도 한 폰트 안에서 값이 섞이지 않는다.
 */
export function placementResolverOf(bundle: NotoPresetModelBundle, deltas: LayoutDeltaSnapshot): GlyphPlacementResolver {
  return (syllable, schema, ends) => {
    const identity = identityOfSyllable(syllable)
    return contextPlacementOf({ bundle, identity, syllable, schema, ends, delta: effectiveLayoutDelta(deltas, identity) }).placement
  }
}

export async function exportPlacementResolver(): Promise<GlyphPlacementResolver> {
  return placementResolverOf(await loadNotoModel(), layoutDeltaSnapshot())
}

interface FontExportState {
  status: FontExportStatus
  progress: string
  /** 마지막 추출이 실패한 이유. 성공하면 비운다. */
  error: string
  /** 마지막 추출에서 모델 상자를 못 쓰고 스키마로 그린 음절 수. */
  schemaFallbackCount: number
  dialogOpen: boolean
  /** 마지막으로 쓴 폰트 이름. 다음 창에 미리 채운다. */
  familyName: string
}

interface FontExportActions {
  request: () => void
  cancel: () => void
  confirm: (familyName: string) => Promise<void>
}

function loadFamilyName(): string {
  try { return localStorage.getItem(FONT_NAME_STORAGE_KEY)?.trim() || DEFAULT_FONT_NAME } catch { return DEFAULT_FONT_NAME }
}

export const useFontExportStore = create<FontExportState & FontExportActions>()((set, get) => ({
  status: 'idle',
  progress: '',
  error: '',
  schemaFallbackCount: 0,
  dialogOpen: false,
  familyName: loadFamilyName(),
  request: () => { if (get().status !== 'exporting') set({ dialogOpen: true }) },
  cancel: () => set({ dialogOpen: false }),
  confirm: async (name) => {
    if (get().status === 'exporting') return
    const familyName = name.trim() || DEFAULT_FONT_NAME
    try { localStorage.setItem(FONT_NAME_STORAGE_KEY, familyName) } catch { /* 저장 못 해도 추출은 된다 */ }
    set({ dialogOpen: false, familyName, status: 'exporting', progress: '준비 중...', error: '' })
    // 모델을 못 읽으면 멈춘다. 조용히 스키마로 떨어지면 받은 폰트가 화면과 달라진다.
    let placementOf: GlyphPlacementResolver
    try {
      placementOf = await exportPlacementResolver()
    } catch (failure) {
      const reason = failure instanceof Error ? failure.message : String(failure)
      set({ progress: '', status: 'failed', error: `Noto 모델을 읽지 못해 추출을 멈췄습니다: ${reason}` })
      window.setTimeout(() => set({ status: 'idle' }), 1800)
      return
    }
    const result = await generateAndDownloadFont({
      familyName,
      placementOf,
      onProgress: (_completed, _total, phase) => set({ progress: phase }),
    })
    set({ progress: '', status: result.success ? 'downloaded' : 'failed', error: result.success ? '' : result.error ?? '', schemaFallbackCount: result.schemaFallbackCount ?? 0 })
    window.setTimeout(() => set({ status: 'idle' }), 1800)
  },
}))
