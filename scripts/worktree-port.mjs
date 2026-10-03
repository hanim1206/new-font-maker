#!/usr/bin/env node
// 워크트리마다 고정 포트 하나를 준다. 확인용 서버와 e2e가 같은 번호를 쓴다.
// 장부는 모든 워크트리가 함께 보는 git 공용 폴더(`.git/worktree-ports.json`)에 둔다.
//
//   node scripts/worktree-port.mjs         이 워크트리 포트 출력
//   node scripts/worktree-port.mjs serve   이 포트로 확인용 서버(로그인 게이트 끔) 띄우기
//   node scripts/worktree-port.mjs list    워크트리 · 브랜치 · 주소 · 켜짐 표
import { execSync, spawn } from 'node:child_process'
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'

// 4173 · 4191 · 4195 · 4197 · 4321처럼 손으로 쓰던 번호와 겹치지 않게 4201부터 준다.
const FIRST_PORT = 4201

const git = (args, cwd = process.cwd()) => execSync(`git ${args}`, { cwd, encoding: 'utf8' }).trim()

function registryPath() {
  return path.resolve(git('rev-parse --git-common-dir'), 'worktree-ports.json')
}

function readRegistry(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return {}
  }
}

function writeRegistry(file, registry) {
  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, `${JSON.stringify(registry, null, 2)}\n`)
  renameSync(tmp, file)
}

export function worktreePort(root = git('rev-parse --show-toplevel')) {
  const file = registryPath()
  const registry = readRegistry(file)
  if (registry[root]) return registry[root]
  // 지워진 워크트리 자리는 비운다.
  for (const dir of Object.keys(registry)) if (!existsSync(dir)) delete registry[dir]
  const used = new Set(Object.values(registry))
  let port = FIRST_PORT
  while (used.has(port)) port += 1
  registry[root] = port
  writeRegistry(file, registry)
  return port
}

export function listener(port) {
  try {
    const pid = execSync(`lsof -nP -iTCP:${port} -sTCP:LISTEN -t`, { encoding: 'utf8' }).trim().split('\n')[0]
    if (!pid) return null
    const cwd = execSync(`lsof -a -p ${pid} -d cwd -Fn`, { encoding: 'utf8' })
      .split('\n').find((line) => line.startsWith('n'))?.slice(1)
    return { pid, cwd }
  } catch {
    return null
  }
}

function list() {
  const worktrees = git('worktree list --porcelain')
    .split('\n\n')
    .map((block) => ({
      dir: block.match(/^worktree (.+)$/m)?.[1],
      branch: block.match(/^branch refs\/heads\/(.+)$/m)?.[1] ?? '(분리됨)',
    }))
    .filter((w) => w.dir)
  const rows = worktrees.map(({ dir, branch }) => {
    // 표에 나온 워크트리는 포트를 미리 받아 둔다.
    const port = worktreePort(dir)
    const on = listener(port)
    let state = on ? '켜짐' : '꺼짐'
    if (on && on.cwd !== dir) state = `다른 곳이 씀(${on.cwd})`
    return [path.basename(dir), branch, `http://127.0.0.1:${port}`, state]
  })
  const header = ['워크트리', '브랜치', '주소', '서버']
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)))
  for (const row of [header, ...rows]) console.log(row.map((cell, i) => cell.padEnd(widths[i])).join('  '))
}

function serve() {
  const root = git('rev-parse --show-toplevel')
  const port = worktreePort(root)
  const on = listener(port)
  if (on) {
    console.log(on.cwd === root
      ? `이미 켜져 있음: http://127.0.0.1:${port}/dashboard`
      : `포트 ${port}를 다른 곳이 쓰고 있음: ${on.cwd} (pid ${on.pid})`)
    process.exit(on.cwd === root ? 0 : 1)
  }
  console.log(`확인용 서버: http://127.0.0.1:${port}/dashboard`)
  const child = spawn('npm', ['run', 'dev:nogate', '--', '--port', String(port)], { cwd: root, stdio: 'inherit' })
  child.on('exit', (code) => process.exit(code ?? 0))
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2]
  if (command === 'serve') serve()
  else if (command === 'list') list()
  else console.log(worktreePort())
}
