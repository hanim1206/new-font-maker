import { useSyncExternalStore } from 'react'

interface DeviceCapability {
  isMobile: boolean
  isTouch: boolean
  hasFinePointer: boolean
}

function getSnapshot(): DeviceCapability {
  const isTouch = window.matchMedia('(pointer: coarse)').matches
  const hasFinePointer = window.matchMedia('(pointer: fine)').matches
  const isMobile = isTouch && window.innerWidth <= 768
  return { isMobile, isTouch, hasFinePointer }
}

function getServerSnapshot(): DeviceCapability {
  return { isMobile: false, isTouch: false, hasFinePointer: true }
}

let cachedSnapshot = typeof window !== 'undefined' ? getSnapshot() : getServerSnapshot()
const listeners = new Set<() => void>()

function subscribe(callback: () => void) {
  listeners.add(callback)

  const queries = [
    window.matchMedia('(pointer: coarse)'),
    window.matchMedia('(pointer: fine)'),
  ]

  const handleChange = () => {
    cachedSnapshot = getSnapshot()
    listeners.forEach((l) => l())
  }

  const handleResize = () => {
    cachedSnapshot = getSnapshot()
    listeners.forEach((l) => l())
  }

  queries.forEach((q) => q.addEventListener('change', handleChange))
  window.addEventListener('resize', handleResize)

  return () => {
    listeners.delete(callback)
    queries.forEach((q) => q.removeEventListener('change', handleChange))
    window.removeEventListener('resize', handleResize)
  }
}

export function useDeviceCapability(): DeviceCapability {
  return useSyncExternalStore(subscribe, () => cachedSnapshot, getServerSnapshot)
}
