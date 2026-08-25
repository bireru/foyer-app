import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

interface Program {
  id: string
  profile_id: string
  name: string
  goal: string | null
  active: boolean
}

interface Exercise {
  id: string
  program_id: string
  order_index: number
  name: string
  target_sets: number
  target_reps: number
  target_weight_kg: number | null
  rest_seconds: number
}

export default function Programs() {
  const { profile, householdMembers } = useAuth()
  const [viewingId, setViewingId] = useState<string | undefined>(profile?.id)
  const [programs, setPrograms] = useState<Program[]>([])
  const [exercisesByProgram, setExercisesByProgram] = useState<Record<string, Exercise[]>>({})
  const [newProgramName, setNewProgramName] = useState('')

  useEffect(() => setViewingId(profile?.id), [profile])

  const load = useCallback(async () => {
    if (!profile) return
    const { data: progs } = await supabase
      .from('exercise_programs')
      .select('id, profile_id, name, goal, active')
      .eq('household_id', profile.household_id)
    setPrograms(progs ?? [])
    if (progs && progs.length) {
      const { data: exs } = await supabase
        .from('program_exercises')
        .select('*')
        .in('program_id', progs.map((p) => p.id))
        .order('order_index', { ascending: true })
      const grouped: Record<string, Exercise[]> = {}
      for (const ex of exs ?? []) {
        grouped[ex.program_id] ??= []
        grouped[ex.program_id].push(ex)
      }
      setExercisesByProgram(grouped)
    }
  }, [profile])

  useEffect(() => {
    load()
  }, [load])

  const addProgram = async () => {
    if (!profile || !viewingId || !newProgramName) return
    await supabase.from('exercise_programs').insert({
      household_id: profile.household_id,
      profile_id: viewingId,
      name: newProgramName
    })
    setNewProgramName('')
    load()
  }

  const addExercise = async (programId: string) => {
    const existing = exercisesByProgram[programId] ?? []
    await supabase.from('program_exercises').insert({
      program_id: programId,
      order_index: existing.length,
      name: 'Nouvel exercice',
      target_sets: 3,
      target_reps: 10,
      rest_seconds: 90
    })
    load()
  }

  const updateExercise = async (ex: Exercise, patch: Partial<Exercise>) => {
    setExercisesByProgram((prev) => ({
      ...prev,
      [ex.program_id]: prev[ex.program_id].map((e) => (e.id === ex.id ? { ...e, ...patch } : e))
    }))
    await supabase.from('program_exercises').update(patch).eq('id', ex.id)
  }

  const removeExercise = async (ex: Exercise) => {
    await supabase.from('program_exercises').delete().eq('id', ex.id)
    load()
  }

  const canEdit = viewingId === profile?.id

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        {householdMembers.map((m) => (
          <button
            key={m.id}
            onClick={() => setViewingId(m.id)}
            className={`btn ${
              viewingId === m.id
                ? m.color_tag === 'cerine'
                  ? 'bg-cerine text-white'
                  : 'bg-billel text-white'
                : 'border border-line text-ink hover:bg-paper'
            }`}
          >
            Programme de {m.display_name}
          </button>
        ))}
      </div>

      {!canEdit && (
        <p className="text-sm text-muted italic">
          Tu consultes le programme de {householdMembers.find((m) => m.id === viewingId)?.display_name} — lecture seule.
        </p>
      )}

      {canEdit && (
        <div className="card flex gap-2">
          <input
            className="input"
            placeholder="Nom du nouveau programme (ex: Push/Pull/Legs)"
            value={newProgramName}
            onChange={(e) => setNewProgramName(e.target.value)}
          />
          <button onClick={addProgram} className="btn-ink whitespace-nowrap">+ Programme</button>
        </div>
      )}

      {programs
        .filter((p) => p.profile_id === viewingId)
        .map((program) => (
          <div key={program.id} className="card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display font-semibold">{program.name}</h3>
              {canEdit && (
                <button onClick={() => addExercise(program.id)} className="text-sm text-ink underline">
                  + Exercice
                </button>
              )}
            </div>
            <div className="space-y-2">
              {(exercisesByProgram[program.id] ?? []).map((ex) => (
                <div key={ex.id} className="grid grid-cols-2 sm:grid-cols-6 gap-2 items-center border-b border-line/50 pb-2">
                  {canEdit ? (
                    <>
                      <input
                        className="input col-span-2"
                        value={ex.name}
                        onChange={(e) => updateExercise(ex, { name: e.target.value })}
                      />
                      <input
                        type="number"
                        className="input"
                        value={ex.target_sets}
                        onChange={(e) => updateExercise(ex, { target_sets: parseInt(e.target.value, 10) })}
                        title="Séries"
                      />
                      <input
                        type="number"
                        className="input"
                        value={ex.target_reps}
                        onChange={(e) => updateExercise(ex, { target_reps: parseInt(e.target.value, 10) })}
                        title="Répétitions"
                      />
                      <input
                        type="number"
                        step="0.5"
                        className="input"
                        value={ex.target_weight_kg ?? ''}
                        placeholder="kg"
                        onChange={(e) =>
                          updateExercise(ex, {
                            target_weight_kg: e.target.value ? parseFloat(e.target.value) : null
                          })
                        }
                      />
                      <button onClick={() => removeExercise(ex)} className="text-billel text-sm">
                        Suppr.
                      </button>
                    </>
                  ) : (
                    <div className="col-span-6 font-mono text-sm">
                      {ex.name} — {ex.target_sets}×{ex.target_reps}
                      {ex.target_weight_kg ? ` @ ${ex.target_weight_kg}kg` : ''}
                    </div>
                  )}
                </div>
              ))}
              {(exercisesByProgram[program.id] ?? []).length === 0 && (
                <p className="text-sm text-muted">Aucun exercice pour l'instant.</p>
              )}
            </div>
          </div>
        ))}

      {programs.filter((p) => p.profile_id === viewingId).length === 0 && (
        <p className="text-sm text-muted">Aucun programme pour l'instant.</p>
      )}
    </div>
  )
}
