/**
 * 프로젝트 홈 화면
 *
 * 앱 시작 시 표시되며, 새 폰트 만들기 / 기존 폰트 열기 / 이어서 작업하기를 선택한다.
 */
import { useState, useEffect } from 'react'
import { Plus, FolderOpen, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useUIStore } from '../stores/uiStore'
import { useAuthStore } from '../stores/authStore'
import { useJamoStore } from '../stores/jamoStore'
import { useLayoutStore } from '../stores/layoutStore'
import { useGlobalStyleStore } from '../stores/globalStyleStore'
import { getRecentProjects, type RecentProject } from '../utils/recentProjects'
import { NavMenu } from './NavMenu'

export function HomePage() {
  const setCurrentPage = useUIStore((s) => s.setCurrentPage)
  const currentProjectId = useUIStore((s) => s.currentProjectId)
  const currentProjectName = useUIStore((s) => s.currentProjectName)
  const setCurrentProject = useUIStore((s) => s.setCurrentProject)
  const user = useAuthStore((s) => s.user)

  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([])

  useEffect(() => {
    setRecentProjects(getRecentProjects())
  }, [])

  const handleNewFont = () => {
    // 3개 스토어 기본값 리셋
    useJamoStore.getState().resetToBaseJamos()
    useLayoutStore.getState().resetToBasePresets()
    useGlobalStyleStore.getState().resetStyle()
    setCurrentProject(null, null)
    setCurrentPage('editor')
  }

  const handleOpenExisting = () => {
    setCurrentPage('projects')
  }

  const handleContinue = () => {
    setCurrentPage('editor')
  }

  const handleOpenRecent = () => {
    // 프로젝트 목록 페이지로 이동하여 unsaved-changes 가드를 거치도록 함
    setCurrentPage('projects')
  }

  return (
    <div className="flex flex-col h-full bg-background text-foreground">
      {/* 헤더 */}
      <header className="shrink-0 border-b border-border-subtle bg-[#0f0f0f]">
        <div className="flex items-center gap-3 px-4 py-3">
          <NavMenu />
          <h1 className="text-base font-semibold">폰트 메이커</h1>
        </div>
      </header>

      {/* 메인 콘텐츠 */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-md mx-auto px-4 py-8">
          <h2 className="text-lg font-semibold text-center mb-6">
            무엇을 하시겠습니까?
          </h2>

          {/* 주요 액션 버튼 */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            <button
              className="flex flex-col items-center gap-2 p-5 rounded-lg border border-border-subtle bg-surface-2 hover:bg-surface-3 transition-colors"
              onClick={handleNewFont}
            >
              <Plus className="h-6 w-6 text-primary" />
              <span className="text-sm font-medium">새 폰트 만들기</span>
              <span className="text-xs text-muted">빈 프로젝트 시작</span>
            </button>

            <button
              className="flex flex-col items-center gap-2 p-5 rounded-lg border border-border-subtle bg-surface-2 hover:bg-surface-3 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handleOpenExisting}
              disabled={!user}
            >
              <FolderOpen className="h-6 w-6 text-primary" />
              <span className="text-sm font-medium">기존 폰트 열기</span>
              <span className="text-xs text-muted">
                {user ? '저장된 프로젝트' : '로그인이 필요합니다'}
              </span>
            </button>
          </div>

          {/* 이어서 작업하기 */}
          {currentProjectId && (
            <button
              className="w-full flex items-center gap-3 p-4 mb-6 rounded-lg border border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors"
              onClick={handleContinue}
            >
              <ArrowRight className="h-5 w-5 text-primary shrink-0" />
              <div className="flex-1 min-w-0 text-left">
                <div className="text-sm font-medium">이어서 작업하기</div>
                <div className="text-xs text-muted truncate">
                  {currentProjectName || '이름 없는 프로젝트'}
                </div>
              </div>
            </button>
          )}

          {/* 최근 프로젝트 */}
          {user && recentProjects.length > 0 && (
            <div>
              <h3 className="text-xs font-medium text-muted uppercase tracking-wider mb-2">
                최근 프로젝트
              </h3>
              <div className="space-y-1">
                {recentProjects.map((project) => (
                  <Button
                    key={project.id}
                    variant="ghost"
                    className="w-full justify-start h-auto py-2.5 px-3"
                    onClick={handleOpenRecent}
                  >
                    <div className="flex-1 min-w-0 text-left">
                      <div className="text-sm truncate">{project.name}</div>
                      <div className="text-xs text-muted">
                        {new Date(project.updatedAt).toLocaleDateString('ko-KR', {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </div>
                    </div>
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
