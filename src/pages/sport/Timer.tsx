import { useEffect, useRef, useState } from 'react'

// Chronomètre simple — ne dépend d'aucun programme, ne sauvegarde rien.
// Pour enregistrer une progression, voir l'onglet Journal.
export default function Timer() {
  const [running, setRunning] = useState(false)
  const [elapsed, setElapsed] = useState(0) // secondes
  const startRef = useRef<number>(0)
  const baseRef = useRef<number>(0)

  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => {
      setElapsed(baseRef.current + Math.floor((Date.now() - startRef.current) / 1000))
    }, 250)
    return () => window.clearInterval(id)
  }, [running])

  const start = () => {
    startRef.current = Date.now()
    setRunning(true)
  }

  const pause = () => {
    baseRef.current = elapsed
    setRunning(false)
  }

  const reset = () => {
    setRunning(false)
    setElapsed(0)
    baseRef.current = 0
  }

  const fmt = (s: number) => {
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = s % 60
    const parts = h > 0 ? [h, m, sec] : [m, sec]
    return parts.map((p) => String(p).padStart(2, '0')).join(':')
  }

  return (
    <div className="max-w-sm">
      <div className="card text-center space-y-6 py-10">
        <p className="font-mono text-6xl">{fmt(elapsed)}</p>
        <div className="flex justify-center gap-3">
          {!running ? (
            <button onClick={start} className="btn-ink px-8">
              {elapsed > 0 ? 'Reprendre' : 'Démarrer'}
            </button>
          ) : (
            <button onClick={pause} className="btn-ink px-8">Pause</button>
          )}
          <button onClick={reset} className="btn border border-line text-ink px-8">
            Réinitialiser
          </button>
        </div>
      </div>
      <p className="text-xs text-muted text-center mt-3">
        Simple minuteur — rien n'est enregistré. Pour noter tes séries et ta progression, va dans l'onglet Journal.
      </p>
    </div>
  )
}
