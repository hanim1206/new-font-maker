/**
 * 관리자 `테스트` 메뉴가 보는 테스트 실행 기록. vitest · playwright 리포터(`scripts/testRuns/`)가 쓰고,
 * 개발 서버(`scripts/testRunApi.ts`)가 내주고, 화면(`TestsPage.tsx`)이 그린다. 셋이 같은 모양을 여기서 가져간다.
 */

export type TestKind = 'unit' | 'smoke' | 'e2e'
export type ItemStatus = 'pending' | 'running' | 'passed' | 'failed' | 'skipped'
/** 실행 하나의 상태. `stopped` = 끝 표시 없이 프로세스가 사라짐(중간에 끊김). */
export type RunState = 'running' | 'passed' | 'failed' | 'stopped'

export const TEST_KINDS: { key: TestKind; label: string }[] = [
  { key: 'unit', label: '단위' },
  { key: 'smoke', label: '스모크' },
  { key: 'e2e', label: 'e2e' },
]

/** 항목 하나. 단위 테스트는 파일 하나, e2e · 스모크는 테스트 하나. */
export interface TestRunItem {
  id: string
  /** 레포 기준 경로. */
  file: string
  title: string
  status: ItemStatus
  durationMs?: number
  /** 실패 메시지 앞 몇 줄. */
  error?: string
}

export interface TestRun {
  kind: TestKind
  /** 워크트리 폴더 이름(메인 체크아웃은 레포 이름). */
  worktree: string
  branch: string
  pid: number
  startedAt: number
  finishedAt?: number
  items: TestRunItem[]
}

/** 서버가 내줄 때 붙이는 것: 쓰던 프로세스가 아직 살아 있나. */
export interface TestRunView extends TestRun {
  alive: boolean
}

export interface RunSummary {
  total: number
  done: number
  passed: number
  failed: number
  skipped: number
}

export function summaryOf(run: TestRun): RunSummary {
  const count = (status: ItemStatus) => run.items.filter((item) => item.status === status).length
  const passed = count('passed')
  const failed = count('failed')
  const skipped = count('skipped')
  return { total: run.items.length, done: passed + failed + skipped, passed, failed, skipped }
}

export function runStateOf(run: TestRunView): RunState {
  if (run.finishedAt === undefined) return run.alive ? 'running' : 'stopped'
  return run.items.some((item) => item.status === 'failed') ? 'failed' : 'passed'
}

export interface ItemGroup {
  /** 단위 테스트는 폴더, e2e · 스모크는 스펙 파일. */
  name: string
  items: TestRunItem[]
}

/** 목록을 묶는다. 처음 나온 순서를 지킨다. */
export function groupsOf(run: TestRun): ItemGroup[] {
  const groups = new Map<string, TestRunItem[]>()
  for (const item of run.items) {
    const name = run.kind === 'unit' ? item.file.slice(0, Math.max(0, item.file.lastIndexOf('/'))) || '.' : item.file
    const list = groups.get(name)
    if (list) list.push(item)
    else groups.set(name, [item])
  }
  return [...groups].map(([name, items]) => ({ name, items }))
}

/** 걸린 시간 `m:ss`. */
export function elapsedText(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

/** 실패 메시지를 화면에 맞게 줄인다: 색 코드 빼고 앞 몇 줄만. */
export function errorExcerpt(message: string, lines = 8): string {
  const plain = message.replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g'), '')
  const kept = plain.split('\n').slice(0, lines)
  return kept.join('\n').trimEnd()
}

/** 기록 파일 이름. 워크트리 · 종류마다 마지막 실행 하나. */
export const runFileName = (worktree: string, kind: TestKind) => `${worktree}.${kind}.json`
