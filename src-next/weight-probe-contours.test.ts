import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { FillRule, unionD } from 'clipper2-ts'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { glyphDataToFontContours } from '../src/services/fontGenerator'
import { jamoOf, withCounterKeep, withHorizontalShare } from '../src/services/inkCounterMeasure'
import type { NotoPresetModelBundle } from './notoPresetGlyphs'

/**
 * 속공간 지키기 — 같은 자 단계. 플랜 `docs/plans/2026-10-01_속공간-지키기.md`.
 * 참고 폰트 측정(`scripts/reference-lab/measure_weight_offsets.py`)과 같은 글자(첫닿자 19 × ㅏ · ㅗ)를
 * 우리 윤곽으로 내보낸다. 좌표는 참고 측정과 같은 틀(1000-unit, y-down, baseline 880)로 뒤집는다.
 * 프로브는 파이썬 쪽(`measure_weight_offsets_contours.py`)이 같은 셈으로 돈다 — 재는 자에 폰트 이름을 박지 않는다.
 *
 * 환경 변수가 있을 때만 돈다(반드시 `--dir src-next`로 — 레포 루트로 돌리면 워크트리 옛 복사본이 섞인다):
 *   WEIGHT_PROBE=1 npx vitest run --dir src-next weight-probe-contours
 * - `PROBE_OUT`: 출력 JSON 경로(기본 /tmp/weight-probe-contours.json)
 * - `PROBE_WEIGHTS`: 쉼표 굵기 목록(기본 100,400,900 — 기준 400 필수)
 * - `PROBE_FLOOR=24,0.5,0.25` · `PROBE_HSHARE=0.526`: 손잡이를 얹은 변형을 내보낸다(전수 테스트와 같은 뜻)
 */

const MODEL = JSON.parse(readFileSync(fileURLToPath(new URL('../public/noto-preset/model.json', import.meta.url)), 'utf8')) as NotoPresetModelBundle
const FONT_SPACE = { width: 1000, height: 1000 }
const BODY_W = 840
const BODY_H = 910
const BASELINE = 880

const INITIALS = [...'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ']
const MEDIALS = ['ㅏ', 'ㅗ'] as const
const MEDIAL_INDEX = new Map([...'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ'].map((jamo, index) => [jamo, index]))
const syllableOf = (initial: string, medial: string) =>
  String.fromCharCode(0xac00 + INITIALS.indexOf(initial) * 588 + (MEDIAL_INDEX.get(medial) ?? 0) * 28)

const WEIGHTS = (process.env.PROBE_WEIGHTS ?? '100,400,900').split(',').map(Number)
const HSHARE = process.env.PROBE_HSHARE ? Number(process.env.PROBE_HSHARE) : undefined
const FLOOR = process.env.PROBE_FLOOR ? (([fixed, ratio, horizontalRatio]) => ({ fixed: fixed / 1000, ratio, horizontalRatio }))(process.env.PROBE_FLOOR.split(',').map(Number)) : undefined

describe.skipIf(!process.env.WEIGHT_PROBE)('속공간 지키기 — 같은 자용 윤곽 내보내기', () => {
  beforeAll(() => {
    const memory = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => memory.set(key, value), removeItem: (key: string) => memory.delete(key) })
  })
  afterAll(() => { vi.unstubAllGlobals() })

  it('첫닿자 19 × ㅏ · ㅗ 윤곽', async () => {
    const [exportUtils, deltaStore, exportStore, layout, style, placement] = await Promise.all([
      import('../src/services/fontExportUtils'), import('./layoutDeltaStore'), import('./fontExportStore'),
      import('../src/stores/layoutStore'), import('../src/stores/globalStyleStore'), import('../src/services/designBodyPlacement'),
    ])
    const placementOf = exportStore.placementResolverOf(MODEL, deltaStore.layoutDeltaSnapshot())
    layout.useLayoutStore.getState().setGlobalPadding(placement.designBodyPaddingForSize(BODY_W, BODY_H, FONT_SPACE))

    // 자소별 잉크(1000 단위 · y-down · 기준선 880). 획 겹침은 합쳐 참고 폰트 윤곽과 같은 "채워진 면"으로 만든다.
    const partInk = (char: string, weight: number) => {
      style.useGlobalStyleStore.getState().updateStyle('weight', weight)
      const collected = exportUtils.collectGlyphDataWithPlacement(char, placementOf)
      if (!collected) return null
      const data = FLOOR === undefined ? withHorizontalShare(collected, HSHARE ?? 1) : withCounterKeep(collected, FLOOR, HSHARE).data
      const out: Record<string, number[][][]> = {}
      for (const part of new Set(data.strokes.map((item) => jamoOf((item.beakGroup ?? '').split(':')[0])))) {
        const strokes = data.strokes.filter((item) => jamoOf((item.beakGroup ?? '').split(':')[0]) === part)
        const ink = unionD(glyphDataToFontContours({ ...data, strokes }), FillRule.NonZero)
        out[part] = ink.map((path) => path.map((p) => [Math.round(p.x * 10) / 10, Math.round((BASELINE - p.y) * 10) / 10]))
      }
      return out
    }

    const characters: Record<string, unknown> = {}
    for (const initial of INITIALS) for (const medial of MEDIALS) {
      const char = syllableOf(initial, medial)
      const perWeight: Record<string, unknown> = {}
      for (const weight of WEIGHTS) {
        const parts = partInk(char, weight)
        if (!parts) continue
        perWeight[String(weight)] = { component: parts.CH ?? [], medial: parts.JU ?? [] }
      }
      characters[char] = { initialJamo: initial, medialJamo: medial, weights: perWeight }
    }

    const out = process.env.PROBE_OUT ?? '/tmp/weight-probe-contours.json'
    writeFileSync(out, JSON.stringify({
      schema: 'weight-probe-contours-v1',
      frame: '1000-unit, y-down, baseline 880',
      baseWeight: 400,
      weights: WEIGHTS,
      body: { width: BODY_W, height: BODY_H },
      floor: FLOOR ?? null,
      horizontalShare: HSHARE ?? null,
      characters,
    }))
    console.info(`PROBE_OUT ${out} (${Object.keys(characters).length}자 × ${WEIGHTS.length}굵기)`)
    expect(Object.keys(characters)).toHaveLength(INITIALS.length * MEDIALS.length)
  }, 600_000)
})
