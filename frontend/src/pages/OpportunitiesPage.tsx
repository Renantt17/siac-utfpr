import { useCallback, useEffect, useState } from 'react'
import AppLayout from '../components/layout/AppLayout'
import opportunityService, { type Opportunity } from '../services/opportunityService'

function dateBR(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return date
  const [year, month, day] = date.split('-')
  return `${day}/${month}/${year}`
}

export default function OpportunitiesPage() {
  const [items, setItems] = useState<Opportunity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    setLoading(true)
    try { setItems(await opportunityService.list()); setError('') }
    catch { setError('Não foi possível carregar as oportunidades.') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  return <AppLayout><section className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-3xl font-bold">Oportunidades</h1><p className="mt-2 text-siac-muted">Atividades complementares disponíveis no seu campus.</p></div><button type="button" disabled={loading} onClick={() => void load()} className="rounded-lg border border-siac-border bg-white px-4 py-2 disabled:opacity-50">Atualizar</button></div>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {loading ? <p role="status">Carregando oportunidades...</p> : items.length === 0 ? <p className="rounded-xl border border-siac-border bg-white p-6">Nenhuma oportunidade disponível no momento.</p> : <div className="space-y-4">{items.map(item => <article key={item.public_id} className="rounded-xl border border-siac-border bg-white p-6 shadow-sm"><h2 className="text-lg font-semibold">{item.title}</h2><p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{item.description}</p><dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2"><div><dt className="font-semibold">Organizador</dt><dd>{item.organizer_name}</dd></div><div><dt className="font-semibold">Modalidade</dt><dd>{item.modality}</dd></div><div><dt className="font-semibold">Período</dt><dd>{dateBR(item.start_date)} a {dateBR(item.end_date)}</dd></div><div><dt className="font-semibold">Carga horária estimada</dt><dd>{item.estimated_hours} horas</dd></div><div><dt className="font-semibold">Grupo / item sugerido</dt><dd>{item.suggested_group_number} / {item.suggested_item_code}</dd></div><div><dt className="font-semibold">Campus</dt><dd>{item.campus_name}</dd></div></dl><p className="mt-4 text-sm"><strong>Certificação:</strong> {item.certification_rules}</p></article>)}</div>}
  </section></AppLayout>
}
