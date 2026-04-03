export type DocumentsTabId = 'registration' | 'quiz' | 'agreements'

type DocumentsTabsProps = {
  active: DocumentsTabId
  onChange: (id: DocumentsTabId) => void
}

const ITEMS: { id: DocumentsTabId; label: string }[] = [
  { id: 'registration', label: 'Registration Forms' },
  { id: 'quiz', label: 'Quiz' },
  { id: 'agreements', label: 'Agreements' },
]

export function DocumentsTabs({ active, onChange }: DocumentsTabsProps) {
  return (
    <div
      className="portal-academics-print-hide"
      role="tablist"
      aria-label="Documents and forms sections"
    >
      <div className="portal-tab-group portal-academics-portal-tabs">
        {ITEMS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active === id}
            className={[
              'portal-tab',
              active === id ? 'portal-tab--active' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => onChange(id)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
