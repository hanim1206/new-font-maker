// e2e는 이 컴퓨터 전체에서 한 번에 하나만 돈다(10-04부터, 전엔 워크트리마다 하나).
// 같은 워크트리끼리는 포트 서버와 `test-results/`를 같이 써서 겹치면 서로 죽이고, 다른 워크트리끼리는 포트는 달라도
// 컴퓨터 힘을 나눠 써서 화면이 늦게 떠 시간 초과로 실패한다(10-03 스모크 4개). 그래서 잠금을 모든 워크트리가 보는
// git 공용 폴더(`.git/e2e.lock`)에 두고, 나머지는 줄을 선다. 단위 테스트는 가벼워서 잠그지 않는다.
// playwright.config.ts가 러너 프로세스에서 부른다.
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
  const file = path.resolve(execSync('git rev-parse --git-common-dir', { encoding: 'utf8' }).trim(), 'e2e.lock')
  const here = path.basename(execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim())
  let told = false
  for (;;) {
    try {
      // `pid 워크트리` — 기다리는 쪽이 누가 돌리는지 알 수 있게.
      writeFileSync(file, `${process.pid} ${here}`, { flag: 'wx' })
      break
    } catch (error) {
      if (error.code !== 'EEXIST') throw error
      const [ownerText, ownerTree = '?'] = readFileSync(file, 'utf8').split(' ')
      const owner = Number(ownerText) || 0
      if (!owner || owner === process.pid || !alive(owner)) {
        // 죽은 실행이 남긴 잠금은 치운다.
        try { unlinkSync(file) } catch { /* 다른 쪽이 먼저 치움 */ }
        continue
      }
      if (!told) {
        console.log(`[e2e] 다른 e2e가 도는 중(${ownerTree}, pid ${owner}) — 컴퓨터 전체에서 하나씩이라 끝날 때까지 기다린다`)
        told = true
      }
      sleep(WAIT_MS)
    }
  }
  process.on('exit', () => {
    try {
      if (Number(readFileSync(file, 'utf8').split(' ')[0]) === process.pid) unlinkSync(file)
    } catch { /* 이미 없음 */ }
  })
}
