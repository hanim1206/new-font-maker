/**
 * 프로젝트 관리 전체 페이지
 *
 * 프로젝트 목록 탐색 + 관리 중심. 주요 동작 "열기" + 더보기 메뉴.
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { ArrowLeft, Plus, MoreHorizontal, Pencil, Copy, Download, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useUIStore } from '../stores/uiStore'
import { useFontProject } from '../hooks/useFontProject'
import { useUnsavedChanges } from '../hooks/useUnsavedChanges'
import { UnsavedChangesDialog } from './ui/UnsavedChangesDialog'
import { generateAndDownloadFont } from '../services/fontGenerator'

export function ProjectListPage() {
  const setCurrentPage = useUIStore((s) => s.setCurrentPage)
  const currentProjectId = useUIStore((s) => s.currentProjectId)

  const {
    projects,
    loading,
    error,
    fetchProjects,
    saveAsNew,
    saveCurrent,
    duplicateProject,
    renameProject,
    loadProject,
    deleteProject,
    clearError,
  } = useFontProject()

  const { isDirty, markAsSaved, markAsClean } = useUnsavedChanges()

  // 새 프로젝트 이름 입력
  const [showNewInput, setShowNewInput] = useState(false)
  const [newName, setNewName] = useState('')

  // 이름 편집
  const [editingNameId, setEditingNameId] = useState<string | null>(null)
  const [editingNameValue, setEditingNameValue] = useState('')

  // 삭제 확인 다이얼로그
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)

  // 미저장 변경 다이얼로그
  const [unsavedAction, setUnsavedAction] = useState<(() => void) | null>(null)
  const [unsavedSaving, setUnsavedSaving] = useState(false)

  // 내보내기
  const [exportingId, setExportingId] = useState<string | null>(null)
  const [exportProgress, setExportProgress] = useState('')
  const exportingRef = useRef(false)

  useEffect(() => {
    fetchProjects()
  }, [fetchProjects])

  // === 새 폰트 저장 ===
  const handleNewFont = () => {
    setShowNewInput(true)
    setNewName('')
  }

  const handleSaveAsNew = async () => {
    const name = newName.trim() || '새 폰트'
    await saveAsNew(name)
    markAsSaved()
    setNewName('')
    setShowNewInput(false)
  }

  // === 프로젝트 열기 (미저장 확인 포함) ===
  const handleOpenProject = (id: string) => {
    const doOpen = async () => {
      await loadProject(id)
      markAsClean()
      setCurrentPage('editor')
    }

    if (isDirty) {
      setUnsavedAction(() => doOpen)
    } else {
      doOpen()
    }
  }

  const handleUnsavedSaveAndContinue = async () => {
    setUnsavedSaving(true)
    const success = await saveCurrent()
    setUnsavedSaving(false)
    if (success) {
      markAsSaved()
      const action = unsavedAction
      setUnsavedAction(null)
      if (action) action()
    }
  }

  const handleUnsavedDiscardAndContinue = () => {
    const action = unsavedAction
    setUnsavedAction(null)
    if (action) action()
  }

  const handleUnsavedCancel = () => {
    setUnsavedAction(null)
  }

  // === 삭제 ===
  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return
    await deleteProject(deleteTarget.id)
    setDeleteTarget(null)
  }

  // === 복제 ===
  const handleDuplicate = async (id: string) => {
    await duplicateProject(id)
  }

  // === 내보내기 ===
  const handleExportTTF = useCallback(async (id: string, name: string) => {
    if (exportingRef.current) return
    exportingRef.current = true
    setExportingId(id)
    setExportProgress('준비 중...')
    try {
      await loadProject(id)
      const result = await generateAndDownloadFont({
        familyName: name,
        onProgress: (_completed, _total, phase) => {
          setExportProgress(phase)
        },
      })
      if (!result.success) {
        alert(`내보내기 실패: ${result.error}`)
      }
    } finally {
      setExportingId(null)
      setExportProgress('')
      exportingRef.current = false
    }
  }, [loadProject])

  // === 이름 변경 ===
  const handleStartRename = (id: string, currentName: string) => {
    setEditingNameId(id)
    setEditingNameValue(currentName)
  }

  const handleRenameConfirm = async () => {
    if (!editingNameId) return
    const trimmed = editingNameValue.trim()
    if (!trimmed) return
    await renameProject(editingNameId, trimmed)
    setEditingNameId(null)
    setEditingNameValue('')
  }

  const handleRenameCancel = () => {
    setEditingNameId(null)
    setEditingNameValue('')
  }

  return (
    <div className="flex flex-col h-full bg-background text-foreground">
      {/* 헤더 */}
      <header className="shrink-0 border-b border-border-subtle bg-[#0f0f0f]">
        <div className="flex items-center gap-3 px-4 py-3">
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 p-1.5"
            onClick={() => setCurrentPage('home')}
            aria-label="홈으로 돌아가기"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-base font-semibold">내 프로젝트</h1>
          <div className="ml-auto">
            <Button size="sm" variant="default" onClick={handleNewFont}>
              <Plus className="h-4 w-4 mr-1" />
              새 폰트
            </Button>
          </div>
        </div>

        {showNewInput && (
          <div className="flex gap-2 px-4 pb-3">
            <Input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="폰트 이름"
              className="flex-1 text-sm"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveAsNew()
                if (e.key === 'Escape') setShowNewInput(false)
              }}
              autoFocus
            />
            <Button size="sm" onClick={handleSaveAsNew} disabled={loading}>
              저장
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowNewInput(false)}>
              취소
            </Button>
          </div>
        )}
      </header>

      {/* 에러 표시 */}
      {error && (
        <div className="px-4 py-2 bg-red-900/30 border-b border-red-800/50">
          <div className="flex items-center justify-between">
            <span className="text-xs text-red-400">{error}</span>
            <button
              className="text-xs text-red-400 hover:text-red-300 cursor-pointer"
              onClick={clearError}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* 프로젝트 목록 */}
      <div className="flex-1 overflow-y-auto">
        {loading && projects.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-muted">
            불러오는 중...
          </div>
        ) : projects.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-muted">
            저장된 프로젝트가 없습니다
          </div>
        ) : (
          <div className="divide-y divide-border-subtle">
            {projects.map((project) => {
              const isCurrent = project.id === currentProjectId
              const isRenaming = editingNameId === project.id
              const isExporting = exportingId === project.id

              return (
                <div
                  key={project.id}
                  className={`px-4 py-3 hover:bg-surface-3 transition-colors ${
                    isCurrent ? 'bg-primary/10 border-l-2 border-l-primary' : ''
                  }`}
                >
                  {/* 프로젝트 정보 */}
                  <div className="flex items-center gap-2 mb-2">
                    {isRenaming ? (
                      <div className="flex-1 flex gap-1">
                        <Input
                          type="text"
                          value={editingNameValue}
                          onChange={(e) => setEditingNameValue(e.target.value)}
                          className="flex-1 text-sm h-8"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleRenameConfirm()
                            if (e.key === 'Escape') handleRenameCancel()
                          }}
                          autoFocus
                        />
                        <Button size="sm" onClick={handleRenameConfirm} disabled={loading}>
                          확인
                        </Button>
                        <Button size="sm" variant="ghost" onClick={handleRenameCancel}>
                          취소
                        </Button>
                      </div>
                    ) : (
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-foreground truncate">
                          {project.name}
                          {isCurrent && (
                            <span className="ml-1.5 text-xs text-primary font-normal">
                              (현재 편집 중)
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted mt-0.5">
                          {new Date(project.updated_at).toLocaleDateString('ko-KR', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 액션 버튼 */}
                  {!isRenaming && (
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => handleOpenProject(project.id)}
                        disabled={loading || isExporting}
                      >
                        열기
                      </Button>

                      {/* 더보기 메뉴 */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="p-1.5"
                            disabled={loading || isExporting}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                          <DropdownMenuItem onClick={() => handleStartRename(project.id, project.name)}>
                            <Pencil className="h-4 w-4 mr-2" />
                            이름 변경
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDuplicate(project.id)}>
                            <Copy className="h-4 w-4 mr-2" />
                            복제
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleExportTTF(project.id, project.name)}>
                            <Download className="h-4 w-4 mr-2" />
                            폰트 파일 내보내기
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-red-400 focus:text-red-400"
                            onClick={() => setDeleteTarget({ id: project.id, name: project.name })}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            삭제
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>

                      {isExporting && (
                        <span className="text-xs text-muted ml-2">{exportProgress}</span>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 삭제 확인 다이얼로그 */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>프로젝트 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              '{deleteTarget?.name}'을(를) 삭제하시겠습니까?
              이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              취소
            </Button>
            <Button variant="danger" onClick={handleDeleteConfirm} disabled={loading}>
              삭제
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 미저장 변경 다이얼로그 */}
      <UnsavedChangesDialog
        open={!!unsavedAction}
        onSaveAndContinue={handleUnsavedSaveAndContinue}
        onDiscardAndContinue={handleUnsavedDiscardAndContinue}
        onCancel={handleUnsavedCancel}
        saving={unsavedSaving}
      />
    </div>
  )
}
