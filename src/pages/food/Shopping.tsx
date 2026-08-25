import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

interface ShoppingList {
  id: string
  name: string
  created_at: string
}

interface ShoppingItem {
  id: string
  list_id: string
  name: string
  quantity: string | null
  estimated_cost: number | null
  actual_cost: number | null
  purchased: boolean
}

function startOfWeek(date: Date) {
  const d = new Date(date)
  const day = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - day)
  d.setHours(0, 0, 0, 0)
  return d
}
function isoDate(d: Date) {
  return d.toISOString().slice(0, 10)
}

export default function Shopping() {
  const { profile } = useAuth()
  const [lists, setLists] = useState<ShoppingList[]>([])
  const [activeListId, setActiveListId] = useState<string | null>(null)
  const [items, setItems] = useState<ShoppingItem[]>([])
  const [newItemName, setNewItemName] = useState('')
  const [newItemCost, setNewItemCost] = useState('')
  const [generating, setGenerating] = useState(false)

  const load = useCallback(async () => {
    if (!profile) return
    const { data: l } = await supabase
      .from('shopping_lists')
      .select('id, name, created_at')
      .eq('household_id', profile.household_id)
      .order('created_at', { ascending: false })
    setLists(l ?? [])
    if (l && l.length && !activeListId) setActiveListId(l[0].id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile])

  useEffect(() => {
    load()
  }, [load])

  const loadItems = useCallback(async () => {
    if (!activeListId) {
      setItems([])
      return
    }
    const { data } = await supabase
      .from('shopping_items')
      .select('*')
      .eq('list_id', activeListId)
      .order('purchased', { ascending: true })
    setItems(data ?? [])
  }, [activeListId])

  useEffect(() => {
    loadItems()
  }, [loadItems])

  const createEmptyList = async () => {
    if (!profile) return
    const { data } = await supabase
      .from('shopping_lists')
      .insert({ household_id: profile.household_id, name: `Courses du ${new Date().toLocaleDateString('fr-FR')}` })
      .select()
      .single()
    if (data) {
      setLists((prev) => [data, ...prev])
      setActiveListId(data.id)
    }
  }

  // Regroupe les ingrédients des recettes planifiées cette semaine dans une nouvelle liste
  const generateFromWeek = async () => {
    if (!profile) return
    setGenerating(true)
    const weekStart = startOfWeek(new Date())
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekEnd.getDate() + 6)

    const { data: entries } = await supabase
      .from('meal_plan_entries')
      .select('recipe_id')
      .eq('household_id', profile.household_id)
      .gte('plan_date', isoDate(weekStart))
      .lte('plan_date', isoDate(weekEnd))
      .not('recipe_id', 'is', null)

    const recipeIds = Array.from(new Set((entries ?? []).map((e) => e.recipe_id).filter(Boolean))) as string[]
    if (recipeIds.length === 0) {
      setGenerating(false)
      alert("Aucune recette planifiée cette semaine — ajoute des repas dans l'onglet Plan de repas d'abord.")
      return
    }

    const { data: ingredients } = await supabase
      .from('recipe_ingredients')
      .select('name, quantity')
      .in('recipe_id', recipeIds)

    // Fusionne les ingrédients identiques (même nom) en cumulant les quantités textuelles
    const merged: Record<string, string[]> = {}
    for (const ing of ingredients ?? []) {
      merged[ing.name] ??= []
      if (ing.quantity) merged[ing.name].push(ing.quantity)
    }

    const { data: list } = await supabase
      .from('shopping_lists')
      .insert({
        household_id: profile.household_id,
        name: `Courses semaine du ${weekStart.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`
      })
      .select()
      .single()

    if (list) {
      await supabase.from('shopping_items').insert(
        Object.entries(merged).map(([name, quantities]) => ({
          list_id: list.id,
          name,
          quantity: quantities.length ? quantities.join(' + ') : null
        }))
      )
      setLists((prev) => [list, ...prev])
      setActiveListId(list.id)
    }
    setGenerating(false)
  }

  const addManualItem = async () => {
    if (!activeListId || !newItemName) return
    const { data } = await supabase
      .from('shopping_items')
      .insert({
        list_id: activeListId,
        name: newItemName,
        estimated_cost: newItemCost ? parseFloat(newItemCost) : null
      })
      .select()
      .single()
    if (data) setItems((prev) => [...prev, data])
    setNewItemName('')
    setNewItemCost('')
  }

  const togglePurchased = async (item: ShoppingItem) => {
    const updated = { ...item, purchased: !item.purchased }
    setItems((prev) => prev.map((i) => (i.id === item.id ? updated : i)))
    await supabase.from('shopping_items').update({ purchased: updated.purchased }).eq('id', item.id)
  }

  const updateActualCost = async (item: ShoppingItem, value: string) => {
    const cost = value ? parseFloat(value) : null
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, actual_cost: cost } : i)))
    await supabase.from('shopping_items').update({ actual_cost: cost }).eq('id', item.id)
  }

  const deleteItem = async (id: string) => {
    await supabase.from('shopping_items').delete().eq('id', id)
    setItems((prev) => prev.filter((i) => i.id !== id))
  }

  const totalEstimated = items.reduce((sum, i) => sum + (i.estimated_cost ?? 0), 0)
  const totalActual = items.reduce((sum, i) => sum + (i.actual_cost ?? 0), 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <select
          className="input max-w-xs"
          value={activeListId ?? ''}
          onChange={(e) => setActiveListId(e.target.value || null)}
        >
          {lists.length === 0 && <option value="">Aucune liste</option>}
          {lists.map((l) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
        <div className="flex gap-2">
          <button onClick={generateFromWeek} disabled={generating} className="btn-ink">
            {generating ? 'Génération…' : '🔄 Générer depuis le plan de la semaine'}
          </button>
          <button onClick={createEmptyList} className="btn border border-line text-ink">
            + Liste vide
          </button>
        </div>
      </div>

      {activeListId && (
        <>
          <div className="card flex gap-2 items-end">
            <label className="text-sm flex-1">
              Article
              <input className="input mt-1" value={newItemName} onChange={(e) => setNewItemName(e.target.value)} placeholder="ex: lait" />
            </label>
            <label className="text-sm w-32">
              Coût estimé
              <input type="number" step="0.01" className="input mt-1" value={newItemCost} onChange={(e) => setNewItemCost(e.target.value)} placeholder="€" />
            </label>
            <button onClick={addManualItem} disabled={!newItemName} className="btn-ink">Ajouter</button>
          </div>

          <div className="card">
            <div className="flex justify-between text-sm text-muted mb-3">
              <span>Total estimé : <strong className="text-ink">{totalEstimated.toFixed(2)} €</strong></span>
              <span>Total réel : <strong className="text-ink">{totalActual.toFixed(2)} €</strong></span>
            </div>
            <ul className="space-y-2">
              {items.map((item) => (
                <li key={item.id} className="flex items-center gap-3 border-b border-line/50 pb-2">
                  <input type="checkbox" checked={item.purchased} onChange={() => togglePurchased(item)} className="w-4 h-4" />
                  <span className={`flex-1 text-sm ${item.purchased ? 'line-through text-muted' : ''}`}>
                    {item.name}{item.quantity ? ` — ${item.quantity}` : ''}
                  </span>
                  <span className="text-xs text-muted w-20 text-right">
                    {item.estimated_cost != null ? `~${item.estimated_cost.toFixed(2)}€` : ''}
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="réel €"
                    className="input w-20 text-xs py-1"
                    defaultValue={item.actual_cost ?? ''}
                    onBlur={(e) => updateActualCost(item, e.target.value)}
                  />
                  <button onClick={() => deleteItem(item.id)} className="text-billel text-xs">✕</button>
                </li>
              ))}
              {items.length === 0 && <p className="text-sm text-muted">Liste vide.</p>}
            </ul>
          </div>
        </>
      )}
    </div>
  )
}
