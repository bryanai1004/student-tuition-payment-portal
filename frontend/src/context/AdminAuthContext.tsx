import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

const ADMIN_SESSION_KEY = 'amu_admin_session'

const ADMIN_EMAILS = [
  'wanpanelami@gmail.com',
  'bingchen.li@wanpanel.ai',
  'clinic@amu.edu',
  'clinicdean@amu.edu',
] as const
const ADMIN_PASSWORD = 'amuadmin123'

const ADMIN_EMAIL_SET = new Set(
  ADMIN_EMAILS.map((e) => e.toLowerCase()),
)

function isAllowedAdminEmail(email: string): boolean {
  return ADMIN_EMAIL_SET.has(email.trim().toLowerCase())
}

type AdminLoginResult =
  | { ok: true }
  | { ok: false; error: string }

type AdminAuthContextValue = {
  isAuthenticated: boolean
  login: (email: string, password: string) => AdminLoginResult
  logout: () => void
}

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null)

function readSession(): boolean {
  try {
    return sessionStorage.getItem(ADMIN_SESSION_KEY) === '1'
  } catch {
    return false
  }
}

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(readSession)

  const login = useCallback((email: string, password: string): AdminLoginResult => {
    const trimmedEmail = email.trim()
    if (!trimmedEmail) {
      return { ok: false, error: 'Username or Email is required' }
    }
    if (password === '') {
      return { ok: false, error: 'Password is required' }
    }
    if (!isAllowedAdminEmail(trimmedEmail) || password !== ADMIN_PASSWORD) {
      return { ok: false, error: 'Invalid email or password.' }
    }
    try {
      sessionStorage.setItem(ADMIN_SESSION_KEY, '1')
    } catch {
      /* ignore */
    }
    setIsAuthenticated(true)
    return { ok: true }
  }, [])

  const logout = useCallback(() => {
    try {
      sessionStorage.removeItem(ADMIN_SESSION_KEY)
    } catch {
      /* ignore */
    }
    setIsAuthenticated(false)
  }, [])

  const value = useMemo(
    () => ({ isAuthenticated, login, logout }),
    [isAuthenticated, login, logout],
  )

  return (
    <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>
  )
}

export function useAdminAuth(): AdminAuthContextValue {
  const ctx = useContext(AdminAuthContext)
  if (!ctx) {
    throw new Error('useAdminAuth must be used within AdminAuthProvider')
  }
  return ctx
}
