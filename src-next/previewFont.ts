import { normalizeReferencePadding } from '../src/services/designBodyPlacement'
import { parseAndMigrateFontData } from '../src/services/fontDataMigration'
import { loadedGlobalStyle } from '../src/stores/globalStyleStore'
import type { GlobalStyle, GlobalStyleExclusion } from '../src/stores/globalStyleStore'
import type { JamoData, LayoutSchema, LayoutType, Padding } from '../src/types'
import { migrateJamoData, needsMigration } from '../src/utils/strokeMigration'
import type { LayoutDeltaSnapshot } from './layoutDeltaStore'

/**
 * 저장된 폰트 JSON 하나로 글자를 그린다. 스토어에 넣지 않는다.
 * 관리자 화면이 친구 폰트를 볼 때 쓴다 — 스토어는 localStorage에 저장되므로 넣으면 이 기기의 내 폰트 사본을 덮는다.
 * 값은 스토어의 `loadFontData`가 하는 손질(옛 획 이전 · 여백 정규화 · 끝 모양 백필)을 똑같이 거친다. 그리는 길은 `AppGlyph`와 같다.
 * 묶음 부리는 이 기기에만 저장되고 서버 폰트에 없어서 빈 묶음으로 그린다.
 */
export interface PreviewFont {
  jamo: Record<'choseong' | 'jungseong' | 'jongseong', Record<string, JamoData>>
  layoutSchemas: Record<LayoutType, LayoutSchema>
  globalPadding: Padding
  paddingOverrides: Partial<Record<LayoutType, Partial<Padding>>>
  style: GlobalStyle
  exclusions: GlobalStyleExclusion[]
  delta: LayoutDeltaSnapshot
}

const migratedMap = (map: Record<string, JamoData>): Record<string, JamoData> => {
  const cloned = structuredClone(map)
  const needs = Object.values(cloned).some((jamo) => [...(jamo.strokes ?? []), ...(jamo.horizontalStrokes ?? []), ...(jamo.verticalStrokes ?? [])].some(needsMigration))
  return needs ? Object.fromEntries(Object.entries(cloned).map(([key, jamo]) => [key, migrateJamoData(jamo)])) : cloned
}

export function previewFontOf(value: unknown): { ok: true; font: PreviewFont } | { ok: false; message: string } {
  const parsed = parseAndMigrateFontData(value)
  if (!parsed.ok) return { ok: false, message: parsed.issues.map(({ path, code }) => `${path}:${code}`).join(', ') }
  const data = parsed.data
  return {
    ok: true,
    font: {
      jamo: {
        choseong: migratedMap(data.jamoData.choseong),
        jungseong: migratedMap(data.jamoData.jungseong),
        jongseong: migratedMap(data.jamoData.jongseong),
      },
      layoutSchemas: structuredClone(data.layoutSchemas),
      globalPadding: normalizeReferencePadding({ ...data.globalPadding }),
      paddingOverrides: structuredClone(data.paddingOverrides),
      style: loadedGlobalStyle(data.globalStyle.style),
      exclusions: [...data.globalStyle.exclusions],
      delta: { rules: structuredClone(data.layoutDelta?.rules ?? {}) },
    },
  }
}
