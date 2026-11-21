import { useCallback, useEffect, useState } from 'react'
import AppLayout from '../components/layout/AppLayout'
import notificationService, { type Notification } from '../services/notificationService'
import { Alert, Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent } from '../components/ui/card'

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

  useEffect(() => {
    void load()
  }, [load])

  async function markRead(id: string) {
    setBusyId(id)
    try {
      await notificationService.markRead(id)
      setItems((current) =>
        current.map((item) => (item.public_id === id ? { ...item, is_read: true } : item))
      )
      setError('')
    } catch {
      setError('Não foi possível marcar a notificação como lida.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <AppLayout>
      <section className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold">Notificações</h1>
            <p className="mt-2 text-siac-muted">Acompanhe as atualizações das suas atividades.</p>
          </div>
          <Button type="button" variant="outline" onClick={() => void load()} disabled={loading}>
            Atualizar
          </Button>
        </div>

        {error && <Alert variant="danger">{error}</Alert>}

        {loading ? (
          <p role="status">Carregando notificações...</p>
        ) : items.length === 0 ? (
          <Card>
            <CardContent>Nenhuma notificação encontrada.</CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <Card key={item.public_id}>
                <CardContent className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="font-semibold">{item.title}</h2>
                      {!item.is_read && <Badge variant="info">Não lida</Badge>}
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{item.message}</p>
                    <p className="mt-2 text-xs text-siac-muted">
                      {new Date(item.created_at).toLocaleString('pt-BR')}
                    </p>
                  </div>
                  {!item.is_read && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busyId === item.public_id}
                      onClick={() => void markRead(item.public_id)}
                    >
                      Marcar como lida
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </AppLayout>
  )
}
