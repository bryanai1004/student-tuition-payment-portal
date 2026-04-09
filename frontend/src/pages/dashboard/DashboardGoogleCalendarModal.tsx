import { useEffect, type MouseEvent } from 'react'

export function DashboardGoogleCalendarModal({
  title,
  items,
  onClose,
}: {
  title: string
  items: { href: string; label: string }[]
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function backdropMouseDown(e: MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div
      className="portal-dashboard-gcal-modal-backdrop"
      role="presentation"
      onMouseDown={backdropMouseDown}
    >
      <div
        className="portal-dashboard-gcal-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="portal-dashboard-gcal-modal-title"
      >
        <div className="portal-dashboard-gcal-modal__header">
          <h3 id="portal-dashboard-gcal-modal-title" className="portal-dashboard-gcal-modal__title">
            {title}
          </h3>
          <button
            type="button"
            className="portal-dashboard-gcal-modal__close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <p className="portal-dashboard-gcal-modal__lede">
          Each link opens Google Calendar with a prefilled recurring event. Confirm or edit in Google,
          then save.
        </p>
        <ul className="portal-dashboard-gcal-modal__list">
          {items.map((item) => (
            <li key={item.href} className="portal-dashboard-gcal-modal__row">
              <span className="portal-dashboard-gcal-modal__course">{item.label}</span>
              <a
                className="portal-text-link portal-dashboard-gcal-modal__action"
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
              >
                Add to Google Calendar
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
