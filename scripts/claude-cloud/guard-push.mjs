#!/usr/bin/env node
// 클라우드 세션(자동 개선 루프)이 `claude/…` 밖으로 푸시 · 머지하지 못하게 막는 PreToolUse 훅.
// `.claude/settings.json`이 Bash 호출마다 부른다. 로컬 세션(CLAUDE_CODE_REMOTE가 true가 아님)은 그냥 지나간다.
// 막을 때는 exit 2 + stderr(Claude에게 이유가 전달된다). 플랜 `docs/plans/2026-10-03_자동-개선-루프-세팅.md`.
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const INTEGRATION = 'claude/main'
// 값이 따라오는 `git push` 옵션. 그 값은 원격 · 브랜치로 세지 않는다.
const PUSH_OPTIONS_WITH_VALUE = new Set(['-o', '--push-option', '--repo', '--receive-pack', '--exec'])
// 값이 따라오는 `git` 전역 옵션(`git -C 경로 push`).
const GIT_OPTIONS_WITH_VALUE = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace'])

const allowed = (branch) => branch.startsWith('claude/')

function tokens(segment) {
  return (segment.match(/"[^"]*"|'[^']*'|\S+/g) ?? []).map((token) => token.replace(/^["']|["']$/g, ''))
}

/** `git … push …` 한 토막이면 push 뒤의 토큰을, 아니면 null. */
function pushArgs(words) {
  let at = 0
  // 앞에 붙은 `VAR=값` · `env` · `command`는 넘긴다.
  while (at < words.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(words[at]) || words[at] === 'env' || words[at] === 'command')) at += 1
  if (words[at] !== 'git') return null
  at += 1
  while (at < words.length && words[at].startsWith('-')) at += GIT_OPTIONS_WITH_VALUE.has(words[at]) ? 2 : 1
  return words[at] === 'push' ? words.slice(at + 1) : null
}

function checkPush(args, currentBranch) {
  if (args.some((arg) => /[$`]/.test(arg))) return '푸시 대상을 변수 · 치환으로 주면 검사할 수 없다. 브랜치 이름을 그대로 적는다.'
  const refspecs = []
  let remoteSeen = false
  let force = false
  for (let at = 0; at < args.length; at += 1) {
    const arg = args[at]
    if (PUSH_OPTIONS_WITH_VALUE.has(arg)) { at += 1; continue }
    if (arg === '--all' || arg === '--mirror' || arg === '--branches') return `\`${arg}\`는 claude/ 밖 브랜치까지 올린다.`
    if (arg === '--delete' || arg === '-d' || arg === '--prune') return '브랜치를 지우는 푸시는 사람이 한다.'
    if (arg === '--force' || arg === '-f' || arg.startsWith('--force-with-lease') || arg.startsWith('--force-if-includes')) { force = true; continue }
    if (arg.startsWith('-')) continue
    if (!remoteSeen) { remoteSeen = true; continue }
    refspecs.push(arg)
  }
  const targets = (refspecs.length ? refspecs : ['HEAD']).map((refspec) => {
    if (refspec.startsWith('+')) force = true
    const spec = refspec.replace(/^\+/, '')
    if (spec.startsWith(':')) return { remove: true, branch: spec.slice(1) }
    const destination = spec.includes(':') ? spec.split(':')[1] : spec
    const branch = (destination === 'HEAD' || destination === '@' ? currentBranch : destination).replace(/^refs\/heads\//, '')
    return { branch }
  })
  for (const target of targets) {
    if (target.remove) return '브랜치를 지우는 푸시는 사람이 한다.'
    if (!target.branch) return '지금 브랜치를 알 수 없다. 푸시할 브랜치 이름을 적는다.'
    if (!allowed(target.branch)) return `\`${target.branch}\`에는 푸시하지 않는다. 자율 모드는 \`claude/…\` 브랜치에만 올린다(main · dev는 사람만).`
    if (force && target.branch === INTEGRATION) return `\`${INTEGRATION}\`에는 강제 푸시하지 않는다. 밤 확인을 건너뛴 날의 작업이 남아 있어야 한다.`
  }
  return null
}

function checkPrMerge(words, baseOf) {
  const at = words.indexOf('merge')
  if (words[0] !== 'gh' || words[1] !== 'pr' || at < 0) return null
  const target = words.slice(at + 1).find((word) => !word.startsWith('-')) ?? ''
  const base = baseOf(target)
  if (base === INTEGRATION) return null
  return `PR 머지는 base가 \`${INTEGRATION}\`인 것만 한다(이 PR의 base: ${base || '알 수 없음'}). main · dev로 가는 머지는 사람이 한다.`
}

/** `gh api`로 머지 · 브랜치 참조를 직접 건드리는 길. base를 확인할 수 없으니 통째로 막는다. */
function checkGhApi(words) {
  if (words[0] !== 'gh' || words[1] !== 'api') return null
  if (!words.some((word) => /\/(merge|merges|merge-upstream)\b|\/git\/refs|\/branches\/|\/rulesets|\/protection/.test(word))) return null
  return '`gh api`로 머지하거나 브랜치를 건드리지 않는다. 머지는 `gh pr merge`로, base가 `claude/main`인 PR만.'
}

/** 막을 이유를 돌려준다. 통과면 null. */
export function verdict(command, { currentBranch = '', baseOf = () => '' } = {}) {
  for (const segment of command.split(/&&|\|\||;|\||\n/)) {
    const words = tokens(segment.trim())
    const args = pushArgs(words)
    const reason = args ? checkPush(args, currentBranch) : checkPrMerge(words, baseOf) ?? checkGhApi(words)
    if (reason) return reason
  }
  return null
}

function run(command) {
  try { return execSync(command, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() } catch { return '' }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.env.CLAUDE_CODE_REMOTE !== 'true') process.exit(0)
  let command = ''
  try { command = JSON.parse(readFileSync(0, 'utf8')).tool_input?.command ?? '' } catch { process.exit(0) }
  const reason = verdict(command, {
    currentBranch: run('git rev-parse --abbrev-ref HEAD'),
    baseOf: (target) => (/^[\w./#:-]*$/.test(target) ? run(`gh pr view ${target} --json baseRefName --jq .baseRefName`) : ''),
  })
  if (reason) {
    console.error(`[자율 모드] 막음: ${reason}`)
    process.exit(2)
  }
}
