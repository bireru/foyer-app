import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

interface Ingredient {
  id: string
  recipe_id: string
  name: string
  quantity: string | null
}

interface Recipe {
  id: string
  name: string
  calories_kcal: number | null
  protein_g: number | null
  tags: string[]
  notes: string | null
}

const TAG_OPTIONS = ['léger', 'riche en protéines', 'batch cooking', 'rapide', 'végé']

export default function Recipes() {
  const { profile } = useAuth()
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [ingredientsByRecipe, setIngredientsByRecipe] = useState<Record<string, Ingredient[]>>({})
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [filterTag, setFilterTag] = useState<string>('')

  // Formulaire "nouvelle recette"
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [calories, setCalories] = useState('')
  const [protein, setProtein] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [ingredientDraft, setIngredientDraft] = useState<{ name: string; quantity: string }[]>([
    { name: '', quantity: '' }
  ])

  const load = useCallback(async () => {
    if (!profile) return
    const { data: recs } = await supabase
      .from('recipes')
      .select('id, name, calories_kcal, protein_g, tags, notes')
      .eq('household_id', profile.household_id)
      .order('name', { ascending: true })
    setRecipes(recs ?? [])
    if (recs && recs.length) {
      const { data: ings } = await supabase
        .from('recipe_ingredients')
        .select('*')
        .in('recipe_id', recs.map((r) => r.id))
      const grouped: Record<string, Ingredient[]> = {}
      for (const ing of ings ?? []) {
        grouped[ing.recipe_id] ??= []
        grouped[ing.recipe_id].push(ing)
      }
      setIngredientsByRecipe(grouped)
    }
  }, [profile])

  useEffect(() => {
    load()
  }, [load])

  const toggleTag = (tag: string) => {
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]))
  }

  const addIngredientRow = () => setIngredientDraft((prev) => [...prev, { name: '', quantity: '' }])

  const updateIngredientRow = (index: number, patch: Partial<{ name: string; quantity: string }>) => {
    setIngredientDraft((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  const removeIngredientRow = (index: number) => {
    setIngredientDraft((prev) => prev.filter((_, i) => i !== index))
  }

  const resetForm = () => {
    setName('')
    setCalories('')
    setProtein('')
    setTags([])
    setIngredientDraft([{ name: '', quantity: '' }])
    setShowForm(false)
  }

  const saveRecipe = async () => {
    if (!profile || !name) return
    const { data: recipe } = await supabase
      .from('recipes')
      .insert({
        household_id: profile.household_id,
        name,
        calories_kcal: calories ? parseInt(calories, 10) : null,
        protein_g: protein ? parseInt(protein, 10) : null,
        tags
      })
      .select()
      .single()
    if (recipe) {
      const validIngredients = ingredientDraft.filter((i) => i.name.trim())
      if (validIngredients.length) {
        await supabase.from('recipe_ingredients').insert(
          validIngredients.map((i) => ({ recipe_id: recipe.id, name: i.name, quantity: i.quantity || null }))
        )
      }
    }
    resetForm()
    load()
  }

  const deleteRecipe = async (id: string) => {
    await supabase.from('recipes').delete().eq('id', id)
    setRecipes((prev) => prev.filter((r) => r.id !== id))
  }

  const visibleRecipes = filterTag ? recipes.filter((r) => r.tags.includes(filterTag)) : recipes

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setFilterTag('')}
            className={`btn text-xs px-3 py-1.5 ${filterTag === '' ? 'bg-billel text-white' : 'border border-line text-ink'}`}
          >
            Toutes
          </button>
          {TAG_OPTIONS.map((tag) => (
            <button
              key={tag}
              onClick={() => setFilterTag(tag)}
              className={`btn text-xs px-3 py-1.5 ${filterTag === tag ? 'bg-billel text-white' : 'border border-line text-ink'}`}
            >
              {tag}
            </button>
          ))}
        </div>
        <button onClick={() => setShowForm((s) => !s)} className="btn-ink">
          {showForm ? 'Annuler' : '+ Nouvelle recette'}
        </button>
      </div>

      {showForm && (
        <div className="card space-y-3">
          <input className="input" placeholder="Nom de la recette" value={name} onChange={(e) => setName(e.target.value)} />
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="text-sm">
              Calories (kcal)
              <input type="number" className="input mt-1" value={calories} onChange={(e) => setCalories(e.target.value)} placeholder="ex: 550" />
            </label>
            <label className="text-sm">
              Protéines (g)
              <input type="number" className="input mt-1" value={protein} onChange={(e) => setProtein(e.target.value)} placeholder="ex: 35" />
            </label>
          </div>
          <div>
            <p className="text-sm mb-1">Tags</p>
            <div className="flex gap-2 flex-wrap">
              {TAG_OPTIONS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  className={tags.includes(tag) ? 'tag-billel' : 'tag-billel opacity-40'}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-sm mb-1">Ingrédients</p>
            <div className="space-y-2">
              {ingredientDraft.map((row, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    className="input flex-1"
                    placeholder="Ingrédient (ex: poulet)"
                    value={row.name}
                    onChange={(e) => updateIngredientRow(i, { name: e.target.value })}
                  />
                  <input
                    className="input w-32"
                    placeholder="Quantité"
                    value={row.quantity}
                    onChange={(e) => updateIngredientRow(i, { quantity: e.target.value })}
                  />
                  <button onClick={() => removeIngredientRow(i)} className="text-billel text-sm px-2">✕</button>
                </div>
              ))}
            </div>
            <button onClick={addIngredientRow} className="text-sm underline mt-2">+ Ingrédient</button>
          </div>
          <button onClick={saveRecipe} disabled={!name} className="btn-ink">Enregistrer la recette</button>
        </div>
      )}

      {visibleRecipes.length === 0 ? (
        <p className="text-sm text-muted">Aucune recette pour l'instant.</p>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {visibleRecipes.map((r) => (
            <div key={r.id} className="card">
              <div className="flex items-center justify-between">
                <h3 className="font-display font-semibold">{r.name}</h3>
                <button onClick={() => deleteRecipe(r.id)} className="text-billel text-xs">Supprimer</button>
              </div>
              <div className="flex gap-3 text-sm text-muted mt-1">
                {r.calories_kcal != null && <span>{r.calories_kcal} kcal</span>}
                {r.protein_g != null && <span>{r.protein_g} g protéines</span>}
              </div>
              {r.tags.length > 0 && (
                <div className="flex gap-1 flex-wrap mt-2">
                  {r.tags.map((t) => <span key={t} className="tag-cerine">{t}</span>)}
                </div>
              )}
              <button
                onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                className="text-sm underline mt-2"
              >
                {expandedId === r.id ? 'Masquer les ingrédients' : 'Voir les ingrédients'}
              </button>
              {expandedId === r.id && (
                <ul className="text-sm mt-2 space-y-1">
                  {(ingredientsByRecipe[r.id] ?? []).map((ing) => (
                    <li key={ing.id} className="text-muted">
                      {ing.name}{ing.quantity ? ` — ${ing.quantity}` : ''}
                    </li>
                  ))}
                  {(ingredientsByRecipe[r.id] ?? []).length === 0 && (
                    <li className="text-muted italic">Pas d'ingrédients renseignés.</li>
                  )}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
