/**
 * 폰트 프로젝트 관리 React 훅
 *
 * Supabase CRUD + 스토어 동기화를 하나의 인터페이스로 제공
 */
import { useState, useCallback } from 'react'
import { fontProjectService } from '../services/fontProjectService'
import { collectFontData, applyFontData, validateFontData } from '../services/fontDataBridge'
import type { FontProject } from '../types/database'

interface UseFontProjectReturn {
  // 상태
  projects: FontProject[]
  currentProjectId: string | null
  loading: boolean
  error: string | null

  // 액션
  fetchProjects: () => Promise<void>
  saveAsNew: (name: string) => Promise<FontProject>
  saveCurrent: () => Promise<void>
  loadProject: (id: string) => Promise<void>
  deleteProject: (id: string) => Promise<void>
  clearError: () => void
}

export function useFontProject(): UseFontProjectReturn {
  const [projects, setProjects] = useState<FontProject[]>([])
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const clearError = useCallback(() => setError(null), [])

  // 프로젝트 목록 조회
  const fetchProjects = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await fontProjectService.list()
      setProjects(list)
    } catch (e) {
      setError(e instanceof Error ? e.message : '목록 조회 실패')
    } finally {
      setLoading(false)
    }
  }, [])

  // 새 프로젝트로 저장
  const saveAsNew = useCallback(async (name: string): Promise<FontProject> => {
    setLoading(true)
    setError(null)
    try {
      const fontData = collectFontData()
      const project = await fontProjectService.create({
        name,
        font_data: fontData,
      })
      setCurrentProjectId(project.id)
      // 목록 갱신
      setProjects((prev) => [project, ...prev])
      return project
    } catch (e) {
      const msg = e instanceof Error ? e.message : '저장 실패'
      setError(msg)
      throw e
    } finally {
      setLoading(false)
    }
  }, [])

  // 현재 프로젝트 덮어쓰기 저장
  const saveCurrent = useCallback(async () => {
    if (!currentProjectId) {
      setError('저장할 프로젝트가 선택되지 않았습니다')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const fontData = collectFontData()
      const updated = await fontProjectService.update(currentProjectId, {
        font_data: fontData,
      })
      // 목록에서 해당 프로젝트 갱신
      setProjects((prev) =>
        prev.map((p) => (p.id === updated.id ? updated : p))
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장 실패')
    } finally {
      setLoading(false)
    }
  }, [currentProjectId])

  // 프로젝트 불러오기
  const loadProject = useCallback(async (id: string) => {
    setLoading(true)
    setError(null)
    try {
      const project = await fontProjectService.get(id)
      if (!project) {
        setError('프로젝트를 찾을 수 없습니다')
        return
      }

      // 데이터 유효성 검사
      if (!validateFontData(project.font_data)) {
        setError('폰트 데이터가 손상되었습니다')
        return
      }

      // 3개 스토어에 적용
      applyFontData(project.font_data)
      setCurrentProjectId(project.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : '불러오기 실패')
    } finally {
      setLoading(false)
    }
  }, [])

  // 프로젝트 삭제
  const deleteProject = useCallback(async (id: string) => {
    setLoading(true)
    setError(null)
    try {
      await fontProjectService.remove(id)
      setProjects((prev) => prev.filter((p) => p.id !== id))
      // 현재 프로젝트가 삭제되면 초기화
      if (currentProjectId === id) {
        setCurrentProjectId(null)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '삭제 실패')
    } finally {
      setLoading(false)
    }
  }, [currentProjectId])

  return {
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
  }
}
