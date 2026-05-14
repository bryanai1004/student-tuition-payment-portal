import { useState } from 'react'
import type { StudentPortalKey } from '../../lib/i18n'
import type { StudentProgramProgressResponse } from '../../lib/api'

type T = (key: StudentPortalKey) => string

function formatAmount(value: number, isHours: boolean): string {
  if (!Number.isFinite(value)) return '—'
  if (isHours) {
    return Number.isInteger(value) ? String(value) : value.toFixed(1)
  }
  const rounded = Math.round(value * 100) / 100
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

/** SVG viewBox center and radius (must match pieSectorPath / full-circle slices). */
const PIE_CX = 50
const PIE_CY = 50
const PIE_R = 42

/** When span is ~1, arc endpoints coincide at the top of the circle — the path is invisible. */
const PIE_FULL_SLICE_EPS = 1e-5

function isFullPieRing(fracStart: number, fracEnd: number): boolean {
  return fracEnd - fracStart >= 1 - PIE_FULL_SLICE_EPS
}

/** Pie slice from center; fractions are [0,1] of the full circle starting at top (−90°). */
function pieSectorPath(fracStart: number, fracEnd: number): string | null {
  if (!(fracEnd > fracStart)) return null
  if (isFullPieRing(fracStart, fracEnd)) return null
  const cx = PIE_CX
  const cy = PIE_CY
  const r = PIE_R
  const clamp = (f: number) => Math.min(1, Math.max(0, f))
  const toAngle = (f: number) => -Math.PI / 2 + clamp(f) * 2 * Math.PI
  const a0 = toAngle(fracStart)
  const a1 = toAngle(fracEnd)
  const polar = (angle: number) => ({
    x: cx + r * Math.cos(angle),
    y: cy + r * Math.sin(angle),
  })
  const p0 = polar(a0)
  const p1 = polar(a1)
  const sweep = a1 - a0
  const largeArc = sweep > Math.PI ? 1 : 0
  return `M ${cx} ${cy} L ${p0.x} ${p0.y} A ${r} ${r} 0 ${largeArc} 1 ${p1.x} ${p1.y} Z`
}

function bucketLabelKey(id: StudentProgramProgressResponse['buckets'][number]['id']): StudentPortalKey {
  switch (id) {
    case 'didactic':
      return 'programProgressBucketDidactic'
    case 'lab':
      return 'programProgressBucketLab'
    case 'clinical':
      return 'programProgressBucketClinical'
    default:
      return 'programProgressBucketDidactic'
  }
}

export type ProgramProgressPanelProps = {
  t: T
  loading: boolean
  error: string | null
  progress: StudentProgramProgressResponse | null
  onRetry: () => void
}

type PieHover = 'completed' | 'inProgress' | 'remaining' | null

export function ProgramProgressPanel({
  t,
  loading,
  error,
  progress,
  onRetry,
}: ProgramProgressPanelProps) {
  const [pieHover, setPieHover] = useState<PieHover>(null)

  if (loading && progress == null) {
    return (
      <div className="portal-card portal-academics-program-progress portal-academics-program-progress--loading">
        <p className="portal-card-note">{t('loadingProgramProgress')}</p>
      </div>
    )
  }

  if (error != null && progress == null) {
    return (
      <div
        className="portal-card portal-academics-program-progress portal-profile-state--error"
        role="alert"
      >
        <p className="portal-profile-state__title">{t('couldNotLoadProgramProgress')}</p>
        <p className="portal-profile-state__detail">{error}</p>
        <div className="portal-actions portal-profile-state__actions">
          <button type="button" className="portal-btn portal-btn--secondary" onClick={onRetry}>
            {t('tryAgain')}
          </button>
        </div>
      </div>
    )
  }

  if (progress == null) return null

  const req = progress.quarterUnitsRequired
  const earned = progress.quarterUnitsEarned
  const inProgress = progress.quarterUnitsInProgress ?? 0
  const remaining = progress.quarterUnitsRemaining

  const fC = req > 0 ? Math.min(1, Math.max(0, earned / req)) : 0
  const fI = req > 0 ? Math.min(1 - fC, Math.max(0, inProgress / req)) : 0

  const remA = fC + fI
  const remB = 1
  const pathRemaining = pieSectorPath(remA, remB)
  const remFull = remB - remA >= 1 - PIE_FULL_SLICE_EPS

  const pathInProgress = pieSectorPath(fC, fC + fI)
  const ipFull = fI >= 1 - PIE_FULL_SLICE_EPS

  const pathCompleted = pieSectorPath(0, fC)
  const compFull = fC >= 1 - PIE_FULL_SLICE_EPS

  const completedFrac = fC
  const pctLabel =
    req > 0 ? `${Math.round(Math.min(1, Math.max(0, earned / req)) * 100)}%` : '—'

  const caption = t('programProgressPieCaption')
    .replace('{earned}', formatAmount(earned, false))
    .replace('{inProgress}', formatAmount(inProgress, false))
    .replace('{required}', formatAmount(req, false))
    .replace('{remaining}', formatAmount(remaining, false))

  const pctForTip =
    req > 0 ? String(Math.round(Math.min(1, Math.max(0, earned / req)) * 100)) : '—'
  const tooltipCompleted =
    req > 0
      ? t('programProgressTooltipCompleted')
          .replace('{earned}', formatAmount(earned, false))
          .replace('{required}', formatAmount(req, false))
          .replace('{pct}', pctForTip)
      : t('programProgressPieLegendCompleted')
  const tooltipInProgress =
    req > 0
      ? t('programProgressTooltipInProgress').replace(
          '{inProgress}',
          formatAmount(inProgress, false),
        )
      : t('programProgressPieLegendInProgress')
  const tooltipRemaining =
    req > 0
      ? t('programProgressTooltipRemaining').replace('{remaining}', formatAmount(remaining, false))
      : t('programProgressPieLegendNeeded')

  return (
    <section
      className="portal-card portal-academics-program-progress"
      aria-label={t('programProgressSectionAria')}
    >
      <h2 className="portal-academics-program-progress__heading">{t('programProgressSectionHeading')}</h2>
      <div className="portal-academics-program-progress__grid">
        <div
          className="portal-academics-program-progress__chart-wrap"
          onMouseLeave={() => setPieHover(null)}
        >
          <div
            className={[
              'portal-academics-program-progress__tooltip',
              pieHover != null ? 'portal-academics-program-progress__tooltip--visible' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            id="program-progress-pie-tooltip"
            role="tooltip"
            aria-hidden={pieHover == null}
          >
            {pieHover === 'completed'
              ? tooltipCompleted
              : pieHover === 'inProgress'
                ? tooltipInProgress
                : pieHover === 'remaining'
                  ? tooltipRemaining
                  : null}
          </div>
          <svg
            className="portal-academics-program-progress__svg"
            viewBox="0 0 100 100"
            role="img"
            aria-label={caption}
            aria-describedby={pieHover != null ? 'program-progress-pie-tooltip' : undefined}
          >
            <title>{caption}</title>
            {remFull ? (
              <circle
                className="portal-academics-program-progress__slice portal-academics-program-progress__slice--remaining portal-academics-program-progress__slice--interactive"
                cx={PIE_CX}
                cy={PIE_CY}
                r={PIE_R}
                aria-hidden
                onMouseEnter={() => setPieHover('remaining')}
              />
            ) : pathRemaining ? (
              <path
                className="portal-academics-program-progress__slice portal-academics-program-progress__slice--remaining portal-academics-program-progress__slice--interactive"
                d={pathRemaining}
                aria-hidden
                onMouseEnter={() => setPieHover('remaining')}
              />
            ) : null}
            {ipFull ? (
              <circle
                className="portal-academics-program-progress__slice portal-academics-program-progress__slice--in-progress portal-academics-program-progress__slice--interactive"
                cx={PIE_CX}
                cy={PIE_CY}
                r={PIE_R}
                aria-hidden
                onMouseEnter={() => setPieHover('inProgress')}
              />
            ) : pathInProgress ? (
              <path
                className="portal-academics-program-progress__slice portal-academics-program-progress__slice--in-progress portal-academics-program-progress__slice--interactive"
                d={pathInProgress}
                aria-hidden
                onMouseEnter={() => setPieHover('inProgress')}
              />
            ) : null}
            {compFull ? (
              <circle
                className="portal-academics-program-progress__slice portal-academics-program-progress__slice--completed portal-academics-program-progress__slice--interactive"
                cx={PIE_CX}
                cy={PIE_CY}
                r={PIE_R}
                aria-hidden
                onMouseEnter={() => setPieHover('completed')}
              />
            ) : pathCompleted ? (
              <path
                className="portal-academics-program-progress__slice portal-academics-program-progress__slice--completed portal-academics-program-progress__slice--interactive"
                d={pathCompleted}
                aria-hidden
                onMouseEnter={() => setPieHover('completed')}
              />
            ) : null}
            <text
              className="portal-academics-program-progress__pct"
              x="50"
              y="50"
              textAnchor="middle"
              dominantBaseline="middle"
              pointerEvents="none"
            >
              {pctLabel}
            </text>
          </svg>
          <p className="portal-card-label portal-academics-program-progress__chart-label">
            {t('programProgressQuarterUnitsTitle')}
          </p>
          <ul className="portal-academics-program-progress__legend">
            <li>
              <span className="portal-academics-program-progress__swatch portal-academics-program-progress__swatch--completed" />
              {t('programProgressPieLegendCompleted')}
              {req > 0 ? ` (${formatAmount(earned, false)} / ${formatAmount(req, false)})` : ''}
            </li>
            <li>
              <span className="portal-academics-program-progress__swatch portal-academics-program-progress__swatch--in-progress" />
              {t('programProgressPieLegendInProgress')}
              {req > 0 ? ` (${formatAmount(inProgress, false)})` : ''}
            </li>
            <li>
              <span className="portal-academics-program-progress__swatch portal-academics-program-progress__swatch--remaining" />
              {t('programProgressPieLegendNeeded')}
              {req > 0 ? ` (${formatAmount(remaining, false)})` : ''}
            </li>
          </ul>
          <p className="portal-card-note portal-academics-program-progress__caption">{caption}</p>
        </div>
        <div className="portal-academics-program-progress__breakdown">
          <h3 className="portal-academics-program-progress__subheading">
            {t('programProgressBreakdownTitle')}
          </h3>
          <div className="portal-table-wrap">
            <table className="portal-table portal-academics-program-progress-table">
              <thead>
                <tr>
                  <th scope="col">{t('programProgressColCategory')}</th>
                  <th scope="col">{t('programProgressColRequired')}</th>
                  <th scope="col">{t('programProgressColCompleted')}</th>
                  <th scope="col">{t('programProgressColInProgress')}</th>
                  <th scope="col">{t('programProgressColRemaining')}</th>
                </tr>
              </thead>
              <tbody>
                {progress.buckets.map((b) => {
                  const hours = b.unitKind === 'clinical_hours'
                  const unit = hours ? t('programProgressHoursAbbr') : t('programProgressUnitsAbbr')
                  const ip = b.inProgress ?? 0
                  return (
                    <tr key={b.id}>
                      <th scope="row">{t(bucketLabelKey(b.id))}</th>
                      <td>
                        {formatAmount(b.required, hours)} {unit}
                      </td>
                      <td>
                        {formatAmount(b.completed, hours)} {unit}
                      </td>
                      <td>
                        {formatAmount(ip, hours)} {unit}
                      </td>
                      <td>
                        {formatAmount(b.remaining, hours)} {unit}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="portal-card-note portal-academics-program-progress__footnote">
            {t('programProgressFootnote')}
          </p>
        </div>
      </div>
      {completedFrac >= 1 && req > 0 ? (
        <p className="portal-card-note" style={{ marginTop: '0.5rem' }}>
          {t('completedTowardDegree')}
        </p>
      ) : null}
    </section>
  )
}
