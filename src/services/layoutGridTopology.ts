import type {
  Axis,
  LayoutPartEdgeRailIds,
  LayoutSplitId,
  Part,
  SharedLayoutType,
} from '../types'
import { SHARED_LAYOUT_TYPES } from '../types'

export type LayoutGridSplitSpec = Readonly<{
  id: LayoutSplitId
  axis: Axis
}>

export type LayoutGridTopology = Readonly<{
  slots: readonly Part[]
  splits: readonly LayoutGridSplitSpec[]
}>

const splitId = (layoutType: SharedLayoutType, axis: Axis, name: string): LayoutSplitId =>
  `${layoutType}:${axis}:${name}`

/** 저장 파서와 projection이 함께 사용하는 공통 7종의 의미 주소 계약. */
export const LAYOUT_GRID_TOPOLOGIES: Readonly<Record<SharedLayoutType, LayoutGridTopology>> = {
  'choseong-only': { slots: ['CH'], splits: [] },
  'choseong-jungseong-vertical': {
    slots: ['CH', 'JU'],
    splits: [{ id: splitId('choseong-jungseong-vertical', 'x', 'ch-ju'), axis: 'x' }],
  },
  'choseong-jungseong-horizontal': {
    slots: ['CH', 'JU'],
    splits: [{ id: splitId('choseong-jungseong-horizontal', 'y', 'ch-ju'), axis: 'y' }],
  },
  'choseong-jungseong-mixed': {
    slots: ['CH', 'JU_H', 'JU_V'],
    splits: [
      { id: splitId('choseong-jungseong-mixed', 'x', 'left-column-ju-v'), axis: 'x' },
      { id: splitId('choseong-jungseong-mixed', 'y', 'ch-ju-h'), axis: 'y' },
    ],
  },
  'choseong-jungseong-vertical-jongseong': {
    slots: ['CH', 'JU', 'JO'],
    splits: [
      { id: splitId('choseong-jungseong-vertical-jongseong', 'x', 'ch-ju'), axis: 'x' },
      { id: splitId('choseong-jungseong-vertical-jongseong', 'y', 'upper-jo'), axis: 'y' },
    ],
  },
  'choseong-jungseong-horizontal-jongseong': {
    slots: ['CH', 'JU', 'JO'],
    splits: [
      { id: splitId('choseong-jungseong-horizontal-jongseong', 'y', 'ch-ju'), axis: 'y' },
      { id: splitId('choseong-jungseong-horizontal-jongseong', 'y', 'ju-jo'), axis: 'y' },
    ],
  },
  'choseong-jungseong-mixed-jongseong': {
    slots: ['CH', 'JU_H', 'JU_V', 'JO'],
    splits: [
      { id: splitId('choseong-jungseong-mixed-jongseong', 'x', 'left-column-ju-v'), axis: 'x' },
      { id: splitId('choseong-jungseong-mixed-jongseong', 'y', 'ch-ju-h'), axis: 'y' },
      { id: splitId('choseong-jungseong-mixed-jongseong', 'y', 'upper-jo'), axis: 'y' },
    ],
  },
}

export type LayoutGridEdgeEqualityGroup = Readonly<{
  splitId?: LayoutSplitId
  edges: readonly { part: Part; edge: keyof LayoutPartEdgeRailIds }[]
}>

/** 같은 경계를 뜻하는 split/part edge가 반드시 같은 Rail ID를 쓰는 계약. */
export const LAYOUT_GRID_EDGE_EQUALITY_GROUPS: Readonly<Record<
  SharedLayoutType,
  readonly LayoutGridEdgeEqualityGroup[]
>> = {
  'choseong-only': [],
  'choseong-jungseong-vertical': [
    {
      splitId: splitId('choseong-jungseong-vertical', 'x', 'ch-ju'),
      edges: [{ part: 'CH', edge: 'right' }, { part: 'JU', edge: 'left' }],
    },
    { edges: [{ part: 'CH', edge: 'top' }, { part: 'JU', edge: 'top' }] },
    { edges: [{ part: 'CH', edge: 'bottom' }, { part: 'JU', edge: 'bottom' }] },
  ],
  'choseong-jungseong-horizontal': [
    {
      splitId: splitId('choseong-jungseong-horizontal', 'y', 'ch-ju'),
      edges: [{ part: 'CH', edge: 'bottom' }, { part: 'JU', edge: 'top' }],
    },
    { edges: [{ part: 'CH', edge: 'left' }, { part: 'JU', edge: 'left' }] },
    { edges: [{ part: 'CH', edge: 'right' }, { part: 'JU', edge: 'right' }] },
  ],
  'choseong-jungseong-mixed': [
    {
      splitId: splitId('choseong-jungseong-mixed', 'x', 'left-column-ju-v'),
      edges: [
        { part: 'CH', edge: 'right' }, { part: 'JU_H', edge: 'right' },
        { part: 'JU_V', edge: 'left' },
      ],
    },
    {
      splitId: splitId('choseong-jungseong-mixed', 'y', 'ch-ju-h'),
      edges: [{ part: 'CH', edge: 'bottom' }, { part: 'JU_H', edge: 'top' }],
    },
    { edges: [{ part: 'CH', edge: 'left' }, { part: 'JU_H', edge: 'left' }] },
    { edges: [{ part: 'CH', edge: 'top' }, { part: 'JU_V', edge: 'top' }] },
    { edges: [{ part: 'JU_H', edge: 'bottom' }, { part: 'JU_V', edge: 'bottom' }] },
  ],
  'choseong-jungseong-vertical-jongseong': [
    {
      splitId: splitId('choseong-jungseong-vertical-jongseong', 'x', 'ch-ju'),
      edges: [{ part: 'CH', edge: 'right' }, { part: 'JU', edge: 'left' }],
    },
    {
      splitId: splitId('choseong-jungseong-vertical-jongseong', 'y', 'upper-jo'),
      edges: [
        { part: 'CH', edge: 'bottom' }, { part: 'JU', edge: 'bottom' },
        { part: 'JO', edge: 'top' },
      ],
    },
    { edges: [{ part: 'CH', edge: 'top' }, { part: 'JU', edge: 'top' }] },
    { edges: [{ part: 'CH', edge: 'left' }, { part: 'JO', edge: 'left' }] },
    { edges: [{ part: 'JU', edge: 'right' }, { part: 'JO', edge: 'right' }] },
  ],
  'choseong-jungseong-horizontal-jongseong': [
    {
      splitId: splitId('choseong-jungseong-horizontal-jongseong', 'y', 'ch-ju'),
      edges: [{ part: 'CH', edge: 'bottom' }, { part: 'JU', edge: 'top' }],
    },
    {
      splitId: splitId('choseong-jungseong-horizontal-jongseong', 'y', 'ju-jo'),
      edges: [{ part: 'JU', edge: 'bottom' }, { part: 'JO', edge: 'top' }],
    },
    { edges: [{ part: 'CH', edge: 'left' }, { part: 'JU', edge: 'left' }, { part: 'JO', edge: 'left' }] },
    { edges: [{ part: 'CH', edge: 'right' }, { part: 'JU', edge: 'right' }, { part: 'JO', edge: 'right' }] },
  ],
  'choseong-jungseong-mixed-jongseong': [
    {
      splitId: splitId('choseong-jungseong-mixed-jongseong', 'x', 'left-column-ju-v'),
      edges: [
        { part: 'CH', edge: 'right' }, { part: 'JU_H', edge: 'right' },
        { part: 'JU_V', edge: 'left' },
      ],
    },
    {
      splitId: splitId('choseong-jungseong-mixed-jongseong', 'y', 'ch-ju-h'),
      edges: [{ part: 'CH', edge: 'bottom' }, { part: 'JU_H', edge: 'top' }],
    },
    {
      splitId: splitId('choseong-jungseong-mixed-jongseong', 'y', 'upper-jo'),
      edges: [
        { part: 'JU_H', edge: 'bottom' }, { part: 'JU_V', edge: 'bottom' },
        { part: 'JO', edge: 'top' },
      ],
    },
    { edges: [{ part: 'CH', edge: 'left' }, { part: 'JU_H', edge: 'left' }, { part: 'JO', edge: 'left' }] },
    { edges: [{ part: 'CH', edge: 'top' }, { part: 'JU_V', edge: 'top' }] },
    { edges: [{ part: 'JU_V', edge: 'right' }, { part: 'JO', edge: 'right' }] },
  ],
}

export const LAYOUT_GRID_SPLIT_IDS: Readonly<Record<SharedLayoutType, readonly LayoutSplitId[]>> =
  Object.fromEntries(SHARED_LAYOUT_TYPES.map((layoutType) => [
    layoutType,
    LAYOUT_GRID_TOPOLOGIES[layoutType].splits.map((split) => split.id),
  ])) as unknown as Readonly<Record<SharedLayoutType, readonly LayoutSplitId[]>>

export const LAYOUT_GRID_SLOT_PARTS: Readonly<Record<SharedLayoutType, readonly Part[]>> =
  Object.fromEntries(
    SHARED_LAYOUT_TYPES.map((layoutType) => [layoutType, LAYOUT_GRID_TOPOLOGIES[layoutType].slots]),
  ) as Readonly<Record<SharedLayoutType, readonly Part[]>>
