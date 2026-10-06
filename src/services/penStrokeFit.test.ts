import { describe, expect, it } from 'vitest'
import { fitPenStroke, PEN_FIT_EPSILON_CANDIDATES, penClosesOnItself, smoothPenPoints, penCornerIndices, penFitDeviation, thinPenPoints } from './penStrokeFit'
import type { PenPoint } from './penStrokeFit'

/** 시드 고정 난수 — 펜 떨림 흉내. 같은 시드면 같은 점. */
function jitter(seed: number, amount: number) {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return (state / 4294967296 - 0.5) * 2 * amount
  }
}

/** a → b를 n점으로, 떨림 `wobble`. */
function line(a: PenPoint, b: PenPoint, n: number, wobble = 0, seed = 1): PenPoint[] {
  const noise = jitter(seed, wobble)
  return Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1)
    return { x: a.x + (b.x - a.x) * t + noise(), y: a.y + (b.y - a.y) * t + noise() }
  })
}

/** 중심 c, 반지름 r, 각도 from→to(도)의 호를 n점으로. */
function arc(c: PenPoint, r: number, from: number, to: number, n: number, wobble = 0, seed = 2): PenPoint[] {
  const noise = jitter(seed, wobble)
  return Array.from({ length: n }, (_, i) => {
    const angle = ((from + (to - from) * (i / (n - 1))) * Math.PI) / 180
    return { x: c.x + r * Math.cos(angle) + noise(), y: c.y + r * Math.sin(angle) + noise() }
  })
}

const EPS = 0.01

describe('펜 획 맞춤', () => {
  it('가까운 점은 합치고 끝점은 남긴다', () => {
    const points = [{ x: .1, y: .5 }, { x: .101, y: .5 }, { x: .102, y: .5 }, { x: .5, y: .5 }, { x: .9, y: .5 }, { x: .9005, y: .5 }]
    const thinned = thinPenPoints(points, .004)
    expect(thinned[0]).toEqual({ x: .1, y: .5 })
    expect(thinned[thinned.length - 1]).toEqual({ x: .9005, y: .5 })
    expect(thinned).toHaveLength(3)
  })

  it('떨리는 가로선은 앵커 둘짜리 직선이 된다', () => {
    const result = fitPenStroke(line({ x: .1, y: .5 }, { x: .9, y: .52 }, 60, .003))!
    expect(result.anchorCount).toBe(2)
    expect(result.stroke.points.every((point) => !point.handleIn && !point.handleOut)).toBe(true)
    expect(result.corners).toEqual([])
    expect(result.maxDeviation).toBeLessThanOrEqual(EPS)
  })

  it('ㄱ처럼 꺾은 선은 꺾임점 하나에 앵커 셋', () => {
    const points = [...line({ x: .2, y: .2 }, { x: .8, y: .2 }, 40, .002, 3), ...line({ x: .8, y: .2 }, { x: .8, y: .85 }, 40, .002, 4).slice(1)]
    expect(penCornerIndices(thinPenPoints(points))).toHaveLength(1)
    const result = fitPenStroke(points)!
    expect(result.anchorCount).toBe(3)
    const corner = result.stroke.points[1]
    expect(corner.x).toBeCloseTo(.8, 1)
    expect(corner.y).toBeCloseTo(.2, 1)
    expect(result.maxDeviation).toBeLessThanOrEqual(EPS)
  })

  it('호는 꺾임 없이 곡선 앵커 몇 개로 맞는다', () => {
    const result = fitPenStroke(arc({ x: .5, y: .5 }, .35, 180, 360, 80, .002))!
    expect(result.corners).toEqual([])
    expect(result.anchorCount).toBeLessThanOrEqual(5)
    expect(result.stroke.points[0].handleOut).toBeDefined()
    expect(result.maxDeviation).toBeLessThanOrEqual(EPS)
  })

  // 앵커 수는 쪼개는 자리가 ε마다 달라 ε에 단조롭지 않다(Schneider 방식의 성질). 여기선 성질만 본다: 모든 ε에서 이탈 ≤ ε, 꺾임 없음.
  it('S자 곡선은 어느 허용오차에서도 그 안에서 맞고 꺾임으로 잡히지 않는다', () => {
    const points = [...arc({ x: .5, y: .3 }, .18, 270, 90, 60, .0015, 5), ...arc({ x: .5, y: .66 }, .18, 270, 450, 60, .0015, 6).slice(1)]
    for (const epsilon of PEN_FIT_EPSILON_CANDIDATES) {
      const result = fitPenStroke(points, { epsilon })!
      expect(result.maxDeviation).toBeLessThanOrEqual(epsilon)
      expect(result.corners).toEqual([])
      expect(result.anchorCount).toBeGreaterThanOrEqual(3)
    }
  })

  it('촘촘한 직선의 시작 떨림을 꺾임으로 잡지 않는다', () => {
    for (let seed = 11; seed < 31; seed++) {
      const result = fitPenStroke(line({ x: .1, y: .5 }, { x: .9, y: .5 }, 400, .002, seed))!
      expect(result.corners, `seed ${seed}`).toEqual([])
      expect(result.anchorCount, `seed ${seed}`).toBe(2)
    }
  })

  it('짧은 점 하나 · 톡 찍기는 획이 안 된다', () => {
    expect(fitPenStroke([])).toBeNull()
    expect(fitPenStroke([{ x: .5, y: .5 }])).toBeNull()
    expect(fitPenStroke([{ x: .5, y: .5 }, { x: .501, y: .5 }])).not.toBeNull()
  })

  // 앵커는 그은 점 위라 상자 안이다. 핸들(제어점)은 곡선 바깥으로 나가도 되므로 유한한지만 본다.
  it('맞춘 획의 앵커는 0–1 안, 핸들은 유한하고, 닫히지 않는다', () => {
    const result = fitPenStroke(arc({ x: .5, y: .5 }, .4, 0, 300, 120, .002, 7))!
    expect(result.stroke.closed).toBe(false)
    for (const point of result.stroke.points) {
      expect(point.x).toBeGreaterThanOrEqual(0)
      expect(point.x).toBeLessThanOrEqual(1)
      expect(point.y).toBeGreaterThanOrEqual(0)
      expect(point.y).toBeLessThanOrEqual(1)
      for (const handle of [point.handleIn, point.handleOut]) {
        if (!handle) continue
        expect(Number.isFinite(handle.x) && Number.isFinite(handle.y)).toBe(true)
      }
    }
  })

  it('이탈 거리는 맞춘 선에서 떨어진 만큼이다', () => {
    const stroke = { points: [{ x: 0, y: .5 }, { x: 1, y: .5 }] }
    expect(penFitDeviation([{ x: .5, y: .5 }, { x: .3, y: .53 }], stroke)).toBeCloseTo(.03, 6)
  })

  it('손떨림 거르기: 떨리는 가로가 곧아지고, 끝점과 ㄱ의 꺾임은 그대로다', () => {
    // 떨림(진폭 0.008)이 ε0.01 근처라 거르지 않으면 곡선 마디가 여럿 생긴다.
    const wobbly = line({ x: .1, y: .5 }, { x: .9, y: .5 }, 120, .008, 7)
    const off = fitPenStroke(wobbly, { smoothing: 0 })!
    const on = fitPenStroke(wobbly)!
    expect(on.anchorCount).toBeLessThanOrEqual(off.anchorCount)
    const offY = Math.max(...off.stroke.points.map((point) => Math.abs(point.y - .5)))
    const onY = Math.max(...on.stroke.points.map((point) => Math.abs(point.y - .5)))
    expect(onY).toBeLessThan(offY)
    // 끝은 길이를 지키고(가로 자리 그대로), 떨린 만큼만 몸통 선 위로 옮긴다.
    expect(on.stroke.points[0].x).toBeCloseTo(wobbly[0].x, 2)
    expect(on.stroke.points.at(-1)!.x).toBeCloseTo(wobbly.at(-1)!.x, 2)
    expect(Math.abs(on.stroke.points.at(-1)!.y - .5)).toBeLessThanOrEqual(Math.abs(wobbly.at(-1)!.y - .5) + 1e-9)
    const ㄱ = [...line({ x: .1, y: .1 }, { x: .9, y: .1 }, 60, .004, 3), ...line({ x: .9, y: .1 }, { x: .9, y: .9 }, 60, .004, 4).slice(1)]
    const fitted = fitPenStroke(ㄱ)!
    expect(fitted.corners).toHaveLength(1)
    expect(fitted.stroke.points.some((point) => Math.abs(point.x - .9) < .01 && Math.abs(point.y - .1) < .01)).toBe(true)
    // 창이 0이면 그대로 돌려준다.
    expect(smoothPenPoints(wobbly, 0)).toEqual(wobbly)
  })

  it('펜을 뗄 때 생긴 끝 갈고리는 잘라 끝이 옆으로 꺾이지 않는다', () => {
    const straight = line({ x: .1, y: .3 }, { x: .85, y: .3 }, 80)
    const hooked = [...straight, { x: .855, y: .305 }, { x: .858, y: .312 }, { x: .859, y: .32 }]
    // 시작 갈고리는 꺾임으로 안 잡힐 만큼 짧고 완만해도 자른다.
    const start = [{ x: .08, y: .27 }, { x: .09, y: .29 }, ...straight]
    for (const points of [hooked, start]) {
      const fitted = fitPenStroke(points)!
      expect(fitted.corners).toEqual([])
      expect(fitted.anchorCount).toBe(2)
      // 자른 자리는 몸통 선에서 0.006 미만까지만 남는다.
      for (const point of fitted.stroke.points) expect(Math.abs(point.y - .3)).toBeLessThan(.006)
    }
  })

  it('펜을 대고 머뭇거린 시작도 접히지 않는다 — 첫 앵커가 그 자리고 획은 한 방향으로만 간다', () => {
    // 한자리에서 떨다가(머뭇거림) 오른쪽으로 긋는다. 떨림이 호 길이를 다 써도 끝점이 안쪽으로 접히면 안 된다.
    const dwell = [{ x: .18, y: .25 }, { x: .182, y: .255 }, { x: .176, y: .258 }, { x: .179, y: .253 }, { x: .184, y: .252 }, { x: .178, y: .249 }, { x: .183, y: .256 }]
    const fit = fitPenStroke([...dwell, ...line({ x: .2, y: .252 }, { x: .8, y: .26 }, 60, 0.003, 5)], { thickness: .07 })!
    const xs = fit.stroke.points.map((point) => point.x)
    expect(xs[0]).toBeLessThan(.2)
    for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeGreaterThan(xs[i - 1])
  })

  it('일부러 그은 짧은 꼬리(ㅈ 끝)는 잉크 띠 밖으로 나가므로 갈고리로 안 자른다 — 굵기에 묶인 문턱', () => {
    // 사선 몸통 뒤에 왼쪽으로 빠지는 짧은 꼬리(곧은 거리 0.054, 몸통 선에서 0.05쯤 벗어남). 굵기 0.07의 반 0.035보다 멀다.
    const body = line({ x: .5, y: .05 }, { x: .1, y: .9 }, 120)
    const tail = Array.from({ length: 16 }, (_, i) => { const t = (i + 1) / 16; return { x: .1 - .05 * t, y: .9 + .08 * t - .1 * t * t } })
    const fit = fitPenStroke([...body, ...tail], { thickness: .07 })!
    const last = fit.stroke.points[fit.stroke.points.length - 1]
    expect(last.x).toBeLessThan(.07)
    expect(fit.anchorCount).toBeGreaterThanOrEqual(3)
    // 같은 꼬리도 굵기가 두 배면 잉크 띠 안이라 갈고리로 잘린다.
    const thick = fitPenStroke([...body, ...tail], { thickness: .14 })!
    expect(thick.stroke.points[thick.stroke.points.length - 1].x).toBeGreaterThan(.085)
  })

  it('머리핀 꺾임(안쪽 20°)을 둥글려도 고리가 생기지 않는다 — 호 핸들은 각도에 맞춘다', () => {
    // 내려오다 160° 꺾어 되올라가는 획. 끝이 둥근 글씨(roundAcute)에서 꺾임을 둥글린다.
    const down = line({ x: .5, y: .1 }, { x: .15, y: .45 }, 80)
    const up = line({ x: .15, y: .45 }, { x: .5, y: .3 }, 80).slice(1)
    const fit = fitPenStroke([...down, ...up], { thickness: .07, roundAcute: true })!
    // 둥글린 호의 두 앵커 사이 핸들이 서로를 넘지 않는다(넘으면 고리). 호는 굵기 반 안쪽에 머문다.
    const pts = fit.stroke.points
    const i = pts.findIndex((p, k) => k > 0 && p.handleOut && pts[k + 1]?.handleIn && !pts[k + 1].handleOut)
    expect(fit.maxDeviation).toBeLessThan(.05)
    expect(i).toBeGreaterThan(0)
    const a = pts[i], b = pts[i + 1]
    const chord = Math.hypot(b.x - a.x, b.y - a.y)
    expect(Math.hypot(a.handleOut!.x - a.x, a.handleOut!.y - a.y)).toBeLessThan(chord)
    expect(Math.hypot(b.handleIn!.x - b.x, b.handleIn!.y - b.y)).toBeLessThan(chord)
  })

  it('시작에서 옆으로 나갔다 돌아온 갈고리도 잘라 낸다', () => {
    // 아래로 삐쳤다가 제자리로 돌아와 오른쪽으로 긋는다. 시작점은 몸통 선 위지만 그 사이가 벗어났다.
    const hook = [{ x: .18, y: .25 }, { x: .172, y: .27 }, { x: .165, y: .29 }, { x: .172, y: .268 }, { x: .182, y: .251 }]
    const fit = fitPenStroke([...hook, ...line({ x: .19, y: .25 }, { x: .8, y: .25 }, 60)], { thickness: .07 })!
    for (const point of fit.stroke.points) expect(Math.abs(point.y - .25)).toBeLessThan(.012)
    expect(fit.stroke.points[0].x).toBeLessThan(.25)
  })

  it('닫으려던 획: 덜 닫힌 동그라미는 맞고, 갈지자로 꺾다 고리를 지은 한 획(흘려 쓴 ㅎ)은 아니다', () => {
    expect(penClosesOnItself(arc({ x: .5, y: .5 }, .4, -90, 220, 120, 0.004))).toBe(true)
    // 오른쪽으로 긋고 → 왼쪽 아래로 꺾고 → 오른쪽으로 다시 꺾어 고리를 짓는다. 끝이 시작 가까이 오지만 한쪽으로만 돌지 않는다.
    const cursive = [
      ...line({ x: .3, y: .2 }, { x: .7, y: .2 }, 30, 0.003, 3),
      ...line({ x: .7, y: .22 }, { x: .3, y: .45 }, 30, 0.003, 4),
      ...line({ x: .32, y: .46 }, { x: .6, y: .5 }, 20, 0.003, 5),
      ...arc({ x: .5, y: .68 }, .2, -60, 250, 80, 0.003, 6),
    ]
    expect(penClosesOnItself(cursive)).toBe(false)
    // ㄱ은 틈이 제 크기만 하다
    expect(penClosesOnItself([...line({ x: .1, y: .1 }, { x: .9, y: .1 }, 40), ...line({ x: .9, y: .1 }, { x: .9, y: .9 }, 40)])).toBe(false)
  })

  it('예각 꺾임 둥글리기를 켜면 예각만 돌리고 직각(ㄱ)은 날카롭게 둔다', () => {
    // 갈지자: 오른쪽으로 긋다가 왼쪽 아래로 날카롭게 꺾는다(안쪽 각 약 30도).
    const zig = [...line({ x: .1, y: .2 }, { x: .8, y: .2 }, 40), ...line({ x: .8, y: .2 }, { x: .15, y: .5 }, 40)]
    const rounded = fitPenStroke(zig, { thickness: .07, roundAcute: true })!.stroke
    const sharp = fitPenStroke(zig, { thickness: .07 })!.stroke
    // 꺾임점(.8,.2)이 앵커에서 사라지고, 꺾임점을 향하는 핸들을 가진 앵커 둘이 생긴다.
    expect(sharp.points.some((point) => Math.hypot(point.x - .8, point.y - .2) < .01)).toBe(true)
    expect(rounded.points.some((point) => Math.hypot(point.x - .8, point.y - .2) < .01)).toBe(false)
    expect(rounded.points.length).toBe(sharp.points.length + 1)
    const handles = rounded.points.filter((point) => point.handleOut && Math.hypot(point.handleOut.x - .8, point.handleOut.y - .2) < Math.hypot(point.x - .8, point.y - .2))
    expect(handles.length).toBeGreaterThanOrEqual(1)
    // 직각 ㄱ은 그대로
    const angle = [...line({ x: .1, y: .1 }, { x: .9, y: .1 }, 40), ...line({ x: .9, y: .1 }, { x: .9, y: .9 }, 40)]
    const ㄱ = fitPenStroke(angle, { thickness: .07, roundAcute: true })!.stroke
    expect(ㄱ.points.some((point) => Math.hypot(point.x - .9, point.y - .1) < .01)).toBe(true)
  })

  it('짧은 조각의 핸들이 상자 밖으로 튀지 않는다 — 실제 펜슬 자취(10-06, 거대 획)', () => {
    const raw = [[0.6063,0.4598],[0.5981,0.4598],[0.4755,0.5201],[0.4564,0.557],[0.4401,0.604],[0.4346,0.6308],[0.4292,0.6912],[0.4292,0.7482],[0.4346,0.8018],[0.4537,0.8555],[0.4755,0.8957],[0.5054,0.9293],[0.5436,0.9527],[0.5817,0.9628],[0.6199,0.9628],[0.6662,0.9561],[0.7044,0.9427],[0.7398,0.9226],[0.7779,0.8957],[0.8052,0.8655],[0.8324,0.8354],[0.857,0.7985],[0.876,0.7582],[0.8924,0.7146],[0.906,0.6677],[0.9087,0.6274],[0.9115,0.5805],[0.906,0.5302],[0.8951,0.4899],[0.876,0.453],[0.8542,0.4262],[0.827,0.4095],[0.797,0.4027],[0.7616,0.3994],[0.7207,0.4027],[0.6826,0.4128],[0.6444,0.4262],[0.6144,0.443],[0.5872,0.4631],[0.5763,0.4765]].map(([x, y]) => ({ x, y }))
    const fit = fitPenStroke(raw, { thickness: .07 })!
    for (const point of fit.stroke.points) for (const handle of [point.handleIn, point.handleOut]) {
      if (!handle) continue
      expect(handle.x).toBeGreaterThan(-.5); expect(handle.x).toBeLessThan(1.5)
      expect(handle.y).toBeGreaterThan(-.5); expect(handle.y).toBeLessThan(1.5)
    }
  })


  it('둥근 획(ㅇ)은 조금 울퉁불퉁하게 그어도 안쪽 앵커마다 핸들이 일직선이라 모가 안 난다', () => {
    const ring = Array.from({ length: 121 }, (_, i) => {
      const t = -Math.PI / 2 + 2 * Math.PI * i / 120
      const w = 1 + .03 * Math.sin(3 * t + 1) + .02 * Math.sin(7 * t)
      return { x: .5 + .42 * Math.cos(t) * w, y: .5 + .42 * Math.sin(t) * w }
    })
    const fitted = fitPenStroke(ring)!
    expect(fitted.corners).toEqual([])
    for (const point of fitted.stroke.points.slice(1, -1)) {
      expect(point.handleIn && point.handleOut).toBeTruthy()
      const a = Math.atan2(point.y - point.handleIn!.y, point.x - point.handleIn!.x)
      const b = Math.atan2(point.handleOut!.y - point.y, point.handleOut!.x - point.x)
      expect(Math.abs(Math.sin(a - b))).toBeLessThan(1e-6)
    }
  })
})
