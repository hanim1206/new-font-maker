import { describe, expect, it } from 'vitest'
import type { PenPoint } from './penStrokeFit'
import { readSyllable } from './handwritingRead'
import type { SyllableRead } from './handwritingRead'
import {
  applyChoices, chartStats, emptyBank, fitBox, gather, layoutKeyOf, phaseOf, pickSentence, placeSyllable, planSyllable,
  SEED_SENTENCE, sentenceFor, typeOf, exampleOf, recommendSentences,
} from './handwritingBank'

/** 꼭짓점을 잇는 꺾은선을 촘촘한 점으로. 칸 0–1 좌표. */
function poly(...pts: [number, number][]): PenPoint[] {
  const out: PenPoint[] = []
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1]
    const n = Math.max(6, Math.round(Math.hypot(bx - ax, by - ay) * 120))
    for (let k = 0; k < n; k++) out.push({ x: ax + (bx - ax) * k / n, y: ay + (by - ay) * k / n })
  }
  out.push({ x: pts[pts.length - 1][0], y: pts[pts.length - 1][1] })
  return out
}
function ring(cx: number, cy: number, r: number): PenPoint[] {
  const out: PenPoint[] = []
  for (let k = 0; k <= 40; k++) { const a = -Math.PI / 2 + k / 40 * Math.PI * 2; out.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }) }
  return out
}

const GO = () => readSyllable('고', [
  poly([0.3, 0.2], [0.6, 0.2], [0.6, 0.42]), // ㄱ
  poly([0.5, 0.5], [0.5, 0.62]), // 짧은기둥
  poly([0.18, 0.64], [0.82, 0.64]), // 보
])!
const NAL = () => readSyllable('날', [
  poly([0.2, 0.15], [0.2, 0.48], [0.46, 0.48]), // ㄴ
  poly([0.62, 0.08], [0.62, 0.58]), // 기둥
  poly([0.64, 0.33], [0.78, 0.33]), // 곁줄기
  poly([0.2, 0.68], [0.5, 0.68], [0.5, 0.76]), // ㄹ 1
  poly([0.5, 0.76], [0.2, 0.76], [0.2, 0.84]), // ㄹ 2
  poly([0.2, 0.84], [0.5, 0.84]), // ㄹ 3
])!
const WOEN = () => readSyllable('왼', [
  ring(0.3, 0.24, 0.1), // ㅇ
  poly([0.14, 0.46], [0.56, 0.46]), // 보
  poly([0.35, 0.34], [0.35, 0.46]), // 짧은기둥
  poly([0.7, 0.08], [0.7, 0.6]), // 기둥
  poly([0.24, 0.7], [0.24, 0.9], [0.62, 0.9]), // ㄴ
])!

describe('손글씨 읽기 — 정답 글자로 자리 묶기', () => {
  it('고: ㄱ 하나는 첫닿자, 짧은기둥 · 보는 홀자', () => {
    const r = GO()
    expect(r.state).toBe('ok')
    expect(r.parts[0].strokes).toEqual([0])
    expect(r.parts[1].strokes.sort()).toEqual([1, 2])
    expect(r.strokes[1].role).toBe('짧은기둥')
    expect(r.strokes[2].role).toBe('보')
    expect(r.boxes.CH && r.boxes.JU).toBeTruthy()
    // 상자는 잉크 기준 0–1, ㄱ은 위쪽
    expect(r.boxes.CH!.y0).toBeCloseTo(0, 2)
    expect(r.boxes.JU!.y1).toBeCloseTo(1, 2)
    // 칸 안 잉크 자리
    expect(r.frame.x0).toBeCloseTo(0.155, 2)
    expect(r.frame.h).toBeCloseTo(0.49, 2)
  })

  it('날: 기둥 · 곁줄기를 먼저 집고, 아래 세 획은 받침', () => {
    const r = NAL()
    expect(r.state).toBe('ok')
    expect(r.parts[0].strokes).toEqual([0])
    expect(r.parts[1].strokes.sort()).toEqual([1, 2])
    expect(r.strokes[1].role).toBe('기둥')
    expect(r.strokes[2].role).toBe('곁줄기')
    expect(r.parts[2].strokes.sort()).toEqual([3, 4, 5])
    expect(r.parts[2].sample!.strokes).toHaveLength(3)
  })

  it('왼: ㅇ은 둥근 획으로 닫히고, ㅚ는 가로부 · 세로부로 갈린다', () => {
    const r = WOEN()
    expect(r.state).toBe('ok')
    expect(r.strokes[0].round).toBe(true)
    expect(r.parts[0].sample!.strokes[0].closed).toBe(true)
    const ju = r.parts[1].sample!
    expect(ju.horizontalStrokes).toHaveLength(2)
    expect(ju.verticalStrokes).toHaveLength(1)
    expect(r.boxes.JU_H && r.boxes.JU_V).toBeTruthy()
    expect(r.boxes.JU).toBeUndefined()
    expect(r.parts[2].strokes).toEqual([4])
  })

  it('프리셋이 있으면 역할 id를 승계한다', () => {
    const r = readSyllable('고', [poly([0.3, 0.2], [0.6, 0.2], [0.6, 0.42]), poly([0.5, 0.5], [0.5, 0.62]), poly([0.18, 0.64], [0.82, 0.64])], {
      preset: (type, char) => type === 'choseong' && char === 'ㄱ'
        ? { char: 'ㄱ', type, strokes: [{ id: 'g-hook', closed: false, thickness: 0.05, points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }] }] }
        : undefined,
    })!
    expect(r.parts[0].sample!.strokes[0].id).toBe('g-hook')
  })

  it('획이 없는 자리는 bad', () => {
    const r = readSyllable('고', [poly([0.3, 0.2], [0.6, 0.2], [0.6, 0.42])])!
    expect(r.state).toBe('bad')
    expect(r.notes[0]).toContain('ㅗ')
  })
})

describe('손글씨 은행 — 배치 6종과 자모 견본', () => {
  const seedBank = () => {
    const reads: SyllableRead[] = [GO(), NAL(), WOEN()]
    return { reads, bank: applyChoices(emptyBank(), gather(reads), { jamo: {}, layout: 'keep' }) }
  }

  it('자리 이름: 홀자 종류 × 받침', () => {
    expect(layoutKeyOf('ㅏ', false)).toBe('세로홀자')
    expect(layoutKeyOf('ㅘ', true)).toBe('섞임홀자 + 받침')
    expect(typeOf(0, 'ㅗ', true)).toBe('Hb')
    expect(typeOf(2, 'ㅗ', true)).toBe('J')
    expect(exampleOf('ㄷ', 'Mb')).toBe('돰')
    expect(exampleOf('ㄷ', 'J')).toBe('앋')
    expect(exampleOf('ㄸ', 'J')).toBeNull()
  })

  it('세 글자를 반영하면 배치 셋과 자모 일곱이 들어온다', () => {
    const { bank } = seedBank()
    expect(Object.keys(bank.lay).sort()).toEqual(['가로홀자', '섞임홀자 + 받침', '세로홀자 + 받침'])
    expect(Object.keys(bank.jamo).sort()).toEqual(['ㄱ', 'ㄴ', 'ㄹ', 'ㅇ', 'ㅏ', 'ㅗ', 'ㅚ'])
    expect(bank.jamo['ㄱ'].rep.type).toBe('H')
    expect(bank.jamo['ㄹ'].rep.type).toBe('J')
    expect(bank.history).toEqual(['고', '날', '왼'])
    expect(phaseOf(bank)).toBe(1)
  })

  it('글자표: 다 찬 · 반쯤 찬 · 빈 글자', () => {
    const { bank } = seedBank()
    expect(planSyllable(bank, '고')!.ok).toBe(true)
    expect(planSyllable(bank, '노')!.ok).toBe(true) // ㄴ을 첫닿자 자리에 옮겨 씀
    const gol = planSyllable(bank, '골')!
    expect(gol.ok).toBe(false) // 가로홀자 + 받침 배치가 아직 없다
    const nam = planSyllable(bank, '남')!
    expect(nam.partial).toBe(true)
    expect(nam.missing).toEqual(['ㅁ'])
    expect(planSyllable(bank, '가')!.layout).toBeNull()
    const stats = chartStats(bank)
    expect(stats.ok).toBeGreaterThan(0)
    expect(stats.okSet.has('고')).toBe(true)
    expect(stats.partial).toBeGreaterThan(0)
  })

  it('놓기: 상자는 칸 기준이고 빈 자리는 빈 자모로 채운다', () => {
    const { bank } = seedBank()
    const placed = placeSyllable(bank, '남')!
    expect(placed.boxes.CH && placed.boxes.JU && placed.boxes.JO).toBeTruthy()
    expect(placed.missingBoxes.JO).toBeDefined()
    expect(placed.jongseongMap['ㅁ'].strokes).toEqual([])
    expect(placed.choseongMap['ㄴ'].strokes!.length).toBeGreaterThan(0)
    const woen = placeSyllable(bank, '왼')!
    expect(woen.boxes.JU_H && woen.boxes.JU_V).toBeTruthy()
    expect(woen.jungseongMap['ㅚ'].horizontalStrokes).toHaveLength(2)
  })

  it('두기 · 바꾸기 · 자리 꼴', () => {
    const { bank, reads } = seedBank()
    const again = gather([reads[0]])
    const kept = applyChoices(bank, again, { jamo: { 'ㄱ': { kind: 'keep' } }, layout: 'keep' })
    expect(kept.jamo['ㄱ'].versions).toHaveLength(2)
    expect(kept.jamo['ㄱ'].rep).toBe(bank.jamo['ㄱ'].rep)
    const slot = applyChoices(bank, again, { jamo: { 'ㄱ': { kind: 'slot', type: 'H' } }, layout: 'keep' })
    expect(slot.jamo['ㄱ'].by.H).not.toBe(bank.jamo['ㄱ'].by.H)
    const skipped = applyChoices(bank, gather([NAL()]), { jamo: { 'ㄴ': { kind: 'skip' } }, layout: 'keep' })
    expect(skipped.jamo['ㄴ'].versions).toHaveLength(1)
    // 2단계가 아니면 배치는 늘 섞인다
    expect(kept.lay['가로홀자']!.n).toBe(2)
  })

  it('상자 맞춤: 견본보다 1.6배 넘게 납작하면 줄이고 닻 쪽에 붙인다', () => {
    const frame = { x0: 0, y0: 0, w: 1, h: 1 }
    const wide = fitBox({ x0: 0, y0: 0, x1: 1, y1: 0.25 }, frame, 1, 'l')
    expect(wide.width).toBeCloseTo(0.4, 5)
    expect(wide.x).toBe(0)
    const right = fitBox({ x0: 0, y0: 0, x1: 1, y1: 0.25 }, frame, 1, 'r')
    expect(right.x).toBeCloseTo(0.6, 5)
    const same = fitBox({ x0: 0.1, y0: 0.2, x1: 0.5, y1: 0.6 }, { x0: 0.25, y0: 0.25, w: 0.5, h: 0.5 }, 1, 'c')
    expect(same.x).toBeCloseTo(0.3, 6); expect(same.y).toBeCloseTo(0.35, 6); expect(same.width).toBeCloseTo(0.2, 6); expect(same.height).toBeCloseTo(0.2, 6)
  })

  it('추천 문장: 글자표가 몇 자 차는지로 줄 세운다', () => {
    const { bank } = seedBank()
    // 배치가 셋뿐이라 1단계 — 배치를 많이 잡는 문장이 앞에 온다
    const first = recommendSentences(bank, '', 3)
    expect(first.length).toBe(3)
    expect(first[0].text).toBe(SEED_SENTENCE)
    expect(first[0].layouts).toBeGreaterThan(0)
    // 배치 6종을 다 채운 척하면 2단계 — 다 차는 글자 수 내림차순, 채우는 글자가 있는 문장만
    const full = { ...bank, lay: Object.fromEntries(['세로홀자', '세로홀자 + 받침', '가로홀자', '가로홀자 + 받침', '섞임홀자', '섞임홀자 + 받침'].map((k) => [k, bank.lay['가로홀자']!])) } as typeof bank
    const second = recommendSentences(full, '', 3)
    expect(second[0].fills).toBeGreaterThanOrEqual(second[1].fills)
    expect(second[1].fills).toBeGreaterThanOrEqual(second[2].fills)
    expect(second[0].fills).toBeGreaterThan(0)
    expect(second[0].newJamo.length).toBeGreaterThan(0)
    expect(second.some((r) => r.text.replace(/\s+/g, '') === '')).toBe(false)
    // 지금 문장은 뺀다
    expect(recommendSentences(full, second[0].text, 3).some((r) => r.text === second[0].text)).toBe(false)
  })

  it('주사위: 1단계는 씨앗 문장, 글자표 칸은 그 자모가 든 문장', () => {
    expect(pickSentence(emptyBank(), '')).toBe(SEED_SENTENCE)
    expect(pickSentence(emptyBank(), SEED_SENTENCE)).not.toBe(SEED_SENTENCE)
    expect(sentenceFor(['ㄺ'])).toMatch(/닭|읽|갉|맑|늙|굵|붉|밝/)
    expect(sentenceFor(['ㅃ', 'ㅉ'], ['가나다'])).toBeNull()
  })
})
