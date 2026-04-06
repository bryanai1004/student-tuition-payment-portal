import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent, RefObject } from 'react'

/** Same threshold as cat / launcher dock (`useAIAssistantDockPosition`). */
const DRAG_THRESHOLD_PX = 8
/** Same as `MIN_VISIBLE` in `useAIAssistantDockPosition` — keep bar mostly on-screen. */
const MIN_VISIBLE = 56

export const AMU_AI_MINIMIZED_X = 'amu-ai-minimized-x'
export const AMU_AI_MINIMIZED_Y = 'amu-ai-minimized-y'

function clampMinimizedBar(
  left: number,
  top: number,
  width: number,
  height: number,
  vw: number,
  vh: number,
) {
  const minL = -width + MIN_VISIBLE
  const maxL = vw - MIN_VISIBLE
  const minT = -height + MIN_VISIBLE
  const maxT = vh - MIN_VISIBLE
  return {
    left: Math.min(maxL, Math.max(minL, left)),
    top: Math.min(maxT, Math.max(minT, top)),
  }
}

function readStoredMinimizedPosition(): { left: number; top: number } | null {
  if (typeof localStorage === 'undefined') return null
  const xs = localStorage.getItem(AMU_AI_MINIMIZED_X)
  const ys = localStorage.getItem(AMU_AI_MINIMIZED_Y)
  if (!xs || !ys) return null
  const left = Number(xs)
  const top = Number(ys)
  if (!Number.isFinite(left) || !Number.isFinite(top)) return null
  return { left, top }
}

function persistMinimizedPosition(left: number, top: number) {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(AMU_AI_MINIMIZED_X, String(Math.round(left)))
  localStorage.setItem(AMU_AI_MINIMIZED_Y, String(Math.round(top)))
}

type DragSession = {
  pointerId: number
  startClientX: number
  startClientY: number
  originLeft: number
  originTop: number
  dragging: boolean
}

type UseOptions = {
  /** When false (mobile), skip drag + storage restore; use `fallbackStyle` only. */
  dragEnabled: boolean
  fallbackStyle: CSSProperties | undefined
}

/**
 * Desktop minimized bar: same click-vs-drag threshold as the dock cluster; persists `left`/`top`.
 */
export function useAIAssistantMinimizedBarDrag(
  barRef: RefObject<HTMLDivElement | null>,
  expandPanel: () => void,
  { dragEnabled, fallbackStyle }: UseOptions,
) {
  const [customPos, setCustomPos] = useState<{ left: number; top: number } | null>(() =>
    dragEnabled ? readStoredMinimizedPosition() : null,
  )

  const dragRef = useRef<DragSession | null>(null)
  const latestPosRef = useRef<{ left: number; top: number } | null>(null)

  useEffect(() => {
    latestPosRef.current = customPos
  }, [customPos])

  useEffect(() => {
    if (!dragEnabled) {
      setCustomPos(null)
      return
    }
    setCustomPos(readStoredMinimizedPosition())
  }, [dragEnabled])

  const clampAndSet = useCallback(
    (left: number, top: number) => {
      const el = barRef.current
      const vw = window.innerWidth
      const vh = window.innerHeight
      const w = el?.offsetWidth ?? 320
      const h = el?.offsetHeight ?? 56
      const next = clampMinimizedBar(left, top, w, h, vw, vh)
      latestPosRef.current = next
      setCustomPos(next)
      return next
    },
    [barRef],
  )

  useEffect(() => {
    if (!dragEnabled) return
    const onResize = () => {
      setCustomPos((prev) => {
        if (!prev) return prev
        return clampAndSet(prev.left, prev.top)
      })
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [dragEnabled, clampAndSet])

  const mergedStyle = useMemo((): CSSProperties | undefined => {
    if (!fallbackStyle) return fallbackStyle
    if (!dragEnabled || !customPos) return fallbackStyle
    return {
      ...fallbackStyle,
      left: customPos.left,
      top: customPos.top,
    }
  }, [dragEnabled, customPos, fallbackStyle])

  const onMinimizedBarPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!dragEnabled) return
      if (e.button !== 0) return
      const el = barRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const originLeft = customPos?.left ?? rect.left
      const originTop = customPos?.top ?? rect.top
      dragRef.current = {
        pointerId: e.pointerId,
        startClientX: e.clientX,
        startClientY: e.clientY,
        originLeft,
        originTop,
        dragging: false,
      }
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    [dragEnabled, customPos, barRef],
  )

  const onMinimizedBarPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const d = dragRef.current
      if (!d || e.pointerId !== d.pointerId || !dragEnabled) return
      const dx = e.clientX - d.startClientX
      const dy = e.clientY - d.startClientY
      if (!d.dragging) {
        if (dx * dx + dy * dy < DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) return
        d.dragging = true
      }
      clampAndSet(d.originLeft + dx, d.originTop + dy)
    },
    [dragEnabled, clampAndSet],
  )

  const onMinimizedBarPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const d = dragRef.current
      if (!d || e.pointerId !== d.pointerId || !dragEnabled) return
      const wasDragging = d.dragging
      dragRef.current = null
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {
        /* already released */
      }
      if (wasDragging) {
        const p = latestPosRef.current
        if (p) persistMinimizedPosition(p.left, p.top)
      } else {
        expandPanel()
      }
    },
    [dragEnabled, expandPanel],
  )

  const onMinimizedBarPointerCancel = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    dragRef.current = null
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* noop */
    }
  }, [])

  return {
    mergedMinimizedWrapStyle: mergedStyle,
    onMinimizedBarPointerDown,
    onMinimizedBarPointerMove,
    onMinimizedBarPointerUp,
    onMinimizedBarPointerCancel,
    /** When true, expand is triggered via pointer-up (threshold), not `onClick`. */
    expandUsesPointerGesture: dragEnabled,
  }
}
