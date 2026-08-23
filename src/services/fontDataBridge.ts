/**
 * 4개 Zustand 스토어 ↔ FontData 변환 브릿지
 *
 * collectFontData(): 현재 스토어 상태 → FontData (저장용)
 * applyFontData():   unknown FontData → 4개 스토어에 원자 적용 (불러오기용)
 */
import { flushLayoutStorePersistence, useLayoutStore } from '../stores/layoutStore'
import { flushJamoStorePersistence, useJamoStore } from '../stores/jamoStore'
import { useGlobalStyleStore } from '../stores/globalStyleStore'
import { useHistoryStore } from '../stores/historyStore'
import { useEditorHistoryStore } from '../stores/editorHistoryStore'
import {
  flushShapeSystemStorePersistence,
  loadShapeSystemFromFontData,
  useShapeSystemStore,
} from '../stores/shapeSystemStore'
import type { FontData } from '../types/database'
import { FONT_DATA_VERSION } from '../types/database'
import { parseAndMigrateFontData } from './fontDataMigration'

export type FontDataApplyResult =
  | { ok: true; data: FontData }
  | { ok: false; error: { code: 'invalid-font-data' | 'shape-system-blocked' | 'apply-failed'; message: string } }

function restoreAfterApplyFailure(
  steps: ReadonlyArray<readonly [label: string, restore: () => void]>,
): string[] {
  const errors: string[] = []
  for (const [label, restore] of steps) {
    try {
      restore()
    } catch (error) {
      errors.push(`${label}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  return errors
}

function flushDebouncedFontStores(): void {
  flushLayoutStorePersistence()
  flushJamoStorePersistence()
  flushShapeSystemStorePersistence()
}

/**
 * 현재 4개 스토어의 상태를 FontData로 수집
 * React 외부에서도 사용 가능 (getState 사용)
 */
export function collectFontData(): FontData {
  const layout = useLayoutStore.getState()
  const jamo = useJamoStore.getState()
  const style = useGlobalStyleStore.getState()
  const shapeSystem = useShapeSystemStore.getState()

  if (shapeSystem.hydrationStatus === 'blocked') {
    throw new Error('차단된 Shape System 저장 원본이 있어 프로젝트를 저장할 수 없습니다.')
  }

  const data: FontData = {
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
  if (shapeSystem.source) data.shapeSystem = structuredClone(shapeSystem.source)
  const parsed = parseAndMigrateFontData(data)
  if (!parsed.ok) {
    throw new Error(`현재 FontData를 저장 계약으로 직렬화할 수 없습니다: ${parsed.issues.map(({ path, code }) => `${path}:${code}`).join(', ')}`)
  }
  return parsed.data
}

/**
 * FontData를 4개 스토어에 적용
 * 각 스토어의 loadFontData 액션을 호출하여 파생값 재계산 포함
 */
export function applyFontData(value: unknown): FontDataApplyResult {
  const parsed = parseAndMigrateFontData(value)
  if (!parsed.ok) {
    return {
      ok: false,
      error: {
        code: 'invalid-font-data',
        message: parsed.issues.map(({ path, code }) => `${path}:${code}`).join(', '),
      },
    }
  }
  if (useShapeSystemStore.getState().hydrationStatus === 'blocked') {
    return {
      ok: false,
      error: {
        code: 'shape-system-blocked',
        message: '차단된 Shape System 저장 원본을 일반 프로젝트 불러오기로 덮어쓸 수 없습니다.',
      },
    }
  }
  const fontData = parsed.data

  const layoutState = useLayoutStore.getState()
  const layoutBefore = structuredClone({
    layoutSchemas: layoutState.layoutSchemas,
    layoutConfigs: layoutState.layoutConfigs,
    globalPadding: layoutState.globalPadding,
    paddingOverrides: layoutState.paddingOverrides,
    _hydrated: layoutState._hydrated,
  })
  const jamoState = useJamoStore.getState()
  const jamoBefore = structuredClone({
    choseong: jamoState.choseong,
    jungseong: jamoState.jungseong,
    jongseong: jamoState.jongseong,
    _hydrated: jamoState._hydrated,
  })
  const styleState = useGlobalStyleStore.getState()
  const styleBefore = structuredClone({
    style: styleState.style,
    exclusions: styleState.exclusions,
    _hydrated: styleState._hydrated,
  })
  const shapeState = useShapeSystemStore.getState()
  const shapeBefore = structuredClone({
    source: shapeState.source,
    hydrationStatus: shapeState.hydrationStatus,
    hydrationIssues: shapeState.hydrationIssues,
    past: shapeState.past,
    future: shapeState.future,
  })
  const historyState = useHistoryStore.getState()
  const historyBefore = structuredClone({
    undoStack: historyState.undoStack,
    redoStack: historyState.redoStack,
  })
  const editorHistoryState = useEditorHistoryStore.getState()
  const editorHistoryBefore = structuredClone({
    entries: editorHistoryState.entries,
    undoEntryIds: editorHistoryState.undoEntryIds,
  })

  try {
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

    const shapeResult = loadShapeSystemFromFontData(fontData.shapeSystem ?? null)
    if (!shapeResult.ok) throw new Error(shapeResult.error.message)
    useHistoryStore.getState().clear()
    useEditorHistoryStore.getState().clear()
    // 프로젝트 전환은 메모리 적용만으로 성공 처리하지 않고 세 저장소 write를 즉시 확인한다.
    flushDebouncedFontStores()
    return { ok: true, data: fontData }
  } catch (error) {
    // persist middleware는 메모리 상태를 바꾼 뒤 storage write에서 throw할 수 있다.
    // 한 rollback write 실패가 뒤 store 복원을 막지 않도록 모든 복원을 독립 실행한다.
    const rollbackErrors = restoreAfterApplyFailure([
      ['layoutStore', () => useLayoutStore.setState({
        layoutSchemas: layoutBefore.layoutSchemas,
        layoutConfigs: layoutBefore.layoutConfigs,
        globalPadding: layoutBefore.globalPadding,
        paddingOverrides: layoutBefore.paddingOverrides,
        _hydrated: layoutBefore._hydrated,
      })],
      ['jamoStore', () => useJamoStore.setState({
        choseong: jamoBefore.choseong,
        jungseong: jamoBefore.jungseong,
        jongseong: jamoBefore.jongseong,
        _hydrated: jamoBefore._hydrated,
      })],
      ['globalStyleStore', () => useGlobalStyleStore.setState({
        style: styleBefore.style,
        exclusions: styleBefore.exclusions,
        _hydrated: styleBefore._hydrated,
      })],
      ['shapeSystemStore', () => useShapeSystemStore.setState({
        source: shapeBefore.source,
        hydrationStatus: shapeBefore.hydrationStatus,
        hydrationIssues: shapeBefore.hydrationIssues,
        past: shapeBefore.past,
        future: shapeBefore.future,
      })],
      ['historyStore', () => useHistoryStore.setState(historyBefore)],
      ['editorHistoryStore', () => useEditorHistoryStore.setState(editorHistoryBefore)],
      // 앞서 durable write가 일부 성공했더라도 복원된 before 값을 즉시 다시 기록한다.
      ['debouncedFontStores', flushDebouncedFontStores],
    ])
    const failureMessage = error instanceof Error ? error.message : 'FontData 적용 중 알 수 없는 오류가 발생했습니다.'
    return {
      ok: false,
      error: {
        code: 'apply-failed',
        message: rollbackErrors.length === 0
          ? failureMessage
          : `${failureMessage}; rollback write failure: ${rollbackErrors.join(' | ')}`,
      },
    }
  }
}
