import { useUIStore } from '../stores/uiStore'
import { classifyJungseong } from './hangulUtils'
import type { LayoutType, Part } from '../types'

const LAYOUT_TYPES: LayoutType[] = [
  'choseong-only',
  'jungseong-vertical-only',
  'jungseong-horizontal-only',
  'jungseong-mixed-only',
  'choseong-jungseong-vertical',
  'choseong-jungseong-horizontal',
  'choseong-jungseong-mixed',
  'choseong-jungseong-vertical-jongseong',
  'choseong-jungseong-horizontal-jongseong',
  'choseong-jungseong-mixed-jongseong',
]

const LAYOUT_TYPE_SET = new Set<string>(LAYOUT_TYPES)

export type JamoType = 'choseong' | 'jungseong' | 'jongseong'

export type AppRoute =
  | { page: 'home' }
  | { page: 'projects' }
  | {
      page: 'editor'
      layoutType: LayoutType
      jamo?: { type: JamoType; char: string }
    }

export interface AppRouteHistoryState {
  fontMakerRoute: true
  index: number
  route: AppRoute
  parentPath?: string
}

export interface AppRoutePopDetail {
  route: AppRoute
  state: AppRouteHistoryState | null
}

export const APP_ROUTE_POP_EVENT = 'font-maker:route-pop'

function decodePathSegment(segment: string): string | null {
  try {
    return decodeURIComponent(segment)
  } catch {
    return null
  }
}

function isLayoutType(value: string): value is LayoutType {
  return LAYOUT_TYPE_SET.has(value)
}

function isJamoType(value: string): value is JamoType {
  return value === 'choseong' || value === 'jungseong' || value === 'jongseong'
}

export function parseAppRoute(pathname: string): AppRoute {
  const decodedSegments = pathname.split('/').filter(Boolean).map(decodePathSegment)
  if (decodedSegments.some((segment) => segment === null)) return { page: 'home' }
  const segments = decodedSegments as string[]
  if (segments.length === 0) return { page: 'home' }
  if (segments.length === 1 && segments[0] === 'projects') return { page: 'projects' }

  if (segments[0] === 'editor' && segments[1] === 'layout' && isLayoutType(segments[2] ?? '')) {
    const layoutType = segments[2] as LayoutType
    if (segments.length === 3) return { page: 'editor', layoutType }
    if (
      segments.length === 6 &&
      segments[3] === 'jamo' &&
      isJamoType(segments[4] ?? '') &&
      [...(segments[5] ?? '')].length === 1
    ) {
      return {
        page: 'editor',
        layoutType,
        jamo: { type: segments[4] as JamoType, char: segments[5] },
      }
    }
  }

  return { page: 'home' }
}

export function appRouteToPath(route: AppRoute): string {
  if (route.page === 'home') return '/'
  if (route.page === 'projects') return '/projects'
  const layoutPath = `/editor/layout/${route.layoutType}`
  if (!route.jamo) return layoutPath
  return `${layoutPath}/jamo/${route.jamo.type}/${encodeURIComponent(route.jamo.char)}`
}

export function getCurrentRouteHistoryState(): AppRouteHistoryState | null {
  const state = window.history.state as Partial<AppRouteHistoryState> | null
  if (!state?.fontMakerRoute || typeof state.index !== 'number' || !state.route) return null
  return state as AppRouteHistoryState
}

export function replaceAppRoute(route: AppRoute, options?: { parentPath?: string }): AppRouteHistoryState {
  const current = getCurrentRouteHistoryState()
  const state: AppRouteHistoryState = {
    fontMakerRoute: true,
    index: current?.index ?? 0,
    route,
    ...(options?.parentPath ? { parentPath: options.parentPath } : {}),
  }
  window.history.replaceState(state, '', appRouteToPath(route))
  return state
}

export function pushAppRoute(route: AppRoute, options?: { parentPath?: string }): AppRouteHistoryState {
  const current = getCurrentRouteHistoryState()
  const state: AppRouteHistoryState = {
    fontMakerRoute: true,
    index: (current?.index ?? 0) + 1,
    route,
    ...(options?.parentPath ? { parentPath: options.parentPath } : {}),
  }
  window.history.pushState(state, '', appRouteToPath(route))
  return state
}

export function partForJamo(type: JamoType, char: string): Part {
  if (type === 'choseong') return 'CH'
  if (type === 'jongseong') return 'JO'
  return classifyJungseong(char) === 'mixed' ? 'JU_H' : 'JU'
}

export function applyAppRoute(route: AppRoute): void {
  const ui = useUIStore.getState()
  if (route.page === 'home' || route.page === 'projects') {
    ui.setCurrentPage(route.page)
    return
  }

  ui.setCurrentPage('editor')
  ui.setControlMode('layout')
  ui.setSelectedLayoutType(route.layoutType)
  if (route.jamo) {
    ui.setEditingJamo(route.jamo.type, route.jamo.char)
    ui.setEditingPartInLayout(partForJamo(route.jamo.type, route.jamo.char))
  } else {
    ui.setEditingPartInLayout(null)
  }
}

export function initializeAppRoute(): void {
  const route = parseAppRoute(window.location.pathname)
  const current = getCurrentRouteHistoryState()
  replaceAppRoute(route, { parentPath: current?.parentPath })
  applyAppRoute(route)
}
