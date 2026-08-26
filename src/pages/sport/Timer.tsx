import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

interface Program {
  id: string
  name: string
}

interface Exercise {
  id: string
  name: string
  target_sets: number
  target_reps: number
  target_weight_kg: number | null
  rest_seconds: number
}

interface LoggedSet {
  id: string
  exerciseName: string
  setNumber: number
  reps: number | null
  weight: number | null
  durationSeconds: number | null
}

export default function Timer() {
  const { profile } = useAuth()
  const [programs, setPrograms] = useState<Program[]>([])
  const [selectedProgramId, setSelectedProgramId] = useState('')
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [exerciseIndex, setExerciseIndex] = useState(0)
  const [setNumber, setSetNumber] = useState(1)
  const [reps, setReps] = useState('')
  const [weight, setWeight] = useState('')
  const [loggedSets, setLoggedSets] = useState<LoggedSet[]>([])
  const [saving, setSaving] = useState(false)
  const [, forceTick] = useState(0)

  // Horodatages plutôt que des compteurs qui se décrémentent — plus fiable, pas d'effets fragiles
  const sessionStartRef = useRef<number>(0)
  const restEndAtRef = useRef<number | null>(null)
  const setStartRef = useRef<number>(Date.now())

  useEffect(() => {
    if (!profile) return
    supabase
      .from('exercise_programs')
      .select('id, name')
      .eq('household_id', profile.household_id)
      .eq('profile_id', profile.id)
      .then(({ data }) => setPrograms(data ?? []))
  }, [profile])

  // Une seule horloge : fait avancer l'affichage chaque seconde et détecte la fin du repos
  useEffect(() => {
    if (!sessionId) return
    const id = window.setInterval(() => {
      if (restEndAtRef.current !== null && Date.now() >= restEndAtRef.current) {
        restEndAtRef.current = null
        setStartRef.current = Date.now()
      }
      forceTick((t) => t + 1)
    }, 1000)
    return () => window.clearInterval(id)
  }, [sessionId])

  const startSession = async () => {
    if (!profile || !selectedProgramId) return
    const { data: exs } = await supabase
      .from('program_exercises')
      .select('*')
      .eq('program_id', selectedProgramId)
      .order('order_index', { ascending: true })
    setExercises(exs ?? [])
    const { data: session } = await supabase
      .from('workout_sessions')
      .insert({ household_id: profile.household_id, profile_id: profile.id, program_id: selectedProgramId })
      .select()
      .single()
    if (session) {
      setSessionId(session.id)
      setExerciseIndex(0)
      setSetNumber(1)
      setLoggedSets([])
      sessionStartRef.current = Date.now()
      restEndAtRef.current = null
      setStartRef.current = Date.now()
    }
  }

  const currentExercise = exercises[exerciseIndex]
  const isCardio = currentExercise ? currentExercise.target_sets <= 0 : false
  const restLeft = restEndAtRef.current !== null ? Math.max(0, Math.ceil((restEndAtRef.current - Date.now()) / 1000)) : 0
  const elapsed = sessionId ? Math.max(0, Math.floor((Date.now() - sessionStartRef.current) / 1000)) : 0

  const skipRest = () => {
    restEndAtRef.current = null
    setStartRef.current = Date.now()
    forceTick((t) => t + 1)
  }

  const logSet = async () => {
    if (!sessionId || !currentExercise || saving) return
    setSaving(true)
    try {
      const durationSeconds = Math.max(0, Math.round((Date.now() - setStartRef.current) / 1000))
      const repsDone = reps ? parseInt(reps, 10) : null
      const weightKg = weight ? parseFloat(weight) : null
      const { data: inserted, error } = await supabase
        .from('workout_sets')
        .insert({
          session_id: sessionId,
          program_exercise_id: currentExercise.id,
          set_number: setNumber,
          reps_done: repsDone,
          weight_kg: weightKg,
          duration_seconds: durationSeconds,
          completed_at: new Date().toISOString()
        })
        .select()
        .single()
      if (error) throw error
      if (inserted) {
        setLoggedSets((prev) => [
          {
            id: inserted.id,
            exerciseName: currentExercise.name,
            setNumber,
            reps: repsDone,
            weight: weightKg,
            durationSeconds
          },
          ...prev
        ])
      }
      setReps('')
      setWeight('')

      const targetSets = Math.max(currentExercise.target_sets, 1) // 0 = cardio, une seule "série" suffit à valider
      if (setNumber < targetSets) {
        setSetNumber(setNumber + 1)
        restEndAtRef.current = Date.now() + currentExercise.rest_seconds * 1000
      } else if (exerciseIndex < exercises.length - 1) {
        setExerciseIndex(exerciseIndex + 1)
        setSetNumber(1)
        restEndAtRef.current = Date.now() + currentExercise.rest_seconds * 1000
      } else {
        await endSession()
      }
    } catch (err) {
      console.error(err)
      alert("L'enregistrement de la série a échoué (connexion ?). Réessaie.")
    } finally {
      setSaving(false)
    }
  }

  const endSession = async () => {
    if (!sessionId) return
    try {
      await supabase.from('workout_sessions').update({ ended_at: new Date().toISOString() }).eq('id', sessionId)
    } catch (err) {
      console.error(err)
      // Même en cas d'échec réseau, on ne laisse jamais l'interface bloquée
    } finally {
      setSessionId(null)
      setExercises([])
      restEndAtRef.current = null
    }
  }

  const deleteLoggedSet = async (id: string) => {
    await supabase.from('workout_sets').delete().eq('id', id)
    setLoggedSets((prev) => prev.filter((s) => s.id !== id))
  }

  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  if (!sessionId) {
    return (
      <div className="card max-w-md space-y-3">
        <h3 className="font-display font-semibold">Démarrer une séance</h3>
        <select className="input" value={selectedProgramId} onChange={(e) => setSelectedProgramId(e.target.value)}>
          <option value="">Choisir un programme…</option>
          {programs.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <button onClick={startSession} disabled={!selectedProgramId} className="btn-ink w-full">
          Démarrer
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-md space-y-4">
      <div className="flex justify-between items-baseline">
        <span className="font-mono text-sm text-muted">Séance en cours</span>
        <span className="font-mono text-2xl">{fmt(elapsed)}</span>
      </div>

      {currentExercise ? (
        <div className="card space-y-3">
          <h3 className="font-display font-semibold text-lg">{currentExercise.name}</h3>
          <p className="text-sm text-muted">
            {isCardio
              ? 'Exercice cardio — pas de séries à compter'
              : <>Série {setNumber} / {currentExercise.target_sets} — objectif {currentExercise.target_reps} reps
                {currentExercise.target_weight_kg ? ` @ ${currentExercise.target_weight_kg}kg` : ''}</>}
          </p>

          {restLeft > 0 ? (
            <div className="text-center py-6">
              <p className="text-sm text-muted mb-1">Repos</p>
              <p className="font-mono text-4xl text-billel">{fmt(restLeft)}</p>
              <button onClick={skipRest} className="text-sm underline mt-2">Passer le repos</button>
            </div>
          ) : (
            <>
              {!isCardio && (
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-sm">
                    Répétitions faites
                    <input type="number" className="input mt-1" value={reps} onChange={(e) => setReps(e.target.value)} />
                  </label>
                  <label className="text-sm">
                    Poids (kg)
                    <input type="number" step="0.5" className="input mt-1" value={weight} onChange={(e) => setWeight(e.target.value)} />
                  </label>
                </div>
              )}
              <button onClick={logSet} disabled={saving} className="btn-ink w-full">
                {saving ? 'Enregistrement…' : isCardio ? 'Terminer cet exercice →' : 'Valider la série'}
              </button>
            </>
          )}
        </div>
      ) : (
        <p>Séance terminée.</p>
      )}

      <button onClick={endSession} className="text-sm text-muted underline">
        Terminer la séance maintenant
      </button>

      {loggedSets.length > 0 && (
        <div className="card">
          <h3 className="font-display font-semibold mb-3">Séries enregistrées</h3>
          <ul className="space-y-2">
            {loggedSets.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 border-b border-line/50 pb-2 text-sm">
                <div className="font-mono">
                  <span className="font-display">{s.exerciseName}</span> — série {s.setNumber} ·{' '}
                  {s.reps ?? '—'} reps{s.weight ? ` @ ${s.weight}kg` : ''} ·{' '}
                  {s.durationSeconds !== null ? fmt(s.durationSeconds) : '—'}
                </div>
                <button
                  onClick={() => deleteLoggedSet(s.id)}
                  className="text-billel text-xs whitespace-nowrap"
                  aria-label={`Supprimer la série ${s.setNumber} de ${s.exerciseName}`}
                >
                  Supprimer
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
