import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createNotoPresetReader } from '../scripts/reference-lab/notoPresetApi'
import { CHOSEONG_MAP, JONGSEONG_MAP, JUNGSEONG_MAP } from '../src/data/Hangul'
import { identityOfSyllable, resolveContextBoxes } from '../src/services/contextBoxResolver'
import type { NotoOutline } from '../src/services/notoOutlineInk'
import { decomposeSyllable } from '../src/utils/hangulUtils'
import { editableRailsOf, fitMedialForGlyph, renderMedialPart } from './notoMedialFitView'

/**
 * 레이아웃 편집기의 홀자 잉크는 획 마스터 fit이 아니라 앱 획이다. 문장 줄과 같은 호출(`fitPartStrokes`)로 slot 네 변에 맞춘다.
 * 그래서 캔버스의 홀자 중심선 상자 = 칸 해석의 `boxes[part]`, 획 편집에서 고친 홀자가 레이아웃에도 보인다.
 */

const CORPUS = path.resolve(__dirname, '../.reference-fonts/guide-corpus')
const decompose = (char: string) => decomposeSyllable(char, CHOSEONG_MAP, JUNGSEONG_MAP, JONGSEONG_MAP)
const NO_OUTLINE = {} as NotoOutline

describe('레이아웃 편집기 홀자 = 앱 획', () => {
  const bundle = createNotoPresetReader(CORPUS).model()
  const viewOf = async (char: string) => {
    const model = await bundle
    const syllable = decompose(char)
    const identity = identityOfSyllable(syllable)!
    const context = resolveContextBoxes({ identity, model })
    return { view: fitMedialForGlyph({ context, outline: NO_OUTLINE, approved: null }), app: resolveContextBoxes({ identity, model, syllable }) }
  }

  it('노·과: 캔버스 홀자의 중심선 상자가 칸 해석(문장 줄)의 상자와 같다 — 혼합 홀자는 가로부·세로부 각각', async () => {
    for (const char of ['노', '과', '을', '배']) {
      const { view, app } = await viewOf(char)
      expect(app.complete).toBe(true)
      for (const part of view.parts) {
        expect(part.jamo?.char).toBe(decompose(char).jungseong!.char)
        const rendered = renderMedialPart(part)
        expect(rendered.path, `${char} ${part.part}`).toBeTruthy()
        const box = app.boxes[part.part]!
        for (const key of ['x', 'y', 'width', 'height'] as const) expect(rendered.inkBox![key], `${char} ${part.part} ${key}`).toBeCloseTo(box[key], 9)
      }
    }
  })

  it('앱 획을 고치면 캔버스 잉크가 바뀐다. slot(기준선 상자)은 그대로', async () => {
    const { view } = await viewOf('노')
    const part = view.parts[0]
    const base = renderMedialPart(part)
    const edited = structuredClone(part.jamo!) as NonNullable<typeof part.jamo>
    // ㅗ 줄기를 왼쪽으로. 보가 0~1을 그대로 채워 중심선 범위는 안 변한다.
    const stem = (edited.strokes as unknown as { points: { x: number; y: number }[] }[]).find((stroke) => stroke.points.every((point) => Math.abs(point.x - stroke.points[0].x) < 1e-9))!
    for (const point of stem.points) point.x = 0.25
    const moved = renderMedialPart({ ...part, jamo: edited })
    expect(moved.path).toBeTruthy()
    expect(moved.path).not.toBe(base.path)
    expect(moved.slot).toEqual(base.slot)
  })

  it('앱 획이 칸에 안 맞으면 상자는 남고 잉크만 없다 — rail 자리는 유효', async () => {
    const { view } = await viewOf('을')
    const part = view.parts[0]
    const bent = structuredClone(part.jamo!) as NonNullable<typeof part.jamo>
    ;(bent.strokes as unknown as { points: { x: number; y: number }[] }[])[0].points = [{ x: 0, y: 0.2 }, { x: 0.5, y: 0.8 }, { x: 1, y: 0.2 }]
    const rendered = renderMedialPart({ ...part, jamo: bent })
    expect(rendered.slot).toBeDefined()
    expect(rendered.path).toBeUndefined()
    expect(rendered.message).toContain('박스가 획 두께보다 작습니다')
  })

  it('앱 획이 없는 part(앱 밖 테스트)는 획 마스터 잉크로 그린다', async () => {
    const { view } = await viewOf('노')
    const rendered = renderMedialPart({ ...view.parts[0], jamo: undefined })
    expect(rendered.path).toBeTruthy()
    expect(rendered.inkBox).toBeUndefined()
  })

  it('rail 목록에는 시작·끝이 아직 있지만(기하 엔진), 편집기는 중심만 내놓는다', async () => {
    const { view } = await viewOf('노')
    const kinds = new Set(editableRailsOf(view.parts, []).map((rail) => rail.kind))
    expect(kinds.has('center')).toBe(true)
    expect([...kinds].every((kind) => kind === 'center' || kind === 'start' || kind === 'end')).toBe(true)
  })
})
