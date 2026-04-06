import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { AI_ASSISTANT_MOBILE_MEDIA } from './aiAssistantGeometry'
import { persistCatPosition, readStoredCatPosition } from './useAIAssistantPet'

export { AI_CAT_STORAGE_X, AI_CAT_STORAGE_Y } from './useAIAssistantPet'

const DRAG_THRESHOLD_PX = 8
const MIN_VISIBLE = 56

function clampDock(left: number, top: number, width: number, height: number, vw: number, vh: number) {
  const minL = -width + MIN_VISIBLE
  const maxL = vw - MIN_VISIBLE
  const minT = -height + MIN_VISIBLE
  const maxT = vh - MIN_VISIBLE
  return {
    left: Math.min(maxL, Math.max(minL, left)),
    top: Math.min(maxT, Math.max(minT, top)),
  }
}

type DragSession = {
  pointerId: number
  startClientX: number
  startClientY: number
  originLeft: number
  originTop: number
  dragging: boolean
}

export type UseAIAssistantDockPositionOptions = {
  isMobile: boolean
  mobileAnchorEl: HTMLElement | null
}

export function useAIAssistantDockPosition(
  dockRef: RefObject<HTMLDivElement | null>,
  dragEnabled: boolean,
  onActivate: () => void,
  opts: UseAIAssistantDockPositionOptions,
) {
  const { isMobile, mobileAnchorEl } = opts

  const [customPos, setCustomPos] = useState<{ left: number; top: number } | null>(() =>
    dragEnabled ? readStoredCatPosition() : null,
  )

  const [anchoredPos, setAnchoredPos] = useState<{ left: number; top: number } | null>(null)

  const dragRef = useRef<DragSession | null>(null)
  const latestPosRef = useRef<{ left: number; top: number } | null>(null)

  useEffect(() => {
    if (customPos) latestPosRef.current = customPos
  }, [customPos])

  useEffect(() => {
    if (!dragEnabled) {
      setCustomPos(null)
      return
    }
    const stored = readStoredCatPosition()
    setCustomPos(stored)
  }, [dragEnabled])

  const clampAndSet = useCallback(
    (left: number, top: number) => {
      const el = dockRef.current
      const vw = window.innerWidth
      const vh = window.innerHeight
      const w = el?.offsetWidth ?? 160
      const h = el?.offsetHeight ?? 72
      const next = clampDock(left, top, w, h, vw, vh)
      latestPosRef.current = next
      setCustomPos(next)
      return next
    },
    [dockRef],
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

  useLayoutEffect(() => {
    if (!isMobile || !mobileAnchorEl) {
      setAnchoredPos(null)
      return
    }

    const update = () => {
      const dock = dockRef.current
      if (!dock) return
      const dockW = dock.offsetWidth
      const dockH = dock.offsetHeight
      const ar = mobileAnchorEl.getBoundingClientRect()
      const left = ar.right - dockW
      const top = ar.top + (ar.height - dockH) / 2
      const next = clampDock(left, top, dockW, dockH, window.innerWidth, window.innerHeight)
      setAnchoredPos((p) => (p && p.left === next.left && p.top === next.top ? p : next))
    }

    update()
    const ro = new ResizeObserver(update)
    ro.observe(mobileAnchorEl)
    const dockEl = dockRef.current
    if (dockEl) ro.observe(dockEl)
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      ro.disconnect()
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [isMobile, mobileAnchorEl, dockRef])

  const dockStyle = useMemo(() => {
    if (isMobile && mobileAnchorEl && anchoredPos) {
      return {
        left: anchoredPos.left,
        top: anchoredPos.top,
        right: 'auto' as const,
        bottom: 'auto' as const,
      }
    }
    if (dragEnabled && customPos) {
      return {
        left: customPos.left,
        top: customPos.top,
        right: 'auto' as const,
        bottom: 'auto' as const,
      }
    }
    return undefined
  }, [isMobile, mobileAnchorEl, anchoredPos, dragEnabled, customPos])

  const onDockPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!dragEnabled) return
      if (e.button !== 0) return
      const el = dockRef.current
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
    [dragEnabled, customPos, dockRef],
  )

  const onDockPointerMove = useCallback(
    (e: React.PointerEvent) => {
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

  const onDockPointerUp = useCallback(
    (e: React.PointerEvent) => {
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
        if (p) persistCatPosition(p.left, p.top)
      } else {
        onActivate()
      }
    },
    [dragEnabled, onActivate],
  )

  const onDockPointerCancel = useCallback((e: React.PointerEvent) => {
    dragRef.current = null
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* noop */
    }
  }, [])

  return {
    dockStyle,
    /** Shared drag/click handles for the cat hit-area and the red launcher button. */
    onDockPointerDown,
    onDockPointerMove,
    onDockPointerUp,
    onDockPointerCancel,
  }
}

export function useAIAssistantCatDragEnabled(): boolean {
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
