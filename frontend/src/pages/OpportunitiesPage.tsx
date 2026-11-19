import { useCallback, useEffect, useState, type FormEvent } from 'react'
import axios from 'axios'
import AppLayout from '../components/layout/AppLayout'
import opportunityService, { type Opportunity, type OpportunityInput } from '../services/opportunityService'
import registerService, { type Campus } from '../services/registerService'
import userService from '../services/userService'

function dateBR(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return date
  const [year, month, day] = date.split('-')
  return `${day}/${month}/${year}`
}

const emptyForm = {
  title: '', description: '', suggested_group_number: '', suggested_item_code: '',
  start_date: '', end_date: '', estimated_hours: '', modality: '',
  is_external: false, organizer_name: '', certification_rules: '',
}

type FormValues = typeof emptyForm

function getErrorMessage(error: unknown) {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data
    if (typeof data?.detail === 'string') return data.detail
    if (data && typeof data === 'object') {
      const first = Object.entries(data)[0]
      if (first) return `${first[0]}: ${Array.isArray(first[1]) ? first[1].join(', ') : String(first[1])}`
    }
  }
  return 'Não foi possível cadastrar a oportunidade. Tente novamente.'
}

export default function OpportunitiesPage() {
  const [items, setItems] = useState<Opportunity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [canCreate, setCanCreate] = useState(false)
  const [campus, setCampus] = useState<Campus | null>(null)
  const [permissionLoading, setPermissionLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<FormValues>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [success, setSuccess] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try { setItems(await opportunityService.list()); setError('') }
    catch { setError('Não foi possível carregar as oportunidades.') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    let active = true
    async function loadPermissions() {
      try {
        const user = await userService.getCurrentUser()
        const allowed = user.roles.includes('PROFESSOR') || user.roles.includes('SIAC_COORDINATOR')
        if (!allowed) return
        const campuses = await registerService.getCampuses()
        const ownCampus = campuses.find(c => c.acronym === user.campus || c.name === user.campus)
        if (active) {
          setCanCreate(true)
          setCampus(ownCampus ?? null)
        }
      } catch {
        if (active) setCanCreate(false)
      } finally {
        if (active) setPermissionLoading(false)
      }
    }
    void loadPermissions()
    return () => { active = false }
  }, [])

  function update<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setForm(previous => ({ ...previous, [key]: value }))
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError('')
    setSuccess('')
    if (!campus) { setFormError('Não foi possível identificar seu campus.'); return }
    if (form.end_date < form.start_date) { setFormError('A data final não pode ser anterior à data inicial.'); return }
    const group = Number(form.suggested_group_number)
    const hours = Number(form.estimated_hours)
    if (!Number.isInteger(group) || group < 0 || !Number.isFinite(hours) || hours <= 0) {
      setFormError('Informe um grupo válido e uma carga horária maior que zero.')
      return
    }
    const input: OpportunityInput = {
      ...form,
      title: form.title.trim(), description: form.description.trim(),
      campus: campus.id,
      suggested_group_number: group,
      suggested_item_code: form.suggested_item_code.trim(),
      estimated_hours: hours.toFixed(2),
      modality: form.modality.trim(), organizer_name: form.organizer_name.trim(),
      certification_rules: form.certification_rules.trim(),
    }
    setSaving(true)
    try {
      await opportunityService.create(input)
      setForm(emptyForm)
      setShowForm(false)
      setSuccess('Oportunidade cadastrada com sucesso.')
      await load()
    } catch (err) { setFormError(getErrorMessage(err)) }
    finally { setSaving(false) }
  }

  const inputClass = 'mt-1 w-full rounded-lg border border-siac-border bg-white px-3 py-2 text-gray-900'
  const labelClass = 'block text-sm font-medium text-gray-700'

  return <AppLayout><section className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-3xl font-bold">Oportunidades</h1><p className="mt-2 text-siac-muted">Atividades complementares disponíveis no seu campus.</p></div>
      <div className="flex flex-wrap gap-2">
        {canCreate && <button type="button" onClick={() => { setShowForm(value => !value); setFormError('') }} className="rounded-lg bg-utfpr-black px-4 py-2 font-medium text-white">{showForm ? 'Fechar cadastro' : 'Cadastrar oportunidade'}</button>}
        <button type="button" disabled={loading} onClick={() => void load()} className="rounded-lg border border-siac-border bg-white px-4 py-2 disabled:opacity-50">Atualizar</button>
      </div>
    </div>
    {success && <p role="status" className="text-green-700">{success}</p>}
    {canCreate && showForm && <form onSubmit={event => void submit(event)} className="space-y-4 rounded-xl border border-siac-border bg-white p-6 shadow-sm">
      <h2 className="text-xl font-semibold">Nova oportunidade</h2>
      <p className="text-sm text-siac-muted">Campus: {campus ? `${campus.name} (${campus.acronym})` : 'Não identificado'}. O cadastro é permitido somente no seu campus.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={labelClass}>Título<input className={inputClass} maxLength={150} required value={form.title} onChange={e => update('title', e.target.value)} /></label>
        <label className={labelClass}>Organizador<input className={inputClass} maxLength={150} required value={form.organizer_name} onChange={e => update('organizer_name', e.target.value)} /></label>
        <label className={labelClass}>Data inicial<input className={inputClass} type="date" required value={form.start_date} onChange={e => update('start_date', e.target.value)} /></label>
        <label className={labelClass}>Data final<input className={inputClass} type="date" min={form.start_date || undefined} required value={form.end_date} onChange={e => update('end_date', e.target.value)} /></label>
        <label className={labelClass}>Grupo sugerido<input className={inputClass} type="number" min="0" step="1" required value={form.suggested_group_number} onChange={e => update('suggested_group_number', e.target.value)} /></label>
        <label className={labelClass}>Código do item sugerido<input className={inputClass} maxLength={30} required value={form.suggested_item_code} onChange={e => update('suggested_item_code', e.target.value)} /></label>
        <label className={labelClass}>Carga horária estimada<input className={inputClass} type="number" min="0.01" step="0.01" required value={form.estimated_hours} onChange={e => update('estimated_hours', e.target.value)} /></label>
        <label className={labelClass}>Modalidade<input className={inputClass} maxLength={30} required placeholder="Ex.: presencial, online, híbrida" value={form.modality} onChange={e => update('modality', e.target.value)} /></label>
      </div>
      <label className={labelClass}>Descrição<textarea className={inputClass} rows={3} required value={form.description} onChange={e => update('description', e.target.value)} /></label>
      <label className={labelClass}>Regras de certificação<textarea className={inputClass} rows={3} required value={form.certification_rules} onChange={e => update('certification_rules', e.target.value)} /></label>
      <label className="flex items-center gap-2 text-sm font-medium text-gray-700"><input type="checkbox" checked={form.is_external} onChange={e => update('is_external', e.target.checked)} /> Oportunidade externa à instituição</label>
      {formError && <p role="alert" className="text-red-700">{formError}</p>}
      <button type="submit" disabled={saving || !campus} className="rounded-lg bg-utfpr-black px-5 py-2 font-medium text-white disabled:opacity-50">{saving ? 'Salvando...' : 'Salvar oportunidade'}</button>
    </form>}
    {permissionLoading && <p className="text-sm text-siac-muted">Verificando permissões...</p>}
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {loading ? <p role="status">Carregando oportunidades...</p> : items.length === 0 ? <p className="rounded-xl border border-siac-border bg-white p-6">Nenhuma oportunidade disponível no momento.</p> : <div className="space-y-4">{items.map(item => <article key={item.public_id} className="rounded-xl border border-siac-border bg-white p-6 shadow-sm"><h2 className="text-lg font-semibold">{item.title}</h2><p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{item.description}</p><dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2"><div><dt className="font-semibold">Organizador</dt><dd>{item.organizer_name}</dd></div><div><dt className="font-semibold">Modalidade</dt><dd>{item.modality}</dd></div><div><dt className="font-semibold">Período</dt><dd>{dateBR(item.start_date)} a {dateBR(item.end_date)}</dd></div><div><dt className="font-semibold">Carga horária estimada</dt><dd>{item.estimated_hours} horas</dd></div><div><dt className="font-semibold">Grupo / item sugerido</dt><dd>{item.suggested_group_number} / {item.suggested_item_code}</dd></div><div><dt className="font-semibold">Campus</dt><dd>{item.campus_name}</dd></div></dl><p className="mt-4 text-sm"><strong>Certificação:</strong> {item.certification_rules}</p></article>)}</div>}
  </section></AppLayout>
}
