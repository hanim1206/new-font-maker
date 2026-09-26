import { useMemo } from 'react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import type { Part, ResolvedInkSource } from '../types'
import type { StemBeakStyle } from '../services/stemBeak'
import type { WorkbenchJamoType } from './workbenchStore'

/**
 * 사용자 묶음. 이름 붙은 자소 목록 하나를 스타일 전파와 (나중에) 레이아웃 규칙이 같이 부른다.
 * 규칙은 묶음을 이름(id)으로 가리킨다 — 묶음에 글자를 넣으면 그 글자도 묶음 값을 바로 따른다.
 * 묶음으로 퍼지는 건 스타일 값뿐이다(지금은 부리). 점 편집은 같은 자모 안에서만 퍼진다.
 * 한 글자가 두 묶음에 들면 글자 수가 적은 묶음이 이기고, 같으면 나중에 값을 준 쪽이 이긴다.
 * 플랜: docs/plans/2026-09-26_사용자-묶음.md
 */

export interface JamoGroup {
  id: string
  name: string
  type: WorkbenchJamoType
  /** 도마와 같은 ㄱㄴㄷ 순. */
  chars: string[]
  /** 이 묶음의 부리. 없으면 전역 값을 따른다. 꺼진 부리(`enabled: false`)도 값이다 — 전역에 부리가 있어도 이 묶음은 뺀다. */
  stemBeak?: StemBeakStyle
  /** 스타일 값을 마지막으로 준 때. 같은 크기 묶음끼리 부딪히면 나중 쪽이 이긴다. */
  styledAt?: number
}

interface JamoGroupState {
  groups: JamoGroup[]
  /** 막대를 끄는 동안의 미리보기. 저장하지 않는다. */
  previewBeak: { groupId: string; beak: StemBeakStyle } | null
}

interface JamoGroupActions {
  create: (type: WorkbenchJamoType, name: string, chars: readonly string[]) => string
  rename: (id: string, name: string) => void
  setChars: (id: string, chars: readonly string[]) => void
  /** 지우고 지운 묶음과 자리를 돌려준다(되돌리기용). */
  remove: (id: string) => { group: JamoGroup; index: number } | null
  restore: (group: JamoGroup, index: number) => void
  setStemBeak: (id: string, beak: StemBeakStyle | undefined) => void
  setPreviewBeak: (preview: { groupId: string; beak: StemBeakStyle } | null) => void
}

export function sameChars(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((char) => b.includes(char))
}

/** 도마와 글자가 똑같은 묶음. 편집기는 이걸로 `이 묶음에 적용`을 켠다. */
export function groupMatching(groups: readonly JamoGroup[], type: WorkbenchJamoType | null, chars: readonly string[]): JamoGroup | null {
  if (!type || chars.length === 0) return null
  return groups.find((group) => group.type === type && sameChars(group.chars, chars)) ?? null
}

export function partJamoType(part: Part): WorkbenchJamoType {
  return part === 'CH' ? 'choseong' : part === 'JO' ? 'jongseong' : 'jungseong'
}

/**
 * 한 자소에 먹는 묶음 부리. 부리를 가진 묶음 가운데 글자 수가 가장 적은 것, 같으면 나중에 값을 준 것.
 * 없으면 `undefined` — 전역 부리를 따른다.
 */
export function groupStemBeakFor(
  groups: readonly JamoGroup[],
  type: WorkbenchJamoType,
  char: string,
  preview: JamoGroupState['previewBeak'] = null,
): StemBeakStyle | undefined {
  let best: { group: JamoGroup; beak: StemBeakStyle; at: number } | null = null
  for (const group of groups) {
    if (group.type !== type || !group.chars.includes(char)) continue
    const previewing = preview?.groupId === group.id
    const beak = previewing ? preview.beak : group.stemBeak
    if (!beak) continue
    const at = previewing ? Number.MAX_SAFE_INTEGER : group.styledAt ?? 0
    if (!best || group.chars.length < best.group.chars.length || (group.chars.length === best.group.chars.length && at > best.at)) best = { group, beak, at }
  }
  return best?.beak
}

export type GroupBeakResolver = (source: ResolvedInkSource) => StemBeakStyle | undefined

export function groupBeakResolverOf(groups: readonly JamoGroup[], preview: JamoGroupState['previewBeak'] = null): GroupBeakResolver {
  if (!groups.some((group) => group.stemBeak || preview?.groupId === group.id)) return () => undefined
  return (source) => groupStemBeakFor(groups, partJamoType(source.part), source.jamoId, preview)
}

/** 화면용 구독판. 묶음 · 미리보기가 바뀔 때만 새 함수가 된다. */
export function useGroupBeakResolver(): GroupBeakResolver {
  const groups = useJamoGroupStore((state) => state.groups)
  const preview = useJamoGroupStore((state) => state.previewBeak)
  return useMemo(() => groupBeakResolverOf(groups, preview), [groups, preview])
}

let seq = 0
const newId = () => `g${Date.now().toString(36)}${(seq++).toString(36)}`

export const useJamoGroupStore = create<JamoGroupState & JamoGroupActions>()(
  persist(
    immer((set, get) => ({
      groups: [],
      previewBeak: null,

      create: (type, name, chars) => {
        const id = newId()
        set((state) => { state.groups.push({ id, name: name.trim() || chars.join(' '), type, chars: [...chars] }) })
        return id
      },

      rename: (id, name) => set((state) => {
        const group = state.groups.find((g) => g.id === id)
        if (group && name.trim()) group.name = name.trim()
      }),

      setChars: (id, chars) => set((state) => {
        const group = state.groups.find((g) => g.id === id)
        if (group && chars.length) group.chars = [...chars]
      }),

      remove: (id) => {
        const index = get().groups.findIndex((g) => g.id === id)
        if (index < 0) return null
        const group = get().groups[index]
        set((state) => { state.groups.splice(index, 1) })
        return { group, index }
      },

      restore: (group, index) => set((state) => {
        if (state.groups.some((g) => g.id === group.id)) return
        state.groups.splice(Math.min(index, state.groups.length), 0, group)
      }),

      setStemBeak: (id, beak) => set((state) => {
        const group = state.groups.find((g) => g.id === id)
        if (!group) return
        group.stemBeak = beak
        group.styledAt = Date.now()
      }),

      setPreviewBeak: (preview) => set((state) => { state.previewBeak = preview }),
    })),
    {
      name: 'font-maker-jamo-groups',
      version: 1,
      partialize: (state) => ({ groups: state.groups }),
    },
  ),
)
