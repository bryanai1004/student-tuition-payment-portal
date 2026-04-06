import { useCallback, useEffect, useState } from 'react'
import { AI_ASSISTANT_MOBILE_MEDIA } from './aiAssistantGeometry'

export const AI_CAT_STORAGE_X = 'amu-ai-cat-x'
export const AI_CAT_STORAGE_Y = 'amu-ai-cat-y'
/** Stored as the string `"true"` when hidden. */
export const AI_CAT_HIDDEN_KEY = 'amu-ai-cat-hidden'

export function readStoredCatPosition(): { left: number; top: number } | null {
  try {
    const xs = localStorage.getItem(AI_CAT_STORAGE_X)
    const ys = localStorage.getItem(AI_CAT_STORAGE_Y)
    if (xs == null || ys == null) return null
    const left = Number(xs)
    const top = Number(ys)
    if (!Number.isFinite(left) || !Number.isFinite(top)) return null
    return { left, top }
  } catch {
    return null
  }
}

export function persistCatPosition(left: number, top: number): void {
  try {
    localStorage.setItem(AI_CAT_STORAGE_X, String(Math.round(left)))
    localStorage.setItem(AI_CAT_STORAGE_Y, String(Math.round(top)))
  } catch {
    /* ignore quota / private mode */
  }
}

function readCatHiddenFromStorage(): boolean {
  try {
    return localStorage.getItem(AI_CAT_HIDDEN_KEY) === 'true'
  } catch {
    return false
  }
}

function persistCatHidden(hidden: boolean): void {
  try {
    localStorage.setItem(AI_CAT_HIDDEN_KEY, hidden ? 'true' : 'false')
  } catch {
    /* ignore */
  }
}

/** Desktop/tablet floating dock: ~132px visible; mobile banner cluster stays compact. */
export function useAIAssistantCatDisplaySize(): number {
  const [px, setPx] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia(AI_ASSISTANT_MOBILE_MEDIA).matches ? 70 : 132,
  )

  useEffect(() => {
    const mq = window.matchMedia(AI_ASSISTANT_MOBILE_MEDIA)
    const sync = () => setPx(mq.matches ? 70 : 132)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  return px
}

export function useAIAssistantCatContextMenuEnabled(): boolean {
  const [enabled, setEnabled] = useState(() =>
    typeof window !== 'undefined' ? !window.matchMedia(AI_ASSISTANT_MOBILE_MEDIA).matches : true,
  )

  useEffect(() => {
    const mq = window.matchMedia(AI_ASSISTANT_MOBILE_MEDIA)
    const onChange = () => setEnabled(!mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return enabled
}

export function useAIAssistantPet() {
  const [catHidden, setCatHidden] = useState(readCatHiddenFromStorage)

  const hideCat = useCallback(() => {
    persistCatHidden(true)
    setCatHidden(true)
  }, [])

  const showCat = useCallback(() => {
    persistCatHidden(false)
    setCatHidden(false)
  }, [])

  return { catHidden, hideCat, showCat }
}
