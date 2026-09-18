import { NavLink } from 'react-router-dom'

type HeaderProps = {
  sidebarOpen: boolean
  onToggleSidebar: () => void
}

export function Header({ sidebarOpen, onToggleSidebar }: HeaderProps) {
  return (
    <header className="header">
      <div className="header__left">
        <button
          type="button"
          className="icon-button"
          aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          aria-expanded={sidebarOpen}
          aria-controls="sidebar"
          onClick={onToggleSidebar}
        >
          <span aria-hidden="true">☰</span>
        </button>
        <NavLink to="/" className="brand">
          <span className="brand__mark" aria-hidden="true" />
          <span className="brand__name">Orbit Admin</span>
        </NavLink>
      </div>

      <nav className="header__nav" aria-label="Primary">
        <NavLink to="/" end className="header__link">
          Dashboard
        </NavLink>
        <NavLink to="/activity" className="header__link">
          Activity
        </NavLink>
        <NavLink to="/settings" className="header__link">
          Settings
        </NavLink>
      </nav>

      <div className="header__right">
        <input className="header__search" type="search" placeholder="Search…" aria-label="Search" />
        <button type="button" className="icon-button" aria-label="Notifications">
          <span aria-hidden="true">🔔</span>
          <span className="badge">3</span>
        </button>
        <div className="avatar" title="Kieran Klaassen">
          KK
        </div>
      </div>
    </header>
  )
}
