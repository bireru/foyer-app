import { NavLink, Outlet } from 'react-router-dom'

const TABS = [
  { path: '/budget/depenses', label: 'Mes dépenses (privé)' },
  { path: '/budget/epargne', label: 'Épargne (privé)' },
  { path: '/budget/commun', label: 'Commun (Tricount)' },
  { path: '/budget/courses', label: 'Courses' }
]

export default function BudgetHome() {
  return (
    <div>
      <h2 className="text-2xl font-semibold mb-1">💶 Budget</h2>
      <p className="text-sm text-muted mb-4">
        "Mes dépenses" et "Épargne" sont privés — Cérine ne les voit pas, et tu ne vois pas les siens. "Commun" et "Courses" sont partagés entre vous deux.
      </p>
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
