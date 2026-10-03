#!/usr/bin/env node
// dev에 합친 직후 돌리는 스모크 묶음. 제품 화면의 큰 길 하나씩(1~2분).
// 스펙 파일은 그대로 두고 여기서 제목으로 고른다. 제목이 바뀌어 못 찾으면 돌리기 전에 멈춘다.
import { execFileSync, spawnSync } from 'node:child_process'

const SMOKE = [
  ['home-redirect', '앱을 열면 대시보드가 처음이고 글자 쿼리는 자소 화면으로 넘어간다'],
  ['dashboard-fonts-local', '편집 주소로 들어오면 첫 폰트가 생기고, 드로어에서 새로 만들고 다른 폰트로 바꿔 연다'],
  ['workspace-jamo-editor', '자소 탭 획 편집은 셸 안에서 문장·캔버스·도구 줄을 보여주고 획을 선택한다'],
  ['edit-shortcuts', '획을 Delete로 지우고, ⌘Z로 되돌리고, ⇧⌘Z로 다시 지우고, Ctrl+Z로 또 되돌린다. Esc는 선택을 푼다'],
  ['workspace-jamo-layout-drag-bar', '보선을 끄는 동안은 저장하지 않고, 손을 떼면 켠 옵션에 저장된다'],
  ['review-viewer', '자모 획을 고치면 그 자모가 든 칸의 글자가 바뀐다'],
  ['global-style-tone', '굵기는 100 단위로만 멈추고, 끄는 동안은 미리보기 · 손을 떼면 적용 · 되돌리기에 들어간다'],
  ['font-export-experience', '대시보드 카드에서 받으면 완료 페이지로 가고, ‹ 내 폰트로 대시보드에 돌아온다'],
  ['app-safety', '그리다 던지면 흰 화면 대신 오류 화면: 백업 받기 · 자세히 · 다시 불러오기'],
]

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

const result = spawnSync('npx', [...args, ...process.argv.slice(2)], { stdio: 'inherit' })
process.exit(result.status ?? 1)
