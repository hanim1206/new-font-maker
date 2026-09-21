import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import baseJamos from '../src/data/baseJamos.json'
import { identityOfSyllable, resolveContextBoxes } from '../src/services/contextBoxResolver'
import type { ContextModel } from '../src/services/contextBoxResolver'
import { useLayoutStore } from '../src/stores/layoutStore'
import type { JamoData, MobileEditorPart } from '../src/types'
import { decomposeSyllable } from '../src/utils/hangulUtils'
import { getMinimumInterComponentInkGap } from '../src/utils/inkGapGuard'
import { calculateBoxes } from '../src/utils/layoutCalculator'

/**
 * 최소 잉크 간격을 재는 상자가 화면과 얼마나 다른지 잰다(플랜 `최소-잉크-간격을-화면과-같은-상자로` D0).
 * 끌 때의 멈춤과 편집 캔버스의 문맥 안전 보정은 옛 스키마 상자로 글자를 놓고 재는데, 화면 · 추출은 모델 상자로 그린다.
 * 같은 글자 · 같은 획에서 자소 사이 최소 간격을 두 상자로 각각 재서 차이를 본다. 표본은 표본 카드가 쓰는 자주 쓰는 글자 묶음이다.
 */
const MODEL = JSON.parse(readFileSync(fileURLToPath(new URL('../public/noto-preset/model.json', import.meta.url)), 'utf8')) as ContextModel
const SAMPLE = [
  '이처계때께하서녀에터키며가례대지피야배려다혜써게',
  '한임명집실것없력있심년할책정법같일많겠성힘닭짧적',
  '고조수끄뿌요크효도구누유쓰보트표로뉴초교부무뜨으',
  '는급꽃몫북들품용을죽놓숲뜻큼균통은를중습춤곧쪽높',
  '와뇌최쾌뭐뒤화궤의쉬죄과되뛰봐꽤위회귀쇠띄놔줘돼',
  '됨쉽횟봤권뭘왕퀵원될줬광획쉰뛸놨된웠관훨꽝쫙',
  '각곡곽뷁힣쌍흙',
].join('')
const UPM = 1000
const PARTS: MobileEditorPart[] = ['CH', 'JU', 'JO']

describe('간격을 재는 상자: 옛 스키마 vs 화면(모델)', () => {
  it('자주 쓰는 글자에서 자소 사이 최소 간격의 차이를 잰다', () => {
    const maps = baseJamos as unknown as Record<'choseong' | 'jungseong' | 'jongseong', Record<string, JamoData>>
    const layouts = useLayoutStore.getState()
    const rows: { char: string; part: MobileEditorPart; legacy: number; model: number }[] = []
    let unresolved = 0
    for (const char of new Set(SAMPLE)) {
      const syllable = decomposeSyllable(char, maps.choseong, maps.jungseong, maps.jongseong)
      const padding = { ...layouts.globalPadding, ...layouts.paddingOverrides[syllable.layoutType] }
      const schema = { ...layouts.layoutSchemas[syllable.layoutType], padding, designBodyPadding: padding }
      const legacyBoxes = calculateBoxes(schema, { cho: syllable.choseong?.char ?? '', jung: syllable.jungseong?.char ?? '', jong: syllable.jongseong?.char ?? '' })
      const identity = identityOfSyllable(syllable)
      const resolution = identity ? resolveContextBoxes({ identity, model: MODEL, syllable, ends: { linecap: 'butt', linejoin: 'miter' } }) : null
      if (!resolution?.complete) { unresolved += 1; continue }
      for (const part of PARTS) {
        if (part === 'JO' && !syllable.jongseong) continue
        const legacy = getMinimumInterComponentInkGap(syllable, legacyBoxes, part) * UPM
        const model = getMinimumInterComponentInkGap(syllable, resolution.boxes, part) * UPM
        if (Number.isFinite(legacy) && Number.isFinite(model)) rows.push({ char, part, legacy, model })
      }
    }
    const diffs = rows.map((row) => Math.abs(row.legacy - row.model)).sort((a, b) => a - b)
    const quantile = (q: number) => diffs[Math.min(diffs.length - 1, Math.floor(q * diffs.length))]
    const chars = new Set(rows.map((row) => row.char))
    const over10 = new Set(rows.filter((row) => Math.abs(row.legacy - row.model) > 10).map((row) => row.char))
    // 부호가 갈리는 경우: 한쪽은 닿았다(≤0)고 보고 다른 쪽은 떨어져 있다고 본다. 멈춤이 헛도는 글자다.
    const signFlip = rows.filter((row) => (row.legacy <= 0) !== (row.model <= 0))
    const worst = [...rows].sort((a, b) => Math.abs(b.legacy - b.model) - Math.abs(a.legacy - a.model)).slice(0, 12)
    console.log(JSON.stringify({
      chars: chars.size, rows: rows.length, unresolved,
      median: +quantile(0.5).toFixed(1), p90: +quantile(0.9).toFixed(1), max: +diffs[diffs.length - 1].toFixed(1),
      over10Chars: over10.size, over10Share: +(over10.size / chars.size).toFixed(3),
      signFlipRows: signFlip.length, signFlipChars: new Set(signFlip.map((row) => row.char)).size,
      modelTouching: new Set(rows.filter((row) => row.model <= 0).map((row) => row.char)).size, legacyTouching: new Set(rows.filter((row) => row.legacy <= 0).map((row) => row.char)).size,
      modelBelowMinimum: new Set(rows.filter((row) => row.model < 25).map((row) => row.char)).size, legacyBelowMinimum: new Set(rows.filter((row) => row.legacy < 25).map((row) => row.char)).size,
      worst: worst.map((row) => `${row.char}:${row.part} 옛 ${row.legacy.toFixed(0)} · 모델 ${row.model.toFixed(0)}`),
    }, null, 1))
    expect(rows.length).toBeGreaterThan(200)
  })
})
