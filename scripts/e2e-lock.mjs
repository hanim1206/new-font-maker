// 한 워크트리에서 e2e는 한 번에 하나만 돈다. 같은 포트 서버와 `test-results/`를 같이 쓰기 때문에,
// 둘이 겹치면 먼저 끝난 쪽이 서버를 끄고 결과 폴더를 지워 다른 쪽이 통째로 죽는다.
// playwright.config.ts가 러너 프로세스에서 부른다. 잠금은 워크트리마다 git 폴더(`.git/worktrees/<이름>`)에 둔다.
import { execSync } from 'node:child_process'
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const WAIT_MS = 2000

const alive = (pid) => {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error.code === 'EPERM'
  }
}

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)

export function acquireE2eLock() {
  const file = path.resolve(execSync('git rev-parse --git-dir', { encoding: 'utf8' }).trim(), 'e2e.lock')
  let told = false
  for (;;) {
    try {
      writeFileSync(file, String(process.pid), { flag: 'wx' })
      break
    } catch (error) {
      if (error.code !== 'EEXIST') throw error
      const owner = Number(readFileSync(file, 'utf8')) || 0
      if (!owner || owner === process.pid || !alive(owner)) {
        // 죽은 실행이 남긴 잠금은 치운다.
        try { unlinkSync(file) } catch { /* 다른 쪽이 먼저 치움 */ }
        continue
      }
      if (!told) {
        console.log(`[e2e] 이 워크트리에서 다른 e2e(pid ${owner})가 도는 중 — 끝날 때까지 기다린다`)
        told = true
      }
      sleep(WAIT_MS)
    }
  }
  process.on('exit', () => {
    try {
      if (Number(readFileSync(file, 'utf8')) === process.pid) unlinkSync(file)
    } catch { /* 이미 없음 */ }
  })
}
