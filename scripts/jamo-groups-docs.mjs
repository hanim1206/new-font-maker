#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * 구조군 표를 옵시디언 볼트로 내보낸다(거울).
 *
 * 출처는 레포의 `src/data/jamoLiteratureGroups.json` 하나이고, 볼트는 **읽기 전용**이다.
 * 자모별 노트 19+11장은 안 건드린다 — 사용자가 쓴 글과 `근거` 링크가 있는 곳이고, 그 머리말은 이제 옛 기록이다.
 * 쓰는 것은 표 한 장(`자모 데이터/자모 구조군 표.md`)뿐이다.
 *
 * 자동으로 돌지 않는다. 사용자가 `문서화해`라고 할 때만 손으로 돌린다.
 *   npm run jamo:groups:docs [-- --vault <경로>] [--dry]
 */

const VAULT = '/Users/hanim/Documents/Obsidian Vault/개인 프로젝트/폰트메이커/자모 데이터'
const CRITERIA = [
  ['initialHorizontalNoFinal', '가로모임 민글자 · 첫닿자'],
  ['initialHorizontal', '가로모임 받친글자 · 첫닿자'],
  ['initialVerticalNoFinal', '세로모임 민글자 · 첫닿자'],
  ['initialVertical', '세로모임 받친글자 · 첫닿자'],
  ['finalHorizontalMixed', '가로·섞임모임 · 받침닿자'],
  ['finalVertical', '세로모임 · 받침닿자'],
]

const args = process.argv.slice(2)
const flag = (name) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : null }
const vault = flag('--vault') ?? VAULT
const dry = args.includes('--dry')

const groups = JSON.parse(readFileSync(new URL('../src/data/jamoLiteratureGroups.json', import.meta.url), 'utf8'))
const jamos = Object.keys(groups)
const cell = (value) => value === undefined ? '—' : String(value)

const rows = jamos.map((jamo) => `| ${jamo} | ${CRITERIA.map(([key]) => cell(groups[jamo][key])).join(' | ')} | ${cell(groups[jamo].height)} | ${cell(groups[jamo].inkSpaceGroup)} |`)
const groupLists = CRITERIA.map(([key, label]) => {
  const byId = new Map()
  for (const jamo of jamos) {
    const id = groups[jamo][key]
    if (id === undefined) continue
    byId.set(id, [...(byId.get(id) ?? []), jamo])
  }
  const lines = [...byId.entries()].sort(([a], [b]) => a - b).map(([id, list]) => `${id}. ${list.join(' ')}`)
  return `### ${label}\n\n${lines.join('\n')}`
}).join('\n\n')

const doc = `---
project: 한글 폰트 메이커
스키마: 자모-구조군-표-v1
출처: src/data/jamoLiteratureGroups.json
---

# 자모 구조군 표

이 문서는 **레포에서 만든 거울**이다. 고치려면 \`src/data/jamoLiteratureGroups.json\`을 고치고 \`npm run jamo:groups:docs\`를 다시 돌린다.
자모별 노트(\`ㄱ.md\` …)의 \`문헌_\` 머리말은 이 표로 옮기기 전의 기록이라, 값이 다르면 **이 표가 맞다.**

이용제가 닿자의 면적·시각 공간·홀자와의 상대 위치로 단순화한 비교용 그룹이다. 홀자의 세부 형태와 닿자 끝맺음은 이 표만으로 설명되지 않는다.
같은 자모라도 홀자 자리와 받침 유무에 따라 묶음이 달라서 기준이 여섯이다. 겹받침은 첫닿자 자리가 없고, ㄸ·ㅃ·ㅉ는 받침 자리가 없다(\`—\`).

| 자모 | ${CRITERIA.map(([, label]) => label).join(' | ')} | 높이 | 속공간 |
|---|${CRITERIA.map(() => '---').join('|')}|---|---|
${rows.join('\n')}

## 묶음으로 보기

${groupLists}
`

const target = `${vault}/자모 구조군 표.md`
if (dry) {
  console.log(doc)
} else if (!existsSync(vault)) {
  console.error(`볼트 폴더가 없습니다: ${vault}`)
  process.exit(1)
} else {
  writeFileSync(target, doc)
  console.log(`썼습니다: ${target} (자모 ${jamos.length})`)
}
