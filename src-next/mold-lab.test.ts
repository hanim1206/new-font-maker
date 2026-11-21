import { describe, expect, it } from 'vitest'
import { clampToWall, dragValue, groupOfPart, GROUPS, groupsOfSyllable, inSafe, moldBoxes, partAt, presetOf } from './moldLab'

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

  it('굵기선을 따르면 굵어진 만큼 기대 틈도 줄어 바닥이 낮아지되, 틈은 두께의 1/4 밑으로 안 간다', async () => {
    const { gapCapMultiplier } = await import('./moldLab')
    // 굵기선 쪽은 여유가 커서, 절대 바닥(0.2 ≥ 1.25 × 0.05m → m ≤ 3.2)이 먼저 막는다.
    expect(gapCapMultiplier(rieul(0.5), rieul(0.4), 1)).toBeCloseTo(3.2)
    // 칸을 아주 좁히면(중심 거리 0.05) 처음 굵기로도 붙는다 → 가늘게(m ≤ 0.8).
    expect(gapCapMultiplier(rieul(0.5), rieul(0.1), 1)).toBeCloseTo(0.8)
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
  it('굵기 벽은 엔진 굵기 100~900을 다 쓴다(기본 400)', async () => {
    const { LOOK_WALL, scaledWeight } = await import('./moldLab')
    expect(scaledWeight(400, LOOK_WALL.weight[0])).toBe(100)
    expect(scaledWeight(400, LOOK_WALL.weight[1])).toBe(900)
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
  it('보선은 부위가 처음의 0.7배 아래로 줄기 전에 멈춘다', async () => {
    const { seamsOf, dragSeam, applyPartEdits } = await import('./moldLab')
    const seam = seamsOf('choseong-jungseong-vertical', VERTICAL)[0]
    const out = dragSeam(seam, VERTICAL, {}, 0.5)
    expect(out.clamped).toBe(true)
    expect(applyPartEdits(VERTICAL, out.edits).JU!.width).toBeCloseTo(0.21)
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
  it('가운데(10칸)가 엔진 그대로고, 끝은 벽 값이다', async () => {
    const { dotToLook, lookToDot, dotsOf, LOOK_WALL } = await import('./moldLab')
    expect(dotToLook('weight', 10)).toBe(1)
    expect(dotToLook('weight', 0)).toBe(LOOK_WALL.weight[0])
    expect(dotToLook('weight', 20)).toBe(LOOK_WALL.weight[1])
    expect(dotToLook('jamo', 10)).toBe(1)
    expect(dotToLook('center', 10)).toBe(0)
    expect(dotToLook('round', 0)).toBe(0)
    expect(dotsOf({})).toEqual([10, 10, 10, 0, 0])
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
  it('무게중심을 올리면 첫닿자 · 홀자가 위로, 받침은 덜 간다', async () => {
    const { impressBoxes } = await import('./moldLab')
    const out = impressBoxes(HORIZONTAL_FINAL, { center: 0.05 })
    expect(out.CH!.y).toBeCloseTo(0.02)
    expect(out.JU!.y).toBeCloseTo(0.33)
    expect(out.JO!.y).toBeCloseTo(0.58)
  })
})

describe('풍선 닿자', () => {
  it('틈이 모자라면 두 자소를 반씩 밀어내고, 넉넉하면 그대로 둔다', async () => {
    const { balloonBoxes } = await import('./moldLab')
    // 칸 사이 가로 거리를 틈으로 보는 가짜 잉크
    const near = (b: Record<string, { x: number; width: number } | undefined>) => ({ 'CH-JU': { gap: b.JU!.x - (b.CH!.x + b.CH!.width), dx: 1, dy: 0 } })
    const tight = { CH: box(0.1, 0.2, 0.48, 0.6), JU: box(0.6, 0.05, 0.3, 0.9) }
    const out = balloonBoxes(tight, near, { 'CH-JU': 0.05 })
    expect(out.JU!.x - (out.CH!.x + out.CH!.width)).toBeGreaterThanOrEqual(0.05 - 1e-3)
    expect(out.CH!.width).toBeCloseTo(0.48)
    expect(balloonBoxes(VERTICAL, near, { 'CH-JU': 0.05 })).toEqual(VERTICAL)
  })
  it('밀린 자소가 글자 끝에 닿으면 넘친 쪽이 눌려 줄어든다', async () => {
    const { balloonBoxes } = await import('./moldLab')
    const near = (b: Record<string, { x: number; width: number } | undefined>) => ({ 'CH-JU': { gap: b.JU!.x - (b.CH!.x + b.CH!.width), dx: 1, dy: 0 } })
    const wide = { CH: box(0.02, 0.2, 0.6, 0.6), JU: box(0.62, 0.05, 0.36, 0.9) }
    const out = balloonBoxes(wide, near, { 'CH-JU': 0.06 }, 20)
    expect(out.JU!.x + out.JU!.width).toBeLessThanOrEqual(0.98 + 1e-6)
    expect(out.JU!.width).toBeLessThan(0.36)
    expect(out.JU!.x - (out.CH!.x + out.CH!.width)).toBeGreaterThanOrEqual(0.06 - 1e-3)
  })
})
