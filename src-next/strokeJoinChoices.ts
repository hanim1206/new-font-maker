import type { StrokeLinejoin } from '../src/types'

/**
 * 꺾임 셋. 뾰족은 뾰족 한계 손잡이가 따로 있고, 둥긂은 손잡이 없이 꼭짓점 중심 반폭 원호다(둥글기 막대와 독립 — 막대만으로는 예각이 안 둥글어진다).
 * 전역 `획` 탭과 획 편집 `스타일` 패널이 같은 순서 · 같은 이름으로 쓴다.
 */
export const JOIN_CHOICES: Array<{ id: StrokeLinejoin; label: string }> = [
  { id: 'miter', label: '뾰족' }, { id: 'bevel', label: '깎음' }, { id: 'round', label: '둥긂' },
]
