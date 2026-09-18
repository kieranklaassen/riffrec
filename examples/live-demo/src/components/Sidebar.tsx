import { NavLink } from 'react-router-dom'

type SidebarProps = {
  open: boolean
}

const items = [
  { to: '/', label: 'Dashboard', icon: '▦', end: true },
  { to: '/activity', label: 'Activity', icon: '◔' },
  { to: '/settings', label: 'Settings', icon: '⚙' },
]

export function Sidebar({ open }: SidebarProps) {
  return (
    <aside id="sidebar" className={`sidebar ${open ? 'sidebar--open' : 'sidebar--closed'}`}>
      <div className="sidebar__section-title">Workspace</div>
      <nav className="sidebar__nav" aria-label="Sidebar">
        {items.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className="sidebar__link" title={item.label}>
            <span className="sidebar__icon" aria-hidden="true">
              {item.icon}
            </span>
            <span className="sidebar__label">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="sidebar__section-title">Projects</div>
      <ul className="sidebar__projects">
        <li>
          <span className="dot dot--green" /> <span className="sidebar__label">Launchpad</span>
        </li>
        <li>
          <span className="dot dot--blue" /> <span className="sidebar__label">Billing v2</span>
        </li>
        <li>
          <span className="dot dot--amber" /> <span className="sidebar__label">Mobile beta</span>
        </li>
      </ul>

      <div className="sidebar__footer">
        <div className="plan-card">
          <div className="plan-card__title">Pro plan</div>
          <div className="plan-card__meta">14 days left in trial</div>
          <button type="button" className="button button--small">
            Upgrade
          </button>
        </div>
      </div>
    </aside>
  )
}
