import { describe, expect, it } from 'vitest'
import { elapsedText, errorExcerpt, groupsOf, runFileName, runStateOf, slotOfFileName, summaryOf, unitCategoryOf } from './testRunModel'
import type { TestRunItem, TestRunView } from './testRunModel'

const item = (file: string, status: TestRunItem['status']): TestRunItem => ({ id: `${file}:${status}`, file, title: file, status })
const run = (patch: Partial<TestRunView>): TestRunView => ({
  kind: 'unit', worktree: 'w', branch: 'dev', pid: 1, startedAt: 0, full: false, slot: 'last', alive: true, items: [], ...patch,
})

describe('테스트 실행 기록', () => {
  it('끝 표시가 없으면 프로세스가 살아 있을 때만 도는 중, 죽었으면 중단됨', () => {
    expect(runStateOf(run({ alive: true }))).toBe('running')
    expect(runStateOf(run({ alive: false }))).toBe('stopped')
  })

  it('끝났으면 실패가 하나라도 있을 때 실패', () => {
    expect(runStateOf(run({ finishedAt: 1, alive: false, items: [item('a', 'passed'), item('b', 'skipped')] }))).toBe('passed')
    expect(runStateOf(run({ finishedAt: 1, alive: false, items: [item('a', 'passed'), item('b', 'failed')] }))).toBe('failed')
  })

  it('끝난 수는 통과 · 실패 · 건너뜀, 대기 · 도는 중은 빼고 센다', () => {
    const summary = summaryOf(run({ items: [item('a', 'passed'), item('b', 'failed'), item('c', 'skipped'), item('d', 'running'), item('e', 'pending')] }))
    expect(summary).toEqual({ total: 5, done: 3, passed: 1, failed: 1, skipped: 1 })
  })

  it('단위 테스트는 갈래 순서로, e2e는 스펙 파일로 처음 나온 순서대로 묶는다', () => {
    const items = [item('src/services/cffSubroutinize.test.ts', 'passed'), item('src-next/style-guard.test.ts', 'passed'), item('src/services/fontRevision.test.ts', 'passed')]
    expect(groupsOf(run({ items })).map((group) => [group.name, group.items.length])).toEqual([['지킴이', 1], ['출력(OTF)', 2]])
    expect(groupsOf(run({ kind: 'e2e', items })).map((group) => group.name)).toEqual(items.map((one) => one.file))
  })

  it('갈래는 경로 규칙에서 처음 걸리는 것, 아무것도 안 걸리면 기타', () => {
    expect(unitCategoryOf('src-next/medial-guide-g0-fixture.test.ts')).toBe('실험 고정 자료')
    expect(unitCategoryOf('src/stores/workbenchStore.test.ts')).toBe('편집 동작 · 저장소')
    expect(unitCategoryOf('src/services/notoModelFit.test.ts')).toBe('노토 프리셋 · 측정')
    expect(unitCategoryOf('src/zzz/unknown.test.ts')).toBe('기타')
  })

  it('걸린 시간은 m:ss, 실패 메시지는 색 코드를 빼고 앞 줄만', () => {
    expect(elapsedText(65_400)).toBe('1:05')
    const esc = String.fromCharCode(27)
    expect(errorExcerpt(`${esc}[31m빨강${esc}[39m\n둘\n셋`, 2)).toBe('빨강\n둘')
  })

  it('기록 파일은 워크트리 · 종류마다 마지막 실행과 마지막 전체 둘, 이름으로 칸을 안다', () => {
    expect(runFileName('dev', 'unit')).toBe('dev.unit.json')
    expect(runFileName('dev', 'unit', 'full')).toBe('dev.unit.full.json')
    expect(slotOfFileName('dev.unit.full.json')).toBe('full')
    expect(slotOfFileName('dev.unit.json')).toBe('last')
  })
})
