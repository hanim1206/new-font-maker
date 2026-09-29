import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createNotoPresetReader } from '../../scripts/reference-lab/notoPresetApi'
import { CHOSEONG_MAP, JONGSEONG_MAP, JUNGSEONG_MAP } from '../data/Hangul'
import { DEFAULT_STYLE } from '../stores/globalStyleStore'
import type { BoxConfig, JamoData, Part, StrokeDataV2 } from '../types'
import { decomposeSyllable } from '../utils/hangulUtils'
import { boxToFaces, fitPartStrokes, identityOfSyllable, medialPartGroups, resolveContextBoxes, type ContextBoxDelta } from './contextBoxResolver'
import { mapBoxToDesignBody } from './designBodyPlacement'
import { materializeFinalGlyphInk, projectFinalGlyphInkToFontContours } from './finalGlyphInk'
import { resolveGlyphInkPrimitives } from './glyphInkResolver'
import { weightToMultiplier } from '../utils/globalStyleUtils'
import { MEDIAL_STEM_ROLES, stemEndOnBorder, stemEndsFor, stemRailDragOf, stemRailGuides } from './medialStemRails'
import { MEDIAL_ROLE_SETS } from './notoVariationModel'
import { placeStemStroke } from './stemBend'
import { grammarOf } from './strokeGrammar'

const CORPUS = path.resolve(__dirname, '../../.reference-fonts/guide-corpus')
const MEDIALS = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ'
const ENDS = { linecap: DEFAULT_STYLE.linecap, linejoin: DEFAULT_STYLE.linejoin }
const SHORT_STEMS = ['baseStem', 'leftStem', 'rightStem']

describe('홀자 줄기 ↔ 엔진 역할 대응표(D0)', () => {
  it.each([...MEDIALS])('%s: 획 문법의 이름 있는 줄기가 전부 표에 있고, 역할 · 칸이 모델 역할 구성과 같다', (medial) => {
    const roles = MEDIAL_STEM_ROLES[medial]
    const named = Object.entries(grammarOf('jungseong', medial)).filter(([, name]) => name !== null).map(([id]) => id).sort()
    expect(Object.keys(roles).sort()).toEqual(named)
    for (const group of medialPartGroups(medial)!) {
      const inPart = Object.values(roles).filter(([part]) => part === group.part).map(([, role]) => role).sort()
      expect(inPart).toEqual([...group.roleIds].sort())
    }
    expect(Object.values(roles).map(([, role]) => role).sort()).toEqual([...MEDIAL_ROLE_SETS[medial]].sort())
  })
})

describe('보선 목표로 끝점을 옮겨도 휨은 em 그대로', () => {
  const box: BoxConfig = { x: 0.6, y: 0.1, width: 0.2, height: 0.8 }
  const jamoA = () => structuredClone(JUNGSEONG_MAP['ㅏ']) as JamoData
  const em = (placed: { box: BoxConfig }, p: { x: number; y: number }) => ({ x: placed.box.x + p.x * placed.box.width, y: placed.box.y + p.y * placed.box.height })

  it('곁줄기 높이 목표가 있으면 두 끝이 그 높이로 가고, 핸들의 위아래 휨(em)은 그대로다', () => {
    const jamo = jamoA()
    const stroke: StrokeDataV2 = {
      ...jamo.strokes!.find((item) => item.id === 'ㅏ-2')!,
      points: [{ x: 0, y: 0.5, handleOut: { x: 0.35, y: 0.47 } }, { x: 1, y: 0.5, handleIn: { x: 0.65, y: 0.47 } }],
    }
    const before = placeStemStroke(jamo, stroke, box)
    const after = placeStemStroke(jamo, stroke, { ...box, stems: { 'ㅏ-2': { center: 0.3 } } })
    expect(after.stroke.points[0].y).toBeCloseTo(0.3, 12)
    expect(after.stroke.points[1].y).toBeCloseTo(0.3, 12)
    const lift = (placed: { stroke: StrokeDataV2; box: BoxConfig }) => em(placed, placed.stroke.points[0]).y - em(placed, placed.stroke.points[0].handleOut!).y
    expect(lift(after)).toBeCloseTo(lift(before), 12)
  })

  it('획 편집으로 기본 획에서 옮긴 만큼은 목표 위에 얹는다', () => {
    const jamo = jamoA()
    const pillar = structuredClone(jamo.strokes!.find((item) => item.id === 'ㅏ-1')!)
    pillar.points[1] = { ...pillar.points[1], y: pillar.points[1].y - 0.1 }
    const ends = stemEndsFor(jamo, pillar, { ...box, stems: { 'ㅏ-1': { top: 0.05, bottom: 0.9 } } })!
    expect(ends.start.y).toBeCloseTo(0.05, 12)
    expect(ends.end.y).toBeCloseTo(0.8, 12)
  })

  it('목표가 없으면 저장 획 · 칸 그대로(마스터 없는 곧은 획)', () => {
    const jamo = jamoA()
    const stroke = jamo.strokes![1]
    expect(placeStemStroke(jamo, stroke, box)).toEqual({ stroke, box })
  })

  it('네모꼴 변환을 지나도 칸 안 비율 목표가 남는다', () => {
    const moved = mapBoxToDesignBody({ ...box, stems: { 'ㅏ-2': { center: 0.3 } } }, { top: 0.1, bottom: 0.1, left: 0.08, right: 0.08 })
    expect(moved.stems).toEqual({ 'ㅏ-2': { center: 0.3 } })
  })
})

// corpus(.reference-fonts)가 있을 때만: 실제 모델로 칸을 풀고 줄기 잉크가 보선에 서는지 본다.
describe.skipIf(!existsSync(CORPUS))('홀자 줄기 끝점 = 보선 — G0 대표', () => {
  const bundle = createNotoPresetReader(CORPUS).model()
  const decompose = (char: string) => decomposeSyllable(char, CHOSEONG_MAP, JUNGSEONG_MAP, JONGSEONG_MAP)

  /** 한 글자를 칸 해석 → 잉크 해석까지 돌려 줄기 중심선의 위 · 아래 · 가운데 높이(em)를 잰다. */
  async function render(char: string, delta?: ContextBoxDelta) {
    const model = await bundle
    const syllable = decompose(char)
    const resolved = resolveContextBoxes({ identity: identityOfSyllable(syllable)!, model, syllable, ends: ENDS, delta })
    expect(resolved.complete).toBe(true)
    const ink = resolveGlyphInkPrimitives({ syllable, placement: { kind: 'boxes', boxes: resolved.boxes }, weightMultiplier: 1, globalLinecap: ENDS.linecap, globalLinejoin: ENDS.linejoin })
    const stem = (id: string) => {
      const primitive = ink.primitives.find((item) => item.source.strokeId === id)!
      const ys = primitive.stroke.points.map((p) => primitive.box.y + p.y * primitive.box.height)
      return { top: Math.min(...ys), bottom: Math.max(...ys), mid: (ys[0] + ys[ys.length - 1]) / 2 }
    }
    const railOf = (part: Part, role: string, kind: 'centerRail' | 'fromRail' | 'toRail' = 'centerRail') => {
      const fit = resolved.medial.find((group) => group.part === part)!.fit!
      return fit.railsEm[fit.bindings.find((binding) => binding.roleId === role)![kind]]
    }
    return { stem, railOf, resolved, syllable }
  }

  it('아: 기본에서 곁줄기가 보선 높이에 서고, 곁줄기 보선을 80u 올리면 곁줄기만 80u 올라간다', async () => {
    const base = await render('아')
    expect(base.stem('ㅏ-2').mid).toBeCloseTo(base.railOf('JU', 'primaryBeam'), 6)
    const moved = await render('아', { medial: { JU: { 'primaryBeam.center': -0.08 } } })
    expect(moved.stem('ㅏ-2').mid - base.stem('ㅏ-2').mid).toBeCloseTo(-0.08, 6)
    expect(moved.stem('ㅏ-1')).toEqual(base.stem('ㅏ-1'))
  })

  // 아래로 늘리는 쪽은 글자 몸(노토 몸통) 아래 끝까지 2u뿐이라 보선 한계에서 멈춘다 — 줄이는 쪽으로 본다.
  it('아: 기둥 아래 끝을 30u 올리면 기둥만 짧아지고 곁줄기는 제자리다', async () => {
    const base = await render('아')
    const moved = await render('아', { medial: { JU: { 'outerPillar.end': -0.03 } } })
    expect(moved.stem('ㅏ-1').top).toBeCloseTo(base.stem('ㅏ-1').top, 6)
    expect(moved.stem('ㅏ-1').bottom - base.stem('ㅏ-1').bottom).toBeCloseTo(-0.03, 3)
    expect(moved.stem('ㅏ-2').mid).toBeCloseTo(base.stem('ㅏ-2').mid, 6)
  })

  it('오: 보 보선을 옮기면 보가 따라가고 짧은기둥의 붙은 끝도 보 가운데를 따른다', async () => {
    const base = await render('오')
    const moved = await render('오', { medial: { JU: { 'primaryBeam.center': -0.03 } } })
    expect(moved.stem('ㅗ-2').mid - base.stem('ㅗ-2').mid).toBeCloseTo(-0.03, 3)
    expect(moved.stem('ㅗ-1').bottom).toBeCloseTo(moved.stem('ㅗ-2').mid, 6)
    expect(moved.stem('ㅗ-1').top).toBeCloseTo(base.stem('ㅗ-1').top, 6)
  })

  it('와: 섞임 세로부 곁줄기 보선과 가로부 보 보선이 각자 잉크를 끈다', async () => {
    const base = await render('와')
    expect(base.stem('ㅘ-4').mid).toBeCloseTo(base.railOf('JU_V', 'upperBeam'), 6)
    const side = await render('와', { medial: { JU_V: { 'upperBeam.center': 0.04 } } })
    expect(side.stem('ㅘ-4').mid - base.stem('ㅘ-4').mid).toBeCloseTo(0.04, 6)
    expect(side.stem('ㅘ-3')).toEqual(base.stem('ㅘ-3'))
    const beam = await render('와', { medial: { JU_H: { 'lowerBeam.center': -0.02 } } })
    expect(beam.stem('ㅘ-2').mid - base.stem('ㅘ-2').mid).toBeCloseTo(-0.02, 3)
    expect(beam.stem('ㅘ-1').bottom).toBeCloseTo(beam.stem('ㅘ-2').mid, 6)
  })

  it('레이아웃 편집기 캔버스(fitPartStrokes)도 글자 잉크와 같은 자리에 줄기를 놓는다', async () => {
    const model = await bundle
    const syllable = decompose('와')
    const delta: ContextBoxDelta = { medial: { JU_V: { 'upperBeam.center': 0.04 } } }
    const resolved = resolveContextBoxes({ identity: identityOfSyllable(syllable)!, model, syllable, ends: ENDS, delta })
    const glyph = resolveGlyphInkPrimitives({ syllable, placement: { kind: 'boxes', boxes: resolved.boxes }, weightMultiplier: 1, globalLinecap: ENDS.linecap, globalLinejoin: ENDS.linejoin })
    for (const group of resolved.medial) {
      const canvas = fitPartStrokes({ part: group.part, jamo: syllable.jungseong!, faces: boxToFaces(group.fit!.slot), glyphId: 'layout-editor', medialJamo: 'ㅘ', ends: ENDS, medialFit: group.fit })
      expect(canvas.ok).toBe(true)
      if (!canvas.ok) continue
      for (const primitive of canvas.fit.primitives) {
        const same = glyph.primitives.find((item) => item.source.strokeId === primitive.source.strokeId)!
        const em = (item: { stroke: StrokeDataV2; box: BoxConfig }) => item.stroke.points.map((p) => [item.box.x + p.x * item.box.width, item.box.y + p.y * item.box.height])
        em(primitive).forEach(([x, y], index) => {
          expect(x).toBeCloseTo(em(same)[index][0], 6)
          expect(y).toBeCloseTo(em(same)[index][1], 6)
        })
      }
    }
  })

  it.each(['구', '규', '귀', '후', '굔'])('%s: 짧은기둥이 보에 붙은 끝은 모델 rail과 상관없이 보 가운데다', async (char) => {
    const { stem } = await render(char)
    const roles = Object.entries(MEDIAL_STEM_ROLES[decompose(char).jungseong!.char])
    for (const [id, [part, role]] of roles) {
      if (!SHORT_STEMS.includes(role)) continue
      const beamId = roles.find(([, [beamPart, beamRole]]) => beamPart === part && beamRole.endsWith('Beam'))![0]
      const beamY = stem(beamId).mid
      const { top, bottom } = stem(id)
      expect(Math.min(Math.abs(top - beamY), Math.abs(bottom - beamY))).toBeLessThan(1e-6)
    }
  })
})

// G1 홀드아웃: 대표 밖 글자 · 받침 · 굵기 · 기울기.
describe.skipIf(!existsSync(CORPUS))('홀자 줄기 끝점 = 보선 — G1 홀드아웃', () => {
  const bundle = createNotoPresetReader(CORPUS).model()
  const decompose = (char: string) => decomposeSyllable(char, CHOSEONG_MAP, JUNGSEONG_MAP, JONGSEONG_MAP)
  async function render(char: string, delta?: ContextBoxDelta, weightMultiplier = 1) {
    const model = await bundle
    const syllable = decompose(char)
    const resolved = resolveContextBoxes({ identity: identityOfSyllable(syllable)!, model, syllable, ends: ENDS, delta })
    expect(resolved.issues).toEqual([])
    const ink = resolveGlyphInkPrimitives({ syllable, placement: { kind: 'boxes', boxes: resolved.boxes }, weightMultiplier, globalLinecap: ENDS.linecap, globalLinejoin: ENDS.linejoin })
    const stem = (id: string) => {
      const primitive = ink.primitives.find((item) => item.source.strokeId === id)!
      const ys = primitive.stroke.points.map((p) => primitive.box.y + p.y * primitive.box.height)
      return { top: Math.min(...ys), bottom: Math.max(...ys), mid: (ys[0] + ys[ys.length - 1]) / 2 }
    }
    const rail = (part: Part, role: string, kind: 'centerRail' | 'fromRail' | 'toRail') => {
      const fit = resolved.medial.find((group) => group.part === part)!.fit!
      return fit.railsEm[fit.bindings.find((binding) => binding.roleId === role)![kind]]
    }
    return { stem, rail, ink }
  }

  it.each([['애', 'ㅐ-1'], ['에', 'ㅔ-1'], ['얘', 'ㅒ-1'], ['왜', 'ㅙ-3'], ['웨', 'ㅞ-3']])('%s: 안 기둥 위 · 아래 끝이 안쪽 보선에 서고, 아래 끝만 끌면 그 끝만 움직인다', async (char, id) => {
    const part = MEDIAL_STEM_ROLES[decompose(char).jungseong!.char][id][0]
    const base = await render(char)
    expect(base.stem(id).top).toBeCloseTo(base.rail(part, 'innerPillar', 'fromRail'), 6)
    expect(base.stem(id).bottom).toBeCloseTo(base.rail(part, 'innerPillar', 'toRail'), 6)
    const moved = await render(char, { medial: { [part]: { 'innerPillar.end': -0.02 } } })
    expect(moved.stem(id).bottom - base.stem(id).bottom).toBeCloseTo(-0.02, 6)
    expect(moved.stem(id).top).toBeCloseTo(base.stem(id).top, 6)
  })

  it.each([['요', ['ㅛ-1', 'ㅛ-2'], 'ㅛ-3'], ['유', ['ㅠ-2', 'ㅠ-3'], 'ㅠ-1'], ['위', ['ㅟ-2'], 'ㅟ-1'], ['웨', ['ㅞ-2'], 'ㅞ-1']])('%s: 보를 끌면 짧은기둥들의 붙은 끝이 다 따라온다', async (char, stems, beam) => {
    const [part, role] = MEDIAL_STEM_ROLES[decompose(char).jungseong!.char][beam]
    const moved = await render(char, { medial: { [part]: { [`${role}.center`]: 0.02 } } })
    const beamY = moved.stem(beam).mid
    for (const id of stems) expect(Math.min(Math.abs(moved.stem(id).top - beamY), Math.abs(moved.stem(id).bottom - beamY))).toBeLessThan(1e-6)
  })

  it.each(['의', '으', '이', '위', '긔'])('%s: 얇은 칸(한 줄기)도 풀리고 줄기가 칸 자리 그대로다', async (char) => {
    const { ink } = await render(char)
    expect(ink.primitives.filter((item) => item.source.part.startsWith('JU')).length).toBeGreaterThan(0)
    for (const item of ink.primitives) for (const p of item.stroke.points) expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true)
  })

  it.each([['간', 'ㅏ-2', 'primaryBeam'], ['견', 'ㅕ-3', 'lowerBeam'], ['괜', 'ㅙ-4', 'upperBeam'], ['궨', 'ㅞ-4', 'lowerBeam'], ['없', 'ㅓ-2', 'primaryBeam']])('%s(받침): 가로 줄기가 보선 높이에 서고 끌면 따라온다', async (char, id, role) => {
    const part = MEDIAL_STEM_ROLES[decompose(char).jungseong!.char][id][0]
    const base = await render(char)
    expect(base.stem(id).mid).toBeCloseTo(base.rail(part, role, 'centerRail'), 6)
    const moved = await render(char, { medial: { [part]: { [`${role}.center`]: -0.015 } } })
    expect(moved.stem(id).mid - base.stem(id).mid).toBeCloseTo(-0.015, 6)
  })

  it.each(['아', '웨', '궨', '요'])('%s: 굵기 900이어도 중심선 자리는 같고, 기울기 12°로 OTF 윤곽이 나온다', async (char) => {
    const thin = await render(char)
    const heavy = await render(char, undefined, weightToMultiplier(900))
    // 가로는 굵으면 글자 폭 안에 가두려고 조일 수 있다(기존 동작). 홀자 줄기의 세로 자리만 본다.
    const ys = (item: { stroke: StrokeDataV2; box: BoxConfig }) => item.stroke.points.map((p) => item.box.y + p.y * item.box.height)
    for (const item of heavy.ink.primitives.filter((primitive) => primitive.source.part.startsWith('JU'))) {
      const same = thin.ink.primitives.find((other) => other.id === item.id)!
      ys(item).forEach((y, index) => expect(y).toBeCloseTo(ys(same)[index], 9))
    }
    const final = materializeFinalGlyphInk(heavy.ink.primitives, DEFAULT_STYLE.strokeStyle, { unitsPerEm: 1000, maxCurveErrorFontUnits: 0.5 })
    expect(final.ok).toBe(true)
    if (!final.ok) return
    expect(projectFinalGlyphInkToFontContours(final.ink, { upm: 1000, ascender: 880, slant: 12 }).length).toBeGreaterThan(0)
  })
})

describe('칸 테두리 = 획 편집에서 세로 잠금', () => {
  const box: BoxConfig = { x: 0.6, y: 0.1, width: 0.2, height: 0.8 }
  const stroke = (char: string, id: string) => { const jamo = JUNGSEONG_MAP[char]; return [...(jamo.strokes ?? []), ...(jamo.horizontalStrokes ?? []), ...(jamo.verticalStrokes ?? [])].find((item) => item.id === id)! }
  const jamo = (char: string) => ({ type: 'jungseong' as const, char })

  it('바깥 기둥 끝(목표 없음)은 잠기고, 곁줄기(칸 안)는 보선을 옮긴다', () => {
    const withStems = { ...box, stems: { 'ㅏ-2': { center: 0.44 } } }
    expect(stemRailDragOf({ jamo: jamo('ㅏ'), stroke: stroke('ㅏ', 'ㅏ-1'), kind: 'point', pointIndex: 1, part: 'JU', box: withStems })).toEqual({ part: 'JU', keys: [], border: true })
    expect(stemRailDragOf({ jamo: jamo('ㅏ'), stroke: stroke('ㅏ', 'ㅏ-1'), kind: 'stroke', part: 'JU', box: withStems })).toEqual({ part: 'JU', keys: [], border: true })
    expect(stemRailDragOf({ jamo: jamo('ㅏ'), stroke: stroke('ㅏ', 'ㅏ-2'), kind: 'stroke', part: 'JU', box: withStems })).toEqual({ part: 'JU', keys: ['primaryBeam.center'] })
  })

  it('칸을 만드는 보(ㅗ, 중심이 칸 끝)는 잠기고, 안 기둥 끝은 칸 끝 가까이여도 옮긴다', () => {
    expect(stemEndOnBorder({ ...box, stems: { 'ㅗ-2': { center: 1.006 } } }, 'ㅗ-2', 'center')).toBe(true)
    expect(stemEndOnBorder({ ...box, stems: { 'ㅜ-1': { center: -0.008 } } }, 'ㅜ-1', 'center')).toBe(true)
    expect(stemEndOnBorder({ ...box, stems: { 'ㅐ-1': { top: 0.02, bottom: 0.95 } } }, 'ㅐ-1', 'top')).toBe(false)
  })

  it('캔버스에 그릴 보선: 기둥은 두 끝, 곁줄기는 중심, 짧은기둥은 빈 끝만', () => {
    const stems = { ...box, stems: { 'ㅐ-1': { top: 0.02, bottom: 0.95 }, 'ㅐ-2': { center: 0.44 } } }
    expect(stemRailGuides({ jamo: jamo('ㅐ'), stroke: stroke('ㅐ', 'ㅐ-1'), part: 'JU', box: stems }).map((guide) => [guide.key, guide.border])).toEqual([['innerPillar.start', false], ['innerPillar.end', false]])
    expect(stemRailGuides({ jamo: jamo('ㅐ'), stroke: stroke('ㅐ', 'ㅐ-3'), part: 'JU', box: stems }).map((guide) => guide.border)).toEqual([true, true])
    expect(stemRailGuides({ jamo: jamo('ㅗ'), stroke: stroke('ㅗ', 'ㅗ-1'), part: 'JU', box }).map((guide) => guide.key)).toEqual(['baseStem.start'])
    expect(stemRailGuides({ jamo: jamo('ㅜ'), stroke: stroke('ㅜ', 'ㅜ-2'), part: 'JU', box }).map((guide) => guide.key)).toEqual(['baseStem.end'])
  })
})
