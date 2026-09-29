import { isDrawableName } from '../betaWelcome'

/** 메모 최대 길이. 초대 패널 · 상세 수정 · 서버가 같이 쓴다. */
export const MEMO_MAX_LENGTH = 200

/**
 * 닉네임이 쓸 수 있는지. 한글 1~6자(문장 줄에 그릴 수 있어야 한다), 다른 베타 계정과 겹치면 안 된다.
 * `taken`에는 자기 자신을 빼고 넘긴다. 괜찮으면 null.
 */
export function nicknameProblemOf(name: string, taken: Iterable<string | null>): string | null {
  const nickname = name.trim()
  if (!nickname) return '닉네임을 적어 주세요'
  if (!isDrawableName(nickname)) return '한글 1~6자'
  for (const other of taken) if (other === nickname) return '이미 있는 닉네임'
  return null
}
