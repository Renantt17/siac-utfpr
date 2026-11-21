import { useCallback, useEffect, useState, type FormEvent } from 'react'
import AppLayout from '../components/layout/AppLayout'
import { useAuth } from '../contexts/AuthContext'
import { opportunitySchema } from '../schemas'
import opportunityService, { type Opportunity, type OpportunityInput } from '../services/opportunityService'
import userService, { type Campus } from '../services/userService'
import { Alert, Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Input, Label, Textarea } from '../components/ui/input'
import { Select } from '../components/ui/select'

function dateBR(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return date
  const [year, month, day] = date.split('-')
  return `${day}/${month}/${year}`
}

const emptyForm = {
  title: '',
  description: '',
  campus: '',
  suggested_group_number: '',
  suggested_item_code: '',
  start_date: '',
  end_date: '',
  estimated_hours: '',
  modality: 'PRESENCIAL' as 'PRESENCIAL' | 'REMOTO' | 'HIBRIDO',
  is_external: false,
  organizer_name: '',
  certification_rules: '',
}

export default function OpportunitiesPage() {
  const { user } = useAuth()
  const isSiacCoord = Boolean(user?.roles.includes('SIAC_COORD'))

  const [items, setItems] = useState<Opportunity[]>([])
  const [campuses, setCampuses] = useState<Campus[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filterGroup, setFilterGroup] = useState('')
  const [filterModality, setFilterModality] = useState('')
  const [includeExpired, setIncludeExpired] = useState(false)

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [success, setSuccess] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await opportunityService.list({
        include_expired: isSiacCoord && includeExpired,
        group_number: filterGroup || undefined,
        modality: filterModality || undefined,
      })
      setItems(data)
      setError('')
    } catch {
      setError('Não foi possível carregar as oportunidades.')
    } finally {
      setLoading(false)
    }
  }, [isSiacCoord, includeExpired, filterGroup, filterModality])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (isSiacCoord) {
      void userService.listCampuses().then(setCampuses).catch(() => setCampuses([]))
    }
  }, [isSiacCoord])

  function startEdit(op: Opportunity) {
    setEditingId(op.public_id)
    setForm({
      title: op.title,
      description: op.description,
      campus: op.campus ? String(op.campus) : '',
      suggested_group_number: op.suggested_group_number ? String(op.suggested_group_number) : '',
      suggested_item_code: op.suggested_item_code || '',
      start_date: op.start_date,
      end_date: op.end_date,
      estimated_hours: op.estimated_hours || '',
      modality: op.modality,
      is_external: op.is_external,
      organizer_name: op.organizer_name,
      certification_rules: op.certification_rules,
    })
    setShowForm(true)
    setFormError('')
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError('')
    setSuccess('')

    const parsed = opportunitySchema.safeParse(form)
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message || 'Verifique os campos informados.')
      return
    }

    const payload: OpportunityInput = {
      title: parsed.data.title,
      description: parsed.data.description,
      campus: parsed.data.campus ? Number(parsed.data.campus) : null,
      suggested_group_number: parsed.data.suggested_group_number
        ? Number(parsed.data.suggested_group_number)
        : null,
      suggested_item_code: parsed.data.suggested_item_code || null,
      start_date: parsed.data.start_date,
      end_date: parsed.data.end_date,
      estimated_hours: parsed.data.estimated_hours ? Number(parsed.data.estimated_hours).toFixed(2) : null,
      modality: parsed.data.modality,
      is_external: parsed.data.is_external,
      organizer_name: parsed.data.organizer_name,
      certification_rules: parsed.data.certification_rules,
    }

    setSaving(true)
    try {
      if (editingId) {
        await opportunityService.update(editingId, payload)
        setSuccess('Oportunidade atualizada com sucesso.')
      } else {
        await opportunityService.create(payload)
        setSuccess('Oportunidade cadastrada com sucesso.')
      }
      setForm(emptyForm)
      setEditingId(null)
      setShowForm(false)
      await load()
    } catch {
      setFormError('Não foi possível salvar a oportunidade.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeactivate(publicId: string) {
    try {
      await opportunityService.deactivate(publicId)
      setSuccess('Oportunidade encerrada no mural.')
      await load()
    } catch {
      setError('Não foi possível encerrar a oportunidade.')
    }
  }

  return (
    <AppLayout>
      <section className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold">Mural de Oportunidades</h1>
            <p className="mt-2 text-siac-muted">
              Eventos vigentes priorizados pelo seu campus ({user?.campus}).
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {isSiacCoord && (
              <Button
                type="button"
                variant="dark"
                onClick={() => {
                  setEditingId(null)
                  setForm(emptyForm)
                  setShowForm((prev) => !prev)
                  setFormError('')
                }}
              >
                {showForm ? 'Fechar formulário' : 'Nova oportunidade'}
              </Button>
            )}
            <Button type="button" variant="outline" disabled={loading} onClick={() => void load()}>
              Atualizar
            </Button>
          </div>
        </div>

        <Card>
          <CardContent className="flex flex-wrap items-end gap-4">
            <div className="w-44">
              <Label htmlFor="filter-group">Grupo sugerido</Label>
              <Select
                id="filter-group"
                value={filterGroup}
                onChange={(e) => setFilterGroup(e.target.value)}
              >
                <option value="">Todos</option>
                <option value="1">Grupo 1</option>
                <option value="2">Grupo 2</option>
                <option value="3">Grupo 3</option>
              </Select>
            </div>
            <div className="w-44">
              <Label htmlFor="filter-modality">Modalidade</Label>
              <Select
                id="filter-modality"
                value={filterModality}
                onChange={(e) => setFilterModality(e.target.value)}
              >
                <option value="">Todas</option>
                <option value="PRESENCIAL">Presencial</option>
                <option value="REMOTO">Remoto</option>
                <option value="HIBRIDO">Híbrido</option>
              </Select>
            </div>
            {isSiacCoord && (
              <label className="flex items-center gap-2 pb-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={includeExpired}
                  onChange={(e) => setIncludeExpired(e.target.checked)}
                />
                Incluir encerradas/expiradas
              </label>
            )}
          </CardContent>
        </Card>

        {success && <Alert variant="success">{success}</Alert>}
        {error && <Alert variant="danger">{error}</Alert>}

        {isSiacCoord && showForm && (
          <Card>
            <CardHeader>
              <CardTitle>{editingId ? 'Editar oportunidade' : 'Cadastrar oportunidade'}</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={(e) => void submit(e)} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="op-title">Título</Label>
                    <Input
                      id="op-title"
                      required
                      value={form.title}
                      onChange={(e) => setForm({ ...form, title: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="op-org">Instituição / Organizador</Label>
                    <Input
                      id="op-org"
                      required
                      value={form.organizer_name}
                      onChange={(e) => setForm({ ...form, organizer_name: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="op-campus">Campus (opcional para eventos gerais/externos)</Label>
                    <Select
                      id="op-campus"
                      value={form.campus}
                      onChange={(e) => setForm({ ...form, campus: e.target.value })}
                    >
                      <option value="">Todos os campi / Externo</option>
                      {campuses.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.acronym})
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="op-mod">Modalidade</Label>
                    <Select
                      id="op-mod"
                      value={form.modality}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          modality: e.target.value as 'PRESENCIAL' | 'REMOTO' | 'HIBRIDO',
                        })
                      }
                    >
                      <option value="PRESENCIAL">Presencial</option>
                      <option value="REMOTO">Remoto</option>
                      <option value="HIBRIDO">Híbrido</option>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="op-start">Data inicial</Label>
                    <Input
                      id="op-start"
                      type="date"
                      required
                      value={form.start_date}
                      onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="op-end">Data final</Label>
                    <Input
                      id="op-end"
                      type="date"
                      required
                      value={form.end_date}
                      onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="op-grp">Grupo sugerido (1, 2 ou 3)</Label>
                    <Input
                      id="op-grp"
                      type="number"
                      min="1"
                      value={form.suggested_group_number}
                      onChange={(e) => setForm({ ...form, suggested_group_number: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="op-code">Código sugerido (ex.: ii.d)</Label>
                    <Input
                      id="op-code"
                      value={form.suggested_item_code}
                      onChange={(e) => setForm({ ...form, suggested_item_code: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="op-hours">Carga horária estimada</Label>
                    <Input
                      id="op-hours"
                      type="number"
                      step="0.5"
                      min="0.5"
                      value={form.estimated_hours}
                      onChange={(e) => setForm({ ...form, estimated_hours: e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="op-desc">Descrição</Label>
                  <Textarea
                    id="op-desc"
                    rows={3}
                    required
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="op-cert">Regras de certificação / convalidação</Label>
                  <Textarea
                    id="op-cert"
                    rows={2}
                    required
                    value={form.certification_rules}
                    onChange={(e) => setForm({ ...form, certification_rules: e.target.value })}
                  />
                </div>
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={form.is_external}
                    onChange={(e) => setForm({ ...form, is_external: e.target.checked })}
                  />
                  Evento externo à UTFPR
                </label>

                {formError && <Alert variant="danger">{formError}</Alert>}
                <Button type="submit" disabled={saving}>
                  {saving ? 'Salvando...' : editingId ? 'Salvar alterações' : 'Publicar oportunidade'}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {loading ? (
          <p role="status">Carregando oportunidades...</p>
        ) : items.length === 0 ? (
          <Card>
            <CardContent>Nenhuma oportunidade vigente encontrada para os filtros selecionados.</CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {items.map((item) => (
              <Card key={item.public_id}>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-bold">{item.title}</h2>
                        {item.is_external && <Badge variant="info">Evento Externo</Badge>}
                        {item.campus_acronym === user?.campus && (
                          <Badge variant="warning">Seu campus ({item.campus_acronym})</Badge>
                        )}
                        {!item.is_active && <Badge variant="danger">Encerrada</Badge>}
                      </div>
                      <p className="mt-1 text-sm text-gray-700">{item.description}</p>
                    </div>
                    {isSiacCoord && item.is_active && (
                      <div className="flex gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => startEdit(item)}>
                          Editar
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          onClick={() => void handleDeactivate(item.public_id)}
                        >
                          Encerrar
                        </Button>
                      </div>
                    )}
                  </div>

                  <dl className="grid gap-2 text-sm sm:grid-cols-3">
                    <div>
                      <dt className="font-semibold">Responsável / Organizador</dt>
                      <dd>{item.organizer_name}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold">Campus / Abrangência</dt>
                      <dd>{item.campus_name}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold">Modalidade</dt>
                      <dd>{item.modality}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold">Período</dt>
                      <dd>
                        {dateBR(item.start_date)} a {dateBR(item.end_date)}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-semibold">Carga horária</dt>
                      <dd>{item.estimated_hours ? `${item.estimated_hours} h` : 'Conforme certificado'}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold">Enquadramento sugerido</dt>
                      <dd>
                        {item.suggested_group_number
                          ? `Grupo ${item.suggested_group_number} / Item ${item.suggested_item_code}`
                          : 'A definir'}
                      </dd>
                    </div>
                  </dl>
                  <p className="rounded-lg bg-gray-50 p-3 text-sm">
                    <strong>Certificação / Papel da UTFPR:</strong> {item.certification_rules}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </AppLayout>
  )
}
