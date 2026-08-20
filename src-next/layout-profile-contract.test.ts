import { describe, expect, it } from 'vitest'
import type { LayoutSchema } from '../src/types'
import { scaleLayoutParts, translateLayoutParts } from '../src/services/layoutProfileCommands'

const schema: LayoutSchema = {
  id: 'choseong-jungseong-mixed',
  slots: ['CH', 'JU_H', 'JU_V'],
}

describe('레이아웃 패턴 전파 프로필', () => {
  it('이동은 파트의 크기를 유지한 채 양쪽 경계를 함께 옮긴다', () => {
    const moved = translateLayoutParts(schema, ['CH'], { x: .03, y: -.02 })
    expect(moved.userPartOverrides?.CH).toEqual({ top: -.02, bottom: .02, left: .03, right: -.03 })
  })

  it('혼합중성 크기 변경은 JU_H와 JU_V에 함께 기록한다', () => {
    const scaled = scaleLayoutParts(schema, ['JU_H', 'JU_V'], {
      JU_H: { x: .2, y: .4, width: .5, height: .2 },
      JU_V: { x: .6, y: .1, width: .2, height: .7 },
    }, { x: 1.1, y: .9 })
    expect(scaled.userPartOverrides?.JU_H).toBeDefined()
    expect(scaled.userPartOverrides?.JU_V).toBeDefined()
    expect(scaled.userPartOverrides?.JU_H).not.toEqual(scaled.userPartOverrides?.JU_V)
  })
})
