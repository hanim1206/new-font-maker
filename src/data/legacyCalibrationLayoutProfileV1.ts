import type { LayoutSchema, LayoutType } from '../types'

export type LegacyCalibrationLayoutProfileV1 = Partial<
  Record<LayoutType, LayoutSchema['userPartOverrides']>
>

export const LEGACY_CALIBRATION_LAYOUT_PROFILE_V1: LegacyCalibrationLayoutProfileV1 = {
  'choseong-jungseong-horizontal-jongseong': {
    CH: { top: .025, bottom: .015, left: .11, right: .11 },
    JU: { top: -.045, bottom: -.035, left: .01, right: -.01 },
    JO: { top: -.01, bottom: .01, left: .085, right: .08 },
  },
  'choseong-jungseong-vertical-jongseong': {
    CH: { top: .065, bottom: .035, left: .105, right: .125 },
    JU: { top: -.01, bottom: .01, left: -.09, right: .15 },
    JO: { top: .005, bottom: .035, left: .11, right: .12 },
  },
  'choseong-jungseong-vertical': {
    CH: { top: .045, bottom: .045, left: .105, right: .105 },
    JU: { top: 0, bottom: 0, left: -.06, right: .06 },
  },
  'choseong-jungseong-horizontal': {
    CH: { top: .1, bottom: -.03, left: .06, right: .1 },
    JU: { top: .125, bottom: .005, left: -.005, right: .005 },
  },
  'choseong-jungseong-mixed': {
    CH: { top: 0, bottom: 0, left: .075, right: .025 },
  },
  'choseong-jungseong-mixed-jongseong': {
    CH: { top: 0, bottom: 0, left: .025, right: .025 },
  },
}
