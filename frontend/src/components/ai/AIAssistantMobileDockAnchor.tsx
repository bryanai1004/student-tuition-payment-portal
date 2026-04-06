import { useLayoutEffect, useRef } from 'react'
import { useAIAssistantMobileAnchor } from './AIAssistantMobileAnchorContext'

/**
 * Mount in the global myAMU banner (TopBar) on mobile so the cat + launcher align to that strip.
 */
export function AIAssistantMobileDockAnchor() {
  const ref = useRef<HTMLDivElement>(null)
  const { setMobileDockAnchorEl } = useAIAssistantMobileAnchor()

  useLayoutEffect(() => {
    const el = ref.current
    setMobileDockAnchorEl(el)
    return () => setMobileDockAnchorEl(null)
  }, [setMobileDockAnchorEl])

  return (
    <div
      ref={ref}
      className="portal-portal-banner__ai-dock-anchor"
      aria-hidden
    />
  )
}
