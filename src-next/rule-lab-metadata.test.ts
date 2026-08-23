import { describe, expect, it } from 'vitest'
import { CHOSEONG_MAP } from '../src/data/Hangul'
import { analyzeTerminal, inwardTerminalAngle, writingTerminalAngle, writingTerminalSides } from './ruleLabMetadata'

describe('형태 규칙 실험실 끝점 분석', () => {
  it('ㄱ 시작은 오른쪽, 끝은 아래쪽 진행으로 읽는다', () => {
    const stroke = CHOSEONG_MAP['ㄱ'].strokes![0]
    expect(analyzeTerminal(stroke, 'start')).toMatchObject({ tangentAngle: 0, side: 'start' })
    expect(analyzeTerminal(stroke, 'end')).toMatchObject({ tangentAngle: 90, side: 'end' })
  })

  it('ㄴ 시작은 아래쪽, 끝은 오른쪽 진행으로 읽는다', () => {
    const stroke = CHOSEONG_MAP['ㄴ'].strokes![0]
    expect(analyzeTerminal(stroke, 'start')).toMatchObject({ tangentAngle: 90 })
    expect(analyzeTerminal(stroke, 'end')).toMatchObject({ tangentAngle: 0 })
  })

  it('베지어 경로는 다음 꼭짓점이 아니라 시작·끝 핸들로 접선을 읽는다', () => {
    const stroke = {
      id: 'curve', closed: false, thickness: .07,
      points: [
        { x: .1, y: .2, handleOut: { x: .45, y: .2 } },
        { x: .8, y: .9, handleIn: { x: .8, y: .55 } },
      ],
    }
    expect(analyzeTerminal(stroke, 'start')).toMatchObject({ tangentAngle: 0 })
    expect(analyzeTerminal(stroke, 'end')).toMatchObject({ tangentAngle: 90 })
  })

  it('역방향 저장 경로의 끝점도 글자 안쪽 진행 방향으로 읽는다', () => {
    const stroke = {
      id: 'reverse', closed: false, thickness: .07,
      points: [
        { x: .8, y: .9, handleOut: { x: .8, y: .5 } },
        { x: .1, y: .2, handleIn: { x: .45, y: .2 } },
      ],
    }
    expect(analyzeTerminal(stroke, 'end').tangentAngle).toBe(180)
    expect(inwardTerminalAngle(stroke, 'end')).toBe(0)
    expect(writingTerminalSides(stroke)).toEqual({ start: 'end', end: 'start' })
    expect(writingTerminalAngle(stroke, 'start')).toBe(0)
    expect(writingTerminalAngle(stroke, 'end')).toBe(90)
  })
})
