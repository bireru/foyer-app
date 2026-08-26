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
  notes: string | null
}

interface RecipeCategory {
  id: string
  name: string
}

export default function Recipes() {
  const { profile } = useAuth()
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [ingredientsByRecipe, setIngredientsByRecipe] = useState<Record<string, Ingredient[]>>({})
  const [categories, setCategories] = useState<RecipeCategory[]>([])
  const [categoriesByRecipe, setCategoriesByRecipe] = useState<Record<string, RecipeCategory[]>>({})
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [filterCategoryId, setFilterCategoryId] = useState<string>('')

  // Gestion des catégories
  const [showCategoryEditor, setShowCategoryEditor] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)
  const [editingCategoryName, setEditingCategoryName] = useState('')

  // Formulaire "nouvelle recette"
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [calories, setCalories] = useState('')
  const [protein, setProtein] = useState('')
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([])
  const [ingredientDraft, setIngredientDraft] = useState<{ name: string; quantity: string }[]>([
    { name: '', quantity: '' }
  ])

  const load = useCallback(async () => {
    if (!profile) return
    const { data: cats } = await supabase
      .from('recipe_categories')
      .select('id, name')
      .eq('household_id', profile.household_id)
      .order('name', { ascending: true })
    setCategories(cats ?? [])

    const { data: recs } = await supabase
      .from('recipes')
      .select('id, name, calories_kcal, protein_g, notes')
      .eq('household_id', profile.household_id)
      .order('name', { ascending: true })
    setRecipes(recs ?? [])

    if (recs && recs.length) {
      const { data: ings } = await supabase
        .from('recipe_ingredients')
        .select('*')
        .in('recipe_id', recs.map((r) => r.id))
      const groupedIngredients: Record<string, Ingredient[]> = {}
      for (const ing of ings ?? []) {
        groupedIngredients[ing.recipe_id] ??= []
        groupedIngredients[ing.recipe_id].push(ing)
      }
      setIngredientsByRecipe(groupedIngredients)

      const { data: links } = await supabase
        .from('recipe_category_links')
        .select('recipe_id, category_id')
        .in('recipe_id', recs.map((r) => r.id))
      const catById = new Map((cats ?? []).map((c) => [c.id, c]))
      const groupedCategories: Record<string, RecipeCategory[]> = {}
      for (const link of links ?? []) {
        const cat = catById.get(link.category_id)
        if (!cat) continue
        groupedCategories[link.recipe_id] ??= []
        groupedCategories[link.recipe_id].push(cat)
      }
      setCategoriesByRecipe(groupedCategories)
    }
  }, [profile])

  useEffect(() => {
    load()
  }, [load])

  const toggleSelectedCategory = (id: string) => {
    setSelectedCategoryIds((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]))
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
    setSelectedCategoryIds([])
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
        protein_g: protein ? parseInt(protein, 10) : null
      })
      .select()
      .single()
    if (recipe) {
      const validIngredients = ingredientDraft.filter((i) => i.name.trim())
      let insertedIngredients: Ingredient[] = []
      if (validIngredients.length) {
        const { data } = await supabase
          .from('recipe_ingredients')
          .insert(validIngredients.map((i) => ({ recipe_id: recipe.id, name: i.name, quantity: i.quantity || null })))
          .select()
        insertedIngredients = data ?? []
      }
      if (selectedCategoryIds.length) {
        await supabase
          .from('recipe_category_links')
          .insert(selectedCategoryIds.map((categoryId) => ({ recipe_id: recipe.id, category_id: categoryId })))
      }
      setRecipes((prev) => [...prev, recipe].sort((a, b) => a.name.localeCompare(b.name)))
      if (insertedIngredients.length) {
        setIngredientsByRecipe((prev) => ({ ...prev, [recipe.id]: insertedIngredients }))
      }
      setCategoriesByRecipe((prev) => ({
        ...prev,
        [recipe.id]: categories.filter((c) => selectedCategoryIds.includes(c.id))
      }))
    }
    resetForm()
  }

  const deleteRecipe = async (id: string) => {
    await supabase.from('recipes').delete().eq('id', id)
    setRecipes((prev) => prev.filter((r) => r.id !== id))
  }

  const addCategory = async () => {
    if (!profile || !newCategoryName.trim()) return
    const { data } = await supabase
      .from('recipe_categories')
      .insert({ household_id: profile.household_id, name: newCategoryName.trim() })
      .select()
      .single()
    if (data) setCategories((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
    setNewCategoryName('')
  }

  const startEditCategory = (cat: RecipeCategory) => {
    setEditingCategoryId(cat.id)
    setEditingCategoryName(cat.name)
  }

  const saveEditCategory = async () => {
    if (!editingCategoryId || !editingCategoryName.trim()) return
    await supabase.from('recipe_categories').update({ name: editingCategoryName.trim() }).eq('id', editingCategoryId)
    const updatedName = editingCategoryName.trim()
    setCategories((prev) => prev.map((c) => (c.id === editingCategoryId ? { ...c, name: updatedName } : c)))
    setCategoriesByRecipe((prev) => {
      const next: Record<string, RecipeCategory[]> = {}
      for (const [recipeId, cats] of Object.entries(prev)) {
        next[recipeId] = cats.map((c) => (c.id === editingCategoryId ? { ...c, name: updatedName } : c))
      }
      return next
    })
    setEditingCategoryId(null)
  }

  const deleteCategory = async (id: string) => {
    await supabase.from('recipe_categories').delete().eq('id', id)
    setCategories((prev) => prev.filter((c) => c.id !== id))
    setCategoriesByRecipe((prev) => {
      const next: Record<string, RecipeCategory[]> = {}
      for (const [recipeId, cats] of Object.entries(prev)) {
        next[recipeId] = cats.filter((c) => c.id !== id)
      }
      return next
    })
    if (filterCategoryId === id) setFilterCategoryId('')
  }

  const visibleRecipes = filterCategoryId
    ? recipes.filter((r) => (categoriesByRecipe[r.id] ?? []).some((c) => c.id === filterCategoryId))
    : recipes

  return (
    <div className="space-y-6">
      {/* Gestion des catégories */}
      <div className="card">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-display font-semibold">Catégories</h3>
          <button onClick={() => setShowCategoryEditor((s) => !s)} className="text-xs underline text-muted">
            {showCategoryEditor ? 'Fermer' : 'Gérer'}
          </button>
        </div>
        {showCategoryEditor && (
          <div className="space-y-2">
            {categories.map((cat) => (
              <div key={cat.id} className="flex items-center gap-2">
                {editingCategoryId === cat.id ? (
                  <>
                    <input
                      className="input flex-1"
                      value={editingCategoryName}
                      onChange={(e) => setEditingCategoryName(e.target.value)}
                      autoFocus
                    />
                    <button onClick={saveEditCategory} className="text-sm underline">Valider</button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm">{cat.name}</span>
                    <button onClick={() => startEditCategory(cat)} className="text-xs underline text-muted">Renommer</button>
                    <button onClick={() => deleteCategory(cat.id)} className="text-billel text-xs">Supprimer</button>
                  </>
                )}
              </div>
            ))}
            {categories.length === 0 && <p className="text-sm text-muted">Aucune catégorie pour l'instant.</p>}
            <div className="flex gap-2 pt-2">
              <input
                className="input flex-1"
                placeholder="Nouvelle catégorie"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
              />
              <button onClick={addCategory} className="btn-ink">+ Ajouter</button>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setFilterCategoryId('')}
            className={`btn text-xs px-3 py-1.5 ${filterCategoryId === '' ? 'bg-billel text-white' : 'border border-line text-ink'}`}
          >
            Toutes
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setFilterCategoryId(cat.id)}
              className={`btn text-xs px-3 py-1.5 ${filterCategoryId === cat.id ? 'bg-billel text-white' : 'border border-line text-ink'}`}
            >
              {cat.name}
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
            <p className="text-sm mb-1">Catégories</p>
            <div className="flex gap-2 flex-wrap">
              {categories.length === 0 && (
                <p className="text-xs text-muted italic">Crée une catégorie ci-dessus pour pouvoir en choisir ici.</p>
              )}
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => toggleSelectedCategory(cat.id)}
                  className={selectedCategoryIds.includes(cat.id) ? 'tag-billel' : 'tag-billel opacity-40'}
                >
                  {cat.name}
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
              {(categoriesByRecipe[r.id] ?? []).length > 0 && (
                <div className="flex gap-1 flex-wrap mt-2">
                  {(categoriesByRecipe[r.id] ?? []).map((c) => <span key={c.id} className="tag-cerine">{c.name}</span>)}
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
