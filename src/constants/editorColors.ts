import type { Part } from '../types'

// 파트별 색상 (초성, 중성, 혼합중성, 종성)
export const PART_COLORS: Record<Part, string> = {
  CH: '#F3000E',
  JU: '#6596F3',
  JU_H: '#6596F3',
  JU_V: '#6596F3',
  JO: '#F5BF0F',
}

// 포인트/획 편집 색상
export const STROKE_SELECTED_COLOR = '#ff6b6b'   // 선택된 획
export const POINT_STRAIGHT_COLOR = '#4ecdc4'     // 직선 포인트
export const POINT_CURVE_COLOR = '#c084fc'        // 곡선 포인트
export const POINT_ACTIVE_COLOR = '#ff6b6b'       // 활성 포인트

// 패딩/오프셋 색상
export const PADDING_COLOR = '#D3A4EA'            // 기본 패딩 연보라
export const PADDING_DIRTY_COLOR = '#be6fde'      // 변경된 패딩
export const PADDING_MIXED_ALT_COLOR = '#c084fc'  // 혼합중성 세로부 패딩
export const PADDING_OVERRIDE_COLOR = '#be6fde'   // 레이아웃 패딩 오버라이드

// 기준선(Split) 색상
export const SPLIT_COLOR = '#D3A4EA' //연보라

// 스냅 피드백 색상
export const SNAP_GRID_COLOR = '#4ecdc4'
export const SNAP_ORIGIN_COLOR = '#ff9500'

// 파트 오프셋 핸들 색상
export const PART_OFFSET_COLOR = '#38bdf8'

// 캔버스 그리드 색상
export const GRID_MINOR_COLOR = '#f0f0f05e'      // 0.025 소그리드
export const GRID_MAJOR_COLOR = '#f0f0f05e'       // 0.1 대그리드
