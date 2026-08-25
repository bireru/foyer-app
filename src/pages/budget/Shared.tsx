import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

interface SharedExpense {
  id: string
  paid_by: string
  label: string
  amount: number
  occurred_at: string
  notes: string | null
}

const COLOR_BY_TAG: Record<string, string> = { billel: '#E0714B', cerine: '#A8577A' }

export default function Shared() {
  const { profile, householdMembers } = useAuth()
  const [expenses, setExpenses] = useState<SharedExpense[]>([])
  const [label, setLabel] = useState('')
  const [amount, setAmount] = useState('')
  const [paidBy, setPaidBy] = useState('')

  useEffect(() => {
    if (profile && !paidBy) setPaidBy(profile.id)
  }, [profile, paidBy])

  const load = useCallback(async () => {
    if (!profile) return
    const { data } = await supabase
      .from('shared_expenses')
      .select('*')
      .eq('household_id', profile.household_id)
      .order('occurred_at', { ascending: false })
    setExpenses(data ?? [])
  }, [profile])

  useEffect(() => {
    load()
  }, [load])

  const addExpense = async () => {
    if (!profile || !label || !amount || !paidBy) return
    const { data } = await supabase
      .from('shared_expenses')
      .insert({
        household_id: profile.household_id,
        paid_by: paidBy,
        label,
        amount: parseFloat(amount)
      })
      .select()
      .single()
    if (data) setExpenses((prev) => [data, ...prev])
    setLabel('')
    setAmount('')
  }

  const deleteExpense = async (id: string) => {
    await supabase.from('shared_expenses').delete().eq('id', id)
    setExpenses((prev) => prev.filter((e) => e.id !== id))
  }

  const memberName = (id: string) => householdMembers.find((m) => m.id === id)?.display_name ?? '?'
  const memberColor = (id: string) => COLOR_BY_TAG[householdMembers.find((m) => m.id === id)?.color_tag ?? 'billel']

  // Calcul façon Tricount : chacun devrait avoir payé la moitié du total.
  // La différence entre ce qu'il a réellement payé et cette moitié donne la balance.
  const total = expenses.reduce((s, e) => s + e.amount, 0)
  const fairShare = total / 2
  const balances = householdMembers.map((m) => {
    const paid = expenses.filter((e) => e.paid_by === m.id).reduce((s, e) => s + e.amount, 0)
    return { member: m, paid, balance: paid - fairShare }
  })
  const creditor = balances.find((b) => b.balance > 0.01)
  const debtor = balances.find((b) => b.balance < -0.01)
  const settleAmount = creditor ? creditor.balance : 0

  return (
    <div className="space-y-6">
      <div className="card">
        <h3 className="font-display font-semibold mb-3">Balance</h3>
        {expenses.length === 0 ? (
          <p className="text-sm text-muted">Aucune dépense commune pour l'instant.</p>
        ) : creditor && debtor ? (
          <p className="text-lg">
            <span style={{ color: memberColor(debtor.member.id) }} className="font-display font-semibold">
              {debtor.member.display_name}
            </span>{' '}
            doit{' '}
            <span className="font-display font-bold text-2xl" style={{ color: memberColor(creditor.member.id) }}>
              {settleAmount.toFixed(2)} €
            </span>{' '}
            à{' '}
            <span style={{ color: memberColor(creditor.member.id) }} className="font-display font-semibold">
              {creditor.member.display_name}
            </span>
          </p>
        ) : (
          <p className="text-good font-display font-semibold">Vous êtes à égalité 🎉</p>
        )}
        <div className="flex gap-4 mt-4 text-sm text-muted">
          {balances.map((b) => (
            <span key={b.member.id}>
              <span style={{ color: memberColor(b.member.id) }} className="font-medium">{b.member.display_name}</span> a payé {b.paid.toFixed(2)} €
            </span>
          ))}
        </div>
      </div>

      <div className="card flex gap-2 flex-wrap items-end">
        <label className="text-sm flex-1 min-w-[140px]">
          Libellé
          <input className="input mt-1" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="ex: Restaurant vendredi" />
        </label>
        <label className="text-sm w-28">
          Montant (€)
          <input type="number" step="0.01" className="input mt-1" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label className="text-sm w-40">
          Payé par
          <select className="input mt-1" value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>
            {householdMembers.map((m) => <option key={m.id} value={m.id}>{m.display_name}</option>)}
          </select>
        </label>
        <button onClick={addExpense} disabled={!label || !amount} className="btn-ink">Ajouter</button>
      </div>

      <div className="card">
        <h3 className="font-display font-semibold mb-3">Dépenses communes</h3>
        <ul className="space-y-2">
          {expenses.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-2 border-b border-line/50 pb-2 text-sm">
              <div>
                <span className="font-medium">{e.label}</span>
                <span className="text-muted"> · payé par </span>
                <span style={{ color: memberColor(e.paid_by) }}>{memberName(e.paid_by)}</span>
                <span className="text-muted"> · {e.occurred_at.slice(0, 10)}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono">{e.amount.toFixed(2)} €</span>
                <button onClick={() => deleteExpense(e.id)} className="text-billel text-xs">Supprimer</button>
              </div>
            </li>
          ))}
          {expenses.length === 0 && <p className="text-sm text-muted">Rien pour l'instant.</p>}
        </ul>
      </div>
    </div>
  )
}
