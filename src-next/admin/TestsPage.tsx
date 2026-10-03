import { useEffect, useState } from 'react'
import { Circle, CircleCheck, CircleMinus, CircleX, LoaderCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TEST_RUNS_API, adminCall } from './adminApi'
import { TEST_KINDS, elapsedText, groupsOf, runStateOf, summaryOf } from './testRunModel'
import type { ItemStatus, RunState, TestKind, TestRunItem, TestRunView } from './testRunModel'

/** 도는 중이면 자주, 아니면 가끔 다시 읽는다(새 실행이 시작되면 알아채려고). */
const POLL_RUNNING_MS = 2000
const POLL_IDLE_MS = 10000

const STATE_LABEL: Record<RunState, string> = { running: '도는 중', passed: '통과', failed: '실패', stopped: '중단됨' }
const STATE_CLASS: Record<RunState, string> = {
  running: 'bg-info-soft text-info',
  passed: 'bg-success-soft text-success',
  failed: 'bg-destructive-soft text-destructive',
  stopped: 'bg-warning-soft text-warning',
}

function StatusIcon({ status }: { status: ItemStatus }) {
  const className = 'size-4 shrink-0'
  if (status === 'passed') return <CircleCheck className={`${className} text-success`} aria-label="통과" />
  if (status === 'failed') return <CircleX className={`${className} text-destructive`} aria-label="실패" />
  if (status === 'running') return <LoaderCircle className={`${className} animate-spin text-info`} aria-label="도는 중" />
  if (status === 'skipped') return <CircleMinus className={`${className} text-text-dim-5`} aria-label="건너뜀" />
  return <Circle className={`${className} text-text-dim-6`} aria-label="대기" />
}

function ItemRow({ item }: { item: TestRunItem }) {
  return <li className="flex flex-col gap-1 py-1.5" data-status={item.status}>
    <div className="flex items-center gap-2 text-sm">
      <StatusIcon status={item.status} />
      <span className={item.status === 'running' ? 'min-w-0 flex-1 font-semibold' : 'min-w-0 flex-1'}>{item.title}</span>
      {item.durationMs !== undefined && item.status !== 'running' && <span className="shrink-0 text-xs tabular-nums text-text-dim-5">{(item.durationMs / 1000).toFixed(1)}초</span>}
    </div>
    {item.error && <pre className="ml-6 overflow-x-auto whitespace-pre-wrap rounded-md bg-destructive-soft px-3 py-2 text-xs leading-relaxed text-destructive">{item.error}</pre>}
  </li>
}

function RunPanel({ run, others, onPick }: { run: TestRunView; others: TestRunView[]; onPick: (worktree: string) => void }) {
  const state = runStateOf(run)
  const summary = summaryOf(run)
  const elapsed = (run.finishedAt ?? Date.now()) - run.startedAt
  const percent = summary.total ? (summary.done / summary.total) * 100 : 0
  const running = run.items.filter((item) => item.status === 'running')

  return <div className="flex max-w-3xl flex-col gap-4" data-testid="admin-test-run" data-state={state}>
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <Badge className={STATE_CLASS[state]}>{STATE_LABEL[state]}</Badge>
      <strong className="text-base tabular-nums">{summary.done} / {summary.total}</strong>
      <span className="text-sm tabular-nums text-text-dim-4">
        통과 {summary.passed} · 실패 {summary.failed}{summary.skipped ? ` · 건너뜀 ${summary.skipped}` : ''} · {elapsedText(elapsed)}
      </span>
      <span className="ml-auto flex items-center gap-2 text-xs text-text-dim-5">
        {new Date(run.startedAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 시작
        {others.length > 1
          ? <Select value={run.worktree} onValueChange={onPick}>
            <SelectTrigger className="h-8 w-auto gap-2 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {others.map((other) => <SelectItem key={other.worktree} value={other.worktree}>{other.worktree} · {other.branch}</SelectItem>)}
            </SelectContent>
          </Select>
          : <span>{run.worktree} · {run.branch}</span>}
      </span>
    </div>

    <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
      <div className={`h-full rounded-full transition-all ${summary.failed ? 'bg-destructive' : 'bg-success'}`} style={{ width: `${percent}%` }} />
    </div>

    {running.length > 0 && <p className="text-sm text-text-dim-3">지금: <strong>{running.map((item) => item.title).join(' · ')}</strong></p>}

    {/* 스모크는 파일마다 하나라 묶지 않고 제목 아홉 줄 그대로. */}
    {run.kind === 'smoke' && <ul className="flex flex-col rounded-lg bg-surface-2 px-3.5 py-1">{run.items.map((item) => <ItemRow key={item.id} item={item} />)}</ul>}
    {run.kind !== 'smoke' && <div className="flex flex-col gap-1.5">
      {groupsOf(run).map((group) => {
        const done = group.items.filter((item) => item.status !== 'pending' && item.status !== 'running').length
        const failed = group.items.some((item) => item.status === 'failed')
        const busy = group.items.some((item) => item.status === 'running')
        // 단위 테스트는 폴더가 많아 접어 두고, 도는 중 · 실패만 펼친다.
        const open = run.kind !== 'unit' || failed || busy
        return <details key={group.name} open={open} className="rounded-lg bg-surface-2 px-3.5 py-2">
          <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
            {failed ? <StatusIcon status="failed" /> : busy ? <StatusIcon status="running" /> : done === group.items.length ? <StatusIcon status="passed" /> : <StatusIcon status="pending" />}
            <code className="min-w-0 flex-1 truncate">{group.name}</code>
            <span className="shrink-0 text-xs font-normal tabular-nums text-text-dim-5">{done} / {group.items.length}</span>
          </summary>
          <ul className="mt-1 flex flex-col">{group.items.map((item) => <ItemRow key={item.id} item={item} />)}</ul>
        </details>
      })}
    </div>}
  </div>
}

/**
 * 관리자 `테스트`: AI가 돌리는 단위 · 스모크 · e2e가 지금 어디까지 왔는지 본다. 보기만 한다(시작 단추 없음).
 * 기록은 리포터가 `.git/test-runs/`에 쓰고 개발 서버가 내준다. 워크트리 · 종류마다 마지막 실행 하나가 남는다.
 */
export function TestsPage() {
  const [runs, setRuns] = useState<TestRunView[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** 사용자가 고른 탭. 고르기 전에는 가장 최근 실행의 종류. */
  const [kind, setKind] = useState<TestKind | null>(null)
  /** 종류마다 고른 워크트리. 없으면 가장 최근 것. */
  const [picked, setPicked] = useState<Partial<Record<TestKind, string>>>({})

  useEffect(() => {
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const tick = async () => {
      let busy = false
      try {
        const body = await adminCall<{ runs: TestRunView[] }>(TEST_RUNS_API)
        if (stopped) return
        setRuns(body.runs)
        setError(null)
        busy = body.runs.some((run) => runStateOf(run) === 'running')
      } catch (caught) {
        if (stopped) return
        setError(caught instanceof Error ? caught.message : String(caught))
      }
      timer = setTimeout(tick, busy ? POLL_RUNNING_MS : POLL_IDLE_MS)
    }
    void tick()
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [])

  if (error && !runs) return <p className="text-sm text-destructive">{error}</p>
  if (!runs) return <p className="text-sm text-text-dim-4">불러오는 중…</p>
  if (!runs.length) return <p className="text-sm text-text-dim-4" data-testid="admin-tests-empty">아직 기록이 없어요. 테스트가 한 번 돌면 여기 생겨요.</p>

  const active = kind ?? runs[0].kind
  const runsOf = (key: TestKind) => runs.filter((run) => run.kind === key)

  return <Tabs value={active} onValueChange={(value) => setKind(value as TestKind)} className="flex flex-col gap-4" data-testid="admin-tests">
    <TabsList className="self-start">
      {TEST_KINDS.map(({ key, label }) => {
        const latest = runsOf(key)[0]
        return <TabsTrigger key={key} value={key} disabled={!latest}>
          {label}
          {latest && runStateOf(latest) === 'running' && <LoaderCircle className="size-3 animate-spin text-info" />}
          {latest && runStateOf(latest) === 'failed' && <CircleX className="size-3 text-destructive" />}
        </TabsTrigger>
      })}
    </TabsList>
    {TEST_KINDS.map(({ key }) => {
      const list = runsOf(key)
      const run = list.find((item) => item.worktree === picked[key]) ?? list[0]
      return <TabsContent key={key} value={key}>
        {run && <RunPanel run={run} others={list} onPick={(worktree) => setPicked((prev) => ({ ...prev, [key]: worktree }))} />}
      </TabsContent>
    })}
    {error && <p className="text-xs text-text-dim-5">다시 읽지 못했어요: {error}</p>}
  </Tabs>
}
