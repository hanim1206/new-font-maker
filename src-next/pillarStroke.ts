import { fitPenStroke, PEN_STABILIZATION_MAX_WINDOW } from '../src/services/penStrokeFit'
import type { PenFitResult, PenPoint } from '../src/services/penStrokeFit'
import { boundStrokesOf, isUnder, type AxisPoint, type StemMaster } from '../src/services/stemMaster'
import type { JamoData } from '../src/types'

/**
 * 기둥 긋기 시험판의 계산. 학습 1단계 — 세로로 한 번 그은 선을 기둥 마스터로 바꿔 모든 홀자 기둥에 퍼뜨린다.
 * 모양(휨 · 기울기)은 그은 대로 살리고 손 떨림만 지운다. 길이 · 자리 · 굵기는 서비스가 정한다(하니무스 2026-11-20).
 * 기획: 고양이 `학습-단계-뼈대-2026-11-20.md`. 저장하지 않고 제품 값도 안 바꾼다.
 */

export type CalmLevel = 'light' | 'medium' | 'strong'

export interface CalmPreset {
  level: CalmLevel
  label: string
  /** 안정화 0–100(펜 실험실과 같은 눈금). */
  stabilization: number
  /** 곡선 맞춤 허용오차 — 펜 실험실 ε 후보 셋. */
  epsilon: number
}

/** 떨림 정리 세 벌. 중간이 앱 펜의 기본값(안정화 25 · ε 0.01 언저리)이다. */
export const CALM_PRESETS: readonly CalmPreset[] = [
  { level: 'light', label: '약하게', stabilization: 10, epsilon: 0.005 },
  { level: 'medium', label: '중간', stabilization: 25, epsilon: 0.01 },
  { level: 'strong', label: '세게', stabilization: 50, epsilon: 0.02 },
]

/** 그은 선을 이 길이(em)의 기둥으로 보고 휨을 잰다. 홀자 기둥이 대개 이쯤이다. 사람마다 긋는 길이가 달라도 휨의 비율은 같게 간다. */
export const PILLAR_REFERENCE_EM = 0.7
/** 이보다 짧으면 점을 찍은 것으로 본다(em). */
const MIN_LENGTH = 0.15
/** 그은 선의 기울기가 이 값(가로/세로)을 넘으면 세로선이 아니다. */
const MAX_SLOPE = 0.6
const FIT_THICKNESS = 0.07

export type PillarResult =
  | { ok: true; master: StemMaster; fit: PenFitResult }
  | { ok: false; reason: 'short' | 'not-vertical' | 'fit' }

/**
 * 그은 점(긋는 판 좌표, 판 높이 = 1em, 가로도 같은 눈금) → 기둥 마스터.
 * 아래에서 위로 그었으면 뒤집는다(기둥은 위에서 아래). 축은 시작점에서 곧게 내린 세로선이고, 끝점의 옆 어긋남(기울기)도 모양으로 담는다.
 */
export function pillarFromDrawn(raw: readonly PenPoint[], preset: CalmPreset): PillarResult {
  if (raw.length < 2) return { ok: false, reason: 'short' }
  const first = raw[0], last = raw[raw.length - 1]
  const dy = last.y - first.y
  const dx = last.x - first.x
  if (Math.abs(dy) < MIN_LENGTH) return { ok: false, reason: Math.abs(dx) >= MIN_LENGTH ? 'not-vertical' : 'short' }
  if (Math.abs(dx) / Math.abs(dy) > MAX_SLOPE) return { ok: false, reason: 'not-vertical' }
  const points = dy < 0 ? [...raw].reverse() : [...raw]
  const fit = fitPenStroke(points, {
    epsilon: preset.epsilon,
    smoothing: preset.stabilization / 100 * PEN_STABILIZATION_MAX_WINDOW,
    thickness: FIT_THICKNESS,
    id: `pillar-${preset.level}`,
  })
  if (!fit) return { ok: false, reason: 'fit' }
  const anchors = fit.stroke.points
  const start = anchors[0]
  const length = anchors[anchors.length - 1].y - start.y
  if (length <= 0) return { ok: false, reason: 'fit' }
  const scale = PILLAR_REFERENCE_EM / length
  // 축은 아래로(+y). 오프셋 +는 화면 오른쪽(+x)이다(`masterFromStroke`와 같은 셈).
  const toAxis = (point: PenPoint) => ({ t: (point.y - start.y) / length, o: (point.x - start.x) * scale })
  const lastIndex = anchors.length - 1
  const axisPoints: AxisPoint[] = anchors.map((point, index) => ({
    ...(index === 0 ? { t: 0, o: 0 } : index === lastIndex ? { t: 1, o: toAxis(point).o } : toAxis(point)),
    ...(point.handleIn ? { handleIn: toAxis(point.handleIn) } : {}),
    ...(point.handleOut ? { handleOut: toAxis(point.handleOut) } : {}),
  }))
  return { ok: true, master: { name: 'gidung', points: axisPoints }, fit }
}

/** 홀자마다 기둥 획 id. 색으로 "내 줄기가 쓰인 자리"를 보일 때 쓴다(`홀자:획id`). */
export function pillarStrokeKeys(jungseong: Readonly<Record<string, JamoData>>): Set<string> {
  const keys = new Set<string>()
  for (const [char, jamo] of Object.entries(jungseong)) {
    for (const item of boundStrokesOf(jamo, {})) if (isUnder(item.name, 'gidung')) keys.add(`${char}:${item.stroke.id}`)
  }
  return keys
}
