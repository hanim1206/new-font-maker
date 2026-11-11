// 닿자 가족 캔버스의 저장(이 브라우저). 실험실 페이지와 글자 해부 팝업이 같이 쓴다.
import { getBaseJamo, useJamoStore } from '../src/stores/jamoStore'
import { emptyFamilyEdits, familyDeltas, FAMILY_STAGES, findFamilyLinks, presetConsonantStrokes, withFamilyDeltas } from '../src/services/jamoFamily'
import type { FamilyEdits } from '../src/services/jamoFamily'

export const FAMILY_STORE_KEY = 'family-lab-v1'

export const loadFamilyEdits = (): FamilyEdits => {
  try {
    const raw = localStorage.getItem(FAMILY_STORE_KEY)
    if (raw) { const v = JSON.parse(raw) as FamilyEdits; if (v && v.moves && v.cut) return v }
  } catch { /* 깨진 저장은 버린다 */ }
  return emptyFamilyEdits()
}

/** 가족 캔버스가 고친 꼴을 자모 저장에 넣는다. 가족 캔버스에서 넣은 자모만 기억해 두었다가, 손댐이 없어지면 프리셋으로 되돌린다. */
const APPLIED_KEY = 'family-lab-applied-v1'
export function applyFamilyEditsToStore(): string[] {
  const presets = presetConsonantStrokes((ch) => getBaseJamo('choseong', ch))
  const links = findFamilyLinks(presets)
  const edits = loadFamilyEdits()
  const store = useJamoStore.getState()
  let applied: string[] = []
  try { applied = JSON.parse(localStorage.getItem(APPLIED_KEY) ?? '[]') as string[] } catch { applied = [] }
  const now: string[] = []
  for (const ch of FAMILY_STAGES.flatMap((s) => s.members)) {
    const deltas = familyDeltas(presets, links, edits, ch)
    const cho = getBaseJamo('choseong', ch), jong = getBaseJamo('jongseong', ch)
    if (deltas) {
      if (cho) store.updateChoseong(ch, withFamilyDeltas(cho, deltas))
      if (jong) store.updateJongseong(ch, withFamilyDeltas(jong, deltas))
      now.push(ch)
    } else if (applied.includes(ch)) {
      if (cho) store.resetJamoChar('choseong', ch)
      if (jong) store.resetJamoChar('jongseong', ch)
    }
  }
  localStorage.setItem(APPLIED_KEY, JSON.stringify(now))
  return now
}

