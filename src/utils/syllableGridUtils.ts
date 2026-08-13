import { CHOSEONG_LIST, JUNGSEONG_LIST, JONGSEONG_LIST } from '../data/Hangul'
import { classifyJungseong } from './hangulUtils'
import type { LayoutType } from '../types'

export interface SyllableGridMeta {
  char: string
  layoutType: LayoutType
  cho: string
  jung: string
  jong: string
}

export interface SyllableGridSheet {
  id: string
  label: string
  rowLabel: string
  columnLabel: string
  rows: string[]
  columns: string[]
  cells: Array<Array<SyllableGridMeta | null>>
}

export interface SyllableGridContext {
  editingJamoType: 'choseong' | 'jungseong' | 'jongseong' | null
  selectedLayoutType: LayoutType | null
}

const JUNG_TYPE_LABELS = {
  vertical: '세로 중성',
  horizontal: '가로 중성',
  mixed: '혼합 중성',
} as const

function orderedValues(values: Set<string>, order: readonly string[]): string[] {
  return order.filter((value) => values.has(value))
}

function createSheet(
  id: string,
  label: string,
  rowLabel: string,
  columnLabel: string,
  rows: string[],
  columns: string[],
  metas: SyllableGridMeta[],
  getRow: (meta: SyllableGridMeta) => string,
  getColumn: (meta: SyllableGridMeta) => string,
): SyllableGridSheet {
  const lookup = new Map(metas.map((meta) => [`${getRow(meta)}\u0000${getColumn(meta)}`, meta]))
  return {
    id,
    label,
    rowLabel,
    columnLabel,
    rows,
    columns,
    cells: rows.map((row) => columns.map((column) => lookup.get(`${row}\u0000${column}`) ?? null)),
  }
}

export function buildSyllableGridSheets(
  metas: SyllableGridMeta[],
  context: SyllableGridContext,
): SyllableGridSheet[] {
  if (metas.length === 0) return []

  const { editingJamoType, selectedLayoutType } = context

  if (!editingJamoType && selectedLayoutType) {
    const hasJongseong = selectedLayoutType.includes('jongseong')
    const jongValues = hasJongseong
      ? orderedValues(new Set(metas.map((meta) => meta.jong)), JONGSEONG_LIST)
      : ['']

    return jongValues.map((jong) => {
      const sheetMetas = metas.filter((meta) => meta.jong === jong)
      return createSheet(
        `layout-${selectedLayoutType}-${jong || 'none'}`,
        hasJongseong ? `종성 ${jong}` : '받침 없음',
        '초성',
        '중성',
        orderedValues(new Set(sheetMetas.map((meta) => meta.cho)), CHOSEONG_LIST),
        orderedValues(new Set(sheetMetas.map((meta) => meta.jung)), JUNGSEONG_LIST),
        sheetMetas,
        (meta) => meta.cho,
        (meta) => meta.jung,
      )
    })
  }

  if (editingJamoType === 'choseong') {
    return (['vertical', 'horizontal', 'mixed'] as const).flatMap((jungType) => {
      const sheetMetas = metas.filter((meta) => classifyJungseong(meta.jung) === jungType)
      if (sheetMetas.length === 0) return []
      return [createSheet(
        `choseong-${jungType}`,
        JUNG_TYPE_LABELS[jungType],
        '종성',
        '중성',
        orderedValues(new Set(sheetMetas.map((meta) => meta.jong)), JONGSEONG_LIST),
        orderedValues(new Set(sheetMetas.map((meta) => meta.jung)), JUNGSEONG_LIST),
        sheetMetas,
        (meta) => meta.jong,
        (meta) => meta.jung,
      )]
    })
  }

  if (editingJamoType === 'jungseong') {
    return [createSheet(
      'jungseong-fixed',
      `중성 ${metas[0]?.jung ?? ''}`,
      '초성',
      '종성',
      orderedValues(new Set(metas.map((meta) => meta.cho)), CHOSEONG_LIST),
      orderedValues(new Set(metas.map((meta) => meta.jong)), JONGSEONG_LIST),
      metas,
      (meta) => meta.cho,
      (meta) => meta.jong,
    )]
  }

  if (editingJamoType === 'jongseong') {
    return (['vertical', 'horizontal', 'mixed'] as const).flatMap((jungType) => {
      const sheetMetas = metas.filter((meta) => classifyJungseong(meta.jung) === jungType)
      if (sheetMetas.length === 0) return []
      return [createSheet(
        `jongseong-${jungType}`,
        JUNG_TYPE_LABELS[jungType],
        '초성',
        '중성',
        orderedValues(new Set(sheetMetas.map((meta) => meta.cho)), CHOSEONG_LIST),
        orderedValues(new Set(sheetMetas.map((meta) => meta.jung)), JUNGSEONG_LIST),
        sheetMetas,
        (meta) => meta.cho,
        (meta) => meta.jung,
      )]
    })
  }

  return []
}

export function formatAxisValue(value: string): string {
  return value === '' ? '없음' : value
}
