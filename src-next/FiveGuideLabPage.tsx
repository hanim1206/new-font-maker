import { finalGlyphInkToSvgPath, materializeFinalGlyphInk } from '../src/services/finalGlyphInk'
import { createJamoRoleMasterId } from '../src/services/jamoConstruction'
import { resolveShapeGlyphInkPrimitives } from '../src/services/shapeGlyphInkResolver'
import { createFiveGuideShapeFixtureV0 } from '../src/test/fixtures/five-guide-square-p0/shape-source-v0'
import manifest from '../src/test/fixtures/five-guide-square-p0/manifest.json'
import xBaseline from '../src/test/fixtures/five-guide-square-p0/x-baseline-52a5c3f.json'
import type { BoxConfig, JamoPartRole, LayoutSchema, Part, ResolvedInkPrimitive, SharedLayoutType } from '../src/types'
import { BASE_PRESETS_SCHEMAS, calculateBoxes } from '../src/utils/layoutCalculator'
import styles from './FiveGuideLabPage.module.css'

const PART_ORDER = ['CH', 'JU', 'JU_H', 'JU_V', 'JO'] as const satisfies readonly Part[]

const PART_LABELS: Record<Part, string> = {
  CH: '초성',
  JU: '중성',
  JU_H: '중성 가로부',
  JU_V: '중성 세로부',
  JO: '받침',
}

const PART_SHORT_LABELS: Record<Part, string> = {
  CH: '초',
  JU: '중',
  JU_H: '중·가로',
  JU_V: '중·세로',
  JO: '받침',
}

const PART_COLORS: Record<Part, string> = {
  CH: '#315fbe',
  JU: '#dd7b29',
  JU_H: '#d1a11f',
  JU_V: '#8b5fc0',
  JO: '#36866b',
}

const LAYOUTS = [
  { id: 'choseong-only', label: '닿소리 단독' },
  { id: 'choseong-jungseong-vertical', label: '세로모음' },
  { id: 'choseong-jungseong-horizontal', label: '가로모음' },
  { id: 'choseong-jungseong-mixed', label: '섞임모음' },
  { id: 'choseong-jungseong-vertical-jongseong', label: '세로모음 + 받침' },
  { id: 'choseong-jungseong-horizontal-jongseong', label: '가로모음 + 받침' },
  { id: 'choseong-jungseong-mixed-jongseong', label: '섞임모음 + 받침' },
] as const satisfies readonly { id: SharedLayoutType; label: string }[]

interface GlyphPartSpec {
  part: Part
  role: JamoPartRole
  jamoId: 'ㄱ' | 'ㅏ' | 'ㅗ' | 'ㅘ'
}

const LAYOUT_GLYPH_PARTS: Record<SharedLayoutType, readonly GlyphPartSpec[]> = {
  'choseong-only': [{ part: 'CH', role: 'STANDALONE', jamoId: 'ㄱ' }],
  'choseong-jungseong-vertical': [
    { part: 'CH', role: 'CH', jamoId: 'ㄱ' },
    { part: 'JU', role: 'JU_VERTICAL', jamoId: 'ㅏ' },
  ],
  'choseong-jungseong-horizontal': [
    { part: 'CH', role: 'CH', jamoId: 'ㄱ' },
    { part: 'JU', role: 'JU_HORIZONTAL', jamoId: 'ㅗ' },
  ],
  'choseong-jungseong-mixed': [
    { part: 'CH', role: 'CH', jamoId: 'ㄱ' },
    { part: 'JU_H', role: 'JU_H', jamoId: 'ㅘ' },
    { part: 'JU_V', role: 'JU_V', jamoId: 'ㅘ' },
  ],
  'choseong-jungseong-vertical-jongseong': [
    { part: 'CH', role: 'CH', jamoId: 'ㄱ' },
    { part: 'JU', role: 'JU_VERTICAL', jamoId: 'ㅏ' },
    { part: 'JO', role: 'JO', jamoId: 'ㄱ' },
  ],
  'choseong-jungseong-horizontal-jongseong': [
    { part: 'CH', role: 'CH', jamoId: 'ㄱ' },
    { part: 'JU', role: 'JU_HORIZONTAL', jamoId: 'ㅗ' },
    { part: 'JO', role: 'JO', jamoId: 'ㄱ' },
  ],
  'choseong-jungseong-mixed-jongseong': [
    { part: 'CH', role: 'CH', jamoId: 'ㄱ' },
    { part: 'JU_H', role: 'JU_H', jamoId: 'ㅘ' },
    { part: 'JU_V', role: 'JU_V', jamoId: 'ㅘ' },
    { part: 'JO', role: 'JO', jamoId: 'ㄱ' },
  ],
}

interface XPartBox {
  x: number
  width: number
}

interface RawBinding {
  partEdges: Partial<Record<Part, { left: string; right: string }>>
}

const fixture = createFiveGuideShapeFixtureV0()
const railValues = new Map(xBaseline.raw.xRails.map(({ id, value }) => [id, value]))

function rawParts(layoutType: SharedLayoutType): Partial<Record<Part, XPartBox>> {
  const binding = xBaseline.raw.bindings[layoutType] as RawBinding
  return Object.fromEntries(Object.entries(binding.partEdges).map(([part, edges]) => {
    const left = railValues.get(edges!.left)
    const right = railValues.get(edges!.right)
    if (left === undefined || right === undefined) throw new Error(`${layoutType}/${part} X Rail을 찾을 수 없습니다.`)
    return [part, { x: left, width: right - left }]
  }))
}

function effectiveBoxes(layoutType: SharedLayoutType): Partial<Record<Part, BoxConfig>> {
  const baseline = xBaseline.effective.sharedLayouts[layoutType]
  const padding = { ...xBaseline.calculation.runtimePadding }
  const schema = structuredClone(BASE_PRESETS_SCHEMAS[layoutType]) as LayoutSchema
  const boxes = calculateBoxes(
    { ...schema, padding, designBodyPadding: { ...padding } },
    { cho: baseline.context.cho, jung: baseline.context.jung, jong: baseline.context.jong },
  )
  for (const part of PART_ORDER) {
    const box = boxes[part]
    const frozenX = (baseline.parts as Partial<Record<Part, XPartBox>>)[part]
    if (!box || !frozenX) continue
    if (Math.abs(box.x - frozenX.x) > 1e-9 || Math.abs(box.width - frozenX.width) > 1e-9) {
      throw new Error(`${layoutType}/${part} 현재 X 계산이 S0 fixture와 달라졌습니다.`)
    }
  }
  return boxes
}

function replaceOnlyX(
  boxes: Partial<Record<Part, BoxConfig>>,
  xParts: Partial<Record<Part, XPartBox>>,
): Partial<Record<Part, BoxConfig>> {
  const result: Partial<Record<Part, BoxConfig>> = {}
  for (const part of PART_ORDER) {
    const box = boxes[part]
    if (!box) continue
    const xPart = xParts[part]
    result[part] = xPart ? { ...box, x: xPart.x, width: xPart.width } : { ...box }
  }
  return result
}

function composedGlyphPath(
  layoutType: SharedLayoutType,
  char: string,
  boxes: Partial<Record<Part, BoxConfig>>,
): string {
  const primitives: ResolvedInkPrimitive[] = []
  for (const spec of LAYOUT_GLYPH_PARTS[layoutType]) {
    const slot = boxes[spec.part]
    if (!slot) throw new Error(`${layoutType}/${spec.part} 조합 슬롯이 없습니다.`)
    const resolved = resolveShapeGlyphInkPrimitives({
      source: fixture.roleSources[spec.role],
      masterId: createJamoRoleMasterId(spec.jamoId, spec.role),
      glyphId: char,
      part: spec.part,
      slot,
      weightMultiplier: 1,
      globalLinecap: 'round',
      globalLinejoin: 'round',
    })
    if (!resolved.ok) {
      throw new Error(`${char}/${spec.part} Shape를 해석할 수 없습니다: ${resolved.issues[0]?.message ?? ''}`)
    }
    primitives.push(...resolved.primitives)
  }
  const final = materializeFinalGlyphInk(
    primitives,
    { mode: 'brush', brush: { tip: 'round', aspectRatio: 1, angle: 0 } },
    { unitsPerEm: 1000, maxCurveErrorFontUnits: 0.5 },
  )
  if (!final.ok) throw new Error(`${char} 조합 잉크를 만들 수 없습니다: ${final.message}`)
  return finalGlyphInkToSvgPath(final.ink)
}

function finalGlyphPath(jamoId: 'ㄱ' | 'ㅁ'): { path: string; regions: number; holes: number } {
  const resolved = resolveShapeGlyphInkPrimitives({
    source: fixture.roleSources.STANDALONE,
    masterId: createJamoRoleMasterId(jamoId, 'STANDALONE'),
    glyphId: jamoId,
    part: 'CH',
    slot: { x: 0, y: 0, width: 1, height: 1 },
    weightMultiplier: 1,
    globalLinecap: 'round',
    globalLinejoin: 'round',
  })
  if (!resolved.ok) throw new Error(`${jamoId} 기준 형태를 해석할 수 없습니다: ${resolved.issues[0]?.message ?? ''}`)
  const final = materializeFinalGlyphInk(
    resolved.primitives,
    { mode: 'brush', brush: { tip: 'round', aspectRatio: 1, angle: 0 } },
    { unitsPerEm: 1000, maxCurveErrorFontUnits: 0.5 },
  )
  if (!final.ok) throw new Error(`${jamoId} 기준 잉크를 만들 수 없습니다: ${final.message}`)
  return {
    path: finalGlyphInkToSvgPath(final.ink),
    regions: final.ink.regions.length,
    holes: final.ink.regions.reduce((count, region) => count + region.holes.length, 0),
  }
}

const GLYPHS = {
  'ㄱ': finalGlyphPath('ㄱ'),
  'ㅁ': finalGlyphPath('ㅁ'),
} as const

function XStrip({
  label,
  parts,
  showRawRails = false,
}: {
  label: string
  parts: Partial<Record<Part, XPartBox>>
  showRawRails?: boolean
}) {
  const entries = PART_ORDER.flatMap((part) => parts[part] ? [[part, parts[part]!] as const] : [])
  const rowHeight = 11
  const height = Math.max(24, 8 + entries.length * rowHeight)
  return (
    <div className={styles.stripGroup}>
      <span className={styles.stripLabel}>{label}</span>
      <svg
        className={styles.xStrip}
        viewBox={`0 0 100 ${height}`}
        role="img"
        aria-label={`${label}: ${entries.map(([part]) => PART_LABELS[part]).join(', ')}`}
      >
        <rect x="0" y="0" width="100" height={height} rx="3" className={styles.advanceCell} />
        <rect x="7.5" y="0.5" width="85" height={height - 1} rx="2.5" className={styles.designBody} />
        {showRawRails && xBaseline.raw.xRails.map(({ id, value }) => (
          <line key={id} x1={value * 100} x2={value * 100} y1="0" y2={height} className={styles.rawRail} />
        ))}
        {entries.map(([part, box], index) => {
          const y = 5 + index * rowHeight
          return (
            <g key={part}>
              <rect
                x={box.x * 100}
                y={y}
                width={box.width * 100}
                height="8"
                rx="2"
                fill={PART_COLORS[part]}
                opacity="0.86"
              />
              <text
                x={Math.max(1.5, box.x * 100 + 2)}
                y={y + 5.8}
                className={styles.partLabel}
              >
                {PART_SHORT_LABELS[part]}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function ComposedGlyph({
  layoutType,
  char,
  boxes,
  state,
  label,
}: {
  layoutType: SharedLayoutType
  char: string
  boxes: Partial<Record<Part, BoxConfig>>
  state: 'raw-x' | 'effective-x'
  label: string
}) {
  const path = composedGlyphPath(layoutType, char, boxes)
  const visibleParts = LAYOUT_GLYPH_PARTS[layoutType]
  return (
    <div className={styles.glyphState} data-s0-glyph-render={char} data-s0-state={state}>
      <span className={styles.glyphStateLabel}>{label}</span>
      <svg
        className={styles.composedGlyphSvg}
        viewBox="-3 -3 106 106"
        role="img"
        aria-label={`${char} ${label}. 세로 배치는 비교용으로 동일하게 고정됨`}
      >
        <rect x="0" y="0" width="100" height="100" rx="3" className={styles.glyphAdvanceCell} />
        <rect x="7.5" y="7.5" width="85" height="85" rx="2" className={styles.glyphDesignBody} />
        {visibleParts.map(({ part }) => {
          const box = boxes[part]
          if (!box) return null
          return (
            <rect
              key={part}
              x={box.x * 100}
              y={box.y * 100}
              width={box.width * 100}
              height={box.height * 100}
              fill={PART_COLORS[part]}
              stroke={PART_COLORS[part]}
              className={styles.glyphPartBox}
            />
          )
        })}
        <path d={path} className={styles.composedGlyphInk} fillRule="evenodd" data-s0-glyph-path />
      </svg>
      <span className={styles.glyphStateNote}>{state === 'raw-x' ? '공통 분할선만' : '현재 자소별 보정 포함'}</span>
    </div>
  )
}

function XLayoutCard({ layoutType, label }: { layoutType: SharedLayoutType; label: string }) {
  const effective = xBaseline.effective.sharedLayouts[layoutType]
  const currentBoxes = effectiveBoxes(layoutType)
  const baseXParts = rawParts(layoutType)
  const baseXBoxes = replaceOnlyX(currentBoxes, baseXParts)
  return (
    <article className={styles.layoutCard} data-s0-layout={layoutType}>
      <header className={styles.cardHeader}>
        <span className={styles.contextChar}>{effective.context.char}</span>
        <div>
          <h3>{label}</h3>
          <p>{layoutType}</p>
        </div>
      </header>
      <div className={styles.glyphComparison}>
        <ComposedGlyph
          layoutType={layoutType}
          char={effective.context.char}
          boxes={baseXBoxes}
          state="raw-x"
          label="기본 X"
        />
        <span className={styles.comparisonArrow} aria-hidden="true">→</span>
        <ComposedGlyph
          layoutType={layoutType}
          char={effective.context.char}
          boxes={currentBoxes}
          state="effective-x"
          label="현재 X"
        />
      </div>
      <details className={styles.layoutEvidence}>
        <summary>배치 근거 보기</summary>
        <div className={styles.cardStrips}>
          <XStrip label="기본 분할" parts={baseXParts} showRawRails />
          <XStrip label="현재 보정" parts={effective.parts as Partial<Record<Part, XPartBox>>} />
        </div>
      </details>
      <div className={styles.cardScopeNote}>
        <span>Y 동일</span>
        <p>두 글자는 같은 세로 위치·높이·Shape를 쓰고 X만 다릅니다.</p>
      </div>
    </article>
  )
}

function ShapeGrid({ jamoId }: { jamoId: 'ㄱ' | 'ㅁ' }) {
  const glyph = GLYPHS[jamoId]
  const rails = [0, 20, 50, 80, 100]
  return (
    <svg
      className={styles.shapeSvg}
      viewBox="-8 -8 116 116"
      role="img"
      aria-label={`${jamoId} 기준 형태. 영역 ${glyph.regions}개, 내부 공간 ${glyph.holes}개`}
      data-s0-glyph={jamoId}
      data-s0-signature={manifest.outputSignatures[jamoId]}
    >
      <rect x="0" y="0" width="100" height="100" rx="2" className={styles.shapeCell} />
      {rails.map((value) => <line key={`x-${value}`} x1={value} x2={value} y1="0" y2="100" className={styles.shapeRail} />)}
      {rails.map((value) => <line key={`y-${value}`} x1="0" x2="100" y1={value} y2={value} className={styles.shapeRail} />)}
      <path d={glyph.path} className={styles.glyphInk} fillRule="evenodd" />
      {rails.flatMap((x) => rails.map((y) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="1.15" className={styles.gridPoint} />
      )))}
    </svg>
  )
}

function ShapeCard({ jamoId }: { jamoId: 'ㄱ' | 'ㅁ' }) {
  const isGiyeok = jamoId === 'ㄱ'
  return (
    <article className={styles.shapeCard} data-s0-glyph-card={jamoId}>
      <ShapeGrid jamoId={jamoId} />
      <div className={styles.shapeDescription}>
        <span className={styles.shapeChar}>{jamoId}</span>
        <div>
          <h3>{isGiyeok ? '선 기준' : '면과 속공간 기준'}</h3>
          <p>{isGiyeok ? '안쪽 20–80% Rail · 굵기 12% · 둥근 끝' : '바깥 12칸 점유 · 안쪽 20–80%는 비움'}</p>
        </div>
      </div>
    </article>
  )
}

function shortHash(hash: string): string {
  return `${hash.slice(0, 10)}…${hash.slice(-6)}`
}

export function FiveGuideLabPage() {
  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroTopline}>
          <span className={styles.eyebrow}>원도 5선 · 기술 기준 동결</span>
          <span className={styles.status}>S0a · 승인 대상 아님</span>
        </div>
        <h1>기존 X 계산을 재현한<br />기술 스냅샷입니다.</h1>
        <p>
          이 화면은 새 5선 레이아웃이나 채택할 배치안이 아닙니다. 기존 코드의 X 보정과 기하학 Shape 출력이
          같은 입력에서 다시 만들어지는지만 확인합니다.
        </p>
      </header>

      <section className={styles.reviewQuestion} aria-labelledby="s0-review-question">
        <span>판정 정정</span>
        <h2 id="s0-review-question">‘현재 X’는 무료폰트 근거에서 나온 시각 기본값이 아니므로 여기서 승인하지 않습니다.</h2>
        <p>각 쌍은 Y와 Shape를 고정한 레거시 재현물입니다. 실제 간격 판정은 S0b 근거 보드에서 한 질문씩 진행합니다.</p>
        <a className={styles.evidenceLink} href="/references/vertical-vowel-gap.html">S0b · 세로모음 간격 근거 보드 열기</a>
      </section>

      <section className={styles.section} aria-labelledby="s0-x-heading">
        <div className={styles.sectionHeading}>
          <div>
            <span>01 · X 기준</span>
            <h2 id="s0-x-heading">실제 글자로 보는 가로 배치</h2>
          </div>
          <p>
            왼쪽은 공통 분할선만 쓴 글자, 오른쪽은 현재 자소별 보정까지 반영한 글자입니다.
            두 글자의 세로 위치와 높이는 똑같이 고정하고 가로 위치·폭만 바꿨습니다.
          </p>
        </div>
        <div className={styles.legend} aria-label="파트 색상 범례">
          {PART_ORDER.map((part) => (
            <span key={part}><i style={{ background: PART_COLORS[part] }} />{PART_LABELS[part]}</span>
          ))}
        </div>
        <div className={styles.layoutGrid}>
          {LAYOUTS.map(({ id, label }) => <XLayoutCard key={id} layoutType={id} label={label} />)}
        </div>
      </section>

      <section className={styles.section} aria-labelledby="s0-shape-heading">
        <div className={styles.sectionHeading}>
          <div>
            <span>02 · Shape 기준</span>
            <h2 id="s0-shape-heading">최소 선·면 문법</h2>
          </div>
          <p>
            같은 로컬 그리드에서 ㄱ은 선, ㅁ은 면과 비운 공간으로 만듭니다.
            위 조합 글자들도 바로 이 Shape 원형을 역할별 슬롯에 투영한 결과입니다.
          </p>
        </div>
        <div className={styles.shapeGrid}>
          <ShapeCard jamoId="ㄱ" />
          <ShapeCard jamoId="ㅁ" />
        </div>
      </section>

      <section className={styles.provenance} aria-label="기준 데이터 출처">
        <div>
          <span>기준 커밋</span>
          <code>{manifest.sourceCommit.slice(0, 12)}</code>
        </div>
        <div>
          <span>X fixture</span>
          <code>{shortHash(manifest.xBaseline.sha256)}</code>
        </div>
        <div>
          <span>Shape fixture</span>
          <code>{shortHash(manifest.shapeFixture.canonicalJsonSha256)}</code>
        </div>
        <div>
          <span>저장 상태</span>
          <strong>쓰기 0 · 후보</strong>
        </div>
      </section>
    </main>
  )
}
