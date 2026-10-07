import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 추출이 끝난 뒤 화면 처리. 폰트 탭 · 대시보드는 완료 페이지로, 그 밖은 토스트만.
 * 실패는 어디서든 `notice`에 이유를 남긴다 — 대시보드는 이 토스트를 같이 그린다.
 */

const generate = vi.fn()
const navigate = vi.fn()
vi.mock('../src/services/fontGenerator', () => ({ generateAndDownloadFont: (...args: unknown[]) => generate(...args) }))
vi.mock('./notoModel', () => ({ loadNotoModel: async () => ({}), contextPlacementOf: () => ({ placement: { kind: 'schema' } }) }))
vi.mock('./accountFontSync', () => ({ accountFontName: () => null, nextExportRevision: async () => 3 }))
vi.mock('./router', () => ({ navigate: (...args: unknown[]) => navigate(...args) }))
// 받기 전 동의 시트는 여기서 안 본다(`download-consent.test.ts`). 늘 동의한 것으로.
vi.mock('./downloadConsent', () => ({ ensureDownloadConsent: async () => true }))

const bytes = new ArrayBuffer(8)
const success = { success: true, glyphCount: 3, fileSize: 8, bytes, fileName: '꾸불체.otf', skippedChars: [] }

function atPath(pathname: string): void {
  Object.assign(globalThis, { window: { location: { pathname }, setTimeout: globalThis.setTimeout.bind(globalThis) } })
}

describe('fontExportStore.confirm', () => {
  beforeEach(() => { generate.mockReset(); navigate.mockReset() })
  afterEach(() => { Reflect.deleteProperty(globalThis, 'window') })

  it('경로에 따라 어디서 끝났는지 가른다', async () => {
    const { exportOriginOf } = await import('./fontExportStore')
    expect(exportOriginOf('/workspace/font')).toBe('font')
    expect(exportOriginOf('/dashboard')).toBe('dashboard')
    expect(exportOriginOf('/workspace/jamo')).toBe('elsewhere')
  })

  it('대시보드에서 받으면 완료 페이지로 가고 돌아갈 곳은 대시보드다', async () => {
    const { useFontExportStore, FONT_EXPORT_DONE_PATH } = await import('./fontExportStore')
    generate.mockResolvedValue(success)
    atPath('/dashboard')
    await useFontExportStore.getState().confirm('꾸불체')
    const state = useFontExportStore.getState()
    expect(state.status).toBe('downloaded')
    expect(state.doneElsewhere).toBe(false)
    expect(state.lastExport?.from).toBe('dashboard')
    expect(state.lastExport?.revision).toBe(3)
    expect(navigate).toHaveBeenCalledWith(FONT_EXPORT_DONE_PATH)
  })

  it('자소 화면에서 끝나면 화면은 안 바꾸고 완료 페이지 보기만 남긴다', async () => {
    const { useFontExportStore } = await import('./fontExportStore')
    generate.mockResolvedValue(success)
    atPath('/workspace/jamo')
    await useFontExportStore.getState().confirm('꾸불체')
    expect(useFontExportStore.getState().doneElsewhere).toBe(true)
    expect(useFontExportStore.getState().lastExport?.from).toBe('elsewhere')
    expect(navigate).not.toHaveBeenCalled()
  })

  it('도는 동안만 "추출 중" 표시를 남긴다 — 탭이 죽고 다시 열리면 이걸 보고 알린다', async () => {
    const { useFontExportStore } = await import('./fontExportStore')
    const { EXPORT_IN_FLIGHT_KEY } = await import('./exportInterrupted')
    const memory = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => memory.set(key, value), removeItem: (key: string) => memory.delete(key) })
    let markedWhileRunning = false
    generate.mockImplementation(async () => { markedWhileRunning = memory.has(EXPORT_IN_FLIGHT_KEY); return success })
    atPath('/workspace/jamo')
    await useFontExportStore.getState().confirm('꾸불체')
    vi.unstubAllGlobals()
    expect(markedWhileRunning).toBe(true)
    expect(memory.has(EXPORT_IN_FLIGHT_KEY)).toBe(false)
  })

  it('실패하면 대시보드에서도 이유를 notice에 남기고 화면을 안 바꾼다', async () => {
    const { useFontExportStore } = await import('./fontExportStore')
    generate.mockResolvedValue({ success: false, glyphCount: 0, error: '폰트 생성 실패: 메모리 부족' })
    atPath('/dashboard')
    await useFontExportStore.getState().confirm('꾸불체')
    const state = useFontExportStore.getState()
    expect(state.status).toBe('failed')
    expect(state.notice).toBe('OTF를 만들지 못했어요. 폰트 생성 실패: 메모리 부족')
    expect(state.doneElsewhere).toBe(false)
    expect(navigate).not.toHaveBeenCalled()
  })
})

describe('추출 뒤 알림 문구', () => {
  it('파일 검사 오류가 있으면 성공이어도 첫 오류를 notice에 남긴다', async () => {
    const { successNotice, validationNotice } = await import('./fontExportStore')
    const broken = {
      ok: false,
      issues: [
        { severity: 'warning' as const, code: 'cmap.unicode-missing', message: 'Unicode cmap 없음' },
        { severity: 'error' as const, code: 'cff.fontname-mismatch', message: 'CFF FontName이 다릅니다.' },
      ],
    } as unknown as import('../src/services/openTypeValidation').OpenTypeValidationReport
    expect(validationNotice(undefined)).toBeNull()
    expect(validationNotice({ ...broken, ok: true, issues: [] })).toBeNull()
    expect(validationNotice(broken)).toBe('폰트는 받았지만 파일 검사에서 오류 1건: CFF FontName이 다릅니다. 설치가 안 되면 이 메시지를 알려 주세요.')
    expect(successNotice([], undefined)).toBeNull()
    expect(successNotice(['가'], broken)).toMatch(/^폰트는 받았지만 가: .* 설치가 안 되면 이 메시지를 알려 주세요\.$/)
  })
})
