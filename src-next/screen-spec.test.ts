import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LAB_SCREEN_ROUTES, NON_SCREEN_ROUTES, PRODUCT_SCREEN_ROUTES } from './screenRoutes'
import { findReferences, parseScreenSpec, resolveReference, SCREEN_SPEC_STATUSES, screenSpecForPath } from './screenSpec'

/** 화면 명세(`docs/specs/화면/`)가 실제 주소와 1:1인지, 형식(세 단 · 번호 · 머리말)을 지키는지 본다. */

const SPEC_DIR = join(process.cwd(), 'docs/specs/화면')
const ROUTING_FILES = ['src-next/main.tsx', 'src-next/App.tsx', 'src-next/ShapeWorkspacePage.tsx', 'src-next/ReviewWorkspacePage.tsx']

const files = readdirSync(SPEC_DIR).filter((file) => file.endsWith('.md') && !file.startsWith('_'))
const specs = files.map((file) => ({ file, spec: parseScreenSpec(readFileSync(join(SPEC_DIR, file), 'utf8')) }))
const allSpecs = specs.map((item) => item.spec)

describe('화면 명세와 주소', () => {
  it('제품 화면 주소마다 명세가 정확히 하나 있다', () => {
    for (const route of PRODUCT_SCREEN_ROUTES) {
      expect(specs.filter((item) => item.spec.route === route).map((item) => item.file), route).toHaveLength(1)
    }
  })

  it('명세의 주소는 제품 화면이나 랩 목록에 있고 서로 겹치지 않는다', () => {
    const known: readonly string[] = [...PRODUCT_SCREEN_ROUTES, ...LAB_SCREEN_ROUTES]
    for (const { file, spec } of specs) expect(known, file).toContain(spec.route)
    expect(new Set(allSpecs.map((spec) => spec.route)).size).toBe(specs.length)
    expect(new Set(allSpecs.map((spec) => spec.name)).size).toBe(specs.length)
  })

  it('라우팅 코드의 주소는 모두 목록 셋 중 하나에 올라 있다', () => {
    const listed: readonly string[] = [...PRODUCT_SCREEN_ROUTES, ...LAB_SCREEN_ROUTES, ...NON_SCREEN_ROUTES]
    for (const file of ROUTING_FILES) {
      const source = readFileSync(join(process.cwd(), file), 'utf8')
      const literals = [...source.matchAll(/pathname(?: === |\.startsWith\()'([^']+)'/g)].map((match) => match[1].length > 1 ? match[1].replace(/\/$/, '') : match[1])
      // 상수로 비교하는 주소(`GLYPH_PATH`)는 선언에서 읽는다.
      const constants = [...source.matchAll(/const [A-Z_]*PATH = '([^']+)'/g)].map((match) => match[1])
      for (const route of [...literals, ...constants]) expect(listed, `${file}의 ${route}`).toContain(route)
    }
  })
})

describe('화면 명세 형식', () => {
  it.each(specs)('$file: 머리말 · 제목 · 영역 번호 · 기능 번호', ({ spec }) => {
    expect(spec.name).not.toBe('')
    expect(SCREEN_SPEC_STATUSES as readonly string[]).toContain(spec.status)
    expect(spec.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(spec.blocks.filter((block) => block.kind === 'title')).toHaveLength(1)
    const sections = spec.blocks.filter((block) => block.kind === 'section')
    expect(sections.map((block) => block.number)).toEqual(sections.map((_, index) => index + 1))
    for (const section of sections) {
      const numbered = spec.blocks.filter((block) => block.kind === 'feature' && block.section === section.number && block.number)
      // 영역 안의 기능 번호는 `영역.1`부터 빠짐없이 이어진다.
      expect(numbered.map((block) => block.kind === 'feature' ? block.number : ''), `${section.number}. ${section.title}`).toEqual(numbered.map((_, index) => `${section.number}.${index + 1}`))
    }
  })

  it('번호로 가리킨 이름은 모두 있는 명세다(없어진 화면을 계속 가리키지 않는다)', () => {
    const names = allSpecs.map((spec) => spec.name)
    const sources = [...files, '_트리.md'].map((file) => ({ file, text: readFileSync(join(SPEC_DIR, file), 'utf8') }))
    for (const { file, text } of sources) {
      // `이름 3` `이름 5.1~5.4` 꼴. 이름은 한글만(주소 · 코드 조각은 이 꼴이 아니다).
      for (const match of text.matchAll(/`([가-힣]+) \d+(?:\.\d+(?:~\d+\.\d+)?)?`/g)) expect(names, `${file}: ${match[0]}`).toContain(match[1])
    }
  })

  it('다른 명세를 가리킨 번호는 실제로 있다', () => {
    const names = allSpecs.map((spec) => spec.name)
    for (const { file, spec } of specs) {
      for (const block of spec.blocks) {
        if (block.kind === 'title' || block.kind === 'section') continue
        for (const reference of findReferences(block.text, names)) {
          const lines = resolveReference(allSpecs, reference)
          const expected = reference.from === undefined ? 1 : (reference.to ?? reference.from) - reference.from + 1
          expect(lines.length, `${file}: ${reference.name} ${reference.section}`).toBeGreaterThanOrEqual(expected)
        }
      }
    }
  })
})

describe('screenSpec', () => {
  const raw = ['---', 'route: /a', 'name: 가', 'status: 사용 중', 'updated: 2026-09-20', '---', '# 가 화면', '설명 줄', '', '## 1. 첫 영역', '- 1.1 하나 — 설명', '- 1.2 둘 — `나 2.1~2.2`와 같음', '- `나 1`과 같음'].join('\n')
  const other = ['---', 'route: /b', 'name: 나', 'status: 실험', 'updated: 2026-09-20', '---', '# 나', '## 1. ㄱ', '- 1.1 x', '## 2. ㄴ', '- 2.1 y', '- 2.2 z', '- 2.3 w'].join('\n')

  it('머리말과 세 단을 읽는다', () => {
    const spec = parseScreenSpec(raw)
    expect(spec).toMatchObject({ route: '/a', name: '가', status: '사용 중', updated: '2026-09-20' })
    expect(spec.blocks.map((block) => block.kind)).toEqual(['title', 'note', 'section', 'feature', 'feature', 'feature'])
    expect(spec.blocks.at(-1)).toEqual({ kind: 'feature', section: 1, number: undefined, text: '`나 1`과 같음' })
  })

  it('주소로 찾고, 끝의 /는 무시한다', () => {
    const list = [parseScreenSpec(raw), parseScreenSpec(other)]
    expect(screenSpecForPath(list, '/b/')?.name).toBe('나')
    expect(screenSpecForPath(list, '/c')).toBeUndefined()
  })

  it('가리킨 영역과 기능 범위를 푼다. 모르는 이름은 안 잡는다', () => {
    const list = [parseScreenSpec(raw), parseScreenSpec(other)]
    const names = ['가', '나']
    expect(findReferences('`나 2.1~2.2`와 `나 1` 그리고 `다 3`', names)).toEqual([{ name: '나', section: 2, from: 1, to: 2 }, { name: '나', section: 1, from: undefined, to: undefined }])
    expect(resolveReference(list, { name: '나', section: 2, from: 1, to: 2 }).map((line) => line.number)).toEqual(['2.1', '2.2'])
    expect(resolveReference(list, { name: '나', section: 1 }).map((line) => line.number)).toEqual(['1.1'])
    expect(resolveReference(list, { name: '다', section: 1 })).toEqual([])
  })
})
