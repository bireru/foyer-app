import { useEffect, useState, useCallback, useRef } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine
} from 'recharts'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

interface WeightRow {
  id: string
  profile_id: string
  measured_at: string
  weight_kg: number
}

interface VitalRow {
  id: string
  profile_id: string
  measured_at: string
  systolic: number | null
  diastolic: number | null
  heart_rate: number | null
  sleep_hours: number | null
  note: string | null
}

interface PhotoRow {
  id: string
  profile_id: string
  taken_at: string
  storage_path: string
  signedUrl?: string
}

const COLOR_BY_TAG: Record<string, string> = { billel: '#E0714B', cerine: '#A8577A' }
const PHOTO_BUCKET = 'progress-photos'

export default function Weight() {
  const { profile, householdMembers, refreshHousehold } = useAuth()
  const [weights, setWeights] = useState<WeightRow[]>([])
  const [vitals, setVitals] = useState<VitalRow[]>([])
  const [photos, setPhotos] = useState<PhotoRow[]>([])
  const [weightInput, setWeightInput] = useState('')
  const [sleepHours, setSleepHours] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [editingGoal, setEditingGoal] = useState(false)
  const [goalInput, setGoalInput] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    if (!profile) return
    const { data: w } = await supabase
      .from('weight_logs')
      .select('id, profile_id, measured_at, weight_kg')
      .eq('household_id', profile.household_id)
      .order('measured_at', { ascending: true })
    setWeights(w ?? [])
    const { data: v } = await supabase
      .from('vital_signs')
      .select('*')
      .eq('household_id', profile.household_id)
      .order('measured_at', { ascending: false })
      .limit(30)
    setVitals(v ?? [])

    const { data: p } = await supabase
      .from('progress_photos')
      .select('id, profile_id, taken_at, storage_path')
      .eq('household_id', profile.household_id)
      .order('taken_at', { ascending: false })
    if (p && p.length) {
      const { data: signed } = await supabase.storage
        .from(PHOTO_BUCKET)
        .createSignedUrls(p.map((row) => row.storage_path), 3600)
      const urlByPath: Record<string, string> = {}
      for (const s of signed ?? []) {
        if (s.signedUrl) urlByPath[s.path ?? ''] = s.signedUrl
      }
      setPhotos(p.map((row) => ({ ...row, signedUrl: urlByPath[row.storage_path] })))
    } else {
      setPhotos([])
    }
  }, [profile])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    setGoalInput(profile?.weight_goal_kg != null ? String(profile.weight_goal_kg) : '')
  }, [profile?.weight_goal_kg])

  const memberColor = (profileId: string) => {
    const m = householdMembers.find((h) => h.id === profileId)
    return COLOR_BY_TAG[m?.color_tag ?? 'billel']
  }

  const memberName = (profileId: string) =>
    householdMembers.find((h) => h.id === profileId)?.display_name ?? '?'

  const latestWeight = (profileId: string) => {
    const mine = weights.filter((w) => w.profile_id === profileId)
    return mine.length ? mine[mine.length - 1].weight_kg : null
  }

  // Pivote les logs en une ligne par date avec une colonne par personne, pour le graphe superposé
  const chartData = (() => {
    const byDate: Record<string, Record<string, number | string>> = {}
    for (const w of weights) {
      const day = w.measured_at.slice(0, 10)
      byDate[day] ??= { date: day }
      byDate[day][memberName(w.profile_id)] = w.weight_kg
    }
    return Object.values(byDate).sort((a, b) => String(a.date).localeCompare(String(b.date)))
  })()

  const handleSave = async () => {
    if (!profile || !weightInput) return
    setSaving(true)
    await supabase.from('weight_logs').insert({
      household_id: profile.household_id,
      profile_id: profile.id,
      weight_kg: parseFloat(weightInput)
    })
    await supabase.from('vital_signs').insert({
      household_id: profile.household_id,
      profile_id: profile.id,
      sleep_hours: sleepHours ? parseFloat(sleepHours) : null
    })
    setWeightInput('')
    setSleepHours('')
    setSaving(false)
    load()
  }

  const saveGoal = async () => {
    if (!profile) return
    await supabase
      .from('profiles')
      .update({ weight_goal_kg: goalInput ? parseFloat(goalInput) : null })
      .eq('id', profile.id)
    setEditingGoal(false)
    await refreshHousehold()
  }

  const handlePhotoSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !profile) return
    setUploadingPhoto(true)
    const ext = file.name.split('.').pop() || 'jpg'
    const path = `${profile.household_id}/${profile.id}/${Date.now()}.${ext}`
    const { error: uploadError } = await supabase.storage.from(PHOTO_BUCKET).upload(path, file, {
      contentType: file.type
    })
    if (!uploadError) {
      await supabase.from('progress_photos').insert({
        household_id: profile.household_id,
        profile_id: profile.id,
        storage_path: path
      })
      await load()
    }
    setUploadingPhoto(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const deletePhoto = async (photo: PhotoRow) => {
    await supabase.storage.from(PHOTO_BUCKET).remove([photo.storage_path])
    await supabase.from('progress_photos').delete().eq('id', photo.id)
    setPhotos((prev) => prev.filter((p) => p.id !== photo.id))
  }

  return (
    <div className="space-y-6">
      {/* Objectifs de poids, en grand */}
      <div className="grid sm:grid-cols-2 gap-4">
        {householdMembers.map((m) => {
          const isMe = m.id === profile?.id
          const current = latestWeight(m.id)
          const delta = current != null && m.weight_goal_kg != null ? current - m.weight_goal_kg : null
          const color = COLOR_BY_TAG[m.color_tag]
          return (
            <div key={m.id} className="card shadow-soft" style={{ borderColor: color + '40' }}>
              <div className="flex items-center justify-between mb-2">
                <span className={m.color_tag === 'cerine' ? 'tag-cerine' : 'tag-billel'}>{m.display_name}</span>
                {isMe && !editingGoal && (
                  <button onClick={() => setEditingGoal(true)} className="text-xs underline text-muted">
                    Modifier
                  </button>
                )}
              </div>

              {isMe && editingGoal ? (
                <div className="flex items-end gap-2">
                  <label className="text-sm flex-1">
                    Objectif (kg)
                    <input
                      type="number"
                      step="0.1"
                      autoFocus
                      className="input mt-1"
                      value={goalInput}
                      onChange={(e) => setGoalInput(e.target.value)}
                      placeholder="ex: 82"
                    />
                  </label>
                  <button onClick={saveGoal} className="btn-ink mb-0.5">Valider</button>
                </div>
              ) : m.weight_goal_kg != null ? (
                <div>
                  <p className="font-display font-bold text-5xl" style={{ color }}>
                    {m.weight_goal_kg} <span className="text-2xl font-normal text-muted">kg</span>
                  </p>
                  {delta != null && (
                    <p className="text-sm text-muted mt-1">
                      {delta > 0
                        ? `Encore ${delta.toFixed(1)} kg à perdre`
                        : delta < 0
                          ? `${Math.abs(delta).toFixed(1)} kg sous l'objectif 🎉`
                          : 'Objectif atteint 🎉'}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted">
                  {isMe ? (
                    <button onClick={() => setEditingGoal(true)} className="underline">
                      Définir un objectif de poids
                    </button>
                  ) : (
                    'Pas encore d\u2019objectif défini.'
                  )}
                </p>
              )}
            </div>
          )
        })}
      </div>

      <div className="card">
        <h3 className="font-display font-semibold mb-3">Ajouter une mesure — {profile?.display_name}</h3>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="text-sm">
            Poids (kg)
            <input
              type="number"
              step="0.1"
              className="input mt-1"
              value={weightInput}
              onChange={(e) => setWeightInput(e.target.value)}
              placeholder="ex: 87.5"
            />
          </label>
          <label className="text-sm">
            Sommeil (h)
            <input
              type="number"
              step="0.5"
              className="input mt-1"
              value={sleepHours}
              onChange={(e) => setSleepHours(e.target.value)}
              placeholder="ex: 7"
            />
          </label>
        </div>
        <button onClick={handleSave} disabled={saving || !weightInput} className="btn-ink mt-4">
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>

      <div className="card">
        <h3 className="font-display font-semibold mb-3">Évolution du poids — les deux courbes</h3>
        <div style={{ width: '100%', height: 300 }}>
          <ResponsiveContainer>
            <LineChart data={chartData}>
              <CartesianGrid stroke="#EDE0D2" strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis domain={['dataMin - 2', 'dataMax + 2']} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              {profile?.weight_goal_kg != null && (
                <ReferenceLine
                  y={profile.weight_goal_kg}
                  stroke={COLOR_BY_TAG[profile.color_tag]}
                  strokeDasharray="4 4"
                  label={{ value: 'Objectif', position: 'insideTopRight', fontSize: 11, fill: COLOR_BY_TAG[profile.color_tag] }}
                />
              )}
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

      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display font-semibold">Photos de progression</h3>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handlePhotoSelected}
              className="hidden"
              id="photo-input"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingPhoto}
              className="btn-ink"
            >
              {uploadingPhoto ? 'Envoi…' : '📷 Prendre une photo'}
            </button>
          </div>
        </div>
        {photos.length === 0 ? (
          <p className="text-sm text-muted">Aucune photo pour l'instant — privées, visibles seulement de vous deux.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {photos.map((p) => (
              <div key={p.id} className="relative group">
                {p.signedUrl && (
                  <img
                    src={p.signedUrl}
                    alt={`Photo de progression du ${p.taken_at.slice(0, 10)}`}
                    className="w-full aspect-square object-cover rounded-2xl border border-line"
                  />
                )}
                <div className="absolute inset-x-0 bottom-0 rounded-b-2xl bg-ink/60 backdrop-blur-sm px-2 py-1 flex items-center justify-between">
                  <span
                    className="text-xs font-medium text-white"
                  >
                    {memberName(p.profile_id)} · {p.taken_at.slice(0, 10)}
                  </span>
                  {p.profile_id === profile?.id && (
                    <button
                      onClick={() => deletePhoto(p)}
                      className="text-xs text-white/80 hover:text-white"
                      aria-label="Supprimer la photo"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h3 className="font-display font-semibold mb-3">Signes vitaux récents</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted border-b border-line">
                <th className="py-1 pr-4">Date</th>
                <th className="py-1 pr-4">Qui</th>
                <th className="py-1 pr-4">Sommeil</th>
              </tr>
            </thead>
            <tbody>
              {vitals.map((v) => (
                <tr key={v.id} className="border-b border-line/50">
                  <td className="py-1 pr-4">{v.measured_at.slice(0, 10)}</td>
                  <td className="py-1 pr-4" style={{ color: memberColor(v.profile_id) }}>
                    {memberName(v.profile_id)}
                  </td>
                  <td className="py-1 pr-4">{v.sleep_hours ?? '—'} h</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
