import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

type AIAssistantMobileAnchorContextValue = {
  mobileDockAnchorEl: HTMLElement | null
  setMobileDockAnchorEl: (el: HTMLElement | null) => void
}

const AIAssistantMobileAnchorContext = createContext<AIAssistantMobileAnchorContextValue | null>(
  null,
)

export function AIAssistantMobileAnchorProvider({ children }: { children: ReactNode }) {
  const [mobileDockAnchorEl, setMobileDockAnchorEl] = useState<HTMLElement | null>(null)

  const setMobileDockAnchorElStable = useCallback((el: HTMLElement | null) => {
    setMobileDockAnchorEl((prev) => (prev === el ? prev : el))
  }, [])

  const value = useMemo(
    () => ({
      mobileDockAnchorEl,
      setMobileDockAnchorEl: setMobileDockAnchorElStable,
    }),
    [mobileDockAnchorEl, setMobileDockAnchorElStable],
  )

  return (
    <AIAssistantMobileAnchorContext.Provider value={value}>{children}</AIAssistantMobileAnchorContext.Provider>
  )
}

export function useAIAssistantMobileAnchor(): AIAssistantMobileAnchorContextValue {
  const v = useContext(AIAssistantMobileAnchorContext)
  if (!v) {
    throw new Error('useAIAssistantMobileAnchor must be used within AIAssistantMobileAnchorProvider')
  }
  return v
}
