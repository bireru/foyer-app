import { useEffect, useMemo, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

interface LogRow {
  id: string
  profile_id: string
  logged_at: string
  set_number: number | null
  reps_done: number | null
  weight_kg: number | null
  duration_seconds: number | null
  exerciseName: string
}

const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

function dayKey(iso: string) {
  return iso.slice(0, 10)
}

export default function Calendar() {
  const { profile, householdMembers } = useAuth()
  const [monthCursor, setMonthCursor] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const [logs, setLogs] = useState<LogRow[]>([])
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!profile) return
    const rangeStart = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1).toISOString()
    const rangeEnd = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1).toISOString()
    const { data } = await supabase
      .from('workout_sets')
      .select('id, profile_id, logged_at, set_number, reps_done, weight_kg, duration_seconds, program_exercises(name)')
      .eq('household_id', profile.household_id)
      .gte('logged_at', rangeStart)
      .lt('logged_at', rangeEnd)
      .order('logged_at', { ascending: false })
    setLogs(
      (data ?? []).map((row: any) => ({
        id: row.id,
        profile_id: row.profile_id,
        logged_at: row.logged_at,
        set_number: row.set_number,
        reps_done: row.reps_done,
        weight_kg: row.weight_kg,
        duration_seconds: row.duration_seconds,
        exerciseName: row.program_exercises?.name ?? 'Exercice'
      }))
    )
  }, [profile, monthCursor])

  useEffect(() => {
    load()
  }, [load])

  const memberName = (profileId: string) =>
    householdMembers.find((h) => h.id === profileId)?.display_name ?? '?'
  const memberColorHex = (profileId: string) =>
    householdMembers.find((h) => h.id === profileId)?.color_tag === 'cerine' ? '#A8577A' : '#E0714B'

  const logsByDay = useMemo(() => {
    const map: Record<string, LogRow[]> = {}
    for (const l of logs) {
      const k = dayKey(l.logged_at)
      map[k] ??= []
      map[k].push(l)
    }
    return map
  }, [logs])

  // Grille du mois : jours vides avant le 1er (lundi = premier jour de semaine)
  const year = monthCursor.getFullYear()
  const month = monthCursor.getMonth()
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]

  const monthLabel = monthCursor.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
  const todayKey = dayKey(new Date().toISOString())
  const selectedLogs = selectedDay ? logsByDay[selectedDay] ?? [] : []

  return (
    <div className="space-y-6">
      <div className="card max-w-lg">
        <div className="flex items-center justify-between mb-4">
          <button className="text-sm underline" onClick={() => setMonthCursor(new Date(year, month - 1, 1))}>← Précédent</button>
          <h3 className="font-display font-semibold capitalize">{monthLabel}</h3>
          <button className="text-sm underline" onClick={() => setMonthCursor(new Date(year, month + 1, 1))}>Suivant →</button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted mb-1">
          {WEEKDAYS.map((w, i) => <span key={i}>{w}</span>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((day, i) => {
            if (day === null) return <div key={i} />
            const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
            const dayLogs = logsByDay[key] ?? []
            const isToday = key === todayKey
            const isSelected = key === selectedDay
            const uniqueProfiles = Array.from(new Set(dayLogs.map((l) => l.profile_id)))
            return (
              <button
                key={i}
                onClick={() => setSelectedDay(dayLogs.length ? key : null)}
                className={`aspect-square rounded-card text-sm flex flex-col items-center justify-center gap-0.5 border ${
                  isSelected ? 'border-ink' : 'border-transparent'
                } ${isToday ? 'font-semibold' : ''} ${dayLogs.length ? 'hover:border-ink' : ''}`}
              >
                <span>{day}</span>
                {dayLogs.length > 0 && (
                  <span className="flex gap-0.5">
                    {uniqueProfiles.slice(0, 3).map((pid) => (
                      <span key={pid} className="block w-1.5 h-1.5 rounded-full" style={{ backgroundColor: memberColorHex(pid) }} />
                    ))}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {selectedDay && selectedLogs.length > 0 && (
        <div className="card">
          <h3 className="font-display font-semibold mb-3">
            {new Date(selectedDay + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
          </h3>
          <table className="w-full text-sm font-mono">
            <thead>
              <tr className="text-left text-muted border-b border-line">
                <th className="py-1 pr-3">Heure</th>
                <th className="py-1 pr-3">Qui</th>
                <th className="py-1 pr-3">Exercice</th>
                <th className="py-1 pr-3">Détail</th>
              </tr>
            </thead>
            <tbody>
              {selectedLogs.map((l) => {
                const time = new Date(l.logged_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
                return (
                  <tr key={l.id} className="border-b border-line/50">
                    <td className="py-1 pr-3">{time}</td>
                    <td className="py-1 pr-3" style={{ color: memberColorHex(l.profile_id) }}>{memberName(l.profile_id)}</td>
                    <td className="py-1 pr-3 font-display">{l.exerciseName}</td>
                    <td className="py-1 pr-3">
                      {l.duration_seconds != null
                        ? `${Math.round(l.duration_seconds / 60)} min`
                        : `${l.set_number ?? '—'} séries × ${l.reps_done ?? '—'} reps${l.weight_kg ? ` @ ${l.weight_kg}kg` : ''}`}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {selectedDay === null && logs.length === 0 && (
        <p className="text-sm text-muted">Aucune entrée ce mois-ci.</p>
      )}
    </div>
  )
}
