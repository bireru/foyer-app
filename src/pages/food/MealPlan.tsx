import { useEffect, useState, useCallback, useMemo, Fragment } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

interface Recipe {
  id: string
  name: string
}

interface PlanEntry {
  id: string
  plan_date: string
  meal_slot: string
  recipe_id: string | null
  custom_label: string | null
}

const SLOTS: { key: string; label: string }[] = [
  { key: 'petit-dejeuner', label: 'Petit-déj' },
  { key: 'dejeuner', label: 'Déjeuner' },
  { key: 'diner', label: 'Dîner' },
  { key: 'collation', label: 'Collation' }
]

function startOfWeek(date: Date) {
  const d = new Date(date)
  const day = (d.getDay() + 6) % 7 // 0 = lundi
  d.setDate(d.getDate() - day)
  d.setHours(0, 0, 0, 0)
  return d
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10)
}

export default function MealPlan() {
  const { profile } = useAuth()
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [entries, setEntries] = useState<PlanEntry[]>([])
  const [editingCell, setEditingCell] = useState<string | null>(null) // `${date}_${slot}`

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart)
      d.setDate(d.getDate() + i)
      return d
    }),
    [weekStart]
  )

  const load = useCallback(async () => {
    if (!profile) return
    const { data: recs } = await supabase
      .from('recipes')
      .select('id, name')
      .eq('household_id', profile.household_id)
      .order('name', { ascending: true })
    setRecipes(recs ?? [])

    const from = isoDate(days[0])
    const to = isoDate(days[6])
    const { data: ents } = await supabase
      .from('meal_plan_entries')
      .select('*')
      .eq('household_id', profile.household_id)
      .gte('plan_date', from)
      .lte('plan_date', to)
    setEntries(ents ?? [])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, weekStart])

  useEffect(() => {
    load()
  }, [load])

  const entryFor = (date: string, slot: string) => entries.find((e) => e.plan_date === date && e.meal_slot === slot)
  const recipeName = (id: string | null) => recipes.find((r) => r.id === id)?.name

  const setEntry = async (date: string, slot: string, recipeId: string | null, customLabel: string | null) => {
    if (!profile) return
    const existing = entryFor(date, slot)
    if (!recipeId && !customLabel) {
      if (existing) {
        await supabase.from('meal_plan_entries').delete().eq('id', existing.id)
        setEntries((prev) => prev.filter((e) => e.id !== existing.id))
      }
      setEditingCell(null)
      return
    }
    if (existing) {
      await supabase.from('meal_plan_entries').update({ recipe_id: recipeId, custom_label: customLabel }).eq('id', existing.id)
      setEntries((prev) => prev.map((e) => (e.id === existing.id ? { ...e, recipe_id: recipeId, custom_label: customLabel } : e)))
    } else {
      const { data } = await supabase
        .from('meal_plan_entries')
        .insert({ household_id: profile.household_id, plan_date: date, meal_slot: slot, recipe_id: recipeId, custom_label: customLabel })
        .select()
        .single()
      if (data) setEntries((prev) => [...prev, data])
    }
    setEditingCell(null)
  }

  const weekLabel = `${weekStart.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} – ${days[6].toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button className="text-sm underline" onClick={() => setWeekStart((d) => { const n = new Date(d); n.setDate(n.getDate() - 7); return n })}>
          ← Semaine précédente
        </button>
        <h3 className="font-display font-semibold">{weekLabel}</h3>
        <button className="text-sm underline" onClick={() => setWeekStart((d) => { const n = new Date(d); n.setDate(n.getDate() + 7); return n })}>
          Semaine suivante →
        </button>
      </div>

      <div className="overflow-x-auto">
        <div className="grid grid-cols-[100px_repeat(7,minmax(120px,1fr))] gap-1 min-w-[800px]">
          <div />
          {days.map((d) => (
            <div key={isoDate(d)} className="text-center text-sm font-display font-semibold py-1">
              {d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' })}
            </div>
          ))}
          {SLOTS.map((slot) => (
            <Fragment key={slot.key}>
              <div className="text-sm text-muted flex items-center py-1">{slot.label}</div>
              {days.map((d) => {
                const date = isoDate(d)
                const cellKey = `${date}_${slot.key}`
                const entry = entryFor(date, slot.key)
                const label = entry ? (entry.recipe_id ? recipeName(entry.recipe_id) : entry.custom_label) : null
                return (
                  <div key={cellKey} className="card p-2 min-h-[64px]">
                    {editingCell === cellKey ? (
                      <div className="space-y-1">
                        <select
                          className="input text-xs py-1"
                          defaultValue={entry?.recipe_id ?? ''}
                          onChange={(e) => {
                            if (e.target.value === '__custom__') return
                            setEntry(date, slot.key, e.target.value || null, null)
                          }}
                        >
                          <option value="">— vide —</option>
                          {recipes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                          <option value="__custom__">Texte libre…</option>
                        </select>
                        <input
                          className="input text-xs py-1"
                          placeholder="ou texte libre"
                          defaultValue={entry?.custom_label ?? ''}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') setEntry(date, slot.key, null, (e.target as HTMLInputElement).value)
                          }}
                          onBlur={(e) => {
                            if (e.target.value) setEntry(date, slot.key, null, e.target.value)
                          }}
                        />
                      </div>
                    ) : (
                      <button onClick={() => setEditingCell(cellKey)} className="text-left w-full text-xs">
                        {label ? <span className="font-medium">{label}</span> : <span className="text-muted">+ ajouter</span>}
                      </button>
                    )}
                  </div>
                )
              })}
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  )
}
