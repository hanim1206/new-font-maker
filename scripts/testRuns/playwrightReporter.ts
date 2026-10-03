import path from 'node:path'
import type { FullConfig, Reporter, Suite, TestCase, TestResult } from '@playwright/test/reporter'
import { errorExcerpt } from '../../src-next/admin/testRunModel'
import { openTestRun } from './testRunStore'
import type { TestRunRecorder } from './testRunStore'

/**
 * playwright 실행을 관리자 `테스트` 메뉴용 기록으로 남긴다(항목 = 테스트 하나). `line` 출력은 그대로 두고 덧붙인다.
 * 스모크 묶음은 `scripts/e2e-smoke.mjs`가 `TEST_RUN_KIND=smoke`를 붙여 부른다. `--list`는 돌리지 않으니 기록하지 않는다.
 */
export default class TestRunPlaywrightReporter implements Reporter {
  private run: TestRunRecorder | null = null

  printsToStdio() {
    return false
  }

  onBegin(config: FullConfig, suite: Suite) {
    if (process.argv.includes('--list')) return
    const kind = process.env.TEST_RUN_KIND === 'smoke' ? 'smoke' : 'e2e'
    this.run = openTestRun(kind, suite.allTests().map((test) => ({
      id: test.id,
      file: path.relative(config.rootDir, test.location.file),
      // ['', 프로젝트, 파일, …describe, 제목]
      title: test.titlePath().slice(3).join(' › ') || test.title,
    })))
  }

  onTestBegin(test: TestCase) {
    this.run?.update(test.id, { status: 'running' })
  }

  onTestEnd(test: TestCase, result: TestResult) {
    const outcome = test.outcome()
    // 다시 돌릴 차례가 남았으면 아직 도는 중이다.
    const retrying = outcome === 'unexpected' && result.retry < test.retries
    const status = retrying ? 'running' : outcome === 'skipped' ? 'skipped' : outcome === 'unexpected' ? 'failed' : 'passed'
    this.run?.update(test.id, {
      status,
      durationMs: result.duration,
      error: status === 'failed' ? errorExcerpt(result.error?.message ?? result.status) : undefined,
    })
  }

  onEnd() {
    this.run?.finish()
  }
}
