import path from 'node:path'
import type { File, Task, TaskResultPack } from 'vitest'
import type { Vitest } from 'vitest/node'
import type { Reporter } from 'vitest/reporters'
import { errorExcerpt } from '../../src-next/admin/testRunModel'
import { openTestRun } from './testRunStore'
import type { TestRunRecorder } from './testRunStore'

/**
 * vitest 실행을 관리자 `테스트` 메뉴용 기록으로 남긴다(항목 = 테스트 파일 하나, 이름 = 맨 위 describe). 기본 출력은 그대로 두고 덧붙인다(`vite.config.ts`).
 * 파일을 모으면 도는 중, 파일 결과가 오면 통과 · 실패, 끝나면 실패 메시지를 채운다.
 */
export default class TestRunVitestReporter implements Reporter {
  private ctx: Vitest | null = null
  private run: TestRunRecorder | null = null

  onInit(ctx: Vitest) {
    this.ctx = ctx
  }

  private relative(file: string) {
    return path.relative(this.ctx?.config.root ?? process.cwd(), file)
  }

  onPathsCollected(paths: string[] = []) {
    this.run = openTestRun('unit', paths.map((file) => ({ id: file, file: this.relative(file), title: path.basename(file) })))
  }

  onCollected(files: File[] = []) {
    for (const file of files) {
      // 이름은 파일 맨 위 describe(한글). 없으면 파일 이름 그대로.
      const title = file.tasks.find((task) => task.type === 'suite')?.name
      this.run?.update(file.filepath, { ...(title ? { title } : {}), ...(!file.result?.state || file.result.state === 'run' ? { status: 'running' as const } : {}) })
    }
  }

  onTaskUpdate(packs: TaskResultPack[]) {
    for (const [id, result] of packs) {
      const task = this.ctx?.state.idMap.get(id)
      // 파일 자체의 결과만 본다(파일 task는 `file`이 자기 자신).
      if (!task || task.file !== task || !result) continue
      const status = statusOf(result.state)
      if (status) this.run?.update(task.file.filepath, { status, durationMs: result.duration })
    }
  }

  onFinished(files: File[] = []) {
    for (const file of files) {
      const status = statusOf(file.result?.state) ?? 'skipped'
      this.run?.update(file.filepath, { status, durationMs: file.result?.duration, error: status === 'failed' ? failureOf(file) : undefined })
    }
    this.run?.finish()
  }
}

function statusOf(state: string | undefined) {
  if (state === 'pass') return 'passed' as const
  if (state === 'fail') return 'failed' as const
  if (state === 'skip' || state === 'todo') return 'skipped' as const
  return null
}

/** 파일의 실패 메시지: 불러오기 실패면 그것, 아니면 실패한 테스트 앞 셋. */
function failureOf(file: File): string {
  const fileError = file.result?.errors?.[0]
  if (fileError) return errorExcerpt(fileError.message ?? String(fileError))
  const failed: string[] = []
  const walk = (task: Task, names: string[]) => {
    if (failed.length >= 3) return
    const here = task === file ? names : [...names, task.name]
    if (task.type === 'test' && task.result?.state === 'fail') failed.push(`${here.join(' › ')}\n${errorExcerpt(task.result.errors?.[0]?.message ?? '', 4)}`)
    if (task.type === 'suite') for (const child of task.tasks) walk(child, here)
  }
  walk(file, [])
  return failed.join('\n\n')
}
