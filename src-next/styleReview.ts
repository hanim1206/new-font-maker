/**
 * 스타일가이드 검토판(docs/plans/2026-10-03_스타일가이드-검토판.md). 항목마다 확정 · 요청 · 안 봄.
 * 기록은 `src-next/style-review.json` 하나 — 화면은 개발 서버 플러그인(`scripts/styleReviewApi.ts`)으로 쓰고, AI는 같은 파일을 읽는다.
 * 확정 · 요청할 때 그 항목의 지문을 같이 적는다. 코드가 바뀌어 지문이 달라지면 저절로 `안 봄`(고침)으로 돌아간다.
 */

export type ReviewMark = 'ok' | 'request'

export interface ReviewRecord {
  mark: ReviewMark
  /** 확정 · 요청할 때의 지문. */
  fingerprint: string
  /** ISO 날짜. */
  at: string
  /** 요청 내용. 확정이면 비어 있다. */
  note?: string
}

export interface ReviewFile {
  version: 1
  items: Record<string, ReviewRecord>
}

export const EMPTY_REVIEW: ReviewFile = { version: 1, items: {} }

/** 화면에 보이는 상태. `changed`는 기록이 있지만 그 뒤 코드가 바뀐 것(다시 봐야 함). */
export type ReviewStatus = 'ok' | 'request' | 'unseen' | 'changed'

export function reviewStatusOf(record: ReviewRecord | undefined, fingerprint: string): ReviewStatus {
  if (!record) return 'unseen'
  if (record.fingerprint !== fingerprint) return 'changed'
  return record.mark
}

/** 짧은 지문(djb2). 같은 글이면 같은 값 — 암호용이 아니다. */
export function fingerprintOf(...parts: string[]): string {
  let hash = 5381
  for (const char of parts.join('\u0000')) hash = ((hash << 5) + hash + char.charCodeAt(0)) >>> 0
  return hash.toString(36)
}

export function isReviewFile(value: unknown): value is ReviewFile {
  if (!value || typeof value !== 'object') return false
  const file = value as ReviewFile
  if (file.version !== 1 || !file.items || typeof file.items !== 'object') return false
  return Object.values(file.items).every((record) => record && (record.mark === 'ok' || record.mark === 'request') && typeof record.fingerprint === 'string' && typeof record.at === 'string')
}

/** 한 항목을 확정 · 요청하거나(`mark`) 기록을 지운다(`null`). 새 파일을 돌려준다. */
export function applyReview(file: ReviewFile, id: string, change: { mark: ReviewMark; fingerprint: string; note?: string; at: string } | null): ReviewFile {
  const items = { ...file.items }
  if (!change) delete items[id]
  else items[id] = { mark: change.mark, fingerprint: change.fingerprint, at: change.at, ...(change.mark === 'request' && change.note?.trim() ? { note: change.note.trim() } : {}) }
  return { version: 1, items: Object.fromEntries(Object.entries(items).sort(([a], [b]) => a.localeCompare(b))) }
}

export function serializeReview(file: ReviewFile): string {
  return `${JSON.stringify(file, null, 2)}\n`
}
