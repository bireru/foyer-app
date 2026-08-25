import { useEffect, useMemo, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

interface SessionRow {
  id: string
  profile_id: string
  started_at: string
  ended_at: string | null
}

interface SetJoinRow {
  session_id: string
  reps_done: number | null
  weight_kg: number | null
  duration_seconds: number | null
  program_exercises: { name: string } | null
}

interface ExerciseSummary {
  name: string
  sets: number
  totalReps: number
  totalDurationSeconds: number
  avgWeight: number | null
}

interface SessionSummary {
  session: SessionRow
  exercises: ExerciseSummary[]
}

const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

function dayKey(iso: string) {
  return iso.slice(0, 10) // YYYY-MM-DD, en heure locale du navigateur via toISOString serait décalé -> on garde la date telle qu'enregistrée
}

export default function Calendar() {
  const { profile, householdMembers } = useAuth()
  const [monthCursor, setMonthCursor] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [sets, setSets] = useState<SetJoinRow[]>([])
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!profile) return
    const rangeStart = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1).toISOString()
    const rangeEnd = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1).toISOString()
    const { data: sessionRows } = await supabase
      .from('workout_sessions')
      .select('id, profile_id, started_at, ended_at')
      .eq('household_id', profile.household_id)
      .gte('started_at', rangeStart)
      .lt('started_at', rangeEnd)
      .order('started_at', { ascending: false })
    setSessions(sessionRows ?? [])

    if (sessionRows && sessionRows.length) {
      const { data: setRows } = await supabase
        .from('workout_sets')
        .select('session_id, reps_done, weight_kg, duration_seconds, program_exercises(name)')
        .in('session_id', sessionRows.map((s) => s.id))
      setSets((setRows as unknown as SetJoinRow[]) ?? [])
    } else {
      setSets([])
    }
  }, [profile, monthCursor])

  useEffect(() => {
    load()
  }, [load])

  const memberName = (profileId: string) =>
    householdMembers.find((h) => h.id === profileId)?.display_name ?? '?'
  const memberColorHex = (profileId: string) =>
    householdMembers.find((h) => h.id === profileId)?.color_tag === 'cerine' ? '#A8577A' : '#E0714B'

  // Regroupe les séries par séance puis par exercice pour obtenir le résumé final
  const summaries: Record<string, SessionSummary> = useMemo(() => {
    const bySession: Record<string, SessionSummary> = {}
    for (const s of sessions) {
      bySession[s.id] = { session: s, exercises: [] }
    }
    const grouping: Record<string, Record<string, { sets: number; totalReps: number; totalDuration: number; weights: number[] }>> = {}
    for (const row of sets) {
      const exName = row.program_exercises?.name ?? 'Exercice'
      grouping[row.session_id] ??= {}
      grouping[row.session_id][exName] ??= { sets: 0, totalReps: 0, totalDuration: 0, weights: [] }
      const g = grouping[row.session_id][exName]
      g.sets += 1
      g.totalReps += row.reps_done ?? 0
      g.totalDuration += row.duration_seconds ?? 0
      if (row.weight_kg !== null) g.weights.push(row.weight_kg)
    }
    for (const sessionId of Object.keys(grouping)) {
      if (!bySession[sessionId]) continue
      bySession[sessionId].exercises = Object.entries(grouping[sessionId]).map(([name, g]) => ({
        name,
        sets: g.sets,
        totalReps: g.totalReps,
        totalDurationSeconds: g.totalDuration,
        avgWeight: g.weights.length ? g.weights.reduce((a, b) => a + b, 0) / g.weights.length : null
      }))
    }
    return bySession
  }, [sessions, sets])

  const sessionsByDay = useMemo(() => {
    const map: Record<string, SessionRow[]> = {}
    for (const s of sessions) {
      const k = dayKey(s.started_at)
      map[k] ??= []
      map[k].push(s)
    }
    return map
  }, [sessions])

  const fmt = (totalSeconds: number) => {
    const m = Math.floor(totalSeconds / 60)
    const s = totalSeconds % 60
    return `${m}min ${String(s).padStart(2, '0')}s`
  }

  // Grille du mois : jours vides avant le 1er (lundi = premier jour de semaine)
  const year = monthCursor.getFullYear()
  const month = monthCursor.getMonth()
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7 // 0 = lundi
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]

  const monthLabel = monthCursor.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
  const todayKey = dayKey(new Date().toISOString())

  const selectedSessions = selectedDay ? sessionsByDay[selectedDay] ?? [] : []

  return (
    <div className="space-y-6">
      <div className="card max-w-lg">
        <div className="flex items-center justify-between mb-4">
          <button
            className="text-sm underline"
            onClick={() => setMonthCursor(new Date(year, month - 1, 1))}
          >
            ← Précédent
          </button>
          <h3 className="font-display font-semibold capitalize">{monthLabel}</h3>
          <button
            className="text-sm underline"
            onClick={() => setMonthCursor(new Date(year, month + 1, 1))}
          >
            Suivant →
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted mb-1">
          {WEEKDAYS.map((w, i) => <span key={i}>{w}</span>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((day, i) => {
            if (day === null) return <div key={i} />
            const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
            const daySessions = sessionsByDay[key] ?? []
            const isToday = key === todayKey
            const isSelected = key === selectedDay
            return (
              <button
                key={i}
                onClick={() => setSelectedDay(daySessions.length ? key : null)}
                className={`aspect-square rounded-card text-sm flex flex-col items-center justify-center gap-0.5 border ${
                  isSelected ? 'border-ink' : 'border-transparent'
                } ${isToday ? 'font-semibold' : ''} ${daySessions.length ? 'hover:border-ink' : ''}`}
              >
                <span>{day}</span>
                {daySessions.length > 0 && (
                  <span className="flex gap-0.5">
                    {daySessions.slice(0, 3).map((s) => (
                      <span
                        key={s.id}
                        className="block w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: memberColorHex(s.profile_id) }}
                      />
                    ))}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {selectedDay && selectedSessions.length > 0 && (
        <div className="space-y-4">
          <h3 className="font-display font-semibold">
            Séances du {new Date(selectedDay + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
          </h3>
          {selectedSessions.map((s) => {
            const summary = summaries[s.id]
            const startTime = new Date(s.started_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
            return (
              <div key={s.id} className="card">
                <div className="flex items-center justify-between mb-3">
                  <span className={householdMembers.find((m) => m.id === s.profile_id)?.color_tag === 'cerine' ? 'tag-cerine' : 'tag-billel'}>
                    {memberName(s.profile_id)}
                  </span>
                  <span className="text-sm text-muted font-mono">{startTime}</span>
                </div>
                {summary && summary.exercises.length > 0 ? (
                  <table className="w-full text-sm font-mono">
                    <thead>
                      <tr className="text-left text-muted border-b border-line">
                        <th className="py-1 pr-3">Exercice</th>
                        <th className="py-1 pr-3">Séries</th>
                        <th className="py-1 pr-3">Reps totales</th>
                        <th className="py-1 pr-3">Temps total</th>
                        <th className="py-1 pr-3">Poids moyen</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.exercises.map((ex) => (
                        <tr key={ex.name} className="border-b border-line/50">
                          <td className="py-1 pr-3 font-display">{ex.name}</td>
                          <td className="py-1 pr-3">{ex.sets}</td>
                          <td className="py-1 pr-3">{ex.totalReps}</td>
                          <td className="py-1 pr-3">{fmt(ex.totalDurationSeconds)}</td>
                          <td className="py-1 pr-3">{ex.avgWeight !== null ? `${ex.avgWeight.toFixed(1)} kg` : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-sm text-muted">Aucune série enregistrée pour cette séance.</p>
                )}
              </div>
            )
          })}
        </div>
      )}

      {selectedDay === null && sessions.length === 0 && (
        <p className="text-sm text-muted">Aucune séance enregistrée ce mois-ci.</p>
      )}
    </div>
  )
}
