import { useSearchParams } from 'react-router-dom'
import {
  readRegistrationTermIdFromSearch,
  type AcademicTerm,
} from '../../lib/api'

export { readRegistrationTermIdFromSearch, REGISTRATION_TERM_QUERY_KEY } from '../../lib/api'

/** Academic term id from `?term=` in the registration module (URL is source of truth). */
export function useRegistrationTermSearchParam(): string | null {
  const [searchParams] = useSearchParams()
  return readRegistrationTermIdFromSearch(searchParams)
}

export function mergeTermOptions(
  recent: AcademicTerm[],
  current: AcademicTerm | null,
): AcademicTerm[] {
  const byId = new Map<string, AcademicTerm>()
  for (const t of recent) {
    byId.set(t.id, t)
  }
  if (current && !byId.has(current.id)) {
    byId.set(current.id, current)
  }
  return Array.from(byId.values()).sort((a, b) => b.sequence_no - a.sequence_no)
}

/**
 * URL term wins if it exists in options; else prefer the API "current" row when present;
 * else the first `registration_open` visible term; else the latest by `sequence_no` (options pre-sorted).
 */
export function resolveSelectedRegistrationTermId(
  urlTerm: string | null,
  options: AcademicTerm[],
  current: AcademicTerm | null,
): string {
  const url = urlTerm?.trim() ?? ''
  if (url !== '' && options.some((t) => t.id === url)) {
    return url
  }
  if (current != null && options.some((t) => t.id === current.id)) {
    return current.id
  }
  const open = options.find((t) => t.status === 'registration_open')
  if (open) return open.id
  return options[0]?.id ?? ''
}

/** Default term on the registration home picker (no URL yet). */
export function pickDefaultRegistrationTermId(
  options: AcademicTerm[],
  current: AcademicTerm | null,
): string {
  return resolveSelectedRegistrationTermId(null, options, current)
}

/** User-facing copy when term APIs fail (never show raw transport/SQL text). */
export const REGISTRATION_TERMS_LOAD_ERROR =
  'Academic terms are not available right now. If this continues, contact the registrar.'
