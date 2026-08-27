import { useEffect, useState, useCallback, useMemo } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

interface Transaction {
  id: string
  label: string
  amount: number
  category_id: string | null
  occurred_at: string
}

interface Category {
  id: string
  name: string
  monthly_limit_eur: number | null
}

interface Income {
  amount: number
  received_day: number
}

const PALETTE = ['#E0714B', '#A8577A', '#E8A93A', '#6B9071', '#5B8A9C', '#8A6FA8', '#C97B63', '#8A7A6E']

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

export default function Expenses() {
  const { profile } = useAuth()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [income, setIncome] = useState<Income | null>(null)
  const [label, setLabel] = useState('')
  const [amount, setAmount] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [monthCursor, setMonthCursor] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })

  // Gestion des catégories
  const [showCategoryEditor, setShowCategoryEditor] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)
  const [editingCategoryName, setEditingCategoryName] = useState('')
  const [editingCategoryLimit, setEditingCategoryLimit] = useState('')

  // Salaire du mois
  const [editingIncome, setEditingIncome] = useState(false)
  const [incomeAmountInput, setIncomeAmountInput] = useState('')
  const [incomeDayInput, setIncomeDayInput] = useState('1')

  const loadCategories = useCallback(async () => {
    if (!profile) return
    const { data } = await supabase
      .from('budget_categories')
      .select('id, name, monthly_limit_eur')
      .eq('profile_id', profile.id)
      .order('name', { ascending: true })
    setCategories(data ?? [])
  }, [profile])

  const loadTransactions = useCallback(async () => {
    if (!profile) return
    const from = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1).toISOString()
    const to = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1).toISOString()
    const { data } = await supabase
      .from('budget_transactions')
      .select('id, label, amount, category_id, occurred_at')
      .eq('profile_id', profile.id)
      .gte('occurred_at', from)
      .lt('occurred_at', to)
      .order('occurred_at', { ascending: false })
    setTransactions(data ?? [])
  }, [profile, monthCursor])

  const loadIncome = useCallback(async () => {
    if (!profile) return
    const { data } = await supabase
      .from('monthly_income')
      .select('amount, received_day')
      .eq('profile_id', profile.id)
      .eq('month', monthKey(monthCursor))
      .maybeSingle()
    setIncome(data)
  }, [profile, monthCursor])

  useEffect(() => { loadCategories() }, [loadCategories])
  useEffect(() => { loadTransactions() }, [loadTransactions])
  useEffect(() => { loadIncome() }, [loadIncome])

  useEffect(() => {
    setIncomeAmountInput(income?.amount != null ? String(income.amount) : '')
    setIncomeDayInput(income?.received_day != null ? String(income.received_day) : '1')
  }, [income])

  useEffect(() => {
    if (!categoryId && categories.length) setCategoryId(categories[0].id)
  }, [categories, categoryId])

  const addTransaction = async () => {
    if (!profile || !label || !amount) return
    const { data } = await supabase
      .from('budget_transactions')
      .insert({
        household_id: profile.household_id,
        profile_id: profile.id,
        label,
        amount: parseFloat(amount),
        category_id: categoryId || null,
        occurred_at: new Date(monthCursor.getFullYear(), monthCursor.getMonth(), new Date().getDate()).toISOString()
      })
      .select()
      .single()
    if (data) setTransactions((prev) => [data, ...prev])
    setLabel('')
    setAmount('')
  }

  const deleteTransaction = async (id: string) => {
    await supabase.from('budget_transactions').delete().eq('id', id)
    setTransactions((prev) => prev.filter((t) => t.id !== id))
  }

  const addCategory = async () => {
    if (!profile || !newCategoryName.trim()) return
    const { data } = await supabase
      .from('budget_categories')
      .insert({ profile_id: profile.id, name: newCategoryName.trim() })
      .select()
      .single()
    if (data) setCategories((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
    setNewCategoryName('')
  }

  const startEditCategory = (cat: Category) => {
    setEditingCategoryId(cat.id)
    setEditingCategoryName(cat.name)
    setEditingCategoryLimit(cat.monthly_limit_eur != null ? String(cat.monthly_limit_eur) : '')
  }

  const saveEditCategory = async () => {
    if (!editingCategoryId || !editingCategoryName.trim()) return
    const limit = editingCategoryLimit ? parseFloat(editingCategoryLimit) : null
    await supabase
      .from('budget_categories')
      .update({ name: editingCategoryName.trim(), monthly_limit_eur: limit })
      .eq('id', editingCategoryId)
    setCategories((prev) =>
      prev.map((c) => (c.id === editingCategoryId ? { ...c, name: editingCategoryName.trim(), monthly_limit_eur: limit } : c))
    )
    setEditingCategoryId(null)
  }

  const deleteCategory = async (id: string) => {
    await supabase.from('budget_categories').delete().eq('id', id)
    setCategories((prev) => prev.filter((c) => c.id !== id))
    // Les transactions liées passent automatiquement en "Sans catégorie" (on delete set null)
    setTransactions((prev) => prev.map((t) => (t.category_id === id ? { ...t, category_id: null } : t)))
  }

  const saveIncome = async () => {
    if (!profile || !incomeAmountInput) return
    const payload = {
      profile_id: profile.id,
      month: monthKey(monthCursor),
      amount: parseFloat(incomeAmountInput),
      received_day: parseInt(incomeDayInput, 10) || 1
    }
    await supabase.from('monthly_income').upsert(payload, { onConflict: 'profile_id,month' })
    setIncome({ amount: payload.amount, received_day: payload.received_day })
    setEditingIncome(false)
  }

  const categoryName = (id: string | null) => categories.find((c) => c.id === id)?.name ?? 'Sans catégorie'

  const totalSpent = transactions.reduce((s, t) => s + t.amount, 0)
  const remaining = income ? income.amount - totalSpent : null

  const byCategory = useMemo(() => {
    const grouped: Record<string, number> = {}
    for (const t of transactions) {
      const name = categoryName(t.category_id)
      grouped[name] = (grouped[name] ?? 0) + t.amount
    }
    return Object.entries(grouped)
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions, categories])

  // Le camembert représente le salaire du mois : chaque catégorie est une part, plus une part "Non dépensé"
  const pieData = useMemo(() => {
    const base = byCategory.map((c) => ({ name: c.name, value: c.total }))
    if (income && remaining != null && remaining > 0) {
      base.push({ name: 'Non dépensé', value: remaining })
    }
    return base
  }, [byCategory, income, remaining])

  const referenceForPercent = income ? income.amount : totalSpent

  const monthLabel = monthCursor.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <button
          className="text-sm underline"
          onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1))}
        >
          ← Précédent
        </button>
        <h3 className="font-display font-semibold capitalize">{monthLabel}</h3>
        <button
          className="text-sm underline"
          onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1))}
        >
          Suivant →
        </button>
      </div>

      {/* Salaire du mois + reste à vivre */}
      <div className="card">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-display font-semibold">Salaire du mois</h3>
          {!editingIncome && (
            <button onClick={() => setEditingIncome(true)} className="text-xs underline text-muted">
              {income ? 'Modifier' : 'Renseigner'}
            </button>
          )}
        </div>

        {editingIncome ? (
          <div className="flex gap-2 flex-wrap items-end">
            <label className="text-sm">
              Montant (€)
              <input type="number" step="0.01" className="input mt-1" value={incomeAmountInput} onChange={(e) => setIncomeAmountInput(e.target.value)} placeholder="ex: 2400" />
            </label>
            <label className="text-sm">
              Jour de réception
              <input type="number" min={1} max={31} className="input mt-1 w-24" value={incomeDayInput} onChange={(e) => setIncomeDayInput(e.target.value)} />
            </label>
            <button onClick={saveIncome} className="btn-ink">Valider</button>
          </div>
        ) : income ? (
          <div>
            <p className="font-display font-bold text-4xl text-billel">
              {income.amount.toFixed(0)} <span className="text-lg font-normal text-muted">€ — reçu le {income.received_day}</span>
            </p>
            <p className="text-sm text-muted mt-2">
              Reste à vivre : <span className={`font-display font-semibold ${remaining != null && remaining < 0 ? 'text-billel' : 'text-good'}`}>
                {remaining?.toFixed(2)} €
              </span>
              {' '}({totalSpent.toFixed(2)} € dépensés sur {income.amount.toFixed(0)} €)
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted">Salaire non renseigné pour ce mois.</p>
        )}
      </div>

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
                    <input
                      type="number"
                      step="0.01"
                      className="input w-28"
                      placeholder="Limite €"
                      value={editingCategoryLimit}
                      onChange={(e) => setEditingCategoryLimit(e.target.value)}
                    />
                    <button onClick={saveEditCategory} className="text-sm underline">Valider</button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm">
                      {cat.name}
                      {cat.monthly_limit_eur != null && (
                        <span className="text-muted text-xs"> — limite {cat.monthly_limit_eur}€/mois</span>
                      )}
                    </span>
                    <button onClick={() => startEditCategory(cat)} className="text-xs underline text-muted">Renommer</button>
                    <button onClick={() => deleteCategory(cat.id)} className="text-billel text-xs">Supprimer</button>
                  </>
                )}
              </div>
            ))}
            <div className="flex gap-2 pt-2">
              <input
                className="input flex-1"
                placeholder="Nouvelle catégorie"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
              />
              <button onClick={addCategory} className="btn-ink">+ Ajouter</button>
            </div>
            <p className="text-xs text-muted">Définis une limite mensuelle sur une catégorie (en la renommant) pour recevoir une alerte de dépassement.</p>
          </div>
        )}
      </div>

      <div className="card flex gap-2 flex-wrap items-end">
        <label className="text-sm flex-1 min-w-[140px]">
          Libellé
          <input className="input mt-1" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="ex: Courses Carrefour" />
        </label>
        <label className="text-sm w-28">
          Montant (€)
          <input type="number" step="0.01" className="input mt-1" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label className="text-sm w-40">
          Catégorie
          <select className="input mt-1" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            {categories.length === 0 && <option value="">Aucune — crée-en une</option>}
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <button onClick={addTransaction} disabled={!label || !amount} className="btn-ink">Ajouter</button>
      </div>

      {byCategory.length > 0 && (
        <div className="card">
          <h3 className="font-display font-semibold mb-3">Répartition — {monthLabel}</h3>
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={100} paddingAngle={2}>
                  {pieData.map((entry, i) => (
                    <Cell
                      key={entry.name}
                      fill={entry.name === 'Non dépensé' ? '#EDE0D2' : PALETTE[i % PALETTE.length]}
                    />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => `${value.toFixed(2)} €`} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="space-y-1 mt-2">
            {byCategory.map((c, i) => (
              <li key={c.name} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: PALETTE[i % PALETTE.length] }} />
                  {c.name}
                </span>
                <span className="font-mono">
                  {c.total.toFixed(2)} € · {referenceForPercent > 0 ? ((c.total / referenceForPercent) * 100).toFixed(0) : 0}%
                </span>
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted mt-3">
            Total dépensé : <strong className="text-ink">{totalSpent.toFixed(2)} €</strong>
            {income && <> — soit {((totalSpent / income.amount) * 100).toFixed(0)}% du salaire</>}
          </p>
        </div>
      )}

      <div className="card">
        <h3 className="font-display font-semibold mb-3">Transactions</h3>
        <ul className="space-y-2">
          {transactions.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-2 border-b border-line/50 pb-2 text-sm">
              <div>
                <span className="font-medium">{t.label}</span>
                <span className="text-muted"> · {categoryName(t.category_id)} · {t.occurred_at.slice(0, 10)}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono">{t.amount.toFixed(2)} €</span>
                <button onClick={() => deleteTransaction(t.id)} className="text-billel text-xs">Supprimer</button>
              </div>
            </li>
          ))}
          {transactions.length === 0 && <p className="text-sm text-muted">Aucune dépense ce mois-ci.</p>}
        </ul>
      </div>
    </div>
  )
}
