/**
 * 폰트 프로젝트 저장/불러오기 패널
 *
 * 상단 바에서 토글되는 드롭다운 형태
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useFontProject } from '../hooks/useFontProject'
import { generateAndDownloadFont } from '../services/fontGenerator'

interface ProjectManagerProps {
  open: boolean
  onClose: () => void
}

export function ProjectManager({ open, onClose }: ProjectManagerProps) {
  const {
    projects,
    currentProjectId,
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
  // 이름 수정 중인 프로젝트 ID
  const [editingNameId, setEditingNameId] = useState<string | null>(null)
  const [editingNameValue, setEditingNameValue] = useState('')
  const [exportingId, setExportingId] = useState<string | null>(null)
  const [exportProgress, setExportProgress] = useState('')
  const panelRef = useRef<HTMLDivElement>(null)
  const exportingRef = useRef(false)

  // 열릴 때 목록 조회
  useEffect(() => {
    if (open) {
      fetchProjects()
    }
  }, [open, fetchProjects])

  // 외부 클릭 감지
  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    // 약간의 딜레이를 줘서 열기 버튼 클릭과 겹치지 않게
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside)
    }, 100)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [open, onClose])

  const handleSaveAsNew = async () => {
    const name = newName.trim() || '새 폰트'
    await saveAsNew(name)
    setNewName('')
    setShowNameInput(false)
  }

  const handleLoad = async (id: string) => {
    if (!confirm('현재 편집 중인 데이터를 덮어씁니다.\n계속하시겠습니까?')) return
    await loadProject(id)
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
      // 먼저 해당 프로젝트를 불러온 후 내보내기
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

  if (!open) return null

  return (
    <div
      ref={panelRef}
      className="absolute top-full left-0 mt-1 w-[360px] bg-surface-2 border border-border rounded-lg shadow-lg z-50 overflow-hidden"
    >
      {/* 헤더 */}
      <div className="px-4 py-3 border-b border-border-subtle bg-surface-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-foreground">프로젝트 관리</span>
          <div className="flex gap-2">
            {currentProjectId && (
              <Button
                size="sm"
                variant="default"
                onClick={saveCurrent}
                disabled={loading}
              >
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

        {/* 새 프로젝트 이름 입력 */}
        {showNameInput && (
          <div className="flex gap-2 mt-2">
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
      </div>

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
      <div className="max-h-[300px] overflow-y-auto">
        {loading && projects.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-muted">
            불러오는 중...
          </div>
        ) : projects.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-muted">
            저장된 프로젝트가 없습니다
          </div>
        ) : (
          projects.map((project) => {
            const isCurrent = project.id === currentProjectId
            const isRenaming = editingNameId === project.id

            return (
              <div
                key={project.id}
                className={`px-4 py-2.5 border-b border-border-subtle hover:bg-surface-3 transition-colors ${
                  isCurrent ? 'bg-primary/10 border-l-2 border-l-primary' : ''
                }`}
              >
                {/* 이름 + 날짜 */}
                <div className="flex items-center gap-2 mb-1.5">
                  {isRenaming ? (
                    <div className="flex-1 flex gap-1">
                      <Input
                        type="text"
                        value={editingNameValue}
                        onChange={(e) => setEditingNameValue(e.target.value)}
                        className="flex-1 text-sm h-7"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRenameConfirm()
                          if (e.key === 'Escape') handleRenameCancel()
                        }}
                        autoFocus
                      />
                      <Button size="sm" onClick={handleRenameConfirm} disabled={loading}>
                        ✓
                      </Button>
                      <Button size="sm" variant="default" onClick={handleRenameCancel}>
                        ✕
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
                      <div className="text-xs text-muted">
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
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => handleLoad(project.id)}
                      disabled={loading}
                    >
                      불러오기
                    </Button>
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => handleOverwrite(project.id, project.name)}
                      disabled={loading}
                    >
                      덮어쓰기
                    </Button>
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => handleExportTTF(project.id, project.name)}
                      disabled={loading || exportingId !== null}
                    >
                      {exportingId === project.id ? exportProgress : 'TTF'}
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => handleDelete(project.id)}
                      disabled={loading}
                    >
                      삭제
                    </Button>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
