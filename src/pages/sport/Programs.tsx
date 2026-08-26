import { useEffect, useState, useCallback, useRef } from 'react'
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
  const [editingProgramId, setEditingProgramId] = useState<string | null>(null)
  const [editingProgramName, setEditingProgramName] = useState('')
  // Garde la dernière version connue de chaque exercice pour ne persister qu'au blur, pas à chaque frappe
  const exerciseRef = useRef<Record<string, Exercise>>({})

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
        exerciseRef.current[ex.id] = ex
      }
      setExercisesByProgram(grouped)
    }
  }, [profile])

  useEffect(() => {
    load()
  }, [load])

  const addProgram = async () => {
    if (!profile || !viewingId || !newProgramName) return
    const { data } = await supabase
      .from('exercise_programs')
      .insert({ household_id: profile.household_id, profile_id: viewingId, name: newProgramName })
      .select()
      .single()
    if (data) setPrograms((prev) => [...prev, data])
    setNewProgramName('')
  }

  const addExercise = async (programId: string) => {
    const existing = exercisesByProgram[programId] ?? []
    const { data } = await supabase
      .from('program_exercises')
      .insert({
        program_id: programId,
        order_index: existing.length,
        name: 'Nouvel exercice',
        target_sets: 3,
        target_reps: 10,
        rest_seconds: 90
      })
      .select()
      .single()
    if (data) {
      exerciseRef.current[data.id] = data
      setExercisesByProgram((prev) => ({ ...prev, [programId]: [...(prev[programId] ?? []), data] }))
    }
  }

  // Met à jour uniquement l'état local — aucune requête réseau tant qu'on ne quitte pas le champ
  const updateExerciseLocal = (ex: Exercise, patch: Partial<Exercise>) => {
    const updated = { ...ex, ...patch }
    exerciseRef.current[ex.id] = updated
    setExercisesByProgram((prev) => ({
      ...prev,
      [ex.program_id]: prev[ex.program_id].map((e) => (e.id === ex.id ? updated : e))
    }))
  }

  // Envoyé à Supabase seulement quand le champ perd le focus (une requête par édition, pas par lettre)
  const persistExercise = async (exId: string) => {
    const ex = exerciseRef.current[exId]
    if (!ex) return
    await supabase
      .from('program_exercises')
      .update({
        name: ex.name,
        target_sets: ex.target_sets,
        target_reps: ex.target_reps,
        target_weight_kg: ex.target_weight_kg
      })
      .eq('id', ex.id)
  }

  const removeExercise = async (ex: Exercise) => {
    await supabase.from('program_exercises').delete().eq('id', ex.id)
    delete exerciseRef.current[ex.id]
    setExercisesByProgram((prev) => ({
      ...prev,
      [ex.program_id]: prev[ex.program_id].filter((e) => e.id !== ex.id)
    }))
  }

  const startEditProgram = (program: Program) => {
    setEditingProgramId(program.id)
    setEditingProgramName(program.name)
  }

  const saveEditProgram = async () => {
    if (!editingProgramId || !editingProgramName.trim()) return
    await supabase.from('exercise_programs').update({ name: editingProgramName.trim() }).eq('id', editingProgramId)
    setPrograms((prev) => prev.map((p) => (p.id === editingProgramId ? { ...p, name: editingProgramName.trim() } : p)))
    setEditingProgramId(null)
  }

  const deleteProgram = async (programId: string) => {
    if (!window.confirm('Supprimer ce programme et tous ses exercices ?')) return
    await supabase.from('exercise_programs').delete().eq('id', programId)
    setPrograms((prev) => prev.filter((p) => p.id !== programId))
    setExercisesByProgram((prev) => {
      const next = { ...prev }
      delete next[programId]
      return next
    })
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
              {canEdit && editingProgramId === program.id ? (
                <div className="flex items-center gap-2 flex-1">
                  <input
                    className="input flex-1"
                    value={editingProgramName}
                    onChange={(e) => setEditingProgramName(e.target.value)}
                    autoFocus
                  />
                  <button onClick={saveEditProgram} className="text-sm underline whitespace-nowrap">Valider</button>
                </div>
              ) : (
                <h3 className="font-display font-semibold">{program.name}</h3>
              )}
              {canEdit && editingProgramId !== program.id && (
                <div className="flex items-center gap-3 whitespace-nowrap">
                  <button onClick={() => addExercise(program.id)} className="text-sm text-ink underline">
                    + Exercice
                  </button>
                  <button onClick={() => startEditProgram(program)} className="text-xs text-muted underline">
                    Renommer
                  </button>
                  <button onClick={() => deleteProgram(program.id)} className="text-billel text-xs underline">
                    Supprimer
                  </button>
                </div>
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
                        onChange={(e) => updateExerciseLocal(ex, { name: e.target.value })}
                        onBlur={() => persistExercise(ex.id)}
                      />
                      <input
                        type="number"
                        className="input"
                        value={ex.target_sets}
                        onChange={(e) => updateExerciseLocal(ex, { target_sets: parseInt(e.target.value, 10) || 0 })}
                        onBlur={() => persistExercise(ex.id)}
                        title="Séries"
                      />
                      <input
                        type="number"
                        className="input"
                        value={ex.target_reps}
                        onChange={(e) => updateExerciseLocal(ex, { target_reps: parseInt(e.target.value, 10) || 0 })}
                        onBlur={() => persistExercise(ex.id)}
                        title="Répétitions"
                      />
                      <input
                        type="number"
                        step="0.5"
                        className="input"
                        value={ex.target_weight_kg ?? ''}
                        placeholder="kg"
                        onChange={(e) =>
                          updateExerciseLocal(ex, {
                            target_weight_kg: e.target.value ? parseFloat(e.target.value) : null
                          })
                        }
                        onBlur={() => persistExercise(ex.id)}
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
