import type { JamoData, LayoutSchema, LayoutType, Padding } from '../src/types'
import { decomposeSyllable } from '../src/utils/hangulUtils'
import type {
  DesignBody,
  FontGrid,
  FontMetrics,
  FontSpace,
  SampleGlyphEdit,
} from './calibrationProjectStore'
import { getJamoGeometryMode, measureJamoMaster } from '../src/utils/jamoGeometry'

interface SnapshotInput {
  sentenceLines: readonly string[]
  fontSpace: FontSpace
  grid: FontGrid
  designBody: DesignBody
  metrics: FontMetrics
  sampleGlyphEdits: SampleGlyphEdit[]
  maps: {
    choseong: Record<string, JamoData>
    jungseong: Record<string, JamoData>
    jongseong: Record<string, JamoData>
  }
  schemas: Record<LayoutType, LayoutSchema>
  globalPadding: Padding
  paddingOverrides: Partial<Record<LayoutType, Partial<Padding>>>
}

function isHangulSyllable(char: string): boolean {
  const code = char.codePointAt(0) ?? 0
  return code >= 0xac00 && code <= 0xd7a3
}

function pickJamos(source: Record<string, JamoData>, chars: Set<string>): Record<string, JamoData> {
  const picked: Record<string, JamoData> = {}
  for (const char of [...chars].sort()) {
    if (source[char]) {
      const master = structuredClone(source[char])
      delete master.padding
      delete master.horizontalPadding
      delete master.verticalPadding
      picked[char] = master
    }
  }
  return picked
}

function measurePickedJamos(source: Record<string, JamoData>, chars: Set<string>) {
  const measured: Record<string, {
    mode: ReturnType<typeof getJamoGeometryMode>
    measuredBounds: ReturnType<typeof measureJamoMaster>
    intrinsicAspectRatio: number | null
  }> = {}
  for (const char of [...chars].sort()) {
    const jamo = source[char]
    if (!jamo) continue
    const mode = getJamoGeometryMode(jamo)
    const measuredBounds = measureJamoMaster(jamo)
    measured[char] = {
      mode,
      measuredBounds,
      intrinsicAspectRatio: mode === 'ink-normalized'
        ? measuredBounds?.aspectRatio ?? null
        : null,
    }
  }
  return measured
}

export function createCalibrationAnalysisSnapshot(input: SnapshotInput) {
  const used = {
    choseong: new Set<string>(),
    jungseong: new Set<string>(),
    jongseong: new Set<string>(),
    layouts: new Set<LayoutType>(),
  }

  for (const char of [...input.sentenceLines.join('')]) {
    if (!isHangulSyllable(char)) continue
    const syllable = decomposeSyllable(char, input.maps.choseong, input.maps.jungseong, input.maps.jongseong)
    if (syllable.choseong) used.choseong.add(syllable.choseong.char)
    if (syllable.jungseong) used.jungseong.add(syllable.jungseong.char)
    if (syllable.jongseong) used.jongseong.add(syllable.jongseong.char)
    used.layouts.add(syllable.layoutType)
  }

  const changedJamos = new Set<string>()
  const changedLayouts = new Set<LayoutType>()
  for (const edit of input.sampleGlyphEdits) {
    if (edit.inferredRule.kind === 'jamo-master') {
      changedJamos.add(`${edit.inferredRule.jamoType}:${edit.inferredRule.jamoId}`)
      used[edit.inferredRule.jamoType].add(edit.inferredRule.jamoId)
    } else {
      changedLayouts.add(edit.inferredRule.layoutType)
      used.layouts.add(edit.inferredRule.layoutType)
    }
  }

  const effectiveLayouts = {} as Partial<Record<LayoutType, LayoutSchema>>
  const layoutProfile = {} as Partial<Record<LayoutType, LayoutSchema['userPartOverrides']>>
  for (const layoutType of [...used.layouts].sort()) {
    const schema = input.schemas[layoutType]
    const userPartOverrides = structuredClone(schema.userPartOverrides ?? {})
    layoutProfile[layoutType] = structuredClone(userPartOverrides)
    effectiveLayouts[layoutType] = {
      ...structuredClone(schema),
      padding: { ...input.globalPadding, ...input.paddingOverrides[layoutType] },
      userPartOverrides,
    }
  }

  return {
    kind: 'font-maker-calibration-analysis',
    version: 4,
    copiedAt: new Date().toISOString(),
    sentence: [...input.sentenceLines],
    fontProject: {
      fontSpace: structuredClone(input.fontSpace),
      grid: structuredClone(input.grid),
      designBody: structuredClone(input.designBody),
      metrics: structuredClone(input.metrics),
      // version 4 출력 호환 필드이며 별도 원본이 아니다.
      layoutProfile,
    },
    effectiveLayouts,
    jamoMasters: {
      choseong: pickJamos(input.maps.choseong, used.choseong),
      jungseong: pickJamos(input.maps.jungseong, used.jungseong),
      jongseong: pickJamos(input.maps.jongseong, used.jongseong),
    },
    jamoGeometry: {
      choseong: measurePickedJamos(input.maps.choseong, used.choseong),
      jungseong: measurePickedJamos(input.maps.jungseong, used.jungseong),
      jongseong: measurePickedJamos(input.maps.jongseong, used.jongseong),
    },
    changeSummary: {
      editCount: input.sampleGlyphEdits.length,
      changedJamos: [...changedJamos].sort(),
      changedLayouts: [...changedLayouts].sort(),
      lastEditedAt: input.sampleGlyphEdits.at(-1)?.createdAt ?? null,
    },
    sampleGlyphEdits: structuredClone(input.sampleGlyphEdits),
  }
}
