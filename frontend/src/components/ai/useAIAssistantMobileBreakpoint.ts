import { useEffect, useState } from 'react'
import { AI_ASSISTANT_MOBILE_MEDIA } from './aiAssistantGeometry'

/** Matches assistant panel / dock mobile layout (`max-width: 480px`). */
export function useAIAssistantMobileBreakpoint(): boolean {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(AI_ASSISTANT_MOBILE_MEDIA).matches : false,
  )

  useEffect(() => {
    const mq = window.matchMedia(AI_ASSISTANT_MOBILE_MEDIA)
    const onChange = () => setIsMobile(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return isMobile
}
