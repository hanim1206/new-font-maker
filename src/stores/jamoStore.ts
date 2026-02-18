import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { persist } from 'zustand/middleware'
import type { JamoData, Padding } from '../types'
import { migrateJamoData, needsMigration } from '../utils/strokeMigration'
import baseJamos from '../data/baseJamos.json'

const STORAGE_KEY = 'font-maker-jamo-data'

interface JamoState {
  // 자모 데이터
  choseong: Record<string, JamoData>
  jungseong: Record<string, JamoData>
  jongseong: Record<string, JamoData>
  // hydration 완료 여부
  _hydrated: boolean
}

interface JamoActions {
  // ===== 자모 데이터 조회 =====

  // 초성 조회
  getChoseong: (char: string) => JamoData | undefined

  // 중성 조회
  getJungseong: (char: string) => JamoData | undefined

  // 종성 조회
  getJongseong: (char: string) => JamoData | undefined

  // ===== 자모 데이터 업데이트 =====

  // 초성 업데이트
  updateChoseong: (char: string, data: JamoData) => void

  // 중성 업데이트
  updateJungseong: (char: string, data: JamoData) => void

  // 종성 업데이트
  updateJongseong: (char: string, data: JamoData) => void

  // ===== 프리셋 관리 API =====

  // baseJamos.json과 비교하여 변경 여부 확인
  isModified: () => boolean

  // 특정 자모의 변경 여부 확인
  isJamoModified: (type: 'choseong' | 'jungseong' | 'jongseong', char: string) => boolean

  // 현재 상태를 JSON 문자열로 내보내기
  exportJamos: () => string

  // baseJamos.json 기본값으로 초기화
  resetToBaseJamos: () => void

  // 특정 타입만 초기화
  resetJamoType: (type: 'choseong' | 'jungseong' | 'jongseong') => void

  // ===== 자모 패딩 =====

  // 자모 패딩 업데이트
  updateJamoPadding: (
    type: 'choseong' | 'jungseong' | 'jongseong',
    char: string,
    side: keyof Padding,
    value: number
  ) => void

  // 자모 패딩 초기화
  resetJamoPadding: (
    type: 'choseong' | 'jungseong' | 'jongseong',
    char: string
  ) => void

  // 혼합중성 파트별 패딩 업데이트 (jungseong 전용)
  updateMixedJamoPadding: (
    char: string,
    part: 'horizontal' | 'vertical',
    side: keyof Padding,
    value: number
  ) => void

  // 혼합중성 파트별 패딩 초기화
  resetMixedJamoPadding: (
    char: string,
    part: 'horizontal' | 'vertical'
  ) => void

  // hydration 완료 표시
  setHydrated: () => void
}

// 깊은 복사 헬퍼 (JSON 기반)
function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj))
}

// 자모 맵에 구형 스트로크가 있는지 확인
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapNeedsMigration(jamoMap: Record<string, any>): boolean {
  for (const jamo of Object.values(jamoMap)) {
    const allStrokes = [
      ...(jamo.strokes || []),
      ...(jamo.horizontalStrokes || []),
      ...(jamo.verticalStrokes || []),
    ]
    if (allStrokes.some(needsMigration)) return true
  }
  return false
}

// 자모 맵 전체 마이그레이션
function migrateMap(jamoMap: Record<string, JamoData>): Record<string, JamoData> {
  const result: Record<string, JamoData> = {}
  for (const [key, jamo] of Object.entries(jamoMap)) {
    result[key] = migrateJamoData(jamo)
  }
  return result
}

// baseJamos.json에서 초기 데이터 로드
const BASE_JAMOS = {
  choseong: baseJamos.choseong as Record<string, JamoData>,
  jungseong: baseJamos.jungseong as Record<string, JamoData>,
  jongseong: baseJamos.jongseong as Record<string, JamoData>,
}

export const useJamoStore = create<JamoState & JamoActions>()(
  persist(
    immer((set, get) => ({
      // 초기 상태
      choseong: deepClone(BASE_JAMOS.choseong),
      jungseong: deepClone(BASE_JAMOS.jungseong),
      jongseong: deepClone(BASE_JAMOS.jongseong),
      _hydrated: false,

      // ===== 자모 데이터 조회 =====

      getChoseong: (char) => {
        return get().choseong[char]
      },

      getJungseong: (char) => {
        return get().jungseong[char]
      },

      getJongseong: (char) => {
        return get().jongseong[char]
      },

      // ===== 자모 데이터 업데이트 =====

      updateChoseong: (char, data) =>
        set((state) => {
          state.choseong[char] = data
        }),

      updateJungseong: (char, data) =>
        set((state) => {
          state.jungseong[char] = data
        }),

      updateJongseong: (char, data) =>
        set((state) => {
          state.jongseong[char] = data
        }),

      // ===== 프리셋 관리 API =====

      isModified: () => {
        const current = get()
        return (
          JSON.stringify(current.choseong) !== JSON.stringify(BASE_JAMOS.choseong) ||
          JSON.stringify(current.jungseong) !== JSON.stringify(BASE_JAMOS.jungseong) ||
          JSON.stringify(current.jongseong) !== JSON.stringify(BASE_JAMOS.jongseong)
        )
      },

      isJamoModified: (type, char) => {
        const current = get()[type][char]
        const base = BASE_JAMOS[type][char]
        return JSON.stringify(current) !== JSON.stringify(base)
      },

      exportJamos: () => {
        const current = get()
        return JSON.stringify(
          {
            version: '2.0.0',
            choseong: current.choseong,
            jungseong: current.jungseong,
            jongseong: current.jongseong,
            exportedAt: new Date().toISOString(),
          },
          null,
          2
        )
      },

      resetToBaseJamos: () =>
        set((state) => {
          state.choseong = deepClone(BASE_JAMOS.choseong)
          state.jungseong = deepClone(BASE_JAMOS.jungseong)
          state.jongseong = deepClone(BASE_JAMOS.jongseong)
        }),

      resetJamoType: (type) =>
        set((state) => {
          state[type] = deepClone(BASE_JAMOS[type])
        }),

      // ===== 자모 패딩 =====

      updateJamoPadding: (type, char, side, value) =>
        set((state) => {
          const jamo = state[type][char]
          if (!jamo) return
          if (!jamo.padding) {
            jamo.padding = { top: 0, bottom: 0, left: 0, right: 0 }
          }
          jamo.padding[side] = value
        }),

      resetJamoPadding: (type, char) =>
        set((state) => {
          const jamo = state[type][char]
          if (jamo) {
            delete jamo.padding
          }
        }),

      // ===== 혼합중성 파트별 패딩 =====

      updateMixedJamoPadding: (char, part, side, value) =>
        set((state) => {
          const jamo = state.jungseong[char]
          if (!jamo) return
          const key = part === 'horizontal' ? 'horizontalPadding' as const : 'verticalPadding' as const
          if (!jamo[key]) {
            jamo[key] = { top: 0, bottom: 0, left: 0, right: 0 }
          }
          jamo[key]![side] = value
        }),

      resetMixedJamoPadding: (char, part) =>
        set((state) => {
          const jamo = state.jungseong[char]
          if (jamo) {
            const key = part === 'horizontal' ? 'horizontalPadding' as const : 'verticalPadding' as const
            delete jamo[key]
          }
        }),

      setHydrated: () => set({ _hydrated: true }),
    })),
    {
      name: STORAGE_KEY,
      // 모든 자모 데이터 저장
      partialize: (state) => ({
        choseong: state.choseong,
        jungseong: state.jungseong,
        jongseong: state.jongseong,
      }),
      // hydration 완료 시 콜백: 구형 스트로크 자동 마이그레이션
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.error('Jamo store hydration failed:', error)
        }
        if (state) {
          // localStorage에서 불러온 데이터에 구형 스트로크가 있으면 마이그레이션
          const needsCh = mapNeedsMigration(state.choseong)
          const needsJu = mapNeedsMigration(state.jungseong)
          const needsJo = mapNeedsMigration(state.jongseong)

          if (needsCh || needsJu || needsJo) {
            console.log('[jamoStore] 구형 스트로크 감지 — 자동 마이그레이션 실행')
            if (needsCh) state.choseong = migrateMap(state.choseong) as typeof state.choseong
            if (needsJu) state.jungseong = migrateMap(state.jungseong) as typeof state.jungseong
            if (needsJo) state.jongseong = migrateMap(state.jongseong) as typeof state.jongseong
          }

          state.setHydrated()
        }
      },
    }
  )
)
