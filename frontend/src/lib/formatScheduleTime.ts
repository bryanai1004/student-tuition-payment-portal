/**
 * Display helpers for schedule times stored as `HH:MM:SS` (or `HH:MM`) from the API.
 * Form inputs continue to use `<input type="time" />` (24h) and `timeToInputValue` / `inputTimeToApi`.
 */

/** `TIME` from API → `HH:MM` for `<input type="time" />` */
export function timeToInputValue(t: string | null | undefined): string {
  if (t == null || String(t).trim() === '') return ''
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?/.exec(String(t).trim())
  if (!m) return ''
  const hh = m[1]!.padStart(2, '0')
  return `${hh}:${m[2]}`
}

/** `<input type="time" />` value → `HH:MM:SS` for API; empty → null */
export function inputTimeToApi(s: string): string | null {
  const v = s.trim()
  if (v === '') return null
  if (/^\d{1,2}:\d{2}$/.test(v)) return `${v}:00`
  if (/^\d{1,2}:\d{2}:\d{2}$/.test(v)) return v
  return v
}

/**
 * Single time value → e.g. `09:00 AM`, `12:00 PM`, `03:30 PM`.
 * Unknown shape returns trimmed original; empty → em dash.
 */
export function formatTimeHmsForDisplay(value: string | null | undefined): string {
  if (value == null || String(value).trim() === '') return '—'
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?/.exec(String(value).trim())
  if (!m) return String(value).trim()
  let h = Number(m[1])
  const minutes = m[2]!
  if (!Number.isFinite(h) || h < 0 || h > 23) return String(value).trim()
  const isPm = h >= 12
  const h12 = h % 12 === 0 ? 12 : h % 12
  const ap = isPm ? 'PM' : 'AM'
  return `${String(h12).padStart(2, '0')}:${minutes} ${ap}`
}

/** Range for tables: `09:00 AM – 10:30 AM`; missing parts use em dash. */
export function formatTimeRangeHmsForDisplay(
  start: string | null | undefined,
  end: string | null | undefined,
): string {
  const a = formatTimeHmsForDisplay(start)
  const b = formatTimeHmsForDisplay(end)
  if (a === '—' && b === '—') return '—'
  if (a === '—') return b
  if (b === '—') return a
  return `${a} – ${b}`
}
