import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

type Profile = {
  id: string
  household_id: string
  display_name: string
  color_tag: 'billel' | 'cerine'
  weight_goal_kg: number | null
  calorie_goal_kcal: number | null
  protein_goal_g: number | null
}

interface AuthContextValue {
  session: Session | null
  profile: Profile | null
  householdMembers: Profile[]
  loading: boolean
  signOut: () => Promise<void>
  refreshHousehold: () => Promise<void>
  updateLocalProfile: (patch: Partial<Profile>) => void
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [householdMembers, setHouseholdMembers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  const loadHousehold = useCallback(async (userId: string) => {
    const { data: me } = await supabase.from('profiles').select('*').eq('id', userId).single()
    if (!me) return
    setProfile(me)
    // Charge tout le foyer (mode partagé : on voit les données de l'autre)
    const { data: members } = await supabase.from('profiles').select('*').eq('household_id', me.household_id)
    setHouseholdMembers(members ?? [])
  }, [])

  useEffect(() => {
    if (!session) {
      setProfile(null)
      setHouseholdMembers([])
      setLoading(false)
      return
    }
    setLoading(true)
    loadHousehold(session.user.id).then(() => setLoading(false))
  }, [session, loadHousehold])

  const refreshHousehold = useCallback(async () => {
    if (session) await loadHousehold(session.user.id)
  }, [session, loadHousehold])

  // Met à jour l'objectif etc. localement après une écriture réussie, sans re-télécharger tout le foyer
  const updateLocalProfile = useCallback((patch: Partial<Profile>) => {
    setProfile((prev) => (prev ? { ...prev, ...patch } : prev))
    setHouseholdMembers((prev) => prev.map((m) => (m.id === profile?.id ? { ...m, ...patch } : m)))
  }, [profile?.id])

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ session, profile, householdMembers, loading, signOut, refreshHousehold, updateLocalProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth doit être utilisé dans un AuthProvider')
  return ctx
}
