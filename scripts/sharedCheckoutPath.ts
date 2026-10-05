import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'

/**
 * git에 없는 로컬 데이터(`.reference-fonts` 등)의 경로. 새 워크트리에는 이 폴더가 없어서
 * 개발 서버의 코퍼스 · 프리셋 API가 503을 내고 추출이 끝나지 않고 멈춘다. 그래서 여기에 없으면
 * 메인 체크아웃(git 공통 폴더의 부모)의 것을 쓰고, 거기에도 없으면 경고를 남긴다.
 */
export function sharedCheckoutPath(root: string, relative: string, warn: (message: string) => void = console.warn): string {
  const local = path.join(root, relative)
  if (existsSync(local)) return local
  try {
    const commonDir = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    const main = path.join(path.dirname(commonDir), relative)
    if (existsSync(main)) return main
  } catch {
    // git 저장소가 아니면 메인 체크아웃도 없다.
  }
  warn(`[dev] ${relative}가 없습니다. 이 폴더를 읽는 개발 서버 API는 503을 냅니다. 메인 체크아웃에 받아 두세요.`)
  return local
}

/**
 * `.env`가 있는 폴더. 새 워크트리에는 `.env`가 없어 계정 · 저장 테스트와 관리자 API가 빈 설정으로 돈다(피드백 58).
 * 여기에 없으면 메인 체크아웃의 것을 쓴다. 어디에도 없으면(클라우드 · CI) 조용히 이 폴더를 준다 — 설정 없이 도는 게 정상인 곳이다.
 */
export function sharedEnvDir(root: string): string {
  return path.dirname(sharedCheckoutPath(root, '.env', () => {}))
}
