/**
 * 프로젝트 관리 전체 페이지
 *
 * 기존 Popover 내 ProjectManager를 별도 페이지로 분리.
 * 프로젝트 목록, 새로 저장, 불러오기, 내보내기, 삭제 기능 포함.
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { useUIStore } from '../stores/uiStore'
import { useFontProject } from '../hooks/useFontProject'
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
    saveToProject,
    renameProject,
    loadProject,
    deleteProject,
    clearError,
  } = useFontProject()

  const [newName, setNewName] = useState('')
  const [showNameInput, setShowNameInput] = useState(false)
  const [editingNameId, setEditingNameId] = useState<string | null>(null)
  const [editingNameValue, setEditingNameValue] = useState('')
  const [exportingId, setExportingId] = useState<string | null>(null)
  const [exportProgress, setExportProgress] = useState('')
  const exportingRef = useRef(false)

  useEffect(() => {
    fetchProjects()
  }, [fetchProjects])

  const handleSaveAsNew = async () => {
    const name = newName.trim() || '새 폰트'
    await saveAsNew(name)
    setNewName('')
    setShowNameInput(false)
  }

  const handleLoad = async (id: string) => {
    if (!confirm('현재 편집 중인 데이터를 덮어씁니다.\n계속하시겠습니까?')) return
    await loadProject(id)
    setCurrentPage('editor')
  }

  const handleOverwrite = async (id: string, name: string) => {
    if (!confirm(`'${name}'에 현재 데이터를 덮어쓰시겠습니까?`)) return
    await saveToProject(id)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('이 프로젝트를 삭제하시겠습니까?')) return
    await deleteProject(id)
  }

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
            onClick={() => setCurrentPage('editor')}
            aria-label="편집기로 돌아가기"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-base font-semibold">프로젝트 관리</h1>
          <div className="ml-auto flex gap-2">
            {currentProjectId && (
              <Button size="sm" variant="default" onClick={saveCurrent} disabled={loading}>
                저장
              </Button>
            )}
            <Button
              size="sm"
              variant="default"
              onClick={() => setShowNameInput(!showNameInput)}
            >
              새로 저장
            </Button>
          </div>
        </div>

        {showNameInput && (
          <div className="flex gap-2 px-4 pb-3">
            <Input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="폰트 이름"
              className="flex-1 text-sm"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveAsNew()
              }}
              autoFocus
            />
            <Button size="sm" onClick={handleSaveAsNew} disabled={loading}>
              확인
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

              return (
                <div
                  key={project.id}
                  className={`px-4 py-3 hover:bg-surface-3 transition-colors ${
                    isCurrent ? 'bg-primary/10 border-l-2 border-l-primary' : ''
                  }`}
                >
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
                        <Button size="sm" variant="default" onClick={handleRenameCancel}>
                          취소
                        </Button>
                      </div>
                    ) : (
                      <div className="flex-1 min-w-0">
                        <div
                          className="text-sm font-medium text-foreground truncate cursor-pointer hover:text-primary"
                          onClick={() => handleStartRename(project.id, project.name)}
                          title="클릭하여 이름 변경"
                        >
                          {project.name}
                          {isCurrent && <span className="ml-1 text-xs text-primary">(현재)</span>}
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

                  {!isRenaming && (
                    <div className="flex gap-1.5 flex-wrap">
                      <Button size="sm" variant="default" onClick={() => handleLoad(project.id)} disabled={loading}>
                        불러오기
                      </Button>
                      <Button size="sm" variant="default" onClick={() => handleOverwrite(project.id, project.name)} disabled={loading}>
                        덮어쓰기
                      </Button>
                      <Button size="sm" variant="default" onClick={() => handleExportTTF(project.id, project.name)} disabled={loading || exportingId !== null}>
                        {exportingId === project.id ? exportProgress : 'TTF 내보내기'}
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => handleDelete(project.id)} disabled={loading}>
                        삭제
                      </Button>
                    </div>
                  )}

                  {exportingId === project.id && (
                    <>
                      <Separator className="my-2" />
                      <div className="text-xs text-muted">{exportProgress}</div>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
