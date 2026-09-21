import type { DeepReadonly, JamoData, JamoFrame } from '../types'

/**
 * 자소 기준 틀. 자소를 상자에 놓는 계산은 "획 전체의 범위"를 상자에 꽉 채운다. 그래서 획 하나를 범위 밖으로 옮기면 범위가 커지고 나머지 획이 같이 줄어든다.
 * 사용자가 자모를 처음 고칠 때 고치기 전 획을 틀로 굳혀 두면, 그 뒤로는 틀이 상자에 맞고 획은 틀 안팎을 자유롭게 움직인다.
 * 틀은 좌표 네 개가 아니라 획 사본이다 — 같은 맞춤 계산(끝 모양 · 두께 · 붓촉 보정 포함)을 사본에 그대로 돌리므로 굳히는 순간 어느 문맥에서도 상자가 안 바뀐다.
 */

const CHANNELS = ['strokes', 'horizontalStrokes', 'verticalStrokes', 'contextStrokes'] as const

/** 지금 획을 틀로 뜬다. */
export function frameOf(jamo: DeepReadonly<JamoData>): JamoFrame {
  const frame: JamoFrame = {}
  for (const channel of CHANNELS) {
    if (jamo[channel] !== undefined) Object.assign(frame, { [channel]: structuredClone(jamo[channel]) })
  }
  return frame
}

/** `after`에 틀이 없으면 `before`의 획으로 굳힌다. 이미 있으면 그대로. */
export function withFrameFrom(after: JamoData, before: DeepReadonly<JamoData>): JamoData {
  if (after.frame) return after
  return { ...after, frame: before.frame ? structuredClone(before.frame) as JamoFrame : frameOf(before) }
}

/** 틀을 지운다. 지금 획이 다시 상자를 꽉 채운다. */
export function withoutFrame(jamo: JamoData): JamoData {
  const next = { ...jamo }
  delete next.frame
  return next
}

/** 맞춤 계산이 획을 고르는 규칙(채널 · 문맥 계열)을 틀에도 그대로 쓰도록 틀을 자모 꼴로 돌려준다. 틀이 없으면 null. */
export function frameJamoOf(jamo: DeepReadonly<JamoData>): DeepReadonly<JamoData> | null {
  return jamo.frame ? { char: jamo.char, type: jamo.type, ...jamo.frame } : null
}
