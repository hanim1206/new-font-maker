import { describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { scanButtonUsage } from './styleReviewApi'

describe('검토판 단추 쓰임 세기', () => {
  it('제품 코드의 Button을 강조 · 크기별로 센다', async () => {
    const usage = await scanButtonUsage(fileURLToPath(new URL('..', import.meta.url)))
    expect(usage.size.sheet?.length ?? 0).toBeGreaterThan(5)
    expect(usage.variant.chip?.length ?? 0).toBeGreaterThan(0)
    expect(usage.size.sheet!.every((use) => use.file.startsWith('src-next/') && use.line > 0)).toBe(true)
    expect(Object.values(usage.variant).flat().some((use) => use.file.includes('components/ui'))).toBe(false)
  })
})
