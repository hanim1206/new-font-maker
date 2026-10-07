/**
 * 획으로 고칠 수 있는 숫자 · 기호(1차 범위: 숫자 + 기본 문장부호 · 괄호 · 수학). 영문은 아직 아니다.
 * 기호 홈(`/dashboard/symbol`)의 판 순서이고, 도마 `symbol`이 받는 글자다. 여기 없는 ASCII는 노토 윤곽 그대로.
 * 플랜: docs/plans/2026-10-08_숫자-기호-획-편집.md
 */

export const SYMBOL_GROUPS = [
  { id: 'digit', label: '숫자', chars: '0123456789' },
  { id: 'punct', label: '문장부호', chars: '.,!?:;\'"-~' },
  { id: 'bracket', label: '괄호', chars: '()[]{}<>' },
  { id: 'math', label: '수학', chars: '+=*/%#&@' },
] as const

export const SYMBOL_LIST: readonly string[] = SYMBOL_GROUPS.flatMap((group) => [...group.chars])

const SYMBOL_SET = new Set(SYMBOL_LIST)

export function isSymbolChar(char: string): boolean {
  return SYMBOL_SET.has(char)
}
