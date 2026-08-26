import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'

const MODULES = [
  { path: '/', label: '🏠 Accueil', ready: true },
  { path: '/sport', label: 'Sport & Bien-être', ready: true },
  { path: '/nourriture', label: 'Nourriture', ready: true },
  { path: '/budget', label: 'Budget', ready: true },
  { path: '/sorties', label: 'Sorties', ready: false },
  { path: '/evenements', label: 'Événements', ready: false },
  { path: '/voyages', label: 'Voyages', ready: false },
  { path: '/taches', label: 'Tâches ménagères', ready: false },
  { path: '/admin', label: 'Administratif', ready: false },
  { path: '/inventaire', label: 'Inventaire maison', ready: false },
  { path: '/vehicule', label: 'Véhicule', ready: false },
  { path: '/souvenirs', label: 'Souvenirs', ready: false }
]

export default function Layout() {
  const { profile, householdMembers, signOut } = useAuth()

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      <aside className="md:w-60 border-b md:border-b-0 md:border-r border-line bg-surface p-4 flex md:flex-col gap-4">
        <div>
          <NavLink to="/" className="font-display text-xl font-semibold hover:opacity-80">🏡 Foyer</NavLink>
          <div className="flex gap-1 mt-2">
            {householdMembers.map((m) => (
              <span key={m.id} className={m.color_tag === 'billel' ? 'tag-billel' : 'tag-cerine'}>
                {m.display_name}
              </span>
            ))}
          </div>
        </div>
        <nav className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible flex-1">
          {MODULES.map((m) =>
            m.ready ? (
              <NavLink
                key={m.path}
                to={m.path}
                end={m.path === '/'}
                className={({ isActive }) =>
                  `px-4 py-2 rounded-full text-sm font-display font-medium whitespace-nowrap transition-colors ${
                    isActive ? 'bg-billel text-white shadow-soft' : 'hover:bg-billel-bg text-ink'
                  }`
                }
              >
                {m.label}
              </NavLink>
            ) : (
              <span
                key={m.path}
                title="Bientôt disponible"
                className="px-4 py-2 rounded-full text-sm font-display whitespace-nowrap text-blueprint border border-dashed border-blueprint"
              >
                {m.label}
              </span>
            )
          )}
        </nav>
        <button onClick={signOut} className="text-xs text-muted hover:text-ink text-left">
          Déconnexion ({profile?.display_name})
        </button>
        <NavLink to="/sauvegarde" className="text-xs text-muted hover:text-ink text-left">
          💾 Sauvegarde
        </NavLink>
      </aside>
      <main className="flex-1 p-4 md:p-8">
        <Outlet />
      </main>
    </div>
  )
}
