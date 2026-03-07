/**
 * 헤더/툴바에 노출되는 저장 버튼
 *
 * - currentProjectId가 있으면 덮어쓰기 저장 (saveCurrent)
 * - 없으면 "다른 이름으로 저장" 다이얼로그 (saveAsNew)
 * - 로그인 필요 시 인증 다이얼로그 표시
 */
import { useState, useCallback } from 'react'
import { Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { useUIStore } from '../stores/uiStore'
import { useAuthGuard } from '../hooks/useAuthGuard'
import { useFontProject } from '../hooks/useFontProject'

export function SaveButton() {
  const currentProjectId = useUIStore((s) => s.currentProjectId)
  const guardedAction = useAuthGuard()
  const { saveCurrent, saveAsNew, loading: projectLoading } = useFontProject()

  const [saving, setSaving] = useState(false)
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [saveAsName, setSaveAsName] = useState('')

  const handleClick = useCallback(() => {
    guardedAction(async () => {
      if (currentProjectId) {
        // 기존 프로젝트 덮어쓰기
        setSaving(true)
        try {
          await saveCurrent()
        } finally {
          setSaving(false)
        }
      } else {
        // 새 프로젝트 — 이름 입력 팝오버
        setPopoverOpen(true)
      }
    }, '저장하려면 로그인하세요')
  }, [currentProjectId, guardedAction, saveCurrent])

  const handleSaveAs = useCallback(async () => {
    const name = saveAsName.trim() || '새 폰트'
    setSaving(true)
    try {
      await saveAsNew(name)
      setPopoverOpen(false)
      setSaveAsName('')
    } finally {
      setSaving(false)
    }
  }, [saveAsName, saveAsNew])

  return (
    <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0 p-1.5"
          onClick={handleClick}
          disabled={saving || projectLoading}
          aria-label="저장"
        >
          <Save className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" side="bottom" className="w-64 p-3">
        <div className="flex flex-col gap-2">
          <label className="text-xs text-muted">프로젝트 이름</label>
          <div className="flex gap-1.5">
            <input
              type="text"
              value={saveAsName}
              onChange={(e) => setSaveAsName(e.target.value)}
              placeholder="새 폰트"
              className="flex-1 bg-surface-2 border border-border-subtle rounded px-2 py-1 text-sm text-foreground"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveAs()
                if (e.key === 'Escape') setPopoverOpen(false)
              }}
              autoFocus
            />
            <Button size="sm" onClick={handleSaveAs} disabled={saving}>
              {saving ? '...' : '저장'}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
