import { useMemo } from 'react'
import { useGlobalStyleStore } from '../../stores/globalStyleStore'
import { useUIStore } from '../../stores/uiStore'
import { useLayoutStore } from '../../stores/layoutStore'
import { useJamoStore } from '../../stores/jamoStore'
import { SvgRenderer } from '../../renderers/SvgRenderer'
import { decomposeSyllable, isHangul } from '../../utils/hangulUtils'
import { weightToMultiplier } from '../../stores/globalStyleStore'
import type { LayoutType, Padding } from '../../types'
import { cn } from '@/lib/utils'
import { Slider } from '@/components/ui/slider'
import type { SliderMark } from '@/components/ui/slider'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'

/** 두께 100~900 마크 (CSS font-weight 방식) */
const WEIGHT_MARKS: SliderMark[] = [
  { value: 100, label: '100' },
  { value: 200 },
  { value: 300, label: '300' },
  { value: 400, label: '400' },
  { value: 500 },
  { value: 600, label: '600' },
  { value: 700, label: '700' },
  { value: 800 },
  { value: 900, label: '900' },
]

const PADDING_SIDES: Array<{ key: keyof Padding; label: string }> = [
  { key: 'top', label: '상단' },
  { key: 'bottom', label: '하단' },
  { key: 'left', label: '좌측' },
  { key: 'right', label: '우측' },
]

const LAYOUT_TYPES: Array<{ type: LayoutType; label: string }> = [
  { type: 'choseong-only', label: '초성만' },
  { type: 'jungseong-vertical-only', label: '세로중성만' },
  { type: 'jungseong-horizontal-only', label: '가로중성만' },
  { type: 'jungseong-mixed-only', label: '혼합중성만' },
  { type: 'choseong-jungseong-vertical', label: '초+세로중' },
  { type: 'choseong-jungseong-horizontal', label: '초+가로중' },
  { type: 'choseong-jungseong-mixed', label: '초+혼합중' },
  { type: 'choseong-jungseong-vertical-jongseong', label: '초+세로중+종' },
  { type: 'choseong-jungseong-horizontal-jongseong', label: '초+가로중+종' },
  { type: 'choseong-jungseong-mixed-jongseong', label: '초+혼합중+종' },
]

export function GlobalStyleEditor() {
  const {
    style,
    exclusions,
    updateStyle,
    addExclusion,
    removeExclusion,
    hasExclusion,
    getEffectiveStyle,
    resetStyle,
  } = useGlobalStyleStore()
  const { inputText, selectedCharIndex } = useUIStore()
  const { getLayoutSchema, getEffectivePadding, globalPadding, updateGlobalPadding } = useLayoutStore()
  const { choseong, jungseong, jongseong } = useJamoStore()

  // 선택된 글자 기반 미리보기 음절
  const previewSyllable = useMemo(() => {
    const hangulChars = inputText.split('').filter(isHangul)
    const selectedChar = hangulChars[selectedCharIndex]
    if (selectedChar) {
      return decomposeSyllable(selectedChar, choseong, jungseong, jongseong)
    }
    // 기본값
    return decomposeSyllable('한', choseong, jungseong, jongseong)
  }, [inputText, selectedCharIndex, choseong, jungseong, jongseong])

  const handleExclusionToggle = (
    property: 'slant' | 'weight' | 'letterSpacing',
    layoutType: LayoutType
  ) => {
    const id = `${property}-${layoutType}`
    if (hasExclusion(property, layoutType)) {
      removeExclusion(id)
    } else {
      addExclusion(property, layoutType)
    }
  }

  const previewSchema = getLayoutSchema(previewSyllable.layoutType)
  const previewPadding = getEffectivePadding(previewSyllable.layoutType)
  const previewEffectiveStyle = getEffectiveStyle(previewSyllable.layoutType)

  return (
    <div className="flex  gap-4">
      {/* 미리보기 */}

        <div className="flex flex-1 justify-center p-2 bg-background rounded">
          <SvgRenderer
            syllable={previewSyllable}
            schema={{ ...previewSchema, padding: previewPadding }}
            size={160}
            fillColor="#e5e5e5"
            backgroundColor="#1a1a1a"
            globalStyle={previewEffectiveStyle}
          />
        </div>
        {/* 속성 편집 묶음 */}
      <div className="flex-1 p-2 flex-col bg-surface rounded-md border border-border-subtle flex gap-4">
      {/* 리셋 */}
      <Button
        variant="outline"
        className="w-full"
        onClick={resetStyle}
      >
        전체 초기화
      </Button>

      {/* 기울기 */}
      <div className="p-4 bg-surface rounded-md border border-border-subtle">
        <h4 className="text-sm font-medium m-0 mb-4 text-text-dim-4 uppercase tracking-wider">
          기울기 (Slant)
        </h4>
        <div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-base text-text-dim-1 font-medium">각도</span>
            <span className="text-sm text-text-dim-4 font-mono bg-surface-2 px-2 py-0.5 rounded-sm">
              {style.slant.toFixed(1)}°
            </span>
          </div>
          <Slider
            min={-30}
            max={30}
            step={0.5}
            value={[style.slant]}
            onValueChange={([val]) => updateStyle('slant', val)}
            originValue={0}
          />
        </div>
      </div>

      {/* 두께 */}
      <div className="p-4 bg-surface rounded-md border border-border-subtle">
        <h4 className="text-sm font-medium m-0 mb-4 text-text-dim-4 uppercase tracking-wider">
          두께 (Weight)
        </h4>
        <div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-base text-text-dim-1 font-medium">{style.weight}</span>
            <span className="text-sm text-text-dim-4 font-mono bg-surface-2 px-2 py-0.5 rounded-sm">
              {weightToMultiplier(style.weight).toFixed(2)}x
            </span>
          </div>
          <Slider
            min={100}
            max={900}
            step={100}
            value={[style.weight]}
            onValueChange={([val]) => updateStyle('weight', val)}
            marks={WEIGHT_MARKS}
            originValue={400}
          />
        </div>
      </div>

      {/* 자간 */}
      <div className="p-4 bg-surface rounded-md border border-border-subtle">
        <h4 className="text-sm font-medium m-0 mb-4 text-text-dim-4 uppercase tracking-wider">
          자간 (Letter Spacing)
        </h4>
        <div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-base text-text-dim-1 font-medium">간격</span>
            <span className="text-sm text-text-dim-4 font-mono bg-surface-2 px-2 py-0.5 rounded-sm">
              {(style.letterSpacing * 100).toFixed(0)}%
            </span>
          </div>
          <Slider
            min={0}
            max={0.3}
            step={0.01}
            value={[style.letterSpacing]}
            onValueChange={([val]) => updateStyle('letterSpacing', val)}
            originValue={0}
          />
        </div>
      </div>

      {/* 글로벌 여백 */}
      <div className="p-4 bg-surface rounded-md border border-border-subtle">
        <h4 className="text-sm font-medium m-0 mb-4 text-text-dim-4 uppercase tracking-wider">
          여백 (Padding)
        </h4>

        <div className="grid grid-cols-2 gap-4">
          {PADDING_SIDES.map(({ key, label }) => (
            <div key={key}>
              <div className="flex justify-between items-center mb-2">
                <span className="text-base text-text-dim-1 font-medium">{label}</span>
                <span className="text-sm text-text-dim-4 font-mono bg-surface-2 px-2 py-0.5 rounded-sm">
                  {(globalPadding[key] * 100).toFixed(0)}%
                </span>
              </div>
              <Slider
                min={0}
                max={0.3}
                step={0.01}
                value={[globalPadding[key]]}
                onValueChange={([val]) => updateGlobalPadding(key, val)}
                colorScheme="padding"
                originValue={0}
              />
            </div>
          ))}
        </div>
      </div>

      {/* 레이아웃별 제외 설정 */}
      {(style.slant !== 0 ||
        style.weight !== 400 ||
        style.letterSpacing !== 0) && (
        <div className="p-4 bg-surface rounded-md border border-border-subtle">
          <h4 className="text-sm font-medium m-0 mb-4 text-text-dim-4 uppercase tracking-wider">
            레이아웃별 제외
          </h4>
          <p className="text-[0.8rem] text-text-dim-5 m-0 mb-3 leading-relaxed">
            특정 레이아웃에서 글로벌 속성을 적용하지 않으려면 체크하세요.
          </p>

          <div className="flex flex-col gap-1 max-h-[300px] overflow-y-auto">
            {LAYOUT_TYPES.map(({ type, label }) => {
              const hasAnyExclusion =
                hasExclusion('slant', type) ||
                hasExclusion('weight', type) ||
                hasExclusion('letterSpacing', type)

              return (
                <div
                  key={type}
                  className={cn(
                    'flex justify-between items-center px-3 py-2 rounded transition-colors',
                    hasAnyExclusion
                      ? 'bg-[rgba(255,107,107,0.08)] border border-[rgba(255,107,107,0.15)]'
                      : 'bg-background'
                  )}
                >
                  <span className="text-[0.8rem] text-text-dim-2 min-w-[100px]">
                    {label}
                  </span>
                  <div className="flex gap-3">
                    {style.slant !== 0 && (
                      <label className="flex items-center gap-1 cursor-pointer">
                        <Checkbox
                          checked={hasExclusion('slant', type)}
                          onCheckedChange={() =>
                            handleExclusionToggle('slant', type)
                          }
                        />
                        <span className="text-xs text-text-dim-4">기울기</span>
                      </label>
                    )}
                    {style.weight !== 400 && (
                      <label className="flex items-center gap-1 cursor-pointer">
                        <Checkbox
                          checked={hasExclusion('weight', type)}
                          onCheckedChange={() =>
                            handleExclusionToggle('weight', type)
                          }
                        />
                        <span className="text-xs text-text-dim-4">두께</span>
                      </label>
                    )}
                    {style.letterSpacing !== 0 && (
                      <label className="flex items-center gap-1 cursor-pointer">
                        <Checkbox
                          checked={hasExclusion('letterSpacing', type)}
                          onCheckedChange={() =>
                            handleExclusionToggle('letterSpacing', type)
                          }
                        />
                        <span className="text-xs text-text-dim-4">자간</span>
                      </label>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {exclusions.length > 0 && (
            <p className="text-xs text-accent-red mt-2 m-0 text-right">
              {exclusions.length}개 제외 규칙 적용 중
            </p>
          )}
        </div>
      )}
      </div>
    </div>
  )
}
