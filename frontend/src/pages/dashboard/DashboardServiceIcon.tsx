import type { ComponentType, SVGProps } from 'react'
import type { DashboardService } from './dashboardMockData'
import {
  IconAcademics,
  IconClinical,
  IconDocument,
  IconFinance,
  IconMyAccount,
  IconRegistration,
} from '../../components/icons/PortalModuleIcons'

const SERVICE_ICON: Record<DashboardService['icon'], ComponentType<SVGProps<SVGSVGElement>>> = {
  registration: IconRegistration,
  finances: IconFinance,
  academics: IconAcademics,
  clinical: IconClinical,
  documents: IconDocument,
  account: IconMyAccount,
}

type Props = {
  name: DashboardService['icon']
  className?: string
}

/** Module icons — `currentColor` inherits from the service tile row. */
export function DashboardServiceIcon({ name, className }: Props) {
  const Cmp = SERVICE_ICON[name]
  if (!Cmp) return null
  return (
    <span
      className={['portal-dashboard-service-icon-root', className].filter(Boolean).join(' ')}
      aria-hidden
    >
      <Cmp width={24} height={24} />
    </span>
  )
}
