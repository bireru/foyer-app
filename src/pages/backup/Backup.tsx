import { useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

// Tables du foyer (partagées — visibles par les deux) : filtrées par household_id
const HOUSEHOLD_TABLES = [
  'weight_logs', 'vital_signs', 'progress_photos', 'exercise_programs',
  'workout_sessions', 'recipes', 'meal_plan_entries', 'food_log',
  'shopping_lists', 'shared_expenses'
] as const

// Tables privées : filtrées par profile_id — n'exportent QUE les données de la personne connectée
const PRIVATE_TABLES = ['budget_transactions', 'budget_categories', 'monthly_income', 'savings_accounts'] as const

// Tables "enfants" liées à une table ci-dessus par une clé étrangère
const CHILD_TABLES: { table: string; parentTable: string; parentIdColumn: string }[] = [
  { table: 'program_exercises', parentTable: 'exercise_programs', parentIdColumn: 'program_id' },
  { table: 'workout_sets', parentTable: 'workout_sessions', parentIdColumn: 'session_id' },
  { table: 'recipe_ingredients', parentTable: 'recipes', parentIdColumn: 'recipe_id' },
  { table: 'shopping_items', parentTable: 'shopping_lists', parentIdColumn: 'list_id' },
  { table: 'savings_snapshots', parentTable: 'savings_accounts', parentIdColumn: 'account_id' }
]

// Ordre d'import : les tables parentes doivent exister avant leurs enfants (contraintes de clé étrangère)
const IMPORT_ORDER = [
  'budget_categories', 'exercise_programs', 'program_exercises', 'workout_sessions', 'workout_sets',
  'recipes', 'recipe_ingredients', 'meal_plan_entries', 'weight_logs', 'vital_signs', 'progress_photos',
  'food_log', 'shopping_lists', 'shopping_items', 'shared_expenses', 'budget_transactions',
  'monthly_income', 'savings_accounts', 'savings_snapshots'
]

function csvEscape(value: string) {
  return `"${value.replace(/"/g, '""')}"`
}

// Parse une ligne CSV avec des champs entre guillemets (le JSON peut contenir virgules et guillemets,
// mais jamais de vrais retours à la ligne bruts puisque JSON.stringify les échappe déjà en \n)
function parseCsvLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') { current += '"'; i++ }
      else if (char === '"') { inQuotes = false }
      else { current += char }
    } else {
      if (char === '"') inQuotes = true
      else if (char === ',') { fields.push(current); current = '' }
      else current += char
    }
  }
  fields.push(current)
  return fields
}

export default function Backup() {
  const { profile } = useAuth()
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importSummary, setImportSummary] = useState<string | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleExport = async () => {
    if (!profile) return
    setExporting(true)
    const rows: { table: string; id: string; data: Record<string, unknown> }[] = []
    const parentIdsByTable: Record<string, string[]> = {}

    for (const table of HOUSEHOLD_TABLES) {
      const { data } = await supabase.from(table).select('*').eq('household_id', profile.household_id)
      parentIdsByTable[table] = (data ?? []).map((r) => r.id)
      for (const r of data ?? []) rows.push({ table, id: r.id, data: r })
    }

    for (const table of PRIVATE_TABLES) {
      const { data } = await supabase.from(table).select('*').eq('profile_id', profile.id)
      parentIdsByTable[table] = (data ?? []).map((r) => r.id)
      for (const r of data ?? []) rows.push({ table, id: r.id, data: r })
    }

    for (const child of CHILD_TABLES) {
      const parentIds = parentIdsByTable[child.parentTable] ?? []
      if (parentIds.length === 0) continue
      const { data } = await supabase.from(child.table).select('*').in(child.parentIdColumn, parentIds)
      for (const r of data ?? []) rows.push({ table: child.table, id: r.id, data: r })
    }

    const lines = ['table,id,data']
    for (const row of rows) {
      lines.push([row.table, row.id, csvEscape(JSON.stringify(row.data))].join(','))
    }
    const csv = lines.join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `foyer-export-${profile.display_name}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    setExporting(false)
  }

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !profile) return
    setImporting(true)
    setImportSummary(null)
    setImportError(null)
    try {
      const text = await file.text()
      const lines = text.split('\n').filter((l) => l.trim().length > 0)
      const dataLines = lines[0]?.startsWith('table,id,data') ? lines.slice(1) : lines

      const byTable: Record<string, Record<string, unknown>[]> = {}
      for (const line of dataLines) {
        const [table, , jsonField] = parseCsvLine(line)
        if (!table || !jsonField) continue
        try {
          const parsed = JSON.parse(jsonField)
          byTable[table] ??= []
          byTable[table].push(parsed)
        } catch {
          // ligne corrompue, ignorée
        }
      }

      let totalImported = 0
      for (const table of IMPORT_ORDER) {
        const records = byTable[table]
        if (!records || records.length === 0) continue
        const { error } = await supabase.from(table).upsert(records, { onConflict: 'id' })
        if (error) throw new Error(`Table ${table} : ${error.message}`)
        totalImported += records.length
      }
      setImportSummary(`${totalImported} lignes importées avec succès.`)
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Échec de l'import.")
    } finally {
      setImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold mb-1">💾 Sauvegarde</h2>
      <p className="text-sm text-muted mb-4">
        Exporte toutes les données auxquelles tu as accès (les volets partagés + tes propres données privées comme le Budget) dans un seul fichier CSV, réimportable tel quel.
      </p>

      <div className="card">
        <h3 className="font-display font-semibold mb-2">Exporter</h3>
        <p className="text-sm text-muted mb-3">
          Contient : Sport, Nourriture, Budget commun, et ton Budget/Épargne privés. Les données privées de {' '}
          {profile?.display_name === 'Billel' ? 'Cérine' : 'Billel'} ne sont pas incluses — elle/il doit exporter depuis son propre compte.
        </p>
        <button onClick={handleExport} disabled={exporting} className="btn-ink">
          {exporting ? 'Export en cours…' : '⬇️ Exporter en CSV'}
        </button>
      </div>

      <div className="card">
        <h3 className="font-display font-semibold mb-2">Importer</h3>
        <p className="text-sm text-muted mb-3">
          Réimporte un fichier généré par le bouton ci-dessus. Les lignes existantes (même id) sont mises à jour, les nouvelles sont créées — aucun doublon.
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={handleImportFile}
          disabled={importing}
          className="text-sm"
        />
        {importing && <p className="text-sm text-muted mt-2">Import en cours…</p>}
        {importSummary && <p className="text-sm text-good mt-2">{importSummary}</p>}
        {importError && <p className="text-sm text-billel mt-2">{importError}</p>}
      </div>
    </div>
  )
}
