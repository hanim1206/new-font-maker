import { execFileSync } from 'node:child_process'
import { mkdirSync, renameSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { runFileName } from '../../src-next/admin/testRunModel'
import type { TestKind, TestRun, TestRunItem } from '../../src-next/admin/testRunModel'

/**
 * 테스트 실행 기록을 git 공용 폴더(`.git/test-runs/`)에 쓴다. 워크트리가 여럿이어도 한 곳이라
 * 어느 워크트리의 개발 서버 관리자 화면에서든 전부 보인다(`worktree-ports.json`과 같은 자리).
 * 기록이 실패해도 테스트는 멈추지 않는다.
 */

const git = (args: string[], cwd: string) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()

export function testRunDir(cwd = process.cwd()): string {
  return path.join(git(['rev-parse', '--path-format=absolute', '--git-common-dir'], cwd), 'test-runs')
}

export interface TestRunRecorder {
  update(id: string, patch: Partial<Omit<TestRunItem, 'id'>>): void
  finish(): void
}

/** 고르는 옵션(이름 · 파일 거르기). 이게 있으면 전체 실행이 아니다. */
const FILTER_FLAGS = /^(-t|--testNamePattern|-g|--grep|--grep-invert|--last-failed|--only-changed|--changed|--shard|--project)(=|$)/

/**
 * 거르지 않은 실행인가. 명령 뒤 글자가 전부 있는 폴더(`vitest run src src-next`)이거나 없으면 전체.
 * 파일 · 부분 이름 · 모르는 값이 하나라도 있으면 전체가 아니라고 본다(헷갈리면 전체 칸을 안 덮는 쪽).
 */
export function isFullRun(args: string[], cwd = process.cwd()): boolean {
  const [first, ...rest] = args
  const tokens = ['run', 'test', 'watch'].includes(first) ? rest : args
  if (first === 'related') return false
  return tokens.every((token) => {
    if (token.startsWith('-')) return !FILTER_FLAGS.test(token)
    try {
      return statSync(path.resolve(cwd, token)).isDirectory()
    } catch {
      return false
    }
  })
}

export function openTestRun(kind: TestKind, items: Omit<TestRunItem, 'status'>[], { full, cwd = process.cwd() }: { full: boolean; cwd?: string }): TestRunRecorder {
  let file: string | null = null
  let fullFile: string | null = null
  let run: TestRun | null = null
  try {
    const root = git(['rev-parse', '--show-toplevel'], cwd)
    const dir = testRunDir(cwd)
    mkdirSync(dir, { recursive: true })
    run = {
      kind,
      worktree: path.basename(root),
      branch: git(['rev-parse', '--abbrev-ref', 'HEAD'], cwd),
      pid: process.pid,
      startedAt: Date.now(),
      full,
      items: items.map((item) => ({ ...item, status: 'pending' })),
    }
    file = path.join(dir, runFileName(run.worktree, kind))
    // 전체 실행은 `마지막 전체` 칸에도 쓴다. 파일 몇 개만 돌려도 이 칸은 남는다.
    if (full) fullFile = path.join(dir, runFileName(run.worktree, kind, 'full'))
  } catch (error) {
    console.warn(`[test-runs] 기록을 못 엽니다: ${error instanceof Error ? error.message : error}`)
  }
  const byId = new Map(run?.items.map((item) => [item.id, item]))

  const write = () => {
    if (!run) return
    const text = JSON.stringify(run)
    for (const target of [file, fullFile]) {
      if (!target) continue
      try {
        const tmp = `${target}.${process.pid}.tmp`
        writeFileSync(tmp, text)
        renameSync(tmp, target)
      } catch {
        // 기록 못 해도 테스트는 계속한다.
      }
    }
  }
  write()

  return {
    update(id, patch) {
      const item = byId.get(id)
      if (!item) return
      Object.assign(item, patch)
      write()
    },
    finish() {
      if (!run) return
      // 끝났는데 아직 도는 중 · 대기로 남은 것(필터로 빠짐 · 중단)은 건너뜀으로 닫는다.
      for (const item of run.items) if (item.status === 'pending' || item.status === 'running') item.status = 'skipped'
      run.finishedAt = Date.now()
      write()
    },
  }
}
