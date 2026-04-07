import type { ReactNode } from 'react'
import { PortalShell } from './PortalShell'

type PageLayoutProps = {
  children: ReactNode
}

/** Authenticated layout for legacy flows (e.g. payment plan); matches internal module shell (no student strip / banner). */
export function PageLayout({ children }: PageLayoutProps) {
  return (
    <PortalShell
      showStudentBar={false}
      showPortalBanner={false}
      internalModuleLayout
      sidebarNavVariant="internal"
    >
      {children}
    </PortalShell>
  )
}
