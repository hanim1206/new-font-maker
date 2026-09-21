import type { NotoPresetGlyph } from './notoPresetGlyphs'

/**
 * Noto 실측 기준선. 레이아웃 캔버스가 기준선으로 그리고 스냅 후보로 쓰며, 획 편집 캔버스도 같은 목록을 뒤에 깔고 같은 규칙으로 걸린다.
 */
const BASELINE_RAILS: Record<string, { axis: 'x' | 'y'; label: string }> = {
  'initial.roleFaces.left': { axis: 'x', label: 'CH 왼선' }, 'initial.roleFaces.right': { axis: 'x', label: 'CH 오른선' },
  'initial.roleFaces.top': { axis: 'y', label: 'CH 윗선' }, 'initial.roleFaces.bottom': { axis: 'y', label: 'CH 밑선' },
  'final.roleFaces.right': { axis: 'x', label: 'JO 오른선' }, 'final.roleFaces.top': { axis: 'y', label: 'JO 윗선' },
  'medial.primaryBeam.face': { axis: 'y', label: 'JU 가로보' }, 'medial.upperBeam.face': { axis: 'y', label: 'JU 위보' }, 'medial.lowerBeam.face': { axis: 'y', label: 'JU 아래보' },
  'medial.baseStem.face': { axis: 'x', label: 'JU 줄기' }, 'medial.leftStem.face': { axis: 'x', label: 'JU 왼줄기' }, 'medial.rightStem.face': { axis: 'x', label: 'JU 오른줄기' },
}

export interface BaselineRail { id: string; axis: 'x' | 'y'; label: string; value: number }

export function baselineRails(glyph: NotoPresetGlyph): BaselineRail[] {
  return Object.entries(glyph.baselines).flatMap(([id, value]) => {
    const spec = BASELINE_RAILS[id]
    return spec && Number.isFinite(value) ? [{ id, axis: spec.axis, label: spec.label, value }] : []
  })
}
