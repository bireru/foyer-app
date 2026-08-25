import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/hooks/useAuth'
import Login from '@/pages/Login'
import Layout from '@/components/Layout'
import Dashboard from '@/pages/Dashboard'
import SportHome from '@/pages/sport/SportHome'
import Weight from '@/pages/sport/Weight'
import Programs from '@/pages/sport/Programs'
import Timer from '@/pages/sport/Timer'
import Calendar from '@/pages/sport/Calendar'

function Gate() {
  const { session, profile, loading } = useAuth()

  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted">Chargement…</div>
  if (!session) return <Login />
  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center text-center px-4">
        <p className="text-muted max-w-sm">
          Ton compte est connecté mais n'a pas encore de profil dans un foyer. Il faut créer une ligne dans la table
          <code className="font-mono"> profiles</code> (voir README) pour te rattacher à ton foyer.
        </p>
      </div>
    )
  }

  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="sport" element={<SportHome />}>
          <Route index element={<Navigate to="poids" replace />} />
          <Route path="poids" element={<Weight />} />
          <Route path="programmes" element={<Programs />} />
          <Route path="minuteur" element={<Timer />} />
          <Route path="calendrier" element={<Calendar />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </BrowserRouter>
  )
}
