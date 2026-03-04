/**
 * 최근 프로젝트 localStorage 캐시
 */
const RECENT_PROJECTS_KEY = 'font-maker-recent-projects'
const MAX_RECENT = 5

export interface RecentProject {
  id: string
  name: string
  updatedAt: string
}

export function getRecentProjects(): RecentProject[] {
  try {
    const raw = localStorage.getItem(RECENT_PROJECTS_KEY)
    if (!raw) return []
    return JSON.parse(raw) as RecentProject[]
  } catch {
    return []
  }
}

export function addRecentProject(id: string, name: string) {
  const recent = getRecentProjects().filter((p) => p.id !== id)
  recent.unshift({ id, name, updatedAt: new Date().toISOString() })
  localStorage.setItem(
    RECENT_PROJECTS_KEY,
    JSON.stringify(recent.slice(0, MAX_RECENT))
  )
}
