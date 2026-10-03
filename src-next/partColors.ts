import type { Part } from '../src/types'
import { EDIT_COLOR } from './editColors'

/** 부품 색. 검수 캔버스·자소 탭 캔버스·카드가 같은 색으로 상자·기준선을 칠한다. */
export const PART_COLOR: Record<Part, string> = { CH: EDIT_COLOR.editSlotCh, JU: EDIT_COLOR.editSlotJu, JU_H: EDIT_COLOR.editSlotJu, JU_V: EDIT_COLOR.editSlotJu, JO: EDIT_COLOR.editSlotJo }
export const PART_LABEL: Record<Part, string> = { CH: '첫닿자', JU: '홀자', JU_H: '홀자 가로부', JU_V: '홀자 세로부', JO: '받침' }
/** 비활성 부품 회색. */
export const INACTIVE_PART_COLOR = EDIT_COLOR.editSlotOff
