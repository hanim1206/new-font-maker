import { useRef } from 'react'
import { SvgRenderer } from '../../renderers/SvgRenderer'
import { PaddingOverlay } from '../CharacterEditor/PaddingOverlay'
import { SplitOverlay } from '../CharacterEditor/SplitOverlay'
import { LayoutContextThumbnails } from '../CharacterEditor/LayoutContextThumbnails'
import { RelatedSamplesPanel } from './RelatedSamplesPanel'
import { BASE_PRESETS_SCHEMAS } from '../../utils/layoutCalculator'
import type { DecomposedSyllable, BoxConfig, LayoutSchema, Part, Padding, LayoutType } from '../../types'
import type { GlobalStyle } from '../../stores/globalStyleStore'

interface LayoutCanvasColumnProps {
  layoutType: LayoutType
  // 음절 데이터
  displaySyllable: DecomposedSyllable
  schemaWithPadding: LayoutSchema
  effectiveStyle: GlobalStyle
  // 박스
  computedBoxes: Partial<Record<Part, BoxConfig>>
  // 스키마
  schema: LayoutSchema
  effectivePadding: Padding
  // 패딩 오버라이드 상태
  hasPaddingOverride: boolean
  // 자모 편집 상태
  isJamoEditing: boolean
  editingPartInLayout: Part | null
  editingJamoInfo: { type: 'choseong' | 'jungseong' | 'jongseong'; char: string } | null
  previewLayoutType: LayoutType | null
  activeLayoutType: LayoutType
  editingJamoType: 'choseong' | 'jungseong' | 'jongseong' | null
  editingJamoChar: string | null
  // 핸들러
  onPartClick: (part: Part) => void
  onSplitChange: (index: number, value: number) => void
  onPaddingOverrideChange: (side: keyof Padding, val: number) => void
  onPreviewLayoutTypeChange: (lt: LayoutType) => void
  // 파트 오프셋 관련 (레이아웃 모드에서 파트 선택 시)
  // 3컬럼에서는 selectedPart 없이 editingPartInLayout으로 통합하므로 제거
}

/** 좌측 레이아웃 캔버스 컬럼 */
export function LayoutCanvasColumn({
  layoutType,
  displaySyllable,
  schemaWithPadding,
  effectiveStyle,
  computedBoxes,
  schema,
  effectivePadding,
  hasPaddingOverride,
  isJamoEditing,
  editingPartInLayout,
  editingJamoInfo,
  previewLayoutType,
  activeLayoutType,
  editingJamoType,
  editingJamoChar,
  onPartClick,
  onSplitChange,
  onPaddingOverrideChange,
  onPreviewLayoutTypeChange,
}: LayoutCanvasColumnProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const previewSize = 200

  return (
    <div className="h-full overflow-y-auto p-4">
      <h3 className="text-sm font-medium mb-3 text-text-dim-3 uppercase tracking-wider">
        레이아웃
      </h3>

      {/* 자모 편집 시 LayoutContextThumbnails 표시 */}
      {isJamoEditing && editingJamoInfo && (
        <LayoutContextThumbnails
          jamoType={editingJamoInfo.type}
          jamoChar={editingJamoInfo.char}
          selectedContext={previewLayoutType}
          onSelectContext={onPreviewLayoutTypeChange}
        />
      )}

      {/* 캔버스 */}
      <div className="flex justify-center p-3 bg-background rounded mb-2">
        <div className="relative inline-block" style={{ backgroundColor: '#1a1a1a' }}>
          {/* 0.025 스냅 그리드 */}
          <svg
            className="absolute inset-0 pointer-events-none z-0"
            width={previewSize}
            height={previewSize}
            viewBox="0 0 100 100"
          >
            {Array.from({ length: 39 }, (_, i) => {
              const v = (i + 1) * 2.5
              return (
                <g key={`grid-${i}`}>
                  <line x1={v} y1={0} x2={v} y2={100} stroke="#333" strokeWidth={0.2} />
                  <line x1={0} y1={v} x2={100} y2={v} stroke="#333" strokeWidth={0.2} />
                </g>
              )
            })}
            {Array.from({ length: 9 }, (_, i) => {
              const v = (i + 1) * 10
              return (
                <g key={`grid-major-${i}`}>
                  <line x1={v} y1={0} x2={v} y2={100} stroke="#444" strokeWidth={0.4} />
                  <line x1={0} y1={v} x2={100} y2={v} stroke="#444" strokeWidth={0.4} />
                </g>
              )
            })}
          </svg>

          <SvgRenderer
            svgRef={svgRef}
            syllable={displaySyllable}
            schema={schemaWithPadding}
            size={previewSize}
            fillColor="#e5e5e5"
            backgroundColor="transparent"
            showDebugBoxes
            globalStyle={effectiveStyle}
          >
            {/* 레이아웃 모드 오버레이 (자모 편집 중이 아닐 때) */}
            {!isJamoEditing && (
              <>
                {schema.splits && schema.splits.length > 0 && (
                  <SplitOverlay
                    svgRef={svgRef}
                    viewBoxSize={100}
                    splits={schema.splits}
                    onSplitChange={onSplitChange}
                    originValues={BASE_PRESETS_SCHEMAS[layoutType]?.splits?.map(s => s.value)}
                  />
                )}
                <PaddingOverlay
                  svgRef={svgRef}
                  viewBoxSize={100}
                  padding={effectivePadding}
                  containerBox={{ x: 0, y: 0, width: 1, height: 1 }}
                  onPaddingChange={onPaddingOverrideChange}
                  color={hasPaddingOverride ? '#ff9500' : '#a855f7'}
                  snapStep={0.005}
                />
              </>
            )}
          </SvgRenderer>

          {/* 파트 클릭 오버레이 (HTML 버튼) */}
          {(Object.entries(computedBoxes) as [Part, BoxConfig][]).map(
            ([part, box]) => (
              <button
                key={`part-overlay-${part}`}
                className={`absolute z-[3] border-2 transition-colors cursor-pointer rounded-sm ${
                  editingPartInLayout === part
                    ? 'border-accent-blue bg-accent-blue/15'
                    : 'border-transparent hover:border-accent-yellow/50 hover:bg-accent-yellow/5'
                }`}
                style={{
                  left: `${box.x * 100}%`,
                  top: `${box.y * 100}%`,
                  width: `${box.width * 100}%`,
                  height: `${box.height * 100}%`,
                }}
                onClick={(e) => {
                  e.stopPropagation()
                  onPartClick(part)
                }}
                title={`${part} (클릭: 자모 편집)`}
              >
                <span className="absolute top-0.5 left-1 text-[0.55rem] font-bold text-text-dim-4 drop-shadow-[0_0_2px_rgba(0,0,0,0.8)]">
                  {part}
                </span>
              </button>
            )
          )}
        </div>
      </div>

      {/* 연관 샘플 */}
      <RelatedSamplesPanel
        editingType={isJamoEditing && editingJamoType ? editingJamoType : 'layout'}
        editingChar={isJamoEditing && editingJamoChar ? editingJamoChar : null}
        layoutType={activeLayoutType}
        compact
      />
    </div>
  )
}
