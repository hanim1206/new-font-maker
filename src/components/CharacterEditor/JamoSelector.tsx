import { useState } from 'react'
import { CHOSEONG_LIST, JUNGSEONG_LIST, JONGSEONG_LIST } from '../../data/Hangul'
import styles from './CharacterEditor.module.css'

interface JamoSelectorProps {
  selectedType: 'choseong' | 'jungseong' | 'jongseong' | null
  selectedChar: string | null
  onSelect: (type: 'choseong' | 'jungseong' | 'jongseong', char: string) => void
}

export function JamoSelector({ selectedType, selectedChar, onSelect }: JamoSelectorProps) {
  const [activeTab, setActiveTab] = useState<'choseong' | 'jungseong' | 'jongseong'>(
    selectedType || 'choseong'
  )

  const jamoList = {
    choseong: CHOSEONG_LIST,
    jungseong: JUNGSEONG_LIST,
    jongseong: JONGSEONG_LIST.filter((c) => c !== ''), // 빈 문자열 제외
  }

  return (
    <div className={styles.jamoSelector}>
      {/* 타입 탭 */}
      <div className={styles.tabs}>
        <button
          className={activeTab === 'choseong' ? styles.tabActive : ''}
          onClick={() => setActiveTab('choseong')}
        >
          초성
        </button>
        <button
          className={activeTab === 'jungseong' ? styles.tabActive : ''}
          onClick={() => setActiveTab('jungseong')}
        >
          중성
        </button>
        <button
          className={activeTab === 'jongseong' ? styles.tabActive : ''}
          onClick={() => setActiveTab('jongseong')}
        >
          종성
        </button>
      </div>

      {/* 자모 그리드 */}
      <div className={styles.jamoGrid}>
        {jamoList[activeTab].map((char) => (
          <button
            key={char}
            className={selectedChar === char && selectedType === activeTab ? styles.jamoActive : ''}
            onClick={() => onSelect(activeTab, char)}
          >
            {char}
          </button>
        ))}
      </div>
    </div>
  )
}
