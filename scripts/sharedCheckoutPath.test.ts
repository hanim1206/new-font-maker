import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { sharedCheckoutPath, sharedEnvDir } from './sharedCheckoutPath'

const base = realpathSync(mkdtempSync(path.join(tmpdir(), 'shared-checkout-')))
const main = path.join(base, 'main')
const worktree = path.join(base, 'wt')
const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, stdio: 'ignore' })

mkdirSync(path.join(main, '.reference-fonts', 'guide-corpus'), { recursive: true })
writeFileSync(path.join(main, 'README'), 'x')
git(main, 'init', '-q')
git(main, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'init')
git(main, 'worktree', 'add', '-q', '--detach', worktree)

afterAll(() => rmSync(base, { recursive: true, force: true }))

describe('git에 없는 로컬 데이터 경로', () => {
  it('제 체크아웃에 있으면 그것을 쓴다', () => {
    expect(sharedCheckoutPath(main, '.reference-fonts/guide-corpus')).toBe(path.join(main, '.reference-fonts/guide-corpus'))
  })

  it('워크트리에 없으면 메인 체크아웃 것을 쓴다', () => {
    const warn = vi.fn()
    expect(sharedCheckoutPath(worktree, '.reference-fonts/guide-corpus', warn)).toBe(path.join(main, '.reference-fonts/guide-corpus'))
    expect(warn).not.toHaveBeenCalled()
  })

  it('어디에도 없으면 경고하고 제 경로를 돌려준다', () => {
    const warn = vi.fn()
    expect(sharedCheckoutPath(worktree, '.no-such-folder', warn)).toBe(path.join(worktree, '.no-such-folder'))
    expect(warn).toHaveBeenCalledOnce()
  })
})

describe('.env 폴더', () => {
  it('워크트리에 .env가 없으면 메인 체크아웃 폴더, 있으면 제 폴더, 어디에도 없으면 조용히 제 폴더', () => {
    const lonely = realpathSync(mkdtempSync(path.join(tmpdir(), 'no-env-')))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      expect(sharedEnvDir(worktree)).toBe(worktree)
      expect(warn).not.toHaveBeenCalled()
      writeFileSync(path.join(main, '.env'), 'A=1')
      expect(sharedEnvDir(worktree)).toBe(main)
      writeFileSync(path.join(worktree, '.env'), 'A=2')
      expect(sharedEnvDir(worktree)).toBe(worktree)
      expect(sharedEnvDir(lonely)).toBe(lonely)
      expect(warn).not.toHaveBeenCalled()
    } finally {
      warn.mockRestore()
      rmSync(lonely, { recursive: true, force: true })
    }
  })
})
