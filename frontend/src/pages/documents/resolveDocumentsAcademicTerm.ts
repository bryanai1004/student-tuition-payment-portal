import {
  fetchAcademicTerms,
  fetchCurrentAcademicTerm,
  type AcademicTerm,
} from '../../lib/api'

/**
 * Prefer the registrar "current" registration-open term; otherwise the visible term
 * with the highest `sequence_no` (same ordering intent as recent-terms lists).
 */
export async function resolveDocumentsAcademicTerm(
  options?: { signal?: AbortSignal },
): Promise<AcademicTerm> {
  const signal = options?.signal
  const current = await fetchCurrentAcademicTerm({ signal })
  if (current) return current

  const all = await fetchAcademicTerms({ signal })
  const visible = all.filter((t) => t.is_visible)
  if (visible.length === 0) {
    throw new Error(
      'No academic term is available for documents. Check back later or contact the registrar.',
    )
  }
  visible.sort((a, b) => b.sequence_no - a.sequence_no)
  return visible[0]!
}
