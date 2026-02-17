import { useMemo } from 'react'
import { useUIStore } from '../../stores/uiStore'
import { useLayoutStore } from '../../stores/layoutStore'
import { useJamoStore } from '../../stores/jamoStore'
import { useGlobalStyleStore } from '../../stores/globalStyleStore'
import { SplitEditor } from './SplitEditor'
import { RelatedSamplesPanel } from './RelatedSamplesPanel'
import { SvgRenderer } from '../../renderers/SvgRenderer'
import { decomposeSyllable } from '../../utils/hangulUtils'
import { copyJsonToClipboard } from '../../utils/storage'
import { Button } from '@/components/ui/button'
import type { LayoutType } from '../../types'

interface LayoutEditorProps {
  layoutType: LayoutType
}

export function LayoutEditor({ layoutType }: LayoutEditorProps) {
  const { inputText, selectedCharIndex } = useUIStore()
  const {
    getLayoutSchema,
    getEffectivePadding,
    hasPaddingOverride,
    resetLayoutSchema,
    getCalculatedBoxes,
    exportSchemas,
    resetToBasePresets,
    _hydrated,
  } = useLayoutStore()
  const { choseong, jungseong, jongseong } = useJamoStore()
  const { getEffectiveStyle } = useGlobalStyleStore()

  const schema = getLayoutSchema(layoutType)
  const effectivePadding = getEffectivePadding(layoutType)
  const schemaWithPadding = useMemo(
    () => ({ ...schema, padding: effectivePadding }),
    [schema, effectivePadding]
  )
  const effectiveStyle = getEffectiveStyle(layoutType)

  // 테스트용 음절 (선택한 음절 우선, 없으면 입력 텍스트의 첫 번째 음절 또는 기본값)
  const testSyllable = useMemo(() => {
    // 선택한 음절이 있고 레이아웃 타입이 일치하면 사용
    if (inputText && selectedCharIndex >= 0) {
      const hangulChars = inputText.split('').filter((char) => {
        const code = char.charCodeAt(0)
        return (code >= 0xac00 && code <= 0xd7a3) || // 완성형
          (code >= 0x3131 && code <= 0x314e) || // 자음
          (code >= 0x314f && code <= 0x3163)    // 모음
      })
      const selectedChar = hangulChars[selectedCharIndex]
      if (selectedChar) {
        const syllable = decomposeSyllable(selectedChar, choseong, jungseong, jongseong)
        // 레이아웃 타입이 일치하는지 확인
        if (syllable.layoutType === layoutType) {
          return syllable
        }
      }
    }

    // 입력 텍스트의 첫 번째 음절 확인
    const firstChar = inputText.trim()[0]
    if (firstChar) {
      const syllable = decomposeSyllable(firstChar, choseong, jungseong, jongseong)
      // 레이아웃 타입이 일치하는지 확인
      if (syllable.layoutType === layoutType) {
        return syllable
      }
    }

    // 레이아웃 타입에 맞는 기본 테스트 문자
    const testChars: Record<string, string> = {
      'choseong-only': 'ㄱ',
      'jungseong-vertical-only': 'ㅣ',
      'jungseong-horizontal-only': 'ㅡ',
      'jungseong-mixed-only': 'ㅢ',
      'choseong-jungseong-vertical': '가',
      'choseong-jungseong-horizontal': '고',
      'choseong-jungseong-mixed': '괘',
      'choseong-jungseong-vertical-jongseong': '한',
      'choseong-jungseong-horizontal-jongseong': '공',
      'choseong-jungseong-mixed-jongseong': '궝',
    }

    return decomposeSyllable(testChars[layoutType] || '한', choseong, jungseong, jongseong)
  }, [inputText, selectedCharIndex, layoutType, choseong, jungseong, jongseong])

  const handleSave = () => {
    // Schema 기반이므로 변경사항은 자동으로 store에 반영됨 (LocalStorage에도 자동 저장)
    // 콘솔에 현재 schema 출력 (디버그용)
    console.log('\n📋 현재 LayoutSchema:\n')
    console.log(JSON.stringify(schema, null, 2))

    // 계산된 boxes도 출력
    const boxes = getCalculatedBoxes(layoutType)
    console.log('\n📦 계산된 BoxConfig:\n')
    console.log(JSON.stringify(boxes, null, 2))

    alert('레이아웃 설정이 저장되었습니다!\n(LocalStorage에 자동 저장됨)')
  }

  const handleReset = () => {
    if (confirm(`'${layoutType}' 레이아웃을 기본값으로 되돌리시겠습니까?`)) {
      resetLayoutSchema(layoutType)
    }
  }

  const handleExport = async () => {
    const json = exportSchemas()
    const ok = await copyJsonToClipboard(json)
    if (ok) {
      alert('JSON이 클립보드에 복사되었습니다.\nsrc/data/basePresets.json에 붙여넣으세요.')
    } else {
      alert('클립보드 복사에 실패했습니다.')
    }
  }

  const handleResetAll = () => {
    if (confirm('모든 레이아웃을 기본값으로 되돌리시겠습니까?\n저장된 작업이 모두 사라집니다.')) {
      resetToBasePresets()
    }
  }

  // Hydration 전에는 로딩 표시
  if (!_hydrated) {
    return (
      <div className="h-full overflow-y-auto p-5">
        <div className="flex items-center justify-center h-[200px] text-text-dim-5 text-base">로딩 중...</div>
      </div>
    )
  }

  if (!schema) {
    return (
      <div className="h-full overflow-y-auto p-5">
        <p>레이아웃 스키마를 불러올 수 없습니다.</p>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto flex flex-col">
      {/* 변경 감지 배지 */}
      {/* {modified && (
        <Badge variant="modified" className="flex items-center gap-2 px-3.5 py-2.5 text-sm mb-4 w-fit ">
          <span className="w-2 h-2 bg-accent-yellow rounded-full animate-pulse-dot" />
          수정됨 (basePresets.json과 다름)
        </Badge>
      )} */}


      {/* 버튼 영역 */}
      <div className="flex gap-3 pb-4 border-b border-border-subtle">
        <Button variant="blue" className="flex-1" onClick={handleSave}>
          저장
        </Button>
        <Button variant="default" className="flex-1" onClick={handleReset}>
          되돌리기
        </Button>
        <Button variant="green" className="flex-1" onClick={handleExport}>
          JSON 내보내기
        </Button>
        <Button variant="danger" className="flex-1" onClick={handleResetAll}>
          전체 초기화
        </Button>
      </div>
      {/* 미리보기 + 레이아웃 설정 (가로 배치) */}
      <div className="flex gap-4 mt-4 flex-1">
        {/* 미리보기 영역 + 기준선 오버레이 */}
        <div className="shrink-0 p-4 bg-surface rounded-md border border-border-subtle">
          <h3 className="text-sm font-medium mb-3 text-text-dim-3 uppercase tracking-wider">미리보기</h3>
          <div className="flex justify-center p-3 bg-background rounded mb-2">
            <div className="relative inline-block" style={{ backgroundColor: '#1a1a1a' }}>
              {/* 0.025 스냅 그리드 */}
              <svg
                className="absolute inset-0 pointer-events-none z-0"
                width={200}
                height={200}
                viewBox="0 0 100 100"
              >
                {Array.from({ length: 39 }, (_, i) => {
                  const v = (i + 1) * 2.5 // 0.025 * 100
                  return (
                    <g key={`grid-${i}`}>
                      <line x1={v} y1={0} x2={v} y2={100} stroke="#333" strokeWidth={0.2} />
                      <line x1={0} y1={v} x2={100} y2={v} stroke="#333" strokeWidth={0.2} />
                    </g>
                  )
                })}
                {/* 10% 단위 강조선 */}
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
                syllable={testSyllable}
                schema={schemaWithPadding}
                size={200}
                fillColor="#e5e5e5"
                backgroundColor="transparent"
                showDebugBoxes={true}
                globalStyle={effectiveStyle}
              />
              {/* 패딩 오버라이드 시각화 */}
              {hasPaddingOverride(layoutType) && (() => {
                const p = effectivePadding
                const hr = 1.0 // visualHeightRatio
                return (
                  <>
                    {/* 상단 패딩 */}
                    <div
                      className="absolute left-0 right-0 bg-accent-orange/20 pointer-events-none z-[1]"
                      style={{ top: 0, height: `${(p.top / hr) * 100}%` }}
                    />
                    {/* 하단 패딩 */}
                    <div
                      className="absolute left-0 right-0 bottom-0 bg-accent-orange/20 pointer-events-none z-[1]"
                      style={{ height: `${(p.bottom / hr) * 100}%` }}
                    />
                    {/* 좌측 패딩 */}
                    <div
                      className="absolute top-0 bottom-0 bg-accent-orange/20 pointer-events-none z-[1]"
                      style={{ left: 0, width: `${p.left * 100}%` }}
                    />
                    {/* 우측 패딩 */}
                    <div
                      className="absolute top-0 bottom-0 right-0 bg-accent-orange/20 pointer-events-none z-[1]"
                      style={{ width: `${p.right * 100}%` }}
                    />
                  </>
                )
              })()}
              {/* 기준선 오버레이 */}
              {(schema.splits || []).map((split, index) =>
                split.axis === 'x' ? (
                  <div
                    key={`split-x-${index}`}
                    className="absolute top-0 bottom-0 w-0.5 bg-accent-red opacity-70 z-[2] pointer-events-none"
                    style={{ left: `${split.value * 100}%` }}
                  />
                ) : (
                  <div
                    key={`split-y-${index}`}
                    className="absolute left-0 right-0 h-0.5 bg-accent-cyan opacity-70 z-[2] pointer-events-none"
                    style={{ top: `${split.value * 100}%` }}
                  />
                )
              )}
            </div>
          </div>
          {/* 연관 샘플 (미리보기 아래) */}
          <RelatedSamplesPanel
            editingType="layout"
            editingChar={null}
            layoutType={layoutType}
            compact
          />
        </div>

        {/* Split/Padding 편집기 */}
        <div className="flex-1 min-w-0 overflow-y-auto ">
          <h3 className="text-sm font-medium mb-3 text-text-dim-3 uppercase tracking-wider">레이아웃 설정</h3>
          <SplitEditor layoutType={layoutType} />
        </div>
      </div>



    </div>
  )
}
