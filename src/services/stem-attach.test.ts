import { describe, expect, it } from 'vitest'
import baseJamos from '../data/baseJamos.json'
import type { BoxConfig, JamoData, StrokeDataV2 } from '../types'
import { attachmentOf, centerlineXAtY, SIDE_STROKE_PILLARS } from './stemAttach'
import { placeStemStroke } from './stemBend'
import { applyMaster, boundStrokesOf, followsInJamo, instanceOf, JAMO_CHANNELS, masterFromStroke, medialBoxEmOf, stemReferenceBox, type JamoChannel, type StemMaster } from './stemMaster'
import { grammarOf } from './strokeGrammar'

const baseJungseong = (baseJamos as unknown as { jungseong: Record<string, JamoData> }).jungseong
const bent: StemMaster = { name: 'gidung', points: [{ t: 0, o: 0, handleOut: { t: 0.4, o: 0.03 } }, { t: 1, o: 0, handleIn: { t: 0.7, o: -0.01 } }] }
const tilted: StemMaster = { name: 'gidung', points: [{ t: 0, o: 0 }, { t: 1, o: 0.02 }] }
const at = (size: { width: number; height: number }): BoxConfig => ({ x: 0.4, y: 0.1, ...size })

const channelOf = (jamo: JamoData, strokeId: string): JamoChannel => JAMO_CHANNELS.find((channel) => jamo[channel]?.some((stroke) => stroke.id === strokeId))!
const strokeOf = (jamo: JamoData, id: string): StrokeDataV2 => JAMO_CHANNELS.flatMap((channel) => jamo[channel] ?? []).find((stroke) => stroke.id === id)!
/** 자모 한 획을 마스터 인스턴스로 바꾼 자모. */
function withInstance(char: string, strokeId: string, master: StemMaster): JamoData {
  const jamo = structuredClone(baseJungseong[char])
  const channel = channelOf(jamo, strokeId)
  jamo[channel] = jamo[channel]!.map((stroke) => stroke.id === strokeId ? instanceOf(stroke, master, stemReferenceBox(char, channel, stroke)) : stroke)
  return jamo
}
/** 곁줄기 붙은 끝의 x를 저장 좌표에서 옮긴 자모. */
function withGap(char: string, strokeId: string, dx: number): JamoData {
  const jamo = structuredClone(baseJungseong[char])
  const channel = channelOf(jamo, strokeId)
  const attachment = attachmentOf(jamo, strokeId)!
  jamo[channel] = jamo[channel]!.map((stroke) => {
    if (stroke.id !== strokeId) return stroke
    const index = attachment.end === 'start' ? 0 : stroke.points.length - 1
    const points = stroke.points.map((point, at) => at === index ? { ...point, x: point.x + dx } : point)
    return { ...stroke, points }
  })
  return jamo
}
const emOf = (placed: { box: BoxConfig }, point: { x: number; y: number }) => ({ x: placed.box.x + point.x * placed.box.width, y: placed.box.y + point.y * placed.box.height })
/** 놓인 곁줄기의 붙은 끝과, 그 높이에서 놓인 기둥 중심선의 x(em). */
function attachedAndPillar(jamo: JamoData, sideId: string, box: BoxConfig) {
  const channel = channelOf(jamo, sideId)
  const attachment = attachmentOf(jamo, sideId)!
  const side = placeStemStroke(jamo, strokeOf(jamo, sideId), box, channel)
  const pillar = placeStemStroke(jamo, strokeOf(jamo, attachment.pillarId), box, channel)
  const end = side.stroke.points[attachment.end === 'start' ? 0 : side.stroke.points.length - 1]
  const endEm = emOf(side, end)
  const pillarX = centerlineXAtY(pillar.stroke, (endEm.y - pillar.box.y) / pillar.box.height)!
  return { endEm, pillarXEm: pillar.box.x + pillarX * pillar.box.width, stored: strokeOf(jamo, sideId).points[attachment.end === 'start' ? 0 : 1], side }
}

describe('D0 대응표 — 곁줄기는 기둥에 붙는다', () => {
  it('아홉 홀자의 곁줄기마다 같은 채널의 기둥 하나이고, 붙은 끝은 기둥 시작점 x + 기본 어긋남에 있다', () => {
    const seen: string[] = []
    for (const [char, pairs] of Object.entries(SIDE_STROKE_PILLARS)) {
      const jamo = baseJungseong[char]
      const table = grammarOf('jungseong', char)
      for (const [sideId, pillarId] of Object.entries(pairs)) {
        seen.push(char)
        expect(table[sideId], `${char} ${sideId}`).toBe('gyeotjulgi')
        expect(table[pillarId], `${char} ${pillarId}`).toBe('gidung')
        expect(channelOf(jamo, sideId), `${char} 채널`).toBe(channelOf(jamo, pillarId))
        const attachment = attachmentOf(jamo, sideId)!
        const side = strokeOf(jamo, sideId)
        const pillar = strokeOf(jamo, pillarId)
        const end = side.points[attachment.end === 'start' ? 0 : side.points.length - 1]
        expect(end.x, `${char} ${sideId} 붙은 끝`).toBeCloseTo(pillar.points[0].x + attachment.baseOffset, 12)
        // 기본 어긋남은 ㅘ 세로부(0.04)만 있고 나머지는 0.
        expect(Math.abs(attachment.baseOffset) < 1e-12 || char === 'ㅘ', `${char} 기본 어긋남`).toBe(true)
      }
    }
    expect([...new Set(seen)].sort()).toEqual(['ㅏ', 'ㅑ', 'ㅓ', 'ㅔ', 'ㅕ', 'ㅖ', 'ㅘ', 'ㅝ', 'ㅞ'])
    // 에 · 예 · 웨는 안쪽 기둥, ㅐ · ㅒ의 걸침은 대상이 아니다.
    expect(SIDE_STROKE_PILLARS['ㅔ']['ㅔ-2']).toBe('ㅔ-1')
    expect(SIDE_STROKE_PILLARS['ㅐ']).toBeUndefined()
    expect(attachmentOf(baseJungseong['ㅐ'], 'ㅐ-2')).toBeNull()
  })

  it('빈 끝이 오른쪽(ㅏ)이면 시작점이, 왼쪽(ㅓ · ㅔ · ㅝ)이면 끝점이 붙은 끝이고, 틈의 + 방향은 빈 끝 쪽이다', () => {
    expect(attachmentOf(baseJungseong['ㅏ'], 'ㅏ-2')!.away).toBe(1)
    expect(attachmentOf(baseJungseong['ㅓ'], 'ㅓ-2')!.away).toBe(-1)
    expect(attachmentOf(baseJungseong['ㅘ'], 'ㅘ-4')!.away).toBe(1)
    expect(attachmentOf(baseJungseong['ㅏ'], 'ㅏ-2')!.end).toBe('start')
    expect(attachmentOf(baseJungseong['ㅓ'], 'ㅓ-2')!.end).toBe('end')
    expect(attachmentOf(baseJungseong['ㅔ'], 'ㅔ-2')!.end).toBe('end')
    expect(attachmentOf(baseJungseong['ㅝ'], 'ㅝ-4')!.end).toBe('end')
    expect(attachmentOf(baseJungseong['ㅘ'], 'ㅘ-4')!.end).toBe('start')
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

describe('G0 붙임 — 곁줄기 붙은 끝은 기둥의 놓인 중심선을 따른다', () => {
  it('기본 홀자는 어느 칸에서도 같은 획 그대로다(마스터 없는 폰트는 픽셀까지 같다)', () => {
    for (const [char, pairs] of Object.entries(SIDE_STROKE_PILLARS)) {
      const jamo = baseJungseong[char]
      for (const sideId of Object.keys(pairs)) {
        const channel = channelOf(jamo, sideId)
        for (const final of ['open', 'closed'] as const) {
          const box = at(medialBoxEmOf(char, channel, final))
          expect(placeStemStroke(jamo, strokeOf(jamo, sideId), box, channel).stroke, `${char} ${sideId} ${final}`).toBe(strokeOf(jamo, sideId))
        }
      }
    }
  })

  it.each([['ㅏ', 'ㅏ-1', 'ㅏ-2'], ['ㅓ', 'ㅓ-1', 'ㅓ-2'], ['ㅔ', 'ㅔ-1', 'ㅔ-2'], ['ㅘ', 'ㅘ-3', 'ㅘ-4'], ['ㅞ', 'ㅞ-3', 'ㅞ-4']])('%s 기둥을 휘면 곁줄기가 그 높이의 기둥 중심선에 붙고, 저장 획은 그대로다', (char, pillarId, sideId) => {
    const jamo = withInstance(char, pillarId, bent)
    const channel = channelOf(jamo, sideId)
    for (const final of ['open', 'closed'] as const) {
      const box = at(medialBoxEmOf(char, channel, final))
      const { endEm, pillarXEm, stored, side } = attachedAndPillar(jamo, sideId, box)
      const baseOffsetEm = attachmentOf(jamo, sideId)!.baseOffset * box.width
      expect(endEm.x - baseOffsetEm, `${char} ${final}`).toBeCloseTo(pillarXEm, 9)
      // 기둥이 휘었으니 저장 x 그대로가 아니다.
      expect(Math.abs(endEm.x - emOf(side, stored).x), `${char} ${final} 움직임`).toBeGreaterThan(0.001)
      expect(side.stroke.points.length).toBe(2)
    }
    // 곁줄기 저장 획은 안 바뀌었고 마스터도 여전히 따른다(풀리지 않는다).
    expect(strokeOf(jamo, sideId)).toEqual(strokeOf(baseJungseong[char], sideId))
    expect(boundStrokesOf(jamo, { gidung: bent }).find((item) => item.stroke.id === sideId)!.follows).toBe(true)
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
  it('아에서 곁줄기를 기둥에서 떼면 마스터에 틈(em)이 담기고, 어 · 에 · 웨에 같은 em만큼 간다', () => {
    const a = withGap('ㅏ', 'ㅏ-2', 0.1)
    const master = masterFromStroke(a, 'strokes', 'ㅏ-2')!
    const refA = stemReferenceBox('ㅏ', 'strokes', strokeOf(a, 'ㅏ-2')).width
    expect(master.gap).toBeCloseTo(0.1 * refA, 9)
    expect(followsInJamo(a, 'strokes', strokeOf(a, 'ㅏ-2'), master)).toBe(true)
    // 틈 없는 마스터로는 풀림 — 전파 단추가 뜨는 조건.
    expect(followsInJamo(a, 'strokes', strokeOf(a, 'ㅏ-2'), { name: master.name, points: master.points })).toBe(false)

    for (const [char, sideId, pillarId] of [['ㅓ', 'ㅓ-2', 'ㅓ-1'], ['ㅔ', 'ㅔ-2', 'ㅔ-1'], ['ㅞ', 'ㅞ-4', 'ㅞ-3']] as const) {
      const before = baseJungseong[char]
      // 전파 창은 고른 갈래에 마스터를 쓴다. 왼쪽으로 뻗는 형제까지 가려면 줄기 이름(부모)에 둔다.
      const after = applyMaster(before, {}, { gyeotjulgi: { ...master, name: 'gyeotjulgi' } })!
      expect(after, char).not.toBeNull()
      const channel = channelOf(after, sideId)
      const attachment = attachmentOf(after, sideId)!
      const side = strokeOf(after, sideId)
      const end = side.points[attachment.end === 'start' ? 0 : side.points.length - 1]
      const ref = stemReferenceBox(char, channel, side).width
      // 틈은 빈 끝 쪽(+). 왼쪽으로 뻗는 ㅓ ㅔ ㅞ는 붙은 끝이 기둥 왼쪽으로 떨어져 짧아진다 — 기둥을 뚫고 오른쪽으로 가지 않는다.
      expect(attachment.away, `${char} 방향`).toBe(-1)
      expect((end.x - strokeOf(after, pillarId).points[0].x - attachment.baseOffset) * attachment.away, `${char} 틈`).toBeCloseTo(master.gap! / ref, 9)
      expect(end.x, `${char} 기둥 왼쪽`).toBeLessThan(strokeOf(after, pillarId).points[0].x)
      // 빈 끝은 그대로 — 길이는 보선이 정한다.
      const free = side.points[attachment.end === 'start' ? side.points.length - 1 : 0]
      const baseFree = strokeOf(before, sideId).points[attachment.end === 'start' ? side.points.length - 1 : 0]
      expect(free, `${char} 빈 끝`).toEqual(baseFree)
      expect(followsInJamo(after, channel, side, master), `${char} 따름`).toBe(true)
    }
  })

  it('틈 0인 마스터는 gap을 안 담고, 기본 곁줄기는 전부 따른다', () => {
    for (const [char, pairs] of Object.entries(SIDE_STROKE_PILLARS)) {
      const jamo = baseJungseong[char]
      for (const sideId of Object.keys(pairs)) {
        const master = masterFromStroke(jamo, channelOf(jamo, sideId), sideId)!
        expect(master.gap, `${char} ${sideId}`).toBeUndefined()
        expect(boundStrokesOf(jamo, {}).find((item) => item.stroke.id === sideId)!.follows, `${char} ${sideId}`).toBe(true)
      }
    }
  })
})

describe('G0 틈 — 놓을 때도 빈 끝 쪽으로 떨어진다', () => {
  it('ㅓ에 틈이 있으면 놓인 붙은 끝이 기둥 중심선 왼쪽에 온다', () => {
    const eo = withGap('ㅓ', 'ㅓ-2', -0.1)
    const box = at(medialBoxEmOf('ㅓ', 'strokes', 'open'))
    const { endEm, pillarXEm } = attachedAndPillar(eo, 'ㅓ-2', box)
    expect(endEm.x).toBeLessThan(pillarXEm)
    expect(pillarXEm - endEm.x).toBeCloseTo(0.1 * stemReferenceBox('ㅓ', 'strokes', strokeOf(eo, 'ㅓ-2')).width, 9)
  })
})
