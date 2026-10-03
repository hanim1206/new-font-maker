/**
 * 관리자 `테스트` 메뉴가 보는 테스트 실행 기록. vitest · playwright 리포터(`scripts/testRuns/`)가 쓰고,
 * 개발 서버(`scripts/testRunApi.ts`)가 내주고, 화면(`TestsPage.tsx`)이 그린다. 셋이 같은 모양을 여기서 가져간다.
 */

export type TestKind = 'unit' | 'smoke' | 'e2e'
export type ItemStatus = 'pending' | 'running' | 'passed' | 'failed' | 'skipped'
/** 실행 하나의 상태. `stopped` = 끝 표시 없이 프로세스가 사라짐(중간에 끊김). */
export type RunState = 'running' | 'passed' | 'failed' | 'stopped'

export const TEST_KINDS: { key: TestKind; label: string }[] = [
  { key: 'unit', label: '단위' },
  { key: 'smoke', label: '스모크' },
  { key: 'e2e', label: 'e2e' },
]

/** 항목 하나. 단위 테스트는 파일 하나, e2e · 스모크는 테스트 하나. */
export interface TestRunItem {
  id: string
  /** 레포 기준 경로. */
  file: string
  title: string
  status: ItemStatus
  durationMs?: number
  /** 실패 메시지 앞 몇 줄. */
  error?: string
}

export interface TestRun {
  kind: TestKind
  /** 워크트리 폴더 이름(메인 체크아웃은 레포 이름). */
  worktree: string
  branch: string
  pid: number
  startedAt: number
  finishedAt?: number
  /** 거르지 않고 전부 돌린 실행(`npm test` · `test:e2e` · 스모크). 파일 몇 개만 돌린 건 false. */
  full: boolean
  items: TestRunItem[]
}

/** 서버가 내줄 때 붙이는 것: 쓰던 프로세스가 아직 살아 있나. */
export interface TestRunView extends TestRun {
  alive: boolean
  /** 어느 칸에서 읽었나: 마지막 실행 · 마지막 전체 실행. */
  slot: 'last' | 'full'
}

export interface RunSummary {
  total: number
  done: number
  passed: number
  failed: number
  skipped: number
}

export function summaryOf(run: TestRun): RunSummary {
  const count = (status: ItemStatus) => run.items.filter((item) => item.status === status).length
  const passed = count('passed')
  const failed = count('failed')
  const skipped = count('skipped')
  return { total: run.items.length, done: passed + failed + skipped, passed, failed, skipped }
}

export function runStateOf(run: TestRunView): RunState {
  if (run.finishedAt === undefined) return run.alive ? 'running' : 'stopped'
  return run.items.some((item) => item.status === 'failed') ? 'failed' : 'passed'
}

export interface ItemGroup {
  /** 단위 테스트는 갈래, e2e · 스모크는 스펙 파일. */
  name: string
  items: TestRunItem[]
}

/**
 * 단위 테스트 갈래. 파일 경로를 위에서부터 맞춰 처음 걸리는 갈래로 간다(순서가 중요하다).
 * 새 테스트가 어디에도 안 걸리면 `기타`로 보인다 — 그때 여기 규칙을 하나 더한다.
 */
export const UNIT_CATEGORIES: { name: string; pattern: RegExp }[] = [
  { name: '지킴이', pattern: /style-guard|single-entry-guard|screen-spec/ },
  { name: '실험 고정 자료', pattern: /fixture|census|candidate-cache|gold-model|snapshot|calibration|reference-lab|rule-lab|weight-outlier|weight-probe|vertical-vowel-gap|baseline|legacy|candidate-model|candidate-artifact|layout-profile|five-guide/i },
  { name: '계정 · 베타 · 앱', pattern: /admin\/|account|beta|announce|appUpdate|app-safety|feedback|report-screen|preview-font|theme-preview|edit-colors/ },
  { name: '출력(OTF)', pattern: /otf|font-|cff|openType|contour|fontWindows|fontRevision|fontIdentity|export|cmap|ink-consumers|rendering-contract/i },
  { name: '노토 프리셋 · 측정', pattern: /noto|preset|house-layout|corpus|medial-guide/i },
  { name: '편집 동작 · 저장소', pattern: /stores\/|editor|keyboard|snap|smartGuide|strokeEdit|strokeMigration|thinStem|jamoFrame|jamo-from|debounced|workbench|mobile|Trackpad|scope|propagation|stem-shape-session|Override/i },
  { name: '레이아웃 · 칸 · 보선', pattern: /layout|grid|rail|context|partGrid|padding|component-fit|closed-bottom|design-?body|ink-gap|medial|jamoConstruction|role|baseMaster|shapeSystem|shapeOutput|literature/i },
  { name: '그리기 엔진', pattern: /stroke|brush|ink|centerline|stem|counter|body|skeleton|glyph|geometry|beak|weight/i },
]

export function unitCategoryOf(file: string): string {
  return UNIT_CATEGORIES.find((category) => category.pattern.test(file))?.name ?? '기타'
}

/** 목록을 묶는다. 단위 테스트는 갈래 순서, e2e · 스모크는 처음 나온 순서. */
export function groupsOf(run: TestRun): ItemGroup[] {
  const groups = new Map<string, TestRunItem[]>()
  if (run.kind === 'unit') for (const { name } of [...UNIT_CATEGORIES, { name: '기타' }]) groups.set(name, [])
  for (const item of run.items) {
    const name = run.kind === 'unit' ? unitCategoryOf(item.file) : item.file
    const list = groups.get(name)
    if (list) list.push(item)
    else groups.set(name, [item])
  }
  return [...groups].filter(([, items]) => items.length).map(([name, items]) => ({ name, items }))
}

/** 걸린 시간 `m:ss`. */
export function elapsedText(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

/** 실패 메시지를 화면에 맞게 줄인다: 색 코드 빼고 앞 몇 줄만. */
export function errorExcerpt(message: string, lines = 8): string {
  const plain = message.replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g'), '')
  const kept = plain.split('\n').slice(0, lines)
  return kept.join('\n').trimEnd()
}

/** 기록 파일 이름. 워크트리 · 종류마다 마지막 실행 하나와 마지막 전체 실행 하나. */
export const runFileName = (worktree: string, kind: TestKind, slot: 'last' | 'full' = 'last') => `${worktree}.${kind}${slot === 'full' ? '.full' : ''}.json`
export const slotOfFileName = (name: string): 'last' | 'full' => name.endsWith('.full.json') ? 'full' : 'last'
