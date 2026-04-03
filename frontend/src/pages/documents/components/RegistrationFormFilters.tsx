import {
  REGISTRATION_QUARTERS,
  type RegistrationQuarter,
} from '../../../data/registrationFormTerms'

type RegistrationFormFiltersProps = {
  years: number[]
  year: number
  quarter: RegistrationQuarter
  onYearChange: (y: number) => void
  onQuarterChange: (q: RegistrationQuarter) => void
  onGenerate: () => void
  busy?: boolean
}

export function RegistrationFormFilters({
  years,
  year,
  quarter,
  onYearChange,
  onQuarterChange,
  onGenerate,
  busy,
}: RegistrationFormFiltersProps) {
  return (
    <div className="portal-registration-form-filters portal-academics-print-hide">
      <label className="portal-registration-form-filters__field">
        <span className="portal-registration-form-filters__label">Registration Year</span>
        <select
          className="portal-account-ledger__select"
          value={String(year)}
          onChange={(e) => onYearChange(Number(e.target.value))}
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </label>
      <label className="portal-registration-form-filters__field">
        <span className="portal-registration-form-filters__label">Quarter</span>
        <select
          className="portal-account-ledger__select"
          value={quarter}
          onChange={(e) =>
            onQuarterChange(e.target.value as RegistrationQuarter)
          }
        >
          {REGISTRATION_QUARTERS.map((q) => (
            <option key={q} value={q}>
              {q}
            </option>
          ))}
        </select>
      </label>
      <div className="portal-registration-form-filters__actions">
        <button
          type="button"
          className="portal-btn portal-btn--primary"
          onClick={onGenerate}
          disabled={busy}
        >
          {busy ? 'Loading…' : 'Generate'}
        </button>
      </div>
    </div>
  )
}
