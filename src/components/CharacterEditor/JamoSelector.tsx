import { useState } from 'react'
import { CHOSEONG_LIST, JUNGSEONG_LIST, JONGSEONG_LIST } from '../../data/Hangul'
import { cn } from '@/lib/utils'

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
    <div className="flex flex-col gap-3">
      {/* 타입 탭 */}
      <div className="flex gap-2 p-2 bg-surface-2 rounded-md border border-border">
        <button
          className={cn(
            'flex-1 py-3 px-4 bg-transparent text-muted border-none rounded text-sm font-medium cursor-pointer transition-all duration-150 ease-in-out',
            'hover:bg-surface-3 hover:text-[#e5e5e5]',
            activeTab === 'choseong' && 'bg-primary text-white'
          )}
          onClick={() => setActiveTab('choseong')}
        >
          초성
        </button>
        <button
          className={cn(
            'flex-1 py-3 px-4 bg-transparent text-muted border-none rounded text-sm font-medium cursor-pointer transition-all duration-150 ease-in-out',
            'hover:bg-surface-3 hover:text-[#e5e5e5]',
            activeTab === 'jungseong' && 'bg-primary text-white'
          )}
          onClick={() => setActiveTab('jungseong')}
        >
          중성
        </button>
        <button
          className={cn(
            'flex-1 py-3 px-4 bg-transparent text-muted border-none rounded text-sm font-medium cursor-pointer transition-all duration-150 ease-in-out',
            'hover:bg-surface-3 hover:text-[#e5e5e5]',
            activeTab === 'jongseong' && 'bg-primary text-white'
          )}
          onClick={() => setActiveTab('jongseong')}
        >
          종성
        </button>
      </div>

      {/* 자모 그리드 */}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(50px,1fr))] gap-2 p-4 bg-surface-2 rounded-md border border-border max-h-[300px] overflow-y-auto">
        {jamoList[activeTab].map((char) => (
          <button
            key={char}
            className={cn(
              'py-3 bg-[#0f0f0f] text-[#e5e5e5] border border-border-lighter rounded text-[1.2rem] cursor-pointer transition-all duration-150 ease-in-out',
              'hover:bg-surface-3 hover:border-[#444]',
              selectedChar === char && selectedType === activeTab && 'bg-primary border-primary text-white'
            )}
            onClick={() => onSelect(activeTab, char)}
          >
            {char}
          </button>
        ))}
      </div>
    </div>
  )
}
