import { useCallback, useMemo } from 'react'
import type { PenPoint } from '../src/services/penStrokeFit'
import { propagatedJungseong } from '../src/stores/stemMasterStore'
import type { JamoData, LayoutType, ResolvedStrokeInkSource } from '../src/types'
import { decomposeSyllable } from '../src/utils/hangulUtils'
import { EDIT_COLOR } from './editColors'
import { consonantBoxesOf, consonantShapesOf, consonantStemKeys, drawnStem, LAYOUTS, mastersOf, shapeConsonants, STEMS, vowelStemKeys, type DrawnStem, type StemKind } from './strokeLab'

/**
 * 그은 줄기의 미리보기 계산과 안내 말. 획 긋기 시험판(`/pillar-lab`)과 시작 화면(`/start`)이 같이 쓴다. 판은 `stemPad.tsx`.
 */

type JamoMap = Readonly<Record<string, JamoData>>
export type StemRaws = Partial<Record<StemKind, PenPoint[]>>

/** 받침 있는 말 뒤엔 `이에요`, 없으면 `예요`. */
export function withCopula(word: string): string {
  const code = word.charCodeAt(word.length - 1) - 0xac00
  return code >= 0 && code < 11172 && code % 28 !== 0 ? `${word}이에요` : `${word}예요`
}

export function reasonText(stem: Exclude<DrawnStem, { ok: true }>): string {
  if (stem.reason === 'short') return '조금 더 크게 그어 주세요'
  if (stem.reason === 'open') return '한 바퀴 이어서 그어 주세요'
  if (stem.reason === 'fit') return '다시 한 번 그어 주세요'
  if (stem.kind === 'diagonal') return '비스듬히 그어 주세요'
  return stem.kind === 'vertical' || stem.kind === 'shortVertical' ? '세로로 그어 주세요' : '가로로 그어 주세요'
}

/** 그은 날것들을 줄기로 맞춘 것. */
export function useDrawnStems(raws: StemRaws): Partial<Record<StemKind, DrawnStem>> {
  return useMemo(() => Object.fromEntries(STEMS.flatMap((info) => {
    const raw = raws[info.kind]
    return raw ? [[info.kind, drawnStem(raw, info.kind)]] : []
  })) as Partial<Record<StemKind, DrawnStem>>, [raws])
}

/**
 * 그은 줄기를 글자에 입힌 덮어쓰기(override). 저장하지 않고 미리보기에만 쓴다.
 * 닿자 칸은 짜임마다 비율이 달라 짜임별로 따로 입힌다.
 */
export function useStemOverrides(stems: Partial<Record<StemKind, DrawnStem>>, choseong: JamoMap, jungseong: JamoMap, jongseong: JamoMap) {
  const overrides = useMemo(() => {
    const masters = mastersOf(stems, jungseong)
    const shapes = consonantShapesOf(stems)
    const consonants = Object.fromEntries(LAYOUTS.map((layout) => {
      const box = consonantBoxesOf(layout)
      return [layout, { choseong: shapeConsonants(choseong, shapes, box.CH).changed, jongseong: shapeConsonants(jongseong, shapes, box.JO).changed }]
    })) as Record<LayoutType, { choseong: Record<string, JamoData>; jongseong: Record<string, JamoData> }>
    return {
      jungseong: Object.keys(masters).length ? propagatedJungseong(jungseong, {}, masters) : undefined,
      consonants,
    }
  }, [stems, choseong, jungseong, jongseong])
  const layoutOf = useCallback((char: string): LayoutType => decomposeSyllable(char, choseong, jungseong, jongseong).layoutType, [choseong, jungseong, jongseong])
  return { overrides, layoutOf }
}

/** 줄기 종류(`kinds`)가 쓰인 획을 색으로 칠하는 함수. 아무것도 없으면 undefined. */
export function useStemMarker(kinds: readonly StemKind[], choseong: JamoMap, jungseong: JamoMap, jongseong: JamoMap, color: string = EDIT_COLOR.editSelect) {
  const vowelKeys = useMemo(() => vowelStemKeys(jungseong), [jungseong])
  const initialKeys = useMemo(() => consonantStemKeys(choseong), [choseong])
  const finalKeys = useMemo(() => consonantStemKeys(jongseong), [jongseong])
  return useCallback((source: ResolvedStrokeInkSource) => {
    const key = `${source.jamoId}:${source.strokeId}`
    const hit = source.part.startsWith('JU') ? kinds.includes(vowelKeys.get(key) as StemKind)
      : source.part === 'CH' ? initialKeys.get(key)?.some((kind) => kinds.includes(kind))
      : finalKeys.get(key)?.some((kind) => kinds.includes(kind))
    return hit ? color : undefined
  }, [vowelKeys, initialKeys, finalKeys, kinds, color])
}

