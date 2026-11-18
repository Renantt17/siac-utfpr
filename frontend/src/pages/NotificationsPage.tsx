import { useCallback, useEffect, useState } from 'react'
import AppLayout from '../components/layout/AppLayout'
import notificationService, { type Notification } from '../services/notificationService'

export default function NotificationsPage() {
  const [items, setItems] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setItems(await notificationService.list())
      setError('')
    } catch {
      setError('Não foi possível carregar as notificações.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  async function markRead(id: string) {
    setBusyId(id)
    try {
      await notificationService.markRead(id)
      setItems(current => current.map(item => item.public_id === id ? { ...item, is_read: true } : item))
      setError('')
    } catch {
      setError('Não foi possível marcar a notificação como lida.')
    } finally {
      setBusyId(null)
    }
  }

  return <AppLayout><section className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-3xl font-bold">Notificações</h1><p className="mt-2 text-siac-muted">Acompanhe as atualizações das suas atividades.</p></div><button type="button" onClick={() => void load()} disabled={loading} className="rounded-lg border border-siac-border bg-white px-4 py-2 disabled:opacity-50">Atualizar</button></div>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {loading ? <p role="status">Carregando notificações...</p> : items.length === 0 ? <p className="rounded-xl border border-siac-border bg-white p-6">Nenhuma notificação encontrada.</p> : <div className="space-y-3">{items.map(item => <article key={item.public_id} className="rounded-xl border border-siac-border bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">{item.title}{!item.is_read && <span className="ml-2 text-xs text-blue-700">Não lida</span>}</h2><p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{item.message}</p><p className="mt-2 text-xs text-siac-muted">{new Date(item.created_at).toLocaleString('pt-BR')}</p></div>{!item.is_read && <button type="button" disabled={busyId === item.public_id} onClick={() => void markRead(item.public_id)} className="rounded-lg border border-siac-border px-3 py-2 text-sm disabled:opacity-50">Marcar como lida</button>}</div></article>)}</div>}
  </section></AppLayout>
}
