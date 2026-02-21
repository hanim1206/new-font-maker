/**
 * 3개 Zustand 스토어 ↔ FontData 변환 브릿지
 *
 * collectFontData(): 현재 스토어 상태 → FontData (저장용)
 * applyFontData():   FontData → 3개 스토어에 적용 (불러오기용)
 */
import { useLayoutStore } from '../stores/layoutStore'
import { useJamoStore } from '../stores/jamoStore'
import { useGlobalStyleStore } from '../stores/globalStyleStore'
import type { FontData } from '../types/database'
import { FONT_DATA_VERSION } from '../types/database'

/**
 * 현재 3개 스토어의 상태를 FontData로 수집
 * React 외부에서도 사용 가능 (getState 사용)
 */
export function collectFontData(): FontData {
  const layout = useLayoutStore.getState()
  const jamo = useJamoStore.getState()
  const style = useGlobalStyleStore.getState()

  return {
    version: FONT_DATA_VERSION,
    layoutSchemas: layout.layoutSchemas,
    globalPadding: layout.globalPadding,
    paddingOverrides: layout.paddingOverrides,
    jamoData: {
      choseong: jamo.choseong,
      jungseong: jamo.jungseong,
      jongseong: jamo.jongseong,
    },
    globalStyle: {
      style: style.style,
      exclusions: style.exclusions,
    },
  }
}

/**
 * FontData를 3개 스토어에 적용
 * 각 스토어의 loadFontData 액션을 호출하여 파생값 재계산 포함
 */
export function applyFontData(fontData: FontData): void {
  // 레이아웃 스토어 (layoutSchemas + globalPadding + paddingOverrides → layoutConfigs 재계산)
  useLayoutStore.getState().loadFontData({
    layoutSchemas: fontData.layoutSchemas,
    globalPadding: fontData.globalPadding,
    paddingOverrides: fontData.paddingOverrides,
  })

  // 자모 스토어 (구형 스트로크 마이그레이션 포함)
  useJamoStore.getState().loadFontData({
    choseong: fontData.jamoData.choseong,
    jungseong: fontData.jamoData.jungseong,
    jongseong: fontData.jamoData.jongseong,
  })

  // 글로벌 스타일 스토어 (linecap 백필 포함)
  useGlobalStyleStore.getState().loadFontData({
    style: fontData.globalStyle.style,
    exclusions: fontData.globalStyle.exclusions,
  })
}

/**
 * FontData 기본 유효성 검사
 * Supabase에서 불러온 데이터가 최소 구조를 갖추었는지 확인
 */
export function validateFontData(data: unknown): data is FontData {
  if (!data || typeof data !== 'object') return false

  const d = data as Record<string, unknown>

  // 필수 최상위 필드 확인
  if (!d.layoutSchemas || typeof d.layoutSchemas !== 'object') return false
  if (!d.globalPadding || typeof d.globalPadding !== 'object') return false
  if (!d.jamoData || typeof d.jamoData !== 'object') return false
  if (!d.globalStyle || typeof d.globalStyle !== 'object') return false

  // jamoData 하위 필드 확인
  const jamo = d.jamoData as Record<string, unknown>
  if (!jamo.choseong || typeof jamo.choseong !== 'object') return false
  if (!jamo.jungseong || typeof jamo.jungseong !== 'object') return false
  if (!jamo.jongseong || typeof jamo.jongseong !== 'object') return false

  // globalStyle 하위 필드 확인
  const style = d.globalStyle as Record<string, unknown>
  if (!style.style || typeof style.style !== 'object') return false
  if (!Array.isArray(style.exclusions)) return false

  return true
}
