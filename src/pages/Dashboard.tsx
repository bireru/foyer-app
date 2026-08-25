import { Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'

const ROOMS = [
  { path: '/sport', label: 'Sport & Bien-être', ready: true, desc: 'Poids, programmes, minuteur', icon: '🏋️' },
  { path: '/budget', label: 'Budget', ready: false, desc: '', icon: '💶' },
  { path: '/sorties', label: 'Sorties', ready: false, desc: '', icon: '🍽️' },
  { path: '/evenements', label: 'Événements', ready: false, desc: '', icon: '🎉' },
  { path: '/voyages', label: 'Voyages', ready: false, desc: '', icon: '✈️' },
  { path: '/taches', label: 'Tâches ménagères', ready: false, desc: '', icon: '🧹' },
  { path: '/admin', label: 'Administratif', ready: false, desc: '', icon: '📄' },
  { path: '/inventaire', label: 'Inventaire maison', ready: false, desc: '', icon: '📦' },
  { path: '/vehicule', label: 'Véhicule', ready: false, desc: '', icon: '🚗' },
  { path: '/souvenirs', label: 'Souvenirs', ready: false, desc: '', icon: '📸' }
]

export default function Dashboard() {
  const { profile } = useAuth()
  return (
    <div>
      <h2 className="text-2xl font-semibold mb-1">Bonjour {profile?.display_name} 👋</h2>
      <p className="text-muted mb-6">Le plan du foyer — les pièces en pointillé arrivent bientôt.</p>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {ROOMS.map((r) =>
          r.ready ? (
            <Link
              key={r.path}
              to={r.path}
              className="room-tile border-line bg-surface hover:border-billel"
            >
              <span className="text-2xl">{r.icon}</span>
              <h3 className="font-display font-semibold mt-1">{r.label}</h3>
              <p className="text-sm text-muted mt-1">{r.desc}</p>
            </Link>
          ) : (
            <div key={r.path} className="room-tile room-tile--planned">
              <span className="text-2xl opacity-60">{r.icon}</span>
              <h3 className="font-display font-semibold mt-1">{r.label}</h3>
              <p className="text-xs mt-1">À construire</p>
            </div>
          )
        )}
      </div>
    </div>
  )
}
