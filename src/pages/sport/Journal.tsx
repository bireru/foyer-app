import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

interface Program {
  id: string
  name: string
}

interface Exercise {
  id: string
  name: string
  is_cardio: boolean
}

interface LogEntry {
  id: string
  logged_at: string
  set_number: number | null
  reps_done: number | null
  weight_kg: number | null
  duration_seconds: number | null
  exerciseName: string
}

export default function Journal() {
  const { profile } = useAuth()
  const [programs, setPrograms] = useState<Program[]>([])
  const [selectedProgramId, setSelectedProgramId] = useState('')
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [selectedExerciseId, setSelectedExerciseId] = useState('')
  const [sets, setSets] = useState('')
  const [reps, setReps] = useState('')
  const [weight, setWeight] = useState('')
  const [durationMin, setDurationMin] = useState('')
  const [saving, setSaving] = useState(false)
  const [entries, setEntries] = useState<LogEntry[]>([])

  const loadPrograms = useCallback(async () => {
    if (!profile) return
    const { data } = await supabase
      .from('exercise_programs')
      .select('id, name')
      .eq('household_id', profile.household_id)
      .eq('profile_id', profile.id)
      .order('name', { ascending: true })
    setPrograms(data ?? [])
  }, [profile])

  const loadRecentEntries = useCallback(async () => {
    if (!profile) return
    const { data } = await supabase
      .from('workout_sets')
      .select('id, logged_at, set_number, reps_done, weight_kg, duration_seconds, program_exercises(name)')
      .eq('profile_id', profile.id)
      .order('logged_at', { ascending: false })
      .limit(30)
    setEntries(
      (data ?? []).map((row: any) => ({
        id: row.id,
        logged_at: row.logged_at,
        set_number: row.set_number,
        reps_done: row.reps_done,
        weight_kg: row.weight_kg,
        duration_seconds: row.duration_seconds,
        exerciseName: row.program_exercises?.name ?? 'Exercice'
      }))
    )
  }, [profile])

  useEffect(() => {
    loadPrograms()
    loadRecentEntries()
  }, [loadPrograms, loadRecentEntries])

  useEffect(() => {
    if (!selectedProgramId) {
      setExercises([])
      setSelectedExerciseId('')
      return
    }
    supabase
      .from('program_exercises')
      .select('id, name, is_cardio')
      .eq('program_id', selectedProgramId)
      .order('order_index', { ascending: true })
      .then(({ data }) => {
        setExercises(data ?? [])
        setSelectedExerciseId('')
      })
  }, [selectedProgramId])

  const selectedExercise = exercises.find((e) => e.id === selectedExerciseId)

  const resetForm = () => {
    setSets('')
    setReps('')
    setWeight('')
    setDurationMin('')
  }

  const save = async () => {
    if (!profile || !selectedExercise) return
    setSaving(true)
    const { data } = await supabase
      .from('workout_sets')
      .insert({
        profile_id: profile.id,
        household_id: profile.household_id,
        program_exercise_id: selectedExercise.id,
        set_number: selectedExercise.is_cardio ? null : sets ? parseInt(sets, 10) : null,
        reps_done: selectedExercise.is_cardio ? null : reps ? parseInt(reps, 10) : null,
        weight_kg: selectedExercise.is_cardio ? null : weight ? parseFloat(weight) : null,
        duration_seconds: selectedExercise.is_cardio ? (durationMin ? parseInt(durationMin, 10) * 60 : null) : null
      })
      .select()
      .single()
    if (data) {
      setEntries((prev) => [
        {
          id: data.id,
          logged_at: data.logged_at,
          set_number: data.set_number,
          reps_done: data.reps_done,
          weight_kg: data.weight_kg,
          duration_seconds: data.duration_seconds,
          exerciseName: selectedExercise.name
        },
        ...prev
      ])
    }
    resetForm()
    setSaving(false)
  }

  const deleteEntry = async (id: string) => {
    await supabase.from('workout_sets').delete().eq('id', id)
    setEntries((prev) => prev.filter((e) => e.id !== id))
  }

  return (
    <div className="space-y-6 max-w-lg">
      <div className="card space-y-3">
        <h3 className="font-display font-semibold">Noter un exercice effectué</h3>
        <label className="text-sm block">
          Programme
          <select className="input mt-1" value={selectedProgramId} onChange={(e) => setSelectedProgramId(e.target.value)}>
            <option value="">Choisir un programme…</option>
            {programs.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>

        {exercises.length > 0 && (
          <label className="text-sm block">
            Exercice
            <select className="input mt-1" value={selectedExerciseId} onChange={(e) => setSelectedExerciseId(e.target.value)}>
              <option value="">Choisir un exercice…</option>
              {exercises.map((ex) => (
                <option key={ex.id} value={ex.id}>{ex.name}{ex.is_cardio ? ' (cardio)' : ''}</option>
              ))}
            </select>
          </label>
        )}

        {selectedExercise && (
          <>
            {selectedExercise.is_cardio ? (
              <label className="text-sm block">
                Durée (minutes)
                <input type="number" min={0} className="input mt-1" value={durationMin} onChange={(e) => setDurationMin(e.target.value)} placeholder="ex: 20" />
              </label>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                <label className="text-sm">
                  Séries
                  <input type="number" className="input mt-1" value={sets} onChange={(e) => setSets(e.target.value)} placeholder="ex: 4" />
                </label>
                <label className="text-sm">
                  Répétitions
                  <input type="number" className="input mt-1" value={reps} onChange={(e) => setReps(e.target.value)} placeholder="ex: 12" />
                </label>
                <label className="text-sm">
                  Poids (kg)
                  <input type="number" step="0.5" className="input mt-1" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="ex: 20" />
                </label>
              </div>
            )}
            <button onClick={save} disabled={saving} className="btn-ink w-full">
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </>
        )}
      </div>

      <div className="card">
        <h3 className="font-display font-semibold mb-3">Journal récent</h3>
        <ul className="space-y-2">
          {entries.map((entry) => {
            const d = new Date(entry.logged_at)
            return (
              <li key={entry.id} className="flex items-center justify-between gap-2 border-b border-line/50 pb-2 text-sm">
                <div className="font-mono">
                  <span className="text-muted">
                    {d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} · {d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  {' — '}
                  <span className="font-display">{entry.exerciseName}</span>
                  {entry.duration_seconds != null ? (
                    <> · {Math.round(entry.duration_seconds / 60)} min</>
                  ) : (
                    <>
                      {entry.set_number != null && <> · {entry.set_number} séries</>}
                      {entry.reps_done != null && <> · {entry.reps_done} reps</>}
                      {entry.weight_kg != null && <> · {entry.weight_kg}kg</>}
                    </>
                  )}
                </div>
                <button onClick={() => deleteEntry(entry.id)} className="text-billel text-xs whitespace-nowrap">
                  Supprimer
                </button>
              </li>
            )
          })}
          {entries.length === 0 && <p className="text-sm text-muted">Rien enregistré pour l'instant.</p>}
        </ul>
      </div>
    </div>
  )
}
