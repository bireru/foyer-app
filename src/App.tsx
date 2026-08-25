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
import Progress from '@/pages/sport/Progress'
import FoodHome from '@/pages/food/FoodHome'
import MealPlan from '@/pages/food/MealPlan'
import Recipes from '@/pages/food/Recipes'
import Shopping from '@/pages/food/Shopping'
import Goals from '@/pages/food/Goals'
import BudgetHome from '@/pages/budget/BudgetHome'
import Expenses from '@/pages/budget/Expenses'
import Savings from '@/pages/budget/Savings'
import Shared from '@/pages/budget/Shared'
import Backup from '@/pages/backup/Backup'

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
          <Route path="progression" element={<Progress />} />
        </Route>
        <Route path="nourriture" element={<FoodHome />}>
          <Route index element={<Navigate to="plan" replace />} />
          <Route path="plan" element={<MealPlan />} />
          <Route path="recettes" element={<Recipes />} />
          <Route path="courses" element={<Shopping />} />
          <Route path="objectifs" element={<Goals />} />
        </Route>
        <Route path="budget" element={<BudgetHome />}>
          <Route index element={<Navigate to="depenses" replace />} />
          <Route path="depenses" element={<Expenses />} />
          <Route path="epargne" element={<Savings />} />
          <Route path="commun" element={<Shared />} />
        </Route>
        <Route path="sauvegarde" element={<Backup />} />
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
