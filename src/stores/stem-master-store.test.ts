import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { boundStrokesOf, type StemMaster } from '../services/stemMaster'

const memory = new Map<string, string>()
beforeAll(() => {
  vi.stubGlobal('localStorage', { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => memory.set(key, value), removeItem: (key: string) => memory.delete(key) })
})
afterAll(() => { vi.unstubAllGlobals() })

const bent: StemMaster = { name: 'gidung', points: [{ t: 0, o: 0, handleOut: { t: 0.4, o: 0.03 } }, { t: 1, o: 0, handleIn: { t: 0.7, o: -0.01 } }] }

describe('줄기 마스터 스토어', () => {
  beforeEach(async () => {
    const { useJamoStore } = await import('./jamoStore')
    const { useStemMasterStore } = await import('./stemMasterStore')
    useJamoStore.getState().resetToBaseJamos()
    useStemMasterStore.setState({ masters: {} })
  })

  it('기둥 마스터를 휘면 세로홀자 · 섞임홀자 세로부의 기둥이 전부 따라오고 틀이 곧은 획으로 굳는다', async () => {
    const { useJamoStore } = await import('./jamoStore')
    const { useStemMasterStore } = await import('./stemMasterStore')
    const before = useJamoStore.getState().jungseong['ㅏ']
    useStemMasterStore.getState().setMaster(bent)
    const jung = useJamoStore.getState().jungseong
    for (const char of ['ㅏ', 'ㅕ', 'ㅐ', 'ㅑ']) {
      expect(jung[char].strokes![0].points[0].handleOut, char).toBeDefined()
      expect(boundStrokesOf(jung[char], { gidung: bent }).filter((item) => item.name === 'gidung' || item.name === 'gidung.inner').every((item) => item.follows), char).toBe(true)
    }
    expect(jung['ㅘ'].verticalStrokes![0].points[0].handleOut).toBeDefined()
    expect(jung['ㅙ'].verticalStrokes![0].points[0].handleOut).toBeDefined()
    expect(jung['ㅘ'].horizontalStrokes![0].points[0].handleOut).toBeUndefined()
    expect(jung['ㅏ'].frame?.strokes).toEqual(before.strokes)
    expect(jung['ㅏ'].strokes![1]).toEqual(before.strokes![1])
    expect(jung['ㅗ'].strokes![0].points[0].handleOut).toBeUndefined()
    // 상자가 두께 0인 ㅣ · ㅚ 세로부도 따른다(휠 방향의 변은 ㅏ 칸 폭을 빌린다).
    expect(jung['ㅣ'].strokes![0].points[0].handleOut).toBeDefined()
    expect(jung['ㅚ'].verticalStrokes![0].points[0].handleOut).toBeDefined()
  })

  it('풀린 획은 마스터를 다시 바꿔도 그대로, 다시 따르기로 붙고, 지우면 곧아진다', async () => {
    const { useJamoStore } = await import('./jamoStore')
    const { useStemMasterStore } = await import('./stemMasterStore')
    const store = useStemMasterStore.getState()
    store.setMaster(bent)
    const a = useJamoStore.getState().jungseong['ㅏ']
    useJamoStore.getState().updateJungseong('ㅏ', { ...a, strokes: [{ ...a.strokes![0], points: [{ x: 0, y: 0 }, { x: 0.1, y: 1 }] }, a.strokes![1]] })
    const flatter: StemMaster = { name: 'gidung', points: [{ t: 0, o: 0, handleOut: { t: 0.4, o: 0.01 } }, { t: 1, o: 0 }] }
    store.setMaster(flatter)
    const jung = useJamoStore.getState().jungseong
    expect(jung['ㅏ'].strokes![0].points[1]).toEqual({ x: 0.1, y: 1 })
    expect(jung['ㅕ'].strokes![0].points[0].handleOut).toBeDefined()
    expect(jung['ㅕ'].strokes![1].handleIn).toBeUndefined()
    store.refollow('ㅏ', 'strokes', 'ㅏ-1')
    expect(boundStrokesOf(useJamoStore.getState().jungseong['ㅏ'], { gidung: flatter })[0].follows).toBe(true)
    store.resetMaster('gidung')
    expect(useJamoStore.getState().jungseong['ㅕ'].strokes![0].points).toHaveLength(2)
    expect(useJamoStore.getState().jungseong['ㅕ'].strokes![0].points[0].handleOut).toBeUndefined()
  })

  it('풀린 획 모두 다시 따르기는 그 이름의 풀린 획만 붙인다(안쪽 기둥)', async () => {
    const { useJamoStore } = await import('./jamoStore')
    const { useStemMasterStore } = await import('./stemMasterStore')
    const store = useStemMasterStore.getState()
    store.setMaster(bent)
    const release = (char: string, index: number) => {
      const jamo = useJamoStore.getState().jungseong[char]
      const channel = jamo.strokes ? 'strokes' : 'verticalStrokes'
      const strokes = [...jamo[channel]!]
      strokes[index] = { ...strokes[index], points: strokes[index].points.map((point, at) => at === 0 ? { ...point, handleOut: { x: point.x + 0.3, y: 0.2 } } : point) }
      useJamoStore.getState().updateJungseong(char, { ...jamo, [channel]: strokes })
    }
    release('ㅐ', 0)
    release('ㅒ', 0)
    release('ㅏ', 0)
    const innerOf = () => ['ㅐ', 'ㅒ', 'ㅏ'].map((char) => boundStrokesOf(useJamoStore.getState().jungseong[char], { gidung: bent })[0])
    expect(innerOf().map((item) => [item.name, item.follows])).toEqual([['gidung.inner', false], ['gidung.inner', false], ['gidung', false]])
    store.refollowAll('gidung.inner')
    expect(innerOf().map((item) => item.follows)).toEqual([true, true, false])
  })

  it('전체 리셋은 마스터를 지우고 풀린 줄기까지 곧게 되돌린다(끝점은 그대로)', async () => {
    const { useJamoStore } = await import('./jamoStore')
    const { useStemMasterStore } = await import('./stemMasterStore')
    const store = useStemMasterStore.getState()
    store.setMaster(bent)
    const a = useJamoStore.getState().jungseong['ㅏ']
    useJamoStore.getState().updateJungseong('ㅏ', { ...a, strokes: [{ ...a.strokes![0], points: [{ x: 0, y: 0, handleOut: { x: 0.4, y: 0.3 } }, { x: 0.1, y: 1 }] }, a.strokes![1]] })
    store.resetAll()
    expect(useStemMasterStore.getState().masters).toEqual({})
    const jung = useJamoStore.getState().jungseong
    expect(jung['ㅏ'].strokes![0].points).toEqual([{ x: 0, y: 0 }, { x: 0.1, y: 1 }])
    for (const char of ['ㅐ', 'ㅒ', 'ㅘ', 'ㅣ']) {
      expect(boundStrokesOf(jung[char], {}).every((item) => item.follows && item.stroke.points.every((point) => !point.handleIn && !point.handleOut)), char).toBe(true)
    }
  })
})
