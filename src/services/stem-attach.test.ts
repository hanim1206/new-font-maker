import { describe, expect, it } from 'vitest'
import baseJamos from '../data/baseJamos.json'
import type { BoxConfig, JamoData, StrokeDataV2 } from '../types'
import { attachmentOf, centerlineXAtY, endIndexOf, STEM_PILLARS, type StrokeEnd } from './stemAttach'
import { placeStemStroke } from './stemBend'
import { applyMaster, boundStrokesOf, followsInJamo, instanceOf, JAMO_CHANNELS, masterFromStroke, medialBoxEmOf, stemReferenceBox, type JamoChannel, type StemMaster } from './stemMaster'
import { grammarOf } from './strokeGrammar'

const baseJungseong = (baseJamos as unknown as { jungseong: Record<string, JamoData> }).jungseong
const bent: StemMaster = { name: 'gidung', points: [{ t: 0, o: 0, handleOut: { t: 0.4, o: 0.03 } }, { t: 1, o: 0, handleIn: { t: 0.7, o: -0.01 } }] }
const tilted: StemMaster = { name: 'gidung', points: [{ t: 0, o: 0 }, { t: 1, o: 0.02 }] }
const at = (size: { width: number; height: number }): BoxConfig => ({ x: 0.4, y: 0.1, ...size })

const channelOf = (jamo: JamoData, strokeId: string): JamoChannel => JAMO_CHANNELS.find((channel) => jamo[channel]?.some((stroke) => stroke.id === strokeId))!
const strokeOf = (jamo: JamoData, id: string): StrokeDataV2 => JAMO_CHANNELS.flatMap((channel) => jamo[channel] ?? []).find((stroke) => stroke.id === id)!
const pointAt = (stroke: StrokeDataV2, end: StrokeEnd) => stroke.points[endIndexOf(stroke, end)]
/** 자모 한 획을 마스터 인스턴스로 바꾼 자모. */
function withInstance(char: string, strokeId: string, master: StemMaster): JamoData {
  const jamo = structuredClone(baseJungseong[char])
  const channel = channelOf(jamo, strokeId)
  jamo[channel] = jamo[channel]!.map((stroke) => stroke.id === strokeId ? instanceOf(stroke, master, stemReferenceBox(char, channel, stroke)) : stroke)
  return jamo
}
/** 획의 한 끝 x를 저장 좌표에서 옮긴 자모. */
function withEndMoved(char: string, strokeId: string, end: StrokeEnd, dx: number): JamoData {
  const jamo = structuredClone(baseJungseong[char])
  const channel = channelOf(jamo, strokeId)
  jamo[channel] = jamo[channel]!.map((stroke) => {
    if (stroke.id !== strokeId) return stroke
    const index = endIndexOf(stroke, end)
    return { ...stroke, points: stroke.points.map((point, at) => at === index ? { ...point, x: point.x + dx } : point) }
  })
  return jamo
}
/** 곁줄기 붙은 끝을 기둥에서 빈 끝 쪽으로 `gap`만큼 뗀 자모. */
const withGap = (char: string, strokeId: string, gap: number) => {
  const attachment = attachmentOf(baseJungseong[char], strokeId)!.ends[0]
  return withEndMoved(char, strokeId, attachment.end, gap * attachment.away)
}
/** 곁줄기 빈 끝을 기둥에서 멀어지는 쪽으로 `reach`만큼 옮긴 자모(−면 짧아짐). */
const withReach = (char: string, strokeId: string, reach: number) => {
  const free = attachmentOf(baseJungseong[char], strokeId)!.free!
  return withEndMoved(char, strokeId, free.end, reach * free.away)
}
const emOf = (placed: { box: BoxConfig }, point: { x: number; y: number }) => ({ x: placed.box.x + point.x * placed.box.width, y: placed.box.y + point.y * placed.box.height })
/** 놓인 획의 붙은 끝(`order`번째)과, 그 높이에서 놓인 기둥 중심선의 x(em). */
function attachedAndPillar(jamo: JamoData, sideId: string, box: BoxConfig, order = 0) {
  const channel = channelOf(jamo, sideId)
  const end = attachmentOf(jamo, sideId)!.ends[order]
  const side = placeStemStroke(jamo, strokeOf(jamo, sideId), box, channel)
  const pillar = placeStemStroke(jamo, strokeOf(jamo, end.pillarId), box, channel)
  const endEm = emOf(side, pointAt(side.stroke, end.end))
  const pillarX = centerlineXAtY(pillar.stroke, (endEm.y - pillar.box.y) / pillar.box.height)!
  return { endEm, pillarXEm: pillar.box.x + pillarX * pillar.box.width, stored: pointAt(strokeOf(jamo, sideId), end.end), side, end }
}
const SIDE = ['ㅏ', 'ㅑ', 'ㅓ', 'ㅔ', 'ㅕ', 'ㅖ', 'ㅘ', 'ㅝ', 'ㅞ']
const CROSS = ['ㅐ', 'ㅒ', 'ㅙ']

describe('D0 대응표 — 곁줄기는 기둥 하나, 걸침은 기둥 둘에 붙는다', () => {
  it('곁줄기 9자 · 걸침 3자. 붙은 끝은 같은 채널의 기둥 시작점 x + 기본 어긋남에 있다', () => {
    for (const [char, pairs] of Object.entries(STEM_PILLARS)) {
      const jamo = baseJungseong[char]
      const table = grammarOf('jungseong', char)
      for (const [strokeId, pillars] of Object.entries(pairs)) {
        const attachment = attachmentOf(jamo, strokeId)!
        const cross = typeof pillars !== 'string'
        expect(table[strokeId], `${char} ${strokeId}`).toBe(cross ? 'geolchim' : 'gyeotjulgi')
        expect(attachment.ends, `${char} 끝 수`).toHaveLength(cross ? 2 : 1)
        expect(attachment.free === null, `${char} 빈 끝`).toBe(cross)
        for (const end of attachment.ends) {
          expect(table[end.pillarId], `${char} ${end.pillarId}`).toBe('gidung')
          expect(channelOf(jamo, strokeId), `${char} 채널`).toBe(channelOf(jamo, end.pillarId))
          const pillar = strokeOf(jamo, end.pillarId)
          expect(pointAt(strokeOf(jamo, strokeId), end.end).x, `${char} ${strokeId} 붙은 끝`).toBeCloseTo(pillar.points[0].x + end.baseOffset, 12)
          // 기본 어긋남은 ㅘ · ㅙ 세로부(±0.04)만 있고 나머지는 0.
          expect(Math.abs(end.baseOffset) < 1e-12 || char === 'ㅘ' || char === 'ㅙ', `${char} 기본 어긋남`).toBe(true)
        }
      }
    }
    expect(Object.keys(STEM_PILLARS).sort()).toEqual([...SIDE, ...CROSS].sort())
    expect(STEM_PILLARS['ㅔ']['ㅔ-2']).toBe('ㅔ-1')
    expect(STEM_PILLARS['ㅐ']['ㅐ-2']).toEqual(['ㅐ-1', 'ㅐ-3'])
  })

  it('빈 끝이 오른쪽(ㅏ)이면 시작점이, 왼쪽(ㅓ · ㅔ · ㅝ)이면 끝점이 붙은 끝이고, 틈 · 길이의 + 방향은 빈 끝 쪽이다', () => {
    const one = (char: string, id: string) => attachmentOf(baseJungseong[char], id)!.ends[0]
    expect(one('ㅏ', 'ㅏ-2')).toMatchObject({ end: 'start', away: 1 })
    expect(one('ㅓ', 'ㅓ-2')).toMatchObject({ end: 'end', away: -1 })
    expect(one('ㅔ', 'ㅔ-2')).toMatchObject({ end: 'end', away: -1 })
    expect(one('ㅝ', 'ㅝ-4')).toMatchObject({ end: 'end', away: -1 })
    expect(one('ㅘ', 'ㅘ-4')).toMatchObject({ end: 'start', away: 1 })
    expect(attachmentOf(baseJungseong['ㅏ'], 'ㅏ-2')!.free).toMatchObject({ end: 'end', away: 1 })
    expect(attachmentOf(baseJungseong['ㅓ'], 'ㅓ-2')!.free).toMatchObject({ end: 'start', away: -1 })
  })

  it('걸침은 시작점이 안쪽 기둥, 끝점이 바깥 기둥에 붙고 틈은 둘 다 안쪽(획 가운데) 방향이 +다', () => {
    const cross = attachmentOf(baseJungseong['ㅐ'], 'ㅐ-2')!
    expect(cross.ends[0]).toMatchObject({ end: 'start', pillarId: 'ㅐ-1', away: 1 })
    expect(cross.ends[1]).toMatchObject({ end: 'end', pillarId: 'ㅐ-3', away: -1 })
    expect(cross.free).toBeNull()
  })
})

describe('중심선 x', () => {
  it('곧은 세로선은 정확히 그 x, 휜 선은 이분법으로 가운데 볼록한 만큼', () => {
    expect(centerlineXAtY({ points: [{ x: 0.25, y: 0 }, { x: 0.25, y: 1 }] }, 0.5)).toBe(0.25)
    const bowed = { points: [{ x: 0, y: 0, handleOut: { x: 0.2, y: 0.5 } }, { x: 0, y: 1, handleIn: { x: 0.2, y: 0.5 } }] }
    expect(centerlineXAtY(bowed, 0.5)).toBeCloseTo(0.15, 6)
    expect(centerlineXAtY(bowed, 0)).toBeCloseTo(0, 9)
    expect(centerlineXAtY(bowed, 2)).toBe(0)
  })
})

describe('G0 붙임 — 붙은 끝은 기둥의 놓인 중심선을 따른다', () => {
  it('기본 홀자는 어느 칸에서도 같은 획 그대로다(마스터 없는 폰트는 픽셀까지 같다)', () => {
    for (const [char, pairs] of Object.entries(STEM_PILLARS)) {
      const jamo = baseJungseong[char]
      for (const strokeId of Object.keys(pairs)) {
        const channel = channelOf(jamo, strokeId)
        for (const final of ['open', 'closed'] as const) {
          const box = at(medialBoxEmOf(char, channel, final))
          expect(placeStemStroke(jamo, strokeOf(jamo, strokeId), box, channel).stroke, `${char} ${strokeId} ${final}`).toBe(strokeOf(jamo, strokeId))
        }
      }
    }
  })

  it.each([['ㅏ', 'ㅏ-1', 'ㅏ-2'], ['ㅓ', 'ㅓ-1', 'ㅓ-2'], ['ㅔ', 'ㅔ-1', 'ㅔ-2'], ['ㅘ', 'ㅘ-3', 'ㅘ-4'], ['ㅞ', 'ㅞ-3', 'ㅞ-4']])('%s 기둥을 휘면 곁줄기가 그 높이의 기둥 중심선에 붙고, 저장 획은 그대로다', (char, pillarId, sideId) => {
    const jamo = withInstance(char, pillarId, bent)
    const channel = channelOf(jamo, sideId)
    for (const final of ['open', 'closed'] as const) {
      const box = at(medialBoxEmOf(char, channel, final))
      const { endEm, pillarXEm, stored, side, end } = attachedAndPillar(jamo, sideId, box)
      expect(endEm.x - end.baseOffset * box.width, `${char} ${final}`).toBeCloseTo(pillarXEm, 9)
      // 기둥이 휘었으니 저장 x 그대로가 아니다.
      expect(Math.abs(endEm.x - emOf(side, stored).x), `${char} ${final} 움직임`).toBeGreaterThan(0.001)
      expect(side.stroke.points.length).toBe(2)
    }
    // 곁줄기 저장 획은 안 바뀌었고 마스터도 여전히 따른다(풀리지 않는다).
    expect(strokeOf(jamo, sideId)).toEqual(strokeOf(baseJungseong[char], sideId))
    expect(boundStrokesOf(jamo, { gidung: bent }).find((item) => item.stroke.id === sideId)!.follows).toBe(true)
  })

  it('ㅐ 걸침은 안 기둥을 휘면 시작점이, 바깥 기둥을 휘면 끝점이 따라 붙는다 — 반대쪽 끝은 그대로', () => {
    const box = at(medialBoxEmOf('ㅐ', 'strokes', 'open'))
    const innerBent = withInstance('ㅐ', 'ㅐ-1', bent)
    const first = attachedAndPillar(innerBent, 'ㅐ-2', box, 0)
    expect(first.endEm.x).toBeCloseTo(first.pillarXEm, 9)
    expect(Math.abs(first.endEm.x - emOf(first.side, first.stored).x)).toBeGreaterThan(0.001)
    expect(first.side.stroke.points[1]).toMatchObject({ x: 1, y: 0.5 })
    const outerBent = withInstance('ㅐ', 'ㅐ-3', bent)
    const second = attachedAndPillar(outerBent, 'ㅐ-2', box, 1)
    expect(second.endEm.x).toBeCloseTo(second.pillarXEm, 9)
    expect(Math.abs(second.endEm.x - emOf(second.side, second.stored).x)).toBeGreaterThan(0.001)
    expect(second.side.stroke.points[0]).toMatchObject({ x: 0, y: 0.5 })
    expect(boundStrokesOf(outerBent, { gidung: bent }).find((item) => item.stroke.id === 'ㅐ-2')!.follows).toBe(true)
  })

  it('기둥이 기울면(끝 오프셋) 곁줄기 붙은 끝이 기운 선 위로 간다', () => {
    const jamo = withInstance('ㅏ', 'ㅏ-1', tilted)
    const box = at(medialBoxEmOf('ㅏ', 'strokes', 'open'))
    const { endEm, pillarXEm } = attachedAndPillar(jamo, 'ㅏ-2', box)
    expect(endEm.x).toBeCloseTo(pillarXEm, 9)
    // 곁줄기 높이 0.5에서 기울기 0.02em의 절반.
    expect(pillarXEm - (box.x + 0)).toBeCloseTo(0.01, 6)
  })

  it('곁줄기 자신이 휘어 있어도 붙은 끝과 그 손잡이가 같이 기둥으로 간다', () => {
    const bow: StemMaster = { name: 'gyeotjulgi', points: [{ t: 0, o: 0, handleOut: { t: 0.35, o: 0.02 } }, { t: 1, o: 0, handleIn: { t: 0.65, o: 0.02 } }] }
    const withBow = withInstance('ㅏ', 'ㅏ-2', bow)
    const jamo = { ...withBow, strokes: withBow.strokes!.map((stroke) => stroke.id === 'ㅏ-1' ? instanceOf(stroke, bent, stemReferenceBox('ㅏ', 'strokes', stroke)) : stroke) }
    const box = at(medialBoxEmOf('ㅏ', 'strokes', 'open'))
    const placed = placeStemStroke(jamo, strokeOf(jamo, 'ㅏ-2'), box, 'strokes')
    const unattached = placeStemStroke(withBow, strokeOf(withBow, 'ㅏ-2'), box, 'strokes')
    const dx = placed.stroke.points[0].x - unattached.stroke.points[0].x
    expect(Math.abs(dx)).toBeGreaterThan(0.01)
    expect(placed.stroke.points[0].handleOut!.x - unattached.stroke.points[0].handleOut!.x).toBeCloseTo(dx, 9)
    expect(placed.stroke.points[1]).toEqual(unattached.stroke.points[1])
  })
})

describe('G0 틈 — 뗀 만큼은 em 차이로 형제에 간다', () => {
  it('아에서 곁줄기를 기둥에서 떼면 마스터에 틈(em)이 담기고, 어 · 에 · 웨는 기둥 왼쪽으로 같은 em만큼 떨어져 짧아진다', () => {
    const a = withGap('ㅏ', 'ㅏ-2', 0.1)
    const master = masterFromStroke(a, 'strokes', 'ㅏ-2')!
    const refA = stemReferenceBox('ㅏ', 'strokes', strokeOf(a, 'ㅏ-2')).width
    expect(master.gap).toBeCloseTo(0.1 * refA, 9)
    expect(master.reach).toBeUndefined()
    expect(followsInJamo(a, 'strokes', strokeOf(a, 'ㅏ-2'), master)).toBe(true)
    // 틈 없는 마스터로는 풀림.
    expect(followsInJamo(a, 'strokes', strokeOf(a, 'ㅏ-2'), { name: master.name, points: master.points })).toBe(false)

    for (const [char, sideId, pillarId] of [['ㅓ', 'ㅓ-2', 'ㅓ-1'], ['ㅔ', 'ㅔ-2', 'ㅔ-1'], ['ㅞ', 'ㅞ-4', 'ㅞ-3']] as const) {
      const before = baseJungseong[char]
      // 전파 창은 고른 갈래에 마스터를 쓴다. 왼쪽으로 뻗는 형제까지 가려면 줄기 이름(부모)에 둔다.
      const after = applyMaster(before, {}, { gyeotjulgi: { ...master, name: 'gyeotjulgi' } })!
      expect(after, char).not.toBeNull()
      const channel = channelOf(after, sideId)
      const end = attachmentOf(after, sideId)!.ends[0]
      const side = strokeOf(after, sideId)
      const ref = stemReferenceBox(char, channel, side).width
      const pillarX = strokeOf(after, pillarId).points[0].x
      expect(end.away, `${char} 방향`).toBe(-1)
      expect((pointAt(side, end.end).x - pillarX - end.baseOffset) * end.away, `${char} 틈`).toBeCloseTo(master.gap! / ref, 9)
      expect(pointAt(side, end.end).x, `${char} 기둥 왼쪽`).toBeLessThan(pillarX)
      // 빈 끝은 그대로 — 길이 Δ가 없다.
      const free = attachmentOf(after, sideId)!.free!
      expect(pointAt(side, free.end), `${char} 빈 끝`).toEqual(pointAt(strokeOf(before, sideId), free.end))
      expect(followsInJamo(after, channel, side, master), `${char} 따름`).toBe(true)
    }
  })

  it('ㅓ에 틈이 있으면 놓인 붙은 끝이 기둥 중심선 왼쪽에 온다', () => {
    const eo = withGap('ㅓ', 'ㅓ-2', 0.1)
    const box = at(medialBoxEmOf('ㅓ', 'strokes', 'open'))
    const { endEm, pillarXEm } = attachedAndPillar(eo, 'ㅓ-2', box)
    expect(endEm.x).toBeLessThan(pillarXEm)
    expect(pillarXEm - endEm.x).toBeCloseTo(0.1 * stemReferenceBox('ㅓ', 'strokes', strokeOf(eo, 'ㅓ-2')).width, 9)
  })

  it('아에서 빈 끝을 당겨 줄이면 마스터에 길이 Δ(em, 짧아짐 −)가 담기고, 어 · 와 · 에도 빈 끝이 기둥 쪽으로 같은 em만큼 당겨진다 — 붙은 끝은 그대로', () => {
    const a = withReach('ㅏ', 'ㅏ-2', -0.1)
    const master = masterFromStroke(a, 'strokes', 'ㅏ-2')!
    const refA = stemReferenceBox('ㅏ', 'strokes', strokeOf(a, 'ㅏ-2')).width
    expect(master.reach).toBeCloseTo(-0.1 * refA, 9)
    expect(master.gap).toBeUndefined()
    expect(followsInJamo(a, 'strokes', strokeOf(a, 'ㅏ-2'), master)).toBe(true)
    expect(followsInJamo(a, 'strokes', strokeOf(a, 'ㅏ-2'), { name: master.name, points: master.points })).toBe(false)
    for (const [char, sideId, pillarId] of [['ㅓ', 'ㅓ-2', 'ㅓ-1'], ['ㅘ', 'ㅘ-4', 'ㅘ-3'], ['ㅔ', 'ㅔ-2', 'ㅔ-1']] as const) {
      const before = baseJungseong[char]
      const after = applyMaster(before, {}, { gyeotjulgi: { ...master, name: 'gyeotjulgi' } })!
      expect(after, char).not.toBeNull()
      const channel = channelOf(after, sideId)
      const attachment = attachmentOf(after, sideId)!
      const side = strokeOf(after, sideId)
      const ref = stemReferenceBox(char, channel, side).width
      const free = pointAt(side, attachment.free!.end)
      const baseFree = pointAt(strokeOf(before, sideId), attachment.free!.end)
      expect((free.x - baseFree.x) * attachment.free!.away, `${char} 길이`).toBeCloseTo(-0.1 * refA / ref, 9)
      const pillarX = strokeOf(after, pillarId).points[0].x
      expect(Math.abs(free.x - pillarX), `${char} 짧아짐`).toBeLessThan(Math.abs(baseFree.x - pillarX))
      expect(pointAt(side, attachment.ends[0].end).x, `${char} 붙은 끝`).toBeCloseTo(pillarX + attachment.ends[0].baseOffset, 12)
      expect(followsInJamo(after, channel, side, master), `${char} 따름`).toBe(true)
    }
  })

  it('ㅐ 걸침의 양 끝을 기둥에서 떼면 틈 둘(gap · gapEnd)이 담기고, ㅒ · ㅙ의 걸침도 양 끝이 같은 em만큼 떨어진다', () => {
    const inner = withEndMoved('ㅐ', 'ㅐ-2', 'start', 0.1)
    const both = { ...inner, strokes: inner.strokes!.map((stroke) => stroke.id === 'ㅐ-2' ? { ...stroke, points: stroke.points.map((point, index) => index === 1 ? { ...point, x: point.x - 0.05 } : point) } : stroke) }
    const master = masterFromStroke(both, 'strokes', 'ㅐ-2')!
    const refAe = stemReferenceBox('ㅐ', 'strokes', strokeOf(both, 'ㅐ-2')).width
    expect(master.gap).toBeCloseTo(0.1 * refAe, 9)
    expect(master.gapEnd).toBeCloseTo(0.05 * refAe, 9)
    expect(master.reach).toBeUndefined()
    expect(followsInJamo(both, 'strokes', strokeOf(both, 'ㅐ-2'), master)).toBe(true)
    for (const [char, crossId] of [['ㅒ', 'ㅒ-2'], ['ㅒ', 'ㅒ-3'], ['ㅙ', 'ㅙ-4']] as const) {
      const before = baseJungseong[char]
      const after = applyMaster(before, {}, { geolchim: master })!
      expect(after, char).not.toBeNull()
      const channel = channelOf(after, crossId)
      const attachment = attachmentOf(after, crossId)!
      const side = strokeOf(after, crossId)
      const ref = stemReferenceBox(char, channel, side).width
      attachment.ends.forEach((end, order) => {
        const pillarX = strokeOf(after, end.pillarId).points[0].x
        const expected = (order === 0 ? master.gap! : master.gapEnd!) / ref
        expect((pointAt(side, end.end).x - pillarX - end.baseOffset) * end.away, `${char} ${crossId} ${end.end} 틈`).toBeCloseTo(expected, 9)
      })
      // 양 끝이 안쪽으로 들어와 짧아졌다.
      expect(side.points[1].x - side.points[0].x, `${char} ${crossId} 길이`).toBeLessThan(strokeOf(before, crossId).points[1].x - strokeOf(before, crossId).points[0].x)
      expect(followsInJamo(after, channel, side, master), `${char} ${crossId} 따름`).toBe(true)
    }
  })

  it('틈 0 · 길이 Δ 0인 마스터는 gap · gapEnd · reach를 안 담고, 기본 곁줄기 · 걸침은 전부 따른다', () => {
    for (const [char, pairs] of Object.entries(STEM_PILLARS)) {
      const jamo = baseJungseong[char]
      for (const strokeId of Object.keys(pairs)) {
        const master = masterFromStroke(jamo, channelOf(jamo, strokeId), strokeId)!
        expect(master.gap, `${char} ${strokeId}`).toBeUndefined()
        expect(master.gapEnd, `${char} ${strokeId}`).toBeUndefined()
        expect(master.reach, `${char} ${strokeId}`).toBeUndefined()
        expect(boundStrokesOf(jamo, {}).find((item) => item.stroke.id === strokeId)!.follows, `${char} ${strokeId}`).toBe(true)
      }
    }
  })
})
