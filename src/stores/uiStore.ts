import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { ViewMode, LayoutType } from '../types'

interface UIState {
  // 현재 뷰 모드 (모바일에서 탭 전환용)
  viewMode: ViewMode
  // 입력된 텍스트
  inputText: string
  // 선택된 글자 인덱스 (PreviewPanel에서)
  selectedCharIndex: number
  // 모바일 여부
  isMobile: boolean

  // === 리모콘 상태 ===
  // 컨트롤 모드: 레이아웃 편집 또는 자소 편집
  controlMode: 'layout' | 'jamo' | null
  // 선택된 레이아웃 타입 (레이아웃 편집 모드용)
  selectedLayoutType: LayoutType | null
  // 편집 중인 자모 타입
  editingJamoType: 'choseong' | 'jungseong' | 'jongseong' | null
  // 편집 중인 자모 문자
  editingJamoChar: string | null
  // 선택된 획 ID
  selectedStrokeId: string | null
  // 선택된 패스 포인트 인덱스
  selectedPointIndex: number | null
}

interface UIActions {
  setViewMode: (mode: ViewMode) => void
  setInputText: (text: string) => void
  setSelectedCharIndex: (index: number) => void
  setIsMobile: (isMobile: boolean) => void

  // === 리모콘 액션 ===
  setControlMode: (mode: 'layout' | 'jamo' | null) => void
  setSelectedLayoutType: (layoutType: LayoutType | null) => void
  setEditingJamo: (type: 'choseong' | 'jungseong' | 'jongseong' | null, char: string | null) => void
  setSelectedStrokeId: (id: string | null) => void
  setSelectedPointIndex: (index: number | null) => void
}

export const useUIStore = create<UIState & UIActions>()(
  immer((set) => ({
    // 초기 상태
    viewMode: 'preview',
    inputText: '',
    selectedCharIndex: 0,
    isMobile: false,

    // 리모콘 상태
    controlMode: null,
    selectedLayoutType: null,
    editingJamoType: null,
    editingJamoChar: null,
    selectedStrokeId: null,
    selectedPointIndex: null,

    // 액션
    setViewMode: (mode) =>
      set((state) => {
        state.viewMode = mode
      }),

    setInputText: (text) =>
      set((state) => {
        state.inputText = text
      }),

    setSelectedCharIndex: (index) =>
      set((state) => {
        state.selectedCharIndex = index
      }),

    setIsMobile: (isMobile) =>
      set((state) => {
        state.isMobile = isMobile
      }),

    // 리모콘 액션
    setControlMode: (mode) =>
      set((state) => {
        state.controlMode = mode
      }),

    setSelectedLayoutType: (layoutType) =>
      set((state) => {
        state.selectedLayoutType = layoutType
      }),

    setEditingJamo: (type, char) =>
      set((state) => {
        state.editingJamoType = type
        state.editingJamoChar = char
      }),

    setSelectedStrokeId: (id) =>
      set((state) => {
        state.selectedStrokeId = id
        state.selectedPointIndex = null
      }),

    setSelectedPointIndex: (index) =>
      set((state) => {
        state.selectedPointIndex = index
      }),
  }))
)
