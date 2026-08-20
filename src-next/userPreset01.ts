import baseJamos from '../src/data/baseJamos.json'
import type { JamoData, LayoutType, Part, PartOverride, StrokeDataV2 } from '../src/types'

type FontLayoutProfile = Partial<Record<LayoutType, Partial<Record<Part, PartOverride>>>>

export const USER_PRESET_01_LAYOUT_PROFILE: FontLayoutProfile = {
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

type JamoType = JamoData['type']
export type JamoPresetMap = Record<JamoType, Record<string, JamoData>>

function cloneBase(type: JamoType, char: string): JamoData {
  return structuredClone((baseJamos[type] as Record<string, JamoData>)[char])
}

function stroke(jamo: JamoData, id: string): StrokeDataV2 {
  const found = [...(jamo.strokes ?? []), ...(jamo.horizontalStrokes ?? []), ...(jamo.verticalStrokes ?? [])]
    .find((item) => item.id === id)
  if (!found) throw new Error(`${jamo.char} ${id} 획을 찾을 수 없습니다.`)
  return found
}

function createJamoPreset(): JamoPresetMap {
  const choseong = Object.fromEntries(['ㄱ', 'ㄴ', 'ㄷ', 'ㄹ', 'ㅁ', 'ㅇ', 'ㅋ', 'ㅎ'].map((char) => [char, cloneBase('choseong', char)]))
  const jungseong = Object.fromEntries(['ㅏ', 'ㅔ', 'ㅘ', 'ㅜ', 'ㅝ', 'ㅡ'].map((char) => [char, cloneBase('jungseong', char)]))
  const jongseong = Object.fromEntries(['ㄹ', 'ㅎ'].map((char) => [char, cloneBase('jongseong', char)]))

  stroke(choseong['ㄱ'], 'ㄱ-1').points[2] = { x: .92, y: 1, handleIn: { x: .995, y: .585 } }
  stroke(choseong['ㄴ'], 'ㄴ-1').points[2] = { x: .995, y: .95, handleIn: { x: .67, y: .98 } }
  stroke(choseong['ㄷ'], 'ㄷ-1').points[3] = { x: 1, y: .945, handleIn: { x: .755, y: 1.025 } }
  stroke(choseong['ㄹ'], 'ㄹ-1').points[5] = { x: 1.15, y: .95, handleIn: { x: .95, y: 1.015 } }

  for (const point of stroke(choseong['ㅁ'], 'ㅁ-1').points) {
    if (point.y === 1) point.y = .9
  }

  stroke(choseong['ㅇ'], 'ㅇ-circle').points = [
    { x: .495, y: .08, handleIn: { x: .265, y: .08 }, handleOut: { x: .725, y: .08 } },
    { x: .915, y: .4875, handleIn: { x: .915, y: .2625 }, handleOut: { x: .915, y: .7125 } },
    { x: .495, y: .895, handleIn: { x: .725, y: .895 }, handleOut: { x: .265, y: .895 } },
    { x: .075, y: .4875, handleIn: { x: .075, y: .7125 }, handleOut: { x: .075, y: .2625 } },
  ]

  stroke(choseong['ㅋ'], 'ㅋ-1').points[2] = { x: .945, y: .99 }
  stroke(choseong['ㅋ'], 'ㅋ-3').points[1].x = .97
  stroke(choseong['ㅎ'], 'ㅎ-2').points.forEach((point) => { point.y = .16 })

  stroke(jungseong['ㅏ'], 'ㅏ-2').points[1] = { x: 1.345, y: .5 }
  stroke(jungseong['ㅔ'], 'ㅔ-2').points[0] = { x: -.19, y: .5 }
  stroke(jungseong['ㅘ'], 'ㅘ-1').points = [{ x: .44, y: 0 }, { x: .445, y: .905 }]
  stroke(jungseong['ㅘ'], 'ㅘ-2').points = [{ x: .08, y: 1 }, { x: .86, y: .79 }]
  stroke(jungseong['ㅜ'], 'ㅜ-1').points = [{ x: -.01, y: .125 }, { x: .99, y: .125 }]
  stroke(jungseong['ㅜ'], 'ㅜ-2').points = [{ x: .49, y: .135 }, { x: .49, y: .785 }]
  stroke(jungseong['ㅝ'], 'ㅝ-1').points = [{ x: .07, y: .18 }, { x: .975, y: -.065, handleIn: { x: .7, y: .195 } }]
  stroke(jungseong['ㅝ'], 'ㅝ-2').points = [{ x: .54, y: .17 }, { x: .54, y: 1 }]
  stroke(jungseong['ㅝ'], 'ㅝ-4').points = [{ x: -.445, y: .81 }, { x: .5, y: .72, handleIn: { x: .28, y: .785 } }]
  stroke(jungseong['ㅡ'], 'ㅡ-1').points.forEach((point) => { point.y = .645 })

  stroke(jongseong['ㅎ'], 'ㅎ종-2').points = [{ x: 0, y: .145 }, { x: 1, y: .145 }]
  stroke(jongseong['ㄹ'], 'ㄹ종-1').points[5] = { x: 1.11, y: .965, handleIn: { x: .91, y: 1.035 } }
  stroke(jongseong['ㅎ'], 'ㅎ종-circle').points = [
    { x: .5, y: .26, handleIn: { x: .29, y: .26 }, handleOut: { x: .71, y: .26 } },
    { x: .885, y: .58, handleIn: { x: .885, y: .395 }, handleOut: { x: .885, y: .765 } },
    { x: .5, y: .9, handleIn: { x: .71, y: .9 }, handleOut: { x: .29, y: .9 } },
    { x: .115, y: .58, handleIn: { x: .115, y: .765 }, handleOut: { x: .115, y: .395 } },
  ]

  return { choseong, jungseong, jongseong }
}

export const USER_PRESET_01_JAMOS = createJamoPreset()
