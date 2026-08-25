import { useEffect, useMemo, useState, useCallback } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

interface SessionMeta {
  profile_id: string
  started_at: string
}

interface SetJoinRow {
  session_id: string
  reps_done: number | null
  weight_kg: number | null
  program_exercises: { name: string } | null
}

interface CombinedPoint {
  profileId: string
  date: string
  exerciseName: string
  weight: number
  reps: number | null
}

const COLOR_BY_TAG: Record<string, string> = { billel: '#E0714B', cerine: '#A8577A' }

export default function Progress() {
  const { profile, householdMembers } = useAuth()
  const [points, setPoints] = useState<CombinedPoint[]>([])
  const [selectedExercise, setSelectedExercise] = useState('')

  const load = useCallback(async () => {
    if (!profile) return
    const { data: sessionRows } = await supabase
      .from('workout_sessions')
      .select('id, profile_id, started_at')
      .eq('household_id', profile.household_id)
    if (!sessionRows || sessionRows.length === 0) {
      setPoints([])
      return
    }
    const sessionMeta: Record<string, SessionMeta> = {}
    for (const s of sessionRows) sessionMeta[s.id] = { profile_id: s.profile_id, started_at: s.started_at }

    const { data: setRows } = await supabase
      .from('workout_sets')
      .select('session_id, reps_done, weight_kg, program_exercises(name)')
      .in('session_id', sessionRows.map((s) => s.id))

    const combined: CombinedPoint[] = []
    for (const row of (setRows as unknown as SetJoinRow[]) ?? []) {
      const meta = sessionMeta[row.session_id]
      const exerciseName = row.program_exercises?.name
      if (!meta || !exerciseName || row.weight_kg == null) continue
      combined.push({
        profileId: meta.profile_id,
        date: meta.started_at.slice(0, 10),
        exerciseName,
        weight: row.weight_kg,
        reps: row.reps_done
      })
    }
    setPoints(combined)
  }, [profile])

  useEffect(() => {
    load()
  }, [load])

  const exerciseNames = useMemo(
    () => Array.from(new Set(points.map((p) => p.exerciseName))).sort((a, b) => a.localeCompare(b)),
    [points]
  )

  useEffect(() => {
    if (!selectedExercise && exerciseNames.length) setSelectedExercise(exerciseNames[0])
  }, [exerciseNames, selectedExercise])

  const memberName = (profileId: string) =>
    householdMembers.find((h) => h.id === profileId)?.display_name ?? '?'

  const filtered = points.filter((p) => p.exerciseName === selectedExercise)

  // Un point par séance : le poids max soulevé ce jour-là, par personne
  const chartData = useMemo(() => {
    const byDate: Record<string, Record<string, number | string>> = {}
    for (const p of filtered) {
      byDate[p.date] ??= { date: p.date }
      const name = memberName(p.profileId)
      const current = byDate[p.date][name]
      if (typeof current !== 'number' || p.weight > current) byDate[p.date][name] = p.weight
    }
    return Object.values(byDate).sort((a, b) => String(a.date).localeCompare(String(b.date)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, householdMembers])

  // Record personnel : poids max jamais soulevé sur cet exercice, par personne
  const records = useMemo(() => {
    const best: Record<string, { weight: number; reps: number | null; date: string }> = {}
    for (const p of filtered) {
      const current = best[p.profileId]
      if (!current || p.weight > current.weight) {
        best[p.profileId] = { weight: p.weight, reps: p.reps, date: p.date }
      }
    }
    return best
  }, [filtered])

  return (
    <div className="space-y-6">
      {exerciseNames.length === 0 ? (
        <p className="text-sm text-muted">
          Aucune série avec un poids enregistré pour l'instant — fais une séance dans le Minuteur pour voir apparaître ta progression ici.
        </p>
      ) : (
        <>
          <div className="card max-w-sm">
            <label className="text-sm">
              Exercice
              <select
                className="input mt-1"
                value={selectedExercise}
                onChange={(e) => setSelectedExercise(e.target.value)}
              >
                {exerciseNames.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            {householdMembers.map((m) => {
              const record = records[m.id]
              const color = COLOR_BY_TAG[m.color_tag]
              return (
                <div key={m.id} className="card">
                  <div className="flex items-center justify-between mb-2">
                    <span className={m.color_tag === 'cerine' ? 'tag-cerine' : 'tag-billel'}>{m.display_name}</span>
                    <span className="text-xs text-muted">Record — {selectedExercise}</span>
                  </div>
                  {record ? (
                    <div>
                      <p className="font-display font-bold text-5xl" style={{ color }}>
                        {record.weight} <span className="text-2xl font-normal text-muted">kg</span>
                      </p>
                      <p className="text-sm text-muted mt-1">
                        {record.reps != null ? `${record.reps} reps · ` : ''}
                        le {new Date(record.date + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted">Pas encore de série enregistrée sur cet exercice.</p>
                  )}
                </div>
              )
            })}
          </div>

          <div className="card">
            <h3 className="font-display font-semibold mb-3">Évolution du poids soulevé — {selectedExercise}</h3>
            <div style={{ width: '100%', height: 300 }}>
              <ResponsiveContainer>
                <LineChart data={chartData}>
                  <CartesianGrid stroke="#EDE0D2" strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} domain={['dataMin - 2', 'dataMax + 2']} />
                  <Tooltip />
                  <Legend />
                  {householdMembers.map((m) => (
                    <Line
                      key={m.id}
                      type="monotone"
                      dataKey={m.display_name}
                      stroke={COLOR_BY_TAG[m.color_tag]}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
