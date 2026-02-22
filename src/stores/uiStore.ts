import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { ViewMode, LayoutType, Part } from '../types'

interface UIState {
  // 현재 페이지 (에디터 또는 프로젝트 목록)
  currentPage: 'editor' | 'projects'
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
  // 자모 편집 시 선택된 레이아웃 컨텍스트
  selectedLayoutContext: LayoutType | null
  // 레이아웃에서 선택된 파트 (단일클릭 → 파트 오프셋 조절)
  selectedPartInLayout: Part | null
  // 레이아웃 미리보기에서 클릭한 파트 (더블클릭 → 자모 편집 서브모드)
  editingPartInLayout: Part | null
  // 현재 편집 중인 오버라이드 ID (null = 기본값 편집)
  editingOverrideId: string | null
  // 현재 편집 중인 레이아웃 오버라이드 ID (null = 기본값 편집)
  editingLayoutOverrideId: string | null
  // 현재 불러온 프로젝트 ID
  currentProjectId: string | null
  // 현재 불러온 프로젝트 이름
  currentProjectName: string | null

  // === 모바일 드로어 상태 ===
  activeMobileDrawer: 'control' | 'inspector' | 'preview' | null

  // === 캔버스 줌/패닝 상태 ===
  canvasZoom: number
  canvasPan: { x: number; y: number }
}

interface UIActions {
  setCurrentPage: (page: 'editor' | 'projects') => void
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
  setSelectedLayoutContext: (layoutType: LayoutType | null) => void
  setSelectedPartInLayout: (part: Part | null) => void
  setEditingPartInLayout: (part: Part | null) => void
  setEditingOverrideId: (id: string | null) => void
  setEditingLayoutOverrideId: (id: string | null) => void
  setCurrentProject: (id: string | null, name: string | null) => void

  // === 모바일 드로어 액션 ===
  setActiveMobileDrawer: (drawer: 'control' | 'inspector' | 'preview' | null) => void
  toggleMobileDrawer: (drawer: 'control' | 'inspector' | 'preview') => void

  // === 캔버스 줌/패닝 액션 ===
  setCanvasZoom: (zoom: number) => void
  setCanvasPan: (pan: { x: number; y: number }) => void
  resetCanvasView: () => void
}

export const useUIStore = create<UIState & UIActions>()(
  immer((set) => ({
    // 초기 상태
    currentPage: 'editor',
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
    selectedLayoutContext: null,
    selectedPartInLayout: null,
    editingPartInLayout: null,
    editingOverrideId: null,
    editingLayoutOverrideId: null,
    currentProjectId: null,
    currentProjectName: null,

    // 모바일 드로어
    activeMobileDrawer: null,

    // 캔버스 줌/패닝
    canvasZoom: 1,
    canvasPan: { x: 0, y: 0 },

    // 액션
    setCurrentPage: (page) =>
      set((state) => {
        state.currentPage = page
      }),

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
        state.selectedLayoutContext = null
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

    setSelectedLayoutContext: (layoutType) =>
      set((state) => {
        state.selectedLayoutContext = layoutType
      }),

    setSelectedPartInLayout: (part) =>
      set((state) => {
        state.selectedPartInLayout = part
      }),

    setEditingPartInLayout: (part) =>
      set((state) => {
        state.editingPartInLayout = part
        // 자모 편집 진입 시 파트 선택 해제
        state.selectedPartInLayout = null
        if (part === null) {
          // 자모 편집 종료 시 관련 상태 클리어
          state.editingJamoType = null
          state.editingJamoChar = null
          state.selectedStrokeId = null
          state.selectedPointIndex = null
          state.editingOverrideId = null
        }
      }),

    setEditingOverrideId: (id) =>
      set((state) => {
        state.editingOverrideId = id
        // 오버라이드 전환 시 선택 상태 클리어
        state.selectedStrokeId = null
        state.selectedPointIndex = null
      }),

    setEditingLayoutOverrideId: (id) =>
      set((state) => {
        state.editingLayoutOverrideId = id
      }),

    setCurrentProject: (id, name) =>
      set((state) => {
        state.currentProjectId = id
        state.currentProjectName = name
      }),

    // 모바일 드로어
    setActiveMobileDrawer: (drawer) =>
      set((state) => {
        state.activeMobileDrawer = drawer
      }),
    toggleMobileDrawer: (drawer) =>
      set((state) => {
        state.activeMobileDrawer = state.activeMobileDrawer === drawer ? null : drawer
      }),

    // 캔버스 줌/패닝
    setCanvasZoom: (zoom) =>
      set((state) => {
        state.canvasZoom = Math.max(0.5, Math.min(5, zoom))
      }),
    setCanvasPan: (pan) =>
      set((state) => {
        state.canvasPan = pan
      }),
    resetCanvasView: () =>
      set((state) => {
        state.canvasZoom = 1
        state.canvasPan = { x: 0, y: 0 }
      }),
  }))
)
