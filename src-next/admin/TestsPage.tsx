import { useEffect, useRef, useState } from 'react'
import { Circle, CircleCheck, CircleMinus, CircleX, LoaderCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { ChoiceGroup, ChoiceItem } from '@/components/ui/choice-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TEST_RUNS_API, adminCall } from './adminApi'
import { E2E_GROUP_ORDER, TEST_NOTES, UNIT_SUBGROUP_ORDER } from './testNotes'
import SMOKE_LIST from '../../scripts/smoke-list.json'
import { TEST_KINDS, elapsedText, groupsOf, runStateOf, summaryOf, withCatalog } from './testRunModel'
import type { CatalogEntry, ItemStatus, RunState, TestKind, TestRunItem, TestRunView } from './testRunModel'

/** 도는 중이면 자주, 아니면 가끔 다시 읽는다(새 실행이 시작되면 알아채려고). */
const POLL_RUNNING_MS = 2000
const POLL_IDLE_MS = 10000

/** 돌린 기록과 상관없이 늘 보이는 전체 목록. 단위 · e2e는 설명 표(`testNotes.ts`), 스모크는 스모크 목록. */
const NOTE_ENTRIES = Object.entries(TEST_NOTES).map(([file, [title]]) => ({ file, title }))
const CATALOG: Record<TestKind, CatalogEntry[]> = {
  unit: NOTE_ENTRIES.filter((entry) => !entry.file.startsWith('tests/')),
  smoke: SMOKE_LIST,
  e2e: NOTE_ENTRIES.filter((entry) => entry.file.startsWith('tests/e2e/')),
}

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
  if (status === 'none') return <Circle className={`${className} text-text-dim-6 opacity-50`} aria-label="안 돌림" />
  return <Circle className={`${className} text-text-dim-6`} aria-label="대기" />
}

/** 이름 아래 회색 한 줄: 무엇을 검사하나 · 목적. */
function NoteLine({ file }: { file: string }) {
  const note = TEST_NOTES[file]
  if (!note) return null
  return <p className="ml-6 text-xs font-normal leading-relaxed text-text-dim-4">
    {note[1]} <span className="text-text-dim-6">· {note[2]}</span>
  </p>
}

function ItemRow({ item, showFile, showNote }: { item: TestRunItem; showFile?: boolean; showNote?: boolean }) {
  // 도는 줄은 파란 바탕으로 켠다.
  return <li className={`-mx-2 flex flex-col gap-0.5 rounded-md px-2 py-1.5 transition-colors ${item.status === 'running' ? 'bg-info-soft' : ''}`} data-status={item.status}>
    <div className="flex items-center gap-2 text-sm">
      <StatusIcon status={item.status} />
      <span className={item.status === 'running' ? 'min-w-0 flex-1 font-semibold' : 'min-w-0 flex-1'}>
        {item.title}
        {showFile && <code className="ml-2 text-xs font-normal text-text-dim-5">{item.file.split('/').pop()}</code>}
      </span>
      {/* 0.1초 안쪽은 `0.0초`만 늘어서 뺀다. */}
      {item.durationMs !== undefined && item.durationMs >= 100 && item.status !== 'running' && <span className="shrink-0 text-xs tabular-nums text-text-dim-5">{(item.durationMs / 1000).toFixed(1)}초</span>}
    </div>
    {showNote && <NoteLine file={item.file} />}
    {item.error && <pre className="ml-6 overflow-x-auto whitespace-pre-wrap rounded-md bg-destructive-soft px-3 py-2 text-xs leading-relaxed text-destructive">{item.error}</pre>}
  </li>
}

function RunHeader({ run, others, onPick }: { run: TestRunView; others: TestRunView[]; onPick: (worktree: string) => void }) {
  const state = runStateOf(run)
  const summary = summaryOf(run)
  const elapsed = (run.finishedAt ?? Date.now()) - run.startedAt
  const percent = summary.total ? (summary.done / summary.total) * 100 : 0
  const running = run.items.filter((item) => item.status === 'running')

  return <div className="flex flex-col gap-4" data-testid="admin-test-run" data-state={state}>
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <Badge className={STATE_CLASS[state]}>{STATE_LABEL[state]}</Badge>
      <span className="text-sm tabular-nums text-text-dim-3">
        {summary.total}개 중 <strong className="text-foreground">{summary.done}개 끝남</strong> · 통과 {summary.passed} · 실패 {summary.failed}{summary.skipped ? ` · 건너뜀 ${summary.skipped}` : ''} · {elapsedText(elapsed)}
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
  </div>
}

function groupStatusOf(items: TestRunItem[]): ItemStatus {
  if (items.some((item) => item.status === 'failed')) return 'failed'
  if (items.some((item) => item.status === 'running')) return 'running'
  if (items.every((item) => item.status === 'none')) return 'none'
  if (items.every((item) => item.status === 'passed' || item.status === 'skipped')) return 'passed'
  return 'pending'
}

/** 단위 테스트 갈래 하나를 소묶음으로 나눈다(흐름 순서). 소묶음 표에 없는 것은 끝에 이름 없이. */
function subgroupsOf(category: string, items: TestRunItem[]): { name: string; items: TestRunItem[] }[] {
  const order = UNIT_SUBGROUP_ORDER[category] ?? []
  const named = order.map((name) => ({ name, items: items.filter((item) => TEST_NOTES[item.file]?.[3] === name) }))
  const rest = items.filter((item) => !order.includes(TEST_NOTES[item.file]?.[3] ?? ''))
  return [...named, { name: '', items: rest }].filter((sub) => sub.items.length)
}

/** 전체 목록. 기록이 있으면 상태를 겹쳐 보인다. */
function TestList({ kind, items }: { kind: TestKind; items: TestRunItem[] }) {
  // 스모크는 파일마다 하나라 묶지 않고 제목 아홉 줄 그대로.
  if (kind === 'smoke') return <ul className="flex flex-col rounded-lg bg-surface-2 px-3.5 py-1">{items.map((item) => <ItemRow key={item.id} item={item} showNote />)}</ul>
  const renderGroup = (group: { name: string; items: TestRunItem[] }) => {
      // e2e에서 한 번도 안 돌린 파일은 제목 없는 빈 줄 하나뿐이다.
      const tests = group.items.filter((item) => item.title)
      const done = tests.filter((item) => item.status !== 'none' && item.status !== 'pending' && item.status !== 'running').length
      const status = groupStatusOf(group.items)
      // 단위 테스트는 갈래마다 접어 두고 도는 중 · 실패만 펼친다. e2e는 파일마다 접어 둔다. 누르면 접고 편다.
      const open = status === 'failed' || status === 'running'
      return <details key={group.name} open={open} className="rounded-lg bg-surface-2 px-3.5 py-2">
        <summary className="flex cursor-pointer flex-col gap-0.5 text-sm font-semibold">
          <span className="flex items-center gap-2">
            <StatusIcon status={status} />
            <span className="min-w-0 flex-1 truncate">{kind === 'unit' ? group.name : TEST_NOTES[group.name]?.[0] ?? group.name.split('/').pop()}</span>
            <span className="shrink-0 text-xs font-normal tabular-nums text-text-dim-5">{kind === 'unit' ? `${group.items.length}개` : tests.length ? `${done} / ${tests.length}` : '안 돌림'}</span>
          </span>
          {kind === 'e2e' && <NoteLine file={group.name} />}
        </summary>
        {kind === 'unit' && subgroupsOf(group.name, tests).map((sub) => <div key={sub.name} className="mt-2 first:mt-1">
          {sub.name && <h3 className="mb-0.5 text-xs font-bold text-text-dim-4">{sub.name} <span className="font-normal text-text-dim-6">{sub.items.length}</span></h3>}
          <ul className="flex flex-col">{sub.items.map((item) => <ItemRow key={item.id} item={item} showFile showNote />)}</ul>
        </div>)}
        {kind !== 'unit' && tests.length > 0 && <ul className="mt-1 flex flex-col">{tests.map((item) => <ItemRow key={item.id} item={item} />)}</ul>}
      </details>
  }
  const groups = groupsOf({ kind, items })
  if (kind === 'unit') return <div className="flex flex-col gap-1.5">{groups.map(renderGroup)}</div>
  // e2e: 갈래 제목 아래 스펙 파일들(제품 흐름 순서, 실험실은 끝). 갈래 표에 없는 파일은 끝에.
  const sectionOf = (file: string) => TEST_NOTES[file]?.[3] ?? ''
  const sections = [...E2E_GROUP_ORDER, ''].map((name) => ({ name, groups: groups.filter((group) => (E2E_GROUP_ORDER.includes(sectionOf(group.name)) ? sectionOf(group.name) : '') === name) }))
  return <div className="flex flex-col gap-4">
    {sections.filter((section) => section.groups.length).map((section) => <section key={section.name} className="flex flex-col gap-1.5">
      <h3 className="text-xs font-bold text-text-dim-4">{section.name || '기타'} <span className="font-normal text-text-dim-6">{section.groups.length}</span></h3>
      {section.groups.map(renderGroup)}
    </section>)}
  </div>
}

/**
 * 관리자 `테스트`: 단위 · 스모크 · e2e 전체 목록과 각각 무엇을 검사하는지, AI가 돌린 결과가 지금 어디까지 왔는지 본다. 보기만 한다(시작 단추 없음).
 * 기록은 리포터가 `.git/test-runs/`에 쓰고 개발 서버가 내준다. 워크트리 · 종류마다 마지막 실행 하나가 남는다.
 */
export function TestsPage() {
  const [runs, setRuns] = useState<TestRunView[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** 사용자가 고른 탭. 고르기 전에는 가장 최근 실행의 종류. */
  const [kind, setKind] = useState<TestKind | null>(null)
  /** 종류마다 고른 워크트리. 없으면 가장 최근 것. */
  const [picked, setPicked] = useState<Partial<Record<TestKind, string>>>({})
  /** 종류마다 마지막 실행 · 마지막 전체 중 무엇을 보나. 고르기 전엔 도는 중이면 마지막 실행, 아니면 마지막 전체. */
  const [slot, setSlot] = useState<Partial<Record<TestKind, 'last' | 'full'>>>({})

  /** 마지막으로 따라간 실행. 새 실행이 시작되면 그 탭 · 워크트리로 옮겨 간다(한 실행에 한 번만 — 그 뒤엔 사용자가 고른 탭을 둔다). */
  const followed = useRef<string | null>(null)
  useEffect(() => {
    const live = runs?.find((run) => run.slot === 'last' && runStateOf(run) === 'running')
    if (!live) return
    const key = `${live.worktree}:${live.kind}:${live.startedAt}`
    if (followed.current === key) return
    followed.current = key
    setKind(live.kind)
    setPicked((prev) => ({ ...prev, [live.kind]: live.worktree }))
    // 고른 칸을 비워 기본으로: 도는 동안은 이 실행, 끝나면 마지막 전체.
    setSlot((prev) => ({ ...prev, [live.kind]: undefined }))
  }, [runs])

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

  const active = kind ?? runs.find((run) => run.slot === 'last')?.kind ?? 'unit'
  const runsOf = (key: TestKind) => runs.filter((run) => run.kind === key && run.slot === 'last')

  return <Tabs value={active} onValueChange={(value) => setKind(value as TestKind)} className="flex flex-col gap-4" data-testid="admin-tests">
    <TabsList className="self-start">
      {TEST_KINDS.map(({ key, label }) => {
        const latest = runsOf(key)[0]
        return <TabsTrigger key={key} value={key}>
          {label} <span className="font-normal text-text-dim-5">{CATALOG[key].length}</span>
          {latest && runStateOf(latest) === 'running' && <LoaderCircle className="size-3 animate-spin text-info" />}
          {latest && runStateOf(latest) === 'failed' && <CircleX className="size-3 text-destructive" />}
        </TabsTrigger>
      })}
    </TabsList>
    {TEST_KINDS.map(({ key }) => {
      const list = runsOf(key)
      const last = list.find((item) => item.worktree === picked[key]) ?? list[0]
      const full = last && runs.find((run) => run.kind === key && run.slot === 'full' && run.worktree === last.worktree)
      // 마지막 실행이 곧 전체 실행이면 고를 게 없다.
      const choosable = full && full.startedAt !== last.startedAt
      // 기본: 도는 중이면 그 실행, 아니면 마지막 전체(파일 몇 개만 돌린 기록이 전체를 가리지 않게).
      const shown = slot[key] ?? (last && runStateOf(last) === 'running' ? 'last' : 'full')
      const run = choosable && shown === 'full' ? full : last
      return <TabsContent key={key} value={key} className="flex max-w-3xl flex-col gap-3">
        {choosable && <ChoiceGroup variant="segment" aria-label="볼 실행" className="w-64">
          <ChoiceItem checked={run === last} onClick={() => setSlot((prev) => ({ ...prev, [key]: 'last' }))}>마지막 실행 · {last.items.length}개</ChoiceItem>
          <ChoiceItem checked={run === full} onClick={() => setSlot((prev) => ({ ...prev, [key]: 'full' }))}>마지막 전체 · {full.items.length}개</ChoiceItem>
        </ChoiceGroup>}
        {run
          ? <RunHeader run={run} others={list} onPick={(worktree) => setPicked((prev) => ({ ...prev, [key]: worktree }))} />
          : <p className="text-sm text-text-dim-4">아직 안 돌렸어요. 돌리면 여기에 결과가 겹쳐 보여요.</p>}
        <TestList kind={key} items={withCatalog(key, CATALOG[key], run?.items)} />
      </TabsContent>
    })}
    {error && <p className="text-xs text-text-dim-5">다시 읽지 못했어요: {error}</p>}
  </Tabs>
}
