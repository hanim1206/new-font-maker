import { create } from 'zustand'
import { identityOfSyllable } from '../src/services/contextBoxResolver'
import type { GlyphPlacementResolver } from '../src/services/fontExportUtils'
import { EXPORT_SIMPLIFY_EPSILON } from '../src/services/contourSimplify'
import { collectFontData } from '../src/services/fontDataBridge'
import { parallelHangulPortables } from '../src/services/fontExportParallel'
import { allExportChars } from '../src/services/fontExportUtils'
import { generateAndDownloadFont } from '../src/services/fontGenerator'
import { DEFAULT_FAMILY_NAME } from '../src/services/fontIdentity'
import type { PortableHangulGlyph } from '../src/services/fontGenerator'
import type { OpenTypeValidationReport } from '../src/services/openTypeValidation'
import { accountFontName, nextExportRevision } from './accountFontSync'
import { effectiveLayoutDelta, layoutDeltaSnapshot } from './layoutDeltaStore'
import type { LayoutDeltaSnapshot } from './layoutDeltaStore'
import { contextPlacementOf, loadNotoModel } from './notoModel'
import type { NotoPresetModelBundle } from './notoPresetGlyphs'
import { navigate } from './router'
import { clearExportMark, markExportStarted } from './exportInterrupted'
import { DEFAULT_SAMPLE_SENTENCE } from './sampleSentences'

/**
 * OTF 추출 상태. 추출 단추(폰트 탭, 옛 단독 화면)가 어디 있든 같은 상태를 본다.
 * 단추는 `request`로 이름 묻는 창만 열고, 창에서 `confirm`해야 실제 추출이 돈다.
 * 도는 동안은 폰트 탭의 대기 층이 `percent`를 보이고, 끝나면 `lastExport`를 들고 완료 페이지(`/workspace/font/export`)로 간다.
 * 대시보드 카드에서 받아도 같다 — 거기서도 단추를 보며 기다리므로 완료 페이지로 넘긴다. 그 밖(자소 편집 중)이면 화면을 안 바꾸고 토스트만.
 */

export const FONT_NAME_STORAGE_KEY = 'font-export-family-name-v1'
export const DEFAULT_FONT_NAME = DEFAULT_FAMILY_NAME
export const FONT_TAB_PATH = '/workspace/font'
export const FONT_EXPORT_DONE_PATH = '/workspace/font/export'
export const DASHBOARD_PATH = '/dashboard'

export type FontExportStatus = 'idle' | 'exporting' | 'downloaded' | 'failed'

/** 추출이 끝난 순간 어디였나. `font` · `dashboard`는 기다리던 화면이라 완료 페이지로, `elsewhere`는 토스트만. */
export type ExportOrigin = 'font' | 'dashboard' | 'elsewhere'

export function exportOriginOf(pathname: string): ExportOrigin {
  if (pathname === FONT_TAB_PATH) return 'font'
  if (pathname === DASHBOARD_PATH) return 'dashboard'
  return 'elsewhere'
}

/** 방금 만든 폰트. 메모리에만 있다 — 새로고침하면 사라지고 완료 페이지는 폰트 탭으로 넘긴다. */
export interface LastExport {
  familyName: string
  fileName: string
  revision: number
  fileSize: number
  at: number
  skippedChars: string[]
  bytes: ArrayBuffer
  /** 완료 페이지의 `‹` 가 돌아갈 곳. 대시보드에서 받았으면 내 폰트로. */
  from: ExportOrigin
  /** 받을 때 대시보드 카드에 떠 있던 예시 문장. 완료 페이지가 진짜 폰트로 다시 쓴다. */
  sample: string
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
  /** 대시보드 폰트 카드의 예시 문장(주사위로 바뀐다). 자소 편집기 문장 시트와 같은 값이고, 이 기기에 남아 새로고침해도 그대로다. */
  sampleSentence: string
}

interface FontExportActions {
  request: () => void
  cancel: () => void
  dismissNotice: () => void
  confirm: (familyName: string) => Promise<void>
  setSampleSentence: (sentence: string) => void
}

/** 빈 글리프로 넣은 글자 알림. 없으면 null. */
export function skippedNotice(chars: readonly string[]): string | null {
  if (chars.length === 0) return null
  const head = chars.slice(0, 3).join(' · ')
  const who = chars.length > 3 ? `${head} 외 ${chars.length - 3}자` : head
  return `폰트는 받았지만 ${who}: 모양을 만들지 못해 빈 칸으로 들어갔어요. 획을 고쳐 다시 받아 주세요.`
}

/** 만든 파일을 iOS 기준으로 다시 읽었을 때 오류가 있으면 알린다. 없으면 null. 자세한 건 콘솔에 찍혀 있다. */
export function validationNotice(validation: OpenTypeValidationReport | undefined): string | null {
  if (!validation || validation.ok) return null
  const errors = validation.issues.filter((issue) => issue.severity === 'error')
  return `폰트는 받았지만 파일 검사에서 오류 ${errors.length}건: ${errors[0].message} 설치가 안 되면 이 메시지를 알려 주세요.`
}

/** 성공했을 때 토스트에 보일 말. 빈 글자 알림이 먼저, 그다음 파일 검사 오류. */
export function successNotice(skippedChars: readonly string[], validation: OpenTypeValidationReport | undefined): string | null {
  return [skippedNotice(skippedChars), validationNotice(validation)].filter(Boolean).join(' ') || null
}

const PHASE_ASSEMBLE = '폰트 파일 생성 중...'
const PHASE_ASSEMBLE_LABEL = '파일로 묶는 중'

/** 조립 단계는 퍼센트가 99에서 선다. 점이 많은 폰트(손글씨체)는 이 단계만 30초 넘게 걸려서, 멈춘 게 아님을 경과 초로 보인다. */
export function assembleLabel(elapsedSeconds: number): string {
  return elapsedSeconds < 3 ? PHASE_ASSEMBLE_LABEL : `${PHASE_ASSEMBLE_LABEL} · ${elapsedSeconds}초 (큰 폰트는 1분쯤 걸려요)`
}

/**
 * 진행률 한 숫자. 추출기는 단계마다 `done/total`을 0부터 다시 세므로 단계에 자리를 준다 —
 * 1단계(상자 풀기) 0~50, 2단계(윤곽 변환) 50~99, 3단계(파일 조립)는 동기라 99에서 선다.
 */
export function exportPercent(phaseIndex: number, done: number, total: number): number {
  if (phaseIndex >= 2) return 99
  const share = total > 0 ? Math.min(1, done / total) : 0
  return Math.floor((phaseIndex * 0.5 + share * 0.5) * 99)
}

const SAMPLE_SENTENCE_STORAGE_KEY = 'font-maker-sample-sentence'

function loadSampleSentence(): string {
  try { return localStorage.getItem(SAMPLE_SENTENCE_STORAGE_KEY)?.trim() || DEFAULT_SAMPLE_SENTENCE } catch { return DEFAULT_SAMPLE_SENTENCE }
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
  sampleSentence: loadSampleSentence(),
  // 빈 문장(다 지우고 새로 쓰는 중)은 남기지 않는다. 대시보드 카드가 비지 않게.
  setSampleSentence: (sampleSentence) => {
    if (!sampleSentence.trim()) return
    set({ sampleSentence })
    try { localStorage.setItem(SAMPLE_SENTENCE_STORAGE_KEY, sampleSentence) } catch { /* 못 남겨도 지금 화면은 바뀐다 */ }
  },
  request: () => { if (get().status !== 'exporting') set({ dialogOpen: true, familyName: accountFontName() ?? loadFamilyName() }) },
  cancel: () => set({ dialogOpen: false }),
  dismissNotice: () => set({ notice: null, doneElsewhere: false }),
  confirm: async (name) => {
    if (get().status === 'exporting') return
    const familyName = name.trim() || DEFAULT_FONT_NAME
    // 받기 전 동의(약관 · 14세 · 공개 · 사용 조건). 없으면 시트가 뜨고, 손님은 카카오로 간다 — 돌아와서 다시 받는다.
    const { ensureDownloadConsent } = await import('./downloadConsent')
    const { useFontPresetStore } = await import('./fontPresetStore')
    if (!(await ensureDownloadConsent(familyName, useFontPresetStore.getState().preset))) { set({ dialogOpen: false }); return }
    try { localStorage.setItem(FONT_NAME_STORAGE_KEY, familyName) } catch { /* 저장 못 해도 추출은 된다 */ }
    set({ dialogOpen: false, familyName, status: 'exporting', progress: '준비 중...', percent: 0, error: '', notice: null, doneElsewhere: false })
    // 도중에 탭이 죽으면(아이폰 메모리) 다시 열 때 알린다. 어떻게 끝나든 지운다.
    const storage = typeof localStorage === 'undefined' ? null : localStorage
    if (storage) markExportStarted(storage)
    try {
      await runExport(familyName)
    } finally {
      if (storage) clearExportMark(storage)
    }
  },
}))

/** `confirm`의 본체. 이름 창을 닫고 `exporting`으로 바꾼 뒤 부른다. */
async function runExport(familyName: string): Promise<void> {
  const set = useFontExportStore.setState
  const get = useFontExportStore.getState
  // 모델을 못 읽으면 멈춘다. 조용히 스키마로 떨어지면 받은 폰트가 화면과 달라진다.
  let placementOf: GlyphPlacementResolver
  let parallelSources: { bundle: NotoPresetModelBundle; deltas: LayoutDeltaSnapshot } | null = null
  try {
    const bundle = await loadNotoModel()
    const deltas = layoutDeltaSnapshot()
    placementOf = placementResolverOf(bundle, deltas)
    parallelSources = { bundle, deltas }
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
  let assembleTimer: number | null = null
  const stopAssembleTimer = () => { if (assembleTimer !== null) { window.clearInterval(assembleTimer); assembleTimer = null } }
  const reportProgress = (done: number, total: number, phase: string) => {
    if (phase !== lastPhase) { lastPhase = phase; phaseIndex += 1 }
    if (phase === PHASE_ASSEMBLE && assembleTimer === null) {
      const startedAt = Date.now()
      assembleTimer = window.setInterval(() => set({ progress: assembleLabel(Math.floor((Date.now() - startedAt) / 1000)) }), 1000)
    }
    set({ progress: phase === PHASE_ASSEMBLE ? PHASE_ASSEMBLE_LABEL : phase, percent: exportPercent(phaseIndex, done, total) })
  }

  // 수집 · 변환을 Worker 풀에 나눈다. 못 돌리면 null — 지금 직렬 경로 그대로(플랜 2026-10-02 워커 병렬).
  // Worker는 글자마다 수집 + 변환을 한 번에 돌므로, 진행 단계는 비중(수집 0.6)으로 나눠 보인다.
  let portables: PortableHangulGlyph[] | null = null
  if (parallelSources) {
    const COLLECT_SHARE = 0.6
    try {
      portables = await parallelHangulPortables({
        chars: allExportChars(),
        fontData: collectFontData(),
        deltaSnapshot: parallelSources.deltas,
        bundle: parallelSources.bundle,
        simplifyEpsilon: EXPORT_SIMPLIFY_EPSILON,
        onProgress: (done, total) => {
          const collectTotal = Math.max(1, Math.round(total * COLLECT_SHARE))
          if (done < collectTotal) reportProgress(done, collectTotal, '글리프 데이터 수집 중...')
          else reportProgress(done - collectTotal, Math.max(1, total - collectTotal), '글리프 윤곽 변환 중...')
        },
      })
    } catch (failure) {
      console.warn('병렬 추출 준비 실패, 직렬로 폴백:', failure)
      portables = null
    }
  }

  const result = await generateAndDownloadFont({
    familyName,
    placementOf,
    revision,
    // 합친 뒤 윤곽 점 줄이기 — 붓·둥글기 폰트의 추출 시간·파일을 줄인다(G0·G1 닫힘).
    simplifyEpsilon: EXPORT_SIMPLIFY_EPSILON,
    hangulPortables: portables ?? undefined,
    onProgress: reportProgress,
  }).finally(stopAssembleTimer)
  const skippedChars = result.skippedChars ?? []
  // 폰트 탭 · 대시보드에서 기다리고 있었으면 완료 페이지로. 다른 탭이면 화면을 바꾸지 않는다.
  const origin = typeof window === 'undefined' ? 'elsewhere' : exportOriginOf(window.location.pathname)
  const lastExport: LastExport | null = result.success && result.bytes
    ? { familyName, fileName: result.fileName ?? `${familyName}.otf`, revision, fileSize: result.fileSize ?? result.bytes.byteLength, at: Date.now(), skippedChars, bytes: result.bytes, from: origin, sample: get().sampleSentence }
    : null
  set({
    progress: '',
    percent: result.success ? 100 : 0,
    status: result.success ? 'downloaded' : 'failed',
    error: result.success ? '' : result.error ?? '',
    notice: result.success ? successNotice(skippedChars, result.validation) : `OTF를 만들지 못했어요. ${result.error ?? ''}`.trim(),
    doneElsewhere: Boolean(lastExport) && origin === 'elsewhere',
    schemaFallbackCount: result.schemaFallbackCount ?? 0,
    lastExport: lastExport ?? get().lastExport,
  })
  if (lastExport && origin !== 'elsewhere') navigate(FONT_EXPORT_DONE_PATH)
  window.setTimeout(() => set({ status: 'idle' }), 1800)
}
