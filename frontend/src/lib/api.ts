export { formatMoney } from './formatMoney'

export const CARD_CONVENIENCE_RATE = 0.0285

const DEFAULT_ACCOUNT_TERM = 'Fall'
const DEFAULT_ACCOUNT_YEAR = 2026

/**
 * GET /api/students/:studentId/account?term=Fall&year=2026 (defaults overridable).
 * Returns parsed JSON; callers should validate or cast to the app account shape.
 */
export async function fetchStudentAccount(
  studentId: string,
  term: string = DEFAULT_ACCOUNT_TERM,
  year: number = DEFAULT_ACCOUNT_YEAR,
  signal?: AbortSignal,
): Promise<unknown> {
  const params = new URLSearchParams({
    term,
    year: String(year),
  })
  const url = `/api/students/${encodeURIComponent(studentId)}/account?${params.toString()}`
  console.debug('[account-debug] fetchStudentAccount', url)
  const res = await fetch(url, { signal })
  if (!res.ok) {
    throw new Error(`Could not load account (HTTP ${res.status})`)
  }
  return res.json()
}
