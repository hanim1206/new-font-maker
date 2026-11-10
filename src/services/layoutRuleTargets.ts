/* eslint-disable */
/**
 * 배치 규칙 1차(박스 일치)의 자모별 목표값. 노토 몸통(왼 .05 · 오른 .89 · 위 .05 · 아래 .96)에서 잰 잉크 바깥 네모(em).
 * 지금 모델(노토 변화량 모델, 노토 xor 0.19)이 기본 획으로 그린 잉크의 가운데값이다 — 노토 윤곽을 직접 잰 것이 아니다.
 * 표본: 첫닿자 19 × 오른홀자 9 × 받침 27 + 받침 없는 171자 = 4788자.
 * 만든 날: 2026-11-08. 다시 만들기: scripts/layout-rules/measure-targets.ts (파일 머리 참고).
 */

export interface ChoTarget { left: number; right: number; top: number; twoStemScale: number; bottomNoFinal: number }
export interface JungTarget { left: number; right: number; leftNextToDouble: number; rightFollowsLeft: number }
export interface JongTarget { left: number; right: number; top: number; bottom: number; pillarReach: number }

/** 첫닿자: 기둥 하나짜리 홀자 옆의 왼 · 오른 · 위, 두 기둥 홀자 옆 폭 비율, 받침 없을 때 아래. */
export const CHO_TARGET: Record<string, ChoTarget> = {
  "ㄱ": {
    "left": 0.098,
    "right": 0.514,
    "top": 0.108,
    "twoStemScale": 0.827,
    "bottomNoFinal": 0.786
  },
  "ㄲ": {
    "left": 0.07,
    "right": 0.563,
    "top": 0.109,
    "twoStemScale": 0.849,
    "bottomNoFinal": 0.812
  },
  "ㄴ": {
    "left": 0.094,
    "right": 0.583,
    "top": 0.103,
    "twoStemScale": 0.787,
    "bottomNoFinal": 0.731
  },
  "ㄷ": {
    "left": 0.093,
    "right": 0.491,
    "top": 0.111,
    "twoStemScale": 0.835,
    "bottomNoFinal": 0.742
  },
  "ㄸ": {
    "left": 0.072,
    "right": 0.584,
    "top": 0.111,
    "twoStemScale": 0.843,
    "bottomNoFinal": 0.729
  },
  "ㄹ": {
    "left": 0.086,
    "right": 0.488,
    "top": 0.1,
    "twoStemScale": 0.838,
    "bottomNoFinal": 0.741
  },
  "ㅁ": {
    "left": 0.09,
    "right": 0.508,
    "top": 0.111,
    "twoStemScale": 0.838,
    "bottomNoFinal": 0.728
  },
  "ㅂ": {
    "left": 0.09,
    "right": 0.509,
    "top": 0.1,
    "twoStemScale": 0.837,
    "bottomNoFinal": 0.739
  },
  "ㅃ": {
    "left": 0.062,
    "right": 0.602,
    "top": 0.103,
    "twoStemScale": 0.862,
    "bottomNoFinal": 0.738
  },
  "ㅅ": {
    "left": 0.049,
    "right": 0.572,
    "top": 0.093,
    "twoStemScale": 0.858,
    "bottomNoFinal": 0.767
  },
  "ㅆ": {
    "left": 0.033,
    "right": 0.647,
    "top": 0.103,
    "twoStemScale": 0.872,
    "bottomNoFinal": 0.76
  },
  "ㅇ": {
    "left": 0.062,
    "right": 0.537,
    "top": 0.098,
    "twoStemScale": 0.861,
    "bottomNoFinal": 0.754
  },
  "ㅈ": {
    "left": 0.07,
    "right": 0.551,
    "top": 0.11,
    "twoStemScale": 0.844,
    "bottomNoFinal": 0.783
  },
  "ㅉ": {
    "left": 0.066,
    "right": 0.614,
    "top": 0.109,
    "twoStemScale": 0.847,
    "bottomNoFinal": 0.776
  },
  "ㅊ": {
    "left": 0.076,
    "right": 0.557,
    "top": 0.053,
    "twoStemScale": 0.846,
    "bottomNoFinal": 0.783
  },
  "ㅋ": {
    "left": 0.102,
    "right": 0.507,
    "top": 0.098,
    "twoStemScale": 0.866,
    "bottomNoFinal": 0.809
  },
  "ㅌ": {
    "left": 0.09,
    "right": 0.499,
    "top": 0.105,
    "twoStemScale": 0.818,
    "bottomNoFinal": 0.741
  },
  "ㅍ": {
    "left": 0.07,
    "right": 0.549,
    "top": 0.112,
    "twoStemScale": 0.845,
    "bottomNoFinal": 0.738
  },
  "ㅎ": {
    "left": 0.049,
    "right": 0.586,
    "top": 0.051,
    "twoStemScale": 0.842,
    "bottomNoFinal": 0.756
  }
}

/** 첫닿자 아래 = 받침 윗면 − 두께 × (첫닿자 틈 + 받침 잔차). */
export const CHO_GAP: Record<string, number> = {
  "ㄱ": 0.368,
  "ㄲ": 0.601,
  "ㄴ": 1.376,
  "ㄷ": 1.254,
  "ㄸ": 1.278,
  "ㄹ": 1.045,
  "ㅁ": 1.41,
  "ㅂ": 1.274,
  "ㅃ": 1.228,
  "ㅅ": 0.719,
  "ㅆ": 0.997,
  "ㅇ": 1.166,
  "ㅈ": 0.657,
  "ㅉ": 0.833,
  "ㅊ": 0.715,
  "ㅋ": 0.228,
  "ㅌ": 1.148,
  "ㅍ": 1.091,
  "ㅎ": 0.721
}
export const JONG_GAP_OFFSET: Record<string, number> = {
  "ㄱ": 0.227,
  "ㄲ": 0.124,
  "ㄳ": -0.153,
  "ㄴ": 0.05,
  "ㄵ": 0.098,
  "ㄶ": -0.433,
  "ㄷ": 0.209,
  "ㄹ": -0.034,
  "ㄺ": 0.018,
  "ㄻ": 0.014,
  "ㄼ": 0.009,
  "ㄽ": -0.053,
  "ㄾ": 0.027,
  "ㄿ": 0.056,
  "ㅀ": -0.474,
  "ㅁ": 0.158,
  "ㅂ": -0.059,
  "ㅄ": -0.027,
  "ㅅ": -0.241,
  "ㅆ": -0.035,
  "ㅇ": -0.004,
  "ㅈ": 0.189,
  "ㅊ": -0.355,
  "ㅋ": 0.179,
  "ㅌ": 0.034,
  "ㅍ": 0.061,
  "ㅎ": -0.594
}

/** 왼가지 홀자(ㅓ ㅕ ㅔ ㅖ)의 왼면 = 첫닿자 오른면 + (첫닿자별 파고듦 + 홀자별 잔차). 음수면 첫닿자 안쪽으로 들어온다. */
export const BRANCH_INSET_BY_CHO: Record<string, number> = {
  "ㄱ": -0.033,
  "ㄲ": -0.044,
  "ㄴ": -0.111,
  "ㄷ": -0.027,
  "ㄸ": -0.033,
  "ㄹ": 0.041,
  "ㅁ": -0.026,
  "ㅂ": -0.029,
  "ㅃ": -0.026,
  "ㅅ": -0.062,
  "ㅆ": -0.069,
  "ㅇ": -0.047,
  "ㅈ": -0.033,
  "ㅉ": -0.023,
  "ㅊ": -0.031,
  "ㅋ": -0.04,
  "ㅌ": 0.017,
  "ㅍ": -0.017,
  "ㅎ": -0.024
}
export const BRANCH_INSET_BY_JUNG: Record<string, number> = {
  "ㅓ": 0.002,
  "ㅔ": -0.006,
  "ㅕ": 0.005,
  "ㅖ": 0
}

/** 홀자: 왼 · 오른, 쌍자음 옆의 왼면, 왼면이 밀릴 때 오른면(기둥)이 따라오는 비율(ㅔ ㅖ만 뜻이 있다 — 왼 기둥이 밀리면 기둥도 얼마쯤 같이 밀린다). */
export const JUNG_TARGET: Record<string, JungTarget> = {
  "ㅏ": {
    "left": 0.668,
    "right": 0.882,
    "leftNextToDouble": 0.675,
    "rightFollowsLeft": 0.019
  },
  "ㅐ": {
    "left": 0.538,
    "right": 0.813,
    "leftNextToDouble": 0.57,
    "rightFollowsLeft": 0.335
  },
  "ㅑ": {
    "left": 0.667,
    "right": 0.881,
    "leftNextToDouble": 0.674,
    "rightFollowsLeft": -0.116
  },
  "ㅒ": {
    "left": 0.537,
    "right": 0.814,
    "leftNextToDouble": 0.569,
    "rightFollowsLeft": 0.334
  },
  "ㅓ": {
    "left": 0.516,
    "right": 0.791,
    "leftNextToDouble": 0.561,
    "rightFollowsLeft": 0.1
  },
  "ㅔ": {
    "left": 0.424,
    "right": 0.814,
    "leftNextToDouble": 0.488,
    "rightFollowsLeft": 0.088
  },
  "ㅕ": {
    "left": 0.519,
    "right": 0.789,
    "leftNextToDouble": 0.57,
    "rightFollowsLeft": 0.088
  },
  "ㅖ": {
    "left": 0.419,
    "right": 0.814,
    "leftNextToDouble": 0.495,
    "rightFollowsLeft": 0.13
  },
  "ㅣ": {
    "left": 0.708,
    "right": 0.778,
    "leftNextToDouble": 0.715,
    "rightFollowsLeft": 1
  }
}

/** 받침: 네 변과 기둥 끝(받침 윗면 대비, + = 아래). */
export const JONG_TARGET: Record<string, JongTarget> = {
  "ㄱ": {
    "left": 0.188,
    "right": 0.797,
    "top": 0.638,
    "bottom": 0.958,
    "pillarReach": -0.044
  },
  "ㄲ": {
    "left": 0.157,
    "right": 0.797,
    "top": 0.623,
    "bottom": 0.96,
    "pillarReach": -0.039
  },
  "ㄳ": {
    "left": 0.148,
    "right": 0.865,
    "top": 0.603,
    "bottom": 0.965,
    "pillarReach": -0.019
  },
  "ㄴ": {
    "left": 0.211,
    "right": 0.823,
    "top": 0.655,
    "bottom": 0.938,
    "pillarReach": 0.067
  },
  "ㄵ": {
    "left": 0.151,
    "right": 0.846,
    "top": 0.621,
    "bottom": 0.966,
    "pillarReach": -0.037
  },
  "ㄶ": {
    "left": 0.147,
    "right": 0.852,
    "top": 0.568,
    "bottom": 0.961,
    "pillarReach": -0.025
  },
  "ㄷ": {
    "left": 0.194,
    "right": 0.811,
    "top": 0.629,
    "bottom": 0.948,
    "pillarReach": -0.044
  },
  "ㄹ": {
    "left": 0.203,
    "right": 0.829,
    "top": 0.569,
    "bottom": 0.948,
    "pillarReach": -0.043
  },
  "ㄺ": {
    "left": 0.155,
    "right": 0.796,
    "top": 0.573,
    "bottom": 0.957,
    "pillarReach": -0.045
  },
  "ㄻ": {
    "left": 0.142,
    "right": 0.797,
    "top": 0.574,
    "bottom": 0.958,
    "pillarReach": -0.045
  },
  "ㄼ": {
    "left": 0.138,
    "right": 0.796,
    "top": 0.573,
    "bottom": 0.953,
    "pillarReach": -0.045
  },
  "ㄽ": {
    "left": 0.153,
    "right": 0.864,
    "top": 0.568,
    "bottom": 0.965,
    "pillarReach": -0.041
  },
  "ㄾ": {
    "left": 0.147,
    "right": 0.814,
    "top": 0.574,
    "bottom": 0.954,
    "pillarReach": -0.046
  },
  "ㄿ": {
    "left": 0.146,
    "right": 0.823,
    "top": 0.576,
    "bottom": 0.953,
    "pillarReach": -0.048
  },
  "ㅀ": {
    "left": 0.141,
    "right": 0.837,
    "top": 0.539,
    "bottom": 0.96,
    "pillarReach": -0.016
  },
  "ㅁ": {
    "left": 0.205,
    "right": 0.797,
    "top": 0.624,
    "bottom": 0.946,
    "pillarReach": -0.043
  },
  "ㅂ": {
    "left": 0.208,
    "right": 0.797,
    "top": 0.592,
    "bottom": 0.946,
    "pillarReach": -0.042
  },
  "ㅄ": {
    "left": 0.156,
    "right": 0.871,
    "top": 0.589,
    "bottom": 0.959,
    "pillarReach": -0.037
  },
  "ㅅ": {
    "left": 0.155,
    "right": 0.848,
    "top": 0.612,
    "bottom": 0.954,
    "pillarReach": 0.051
  },
  "ㅆ": {
    "left": 0.1,
    "right": 0.873,
    "top": 0.611,
    "bottom": 0.961,
    "pillarReach": -0.029
  },
  "ㅇ": {
    "left": 0.195,
    "right": 0.802,
    "top": 0.621,
    "bottom": 0.956,
    "pillarReach": -0.014
  },
  "ㅈ": {
    "left": 0.165,
    "right": 0.84,
    "top": 0.624,
    "bottom": 0.955,
    "pillarReach": -0.047
  },
  "ㅊ": {
    "left": 0.163,
    "right": 0.843,
    "top": 0.55,
    "bottom": 0.954,
    "pillarReach": 0.022
  },
  "ㅋ": {
    "left": 0.158,
    "right": 0.796,
    "top": 0.626,
    "bottom": 0.96,
    "pillarReach": -0.042
  },
  "ㅌ": {
    "left": 0.195,
    "right": 0.819,
    "top": 0.575,
    "bottom": 0.948,
    "pillarReach": -0.046
  },
  "ㅍ": {
    "left": 0.176,
    "right": 0.816,
    "top": 0.617,
    "bottom": 0.948,
    "pillarReach": -0.035
  },
  "ㅎ": {
    "left": 0.177,
    "right": 0.813,
    "top": 0.527,
    "bottom": 0.956,
    "pillarReach": 0.02
  }
}

/** 받침 왼 · 오른면의 홀자별 치우침. */
export const JONG_LEFT_BY_JUNG: Record<string, number> = {
  "ㅏ": -0.021,
  "ㅐ": 0.01,
  "ㅑ": -0.023,
  "ㅒ": 0.009,
  "ㅓ": -0.001,
  "ㅔ": 0.01,
  "ㅕ": -0.001,
  "ㅖ": 0.009,
  "ㅣ": -0.001
}
export const JONG_RIGHT_BY_JUNG: Record<string, number> = {
  "ㅏ": -0.037,
  "ㅐ": 0.016,
  "ㅑ": -0.038,
  "ㅒ": 0.017,
  "ㅓ": -0.003,
  "ㅔ": 0.017,
  "ㅕ": -0.004,
  "ㅖ": 0.017,
  "ㅣ": -0.007
}

/** 받침 윗면의 첫닿자별 치우침(+ = 아래). ㅎ처럼 키 큰 첫닿자가 받침을 민다. */
export const JONG_TOP_BY_CHO: Record<string, number> = {
  "ㄱ": -0.007,
  "ㄲ": 0,
  "ㄴ": -0.001,
  "ㄷ": -0.001,
  "ㄸ": 0,
  "ㄹ": 0.009,
  "ㅁ": -0.001,
  "ㅂ": 0,
  "ㅃ": 0.001,
  "ㅅ": 0,
  "ㅆ": 0,
  "ㅇ": -0.001,
  "ㅈ": 0,
  "ㅉ": 0.001,
  "ㅊ": 0.011,
  "ㅋ": 0,
  "ㅌ": 0.01,
  "ㅍ": 0,
  "ㅎ": 0.023
}

/** 첫닿자 윗면의 받침별 치우침(+ = 아래)과, 그 뒤 남는 홀자별 잔차. */
export const CHO_TOP_BY_JONG: Record<string, number> = {
  "ㄱ": 0.007,
  "ㄲ": 0.005,
  "ㄳ": 0.005,
  "ㄴ": 0.019,
  "ㄵ": 0.005,
  "ㄶ": 0,
  "ㄷ": 0.005,
  "ㄹ": -0.006,
  "ㄺ": -0.006,
  "ㄻ": -0.006,
  "ㄼ": -0.006,
  "ㄽ": -0.006,
  "ㄾ": -0.006,
  "ㄿ": -0.006,
  "ㅀ": -0.006,
  "ㅁ": 0.005,
  "ㅂ": 0,
  "ㅄ": -0.001,
  "ㅅ": 0.012,
  "ㅆ": 0.005,
  "ㅇ": 0.011,
  "ㅈ": 0.005,
  "ㅊ": -0.005,
  "ㅋ": 0.005,
  "ㅌ": -0.006,
  "ㅍ": 0.005,
  "ㅎ": -0.006
}
export const CHO_TOP_BY_JUNG: Record<string, number> = {
  "ㅏ": 0,
  "ㅐ": 0.006,
  "ㅑ": 0,
  "ㅒ": 0.006,
  "ㅓ": -0.001,
  "ㅔ": 0.005,
  "ㅕ": -0.002,
  "ㅖ": 0.005,
  "ㅣ": 0
}

/** 받침 없을 때 홀자 기둥 아래. */
export const PILLAR_BOTTOM_NO_FINAL = 0.958
