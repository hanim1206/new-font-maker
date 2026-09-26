import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { CHOSEONG_LIST, JONGSEONG_LIST, JUNGSEONG_LIST } from '../data/Hangul'

/**
 * 도마. 편집기로 들고 들어가는 자소 묶음 — 폰트당 하나, 이름 없음.
 * 섹션 홈에서 묶음을 올리거나 카드로 빼고 넣고, 대시보드 자소 카드는 그 자소 하나만 올린다. 둘 다 들어갈 때 도마를 교체한다.
 * 편집기 머리 아래 칩 줄이 이 저장소를 읽고, 칩은 자소 전환만 한다(담기 · 빼기는 홈에서만).
 * 플랜: docs/plans/2026-09-26_섹션-홈과-도마.md
 */

export type WorkbenchJamoType = 'choseong' | 'jungseong' | 'jongseong'

interface WorkbenchState {
  type: WorkbenchJamoType | null
  /** ㄱㄴㄷ 순. 묶기 순서를 따르지 않는다(위치 기억). */
  chars: string[]
  /** 편집기 `‹`가 돌아갈 주소. 섹션 홈에서 들어가면 그 홈(`/dashboard/choseong?group=stem`), 아니면 없음(대시보드). 한 번 쓰면 비운다. */
  returnTo: string | null
}

interface WorkbenchActions {
  /** 도마를 통째로 바꾼다. 비면 지운다. `returnTo`는 편집기에서 돌아갈 곳(편집기로 들고 갈 때만 준다). */
  place: (type: WorkbenchJamoType, chars: readonly string[], returnTo?: string | null) => void
  /** 돌아갈 곳을 꺼내고 비운다. */
  takeReturnTo: () => string | null
  /** 카드 하나 담기 · 빼기. 다른 종류의 자소면 도마를 그 하나로 바꾼다. */
  toggle: (type: WorkbenchJamoType, char: string) => void
  clear: () => void
}

const LISTS: Record<WorkbenchJamoType, readonly string[]> = { choseong: CHOSEONG_LIST, jungseong: JUNGSEONG_LIST, jongseong: JONGSEONG_LIST }

function sorted(type: WorkbenchJamoType, chars: Iterable<string>): string[] {
  const list = LISTS[type]
  return [...new Set(chars)].filter((char) => list.includes(char)).sort((a, b) => list.indexOf(a) - list.indexOf(b))
}

/** 자소 하나를 편집기에서 열 대표 글자. 초성은 ㅏ와, 홀자는 ㅇ 아래, 받침은 `아` 밑에. */
export function workbenchSyllable(type: WorkbenchJamoType, char: string): string {
  const cho = type === 'choseong' ? CHOSEONG_LIST.indexOf(char as (typeof CHOSEONG_LIST)[number]) : CHOSEONG_LIST.indexOf('ㅇ')
  const jung = type === 'jungseong' ? JUNGSEONG_LIST.indexOf(char as (typeof JUNGSEONG_LIST)[number]) : JUNGSEONG_LIST.indexOf('ㅏ')
  const jong = type === 'jongseong' ? JONGSEONG_LIST.indexOf(char as (typeof JONGSEONG_LIST)[number]) : 0
  if (cho < 0 || jung < 0 || jong < 0) return char
  return String.fromCharCode(0xac00 + (cho * 21 + jung) * 28 + jong)
}

/** 글자에서 도마 종류의 자소를 꺼낸다. 완성형이 아니면 글자 그대로(자소 단독). */
export function workbenchJamoOf(type: WorkbenchJamoType, char: string): string | null {
  const code = char.codePointAt(0) ?? 0
  if (code < 0xac00 || code > 0xd7a3) return LISTS[type].includes(char) ? char : null
  const index = code - 0xac00
  if (type === 'choseong') return CHOSEONG_LIST[Math.floor(index / (21 * 28))]
  if (type === 'jungseong') return JUNGSEONG_LIST[Math.floor((index % (21 * 28)) / 28)]
  const jong = JONGSEONG_LIST[index % 28]
  return jong === '' ? null : jong
}

export const useWorkbenchStore = create<WorkbenchState & WorkbenchActions>()(
  persist(
    immer((set, get) => ({
      type: null,
      chars: [],
      returnTo: null,

      place: (type, chars, returnTo) =>
        set((state) => {
          const next = sorted(type, chars)
          state.type = next.length ? type : null
          state.chars = next
          if (returnTo !== undefined) state.returnTo = returnTo
        }),

      takeReturnTo: () => {
        const to = get().returnTo
        if (to !== null) set((state) => { state.returnTo = null })
        return to
      },

      toggle: (type, char) =>
        set((state) => {
          if (state.type !== type) {
            state.type = type
            state.chars = sorted(type, [char])
            return
          }
          const next = state.chars.includes(char) ? state.chars.filter((c) => c !== char) : sorted(type, [...state.chars, char])
          state.chars = next
          if (!next.length) state.type = null
        }),

      clear: () => set((state) => { state.type = null; state.chars = []; state.returnTo = null }),
    })),
    { name: 'font-maker-workbench', version: 1 },
  ),
)
