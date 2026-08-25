import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

interface LogEntry {
  id: string
  profile_id: string
  logged_at: string
  description: string
  calories_kcal: number | null
  protein_g: number | null
  recipe_id: string | null
}

interface Recipe {
  id: string
  name: string
  calories_kcal: number | null
  protein_g: number | null
}

const COLOR_BY_TAG: Record<string, string> = { billel: '#E0714B', cerine: '#A8577A' }

export default function Goals() {
  const { profile, householdMembers, refreshHousehold } = useAuth()
  const [editingGoals, setEditingGoals] = useState(false)
  const [calorieInput, setCalorieInput] = useState('')
  const [proteinInput, setProteinInput] = useState('')
  const [log, setLog] = useState<LogEntry[]>([])
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [selectedRecipeId, setSelectedRecipeId] = useState('')
  const [desc, setDesc] = useState('')
  const [cal, setCal] = useState('')
  const [prot, setProt] = useState('')

  const load = useCallback(async () => {
    if (!profile) return
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const { data } = await supabase
      .from('food_log')
      .select('*')
      .eq('household_id', profile.household_id)
      .gte('logged_at', todayStart.toISOString())
      .order('logged_at', { ascending: false })
    setLog(data ?? [])

    const { data: recs } = await supabase
      .from('recipes')
      .select('id, name, calories_kcal, protein_g')
      .eq('household_id', profile.household_id)
      .order('name', { ascending: true })
    setRecipes(recs ?? [])
  }, [profile])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    setCalorieInput(profile?.calorie_goal_kcal != null ? String(profile.calorie_goal_kcal) : '')
    setProteinInput(profile?.protein_goal_g != null ? String(profile.protein_goal_g) : '')
  }, [profile?.calorie_goal_kcal, profile?.protein_goal_g])

  const saveGoals = async () => {
    if (!profile) return
    await supabase
      .from('profiles')
      .update({
        calorie_goal_kcal: calorieInput ? parseInt(calorieInput, 10) : null,
        protein_goal_g: proteinInput ? parseInt(proteinInput, 10) : null
      })
      .eq('id', profile.id)
    setEditingGoals(false)
    await refreshHousehold()
  }

  // Choisir une recette pré-remplit description/calories/protéines (les champs restent modifiables)
  const handleSelectRecipe = (recipeId: string) => {
    setSelectedRecipeId(recipeId)
    const recipe = recipes.find((r) => r.id === recipeId)
    if (recipe) {
      setDesc(recipe.name)
      setCal(recipe.calories_kcal != null ? String(recipe.calories_kcal) : '')
      setProt(recipe.protein_g != null ? String(recipe.protein_g) : '')
    } else {
      setDesc('')
      setCal('')
      setProt('')
    }
  }

  const addLogEntry = async () => {
    if (!profile || !desc) return
    const { data } = await supabase
      .from('food_log')
      .insert({
        household_id: profile.household_id,
        profile_id: profile.id,
        description: desc,
        calories_kcal: cal ? parseInt(cal, 10) : null,
        protein_g: prot ? parseInt(prot, 10) : null,
        recipe_id: selectedRecipeId || null
      })
      .select()
      .single()
    if (data) setLog((prev) => [data, ...prev])
    setDesc('')
    setCal('')
    setProt('')
    setSelectedRecipeId('')
  }

  const deleteLogEntry = async (id: string) => {
    await supabase.from('food_log').delete().eq('id', id)
    setLog((prev) => prev.filter((l) => l.id !== id))
  }

  const memberName = (id: string) => householdMembers.find((m) => m.id === id)?.display_name ?? '?'
  const memberColor = (id: string) => COLOR_BY_TAG[householdMembers.find((m) => m.id === id)?.color_tag ?? 'billel']

  const todayTotals = (profileId: string) => {
    const mine = log.filter((l) => l.profile_id === profileId)
    return {
      calories: mine.reduce((s, l) => s + (l.calories_kcal ?? 0), 0),
      protein: mine.reduce((s, l) => s + (l.protein_g ?? 0), 0)
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid sm:grid-cols-2 gap-4">
        {householdMembers.map((m) => {
          const isMe = m.id === profile?.id
          const color = COLOR_BY_TAG[m.color_tag]
          const totals = todayTotals(m.id)
          return (
            <div key={m.id} className="card">
              <div className="flex items-center justify-between mb-2">
                <span className={m.color_tag === 'cerine' ? 'tag-cerine' : 'tag-billel'}>{m.display_name}</span>
                {isMe && !editingGoals && (
                  <button onClick={() => setEditingGoals(true)} className="text-xs underline text-muted">Modifier</button>
                )}
              </div>

              {isMe && editingGoals ? (
                <div className="space-y-2">
                  <label className="text-sm">
                    Objectif calories/jour
                    <input type="number" className="input mt-1" value={calorieInput} onChange={(e) => setCalorieInput(e.target.value)} placeholder="ex: 2200" />
                  </label>
                  <label className="text-sm">
                    Objectif protéines/jour (g)
                    <input type="number" className="input mt-1" value={proteinInput} onChange={(e) => setProteinInput(e.target.value)} placeholder="ex: 140" />
                  </label>
                  <button onClick={saveGoals} className="btn-ink">Valider</button>
                </div>
              ) : (
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted mb-1">Objectif quotidien</p>
                  <div className="flex items-baseline gap-4 flex-wrap">
                    <p className="font-display font-bold text-4xl" style={{ color }}>
                      {m.calorie_goal_kcal ?? '—'} <span className="text-lg font-normal text-muted">kcal</span>
                    </p>
                    <p className="font-display font-bold text-4xl" style={{ color }}>
                      {m.protein_goal_g ?? '—'} <span className="text-lg font-normal text-muted">g prot.</span>
                    </p>
                  </div>
                  <p className="text-sm text-muted mt-2">
                    Aujourd'hui : {totals.calories} kcal · {totals.protein} g protéines
                  </p>
                  {isMe && m.calorie_goal_kcal == null && (
                    <button onClick={() => setEditingGoals(true)} className="text-sm underline mt-1">
                      Définir un objectif
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="card">
        <h3 className="font-display font-semibold mb-3">Journal du jour — {profile?.display_name}</h3>

        <label className="text-sm block mb-2">
          Depuis une recette (optionnel)
          <select
            className="input mt-1"
            value={selectedRecipeId}
            onChange={(e) => handleSelectRecipe(e.target.value)}
          >
            <option value="">— Saisie libre —</option>
            {recipes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}{r.calories_kcal != null ? ` (${r.calories_kcal} kcal)` : ''}
              </option>
            ))}
          </select>
        </label>

        <div className="flex gap-2 flex-wrap mb-4">
          <input
            className="input flex-1 min-w-[150px]"
            placeholder="Ce que tu as mangé"
            value={desc}
            onChange={(e) => { setDesc(e.target.value); setSelectedRecipeId('') }}
          />
          <input type="number" className="input w-28" placeholder="kcal" value={cal} onChange={(e) => setCal(e.target.value)} />
          <input type="number" className="input w-28" placeholder="prot. g" value={prot} onChange={(e) => setProt(e.target.value)} />
          <button onClick={addLogEntry} disabled={!desc} className="btn-ink">Ajouter</button>
        </div>

        <ul className="space-y-2">
          {log.map((entry) => (
            <li key={entry.id} className="flex items-center justify-between gap-2 border-b border-line/50 pb-2 text-sm">
              <div>
                <span style={{ color: memberColor(entry.profile_id) }} className="font-medium">{memberName(entry.profile_id)}</span>
                {' — '}{entry.description}
                {entry.calories_kcal != null && ` · ${entry.calories_kcal} kcal`}
                {entry.protein_g != null && ` · ${entry.protein_g}g prot.`}
                {entry.recipe_id && <span className="tag-billel ml-2">recette</span>}
              </div>
              <button onClick={() => deleteLogEntry(entry.id)} className="text-billel text-xs whitespace-nowrap">Supprimer</button>
            </li>
          ))}
          {log.length === 0 && <p className="text-sm text-muted">Rien enregistré aujourd'hui.</p>}
        </ul>
      </div>
    </div>
  )
}
