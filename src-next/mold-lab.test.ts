import { describe, expect, it } from 'vitest'
import type { DecomposedSyllable, JamoData, StrokeDataV2 } from '../src/types'
import { bendMaster, branchSyllable, jagBoxes, JAG_INITIALS, stemSyllable, clampToWall, dragValue, groupOfPart, GROUPS, groupsOfSyllable, inSafe, moldBoxes, partAt, presetOf } from './moldLab'

const box = (x: number, y: number, width: number, height: number) => ({ x, y, width, height })
const VERTICAL = { CH: box(0.1, 0.2, 0.4, 0.6), JU: box(0.6, 0.05, 0.3, 0.9) }
const HORIZONTAL_FINAL = { CH: box(0.25, 0.05, 0.5, 0.3), JU: box(0.05, 0.38, 0.9, 0.15), JO: box(0.2, 0.6, 0.6, 0.35) }

describe('빚기 시험판', () => {
  it('잡은 부위로 갈래를 정한다 — 홀자는 홀자 갈래, 첫닿자 · 받침은 짜임', () => {
    expect(groupOfPart('JU', 'choseong-jungseong-vertical', 'ㅏ')).toBe('v-right')
    expect(groupOfPart('JU', 'choseong-jungseong-vertical-jongseong', 'ㅓ')).toBe('v-left')
    expect(groupOfPart('JU', 'choseong-jungseong-horizontal', 'ㅜ')).toBe('h-down')
    expect(groupOfPart('CH', 'choseong-jungseong-horizontal', 'ㅗ')).toBe('ch-horizontal')
    expect(groupOfPart('JO', 'choseong-jungseong-mixed-jongseong', 'ㅘ')).toBe('jo-mixed')
    expect(groupOfPart('JO', 'choseong-jungseong-vertical', 'ㅏ')).toBeUndefined()
    expect(groupsOfSyllable('choseong-jungseong-vertical-jongseong', 'ㅐ')).toEqual(['v-double', 'ch-vertical', 'jo-vertical'])
  })

  it('프리셋 셋은 안전선 안, 벽은 안전선 밖이다', () => {
    for (const info of Object.values(GROUPS)) {
      if (!info.range) continue
      const { presets, wall, safe } = info.range
      expect(presets.narrow).toBeLessThan(presets.normal)
      expect(presets.normal).toBeLessThan(presets.wide)
      for (const value of Object.values(presets)) expect(inSafe(info.range, value)).toBe(true)
      expect(wall[0]).toBeLessThan(safe[0])
      expect(wall[1]).toBeGreaterThan(safe[1])
    }
  })

  it('끌어도 벽 밖으로 안 나간다', () => {
    const range = GROUPS['v-none'].range!
    expect(dragValue(range, range.presets.normal, -10_000, 300)).toBe(range.wall[0])
    expect(dragValue(range, range.presets.normal, 10_000, 300)).toBe(range.wall[1])
    expect(clampToWall(range, 0)).toBe(range.wall[0])
    expect(presetOf(range, range.presets.wide)).toBe('wide')
    expect(presetOf(range, range.presets.wide + 0.001)).toBeUndefined()
  })

  it('세로 갈래 틈을 넓히면 첫닿자만 바깥(왼쪽)으로 간다', () => {
    const range = GROUPS['v-right'].range!
    const out = moldBoxes(VERTICAL, 'choseong-jungseong-vertical', 'ㅏ', { 'v-right': range.engine + 0.02 })
    expect(out.CH!.x).toBeCloseTo(0.08)
    expect(out.JU).toEqual(VERTICAL.JU)
    // 다른 갈래 값은 안 듣는다.
    expect(moldBoxes(VERTICAL, 'choseong-jungseong-vertical', 'ㅏ', { 'v-left': range.engine + 0.02 })).toEqual(VERTICAL)
  })

  it('받침 위 틈은 받침을 그대로 두고 윗부분만 옮긴다', () => {
    const range = GROUPS['jo-horizontal'].range!
    const out = moldBoxes(HORIZONTAL_FINAL, 'choseong-jungseong-horizontal-jongseong', 'ㅗ', { 'jo-horizontal': range.engine - 0.01 })
    expect(out.JO).toEqual(HORIZONTAL_FINAL.JO)
    expect(out.CH!.y).toBeCloseTo(0.06)
    expect(out.JU!.y).toBeCloseTo(0.39)
  })

  it('첫닿자 크기는 홀자 쪽 모서리를 두고 키운다', () => {
    const out = moldBoxes(VERTICAL, 'choseong-jungseong-vertical', 'ㅏ', { 'ch-vertical': 1.1 })
    expect(out.CH!.x + out.CH!.width).toBeCloseTo(0.5)
    expect(out.CH!.width).toBeCloseTo(0.44)
    expect(out.CH!.y + out.CH!.height / 2).toBeCloseTo(0.5)
  })

  it('누른 자리에서 가장 가까운 부위를 고른다', () => {
    const present = { CH: true, JU: true, JO: true }
    expect(partAt(HORIZONTAL_FINAL, 0.5, 0.15, present)).toBe('CH')
    expect(partAt(HORIZONTAL_FINAL, 0.02, 0.45, present)).toBe('JU')
    expect(partAt(HORIZONTAL_FINAL, 0.5, 0.99, present)).toBe('JO')
    expect(partAt(HORIZONTAL_FINAL, 0.5, 0.99, { CH: true, JU: true })).toBe('JU')
  })
})

describe('큰 빚기', () => {
  it('크기는 첫닿자를 키우고 받침은 밑선을 두고 줄인다', async () => {
    const { bigBoxes } = await import('./moldLab')
    const out = bigBoxes(HORIZONTAL_FINAL, { size: 1.1 })
    expect(out.CH!.width).toBeCloseTo(0.55)
    expect(out.CH!.x + out.CH!.width / 2).toBeCloseTo(0.5)
    expect(out.JO!.height).toBeCloseTo(0.315)
    expect(out.JO!.y + out.JO!.height).toBeCloseTo(0.95)
    expect(out.JU).toEqual(HORIZONTAL_FINAL.JU)
  })

  it('틀은 가운데를 두고 가로만 줄이고, 벽 밖 값은 벽에서 멈춘다', async () => {
    const { bigBoxes, bigInfo } = await import('./moldLab')
    const out = bigBoxes(VERTICAL, { frame: 0.5 })
    const w = bigInfo('frame').range.wall[0]
    expect(out.JU!.width).toBeCloseTo(0.3 * w)
    expect(out.JU!.y).toBe(VERTICAL.JU.y)
    expect(out.CH!.x).toBeCloseTo(0.5 + (0.1 - 0.5) * w)
  })

  it('숨은 진하게면 굵고 붙고, 성기게면 가늘고 벌어진다', async () => {
    const { breathOf } = await import('./moldLab')
    expect(breathOf(0)).toEqual({ weight: 1, tracking: 0 })
    expect(breathOf(-1).weight).toBeGreaterThan(1)
    expect(breathOf(-1).tracking).toBeLessThan(0)
    expect(breathOf(1).weight).toBeLessThan(1)
    expect(breathOf(1).tracking).toBeGreaterThan(0)
  })
})

describe('획 사이 최소 틈', () => {
  // ㄹ처럼 가로 셋을 지그재그로 이은 획 하나(칸 0.5 높이). 획 사이 중심 거리 0.25 · 0.25.
  const rieul = (height: number, thickness = 0.05) => [{
    points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 0.5 }, { x: 0, y: 0.5 }, { x: 0, y: 1 }, { x: 1, y: 1 }],
    closed: false, box: { x: 0.2, y: 0.2, width: 0.5, height }, thickness,
  }]

  it('기울기 0이면 지금 칸의 처음 틈 70%가 남을 때까지 굵어질 수 있다', async () => {
    const { gapCapMultiplier } = await import('./moldLab')
    // 틈 g0 = 0.25 − 0.05 = 0.2 → 0.25 − m × 0.05 ≥ 0.14 → m ≤ 2.2
    expect(gapCapMultiplier(rieul(0.5), rieul(0.5), 1, 0.7, 0)).toBeCloseTo(2.2)
    // 칸을 줄이면(중심 거리 0.2, g0 0.15) 덜 굵어진다 → 0.2 − 0.05m ≥ 0.105 → m ≤ 1.9
    expect(gapCapMultiplier(rieul(0.5), rieul(0.4), 1, 0.7, 0)).toBeCloseTo(1.9)
  })

  it('굵기선을 따르면 굵어진 만큼 기대 틈도 줄어 바닥이 낮아지되, 틈은 엔진 틈 바닥(두께의 0.2배, 최소 0.025em) 밑으로 안 간다', async () => {
    const { gapCapMultiplier } = await import('./moldLab')
    // 굵기선 쪽은 여유가 커서, 절대 바닥(0.2 ≥ 1.2 × 0.05m → m ≤ 3.33)이 먼저 막는다.
    expect(gapCapMultiplier(rieul(0.5), rieul(0.4), 1)).toBeCloseTo(10 / 3)
    // 칸을 아주 좁히면(중심 거리 0.05) 처음 굵기로도 붙는다 → 가늘게. 0.025em 바닥이 먼저 막는다(0.05 − 0.05m ≥ 0.025 → m ≤ 0.5).
    expect(gapCapMultiplier(rieul(0.5), rieul(0.1), 1)).toBeCloseTo(0.5)
  })
})

describe('획 사이 최소 틈 — 자소 사이', () => {
  it('자소가 다른 획 짝은 세지 않는다', async () => {
    const { gapCapMultiplier } = await import('./moldLab')
    const bar = (y: number, part: string) => ({ points: [{ x: 0, y }, { x: 1, y }], closed: false, box: { x: 0, y: 0, width: 1, height: 1 }, thickness: 0.05, part })
    const pair = [bar(0.3, 'CH'), bar(0.4, 'JU')]
    expect(gapCapMultiplier(pair, pair, 1)).toBe(Infinity)
    const same = [bar(0.3, 'CH'), bar(0.4, 'CH')]
    expect(gapCapMultiplier(same, same, 1)).toBeLessThan(Infinity)
  })
})

describe('획 사이 최소 틈 — 닿는 곳 가까이', () => {
  it('ㅅ처럼 한 점에서 갈라지는 두 획의 쐐기는 세지 않는다', async () => {
    const { gapCapMultiplier } = await import('./moldLab')
    const leg = (x: number) => ({ points: [{ x: 0.5, y: 0 }, { x, y: 1 }], closed: false, box: { x: 0, y: 0, width: 0.5, height: 0.5 }, thickness: 0.05, part: 'CH' })
    const siot = [leg(0), leg(1)]
    expect(gapCapMultiplier(siot, siot, 1)).toBe(Infinity)
  })
})

describe('심즈처럼 빚기', () => {
  const vertical = 'choseong-jungseong-vertical-jongseong' as const
  const boxes = {
    CH: { x: 0.12, y: 0.14, width: 0.35, height: 0.29 },
    JU: { x: 0.7, y: 0.05, width: 0.17, height: 0.47 },
    JO: { x: 0.2, y: 0.62, width: 0.6, height: 0.3 },
  }
  it('칸 편집은 선 이동량이라 되돌려 입히면 같은 칸', async () => {
    const { applyPartEdits, editsBetween } = await import('./moldLab')
    const next = { ...boxes, CH: { x: 0.1, y: 0.14, width: 0.4, height: 0.35 } }
    const edits = editsBetween(boxes, next)
    const back = applyPartEdits(boxes, edits)
    expect(back.CH!.width).toBeCloseTo(0.4)
    expect(back.CH!.height).toBeCloseTo(0.35)
    expect(back.JO!.y).toBeCloseTo(0.62)
  })
  it('첫닿자 키를 키우면 받침이 위에서 눌리고 밑선은 그대로', async () => {
    const { dragPart } = await import('./moldLab')
    const out = dragPart(boxes, boxes, 'CH', 0, -0.05, vertical)
    expect(out.CH!.height).toBeCloseTo(0.34)
    expect(out.JO!.y).toBeGreaterThan(boxes.JO.y)
    expect(out.JO!.y + out.JO!.height).toBeCloseTo(boxes.JO.y + boxes.JO.height)
  })
  it('받침이 더 못 눌리면 첫닿자도 멈춘다', async () => {
    const { dragPart } = await import('./moldLab')
    const out = dragPart(boxes, boxes, 'CH', 0, -1, vertical)
    // 이웃 벽: 받침은 처음 키의 70% 아래로 안 눌린다.
    expect(out.JO!.height).toBeGreaterThan(0.3 * 0.7 - 1e-9)
    expect(out.CH!.y + out.CH!.height).toBeLessThan(out.JO!.y)
  })
  it('세로홀자 기둥을 옮기면 첫닿자가 밀리지 않고 홀자만 옮겨진다(사이가 벌어질 때)', async () => {
    const { dragPart } = await import('./moldLab')
    const out = dragPart(boxes, boxes, 'JU', 0.05, 0, vertical)
    expect(out.JU!.x).toBeCloseTo(0.75)
    expect(out.CH!.x + out.CH!.width).toBeCloseTo(0.75 - (0.7 - 0.47))
  })
  it('여덟 방향', async () => {
    const { dirOf } = await import('./moldLab')
    expect(dirOf(0, -10)).toBe('up')
    expect(dirOf(-10, -10)).toBe('ul')
    expect(dirOf(10, 10)).toBe('dr')
    expect(dirOf(-10, 1)).toBe('left')
  })
  it('홀자 방향 말은 짜임에 따라 다르다', async () => {
    const { regionLabels } = await import('./moldLab')
    expect(regionLabels('JU', vertical).left).toBe('기둥 왼쪽으로')
    expect(regionLabels('JU', 'choseong-jungseong-horizontal').up).toBe('보 위로')
  })
  it('획 · 전체는 한계선 밖으로 안 나간다', async () => {
    const { dragLook, LOOK_WALL } = await import('./moldLab')
    expect(dragLook({}, 'STROKE', 0, -5).weight).toBe(LOOK_WALL.weight[1])
    expect(dragLook({}, 'STROKE', 0, 5).weight).toBe(LOOK_WALL.weight[0])
    expect(dragLook({}, 'WHOLE', 5, 0).tracking).toBe(LOOK_WALL.tracking[1])
  })
  it('굵기 벽은 엔진 굵기 100부터, 위 끝은 900(노토 700 수준 두께 × 1.15, 하니무스 2026-11-24 "900으로 가기로 해.")', async () => {
    const { LOOK_WALL, scaledWeight, heavyThicknessOf, BLACK_RATIO, BLACK_CENTER } = await import('./moldLab')
    expect(scaledWeight(400, LOOK_WALL.weight[0])).toBe(100)
    expect(BLACK_RATIO).toBeCloseTo(0.173 / (0.07 / 0.9033), 6)
    expect(BLACK_RATIO / BLACK_CENTER).toBeCloseTo(1.23, 6)
    expect(heavyThicknessOf(LOOK_WALL.weight[1])).toBeCloseTo(BLACK_RATIO, 2)
  })
  it('홀자 기둥을 끝까지 옮겨도 홀자는 납작해지지 않고, 첫닿자는 70% 벽에서 멈춘다', async () => {
    const { dragPart, NEIGHBOR_FLOOR } = await import('./moldLab')
    const out = dragPart(boxes, boxes, 'JU', -1, 0, vertical)
    expect(out.JU!.width).toBeCloseTo(boxes.JU.width)
    expect(out.CH!.width).toBeGreaterThan(boxes.CH.width * NEIGHBOR_FLOOR - 1e-9)
    expect(out.CH!.x).toBeGreaterThan(0.02 - 1e-9)
  })
  it('가로홀자 보를 끝까지 올려도 보 칸 키는 그대로', async () => {
    const { dragPart } = await import('./moldLab')
    const h = { CH: { x: 0.2, y: 0.1, width: 0.6, height: 0.35 }, JU: { x: 0.1, y: 0.55, width: 0.8, height: 0.3 } }
    const out = dragPart(h, h, 'JU', 0, -1, 'choseong-jungseong-horizontal')
    expect(out.JU!.height).toBeCloseTo(0.3)
    expect(out.CH!.height).toBeGreaterThan(0.35 * 0.7 - 1e-9)
  })
  it('칸 손잡이: 변 하나만 움직이고, 가운데는 통째로 옮긴다', async () => {
    const { dragGrip, gripAt } = await import('./moldLab')
    const left = dragGrip(boxes, boxes, 'JO', 'l', -0.05, 0)
    expect(left.JO!.x).toBeCloseTo(0.15)
    expect(left.JO!.x + left.JO!.width).toBeCloseTo(0.8)
    const moved = dragGrip(boxes, boxes, 'CH', 'move', 0, 0.03)
    expect(moved.CH!.y).toBeCloseTo(0.17)
    expect(moved.CH!.height).toBeCloseTo(0.29)
    expect(gripAt(boxes.CH, 0.12, 0.3, 0.05)).toBe('l')
    expect(gripAt(boxes.CH, 0.295, 0.285, 0.05)).toBe('move')
    expect(gripAt(boxes.CH, 0.9, 0.9, 0.05)).toBeUndefined()
  })
  it('네모꼴 손잡이: 모서리는 크기, 위아래 변은 키, 좌우 변은 폭', async () => {
    const { dragWhole, wholeGripAt, lookOf } = await import('./moldLab')
    const body: [number, number, number, number] = [0.1, 0.1, 0.9, 0.9]
    expect(wholeGripAt(body, 0.1, 0.1, 0.05)).toBe('tl')
    expect(wholeGripAt(body, 0.5, 0.9, 0.05)).toBe('b')
    expect(lookOf(dragWhole({}, body, 'r', 0.04, 0), 'frame')).toBeCloseTo(1.1)
    expect(lookOf(dragWhole({}, body, 't', 0, 0.04), 'height')).toBeCloseTo(0.9)
    expect(lookOf(dragWhole({}, body, 'br', -0.04, -0.04), 'size')).toBeCloseTo(0.9)
  })
})

describe('굵기 배율', () => {
  it('칸을 만져 틈 상한이 1 아래로 내려가도 굵기는 그대로, 굵게 할 때만 멈춘다', async () => {
    const { appliedWeight } = await import('./moldLab')
    expect(appliedWeight(1, 0.8)).toBe(1)
    expect(appliedWeight(0.8, 0.5)).toBe(0.8)
    expect(appliedWeight(1.4, 1.2)).toBe(1.2)
    expect(appliedWeight(1.4, 0.7)).toBe(1)
  })
})

describe('보선 끌기(A안)', () => {
  it('세로 짜임 보선을 밀면 첫닿자가 넓어지고 홀자가 좁아진다 — 둘은 안 겹친다', async () => {
    const { seamsOf, dragSeam, applyPartEdits, seamPos } = await import('./moldLab')
    const seams = seamsOf('choseong-jungseong-vertical', VERTICAL)
    expect(seams).toHaveLength(1)
    const out = dragSeam(seams[0], VERTICAL, {}, 0.04)
    const now = applyPartEdits(VERTICAL, out.edits)
    expect(now.CH!.width).toBeCloseTo(0.44)
    expect(now.JU!.x).toBeCloseTo(0.64)
    expect(now.CH!.x + now.CH!.width).toBeLessThanOrEqual(now.JU!.x)
    expect(seamPos(seams[0], now)).toBeCloseTo(0.59)
    expect(out.clamped).toBe(false)
  })
  it('보선은 최소 간격(처음의 NEIGHBOR_FLOOR배, 0.8)에서 한 번 붙들고, 더 끌면 넘어가 0.45배에서 막힌다', async () => {
    const { seamsOf, dragSeam, applyPartEdits } = await import('./moldLab')
    const seam = seamsOf('choseong-jungseong-vertical', VERTICAL)[0]
    const held = dragSeam(seam, VERTICAL, {}, 0.1)
    expect(held.wall).toBe('held')
    expect(applyPartEdits(VERTICAL, held.edits).JU!.width).toBeCloseTo(0.24)
    const past = dragSeam(seam, VERTICAL, {}, 0.2)
    expect(past.wall).toBe('past')
    expect(applyPartEdits(VERTICAL, past.edits).JU!.width).toBeCloseTo(0.16)
    const out = dragSeam(seam, VERTICAL, {}, 0.5)
    expect(out.clamped).toBe(true)
    expect(applyPartEdits(VERTICAL, out.edits).JU!.width).toBeCloseTo(0.135)
    // 선 하나인 칸(ㅣ)은 칸째로 옮긴다
    const thin = { CH: VERTICAL.CH, JU: { x: 0.7, y: 0.05, width: 0.01, height: 0.9 } }
    const moved = applyPartEdits(thin, dragSeam(seamsOf('choseong-jungseong-vertical', thin)[0], thin, {}, 0.05).edits)
    expect(moved.JU!.width).toBeCloseTo(0.01)
    expect(moved.JU!.x).toBeCloseTo(0.75)
  })
  it('받침 있는 가로 짜임은 보선이 둘', async () => {
    const { seamsOf } = await import('./moldLab')
    expect(seamsOf('choseong-jungseong-horizontal-jongseong', HORIZONTAL_FINAL).map((s) => [s.a, s.b])).toEqual([[['CH'], ['JU']], [['JU'], ['JO']]])
  })
  it('부위를 통째로 옮기면 다른 부위에 닿는 데서 멈춘다', async () => {
    const { moveApart } = await import('./moldLab')
    expect(moveApart(VERTICAL, 'CH', 0.3, 0).du).toBeCloseTo(0.1)
    expect(moveApart(VERTICAL, 'CH', -0.3, 0).du).toBeCloseTo(-0.08)
    const down = moveApart(HORIZONTAL_FINAL, 'CH', 0, 0.2)
    expect(down.dv).toBeCloseTo(0.03)
  })
})

describe('도트판 인상 잡기', () => {
  it('칸 10은 폰트 가운데, 끝은 가장 멀리 간 목표 폰트, 노토는 따로 표시', async () => {
    const { dotToLook, lookToDot, dotsOf, notoDot, contrastOfRatio, FRAME_KEYS, INK_KEYS, LOOK_WALL } = await import('./moldLab')
    expect(FRAME_KEYS[FRAME_KEYS.length - 1]).toBe('center')
    expect(FRAME_KEYS).not.toContain('height')
    expect(dotToLook('size', 10)).toBeCloseTo(1.02)
    expect(dotToLook('size', 20)).toBeCloseTo(1.105)
    expect(dotToLook('weight', 20)).toBe(LOOK_WALL.weight[1])
    expect(dotToLook('center', 10)).toBe(0)
    // 노토는 크기 · 비율에서 가운데보다 조금 아래, 획 대비는 1.0이라 가운데(0.83)보다 아래
    expect(notoDot('size')).toBe(9)
    expect(notoDot('contrast')).toBe(7)
    // 자소 사이 여유: 엔진(0.78)은 폰트 여섯보다 촘촘해 칸 0(촘촘 끝)에 선다.
    expect(dotsOf({}, FRAME_KEYS)).toEqual([9, 12, 0, 20, 10])
    // 크기 · 여유는 판에서 뺐다(하니무스 2026-11-27).
    expect(FRAME_KEYS).not.toContain('size')
    expect(FRAME_KEYS).not.toContain('ease')
    // 대비를 안 만지면 굵기 1의 폰트 패턴(가로 ÷ 세로 0.88, `contrastPatternOf`)이라 가운데(0.83) 바로 아래 칸 9.
    expect(dotsOf({}, INK_KEYS)).toEqual([9, 9, 0, 0])
    // 획 대비 눈금은 가로 ÷ 세로 굵기: 1이면 엔진 0, 1을 넘으면(가로가 더 굵음) 음수
    expect(contrastOfRatio(1)).toBe(0)
    expect(contrastOfRatio(1.46)).toBeLessThan(0)
    for (let k = 0; k <= 20; k++) expect(lookToDot('jamo', dotToLook('jamo', k))).toBe(k)
  })
  it('닿자 크기는 제 칸 가운데를 붙든 채 가로세로 같이 커진다', async () => {
    const { impressBoxes } = await import('./moldLab')
    const out = impressBoxes(VERTICAL, { jamo: 1.2 })
    expect(out.CH!.width).toBeCloseTo(0.48)
    expect(out.CH!.height).toBeCloseTo(0.72)
    expect(out.CH!.x + out.CH!.width / 2).toBeCloseTo(0.3)
    expect(out.CH!.y + out.CH!.height / 2).toBeCloseTo(0.5)
    expect(out.JU).toEqual(VERTICAL.JU)
  })
  it('밀림 공식: 첫닿자가 커지면 안쪽 3/4 · 바깥 1/4, 홀자는 0.1만 밀린다 · 받침이 커지면 첫닿자 밑이 0.665배 따라 오른다', async () => {
    const { impressBoxes } = await import('./moldLab')
    const v = impressBoxes(VERTICAL, { jamo: 1.2 }, 'choseong-jungseong-vertical')
    // 늘어난 폭 0.08: 왼쪽으로 0.02, 오른쪽으로 0.06
    expect(v.CH!.x).toBeCloseTo(0.08)
    expect(v.CH!.x + v.CH!.width).toBeCloseTo(0.56)
    expect(v.JU!.x).toBeCloseTo(0.608)
    expect(v.JU!.x + v.JU!.width).toBeCloseTo(0.9)
    const h = impressBoxes(HORIZONTAL_FINAL, { jamo: 1.2 }, 'choseong-jungseong-horizontal-jongseong')
    // 받침 키 0.35 → 늘어난 0.07의 3/4(0.0525)만큼 윗변이 오르고, 첫닿자 밑은 0.665배
    expect(h.JO!.y).toBeCloseTo(0.6 - 0.0525)
    expect(h.JO!.y + h.JO!.height).toBeCloseTo(0.95 + 0.0175)
    expect(h.CH!.y).toBeCloseTo(0.05 - 0.015)
  })
  it('무게중심(허리선): 틀은 두고 첫닿자 밑변과 보가 오른다 · 받침 글자는 폭이 좁다', async () => {
    const { impressBoxes, waistSyllable } = await import('./moldLab')
    // 받침 글자: 위로 끝까지 글자 키(0.9)의 15.5%(폰트 첫닿자밑받침 5번째 백분위 0.451까지, 다람쥐 재검수 4번)
    const out = impressBoxes(HORIZONTAL_FINAL, { center: 1 }, 'choseong-jungseong-horizontal-jongseong')
    expect(out.CH!.y).toBeCloseTo(0.05)
    expect(out.CH!.height).toBeCloseTo(0.3 - 0.155 * 0.9)
    expect(out.JU!.y).toBeCloseTo(0.38 - 0.155 * 0.9)
    expect(out.JO).toEqual(HORIZONTAL_FINAL.JO)
    // 아래로는 받침 윗변까지(틈 0.05 남김) 간 뒤 받침 윗변을 같이 눌러 받침을 줄인다. 밑변은 그대로.
    const down = impressBoxes(HORIZONTAL_FINAL, { center: -1 }, 'choseong-jungseong-horizontal-jongseong')
    const pushBy = 0.066 * 0.9 - (0.6 - 0.53 - 0.05)
    expect(down.JO!.y).toBeCloseTo(0.6 + pushBy)
    expect(down.JO!.y + down.JO!.height).toBeCloseTo(0.95)
    // 받침 없음: 위로 12%, 아래로 23%. 홀자 칸은 그대로.
    const v = impressBoxes(VERTICAL, { center: 1 }, 'choseong-jungseong-vertical')
    expect(v.JU).toEqual(VERTICAL.JU)
    expect(v.CH!.height).toBeCloseTo(0.492)
    expect(impressBoxes(VERTICAL, { center: -1 }, 'choseong-jungseong-vertical').CH!.height).toBeCloseTo(0.807)
    const stem = { id: 's', closed: false, thickness: 0.08, points: [{ x: 0.3, y: 0 }, { x: 0.3, y: 1 }] }
    const branch = { id: 'b', closed: false, thickness: 0.08, points: [{ x: 0.3, y: 0.5 }, { x: 0.8, y: 0.5 }] }
    const syllable = { char: '가', choseong: null, jongseong: null, layoutType: 'choseong-jungseong-vertical' as const, jungseong: { char: 'ㅏ', type: 'jungseong' as const, strokes: [stem, branch] } }
    const moved = waistSyllable(syllable, 0.09, VERTICAL)
    expect(moved.jungseong!.strokes![0]).toEqual(stem)
    expect(moved.jungseong!.strokes![1].points[0].y).toBeCloseTo(0.4)
  })
})

describe('풍선 닿자', () => {
  it('막힌 변만 멈추고 나머지 변 · 두께는 끝까지 부푼다', async () => {
    const { growSides } = await import('./moldLab')
    // 첫닿자 오른변이 홀자(0.6)에서 0.05 안쪽이면 막힘
    const ok = (b: Record<string, { x: number; width: number } | undefined>) => b.JU!.x - (b.CH!.x + b.CH!.width) >= 0.05 - 1e-9
    // 획 b가 1.3배를 넘으면 막힘(그 획만 멈춘다)
    const out = growSides(VERTICAL, 1.2, { CH: ['a', 'b'] }, (b, thick) => ok(b) && (thick['CH:b'] ?? 1) <= 1.3 + 1e-9)
    expect(out.boxes.CH!.x + out.boxes.CH!.width).toBeLessThanOrEqual(0.55 + 1e-9)
    expect(out.boxes.CH!.x).toBeCloseTo(0.06)
    expect(out.boxes.CH!.height).toBeCloseTo(0.72)
    expect(out.thick['CH:a']).toBeCloseTo(1.5)
    expect(out.thick['CH:b']).toBeLessThanOrEqual(1.3 + 1e-9)
    expect(out.boxes.JU).toEqual(VERTICAL.JU)
  })
  it('풍선 닿자는 첫닿자 · 받침 획만 두꺼워진다', async () => {
    const { inflateSyllable } = await import('./moldLab')
    const st = (t: number) => ({ id: 'a', closed: false, thickness: t, points: [{ x: 0, y: 0 }, { x: 1, y: 0 }] })
    const syl = { char: '한', layoutType: 'choseong-jungseong-vertical-jongseong' as const, choseong: { char: 'ㅎ', type: 'choseong' as const, strokes: [st(10)] }, jungseong: { char: 'ㅏ', type: 'jungseong' as const, strokes: [st(10)] }, jongseong: { char: 'ㄴ', type: 'jongseong' as const, strokes: [st(10)] } }
    const out = inflateSyllable(syl, 1.2)
    expect(out.choseong!.strokes![0].thickness).toBeCloseTo(12)
    expect(out.jongseong!.strokes![0].thickness).toBeCloseTo(12)
    expect(out.jungseong!.strokes![0].thickness).toBe(10)
  })
})

describe('인상 · 획 다듬기 값', () => {
  const line = (id: string, a: [number, number], b: [number, number]) => ({ id, closed: false, thickness: 0.08, points: [{ x: a[0], y: a[1] }, { x: b[0], y: b[1] }] })
  const ga = { char: '가', choseong: null, jongseong: null, layoutType: 'choseong-jungseong-vertical' as const, jungseong: { char: 'ㅏ', type: 'jungseong' as const, strokes: [line('s', [0.3, 0], [0.3, 1]), line('b', [0.3, 0.5], [0.8, 0.5])] } }
  it('곁줄기 길이: 기둥에 붙은 끝은 두고 바깥 끝만', async () => {
    const { branchSyllable } = await import('./moldLab')
    const out = branchSyllable(ga, 0.4).jungseong!.strokes!
    expect(out[0]).toEqual(ga.jungseong.strokes[0])
    expect(out[1].points[0].x).toBeCloseTo(0.3)
    expect(out[1].points[1].x).toBeCloseTo(0.5)
  })
  it('곁줄기 길이는 가로홀자 짧은기둥을 안 건드리고, 바닥은 기둥 밖으로 두께 0.754배 (다람쥐 재검수 5번)', async () => {
    const { branchSyllable } = await import('./moldLab')
    const gu = { ...ga, char: '구', layoutType: 'choseong-jungseong-horizontal' as const, jungseong: { char: 'ㅜ', type: 'jungseong' as const, strokes: [line('b', [0, 0.2], [1, 0.2]), line('s', [0.5, 0.2], [0.5, 1])] } }
    expect(branchSyllable(gu, 0.3)).toBe(gu)
    const boxes = { JU: box(0.6, 0.05, 0.3, 0.9) }
    const out = branchSyllable(ga, 0.3, { boxes, ink: 1, linecap: 'butt' }).jungseong!.strokes!
    const len = (out[1].points[1].x - out[1].points[0].x) * 0.3
    expect(len - 0.08 / 2).toBeCloseTo(0.754 * 0.08, 6)
  })
  it('부리는 획을 덧대고, 붓촉은 엔진 납작 붓을 고른다', async () => {
    const { serifSyllable, nibBrush, dotToLook } = await import('./moldLab')
    expect(serifSyllable(ga, 1, VERTICAL).jungseong!.strokes!.length).toBe(4)
    expect(serifSyllable(ga, 0, VERTICAL)).toBe(ga)
    expect(nibBrush(0)).toBeNull()
    expect(nibBrush(dotToLook('nib', 20))).toMatchObject({ tip: 'ellipse', aspectRatio: 0.25 })
    expect(nibBrush(dotToLook('nib', 10))!.aspectRatio).toBeCloseTo(0.625)
  })
  it('윗선 들쭉날쭉: 밑변은 그대로, 같은 글자는 늘 같고 칸을 안 넘는다', async () => {
    const { jagBoxes } = await import('./moldLab')
    expect(jagBoxes(VERTICAL, 0.027, '가')).toBe(VERTICAL)
    const tops = ['가', '나', '다', '라', '마', '바'].map((char) => {
      const out = jagBoxes(VERTICAL, 0.09, char)
      expect(out.JU!.y + out.JU!.height).toBeCloseTo(0.95)
      expect(jagBoxes(VERTICAL, 0.09, char)).toEqual(out)
      return out.JU!.y
    })
    expect(Math.min(...tops)).toBeGreaterThanOrEqual(0)
    expect(new Set(tops.map((y) => y.toFixed(3))).size).toBeGreaterThan(1)
  })
  it('탈네모: 받침 없는 글자만 윗변을 두고 짧아진다 · 넘치면 비율 두고 줄여 넣는다', async () => {
    const { lookBoxes, lookScale, openFactorOf, OPEN_END, LOOK_WALL } = await import('./moldLab')
    const short = lookBoxes(VERTICAL, { open: 0.6 }, 'choseong-jungseong-vertical')
    expect(short.JU!.y).toBeCloseTo(0.05)
    expect(short.JU!.height).toBeCloseTo(0.9 * openFactorOf(0.6, 'choseong-jungseong-vertical'))
    // 탈네모 끝 = 받침 글자 윗덩이 키(짜임마다)
    expect(openFactorOf(LOOK_WALL.open[0], 'choseong-jungseong-vertical')).toBeCloseTo(OPEN_END.right)
    expect(openFactorOf(LOOK_WALL.open[0], 'choseong-jungseong-mixed')).toBeCloseTo(OPEN_END.mixed)
    expect(lookBoxes(VERTICAL, { open: LOOK_WALL.open[0] }, 'choseong-jungseong-vertical').JU!.height).toBeCloseTo(0.9 * OPEN_END.right)
    expect(lookBoxes(HORIZONTAL_FINAL, { open: 0.6 }, 'choseong-jungseong-horizontal-jongseong')).toEqual(HORIZONTAL_FINAL)
    const { sx, sy } = lookScale(VERTICAL, { frame: 1.24, size: 1.105 })
    expect(sx).toBeLessThan(1.24 * 1.105)
    expect(sx / sy).toBeCloseTo(1.24)
  })
})

describe('밀림 2차(거북이): 기둥 밀림 · 바닥 멈춤 · 안쪽 굵기', () => {
  it('기둥 밀림은 닿자가 작으면 1, 크면 0.04', async () => {
    const { pillarPush } = await import('./moldLab')
    expect(pillarPush(0.55)).toBe(1)
    expect(pillarPush(1)).toBeCloseTo(0.107, 2)
    expect(pillarPush(1.37)).toBeCloseTo(0.04)
    expect(pillarPush(0.7)).toBeGreaterThan(pillarPush(0.9))
  })
  it('닿자가 자라면 기둥도 같이 밀리고, 틈 검사에 걸린 변은 멈춘다', async () => {
    const { growSides } = await import('./moldLab')
    const free = growSides(VERTICAL, 1.2, {}, () => true, 8, 'choseong-jungseong-vertical')
    expect(free.boxes.JU!.x).toBeGreaterThan(VERTICAL.JU!.x)
    const stop = growSides(VERTICAL, 1.2, {}, (b) => b.CH!.x + b.CH!.width <= VERTICAL.CH!.x + VERTICAL.CH!.width + 1e-9, 8, 'choseong-jungseong-vertical')
    expect(stop.boxes.JU!.x).toBeCloseTo(VERTICAL.JU!.x)
  })
  it('굵기는 안쪽으로: 굵을수록 칸이 줄어 잉크 바깥 끝을 지킨다', async () => {
    const { lookScale, thicknessOf } = await import('./moldLab')
    expect(thicknessOf(1)).toBe(1)
    const thin = lookScale(VERTICAL, {}), bold = lookScale(VERTICAL, { weight: 2.25 })
    expect(bold.sx).toBeLessThan(thin.sx)
    expect(bold.sy).toBeLessThan(thin.sy)
  })
})

describe('저장소에 써 넣기', () => {
  it('획 판 값은 붓 스타일로: 납작 붓이면 타원 붓촉, 아니면 둥글기 · 대비', async () => {
    const { moldInk } = await import('./moldLab')
    const style = { brush: { tip: 'round' as const, aspectRatio: 1, angle: 0 }, strokeStyle: { mode: 'brush' as const, brush: { tip: 'round' as const, aspectRatio: 1, angle: 0 } } }
    // 대비를 안 만졌어도 굵기 패턴 대비가 들어간다(하니무스 2026-11-24 "기본 대비를 폰트 패턴으로").
    const { contrastOfRatio, contrastPatternOf } = await import('./moldLab')
    expect(moldInk(style, {}).strokeStyle).toMatchObject({ contrast: contrastOfRatio(contrastPatternOf(1)) })
    expect(moldInk(style, { contrast: 0 })).toBe(style)
    const flat = moldInk(style, { nib: 1, round: 0.5 })
    expect(flat.brush.tip).toBe('ellipse')
    expect(flat.strokeStyle).toMatchObject({ brush: { tip: 'ellipse' } })
    expect(flat.strokeStyle).not.toHaveProperty('roundness')
    expect(moldInk(style, { round: 0.5, contrast: 0.2 }).strokeStyle).toMatchObject({ roundness: 0.5, innerRoundness: 1, contrast: 0.2 })
  })

  it('납작 붓은 기둥 두께를 굵기 값 그대로 지킨다(타원 긴 축 = 지름이라 그냥 두면 가늘어짐)', async () => {
    const { moldInk, nibBrush, nibStemFactor, thicknessOf } = await import('./moldLab')
    const brush = nibBrush(0.7)!
    expect(nibStemFactor(brush)).toBeCloseTo(0.863, 2)
    const style = { weight: 400, brush: { tip: 'round' as const, aspectRatio: 1, angle: 0 }, strokeStyle: { mode: 'brush' as const, brush: { tip: 'round' as const, aspectRatio: 1, angle: 0 } } }
    const flat = moldInk(style, { nib: 0.7 })
    expect(thicknessOf(flat.weight / 400) * nibStemFactor(brush)).toBeCloseTo(1, 2)
  })
})

describe('획 다듬기 줄기(C)', () => {
  const o = (gidung: StrokeDataV2['points'], bo?: StrokeDataV2['points']) => ({ char: 'ㅏ', type: 'jungseong', strokes: [{ id: 'ㅏ-1', points: gidung, closed: false, thickness: 0.07 }, { id: 'ㅏ-2', points: bo ?? [{ x: 0, y: 0.5 }, { x: 1, y: 0.5 }], closed: false, thickness: 0.07 }] }) as unknown as JamoData
  const syl = (ju: JamoData) => ({ char: '아', choseong: null, jongseong: null, jungseong: ju, layoutType: 'choseong-jungseong-vertical' }) as unknown as DecomposedSyllable
  it('값이 없으면 그대로', () => {
    const s = syl(o([{ x: 0, y: 0 }, { x: 0, y: 1 }]))
    expect(stemSyllable(s, {})).toBe(s)
  })
  it('기둥 휨은 끝점을 두고 가운데만 옆으로 내민다', () => {
    const out = stemSyllable(syl(o([{ x: 0, y: 0 }, { x: 0, y: 1 }])), { bendGidung: 0.1 }).jungseong!.strokes![0]
    expect(out.points[0]).toMatchObject({ x: 0, y: 0 })
    expect(out.points[1]).toMatchObject({ x: 0, y: 1 })
    expect(Math.abs(out.points[0].handleOut!.x)).toBeGreaterThan(0.05)
  })
  it('곁줄기 틈은 붙은 끝을 떼되 길이는 둔다', () => {
    const before = o([{ x: 0, y: 0 }, { x: 0, y: 1 }]).strokes![1]
    const out = stemSyllable(syl(o([{ x: 0, y: 0 }, { x: 0, y: 1 }])), { gapGyeot: 0.05 }).jungseong!.strokes![1]
    expect(out.points[0].x).toBeGreaterThan(before.points[0].x + 0.01)
    expect(out.points[1].x - out.points[0].x).toBeCloseTo(before.points[1].x - before.points[0].x, 3)
  })
  it('bendMaster: 두 점이면 손잡이를 4/3배로 달아 가운데가 그만큼 나간다', () => {
    const m = bendMaster({ name: 'gidung', points: [{ t: 0, o: 0 }, { t: 1, o: 0 }] }, 0.03)
    expect(m.points[0].handleOut!.o).toBeCloseTo(0.04, 6)
  })
})

describe('다람쥐 PR A 고치기', () => {
  it('곁줄기 길이는 기둥과 나란한 둘째 기둥(ㅐ)을 늘이지 않는다', () => {
    const ju = { char: 'ㅐ', type: 'jungseong', strokes: [
      { id: 'a', points: [{ x: 0.2, y: 0 }, { x: 0.2, y: 1 }], closed: false, thickness: 0.07 },
      { id: 'b', points: [{ x: 0.2, y: 0.5 }, { x: 0.6, y: 0.5 }], closed: false, thickness: 0.07 },
      { id: 'c', points: [{ x: 0.6, y: 0.05 }, { x: 0.6, y: 0.95 }], closed: false, thickness: 0.07 },
    ] } as unknown as JamoData
    const out = branchSyllable({ char: '애', choseong: null, jongseong: null, jungseong: ju, layoutType: 'choseong-jungseong-vertical' } as unknown as DecomposedSyllable, 1.6).jungseong!.strokes!
    expect(out[2].points).toEqual(ju.strokes![2].points)
    // 두 기둥을 잇는 가로획은 이음줄기라 그대로(다람쥐 재검수 5번 「왜」).
    expect(out[1].points).toEqual(ju.strokes![1].points)
  })
  it('윗선 들쭉날쭉은 끝(0.09)까지 첫닿자 무늬 하나로, 난수 없이 (다람쥐 재검수 6번)', async () => {
    const { JAG_PATTERN } = await import('./moldLab')
    // 위로 넉넉한 칸(꼭지가 글자 칸 위 끝에 안 걸리게).
    const ROOMY = { CH: box(0.1, 0.3, 0.4, 0.4), JU: box(0.6, 0.25, 0.3, 0.7) }
    const span = 0.7
    for (const jag of [0.05, 0.09]) {
      const k = (jag - 0.027) / 0.023
      for (const c of JAG_INITIALS) {
        const top = Math.min(...Object.values(jagBoxes(ROOMY, jag, c)).map((b) => b!.y))
        expect((top - 0.25) / span).toBeCloseTo(JAG_PATTERN[c] * k, 6)
      }
    }
  })
})

describe('획 판은 저장된 값을 그대로 읽는다', () => {
  it('써 넣은 굵기 · 둥글기 · 대비 · 붓촉을 다시 읽으면 같은 칸', async () => {
    const { DEFAULT_STYLE } = await import('../src/stores/globalStyleStore')
    const { inkLookOf, moldBaseStyle, moldInk, scaledWeight, MOLD_BASE_WEIGHT, dotsOf, INK_KEYS } = await import('./moldLab')
    for (const look of [{ weight: 0.9, round: 0.4 }, { weight: 1.6, contrast: 0.3 }, { nib: 0.5 }, { weight: 1.3, nib: 0.7 }]) {
      const baked = moldInk({ ...moldBaseStyle(DEFAULT_STYLE), weight: scaledWeight(MOLD_BASE_WEIGHT, look.weight ?? 1) }, look)
      expect(dotsOf(inkLookOf(baked), INK_KEYS)).toEqual(dotsOf(look, INK_KEYS))
      // 바탕은 저장 값을 뺀 것이라, 다시 얹어도 두 번 얹히지 않는다.
      expect(moldBaseStyle(baked).weight).toBe(MOLD_BASE_WEIGHT)
    }
  })
})

describe('대비 기본값 = 폰트 패턴', () => {
  it('가로 ÷ 세로는 굵을수록 작아진다: 굵기 1 ≈ 0.88, 900 고딕 기둥 ÷ 키에서 0.8 바닥', async () => {
    const { contrastPatternOf, CONTRAST_PATTERN_RANGE, lookOf, patternWeightRatio, thicknessOf, contrastOfRatio } = await import('./moldLab')
    expect(contrastPatternOf(1)).toBeCloseTo(0.94 - 0.77 * 0.07 / 0.9033, 6)
    expect(contrastPatternOf(0.5)).toBeGreaterThan(contrastPatternOf(1))
    expect(CONTRAST_PATTERN_RANGE[0]).toBeCloseTo(contrastPatternOf(1), 9)
    expect(CONTRAST_PATTERN_RANGE[1]).toBeCloseTo(0.94 - 0.77 * 0.173, 6)
    // 기둥 두께는 그대로: 덜어 준 굵기 × 대비의 세로 몫 = 처음 두께.
    const c = contrastOfRatio(contrastPatternOf(1))
    expect(thicknessOf(patternWeightRatio(1, c)) * (1 + 0.8 * c)).toBeCloseTo(1, 3)
    // 사용자가 정한 대비는 그대로(판 값은 절댓값).
    expect(lookOf({ contrast: 0 }, 'contrast')).toBe(0)
    expect(lookOf({ weight: 0.5 }, 'contrast')).toBeLessThan(lookOf({ weight: 1 }, 'contrast'))
  })
})
