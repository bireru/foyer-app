import { useEffect, useState, useCallback, useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

interface Account {
  id: string
  name: string
  account_type: string | null
}

interface Snapshot {
  id: string
  account_id: string
  recorded_at: string
  value: number
}

const TYPE_OPTIONS = ['Livret', 'Compte courant', 'Assurance vie', 'Actions / ETF', 'Crypto', 'Immobilier', 'Autre']

export default function Savings() {
  const { profile } = useAuth()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [newAccountName, setNewAccountName] = useState('')
  const [newAccountType, setNewAccountType] = useState(TYPE_OPTIONS[0])
  const [valueInputs, setValueInputs] = useState<Record<string, string>>({})
  const [expandedAccountId, setExpandedAccountId] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!profile) return
    const { data: accs } = await supabase
      .from('savings_accounts')
      .select('id, name, account_type')
      .eq('profile_id', profile.id)
      .order('created_at', { ascending: true })
    setAccounts(accs ?? [])
    if (accs && accs.length) {
      const { data: snaps } = await supabase
        .from('savings_snapshots')
        .select('*')
        .in('account_id', accs.map((a) => a.id))
        .order('recorded_at', { ascending: true })
      setSnapshots(snaps ?? [])
    } else {
      setSnapshots([])
    }
  }, [profile])

  useEffect(() => { load() }, [load])

  const addAccount = async () => {
    if (!profile || !newAccountName.trim()) return
    const { data } = await supabase
      .from('savings_accounts')
      .insert({ profile_id: profile.id, name: newAccountName.trim(), account_type: newAccountType })
      .select()
      .single()
    if (data) setAccounts((prev) => [...prev, data])
    setNewAccountName('')
  }

  const deleteAccount = async (id: string) => {
    await supabase.from('savings_accounts').delete().eq('id', id)
    setAccounts((prev) => prev.filter((a) => a.id !== id))
    setSnapshots((prev) => prev.filter((s) => s.account_id !== id))
  }

  const addSnapshot = async (accountId: string) => {
    const raw = valueInputs[accountId]
    if (!raw) return
    const { data } = await supabase
      .from('savings_snapshots')
      .insert({ account_id: accountId, value: parseFloat(raw) })
      .select()
      .single()
    if (data) setSnapshots((prev) => [...prev, data])
    setValueInputs((prev) => ({ ...prev, [accountId]: '' }))
  }

  const deleteSnapshot = async (id: string) => {
    await supabase.from('savings_snapshots').delete().eq('id', id)
    setSnapshots((prev) => prev.filter((s) => s.id !== id))
  }

  const latestValueFor = (accountId: string) => {
    const own = snapshots.filter((s) => s.account_id === accountId)
    return own.length ? own[own.length - 1].value : 0
  }

  const totalNetWorth = accounts.reduce((sum, a) => sum + latestValueFor(a.id), 0)

  // Reconstitue le patrimoine total à chaque date où au moins un compte a été mis à jour,
  // en reportant la dernière valeur connue pour les comptes non modifiés ce jour-là (façon courbe Finary)
  const evolutionData = useMemo(() => {
    if (snapshots.length === 0) return []
    const allDates = Array.from(new Set(snapshots.map((s) => s.recorded_at))).sort()
    const lastKnown: Record<string, number> = {}
    return allDates.map((date) => {
      for (const s of snapshots.filter((s) => s.recorded_at === date)) {
        lastKnown[s.account_id] = s.value
      }
      const total = accounts.reduce((sum, a) => sum + (lastKnown[a.id] ?? 0), 0)
      return { date, total }
    })
  }, [snapshots, accounts])

  return (
    <div className="space-y-6">
      <div className="card">
        <p className="text-xs uppercase tracking-wide text-muted mb-1">Patrimoine total</p>
        <p className="font-display font-bold text-5xl text-good">
          {totalNetWorth.toLocaleString('fr-FR')} <span className="text-2xl font-normal text-muted">€</span>
        </p>
      </div>

      {evolutionData.length > 1 && (
        <div className="card">
          <h3 className="font-display font-semibold mb-3">Évolution</h3>
          <div style={{ width: '100%', height: 250 }}>
            <ResponsiveContainer>
              <LineChart data={evolutionData}>
                <CartesianGrid stroke="#EDE0D2" strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} domain={['dataMin - 500', 'dataMax + 500']} />
                <Tooltip formatter={(value: number) => `${value.toLocaleString('fr-FR')} €`} />
                <Line type="monotone" dataKey="total" stroke="#6B9071" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="card flex gap-2 flex-wrap items-end">
        <label className="text-sm flex-1 min-w-[140px]">
          Nom du compte
          <input className="input mt-1" value={newAccountName} onChange={(e) => setNewAccountName(e.target.value)} placeholder="ex: Livret A" />
        </label>
        <label className="text-sm w-44">
          Type
          <select className="input mt-1" value={newAccountType} onChange={(e) => setNewAccountType(e.target.value)}>
            {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <button onClick={addAccount} disabled={!newAccountName.trim()} className="btn-ink">+ Compte</button>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {accounts.map((acc) => {
          const history = snapshots.filter((s) => s.account_id === acc.id).slice().reverse()
          return (
            <div key={acc.id} className="card">
              <div className="flex items-center justify-between mb-1">
                <div>
                  <h3 className="font-display font-semibold">{acc.name}</h3>
                  <span className="text-xs text-muted">{acc.account_type}</span>
                </div>
                <button onClick={() => deleteAccount(acc.id)} className="text-billel text-xs">Supprimer</button>
              </div>
              <p className="font-display font-bold text-2xl mt-2">{latestValueFor(acc.id).toLocaleString('fr-FR')} €</p>

              <div className="flex gap-2 mt-3">
                <input
                  type="number"
                  step="0.01"
                  className="input flex-1 text-sm"
                  placeholder="Nouvelle valeur"
                  value={valueInputs[acc.id] ?? ''}
                  onChange={(e) => setValueInputs((prev) => ({ ...prev, [acc.id]: e.target.value }))}
                />
                <button onClick={() => addSnapshot(acc.id)} className="btn-ink text-sm px-3">Mettre à jour</button>
              </div>

              {history.length > 0 && (
                <button
                  onClick={() => setExpandedAccountId(expandedAccountId === acc.id ? null : acc.id)}
                  className="text-xs underline mt-2"
                >
                  {expandedAccountId === acc.id ? 'Masquer l\u2019historique' : 'Voir l\u2019historique'}
                </button>
              )}
              {expandedAccountId === acc.id && (
                <ul className="text-xs mt-2 space-y-1">
                  {history.map((s) => (
                    <li key={s.id} className="flex justify-between text-muted">
                      <span>{s.recorded_at} — {s.value.toLocaleString('fr-FR')} €</span>
                      <button onClick={() => deleteSnapshot(s.id)} className="text-billel">✕</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </div>

      {accounts.length === 0 && <p className="text-sm text-muted">Aucun compte suivi pour l'instant.</p>}
    </div>
  )
}
