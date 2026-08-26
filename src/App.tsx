import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/hooks/useAuth'
import Login from '@/pages/Login'
import Layout from '@/components/Layout'
import Dashboard from '@/pages/Dashboard'

// Chaque volet n'est chargé que lorsqu'on y navigue, au lieu d'être inclus dans le bundle initial
const SportHome = lazy(() => import('@/pages/sport/SportHome'))
const Weight = lazy(() => import('@/pages/sport/Weight'))
const Programs = lazy(() => import('@/pages/sport/Programs'))
const Timer = lazy(() => import('@/pages/sport/Timer'))
const Calendar = lazy(() => import('@/pages/sport/Calendar'))
const Progress = lazy(() => import('@/pages/sport/Progress'))

const FoodHome = lazy(() => import('@/pages/food/FoodHome'))
const MealPlan = lazy(() => import('@/pages/food/MealPlan'))
const Recipes = lazy(() => import('@/pages/food/Recipes'))
const Goals = lazy(() => import('@/pages/food/Goals'))

const BudgetHome = lazy(() => import('@/pages/budget/BudgetHome'))
const Expenses = lazy(() => import('@/pages/budget/Expenses'))
const Savings = lazy(() => import('@/pages/budget/Savings'))
const Shared = lazy(() => import('@/pages/budget/Shared'))
const Shopping = lazy(() => import('@/pages/budget/Shopping'))

const Backup = lazy(() => import('@/pages/backup/Backup'))

function PageFallback() {
  return <div className="text-muted text-sm py-8 text-center">Chargement…</div>
}

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
    <Suspense fallback={<PageFallback />}>
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
            <Route path="objectifs" element={<Goals />} />
          </Route>
          <Route path="budget" element={<BudgetHome />}>
            <Route index element={<Navigate to="depenses" replace />} />
            <Route path="depenses" element={<Expenses />} />
            <Route path="epargne" element={<Savings />} />
            <Route path="commun" element={<Shared />} />
            <Route path="courses" element={<Shopping />} />
          </Route>
          <Route path="sauvegarde" element={<Backup />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
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
