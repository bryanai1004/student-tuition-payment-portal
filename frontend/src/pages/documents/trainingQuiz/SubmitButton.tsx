import type { ReactNode } from 'react'

type SubmitButtonProps = {
  disabled?: boolean
  loading?: boolean
  children: ReactNode
}

export function SubmitButton({ disabled, loading, children }: SubmitButtonProps) {
  return (
    <button
      type="submit"
      className="portal-btn portal-btn--primary portal-doc-quiz-submit-btn"
      disabled={disabled || loading}
      aria-busy={loading ? true : undefined}
    >
      {children}
    </button>
  )
}
