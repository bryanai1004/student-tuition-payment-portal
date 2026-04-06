import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  AI_ASSISTANT_MOBILE_MEDIA,
  clampGeometry,
  clampPosition,
  clampSize,
  maxWidthForViewport,
  persistGeometry,
  readStoredGeometryClamped,
  type AIAssistantStoredGeometry,
} from './aiAssistantGeometry'

const MINIMIZED_BAR_HEIGHT = 56

type DragSession = {
  pointerId: number
  startClientX: number
  startClientY: number
  originX: number
  originY: number
  width: number
  height: number
}

type ResizeSession = {
  pointerId: number
  kind: 'e' | 's' | 'se'
  startClientX: number
  startClientY: number
  width: number
  height: number
  x: number
  y: number
}

function setDragResizeChrome(active: boolean) {
  document.body.classList.toggle('portal-ai-assistant--drag-resize', active)
}

export function useAIAssistantPanelLayout() {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(AI_ASSISTANT_MOBILE_MEDIA).matches : false,
  )
  const [geom, setGeom] = useState<AIAssistantStoredGeometry>(() =>
    readStoredGeometryClamped(
      typeof window !== 'undefined' ? window.innerWidth : 1200,
      typeof window !== 'undefined' ? window.innerHeight : 800,
    ),
  )

  const geomRef = useRef(geom)
  geomRef.current = geom

  const dragRef = useRef<DragSession | null>(null)
  const resizeRef = useRef<ResizeSession | null>(null)

  useEffect(() => {
    const mq = window.matchMedia(AI_ASSISTANT_MOBILE_MEDIA)
    const onChange = () => setIsMobile(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  useEffect(
    () => () => {
      document.body.classList.remove('portal-ai-assistant--drag-resize')
    },
    [],
  )

  useEffect(() => {
    let persistTimer: number | null = null
    const onResize = () => {
      const vw = window.innerWidth
      const vh = window.innerHeight
      setGeom((g) => clampGeometry(g, vw, vh))
      if (persistTimer != null) window.clearTimeout(persistTimer)
      persistTimer = window.setTimeout(() => {
        persistTimer = null
        persistGeometry(geomRef.current)
      }, 200)
    }
    window.addEventListener('resize', onResize)
    return () => {
      if (persistTimer != null) window.clearTimeout(persistTimer)
      persistGeometry(geomRef.current)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  const onHeaderPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (isMobile) return
      if (e.button !== 0) return
      const t = e.target as HTMLElement
      if (t.closest('button')) return
      if (t.closest('textarea') || t.closest('input')) return

      e.preventDefault()
      const g = geomRef.current
      const headerEl = e.currentTarget
      dragRef.current = {
        pointerId: e.pointerId,
        startClientX: e.clientX,
        startClientY: e.clientY,
        originX: g.x,
        originY: g.y,
        width: g.width,
        height: g.height,
      }
      setDragResizeChrome(true)

      const onMove = (ev: PointerEvent) => {
        const d = dragRef.current
        if (!d || ev.pointerId !== d.pointerId) return
        const vw = window.innerWidth
        const vh = window.innerHeight
        const dx = ev.clientX - d.startClientX
        const dy = ev.clientY - d.startClientY
        const { x, y } = clampPosition(
          d.originX + dx,
          d.originY + dy,
          d.width,
          d.height,
          vw,
          vh,
        )
        setGeom((prev) => ({ ...prev, x, y }))
      }

      const onUp = (ev: PointerEvent) => {
        const d = dragRef.current
        if (!d || ev.pointerId !== d.pointerId) return
        dragRef.current = null
        setDragResizeChrome(false)
        headerEl.removeEventListener('pointermove', onMove)
        headerEl.removeEventListener('pointerup', onUp)
        headerEl.removeEventListener('pointercancel', onUp)
        try {
          headerEl.releasePointerCapture(ev.pointerId)
        } catch {
          /* already released */
        }
        const vw = window.innerWidth
        const vh = window.innerHeight
        const dx = ev.clientX - d.startClientX
        const dy = ev.clientY - d.startClientY
        const { x, y } = clampPosition(
          d.originX + dx,
          d.originY + dy,
          d.width,
          d.height,
          vw,
          vh,
        )
        const next: AIAssistantStoredGeometry = { width: d.width, height: d.height, x, y }
        setGeom(next)
        persistGeometry(next)
      }

      headerEl.addEventListener('pointermove', onMove)
      headerEl.addEventListener('pointerup', onUp)
      headerEl.addEventListener('pointercancel', onUp)
      headerEl.setPointerCapture(e.pointerId)
    },
    [isMobile],
  )

  const onResizePointerDown = useCallback(
    (kind: ResizeSession['kind']) => (e: ReactPointerEvent<HTMLElement>) => {
      if (isMobile) return
      if (e.button !== 0) return
      e.preventDefault()
      e.stopPropagation()
      const handle = e.currentTarget
      const g0 = geomRef.current
      resizeRef.current = {
        pointerId: e.pointerId,
        kind,
        startClientX: e.clientX,
        startClientY: e.clientY,
        width: g0.width,
        height: g0.height,
        x: g0.x,
        y: g0.y,
      }
      setDragResizeChrome(true)

      const onMove = (ev: PointerEvent) => {
        const st = resizeRef.current
        if (!st || ev.pointerId !== st.pointerId) return
        const dx = ev.clientX - st.startClientX
        const dy = ev.clientY - st.startClientY
        const vw = window.innerWidth
        const vh = window.innerHeight

        let width = st.width
        let height = st.height
        if (st.kind === 'e' || st.kind === 'se') width = st.width + dx
        if (st.kind === 's' || st.kind === 'se') height = st.height + dy

        const cs = clampSize(width, height, vw, vh)
        const { x, y } = clampPosition(st.x, st.y, cs.width, cs.height, vw, vh)
        setGeom({ width: cs.width, height: cs.height, x, y })
      }

      const onUp = (ev: PointerEvent) => {
        const st = resizeRef.current
        if (!st || ev.pointerId !== st.pointerId) return
        resizeRef.current = null
        setDragResizeChrome(false)
        handle.removeEventListener('pointermove', onMove)
        handle.removeEventListener('pointerup', onUp)
        handle.removeEventListener('pointercancel', onUp)
        try {
          handle.releasePointerCapture(ev.pointerId)
        } catch {
          /* already released */
        }
        const dx = ev.clientX - st.startClientX
        const dy = ev.clientY - st.startClientY
        const vw = window.innerWidth
        const vh = window.innerHeight
        let width = st.width
        let height = st.height
        if (st.kind === 'e' || st.kind === 'se') width = st.width + dx
        if (st.kind === 's' || st.kind === 'se') height = st.height + dy
        const cs = clampSize(width, height, vw, vh)
        const { x, y } = clampPosition(st.x, st.y, cs.width, cs.height, vw, vh)
        const next: AIAssistantStoredGeometry = { width: cs.width, height: cs.height, x, y }
        setGeom(next)
        persistGeometry(next)
      }

      handle.addEventListener('pointermove', onMove)
      handle.addEventListener('pointerup', onUp)
      handle.addEventListener('pointercancel', onUp)
      handle.setPointerCapture(e.pointerId)
    },
    [isMobile],
  )

  const desktopOpenWrapStyle: CSSProperties | undefined =
    !isMobile
      ? {
          position: 'fixed',
          left: geom.x,
          top: geom.y,
          width: geom.width,
          height: geom.height,
          zIndex: 86,
          margin: 0,
          maxHeight: 'none',
        }
      : undefined

  const desktopMinimizedWrapStyle: CSSProperties | undefined = (() => {
    if (isMobile) return undefined
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1200
    const vh = typeof window !== 'undefined' ? window.innerHeight : 800
    const barW = Math.min(geom.width, maxWidthForViewport(vw))
    const barH = MINIMIZED_BAR_HEIGHT
    const top = geom.y + geom.height - barH
    const { x, y } = clampPosition(geom.x, top, barW, barH, vw, vh)
    return {
      position: 'fixed',
      left: x,
      top: y,
      width: barW,
      zIndex: 86,
      margin: 0,
    }
  })()

  return {
    isMobile,
    geom,
    desktopOpenWrapStyle,
    desktopMinimizedWrapStyle,
    onHeaderPointerDown,
    onResizePointerDownEdge: onResizePointerDown('e'),
    onResizePointerDownSouth: onResizePointerDown('s'),
    onResizePointerDownCorner: onResizePointerDown('se'),
  }
}
