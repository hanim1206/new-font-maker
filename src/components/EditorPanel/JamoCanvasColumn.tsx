import { useRef } from 'react'
import { SvgRenderer } from '../../renderers/SvgRenderer'
import type { PartStyle } from '../../renderers/SvgRenderer'
import { StrokeOverlay } from '../CharacterEditor/StrokeOverlay'
import { PaddingOverlay } from '../CharacterEditor/PaddingOverlay'
import type { DecomposedSyllable, BoxConfig, LayoutSchema, Part, Padding, StrokeDataV2 } from '../../types'
import type { GlobalStyle } from '../../stores/globalStyleStore'

interface MixedJungseongData {
  isMixed: boolean
  juHBox: BoxConfig | undefined
  juVBox: BoxConfig | undefined
  horizontalStrokeIds: Set<string>
  verticalStrokeIds: Set<string>
}

interface JamoCanvasColumnProps {
  // 음절 데이터
  displaySyllable: DecomposedSyllable
  schemaWithPadding: LayoutSchema
  effectiveStyle: GlobalStyle
  partStyles: Partial<Record<Part, PartStyle>> | undefined
  // 자모 편집 상태
  isJamoEditing: boolean
  draftStrokes: StrokeDataV2[]
  editingBox: BoxConfig | null
  editingJamoInfo: { type: 'choseong' | 'jungseong' | 'jongseong'; char: string } | null
  // 혼합중성
  mixedJungseongData: MixedJungseongData | null
  // 패딩
  editingJamoPadding: Padding | undefined
  editingHorizontalPadding: Padding | undefined
  editingVerticalPadding: Padding | undefined
  isPaddingDirty: boolean
  selectedStrokeId: string | null
  globalStyleRaw: GlobalStyle
  // 핸들러
  onStrokeChange: (strokeId: string, prop: string, value: number | string | boolean | undefined) => void
  onPointChange: (strokeId: string, pointIndex: number, field: 'x' | 'y' | 'handleIn' | 'handleOut', value: { x: number; y: number } | number) => void
  onDragStart: () => void
  onJamoPaddingChange: (type: 'choseong' | 'jungseong' | 'jongseong', char: string, side: keyof Padding, val: number) => void
  onMixedJamoPaddingChange: (char: string, part: 'horizontal' | 'vertical', side: keyof Padding, val: number) => void
}

/** 중앙 자모 획 캔버스 컬럼 */
export function JamoCanvasColumn({
  displaySyllable,
  schemaWithPadding,
  effectiveStyle,
  partStyles,
  isJamoEditing,
  draftStrokes,
  editingBox,
  editingJamoInfo,
  mixedJungseongData,
  editingJamoPadding,
  editingHorizontalPadding,
  editingVerticalPadding,
  isPaddingDirty,
  selectedStrokeId,
  globalStyleRaw,
  onStrokeChange,
  onPointChange,
  onDragStart,
  onJamoPaddingChange,
  onMixedJamoPaddingChange,
}: JamoCanvasColumnProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const previewSize = 300

  // 빈 상태
  if (!isJamoEditing) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-text-dim-5 text-sm text-center leading-relaxed">
          좌측 캔버스에서 파트를 클릭하면
          <br />
          자모 편집이 활성화됩니다
        </p>
      </div>
    )
  }

  const isStrokeSelected = !!selectedStrokeId
  const jamoPad = editingJamoPadding ?? { top: 0, bottom: 0, left: 0, right: 0 }

  return (
    <div className="h-full overflow-y-auto p-4">
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
            partStyles={partStyles}
          >
            {/* StrokeOverlay (자모 획 편집) — 반드시 PaddingOverlay보다 먼저 렌더링 */}
            {editingBox && draftStrokes.length > 0 && (
              <StrokeOverlay
                strokes={draftStrokes}
                box={mixedJungseongData?.juHBox || mixedJungseongData?.juVBox ? {
                  x: Math.min(mixedJungseongData.juHBox?.x ?? 1, mixedJungseongData.juVBox?.x ?? 1),
                  y: Math.min(mixedJungseongData.juHBox?.y ?? 1, mixedJungseongData.juVBox?.y ?? 1),
                  width: Math.max(
                    (mixedJungseongData.juHBox?.x ?? 0) + (mixedJungseongData.juHBox?.width ?? 0),
                    (mixedJungseongData.juVBox?.x ?? 0) + (mixedJungseongData.juVBox?.width ?? 0)
                  ) - Math.min(mixedJungseongData.juHBox?.x ?? 1, mixedJungseongData.juVBox?.x ?? 1),
                  height: Math.max(
                    (mixedJungseongData.juHBox?.y ?? 0) + (mixedJungseongData.juHBox?.height ?? 0),
                    (mixedJungseongData.juVBox?.y ?? 0) + (mixedJungseongData.juVBox?.height ?? 0)
                  ) - Math.min(mixedJungseongData.juHBox?.y ?? 1, mixedJungseongData.juVBox?.y ?? 1),
                } : editingBox}
                svgRef={svgRef}
                viewBoxSize={100}
                onStrokeChange={onStrokeChange}
                onPointChange={onPointChange}
                onDragStart={onDragStart}
                strokeColor="#e5e5e5"
                isMixed={!!mixedJungseongData}
                juHBox={mixedJungseongData?.juHBox}
                juVBox={mixedJungseongData?.juVBox}
                horizontalStrokeIds={mixedJungseongData?.horizontalStrokeIds}
                verticalStrokeIds={mixedJungseongData?.verticalStrokeIds}
                globalStyle={globalStyleRaw}
                jamoPadding={editingJamoPadding}
                horizontalPadding={editingHorizontalPadding}
                verticalPadding={editingVerticalPadding}
              />
            )}

            {/* PaddingOverlay — 반드시 StrokeOverlay 뒤에 렌더링 (이벤트 레이어링) */}
            {editingJamoInfo && editingBox && (() => {
              if (mixedJungseongData?.juHBox && mixedJungseongData?.juVBox) {
                const hPad = editingHorizontalPadding ?? jamoPad
                const vPad = editingVerticalPadding ?? jamoPad
                return (
                  <>
                    <PaddingOverlay
                      svgRef={svgRef}
                      viewBoxSize={100}
                      padding={hPad}
                      containerBox={mixedJungseongData.juHBox}
                      onPaddingChange={(side, val) =>
                        onMixedJamoPaddingChange(editingJamoInfo.char, 'horizontal', side, val)
                      }
                      color={isPaddingDirty ? '#ff9500' : '#a855f7'}
                      disabled={isStrokeSelected}
                    />
                    <PaddingOverlay
                      svgRef={svgRef}
                      viewBoxSize={100}
                      padding={vPad}
                      containerBox={mixedJungseongData.juVBox}
                      onPaddingChange={(side, val) =>
                        onMixedJamoPaddingChange(editingJamoInfo.char, 'vertical', side, val)
                      }
                      color={isPaddingDirty ? '#ffd700' : '#c084fc'}
                      disabled={isStrokeSelected}
                    />
                  </>
                )
              }

              return (
                <PaddingOverlay
                  svgRef={svgRef}
                  viewBoxSize={100}
                  padding={jamoPad}
                  containerBox={editingBox}
                  onPaddingChange={(side, val) =>
                    onJamoPaddingChange(editingJamoInfo.type, editingJamoInfo.char, side, val)
                  }
                  color={isPaddingDirty ? '#ff9500' : '#a855f7'}
                  disabled={isStrokeSelected}
                />
              )
            })()}
          </SvgRenderer>
        </div>
      </div>
    </div>
  )
}
