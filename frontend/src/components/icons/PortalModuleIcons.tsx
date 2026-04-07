import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

function iconAttrs(props: IconProps) {
  const { width = 24, height = 24, fill = 'none', 'aria-hidden': ariaHidden = true, ...rest } = props
  return { width, height, fill, 'aria-hidden': ariaHidden, ...rest }
}

export function IconRegistration(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...iconAttrs(props)}>
      <path d="M0 0h24v24H0z" fill="none" />
      <path
        fill="currentColor"
        d="M21 3a1 1 0 0 1 0 2v9a3 3 0 0 1 -3 3h-5v2h2a1 1 0 0 1 0 2h-6a1 1 0 0 1 0 -2h2v-2h-5a3 3 0 0 1 -3 -3v-9a1 1 0 1 1 0 -2zm-12 4a1 1 0 0 0 -1 1v4a1 1 0 0 0 2 0v-4a1 1 0 0 0 -1 -1m6 2a1 1 0 0 0 -1 1v2a1 1 0 0 0 2 0v-2a1 1 0 0 0 -1 -1m-3 1a1 1 0 0 0 -1 1v1a1 1 0 0 0 2 0v-1a1 1 0 0 0 -1 -1"
      />
    </svg>
  )
}

export function IconFinance(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...iconAttrs(props)}>
      <path d="M0 0h24v24H0z" fill="none" />
      <path
        fill="currentColor"
        d="M17 3.34a10 10 0 1 1 -15 8.66l.005 -.324a10 10 0 0 1 14.995 -8.336zm-5 2.66a1 1 0 0 0 -1 1a3 3 0 1 0 0 6v2a1.024 1.024 0 0 1 -.866 -.398l-.068 -.101a1 1 0 0 0 -1.732 .998a3 3 0 0 0 2.505 1.5h.161a1 1 0 0 0 .883 .994l.117 .007a1 1 0 0 0 1 -1l.176 -.005a3 3 0 0 0 -.176 -5.995v-2c.358 -.012 .671 .14 .866 .398l.068 .101a1 1 0 0 0 1.732 -.998a3 3 0 0 0 -2.505 -1.501h-.161a1 1 0 0 0 -1 -1zm1 7a1 1 0 0 1 0 2v-2zm-2 -4v2a1 1 0 0 1 0 -2z"
      />
    </svg>
  )
}

export function IconAcademics(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...iconAttrs(props)}>
      <path d="M0 0h24v24H0z" fill="none" />
      <path
        fill="currentColor"
        d="M19 13.431v2.569c0 2.398 -3.205 4 -7 4s-7 -1.602 -7 -4v-2.569l5.886 2.354a3 3 0 0 0 2.011 .078l.217 -.078zm2 -2.955l-8.629 3.452a1 1 0 0 1 -.742 0l-10 -4c-.839 -.335 -.839 -1.521 0 -1.856l10 -4a1 1 0 0 1 .245 -.064l.126 -.008l.126 .008a1 1 0 0 1 .245 .064l10.032 4.013l.108 .055l.099 .068l.088 .076l.075 .082l.035 .044l.073 .115l.052 .115l.034 .102l.025 .135l.006 .058l.002 6.065a1 1 0 0 1 -2 0z"
      />
    </svg>
  )
}

export function IconClinical(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...iconAttrs(props)}>
      <path d="M0 0h24v24H0z" fill="none" />
      <path
        fill="currentColor"
        d="M12.002 4c2.866 0 6.7 1.365 9.532 3.155a1 1 0 0 1 .45 1.024l-2 11a1 1 0 0 1 -.984 .821h-14a1 1 0 0 1 -.984 -.821l-2 -11a1 1 0 0 1 .45 -1.024c2.834 -1.792 6.724 -3.16 9.536 -3.155m-.002 5a1 1 0 0 0 -1 1v1h-1a1 1 0 0 0 -.993 .883l-.007 .117a1 1 0 0 0 1 1h1v1a1 1 0 0 0 .883 .993l.117 .007a1 1 0 0 0 1 -1v-1h1a1 1 0 0 0 .993 -.883l.007 -.117a1 1 0 0 0 -1 -1h-1v-1a1 1 0 0 0 -.883 -.993z"
      />
    </svg>
  )
}

export function IconDocument(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...iconAttrs(props)}>
      <path d="M0 0h24v24H0z" fill="none" />
      <path
        fill="currentColor"
        d="M12 2l.117 .007a1 1 0 0 1 .876 .876l.007 .117v4l.005 .15a2 2 0 0 0 1.838 1.844l.157 .006h4l.117 .007a1 1 0 0 1 .876 .876l.007 .117v9a3 3 0 0 1 -2.824 2.995l-.176 .005h-10a3 3 0 0 1 -2.995 -2.824l-.005 -.176v-14a3 3 0 0 1 2.824 -2.995l.176 -.005zm3 14h-6a1 1 0 0 0 0 2h6a1 1 0 0 0 0 -2m0 -4h-6a1 1 0 0 0 0 2h6a1 1 0 0 0 0 -2"
      />
      <path fill="currentColor" d="M19 7h-4l-.001 -4.001z" />
    </svg>
  )
}

export function IconMyAccount(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...iconAttrs(props)}>
      <path d="M0 0h24v24H0z" fill="none" />
      <path fill="currentColor" d="M12 2a5 5 0 1 1 -5 5l.005 -.217a5 5 0 0 1 4.995 -4.783z" />
      <path fill="currentColor" d="M14 14a5 5 0 0 1 5 5v1a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-1a5 5 0 0 1 5 -5h4z" />
    </svg>
  )
}

export function IconUserCircle(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...iconAttrs(props)}>
      <path d="M0 0h24v24H0z" fill="none" />
      <path
        d="M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9 10a3 3 0 1 0 6 0a3 3 0 1 0 -6 0"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6.168 18.849a4 4 0 0 1 3.832 -2.849h4a4 4 0 0 1 3.834 2.855"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function IconLogout(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...iconAttrs(props)}>
      <path d="M0 0h24v24H0z" fill="none" />
      <path
        d="M14 8v-2a2 2 0 0 0 -2 -2h-7a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h7a2 2 0 0 0 2 -2v-2"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9 12h12l-3 -3"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M18 15l3 -3"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
