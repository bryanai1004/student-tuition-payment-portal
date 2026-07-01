import type { ReactNode } from 'react'

export function ProfileSection({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <section className="portal-profile-section">
      <h3 className="portal-profile-section__title">{title}</h3>
      <dl className="portal-profile-field-grid">{children}</dl>
    </section>
  )
}

export function ProfileField({
  label,
  children,
  note,
  fullWidth,
}: {
  label: string
  children: ReactNode
  note?: string
  fullWidth?: boolean
}) {
  return (
    <div className={`portal-profile-field${fullWidth ? ' portal-profile-field--full' : ''}`}>
      <dt>{label}</dt>
      <dd>
        {children}
        {note ? <p className="portal-profile-field-note">{note}</p> : null}
      </dd>
    </div>
  )
}

export function ProfileReadonlyValue({
  children,
  muted,
}: {
  children: ReactNode
  muted?: boolean
}) {
  return (
    <span
      className={`portal-profile-readonly${muted ? ' portal-profile-readonly--muted' : ''}`}
    >
      {children}
    </span>
  )
}
