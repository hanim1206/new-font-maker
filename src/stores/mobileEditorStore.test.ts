import { afterEach, describe, expect, it } from 'vitest'
import type { JamoData } from '../types'
import { useMobileEditorStore } from './mobileEditorStore'

describe('mobileEditorStore gesture preview', () => {
  afterEach(() => useMobileEditorStore.getState().cancelGesture())

  it('비율 제스처 시작 프레임부터 이미 보정된 자소를 보여준다', () => {
    const base: JamoData = { char: 'ㄱ', type: 'choseong', strokes: [] }
    const preview: JamoData = { char: 'ㄱ', type: 'choseong', strokes: [], padding: { top: 0.1, right: 0, bottom: 0, left: 0 } }
    useMobileEditorStore.getState().beginGesture(base, preview)
    expect(useMobileEditorStore.getState().gestureStartJamo).toEqual(base)
    expect(useMobileEditorStore.getState().previewJamo).toEqual(preview)
  })

  it('상세 편집 종료 시 선택과 미리보기를 함께 정리한다', () => {
    const base: JamoData = { char: 'ㄱ', type: 'choseong', strokes: [] }
    useMobileEditorStore.getState().selectPoint('CH', 'ㄱ-1', 0)
    useMobileEditorStore.getState().beginGesture(base)
    useMobileEditorStore.getState().clearSelection()

    const state = useMobileEditorStore.getState()
    expect(state.selection).toEqual({ kind: 'none' })
    expect(state.previewJamo).toBeNull()
    expect(state.gestureStartJamo).toBeNull()
    expect(state.phase).toBe('idle')
  })
})
