import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import type { ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import { slotOfFileName } from '../src-next/admin/testRunModel'
import type { TestRun, TestRunView } from '../src-next/admin/testRunModel'
import { rejectReasonOf } from './betaInviteApi'
import { testRunDir } from './testRuns/testRunStore'

/**
 * 관리자 `테스트` 메뉴가 테스트 실행 기록(`.git/test-runs/*.json`)을 읽는 곳. 읽기만 한다. 개발 서버에만 붙는다(`apply: 'serve'`).
 * 기록마다 쓰던 프로세스가 살아 있는지 붙여 준다 — 끝 표시 없이 죽었으면 화면이 `중단됨`으로 보인다.
 */

export const TEST_RUNS_API = '/api/test-runs'

function send(response: ServerResponse, status: number, body: unknown): void {
  response.statusCode = status
  response.setHeader('content-type', 'application/json; charset=utf-8')
  response.setHeader('cache-control', 'no-store')
  response.end(JSON.stringify(body))
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    // 권한이 없을 뿐이면 살아 있다.
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

export async function readTestRuns(dir: string): Promise<TestRunView[]> {
  const names = await readdir(dir).catch(() => [] as string[])
  const runs = await Promise.all(names.filter((name) => name.endsWith('.json')).map(async (name) => {
    try {
      const run = JSON.parse(await readFile(path.join(dir, name), 'utf8')) as TestRun
      // 이 기능 전 기록은 `full`이 없다.
      return { ...run, full: run.full ?? false, slot: slotOfFileName(name), alive: run.finishedAt === undefined && isAlive(run.pid) }
    } catch {
      return null // 쓰는 중이거나 깨진 파일은 건너뛴다.
    }
  }))
  return runs.filter((run): run is TestRunView => run !== null).sort((a, b) => b.startedAt - a.startedAt)
}

export function testRunApiPlugin(root: string): Plugin {
  return {
    name: 'test-run-api',
    apply: 'serve',
    configureServer(server) {
      const dir = testRunDir(root)
      server.middlewares.use(TEST_RUNS_API, async (request, response) => {
        const rejected = rejectReasonOf(request)
        if (rejected) return send(response, 403, { error: rejected })
        if (request.method !== 'GET') return send(response, 405, { error: 'GET만 받습니다.' })
        return send(response, 200, { runs: await readTestRuns(dir) })
      })
    },
  }
}
