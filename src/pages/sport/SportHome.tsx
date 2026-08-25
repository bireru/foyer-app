import { NavLink, Outlet } from 'react-router-dom'

const TABS = [
  { path: '/sport/poids', label: 'Poids & signes vitaux' },
  { path: '/sport/programmes', label: 'Programmes' },
  { path: '/sport/minuteur', label: 'Minuteur' },
  { path: '/sport/calendrier', label: 'Calendrier' }
]

export default function SportHome() {
  return (
    <div>
      <h2 className="text-2xl font-semibold mb-4">Sport & Bien-être</h2>
      <div className="flex gap-2 mb-6 border-b border-line">
        {TABS.map((t) => (
          <NavLink
            key={t.path}
            to={t.path}
            className={({ isActive }) =>
              `px-3 py-2 text-sm font-display border-b-2 -mb-px transition-colors ${
                isActive ? 'border-billel text-billel' : 'border-transparent text-muted hover:text-ink'
              }`
            }
          >
            {t.label}
          </NavLink>
        ))}
      </div>
      <Outlet />
    </div>
  )
}
