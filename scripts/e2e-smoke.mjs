#!/usr/bin/env node
// dev에 합친 직후 돌리는 스모크 묶음. 제품 화면의 큰 길 하나씩(1~2분).
// 스펙 파일은 그대로 두고 여기서 제목으로 고른다. 제목이 바뀌어 못 찾으면 돌리기 전에 멈춘다.
import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

// 목록은 `smoke-list.json` 한 곳(관리자 `테스트` 메뉴도 같은 목록을 보여 준다).
const SMOKE = JSON.parse(readFileSync(new URL('./smoke-list.json', import.meta.url), 'utf8')).map(({ file, title }) => [file.replace(/^tests\/e2e\/|\.spec\.ts$/g, ''), title])

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const files = SMOKE.map(([file]) => `tests/e2e/${file}.spec.ts`)
const grep = SMOKE.map(([, title]) => escape(title)).join('|')
const args = ['playwright', 'test', ...files, '--grep', grep]

const listed = execFileSync('npx', [...args, '--list'], { encoding: 'utf8' })
const missing = SMOKE.filter(([, title]) => !listed.includes(title))
if (missing.length) {
  console.error('스모크 제목을 못 찾음(스펙 제목이 바뀌었나?):')
  for (const [file, title] of missing) console.error(`  ${file}: ${title}`)
  process.exit(1)
}

// 관리자 `테스트` 메뉴가 e2e 전체와 따로 보이게 스모크라고 표시한다.
const result = spawnSync('npx', [...args, ...process.argv.slice(2)], { stdio: 'inherit', env: { ...process.env, TEST_RUN_KIND: 'smoke' } })
process.exit(result.status ?? 1)
