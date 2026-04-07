import { NavLink } from 'react-router-dom'
import type { DashboardService } from './dashboardMockData'
import { DASHBOARD_SERVICES } from './dashboardMockData'
import { DashboardServiceIcon } from './DashboardServiceIcon'

function ServiceTile({ service }: { service: DashboardService }) {
  return (
    <li>
      <NavLink to={service.to} className="portal-dashboard-service-tile">
        <span className="portal-dashboard-service-tile-leading">
          <span className="portal-dashboard-service-tile-icon" aria-hidden>
            <DashboardServiceIcon name={service.icon} />
          </span>
          <span className="portal-dashboard-service-tile-body">
            <span className="portal-dashboard-service-tile-title">{service.title}</span>
          </span>
        </span>
        <span className="portal-dashboard-service-tile-arrow" aria-hidden>
          &#8250;
        </span>
      </NavLink>
    </li>
  )
}

export function DashboardServiceLauncher() {
  return (
    <section className="portal-dashboard-services" aria-labelledby="portal-dashboard-services-heading">
      <div className="portal-dashboard-services-head">
        <h2 id="portal-dashboard-services-heading" className="portal-dashboard-card-panel-title">
          Services
        </h2>
      </div>
      <ul className="portal-dashboard-service-list">
        {DASHBOARD_SERVICES.map((service) => (
          <ServiceTile key={service.to} service={service} />
        ))}
      </ul>
    </section>
  )
}
