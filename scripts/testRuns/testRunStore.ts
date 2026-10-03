import { execFileSync } from 'node:child_process'
import { mkdirSync, renameSync, writeFileSync } from 'node:fs'
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

export function openTestRun(kind: TestKind, items: Omit<TestRunItem, 'status'>[], cwd = process.cwd()): TestRunRecorder {
  let file: string | null = null
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
      items: items.map((item) => ({ ...item, status: 'pending' })),
    }
    file = path.join(dir, runFileName(run.worktree, kind))
  } catch (error) {
    console.warn(`[test-runs] 기록을 못 엽니다: ${error instanceof Error ? error.message : error}`)
  }
  const byId = new Map(run?.items.map((item) => [item.id, item]))

  const write = () => {
    if (!file || !run) return
    try {
      const tmp = `${file}.${process.pid}.tmp`
      writeFileSync(tmp, JSON.stringify(run))
      renameSync(tmp, file)
    } catch {
      // 기록 못 해도 테스트는 계속한다.
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
