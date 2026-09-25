import { create } from 'zustand'
import { identityOfSyllable } from '../src/services/contextBoxResolver'
import type { GlyphPlacementResolver } from '../src/services/fontExportUtils'
import { generateAndDownloadFont } from '../src/services/fontGenerator'
import { accountFontName, nextExportRevision } from './accountFontSync'
import { effectiveLayoutDelta, layoutDeltaSnapshot } from './layoutDeltaStore'
import type { LayoutDeltaSnapshot } from './layoutDeltaStore'
import { contextPlacementOf, loadNotoModel } from './notoModel'
import type { NotoPresetModelBundle } from './notoPresetGlyphs'
import { navigate } from './router'

/**
 * OTF 추출 상태. 추출 단추(폰트 탭, 옛 단독 화면)가 어디 있든 같은 상태를 본다.
 * 단추는 `request`로 이름 묻는 창만 열고, 창에서 `confirm`해야 실제 추출이 돈다.
 * 도는 동안은 폰트 탭의 대기 층이 `percent`를 보이고, 끝나면 `lastExport`를 들고 완료 페이지(`/workspace/font/export`)로 간다.
 */

export const FONT_NAME_STORAGE_KEY = 'font-export-family-name-v1'
export const DEFAULT_FONT_NAME = 'FontMaker'
export const FONT_TAB_PATH = '/workspace/font'
export const FONT_EXPORT_DONE_PATH = '/workspace/font/export'

export type FontExportStatus = 'idle' | 'exporting' | 'downloaded' | 'failed'

/** 방금 만든 폰트. 메모리에만 있다 — 새로고침하면 사라지고 완료 페이지는 폰트 탭으로 넘긴다. */
export interface LastExport {
  familyName: string
  fileName: string
  revision: number
  fileSize: number
  at: number
  skippedChars: string[]
  bytes: ArrayBuffer
}

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
  /** 지금 단계 글(`글리프 데이터 수집 중...` 등). */
  progress: string
  /** 0~100. 두 단계(상자 풀기 · 윤곽 변환)가 각각 절반, 파일 조립은 99에서 선다. */
  percent: number
  /** 마지막 추출이 실패한 이유. 성공하면 비운다. */
  error: string
  /** 편집 화면 토스트로 바로 알릴 말(실패 · 빠진 글자). 닫거나 다시 추출하면 비운다. */
  notice: string | null
  /** 폰트 탭이 아닌 곳에서 끝났다 — 화면은 안 바꾸고 토스트에 `완료 페이지 보기`만. */
  doneElsewhere: boolean
  /** 마지막 추출에서 모델 상자를 못 쓰고 스키마로 그린 음절 수. */
  schemaFallbackCount: number
  lastExport: LastExport | null
  dialogOpen: boolean
  /** 창에 미리 채울 폰트 이름. 계정 폰트면 그 이름, 아니면 마지막으로 쓴 이름. */
  familyName: string
}

interface FontExportActions {
  request: () => void
  cancel: () => void
  dismissNotice: () => void
  confirm: (familyName: string) => Promise<void>
}

/** 빈 글리프로 넣은 글자 알림. 없으면 null. */
export function skippedNotice(chars: readonly string[]): string | null {
  if (chars.length === 0) return null
  const head = chars.slice(0, 3).join(' · ')
  const who = chars.length > 3 ? `${head} 외 ${chars.length - 3}자` : head
  return `폰트는 받았지만 ${who}: 모양을 만들지 못해 빈 칸으로 들어갔어요. 획을 고쳐 다시 받아 주세요.`
}

const PHASE_ASSEMBLE = '폰트 파일 생성 중...'
const PHASE_ASSEMBLE_LABEL = '파일로 묶는 중'

/**
 * 진행률 한 숫자. 추출기는 단계마다 `done/total`을 0부터 다시 세므로 단계에 자리를 준다 —
 * 1단계(상자 풀기) 0~50, 2단계(윤곽 변환) 50~99, 3단계(파일 조립)는 동기라 99에서 선다.
 */
export function exportPercent(phaseIndex: number, done: number, total: number): number {
  if (phaseIndex >= 2) return 99
  const share = total > 0 ? Math.min(1, done / total) : 0
  return Math.floor((phaseIndex * 0.5 + share * 0.5) * 99)
}

function loadFamilyName(): string {
  try { return localStorage.getItem(FONT_NAME_STORAGE_KEY)?.trim() || DEFAULT_FONT_NAME } catch { return DEFAULT_FONT_NAME }
}

export const useFontExportStore = create<FontExportState & FontExportActions>()((set, get) => ({
  status: 'idle',
  progress: '',
  percent: 0,
  error: '',
  notice: null,
  doneElsewhere: false,
  schemaFallbackCount: 0,
  lastExport: null,
  dialogOpen: false,
  familyName: loadFamilyName(),
  request: () => { if (get().status !== 'exporting') set({ dialogOpen: true, familyName: accountFontName() ?? loadFamilyName() }) },
  cancel: () => set({ dialogOpen: false }),
  dismissNotice: () => set({ notice: null, doneElsewhere: false }),
  confirm: async (name) => {
    if (get().status === 'exporting') return
    const familyName = name.trim() || DEFAULT_FONT_NAME
    try { localStorage.setItem(FONT_NAME_STORAGE_KEY, familyName) } catch { /* 저장 못 해도 추출은 된다 */ }
    set({ dialogOpen: false, familyName, status: 'exporting', progress: '준비 중...', percent: 0, error: '', notice: null, doneElsewhere: false })
    // 모델을 못 읽으면 멈춘다. 조용히 스키마로 떨어지면 받은 폰트가 화면과 달라진다.
    let placementOf: GlyphPlacementResolver
    try {
      placementOf = await exportPlacementResolver()
    } catch (failure) {
      const reason = failure instanceof Error ? failure.message : String(failure)
      const error = `Noto 모델을 읽지 못해 추출을 멈췄습니다: ${reason}`
      set({ progress: '', percent: 0, status: 'failed', error, notice: `OTF를 만들지 못했어요. ${error}` })
      window.setTimeout(() => set({ status: 'idle' }), 1800)
      return
    }
    // 받을 때마다 파일 버전을 올린다. 같은 이름으로 다시 설치해도 OS가 새 파일로 알아본다.
    const revision = await nextExportRevision()
    // 단계는 글이 바뀔 때 하나씩 센다(수집 → 변환 → 조립).
    let phaseIndex = -1
    let lastPhase = ''
    const result = await generateAndDownloadFont({
      familyName,
      placementOf,
      revision,
      onProgress: (done, total, phase) => {
        if (phase !== lastPhase) { lastPhase = phase; phaseIndex += 1 }
        set({ progress: phase === PHASE_ASSEMBLE ? PHASE_ASSEMBLE_LABEL : phase, percent: exportPercent(phaseIndex, done, total) })
      },
    })
    const skippedChars = result.skippedChars ?? []
    const lastExport: LastExport | null = result.success && result.bytes
      ? { familyName, fileName: result.fileName ?? `${familyName}.otf`, revision, fileSize: result.fileSize ?? result.bytes.byteLength, at: Date.now(), skippedChars, bytes: result.bytes }
      : null
    // 폰트 탭에서 기다리고 있었으면 완료 페이지로. 다른 탭이면 화면을 바꾸지 않는다.
    const onFontTab = typeof window !== 'undefined' && window.location.pathname === FONT_TAB_PATH
    set({
      progress: '',
      percent: result.success ? 100 : 0,
      status: result.success ? 'downloaded' : 'failed',
      error: result.success ? '' : result.error ?? '',
      notice: result.success ? skippedNotice(skippedChars) : `OTF를 만들지 못했어요. ${result.error ?? ''}`.trim(),
      doneElsewhere: Boolean(lastExport) && !onFontTab,
      schemaFallbackCount: result.schemaFallbackCount ?? 0,
      lastExport: lastExport ?? get().lastExport,
    })
    if (lastExport && onFontTab) navigate(FONT_EXPORT_DONE_PATH)
    window.setTimeout(() => set({ status: 'idle' }), 1800)
  },
}))
