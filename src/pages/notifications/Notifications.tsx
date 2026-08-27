import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)))
}

export default function Notifications() {
  const { profile } = useAuth()
  const [supported, setSupported] = useState(true)
  const [permission, setPermission] = useState<NotificationPermission>('default')
  const [subscribedHere, setSubscribedHere] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setSupported(false)
      return
    }
    setPermission(Notification.permission)
    navigator.serviceWorker.ready.then(async (reg) => {
      const sub = await reg.pushManager.getSubscription()
      setSubscribedHere(!!sub)
    })
  }, [])

  const enable = async () => {
    if (!profile) return
    setError(null)
    setLoading(true)
    try {
      const result = await Notification.requestPermission()
      setPermission(result)
      if (result !== 'granted') {
        setError("Permission refusée — active les notifications dans les réglages de ton navigateur/téléphone si tu changes d'avis.")
        setLoading(false)
        return
      }
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      })
      const json = sub.toJSON()
      await supabase.from('push_subscriptions').upsert(
        {
          profile_id: profile.id,
          endpoint: json.endpoint!,
          p256dh: json.keys!.p256dh,
          auth: json.keys!.auth
        },
        { onConflict: 'endpoint' }
      )
      setSubscribedHere(true)
    } catch (err) {
      console.error(err)
      setError("Impossible d'activer les notifications sur cet appareil.")
    } finally {
      setLoading(false)
    }
  }

  const disable = async () => {
    setLoading(true)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
        await sub.unsubscribe()
      }
      setSubscribedHere(false)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6 max-w-lg">
      <h2 className="text-2xl font-semibold mb-1">🔔 Notifications</h2>
      <p className="text-sm text-muted mb-4">
        Les notifications sont activées par appareil — si tu utilises le PWA sur ton téléphone et ton PC, active-les sur chacun séparément.
      </p>

      {!supported ? (
        <p className="card text-sm text-billel">
          Ton navigateur ne supporte pas les notifications push. Sur iPhone, assure-toi d'avoir ajouté l'appli à l'écran d'accueil (Safari seul ne suffit pas).
        </p>
      ) : (
        <div className="card">
          {subscribedHere ? (
            <>
              <p className="text-good text-sm mb-3">✓ Notifications activées sur cet appareil.</p>
              <button onClick={disable} disabled={loading} className="btn border border-line text-ink">
                Désactiver sur cet appareil
              </button>
            </>
          ) : (
            <>
              <p className="text-sm text-muted mb-3">
                {permission === 'denied'
                  ? "Tu as déjà refusé les notifications pour ce site — il faut les réautoriser dans les réglages de ton navigateur pour continuer."
                  : "Active les notifications pour recevoir tes rappels."}
              </p>
              <button onClick={enable} disabled={loading || permission === 'denied'} className="btn-ink">
                {loading ? 'Activation…' : 'Activer les notifications'}
              </button>
            </>
          )}
          {error && <p className="text-billel text-sm mt-2">{error}</p>}
        </div>
      )}

      <div className="card">
        <h3 className="font-display font-semibold mb-3">Rappels programmés</h3>
        <ul className="text-sm space-y-2 text-muted">
          <li>⚖️ <strong className="text-ink">Pesée</strong> — chaque lundi à 7h00</li>
          <li>📷 <strong className="text-ink">Photo de progression</strong> — 1er et 3ème lundi du mois à 7h00</li>
          <li>🍽️ <strong className="text-ink">Journal alimentaire</strong> — tous les jours à 14h00 et 21h00</li>
          <li>📅 <strong className="text-ink">Plan de repas</strong> — dimanche à 19h00, si la semaine suivante est vide</li>
          <li>💶 <strong className="text-ink">Dépassement de budget</strong> — dès qu'une catégorie avec une limite définie est dépassée (vérifié à 8h et 20h)</li>
        </ul>
        <p className="text-xs text-muted mt-3">
          Pour l'alerte de budget, définis une limite mensuelle sur tes catégories dans Budget → Mes dépenses → Gérer les catégories.
        </p>
      </div>
    </div>
  )
}
