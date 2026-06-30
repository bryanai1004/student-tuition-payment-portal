import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  adminAuthRequestHeaders,
  buildApiUrl,
  clearAdminAccessTokenFromStorage,
  clearAdminAuthClientStorage,
  writeAdminAccessTokenToStorage,
} from '../lib/api'
import { type AdminRole, isAdminRole } from '../lib/adminAccess'

type AdminLoginResult =
  | { ok: true }
  | { ok: false; error: string }

type StoredAdminSession = {
  email: string
  role: AdminRole
}

type AdminAuthContextValue = {
  isHydrated: boolean
  isAuthenticated: boolean
  role: AdminRole | null
  login: (identifier: string, password: string) => Promise<AdminLoginResult>
  logout: () => Promise<void>
}

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null)

type MeResponse =
  | { ok: true; user: { email: string; role: AdminRole } }
  | { ok: false }

function parseMeResponse(data: unknown): MeResponse {
  if (data == null || typeof data !== 'object') return { ok: false }
  const o = data as Record<string, unknown>
  if (o.ok !== true) return { ok: false }
  const user = o.user
  if (user == null || typeof user !== 'object') return { ok: false }
  const u = user as Record<string, unknown>
  const email = typeof u.email === 'string' ? u.email : ''
  const roleRaw = typeof u.role === 'string' ? u.role : ''
  if (email.trim() === '' || !isAdminRole(roleRaw)) return { ok: false }
  return { ok: true, user: { email, role: roleRaw } }
}

async function postAdminLogout(): Promise<void> {
  try {
    await fetch(buildApiUrl('/api/admin/auth/logout'), {
      method: 'POST',
      credentials: 'include',
      headers: adminAuthRequestHeaders(),
    })
  } catch {
    /* ignore */
  }
}

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<StoredAdminSession | null>(null)
  const [isHydrated, setIsHydrated] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(buildApiUrl('/api/admin/auth/me'), {
          method: 'GET',
          credentials: 'include',
          headers: adminAuthRequestHeaders(),
          signal: AbortSignal.timeout(10_000),
        })
        const data: unknown = await res.json().catch(() => null)
        if (cancelled) return
        if (!res.ok || res.status === 401) {
          setSession(null)
          clearAdminAccessTokenFromStorage()
          clearAdminAuthClientStorage()
        } else {
          const parsed = parseMeResponse(data)
          if (parsed.ok === true) {
            setSession({ email: parsed.user.email, role: parsed.user.role })
            clearAdminAuthClientStorage()
          } else {
            setSession(null)
            clearAdminAccessTokenFromStorage()
            clearAdminAuthClientStorage()
          }
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setIsHydrated(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const isAuthenticated = session !== null

  const login = useCallback(
    async (identifier: string, password: string): Promise<AdminLoginResult> => {
      const idTrim = identifier.trim().toLowerCase()
      if (idTrim === '') {
        return { ok: false, error: 'Username or Email is required' }
      }
      if (password === '') {
        return { ok: false, error: 'Password is required' }
      }
      clearAdminAccessTokenFromStorage()
      clearAdminAuthClientStorage()
      setSession(null)
      await postAdminLogout()
      try {
        const res = await fetch(buildApiUrl('/api/admin/auth/login'), {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifier: idTrim, password }),
        })
        const data: unknown = await res.json().catch(() => null)
        if (res.ok && data != null && typeof data === 'object') {
          const o = data as Record<string, unknown>
          if (o.ok === true) {
            const user = o.user
            if (user != null && typeof user === 'object') {
              const u = user as Record<string, unknown>
              const email = typeof u.email === 'string' ? u.email : ''
              const roleRaw = typeof u.role === 'string' ? u.role : ''
              if (email.trim() !== '' && isAdminRole(roleRaw)) {
                const accessToken =
                  typeof o.accessToken === 'string' ? o.accessToken.trim() : ''
                if (accessToken !== '') {
                  writeAdminAccessTokenToStorage(accessToken)
                }
                setSession({ email, role: roleRaw })
                return { ok: true }
              }
            }
          }
        }
        setSession(null)
        clearAdminAccessTokenFromStorage()
        clearAdminAuthClientStorage()
        await postAdminLogout()
        const errBody = data as { error?: unknown } | null
        const msg =
          typeof errBody?.error === 'string' && errBody.error.trim() !== ''
            ? errBody.error
            : 'Invalid email or password.'
        return { ok: false, error: msg }
      } catch {
        setSession(null)
        clearAdminAccessTokenFromStorage()
        clearAdminAuthClientStorage()
        await postAdminLogout()
        return { ok: false, error: 'Login failed. Please try again.' }
      }
    },
    [],
  )

  const logout = useCallback(async () => {
    await postAdminLogout()
    clearAdminAccessTokenFromStorage()
    clearAdminAuthClientStorage()
    setSession(null)
  }, [])

  const value = useMemo(
    () => ({
      isHydrated,
      isAuthenticated,
      role: session?.role ?? null,
      login,
      logout,
    }),
    [isHydrated, isAuthenticated, login, logout, session?.role],
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
