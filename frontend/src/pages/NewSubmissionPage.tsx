import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { ClipboardList, FileUp, Save, Trash2 } from 'lucide-react'
import AppLayout from '../components/layout/AppLayout'
import FilePreview from '../components/submission/FilePreview'
import { submissionSchema } from '../schemas'
import activityCatalogService, {
  type ActivityGroup,
  type ActivityItem,
  type Enrollment,
} from '../services/activityCatalogService'
import submissionService from '../services/submissionService'
import { Alert } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Input, Label, Textarea } from '../components/ui/input'
import { Select } from '../components/ui/select'

const DRAFT_KEY = 'siac-v2-activity-draft'

interface Draft {
  enrollmentId: string
  groupId: string
  activityItemId: string
  description: string
  startDate: string
  endDate: string
  quantity: string
}

const emptyDraft: Draft = {
  enrollmentId: '',
  groupId: '',
  activityItemId: '',
  description: '',
  startDate: '',
  endDate: '',
  quantity: '1',
}

function loadDraft(): Draft {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return emptyDraft
    return { ...emptyDraft, ...(JSON.parse(raw) as Partial<Draft>) }
  } catch {
    return emptyDraft
  }
}

function extractApiError(error: unknown): string {
  if (!axios.isAxiosError(error)) return 'Ocorreu um erro inesperado.'
  const data = error.response?.data as Record<string, unknown> | undefined
  if (typeof data?.detail === 'string') return data.detail
  if (data && typeof data === 'object') {
    return Object.entries(data)
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : String(v)}`)
      .join(' | ')
  }
  return 'Não foi possível enviar a atividade.'
}

export default function NewSubmissionPage() {
  const navigate = useNavigate()
  const [draft, setDraft] = useState<Draft>(loadDraft)
  const [file, setFile] = useState<File | null>(null)
  const [enrollments, setEnrollments] = useState<Enrollment[]>([])
  const [groups, setGroups] = useState<ActivityGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingCatalog, setLoadingCatalog] = useState(false)
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    let active = true
    activityCatalogService
      .enrollments()
      .then((data) => {
        if (!active) return
        const valid = data.filter((e) => e.status === 'ACTIVE')
        setEnrollments(valid)
        if (valid.length === 1 && !draft.enrollmentId) {
          setDraft((prev) => ({ ...prev, enrollmentId: String(valid[0].id) }))
        }
      })
      .catch((err: unknown) => active && setMessage(extractApiError(err)))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [])

  const selectedEnrollment = enrollments.find((e) => String(e.id) === draft.enrollmentId)
  const courseId = selectedEnrollment?.course

  useEffect(() => {
    let active = true
    if (!courseId) {
      setGroups([])
      return
    }
    setLoadingCatalog(true)
    activityCatalogService
      .scoringTable(courseId)
      .then((data) => active && setGroups(data))
      .catch((err: unknown) => active && setMessage(extractApiError(err)))
      .finally(() => active && setLoadingCatalog(false))
    return () => {
      active = false
    }
  }, [courseId])

  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
    } catch {
      /* ignore */
    }
  }, [draft])

  const selectedGroup = groups.find((g) => String(g.id) === draft.groupId)
  const selectableItems: ActivityItem[] = useMemo(() => {
    if (!selectedGroup) return []
    const byId = new Map(selectedGroup.activities.map((a) => [a.id, a]))
    return selectedGroup.activities
      .filter((a) => a.is_selectable)
      .map((a) => ({
        ...a,
        description:
          a.parent_item && byId.get(a.parent_item)
            ? `${byId.get(a.parent_item)!.description} — ${a.description}`
            : a.description,
      }))
  }, [selectedGroup])

  const selectedItem = selectableItems.find((i) => String(i.id) === draft.activityItemId)

  const derivedSemester = useMemo(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.endDate)) return ''
    const [year, month] = draft.endDate.split('-')
    return `${year}.${Number(month) <= 6 ? 1 : 2}`
  }, [draft.endDate])

  const estimatedPoints = useMemo(() => {
    if (!selectedItem?.points_per_unit) return null
    const qty = Number(draft.quantity)
    if (!Number.isFinite(qty) || qty <= 0) return null
    const raw = qty * Number(selectedItem.points_per_unit)
    const cap = selectedItem.effective_max_points_semester
      ? Number(selectedItem.effective_max_points_semester)
      : null
    return {
      raw: raw.toFixed(2),
      effective: (cap !== null ? Math.min(raw, cap) : raw).toFixed(2),
      capped: cap !== null && raw > cap,
      cap: cap?.toFixed(2) ?? null,
    }
  }, [selectedItem, draft.quantity])

  function clearDraft() {
    setDraft(emptyDraft)
    setFile(null)
    setErrors({})
    setMessage('')
    localStorage.removeItem(DRAFT_KEY)
    const input = document.getElementById('proof-file') as HTMLInputElement | null
    if (input) input.value = ''
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage('')
    setErrors({})

    const parsed = submissionSchema.safeParse({
      enrollment: draft.enrollmentId,
      activity_item: draft.activityItemId,
      description: draft.description,
      activity_start_date: draft.startDate,
      activity_end_date: draft.endDate,
      declared_quantity: draft.quantity,
      file,
      requireFile: true,
    })

    if (!parsed.success) {
      const map: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'form')
        if (!map[key]) map[key] = issue.message
      }
      setErrors(map)
      return
    }

    setSending(true)
    try {
      await submissionService.create({
        enrollment: Number(parsed.data.enrollment),
        activity_item: Number(parsed.data.activity_item),
        description: parsed.data.description,
        activity_start_date: parsed.data.activity_start_date,
        activity_end_date: parsed.data.activity_end_date,
        declared_quantity: parsed.data.declared_quantity,
        file: parsed.data.file!,
      })
      clearDraft()
      navigate('/atividades')
    } catch (err: unknown) {
      setMessage(extractApiError(err))
    } finally {
      setSending(false)
    }
  }

  return (
    <AppLayout>
      <section className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-utfpr-black">Enviar atividade complementar</h1>
          <p className="mt-2 text-siac-muted">
            Selecione o Grupo e a Modalidade da Tabela de Pontuação do seu curso.
          </p>
        </div>

        {!loading && enrollments.length === 0 && (
          <Alert variant="warning">
            Você não possui matrícula ativa disponível. Solicite o vínculo ao docente responsável (PRAC)
            ou à coordenação do curso.
          </Alert>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-siac-border bg-white p-4">
          <span className="flex items-center gap-2 text-sm text-siac-muted">
            <Save size={18} aria-hidden="true" /> Rascunho salvo localmente (exceto anexo).
          </span>
          <Button type="button" variant="outline" size="sm" onClick={clearDraft}>
            <Trash2 size={15} aria-hidden="true" /> Limpar rascunho
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardList size={20} aria-hidden="true" /> Dados da solicitação
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} noValidate className="space-y-5">
              <div>
                <Label htmlFor="enrollment">Matrícula ativa / Curso</Label>
                <Select
                  id="enrollment"
                  value={draft.enrollmentId}
                  disabled={loading || enrollments.length === 0}
                  onChange={(e) =>
                    setDraft((p) => ({
                      ...p,
                      enrollmentId: e.target.value,
                      groupId: '',
                      activityItemId: '',
                    }))
                  }
                >
                  <option value="">Selecione sua matrícula</option>
                  {enrollments.map((enr) => (
                    <option key={enr.id} value={enr.id}>
                      {enr.course_name} ({enr.course_code}) — ingresso{' '}
                      {enr.enrollment_date.split('-').reverse().join('/')}
                    </option>
                  ))}
                </Select>
                {errors.enrollment && <p className="mt-1 text-xs text-red-700">{errors.enrollment}</p>}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="group">Grupo da Tabela de Pontuação</Label>
                  <Select
                    id="group"
                    value={draft.groupId}
                    disabled={!selectedEnrollment || loadingCatalog}
                    onChange={(e) =>
                      setDraft((p) => ({ ...p, groupId: e.target.value, activityItemId: '' }))
                    }
                  >
                    <option value="">{loadingCatalog ? 'Carregando...' : 'Selecione o Grupo'}</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        Grupo {g.group_number} — {g.title}
                      </option>
                    ))}
                  </Select>
                </div>

                <div>
                  <Label htmlFor="activity_item">Item / Modalidade</Label>
                  <Select
                    id="activity_item"
                    value={draft.activityItemId}
                    disabled={!selectedGroup}
                    onChange={(e) => setDraft((p) => ({ ...p, activityItemId: e.target.value }))}
                  >
                    <option value="">Selecione a modalidade</option>
                    {selectableItems.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.code} — {item.description}
                      </option>
                    ))}
                  </Select>
                  {errors.activity_item && (
                    <p className="mt-1 text-xs text-red-700">{errors.activity_item}</p>
                  )}
                </div>
              </div>

              {selectedItem && (
                <Alert variant="info">
                  <strong>Regra da modalidade:</strong> {selectedItem.points_per_unit} ponto(s) por{' '}
                  <strong>{selectedItem.unit_name}</strong> | Teto semestral:{' '}
                  <strong>
                    {selectedItem.effective_max_points_semester
                      ? `${selectedItem.effective_max_points_semester} pts/semestre`
                      : 'Sem limite semestral'}
                  </strong>
                  <br />
                  <strong>Comprovação exigida:</strong> {selectedItem.required_proof_description}
                </Alert>
              )}

              <div>
                <Label htmlFor="description">Descrição da atividade</Label>
                <Textarea
                  id="description"
                  rows={3}
                  value={draft.description}
                  onChange={(e) => setDraft((p) => ({ ...p, description: e.target.value }))}
                  placeholder="Descreva o evento, curso ou atividade realizada."
                />
                {errors.description && <p className="mt-1 text-xs text-red-700">{errors.description}</p>}
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <Label htmlFor="startDate">Data de início</Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={draft.startDate}
                    onChange={(e) => setDraft((p) => ({ ...p, startDate: e.target.value }))}
                  />
                  {errors.activity_start_date && (
                    <p className="mt-1 text-xs text-red-700">{errors.activity_start_date}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="endDate">Data de término</Label>
                  <Input
                    id="endDate"
                    type="date"
                    min={draft.startDate || undefined}
                    value={draft.endDate}
                    onChange={(e) => setDraft((p) => ({ ...p, endDate: e.target.value }))}
                  />
                  {errors.activity_end_date && (
                    <p className="mt-1 text-xs text-red-700">{errors.activity_end_date}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="quantity">
                    Quantidade ({selectedItem?.unit_name ?? 'unidade'})
                  </Label>
                  <Input
                    id="quantity"
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={draft.quantity}
                    onChange={(e) => setDraft((p) => ({ ...p, quantity: e.target.value }))}
                  />
                  {errors.declared_quantity && (
                    <p className="mt-1 text-xs text-red-700">{errors.declared_quantity}</p>
                  )}
                </div>
              </div>

              {(derivedSemester || estimatedPoints) && (
                <div className="rounded-lg border border-siac-border bg-gray-50 p-4 text-sm">
                  {derivedSemester && (
                    <p>
                      Semestre de referência calculado: <strong>{derivedSemester}</strong>
                    </p>
                  )}
                  {estimatedPoints && (
                    <p className="mt-1">
                      Pontuação bruta estimada: <strong>{estimatedPoints.raw} pts</strong>
                      {estimatedPoints.capped && (
                        <span className="ml-2 text-yellow-800">
                          (limitada ao teto da modalidade: {estimatedPoints.cap} pts/semestre)
                        </span>
                      )}
                    </p>
                  )}
                </div>
              )}

              <div className="border-t border-siac-border pt-4">
                <Label htmlFor="proof-file" className="flex items-center gap-2">
                  <FileUp size={18} aria-hidden="true" /> Comprovante (PDF, JPG ou PNG até 10 MB)
                </Label>
                <Input
                  id="proof-file"
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
                {errors.file && <p className="mt-1 text-xs text-red-700">{errors.file}</p>}
                <FilePreview file={file} />
              </div>

              {message && <Alert variant="danger">{message}</Alert>}

              <div className="flex flex-wrap justify-end gap-3 border-t border-siac-border pt-4">
                <Button type="button" variant="outline" asChild>
                  <Link to="/atividades">Cancelar</Link>
                </Button>
                <Button type="submit" disabled={sending || !selectedEnrollment || !selectedItem}>
                  {sending ? 'Enviando...' : 'Enviar atividade'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </section>
    </AppLayout>
  )
}
