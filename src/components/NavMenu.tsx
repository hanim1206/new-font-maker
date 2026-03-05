/**
 * 햄버거 네비게이션 메뉴
 *
 * PC/모바일 공용. Sheet(좌측 드로어)로 열리며
 * 유저 정보, 프로젝트 관리, 저장 등 앱 전역 액션을 포함한다.
 */
import { useState, useCallback } from 'react'
import { Menu, Home, FolderOpen, Save, FilePlus, LogIn, LogOut, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Separator } from '@/components/ui/separator'
import { useUIStore } from '../stores/uiStore'
import { useAuthStore } from '../stores/authStore'
import { useAuthDialogStore } from '../stores/authDialogStore'
import { useAuthGuard } from '../hooks/useAuthGuard'
import { useFontProject } from '../hooks/useFontProject'

export function NavMenu() {
  const [open, setOpen] = useState(false)
  const [showSaveAsInput, setShowSaveAsInput] = useState(false)
  const [saveAsName, setSaveAsName] = useState('')

  const currentProjectId = useUIStore((s) => s.currentProjectId)
  const currentProjectName = useUIStore((s) => s.currentProjectName)
  const setCurrentPage = useUIStore((s) => s.setCurrentPage)

  const user = useAuthStore((s) => s.user)
  const signOut = useAuthStore((s) => s.signOut)

  const openAuthDialog = useAuthDialogStore((s) => s.openWithAction)
  const guardedAction = useAuthGuard()

  const { saveCurrent, saveAsNew, loading: projectLoading } = useFontProject()
  const [saving, setSaving] = useState(false)

  const handleSave = useCallback(async () => {
    if (!currentProjectId || saving) return
    setSaving(true)
    try {
      await saveCurrent()
    } finally {
      setSaving(false)
    }
  }, [currentProjectId, saving, saveCurrent])

  const handleSaveAs = useCallback(async () => {
    const name = saveAsName.trim() || '새 폰트'
    setSaving(true)
    try {
      await saveAsNew(name)
      setShowSaveAsInput(false)
      setSaveAsName('')
    } finally {
      setSaving(false)
    }
  }, [saveAsName, saveAsNew])

  const handleGoHome = () => {
    setCurrentPage('home')
    setOpen(false)
  }

  const handleGoToProjects = () => {
    guardedAction(() => {
      setCurrentPage('projects')
      setOpen(false)
    }, '프로젝트를 열려면 로그인하세요')
  }

  const handleSaveAsClick = () => {
    guardedAction(() => {
      setShowSaveAsInput(!showSaveAsInput)
    }, '저장하려면 로그인하세요')
  }

  const handleLoginClick = () => {
    openAuthDialog(null)
    setOpen(false)
  }

  const handleSignOut = async () => {
    try {
      await signOut()
      setOpen(false)
    } catch {
      // authStore.error에서 에러 표시
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="sm" className="shrink-0 p-1.5" aria-label="메뉴 열기">
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[280px] p-0 flex flex-col">
        <SheetHeader className="px-4 pt-4 pb-2">
          <SheetTitle className="text-base">폰트 메이커</SheetTitle>
          <SheetDescription className="sr-only">앱 메뉴</SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          {/* 유저 정보 섹션 */}
          <div className="px-4 py-3">
            {user ? (
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/20 text-primary shrink-0">
                  <User className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-foreground truncate">
                    {user.email}
                  </div>
                  <div className="text-xs text-muted">로그인됨</div>
                </div>
              </div>
            ) : (
              <button
                className="flex items-center gap-3 w-full text-left hover:bg-surface-3 rounded-lg p-2 -m-2 transition-colors"
                onClick={handleLoginClick}
              >
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-surface-3 text-muted shrink-0">
                  <LogIn className="h-4 w-4" />
                </div>
                <div className="text-sm text-muted">로그인 / 회원가입</div>
              </button>
            )}
          </div>

          <Separator />

          {/* 네비게이션 */}
          <div className="py-1">
            <button
              className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-foreground hover:bg-surface-3 transition-colors"
              onClick={handleGoHome}
            >
              <Home className="h-4 w-4 text-muted shrink-0" />
              <span>홈으로</span>
            </button>

            <button
              className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-foreground hover:bg-surface-3 transition-colors"
              onClick={handleGoToProjects}
            >
              <FolderOpen className="h-4 w-4 text-muted shrink-0" />
              <span>내 프로젝트</span>
            </button>
          </div>

          <Separator />

          {/* 프로젝트 액션 */}
          <div className="py-1">
            {currentProjectId && (
              <button
                className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-foreground hover:bg-surface-3 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={handleSave}
                disabled={saving || projectLoading}
              >
                <Save className="h-4 w-4 text-muted shrink-0" />
                <span>{saving ? '저장 중...' : '저장'}</span>
                {currentProjectName && (
                  <span className="ml-auto text-xs text-muted truncate max-w-[100px]">
                    {currentProjectName}
                  </span>
                )}
              </button>
            )}

            <button
              className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-foreground hover:bg-surface-3 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handleSaveAsClick}
              disabled={saving || projectLoading}
            >
              <FilePlus className="h-4 w-4 text-muted shrink-0" />
              <span>다른 이름으로 저장</span>
            </button>

            {showSaveAsInput && (
              <div className="flex gap-1 px-4 py-2">
                <input
                  type="text"
                  value={saveAsName}
                  onChange={(e) => setSaveAsName(e.target.value)}
                  placeholder="폰트 이름"
                  className="flex-1 bg-surface-2 border border-border-subtle rounded px-2 py-1 text-sm text-foreground"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveAs()
                    if (e.key === 'Escape') setShowSaveAsInput(false)
                  }}
                  autoFocus
                />
                <Button size="sm" onClick={handleSaveAs} disabled={saving}>
                  저장
                </Button>
              </div>
            )}
          </div>

        </div>

        {/* 하단: 로그아웃 */}
        {user && (
          <div className="border-t border-border-subtle p-4">
            <button
              className="flex items-center gap-3 w-full text-sm text-muted hover:text-foreground transition-colors"
              onClick={handleSignOut}
            >
              <LogOut className="h-4 w-4 shrink-0" />
              <span>로그아웃</span>
            </button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
