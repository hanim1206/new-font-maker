import { useGlobalStyleStore, weightToMultiplier } from '../../stores/globalStyleStore'
import { Slider } from '@/components/ui/slider'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import type { SliderMark } from '@/components/ui/slider'
import type { StrokeLinecap } from '../../types'

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

const CAP_OPTIONS: Array<{ value: StrokeLinecap; label: string }> = [
  { value: 'round', label: '둥글게' },
  { value: 'butt', label: '납작하게' },
]

function CapIcon({ cap }: { cap: StrokeLinecap }) {
  return (
    <svg width="26" height="10" viewBox="0 0 26 10" fill="none">
      <line x1="3" y1="5" x2="23" y2="5" stroke="currentColor" strokeWidth="7" strokeLinecap={cap} />
    </svg>
  )
}

function CapStylePicker({ linecap, onChange }: { linecap: StrokeLinecap; onChange: (v: StrokeLinecap) => void }) {
  return (
    <div className="flex gap-1">
      {CAP_OPTIONS.map(({ value, label }) => (
        <button
          key={value}
          title={label}
          onClick={() => onChange(value)}
          className={cn(
            'h-7 px-2.5 rounded text-xs flex items-center gap-1.5 border transition-all duration-150 cursor-pointer',
            linecap === value
              ? 'bg-accent-blue border-accent-blue text-white'
              : 'bg-surface-2 border-border text-text-dim-3 hover:bg-surface-hover hover:text-foreground hover:border-border-light'
          )}
        >
          <CapIcon cap={value} />
          <span>{label}</span>
        </button>
      ))}
    </div>
  )
}

interface GlobalQuickControlsProps {
  vertical?: boolean
}

export function GlobalQuickControls({ vertical = false }: GlobalQuickControlsProps) {
  const { style, updateStyle, updateLinecap } = useGlobalStyleStore()

  if (vertical) {
    return (
      <div className="shrink-0 px-4 py-10 bg-[#0a0a0a] flex flex-col gap-6">
        {/* 기울기 */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-text-dim-4 shrink-0 w-10">기울기</span>
          <div className="flex-1 min-w-0">
            <Slider
              min={-30}
              max={30}
              step={0.5}
              value={[style.slant]}
              onValueChange={([val]) => updateStyle('slant', val)}
              originValue={0}
            />
          </div>
          <span className="text-xs text-text-dim-5 font-mono shrink-0 w-12 text-right">
            {style.slant.toFixed(1)}°
          </span>
        </div>

        {/* 두께 */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-text-dim-4 shrink-0 w-10">두께</span>
          <div className="flex-1 min-w-0">
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
          <span className="text-xs text-text-dim-5 font-mono shrink-0 w-12 text-right">
            {weightToMultiplier(style.weight).toFixed(2)}x
          </span>
        </div>

        {/* 캡 스타일 */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-text-dim-4 shrink-0 w-10">캡</span>
          <CapStylePicker linecap={style.linecap} onChange={updateLinecap} />
        </div>
      </div>
    )
  }

  return (
    <div className="shrink-0 px-4 py-3 border-b border-border-subtle bg-[#0a0a0a] flex gap-6 items-center">
      {/* 기울기 */}
      <div className="flex-1 flex items-center gap-3 min-w-0">
        <span className="text-xs text-text-dim-4 shrink-0 w-10">기울기</span>
        <div className="flex-1 min-w-0">
          <Slider
            min={-30}
            max={30}
            step={0.5}
            value={[style.slant]}
            onValueChange={([val]) => updateStyle('slant', val)}
            originValue={0}
          />
        </div>
        <span className="text-xs text-text-dim-5 font-mono shrink-0 w-12 text-right">
          {style.slant.toFixed(1)}°
        </span>
      </div>

      <Separator orientation="vertical" className="h-5" />

      {/* 두께 */}
      <div className="flex-1 flex items-center gap-3 min-w-0">
        <span className="text-xs text-text-dim-4 shrink-0 w-6">두께</span>
        <div className="flex-1 min-w-0">
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
        <span className="text-xs text-text-dim-5 font-mono shrink-0 w-12 text-right">
          {weightToMultiplier(style.weight).toFixed(2)}x
        </span>
      </div>

      <Separator orientation="vertical" className="h-5" />

      {/* 캡 스타일 */}
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-xs text-text-dim-4">캡</span>
        <CapStylePicker linecap={style.linecap} onChange={updateLinecap} />
      </div>
    </div>
  )
}
