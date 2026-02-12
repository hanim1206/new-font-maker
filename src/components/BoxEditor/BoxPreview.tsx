import { useMemo, useState } from 'react'
import { useJamoStore } from '../../stores/jamoStore'
import { decomposeSyllable } from '../../utils/hangulUtils'
import { SvgRenderer } from '../../renderers/SvgRenderer'
import type { LayoutType, BoxConfig, DecomposedSyllable } from '../../types'
import styles from './BoxEditor.module.css'

interface BoxPreviewProps {
  layoutType: LayoutType
  boxes: Record<string, BoxConfig>
  syllable?: DecomposedSyllable
  onEditJamo?: (type: 'choseong' | 'jungseong' | 'jongseong', char: string) => void
}

// 레이아웃 타입별 샘플 글자
const LAYOUT_SAMPLES: Record<LayoutType, string> = {
  'choseong-only': 'ㄱ',
  'jungseong-vertical-only': 'ㅏ',
  'jungseong-horizontal-only': 'ㅗ',
  'jungseong-mixed-only': 'ㅢ',
  'choseong-jungseong-vertical': '가',
  'choseong-jungseong-horizontal': '고',
  'choseong-jungseong-mixed': '희',
  'choseong-jungseong-vertical-jongseong': '간',
  'choseong-jungseong-horizontal-jongseong': '곤',
  'choseong-jungseong-mixed-jongseong': '획',
}

export function BoxPreview({ layoutType, boxes, syllable: providedSyllable, onEditJamo }: BoxPreviewProps) {
  const { choseong, jungseong, jongseong } = useJamoStore()
  const sampleChar = LAYOUT_SAMPLES[layoutType]
  const [hoveredPart, setHoveredPart] = useState<string | null>(null)

  const syllable = useMemo(() => {
    if (providedSyllable) {
      return providedSyllable
    }
    return decomposeSyllable(sampleChar, choseong, jungseong, jongseong)
  }, [providedSyllable, sampleChar, choseong, jungseong, jongseong])

  const displayChar = providedSyllable ? providedSyllable.char : sampleChar

  const handlePartClick = (part: string) => {
    if (!onEditJamo || !syllable) return

    if (part === 'CH' || part.startsWith('CH')) {
      if (syllable.choseong) {
        onEditJamo('choseong', syllable.choseong.char)
      }
    } else if (part.startsWith('JU')) {
      if (syllable.jungseong) {
        onEditJamo('jungseong', syllable.jungseong.char)
      }
    } else if (part === 'JO') {
      if (syllable.jongseong) {
        onEditJamo('jongseong', syllable.jongseong.char)
      }
    }
  }

  const getJamoChar = (part: string): string => {
    if (!syllable) return ''
    if ((part === 'CH' || part.startsWith('CH')) && syllable.choseong) return syllable.choseong.char
    if (part.startsWith('JU') && syllable.jungseong) return syllable.jungseong.char
    if (part === 'JO' && syllable.jongseong) return syllable.jongseong.char
    return ''
  }

  return (
    <div className={styles.previewContainer}>
      <div className={styles.previewBox} style={{ position: 'relative' }}>
        <SvgRenderer
          syllable={syllable}
          boxes={boxes}
          size={120}
          fillColor="#e5e5e5"
          backgroundColor="#1a1a1a"
          showDebugBoxes={true}
        />

        {/* 클릭 가능한 오버레이 */}
        {onEditJamo && (
          <svg
            width={120}
            height={120}
            viewBox="0 0 100 100"
            style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'all' }}
          >
            {Object.entries(boxes).map(([part, box]) => {
              const jamoChar = getJamoChar(part)
              if (!jamoChar) return null

              return (
                <g key={part}>
                  <rect
                    x={box.x * 100}
                    y={box.y * 100}
                    width={box.width * 100}
                    height={box.height * 100}
                    fill="transparent"
                    stroke={hoveredPart === part ? '#7c3aed' : 'transparent'}
                    strokeWidth={2}
                    style={{ cursor: 'pointer' }}
                    onMouseEnter={() => setHoveredPart(part)}
                    onMouseLeave={() => setHoveredPart(null)}
                    onClick={() => handlePartClick(part)}
                  />
                  {hoveredPart === part && (
                    <text
                      x={box.x * 100 + (box.width * 100) / 2}
                      y={box.y * 100 + (box.height * 100) / 2}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill="#7c3aed"
                      fontSize="8"
                      fontWeight="bold"
                      style={{ pointerEvents: 'none' }}
                    >
                      ✏️ {jamoChar}
                    </text>
                  )}
                </g>
              )
            })}
          </svg>
        )}
      </div>
      <span className={styles.sampleChar}>{displayChar}</span>
    </div>
  )
}
