import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export type PortalLocale = 'en' | 'zh'

const STORAGE_KEY = 'portal-locale'

type LanguageContextValue = {
  locale: PortalLocale
  toggleLanguage: () => void
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

function readStoredLocale(): PortalLocale {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'zh' || v === 'en') return v
  } catch {
    /* ignore */
  }
  return 'en'
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<PortalLocale>(() =>
    typeof window !== 'undefined' ? readStoredLocale() : 'en',
  )

  useLayoutEffect(() => {
    document.documentElement.lang = locale === 'zh' ? 'zh-Hant' : 'en'
    try {
      localStorage.setItem(STORAGE_KEY, locale)
    } catch {
      /* ignore */
    }
  }, [locale])

  const toggleLanguage = useCallback(() => {
    setLocale((prev) => (prev === 'en' ? 'zh' : 'en'))
  }, [])

  const value = useMemo(
    () => ({ locale, toggleLanguage }),
    [locale, toggleLanguage],
  )

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext)
  if (!ctx) {
    throw new Error(
      'useLanguage() must be used within <LanguageProvider>. Mount LanguageProvider around the student portal route tree (see App.tsx → StudentAccountScope).',
    )
  }
  return ctx
}
