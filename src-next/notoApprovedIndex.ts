import { approvedNotoInputs } from './notoBoundMaster'
import type { ApprovedNotoInput } from './notoBoundMaster'

/** 승인 측정(사용자가 확인한 기준선 입력) 글자 인덱스. 검수 격자와 레이아웃 편집부가 같이 쓴다. */

// 승인 번들은 모듈 상수라 codepoint 인덱스를 한 번만 만든다. 번들이 깨졌으면 전부 실측만으로 둔다.
const approvedByCodepoint: ReadonlyMap<number, ApprovedNotoInput> = (() => {
  try { return new Map(approvedNotoInputs().map((entry) => [entry.identity.codepoint, entry])) } catch { return new Map() }
})()
export const approvedCount = approvedByCodepoint.size
export const isApproved = (codepoint: number) => approvedByCodepoint.has(codepoint)
export const approvedInputFor = (codepoint: number): ApprovedNotoInput | null => approvedByCodepoint.get(codepoint) ?? null
