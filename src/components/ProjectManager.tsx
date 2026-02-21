/**
 * 폰트 프로젝트 저장/불러오기 패널
 *
 * 상단 바에서 토글되는 드롭다운 형태
 */
import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useFontProject } from '../hooks/useFontProject'

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
    loadProject,
    deleteProject,
    clearError,
  } = useFontProject()

  const [newName, setNewName] = useState('')
  const [showNameInput, setShowNameInput] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

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

  const handleDelete = async (id: string) => {
    if (!confirm('이 프로젝트를 삭제하시겠습니까?')) return
    await deleteProject(id)
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
          projects.map((project) => (
            <div
              key={project.id}
              className={`flex items-center gap-2 px-4 py-2.5 border-b border-border-subtle hover:bg-surface-3 transition-colors ${
                project.id === currentProjectId ? 'bg-primary/10 border-l-2 border-l-primary' : ''
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground truncate">
                  {project.name}
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
              <div className="flex gap-1 shrink-0">
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
                  variant="danger"
                  onClick={() => handleDelete(project.id)}
                  disabled={loading}
                >
                  삭제
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
