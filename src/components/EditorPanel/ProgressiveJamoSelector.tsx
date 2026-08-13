import { useEffect, useMemo, useState } from 'react'
import type { SyllableGridMeta } from '../../utils/syllableGridUtils'

interface ProgressiveJamoSelectorProps {
  syllables: SyllableGridMeta[]
  focusedSyllable: string | null
  onSelect: (meta: SyllableGridMeta) => void
}

type JamoKey = 'cho' | 'jung' | 'jong'

const STEPS: { key: JamoKey; number: number; label: string }[] = [
  { key: 'cho', number: 1, label: '초성' },
  { key: 'jung', number: 2, label: '중성' },
  { key: 'jong', number: 3, label: '종성' },
]

function uniqueValues(syllables: SyllableGridMeta[], key: JamoKey): string[] {
  return Array.from(new Set(syllables.map((syllable) => syllable[key])))
}

/** 긴 완성형 목록 대신 초성 → 중성 → 종성을 단계적으로 조합한다. */
export function ProgressiveJamoSelector({ syllables, focusedSyllable, onSelect }: ProgressiveJamoSelectorProps) {
  const focused = useMemo(
    () => syllables.find((syllable) => syllable.char === focusedSyllable) ?? syllables[0] ?? null,
    [focusedSyllable, syllables],
  )
  const [selection, setSelection] = useState(() => ({
    cho: focused?.cho ?? '',
    jung: focused?.jung ?? '',
    jong: focused?.jong ?? '',
  }))

  useEffect(() => {
    if (!focused) return
    setSelection({ cho: focused.cho, jung: focused.jung, jong: focused.jong })
  }, [focused])

  const options = useMemo(() => ({
    cho: uniqueValues(syllables, 'cho'),
    jung: uniqueValues(
      syllables.filter((syllable) => !selection.cho || syllable.cho === selection.cho),
      'jung',
    ),
    jong: uniqueValues(
      syllables.filter((syllable) =>
        (!selection.cho || syllable.cho === selection.cho) &&
        (!selection.jung || syllable.jung === selection.jung)
      ),
      'jong',
    ),
  }), [selection.cho, selection.jung, syllables])
  const hasJongseong = useMemo(
    () => syllables.some((syllable) => syllable.jong !== ''),
    [syllables],
  )
  const visibleSteps = hasJongseong ? STEPS : STEPS.slice(0, 2)

  const handleSelect = (key: JamoKey, value: string) => {
    const next = {
      cho: key === 'cho' ? value : selection.cho,
      jung: key === 'jung' ? value : selection.jung,
      jong: key === 'jong' ? value : selection.jong,
    }
    const candidates = syllables.filter((syllable) =>
      syllable.cho === next.cho &&
      (key === 'cho' || syllable.jung === next.jung) &&
      (key === 'jong' ? syllable.jong === next.jong : true)
    )
    const resolved = candidates.find((syllable) =>
      syllable.jung === next.jung && syllable.jong === next.jong
    ) ?? candidates[0]
    if (!resolved) return
    setSelection({ cho: resolved.cho, jung: resolved.jung, jong: resolved.jong })
    onSelect(resolved)
  }

  if (!focused) {
    return <div className="p-4 text-xs text-text-dim-5">선택할 수 있는 조합이 없습니다.</div>
  }

  return (
    <div className="flex-1 min-h-0 bg-[#080808] p-4 flex flex-col gap-3">
      <div className="shrink-0 rounded-lg border border-border-subtle bg-[#101010] px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-[11px] text-text-dim-5">자모를 순서대로 선택해 조합하세요</p>
          <p className="mt-1 text-sm text-text-dim-2">
            {selection.cho} <span className="text-text-dim-5">+</span> {selection.jung}
            {selection.jong && <> <span className="text-text-dim-5">+</span> {selection.jong}</>}
          </p>
        </div>
        <div className="w-12 h-12 rounded-md bg-white text-neutral-900 flex items-center justify-center text-2xl font-semibold">
          {focused.char}
        </div>
      </div>

      <div className={`grid gap-3 min-h-0 ${hasJongseong ? 'grid-cols-3' : 'grid-cols-2'}`}>
        {visibleSteps.map((step) => (
          <section key={step.key} className="rounded-lg border border-border-subtle bg-[#101010] p-3 flex flex-col gap-3">
            <h3 className="text-xs font-semibold text-text-dim-2 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-accent-blue text-white flex items-center justify-center text-[10px]">
                {step.number}
              </span>
              {step.label}
            </h3>
            <div className="flex flex-wrap content-start gap-1.5">
              {options[step.key].map((value) => {
                const selected = selection[step.key] === value
                return (
                  <button
                    key={`${step.key}-${value || 'none'}`}
                    type="button"
                    onClick={() => handleSelect(step.key, value)}
                    aria-pressed={selected}
                    className={`min-w-8 h-8 px-2 rounded text-sm transition-colors ${
                      selected
                        ? 'bg-accent-blue text-white font-semibold'
                        : 'border border-border bg-surface-2 text-text-dim-2 hover:bg-surface-hover hover:text-foreground'
                    }`}
                  >
                    {value || '없음'}
                  </button>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
