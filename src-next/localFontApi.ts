import type { FontData } from '../src/types/database'
import type { ApiResult, FontRow, FontSummary } from './accountFontApi'

/**
 * 로그인 게이트가 꺼진 개발 서버의 `font_projects`. 서버 대신 localStorage 한 키에 폰트 목록(이름 · 데이터 · 때)을 둔다.
 * 계정 저장과 같은 규칙(한도 3 · 소프트 삭제 · 추출 버전)이라 메인 화면 `내 폰트`와 편집 화면이 dev에서도 같은 길을 탄다.
 * 스토어를 가져오지 않는다. 브라우저 사본(`LOCAL_FONT_KEYS`)과는 다른 키다 — 이 키가 "서버"다.
 */

export const LOCAL_FONTS_KEY = 'font-maker-local-fonts-v1'
/** 게이트가 꺼졌을 때의 계정 id. 사본 이름표(`owner`)에도 이 값을 쓴다. */
export const LOCAL_OWNER = 'local'
const LIMIT = 3

interface LocalFontRecord {
  id: string
  name: string
  fontData: unknown
  updatedAt: string
  deletedAt: string | null
  exportRevision: number
}

function readAll(): LocalFontRecord[] {
  try {
    const value = JSON.parse(localStorage.getItem(LOCAL_FONTS_KEY) ?? '[]') as unknown
    return Array.isArray(value) ? (value as LocalFontRecord[]) : []
  } catch {
    return []
  }
}

function writeAll(records: LocalFontRecord[]): ApiResult<null> {
  try {
    localStorage.setItem(LOCAL_FONTS_KEY, JSON.stringify(records))
    return { ok: true, value: null }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : '브라우저 저장 공간이 찼어요.' }
  }
}

const live = (records: LocalFontRecord[]) => records.filter((record) => record.deletedAt === null)
const now = () => new Date().toISOString()
const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)

export async function listFonts(): Promise<ApiResult<FontSummary[]>> {
  const fonts = live(readAll()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  return { ok: true, value: fonts.map(({ id, name, updatedAt }) => ({ id, name, updatedAt })) }
}

export async function fetchFont(fontId: string): Promise<ApiResult<FontRow | null>> {
  const found = live(readAll()).find((record) => record.id === fontId)
  return { ok: true, value: found ? { id: found.id, name: found.name, fontData: found.fontData, updatedAt: found.updatedAt } : null }
}

export async function createFont(name: string, fontData: FontData): Promise<ApiResult<{ id: string; updatedAt: string | null }>> {
  const records = readAll()
  if (live(records).length >= LIMIT) return { ok: false, message: 'font-limit', limit: true }
  const record: LocalFontRecord = { id: newId(), name, fontData, updatedAt: now(), deletedAt: null, exportRevision: 0 }
  const written = writeAll([...records, record])
  return written.ok ? { ok: true, value: { id: record.id, updatedAt: record.updatedAt } } : written
}

export async function saveFont(fontId: string, fontData: FontData, expectedUpdatedAt: string | null = null): Promise<ApiResult<string | null>> {
  const records = readAll()
  const found = live(records).find((record) => record.id === fontId)
  if (!found) return { ok: false, message: '이 기기의 폰트를 찾지 못했습니다(지웠을 수 있어요).' }
  if (expectedUpdatedAt && found.updatedAt !== expectedUpdatedAt) return { ok: false, conflict: true, message: '다른 탭에서 먼저 저장했어요.' }
  found.fontData = fontData
  found.updatedAt = now()
  const written = writeAll(records)
  return written.ok ? { ok: true, value: found.updatedAt } : written
}

export async function renameFont(fontId: string, name: string): Promise<ApiResult<null>> {
  const records = readAll()
  const found = records.find((record) => record.id === fontId)
  if (found) found.name = name
  return writeAll(records)
}

export async function deleteFont(fontId: string): Promise<ApiResult<null>> {
  const records = readAll()
  const found = records.find((record) => record.id === fontId)
  if (found) found.deletedAt = now()
  return writeAll(records)
}

export async function bumpExportRevision(fontId: string): Promise<ApiResult<number>> {
  const records = readAll()
  const found = records.find((record) => record.id === fontId)
  if (!found) return { ok: false, message: '이 기기의 폰트를 찾지 못했습니다.' }
  found.exportRevision = (found.exportRevision ?? 0) + 1
  const written = writeAll(records)
  return written.ok ? { ok: true, value: found.exportRevision } : written
}
