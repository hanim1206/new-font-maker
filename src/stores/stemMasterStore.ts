import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { applyMaster, boundStrokesOf, refollow as refollowStroke, type JamoChannel, type StemMaster, type StemMasterName, type StemMasters } from '../services/stemMaster'
import type { JamoData } from '../types'
import { withFrameFrom } from '../utils/jamoFrame'
import { useJamoStore } from './jamoStore'

/**
 * 홀자 줄기 마스터 저장. 마스터를 바꾸면 그 순간 따르던 홀자 획을 전부 새 인스턴스로 다시 쓴다(연결) — 획 데이터 형식은 그대로다.
 * 따름 · 풀림은 저장하지 않고 획에서 잰다: 인스턴스를 다시 만들어도 같으면 따르는 것. 자소 편집에서 점을 만지면 저절로 풀린다.
 * 처음 인스턴스를 쓸 때 자모에 틀이 없으면 곧은 획을 틀로 굳힌다 — 휜 획이 상자를 키우지 않게.
 * 지금은 이 기기(localStorage)에만 남는다. 폰트 데이터에 싣는 건 플랜 D0 미결정.
 * 플랜: docs/plans/2026-09-29_홀자-줄기-마스터.md
 */

interface StemMasterState {
  masters: StemMasters
}

interface StemMasterActions {
  /** 마스터를 바꾸고 따르던 형제 획을 전부 옮긴다. */
  setMaster: (master: StemMaster) => void
  /** 마스터를 지운다(곧게). `기둥.안쪽`을 지우면 안쪽 기둥은 다시 기둥을 따른다. */
  resetMaster: (name: StemMasterName) => void
  /** 풀린 획 하나를 다시 마스터에 붙인다. */
  refollow: (char: string, channel: JamoChannel, strokeId: string) => void
  /** 이 이름의 풀린 획을 전부 다시 붙인다. */
  refollowAll: (name: StemMasterName) => void
}

function propagate(before: StemMasters, after: StemMasters): void {
  const jamoStore = useJamoStore.getState()
  for (const [char, jamo] of Object.entries(jamoStore.jungseong)) {
    const next = applyMaster(jamo, before, after)
    if (next) jamoStore.updateJungseong(char, withFrameFrom(next, jamo))
  }
}

export const useStemMasterStore = create<StemMasterState & StemMasterActions>()(
  persist(
    immer((set, get) => ({
      masters: {},

      setMaster: (master) => {
        const before = get().masters
        const after: StemMasters = { ...before, [master.name]: master }
        set((state) => { state.masters = after })
        propagate(before, after)
      },

      resetMaster: (name) => {
        const before = get().masters
        if (!before[name]) return
        const after: StemMasters = { ...before }
        delete after[name]
        set((state) => { state.masters = after })
        propagate(before, after)
      },

      refollow: (char, channel, strokeId) => {
        const jamoStore = useJamoStore.getState()
        const jamo = jamoStore.jungseong[char]
        if (!jamo) return
        const next = refollowStroke(jamo, get().masters, channel, strokeId)
        if (next) jamoStore.updateJungseong(char, withFrameFrom(next, jamo))
      },

      refollowAll: (name) => {
        const jamoStore = useJamoStore.getState()
        const masters = get().masters
        for (const [char, jamo] of Object.entries(jamoStore.jungseong)) {
          let next: JamoData = jamo
          for (const item of boundStrokesOf(jamo, masters)) {
            if (item.name !== name || item.follows) continue
            next = refollowStroke(next, masters, item.channel, item.stroke.id) ?? next
          }
          if (next !== jamo) jamoStore.updateJungseong(char, withFrameFrom(next, jamo))
        }
      },
    })),
    { name: 'font-maker-stem-masters', partialize: (state) => ({ masters: state.masters }) },
  ),
)
