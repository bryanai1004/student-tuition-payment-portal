import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { fetchStudentAccount } from '../lib/api'
import { mahmAccountMock } from '../mock/mahmAccountMock'
import type { MahmAccountMock } from '../mock/mahmAccountMock'
import type { BillingCategory } from '../types/billing'

const PORTAL_STUDENT_ID_KEY = 'portal_student_id'

/** Unauthenticated preview routes (e.g. `/plan`) still use the static demo catalog. */
const UNAUTHENTICATED_FALLBACK = mahmAccountMock

function readStoredStudentId(): string | null {
  try {
    const raw = localStorage.getItem(PORTAL_STUDENT_ID_KEY)
    const trimmed = raw?.trim() ?? ''
    return trimmed.length > 0 ? trimmed : null
  } catch {
    return null
  }
}

function asBillingCategory(raw: unknown): BillingCategory {
  const s = String(raw ?? '')
  if (s === 'tuition' || s === 'clinical' || s === 'fees' || s === 'other') {
    return s
  }
  return 'other'
}

/**
 * Maps GET /api/students/:id/account JSON (portal-assembled or legacy minimal) into the
 * `MahmAccountMock`-shaped view model finance widgets expect — without showing static Bingchen
 * data for signed-in students when the API returns a sparse legacy payload.
 */
function normalizeApiStudentAccount(raw: unknown): MahmAccountMock {
  if (raw == null || typeof raw !== 'object') {
    throw new Error('Invalid account response')
  }
  const o = raw as Record<string, unknown>

  if (
    'installmentPlan' in o &&
    o.installmentPlan != null &&
    typeof o.installmentPlan === 'object'
  ) {
    return o as MahmAccountMock
  }

  const studentRaw = o.student
  if (studentRaw == null || typeof studentRaw !== 'object') {
    throw new Error('Account response missing student')
  }
  const st = studentRaw as Record<string, unknown>
  const studentIdRoot =
    typeof o.studentId === 'string' && o.studentId.trim() !== ''
      ? o.studentId.trim()
      : String(st.studentId ?? '').trim()

  const student = {
    name: String(st.name ?? '').trim() || studentIdRoot || 'Student',
    studentId: String(st.studentId ?? studentIdRoot).trim() || studentIdRoot,
    term: String(st.term ?? '').trim(),
    year: Number(st.year),
  }

  const summaryRaw = o.summary
  const summaryObj =
    summaryRaw != null && typeof summaryRaw === 'object'
      ? (summaryRaw as Record<string, unknown>)
      : {}
  const summary = {
    tuitionTotal: Number(summaryObj.tuitionTotal ?? 0) || 0,
    clinicalTotal: Number(summaryObj.clinicalTotal ?? 0) || 0,
    feesTotal: Number(summaryObj.feesTotal ?? 0) || 0,
    otherTotal: Number(summaryObj.otherTotal ?? 0) || 0,
    totalCharges: Number(summaryObj.totalCharges ?? 0) || 0,
    payments: Number(summaryObj.payments ?? 0) || 0,
    outstandingBalance: Number(summaryObj.outstandingBalance ?? 0) || 0,
  }

  const lineItemsRaw = Array.isArray(o.lineItems) ? o.lineItems : []
  const lineItems = lineItemsRaw.map((row) => {
    const r = row as Record<string, unknown>
    return {
      description: String(r.description ?? ''),
      amount: Number(r.amount ?? 0) || 0,
      category: asBillingCategory(r.category),
    }
  })

  const scheduleRowsRaw = Array.isArray(o.scheduleRows) ? o.scheduleRows : []
  const scheduleRows = scheduleRowsRaw.map((row) => {
    const r = row as Record<string, unknown>
    return {
      courseCode: String(r.courseCode ?? ''),
      title: String(r.title ?? ''),
      type: String(r.type ?? ''),
      units: r.units == null ? null : Number(r.units),
      hours: r.hours == null ? null : Number(r.hours),
      charge: Number(r.charge ?? 0) || 0,
    }
  })

  const paymentsRaw = Array.isArray(o.payments) ? o.payments : []
  const recentActivity = paymentsRaw.map((p) => {
    const r = p as Record<string, unknown>
    return {
      date: String(r.paidAt ?? ''),
      description: String(r.description ?? 'Payment'),
      amount: -Math.abs(Number(r.amount ?? 0) || 0),
    }
  })

  const instRaw = Array.isArray(o.installmentSchedule) ? o.installmentSchedule : []
  const preferenceRaw = o.preference
  const preference =
    preferenceRaw != null && typeof preferenceRaw === 'object'
      ? (preferenceRaw as Record<string, unknown>)
      : null
  const usePlan = Boolean(preference?.useInstallmentPlan)
  const installmentSchedule = instRaw.map((row) => {
    const r = row as Record<string, unknown>
    return {
      dueDate: String(r.dueDate ?? ''),
      amount: Number(r.amount ?? 0) || 0,
      status: 'Scheduled',
    }
  })
  const installmentCountPref =
    preference != null && typeof preference.installmentCount === 'number'
      ? preference.installmentCount
      : 3

  const installmentPlan = {
    enabled: usePlan && installmentSchedule.length > 0,
    installmentCount: usePlan ? installmentCountPref : 0,
    installmentAmount: installmentSchedule[0]?.amount ?? 0,
    schedule: installmentSchedule,
  }

  const installmentPolicyRaw = Array.isArray(o.installmentPolicy)
    ? o.installmentPolicy
    : []
  const installmentPolicy = installmentPolicyRaw.map((x) => String(x))

  const program = o.program != null && String(o.program).trim() !== '' ? String(o.program).trim() : ''
  const billingStatus =
    o.billingStatus != null && String(o.billingStatus).trim() !== ''
      ? String(o.billingStatus).trim()
      : ''
  const termChargeEffectiveDate =
    o.termChargeEffectiveDate != null && String(o.termChargeEffectiveDate).trim() !== ''
      ? String(o.termChargeEffectiveDate).trim()
      : ''

  return {
    program,
    student,
    summary,
    lineItems,
    installmentPlan,
    installmentPolicy,
    billingStatus,
    termChargeEffectiveDate,
    scheduleRows,
    recentActivity,
    statements: [],
  }
}

/** Placeholder while signed in but account JSON has not arrived yet — avoids showing demo names/amounts. */
function authenticatedPlaceholderAccount(studentId: string): MahmAccountMock {
  return {
    program: '',
    student: {
      name: '',
      studentId: studentId.trim(),
      term: '',
      year: 0,
    },
    summary: {
      tuitionTotal: 0,
      clinicalTotal: 0,
      feesTotal: 0,
      otherTotal: 0,
      totalCharges: 0,
      payments: 0,
      outstandingBalance: 0,
    },
    lineItems: [],
    installmentPlan: {
      enabled: false,
      installmentCount: 0,
      installmentAmount: 0,
      schedule: [],
    },
    installmentPolicy: [],
    billingStatus: '',
    termChargeEffectiveDate: '',
    scheduleRows: [],
    recentActivity: [],
    statements: [],
  }
}

type AccountContextValue = {
  /** Last successful API payload for the current student; null after logout or a failed fetch. */
  fetchedAccount: MahmAccountMock | null
  /**
   * View model for billing widgets. When authenticated, comes from the API (normalized) or a neutral
   * placeholder while loading — never the static demo catalog, so real students do not see Bingchen Li.
   */
  account: MahmAccountMock
  loading: boolean
  error: string | null
  reload: () => void
  currentStudentId: string | null
  /** Call only after the backend login endpoint succeeds; does not validate credentials. */
  login: (studentId: string) => void
  logout: () => void
  isAuthenticated: boolean
}

const AccountContext = createContext<AccountContextValue | null>(null)

export function AccountProvider({ children }: { children: ReactNode }) {
  const [currentStudentId, setCurrentStudentId] = useState<string | null>(() =>
    readStoredStudentId(),
  )
  const [fetchedAccount, setFetchedAccount] = useState<MahmAccountMock | null>(null)
  const [loading, setLoading] = useState(
    () => Boolean(readStoredStudentId()?.trim()),
  )
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  const login = useCallback((studentId: string) => {
    const trimmed = studentId.trim()
    setCurrentStudentId(trimmed)
    try {
      localStorage.setItem(PORTAL_STUDENT_ID_KEY, trimmed)
    } catch {
      /* ignore quota / private mode */
    }
  }, [])

  const logout = useCallback(() => {
    setCurrentStudentId(null)
    try {
      localStorage.removeItem(PORTAL_STUDENT_ID_KEY)
    } catch {
      /* ignore */
    }
  }, [])

  const reload = useCallback(() => {
    setReloadKey((k) => k + 1)
  }, [])

  useEffect(() => {
    if (!currentStudentId?.trim()) {
      setFetchedAccount(null)
      setLoading(false)
      setError(null)
      return
    }

    const id = currentStudentId.trim()
    const ac = new AbortController()

    setFetchedAccount(null)
    setLoading(true)
    setError(null)

    ;(async () => {
      try {
        const raw = await fetchStudentAccount(id, { signal: ac.signal })
        if (ac.signal.aborted) return
        setFetchedAccount(normalizeApiStudentAccount(raw))
        setError(null)
      } catch (e) {
        if (ac.signal.aborted) return
        setFetchedAccount(null)
        setError(
          e instanceof Error ? e.message : 'Something went wrong loading your account.',
        )
      } finally {
        if (!ac.signal.aborted) {
          setLoading(false)
        }
      }
    })()

    return () => ac.abort()
  }, [currentStudentId, reloadKey])

  const isAuthenticated =
    currentStudentId !== null && currentStudentId.trim().length > 0

  const account = useMemo(() => {
    if (!isAuthenticated) {
      return UNAUTHENTICATED_FALLBACK
    }
    if (fetchedAccount) {
      return fetchedAccount
    }
    if (loading && currentStudentId) {
      return authenticatedPlaceholderAccount(currentStudentId)
    }
    if (error && currentStudentId) {
      return authenticatedPlaceholderAccount(currentStudentId)
    }
    return authenticatedPlaceholderAccount(currentStudentId ?? '')
  }, [currentStudentId, error, fetchedAccount, isAuthenticated, loading])

  const value = useMemo<AccountContextValue>(
    () => ({
      fetchedAccount,
      account,
      loading,
      error,
      reload,
      currentStudentId,
      login,
      logout,
      isAuthenticated,
    }),
    [
      account,
      currentStudentId,
      error,
      fetchedAccount,
      loading,
      login,
      logout,
      reload,
    ],
  )

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>
}

export function useAccount() {
  const ctx = useContext(AccountContext)
  if (!ctx) {
    throw new Error('useAccount must be used within AccountProvider')
  }
  return ctx
}
