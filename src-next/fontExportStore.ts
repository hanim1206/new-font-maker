import { create } from 'zustand'
import { generateAndDownloadFont } from '../src/services/fontGenerator'

/**
 * OTF 추출 상태. 추출 단추(문장 보정 머리, 셸 `…` 메뉴)가 어디 있든 같은 상태를 본다.
 * 단추는 `request`로 이름 묻는 창만 열고, 창에서 `confirm`해야 실제 추출이 돈다.
 */

export const FONT_NAME_STORAGE_KEY = 'font-export-family-name-v1'
export const DEFAULT_FONT_NAME = 'FontMaker'

export type FontExportStatus = 'idle' | 'exporting' | 'downloaded' | 'failed'

interface FontExportState {
  status: FontExportStatus
  progress: string
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
  dialogOpen: false,
  familyName: loadFamilyName(),
  request: () => { if (get().status !== 'exporting') set({ dialogOpen: true }) },
  cancel: () => set({ dialogOpen: false }),
  confirm: async (name) => {
    if (get().status === 'exporting') return
    const familyName = name.trim() || DEFAULT_FONT_NAME
    try { localStorage.setItem(FONT_NAME_STORAGE_KEY, familyName) } catch { /* 저장 못 해도 추출은 된다 */ }
    set({ dialogOpen: false, familyName, status: 'exporting', progress: '준비 중...' })
    const result = await generateAndDownloadFont({
      familyName,
      onProgress: (_completed, _total, phase) => set({ progress: phase }),
    })
    set({ progress: '', status: result.success ? 'downloaded' : 'failed' })
    window.setTimeout(() => set({ status: 'idle' }), 1800)
  },
}))
