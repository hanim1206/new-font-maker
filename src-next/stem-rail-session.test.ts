import { describe, expect, it } from 'vitest'
import { JUNGSEONG_MAP } from '../src/data/Hangul'
import { stemEndsFor, stemRailDragOf } from '../src/services/medialStemRails'
import type { JamoData, StrokeDataV2 } from '../src/types'
import { exclusionDeltas, stemRailGroups } from './stemRailSession'

const strokeOf = (char: string, id: string): StrokeDataV2 => {
  const jamo = JUNGSEONG_MAP[char]
  return [...(jamo.strokes ?? []), ...(jamo.horizontalStrokes ?? []), ...(jamo.verticalStrokes ?? [])].find((stroke) => stroke.id === id)!
}
const drag = (char: string, id: string, kind: 'stroke' | 'point' | 'handle', pointIndex?: number, part = 'JU' as const) =>
  stemRailDragOf({ jamo: JUNGSEONG_MAP[char], stroke: strokeOf(char, id), kind, pointIndex, part })

describe('획 편집 끝 끌기 → 보선', () => {
  it('기둥 위 · 아래 끝은 그 끝의 보선, 기둥 통째는 두 끝', () => {
    expect(drag('ㅏ', 'ㅏ-1', 'point', 0)).toEqual({ part: 'JU', keys: ['outerPillar.start'] })
    expect(drag('ㅏ', 'ㅏ-1', 'point', 1)).toEqual({ part: 'JU', keys: ['outerPillar.end'] })
    expect(drag('ㅏ', 'ㅏ-1', 'stroke')).toEqual({ part: 'JU', keys: ['outerPillar.start', 'outerPillar.end'] })
  })

  it('가로 줄기는 통째 끌기만 높이, 끝점 · 핸들은 지금처럼 획 모양', () => {
    expect(drag('ㅏ', 'ㅏ-2', 'stroke')).toEqual({ part: 'JU', keys: ['primaryBeam.center'] })
    expect(drag('ㅏ', 'ㅏ-2', 'point', 1)).toBeNull()
    expect(drag('ㅏ', 'ㅏ-1', 'handle', 0)).toBeNull()
  })

  it('짧은기둥: 빈 끝은 보선, 보에 붙은 끝은 세로로 안 움직이고, 통째 끌기는 획 모양', () => {
    // ㅗ-1: 위가 빈 끝, 아래가 보에 붙는다.
    expect(drag('ㅗ', 'ㅗ-1', 'point', 0)).toEqual({ part: 'JU', keys: ['baseStem.start'] })
    expect(drag('ㅗ', 'ㅗ-1', 'point', 1)).toEqual({ part: 'JU', keys: [] })
    // ㅜ-2: 위가 보에 붙고 아래가 빈 끝.
    expect(drag('ㅜ', 'ㅜ-2', 'point', 0)).toEqual({ part: 'JU', keys: [] })
    expect(drag('ㅜ', 'ㅜ-2', 'point', 1)).toEqual({ part: 'JU', keys: ['baseStem.end'] })
    expect(drag('ㅗ', 'ㅗ-1', 'stroke')).toBeNull()
  })

  it('섞임홀자는 줄기가 든 칸이어야 한다', () => {
    expect(drag('ㅘ', 'ㅘ-4', 'stroke', undefined, 'JU_V' as 'JU')).toEqual({ part: 'JU_V', keys: ['upperBeam.center'] })
    expect(drag('ㅘ', 'ㅘ-4', 'stroke', undefined, 'JU_H' as 'JU')).toBeNull()
  })

  it('보에 붙은 끝은 저장 획이 옮겨져 있어도 보 가운데에 둔다', () => {
    const jamo = structuredClone(JUNGSEONG_MAP['ㅗ']) as JamoData
    const stem = structuredClone(strokeOf('ㅗ', 'ㅗ-1'))
    stem.points[1] = { ...stem.points[1], y: stem.points[1].y - 0.2 }
    const ends = stemEndsFor(jamo, stem, { x: 0, y: 0, width: 1, height: 1, stems: { 'ㅗ-1': { bottom: 0.93, joined: 'bottom' } } })!
    expect(ends.end.y).toBeCloseTo(0.93, 12)
  })
})

describe('반영 고르기 — 레이아웃 칸 묶음, 뺀 곳은 이 자모만 반대 Δ', () => {
  it('아 곁줄기를 올리면 같은 역할(가운데 가로)을 쓰는 ㅏ ㅐ ㅓ ㅔ가 카드, ㅏ는 고친 홀자', () => {
    const [group] = stemRailGroups([{ contextId: 'right', medialJamo: 'ㅏ', part: 'JU', keys: ['primaryBeam.center'], delta: -0.05 }, { contextId: 'right', medialJamo: 'ㅏ', part: 'JU', keys: ['primaryBeam.center'], delta: -0.03 }])
    expect(group.medials).toEqual(['ㅏ', 'ㅐ', 'ㅓ', 'ㅔ'])
    expect(group.edited).toEqual(['ㅏ'])
    expect(group.medial.JU!['primaryBeam.center']).toBeCloseTo(-0.08, 12)
    const [exclusion] = exclusionDeltas(group, ['ㅐ', 'ㅏ'])
    expect(exclusion.rule).toEqual({ medialFamily: ['right'], hasFinal: false, medial: ['ㅐ'] })
    expect(exclusion.delta.medial!.JU!['primaryBeam.center']).toBeCloseTo(0.08, 12)
    expect(exclusionDeltas(group, ['ㅐ', 'ㅏ'])).toHaveLength(1)
  })

  it('기둥 끝은 ㅣ까지 바깥 기둥이 있는 오른쪽 홀자 전부, 칸이 다르면 묶음이 둘', () => {
    const groups = stemRailGroups([
      { contextId: 'right', medialJamo: 'ㅏ', part: 'JU', keys: ['outerPillar.end'], delta: 0.02 },
      { contextId: 'right-final', medialJamo: 'ㅏ', part: 'JU', keys: ['outerPillar.end'], delta: 0.01 },
    ])
    expect(groups.map((group) => group.contextId)).toEqual(['right', 'right-final'])
    expect(groups[0].medials).toEqual([...'ㅏㅐㅑㅒㅓㅔㅕㅖㅣ'])
  })

  it('되돌려서 합이 0이 된 칸은 묻지 않는다', () => {
    expect(stemRailGroups([
      { contextId: 'mixed', medialJamo: 'ㅘ', part: 'JU_V', keys: ['upperBeam.center'], delta: 0.02 },
      { contextId: 'mixed', medialJamo: 'ㅘ', part: 'JU_V', keys: ['upperBeam.center'], delta: -0.02 },
    ])).toEqual([])
  })

  it('섞임 칸: 세로부 위 가로(ㅘ 곁줄기)는 ㅘ ㅙ ㅝ ㅞ 중 그 역할이 세로부에 있는 것만', () => {
    const [group] = stemRailGroups([{ contextId: 'mixed', medialJamo: 'ㅘ', part: 'JU_V', keys: ['upperBeam.center'], delta: 0.02 }])
    expect(group.medials).toEqual(['ㅘ', 'ㅙ'])
  })
})
