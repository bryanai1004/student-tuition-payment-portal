import Lottie from 'lottie-react'
import type { CSSProperties, MouseEvent, PointerEvent as ReactPointerEvent } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useCatLottieData } from './useCatLottieData'

type AIAssistantPetProps = {
  size?: number
  className?: string
  style?: CSSProperties
  loop?: boolean
  onPointerDown?: (e: ReactPointerEvent<HTMLDivElement>) => void
  onPointerMove?: (e: ReactPointerEvent<HTMLDivElement>) => void
  onPointerUp?: (e: ReactPointerEvent<HTMLDivElement>) => void
  onPointerCancel?: (e: ReactPointerEvent<HTMLDivElement>) => void
  onClick?: (e: MouseEvent<HTMLDivElement>) => void
  tabIndex?: number
  role?: 'button'
  'aria-label'?: string
  /** Set when the pet is decorative (e.g. parent control has the accessible name). */
  'aria-hidden'?: boolean
}

export function AIAssistantPet({
  size = 78,
  className = '',
  style,
  loop = true,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onClick,
  tabIndex,
  role,
  'aria-label': ariaLabel,
  'aria-hidden': ariaHidden,
}: AIAssistantPetProps) {
  const data = useCatLottieData()

  const boxStyle: CSSProperties = {
    width: size,
    height: size,
    flexShrink: 0,
    cursor: onPointerDown ? 'grab' : 'inherit',
    touchAction: onPointerDown ? 'none' : undefined,
    ...style,
  }

  if (!data) {
    return (
      <div
        className={`portal-ai-assistant-pet portal-ai-assistant-pet--loading ${className}`.trim()}
        style={boxStyle}
        aria-hidden={ariaHidden ? true : undefined}
        aria-label={ariaLabel}
      />
    )
  }

  return (
    <div
      className={`portal-ai-assistant-pet ${className}`.trim()}
      style={boxStyle}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onClick={onClick}
      tabIndex={tabIndex}
      role={role}
      aria-label={ariaLabel}
      aria-hidden={ariaHidden ? true : undefined}
    >
      <Lottie animationData={data} loop={loop} style={{ width: size, height: size }} />
    </div>
  )
}

const CAT_CONTEXT_MENU_EST_W = 200
const CAT_CONTEXT_MENU_EST_H = 48

export type AIAssistantDockCatProps = {
  size: number
  dragEnabled: boolean
  contextMenuEnabled: boolean
  onCatPointerDown?: (e: ReactPointerEvent<HTMLDivElement>) => void
  onCatPointerMove?: (e: ReactPointerEvent<HTMLDivElement>) => void
  onCatPointerUp?: (e: ReactPointerEvent<HTMLDivElement>) => void
  onCatPointerCancel?: (e: ReactPointerEvent<HTMLDivElement>) => void
  onOpenAssistant: () => void
  onRequestHideCat: () => void
}

export function AIAssistantDockCat({
  size,
  dragEnabled,
  contextMenuEnabled,
  onCatPointerDown,
  onCatPointerMove,
  onCatPointerUp,
  onCatPointerCancel,
  onOpenAssistant,
  onRequestHideCat,
}: AIAssistantDockCatProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 })
  const menuRef = useRef<HTMLDivElement>(null)

  const closeMenu = useCallback(() => setMenuOpen(false), [])

  useEffect(() => {
    if (!menuOpen) return
    const onPointerDown = (e: PointerEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return
      setMenuOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  const onContextMenu = (e: MouseEvent<HTMLDivElement>) => {
    if (!contextMenuEnabled) return
    e.preventDefault()
    e.stopPropagation()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const x = Math.min(e.clientX, vw - CAT_CONTEXT_MENU_EST_W - 8)
    const y = Math.min(e.clientY, vh - CAT_CONTEXT_MENU_EST_H - 8)
    setMenuPos({ x: Math.max(8, x), y: Math.max(8, y) })
    setMenuOpen(true)
  }

  return (
    <>
      <div
        className="portal-ai-assistant-dock__cat-hit"
        role="button"
        tabIndex={0}
        aria-label="Open AMU AI Assist"
        aria-haspopup={contextMenuEnabled ? 'menu' : undefined}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onOpenAssistant()
          }
        }}
        onContextMenu={onContextMenu}
        onPointerDown={dragEnabled ? onCatPointerDown : undefined}
        onPointerMove={dragEnabled ? onCatPointerMove : undefined}
        onPointerUp={dragEnabled ? onCatPointerUp : undefined}
        onPointerCancel={dragEnabled ? onCatPointerCancel : undefined}
        onClick={!dragEnabled ? () => onOpenAssistant() : undefined}
      >
        <AIAssistantPet size={size} aria-hidden={true} loop={true} />
      </div>
      {menuOpen ? (
        <div
          ref={menuRef}
          className="portal-ai-assistant-cat-context-menu"
          role="menu"
          aria-label="Cat actions"
          style={{ left: menuPos.x, top: menuPos.y }}
        >
          <button
            type="button"
            role="menuitem"
            className="portal-ai-assistant-cat-context-menu__item"
            onClick={() => {
              onRequestHideCat()
              closeMenu()
            }}
          >
            Hide AMU AI Cat
          </button>
        </div>
      ) : null}
    </>
  )
}
