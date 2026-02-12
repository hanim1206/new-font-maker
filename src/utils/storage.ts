import type { LayoutPreset, Rule } from '../types'

const STORAGE_KEYS = {
  PRESETS: 'font-maker-presets',
  RULES: 'font-maker-rules',
  UI_STATE: 'font-maker-ui-state',
  LAYOUT_SCHEMAS: 'font-maker-layout-schemas',
} as const

// ===== 프리셋 저장/불러오기 =====
export function savePresets(presets: LayoutPreset[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.PRESETS, JSON.stringify(presets))
  } catch (error) {
    console.error('프리셋 저장 실패:', error)
  }
}

export function loadPresets(): LayoutPreset[] | null {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.PRESETS)
    if (!data) return null
    return JSON.parse(data) as LayoutPreset[]
  } catch (error) {
    console.error('프리셋 불러오기 실패:', error)
    return null
  }
}

// ===== 규칙 저장/불러오기 =====
export function saveRules(rules: Rule[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.RULES, JSON.stringify(rules))
  } catch (error) {
    console.error('규칙 저장 실패:', error)
  }
}

export function loadRules(): Rule[] | null {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.RULES)
    if (!data) return null
    return JSON.parse(data) as Rule[]
  } catch (error) {
    console.error('규칙 불러오기 실패:', error)
    return null
  }
}

// ===== UI 상태 저장/불러오기 =====
interface UIState {
  inputText?: string
  selectedPresetId?: string | null
}

export function saveUIState(state: UIState): void {
  try {
    localStorage.setItem(STORAGE_KEYS.UI_STATE, JSON.stringify(state))
  } catch (error) {
    console.error('UI 상태 저장 실패:', error)
  }
}

export function loadUIState(): UIState | null {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.UI_STATE)
    if (!data) return null
    return JSON.parse(data) as UIState
  } catch (error) {
    console.error('UI 상태 불러오기 실패:', error)
    return null
  }
}

// ===== 전체 데이터 내보내기/가져오기 =====
interface ExportData {
  version: string
  presets: LayoutPreset[]
  rules: Rule[]
  exportedAt: string
}

export function exportAllData(presets: LayoutPreset[], rules: Rule[]): string {
  const data: ExportData = {
    version: '1.0.0',
    presets,
    rules,
    exportedAt: new Date().toISOString(),
  }
  return JSON.stringify(data, null, 2)
}

export function importAllData(jsonString: string): { presets: LayoutPreset[]; rules: Rule[] } | null {
  try {
    const data = JSON.parse(jsonString) as ExportData
    if (!data.presets || !data.rules) {
      throw new Error('잘못된 데이터 형식')
    }
    return {
      presets: data.presets,
      rules: data.rules,
    }
  } catch (error) {
    console.error('데이터 가져오기 실패:', error)
    return null
  }
}

// ===== 스토리지 초기화 =====
export function clearAllData(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.PRESETS)
    localStorage.removeItem(STORAGE_KEYS.RULES)
    localStorage.removeItem(STORAGE_KEYS.UI_STATE)
    localStorage.removeItem(STORAGE_KEYS.LAYOUT_SCHEMAS)
  } catch (error) {
    console.error('스토리지 초기화 실패:', error)
  }
}

// ===== JSON 파일 다운로드 =====
export function downloadAsJson(data: string, filename: string): void {
  const blob = new Blob([data], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

