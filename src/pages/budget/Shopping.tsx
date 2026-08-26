import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

interface ScannedLine {
  name: string
  rawText: string
  price: number
  include: boolean
  matched: boolean
}

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
  linked_transaction_id: string | null
}

interface ProductAlias {
  raw_text: string
  canonical_name: string
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
// Nom par défaut : le lundi de la semaine en cours, ex "Courses du lundi 25 août"
function defaultListName(date: Date) {
  const monday = startOfWeek(date)
  return `Courses du ${monday.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}`
}

// --- Reconnaissance d'articles sans IA : normalisation + distance de Levenshtein ---

function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return dp[m][n]
}

function similarity(a: string, b: string): number {
  const na = normalizeText(a)
  const nb = normalizeText(b)
  if (!na || !nb) return 0
  return 1 - levenshtein(na, nb) / Math.max(na.length, nb.length)
}

const MATCH_THRESHOLD = 0.72

function findBestAlias(rawName: string, aliases: ProductAlias[]): { name: string; score: number } | null {
  let best: { name: string; score: number } | null = null
  for (const a of aliases) {
    const score = similarity(rawName, a.raw_text)
    if (!best || score > best.score) best = { name: a.canonical_name, score }
  }
  return best && best.score >= MATCH_THRESHOLD ? best : null
}

// Extrait les lignes "nom ... prix" d'un texte de ticket de caisse OCR
function extractPricedLines(text: string): { rawName: string; price: number }[] {
  const lines = text.split('\n')
  const priceAtEnd = /(\d{1,4}[.,]\d{2})\s*(?:€|EUR)?\s*$/
  const results: { rawName: string; price: number }[] = []
  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line || line.length < 3) continue
    const match = line.match(priceAtEnd)
    if (!match) continue
    const price = parseFloat(match[1].replace(',', '.'))
    if (!price || price <= 0 || price > 500) continue
    const rawName = line.slice(0, match.index).trim().replace(/[.\-*]+$/, '').trim()
    if (!rawName) continue
    if (/total|sous-total|tva|especes|carte|rendu|a payer/i.test(rawName)) continue
    results.push({ rawName, price })
  }
  return results
}

export default function Shopping() {
  const { profile } = useAuth()
  const [lists, setLists] = useState<ShoppingList[]>([])
  const [activeListId, setActiveListId] = useState<string | null>(null)
  const [items, setItems] = useState<ShoppingItem[]>([])
  const [newItemName, setNewItemName] = useState('')
  const [newItemCost, setNewItemCost] = useState('')
  const [generating, setGenerating] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scannedLines, setScannedLines] = useState<ScannedLine[] | null>(null)
  const receiptInputRef = useRef<HTMLInputElement>(null)
  const [editingListName, setEditingListName] = useState(false)
  const [listNameInput, setListNameInput] = useState('')

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

  const activeList = lists.find((l) => l.id === activeListId) ?? null

  const createEmptyList = async () => {
    if (!profile) return
    const { data } = await supabase
      .from('shopping_lists')
      .insert({ household_id: profile.household_id, name: defaultListName(new Date()) })
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
        name: defaultListName(new Date())
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

  const startEditListName = () => {
    if (!activeList) return
    setListNameInput(activeList.name)
    setEditingListName(true)
  }

  const saveListName = async () => {
    if (!activeListId || !listNameInput.trim()) return
    await supabase.from('shopping_lists').update({ name: listNameInput.trim() }).eq('id', activeListId)
    setLists((prev) => prev.map((l) => (l.id === activeListId ? { ...l, name: listNameInput.trim() } : l)))
    setEditingListName(false)
  }

  const deleteList = async () => {
    if (!activeListId) return
    if (!window.confirm(`Supprimer la liste "${activeList?.name}" et tous ses articles ?`)) return
    await supabase.from('shopping_lists').delete().eq('id', activeListId)
    const remaining = lists.filter((l) => l.id !== activeListId)
    setLists(remaining)
    setActiveListId(remaining.length ? remaining[0].id : null)
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

  // Trouve (ou crée) la catégorie "Courses" dans le budget privé de la personne connectée
  const ensureCoursesCategoryId = async (): Promise<string | null> => {
    if (!profile) return null
    const { data: existing } = await supabase
      .from('budget_categories')
      .select('id')
      .eq('profile_id', profile.id)
      .eq('name', 'Courses')
      .maybeSingle()
    if (existing) return existing.id
    const { data: created } = await supabase
      .from('budget_categories')
      .insert({ profile_id: profile.id, name: 'Courses' })
      .select()
      .single()
    return created?.id ?? null
  }

  const togglePurchased = async (item: ShoppingItem) => {
    if (!profile) return
    const goingToPurchased = !item.purchased

    if (goingToPurchased) {
      const cost = item.actual_cost ?? item.estimated_cost
      let linkedId: string | null = null
      if (cost != null) {
        const categoryId = await ensureCoursesCategoryId()
        const { data: tx } = await supabase
          .from('budget_transactions')
          .insert({
            household_id: profile.household_id,
            profile_id: profile.id,
            label: item.name,
            amount: cost,
            category_id: categoryId
          })
          .select()
          .single()
        linkedId = tx?.id ?? null
      }
      const updated = { ...item, purchased: true, linked_transaction_id: linkedId }
      setItems((prev) => prev.map((i) => (i.id === item.id ? updated : i)))
      await supabase.from('shopping_items').update({ purchased: true, linked_transaction_id: linkedId }).eq('id', item.id)
    } else {
      if (item.linked_transaction_id) {
        // Ne fonctionne que si c'est bien toi qui avais coché l'article — sécurité par ligne (RLS) du budget privé
        await supabase.from('budget_transactions').delete().eq('id', item.linked_transaction_id)
      }
      const updated = { ...item, purchased: false, linked_transaction_id: null }
      setItems((prev) => prev.map((i) => (i.id === item.id ? updated : i)))
      await supabase.from('shopping_items').update({ purchased: false, linked_transaction_id: null }).eq('id', item.id)
    }
  }

  const updateActualCost = async (item: ShoppingItem, value: string) => {
    const cost = value ? parseFloat(value) : null
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, actual_cost: cost } : i)))
    await supabase.from('shopping_items').update({ actual_cost: cost }).eq('id', item.id)
    if (item.purchased && item.linked_transaction_id && cost != null) {
      await supabase.from('budget_transactions').update({ amount: cost }).eq('id', item.linked_transaction_id)
    }
  }

  const deleteItem = async (id: string) => {
    await supabase.from('shopping_items').delete().eq('id', id)
    setItems((prev) => prev.filter((i) => i.id !== id))
  }

  const handleScanReceipt = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !profile) return
    setScanning(true)
    setScannedLines(null)
    try {
      const { recognize } = await import('tesseract.js')
      const { data } = await recognize(file, 'fra')
      const rawLines = extractPricedLines(data.text)

      // Charge la table d'apprentissage du foyer pour rapprocher les textes bruts de noms connus
      const { data: aliases } = await supabase
        .from('product_aliases')
        .select('raw_text, canonical_name')
        .eq('household_id', profile.household_id)

      const parsed: ScannedLine[] = rawLines.map(({ rawName, price }) => {
        const best = findBestAlias(rawName, aliases ?? [])
        return {
          name: best ? best.name : rawName,
          rawText: rawName,
          price,
          include: true,
          matched: !!best
        }
      })

      if (parsed.length === 0) {
        alert("Aucun article avec un prix n'a été reconnu sur ce reçu. Tu peux quand même les ajouter à la main.")
      }
      setScannedLines(parsed)
    } catch (err) {
      console.error(err)
      alert("La lecture du reçu a échoué. Réessaie avec une photo bien cadrée et lisible.")
    } finally {
      setScanning(false)
      if (receiptInputRef.current) receiptInputRef.current.value = ''
    }
  }

  const toggleScannedLine = (index: number) => {
    setScannedLines((prev) => prev?.map((l, i) => (i === index ? { ...l, include: !l.include } : l)) ?? null)
  }

  const updateScannedLine = (index: number, patch: Partial<ScannedLine>) => {
    setScannedLines((prev) => prev?.map((l, i) => (i === index ? { ...l, ...patch } : l)) ?? null)
  }

  const confirmScannedLines = async () => {
    if (!activeListId || !scannedLines || !profile) return
    const toAdd = scannedLines.filter((l) => l.include && l.name)
    if (toAdd.length === 0) {
      setScannedLines(null)
      return
    }
    const { data } = await supabase
      .from('shopping_items')
      .insert(
        toAdd.map((l) => ({
          list_id: activeListId,
          name: l.name,
          actual_cost: l.price,
          purchased: true
        }))
      )
      .select()

    if (data && data.length) {
      // Les articles scannés sont déjà "achetés" — on crée directement les dépenses liées dans ton budget privé
      const categoryId = await ensureCoursesCategoryId()
      const withLinks = await Promise.all(
        data.map(async (item) => {
          const { data: tx } = await supabase
            .from('budget_transactions')
            .insert({
              household_id: profile.household_id,
              profile_id: profile.id,
              label: item.name,
              amount: item.actual_cost,
              category_id: categoryId
            })
            .select()
            .single()
          if (tx) {
            await supabase.from('shopping_items').update({ linked_transaction_id: tx.id }).eq('id', item.id)
            return { ...item, linked_transaction_id: tx.id }
          }
          return item
        })
      )
      setItems((prev) => [...prev, ...withLinks])
    }

    // Mémorise (ou renforce) l'association texte brut → nom choisi, pour la prochaine fois
    await supabase.from('product_aliases').upsert(
      toAdd.map((l) => ({
        household_id: profile.household_id,
        raw_text: normalizeText(l.rawText),
        canonical_name: l.name
      })),
      { onConflict: 'household_id,raw_text' }
    )

    setScannedLines(null)
  }

  const totalEstimated = items.reduce((sum, i) => sum + (i.estimated_cost ?? 0), 0)
  const totalActual = items.reduce((sum, i) => sum + (i.actual_cost ?? 0), 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        {editingListName ? (
          <div className="flex items-center gap-2 flex-1 min-w-[200px]">
            <input
              className="input flex-1"
              value={listNameInput}
              onChange={(e) => setListNameInput(e.target.value)}
              autoFocus
            />
            <button onClick={saveListName} className="text-sm underline whitespace-nowrap">Valider</button>
          </div>
        ) : (
          <div className="flex items-center gap-2 flex-1 min-w-[200px]">
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
            {activeList && (
              <>
                <button onClick={startEditListName} className="text-xs text-muted underline whitespace-nowrap">
                  Renommer
                </button>
                <button onClick={deleteList} className="text-billel text-xs underline whitespace-nowrap">
                  Supprimer
                </button>
              </>
            )}
          </div>
        )}
        <div className="flex gap-2 flex-wrap">
          <button onClick={generateFromWeek} disabled={generating} className="btn-ink">
            {generating ? 'Génération…' : '🔄 Générer depuis le plan de la semaine'}
          </button>
          <button onClick={createEmptyList} className="btn border border-line text-ink">
            + Liste vide
          </button>
          {activeListId && (
            <button
              onClick={() => receiptInputRef.current?.click()}
              disabled={scanning}
              className="btn border border-line text-ink"
            >
              {scanning ? 'Lecture du reçu…' : '🧾 Scanner un reçu (bêta)'}
            </button>
          )}
          <input
            ref={receiptInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleScanReceipt}
            className="hidden"
          />
        </div>
      </div>

      {scannedLines && (
        <div className="card">
          <h3 className="font-display font-semibold mb-2">Articles détectés sur le reçu</h3>
          <p className="text-xs text-muted mb-3">
            Les articles avec <span className="tag-cerine">reconnu</span> ont été rapprochés d'un nom déjà connu. Vérifie et corrige au besoin — tes corrections sont mémorisées pour la prochaine fois.
          </p>
          <ul className="space-y-2">
            {scannedLines.map((line, i) => (
              <li key={i} className="flex items-center gap-2">
                <input type="checkbox" checked={line.include} onChange={() => toggleScannedLine(i)} className="w-4 h-4" />
                <input
                  className="input flex-1 text-sm"
                  value={line.name}
                  onChange={(e) => updateScannedLine(i, { name: e.target.value })}
                />
                {line.matched && <span className="tag-cerine whitespace-nowrap">reconnu</span>}
                <input
                  type="number"
                  step="0.01"
                  className="input w-24 text-sm"
                  value={line.price}
                  onChange={(e) => updateScannedLine(i, { price: parseFloat(e.target.value) || 0 })}
                />
                <span className="text-sm">€</span>
              </li>
            ))}
            {scannedLines.length === 0 && <p className="text-sm text-muted">Rien de détecté.</p>}
          </ul>
          <div className="flex gap-2 mt-3">
            <button onClick={confirmScannedLines} className="btn-ink">Ajouter à la liste</button>
            <button onClick={() => setScannedLines(null)} className="btn border border-line text-ink">Annuler</button>
          </div>
        </div>
      )}

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
            <p className="text-xs text-muted mb-3">
              Cocher un article avec un prix l'ajoute automatiquement à ton budget privé (catégorie « Courses »).
            </p>
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
