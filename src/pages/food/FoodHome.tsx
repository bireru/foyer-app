import { NavLink, Outlet } from 'react-router-dom'

const TABS = [
  { path: '/nourriture/plan', label: 'Plan de repas' },
  { path: '/nourriture/recettes', label: 'Recettes' },
  { path: '/nourriture/courses', label: 'Courses' },
  { path: '/nourriture/objectifs', label: 'Objectifs' }
]

export default function FoodHome() {
  return (
    <div>
      <h2 className="text-2xl font-semibold mb-4">🍽️ Nourriture</h2>
      <div className="flex gap-2 mb-6 border-b border-line overflow-x-auto">
        {TABS.map((t) => (
          <NavLink
            key={t.path}
            to={t.path}
            className={({ isActive }) =>
              `px-3 py-2 text-sm font-display border-b-2 -mb-px whitespace-nowrap transition-colors ${
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
