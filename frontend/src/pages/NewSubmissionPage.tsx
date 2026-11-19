import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { AlertCircle, ClipboardList, FileUp, Save, Trash2 } from 'lucide-react'
import AppLayout from '../components/layout/AppLayout'
import FilePreview from '../components/submission/FilePreview'
import activityCatalogService, {
  type ActivityItem,
  type Enrollment,
} from '../services/activityCatalogService'
import submissionService from '../services/submissionService'
import { validateSubmission, type SubmissionFormErrors } from '../utils/submissionValidation'

const DRAFT_KEY = 'siac-activity-draft'
const semesters = Array.from({ length: 4 }, (_, i) => {
  const year = new Date().getFullYear() - i
  return [`${year}-2`, `${year}-1`]
}).flat()

interface Draft {
  description: string
  startDate: string
  endDate: string
  semester: string
  quantity: number
  enrollmentId: string
  activityItemId: string
}

const emptyDraft: Draft = {
  description: '', startDate: '', endDate: '', semester: '', quantity: 1,
  enrollmentId: '', activityItemId: '',
}

function loadDraft(): Draft {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return emptyDraft
    const saved = JSON.parse(raw) as Partial<Draft>
    return {
      description: typeof saved.description === 'string' ? saved.description : '',
      startDate: typeof saved.startDate === 'string' ? saved.startDate : '',
      endDate: typeof saved.endDate === 'string' ? saved.endDate : '',
      semester: typeof saved.semester === 'string'
        ? saved.semester.replace('.', '-') : '',
      quantity: Number.isInteger(saved.quantity) ? saved.quantity! : 1,
      enrollmentId: typeof saved.enrollmentId === 'string' ? saved.enrollmentId : '',
      activityItemId: typeof saved.activityItemId === 'string' ? saved.activityItemId : '',
    }
  } catch { return emptyDraft }
}

function apiError(error: unknown): string {
  if (!axios.isAxiosError(error)) return 'Ocorreu um erro inesperado.'
  const status = error.response?.status
  const data: unknown = error.response?.data
  if (status === 401) return 'Sua sessão expirou. Entre novamente no sistema.'
  if (status === 403) return 'Você não tem permissão para realizar esta operação.'
  if (status === 404) return 'Recurso não encontrado. Atualize a página.'
  if (status === 409) return 'Conflito ao enviar a atividade. Verifique se ela já foi registrada.'
  if (status === 400 && data && typeof data === 'object') {
    return Object.entries(data as Record<string, unknown>)
      .map(([field, value]) => `${field}: ${Array.isArray(value) ? value.join(', ') : String(value)}`)
      .join(' | ')
  }
  return 'Não foi possível concluir a operação. Verifique a conexão e tente novamente.'
}

export default function NewSubmissionPage() {
  const navigate = useNavigate()
  const [draft, setDraft] = useState<Draft>(loadDraft)
  const [file, setFile] = useState<File | null>(null)
  const [enrollments, setEnrollments] = useState<Enrollment[]>([])
  const [items, setItems] = useState<ActivityItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingItems, setLoadingItems] = useState(false)
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState('')
  const [errors, setErrors] = useState<SubmissionFormErrors>({})

  useEffect(() => {
    let active = true
    activityCatalogService.enrollments().then((data) => {
      if (!active) return
      const valid = data.filter((entry) => entry.status === 'ACTIVE')
      setEnrollments(valid)
      if (draft.enrollmentId && !valid.some((entry) => String(entry.id) === draft.enrollmentId)) {
        setDraft((previous) => ({ ...previous, enrollmentId: '', activityItemId: '' }))
      }
    }).catch((error: unknown) => { if (active) setMessage(apiError(error)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const selectedEnrollment = enrollments.find((entry) => String(entry.id) === draft.enrollmentId)
  const courseId = selectedEnrollment?.course

  useEffect(() => {
    let active = true
    if (courseId === undefined) { setItems([]); return }
    setLoadingItems(true)
    activityCatalogService.items(courseId).then((data) => {
      if (!active) return
      setItems(data)
      if (draft.activityItemId && !data.some((item) => String(item.id) === draft.activityItemId)) {
        setDraft((previous) => ({ ...previous, activityItemId: '' }))
      }
    }).catch((error: unknown) => { if (active) setMessage(apiError(error)) })
      .finally(() => { if (active) setLoadingItems(false) })
    return () => { active = false }
  }, [courseId])

  useEffect(() => {
    try {
      if (JSON.stringify(draft) === JSON.stringify(emptyDraft)) localStorage.removeItem(DRAFT_KEY)
      else localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
    } catch { /* armazenamento indisponível */ }
  }, [draft])

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((previous) => ({ ...previous, [key]: value }))
    setErrors({})
    setMessage('')
  }

  function clearDraft() {
    setDraft({ ...emptyDraft })
    setFile(null)
    setErrors({})
    setMessage('')
    localStorage.removeItem(DRAFT_KEY)
    const input = document.getElementById('file') as HTMLInputElement | null
    if (input) input.value = ''
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage('')
    const validation = validateSubmission({
      description: draft.description, startDate: draft.startDate,
      endDate: draft.endDate, semester: draft.semester,
      quantity: draft.quantity, file,
    })
    setErrors(validation)
    if (Object.keys(validation).length) return
    if (!selectedEnrollment || !items.some((item) => String(item.id) === draft.activityItemId)) {
      setMessage('Selecione uma matrícula ativa e um tipo de atividade válido.')
      return
    }
    if (!file) return
    setSending(true)
    try {
      await submissionService.create({
        enrollment: selectedEnrollment.id,
        activity_item: Number(draft.activityItemId),
        description: draft.description.trim(),
        activity_start_date: draft.startDate,
        activity_end_date: draft.endDate,
        semester: draft.semester,
        declared_quantity: draft.quantity,
        file,
      })
      clearDraft()
      navigate('/atividades')
    } catch (error) {
      setMessage(apiError(error))
    } finally { setSending(false) }
  }

  const inputClass = 'mt-2 w-full rounded-lg border border-siac-border bg-white px-4 py-3 text-sm text-utfpr-black focus:outline-none focus:ring-2 focus:ring-utfpr-yellow disabled:bg-gray-100'
  const selectedItem = items.find((item) => String(item.id) === draft.activityItemId)

  return (
    <AppLayout>
      <section className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-utfpr-black">Enviar atividade</h1>
          <p className="mt-2 text-siac-muted">Cadastre sua atividade complementar e anexe o comprovante.</p>
        </div>

        {loading ? <p className="rounded-lg bg-white p-4">Carregando matrículas...</p> :
          enrollments.length === 0 && (
            <div role="status" className="flex gap-3 rounded-lg border border-yellow-300 bg-yellow-50 p-4 text-sm">
              <AlertCircle size={20} className="shrink-0" />
              <p>Você não possui matrícula ativa disponível para envio. A matrícula deve ser cadastrada por um professor ou coordenador do SIAC.</p>
            </div>
          )}

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-siac-border bg-white p-4">
          <span className="flex items-center gap-2 text-sm text-siac-muted"><Save size={18} /> Rascunho salvo neste navegador (sem o arquivo).</span>
          <button type="button" onClick={clearDraft} className="flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50">
            <Trash2 size={16} /> Limpar rascunho
          </button>
        </div>

        <form onSubmit={submit} noValidate className="space-y-6 rounded-xl border border-siac-border bg-white p-6 shadow-sm">
          <h2 className="flex items-center gap-3 border-b border-siac-border pb-4 text-lg font-semibold"><ClipboardList size={22} /> Dados da atividade</h2>

          <div>
            <label htmlFor="enrollment" className="text-sm font-medium">Matrícula ativa / curso</label>
            <select id="enrollment" value={draft.enrollmentId} disabled={loading || enrollments.length === 0}
              onChange={(event) => setDraft((previous) => ({ ...previous, enrollmentId: event.target.value, activityItemId: '' }))}
              required className={inputClass}>
              <option value="">Selecione sua matrícula</option>
              {enrollments.map((entry) => <option key={entry.id} value={entry.id}>{entry.course_name} ({entry.course_code}) — {entry.campus_acronym}</option>)}
            </select>
          </div>

          <div>
            <label htmlFor="activityItem" className="text-sm font-medium">Tipo de atividade</label>
            <select id="activityItem" value={draft.activityItemId} disabled={!selectedEnrollment || loadingItems}
              onChange={(event) => update('activityItemId', event.target.value)} required className={inputClass}>
              <option value="">{loadingItems ? 'Carregando atividades...' : 'Selecione o tipo de atividade'}</option>
              {items.map((item) => <option key={item.id} value={item.id}>{item.code} — {item.description}</option>)}
            </select>
            {selectedEnrollment && !loadingItems && items.length === 0 && <p className="mt-2 text-sm text-siac-muted">Nenhum tipo de atividade disponível para este curso.</p>}
            {selectedItem && <p className="mt-2 text-sm text-siac-muted">
              {selectedItem.points_per_unit} ponto(s) por {selectedItem.unit_name}.
              {selectedItem.required_proof_description && ` Comprovante: ${selectedItem.required_proof_description}`}
            </p>}
          </div>

          <div>
            <label htmlFor="description" className="text-sm font-medium">Descrição da atividade</label>
            <textarea id="description" value={draft.description} onChange={(event) => update('description', event.target.value)} rows={4} required
              placeholder="Descreva a atividade complementar realizada." className={inputClass} />
            {errors.description && <p className="mt-2 text-sm text-red-700">{errors.description}</p>}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="startDate" className="text-sm font-medium">Data de início</label>
              <input id="startDate" type="date" value={draft.startDate} onChange={(event) => update('startDate', event.target.value)} required className={inputClass} />
              {errors.startDate && <p className="mt-2 text-sm text-red-700">{errors.startDate}</p>}
            </div>
            <div>
              <label htmlFor="endDate" className="text-sm font-medium">Data de término</label>
              <input id="endDate" type="date" min={draft.startDate || undefined} value={draft.endDate} onChange={(event) => update('endDate', event.target.value)} required className={inputClass} />
              {errors.endDate && <p className="mt-2 text-sm text-red-700">{errors.endDate}</p>}
            </div>
            <div>
              <label htmlFor="semester" className="text-sm font-medium">Semestre letivo</label>
              <select id="semester" value={draft.semester} onChange={(event) => update('semester', event.target.value)} required className={inputClass}>
                <option value="">Selecione o semestre</option>
                {semesters.map((semester) => <option key={semester} value={semester}>{semester.replace('-', '.')}</option>)}
              </select>
              {errors.semester && <p className="mt-2 text-sm text-red-700">{errors.semester}</p>}
            </div>
            <div>
              <label htmlFor="quantity" className="text-sm font-medium">Quantidade declarada</label>
              <input id="quantity" type="number" min={1} step={1} value={draft.quantity} onChange={(event) => update('quantity', Number(event.target.value))} required className={inputClass} />
              {errors.quantity && <p className="mt-2 text-sm text-red-700">{errors.quantity}</p>}
            </div>
          </div>

          <div className="border-t border-siac-border pt-6">
            <label htmlFor="file" className="flex items-center gap-2 text-sm font-medium"><FileUp size={20} /> Comprovante da atividade</label>
            <input id="file" type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setErrors({}); setMessage('') }} required
              className={`${inputClass} file:mr-4 file:rounded-md file:border-0 file:bg-yellow-100 file:px-4 file:py-2 file:font-medium`} />
            {file && <p className="mt-2 text-sm text-siac-muted">{file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)</p>}
            {errors.file && <p className="mt-2 text-sm text-red-700">{errors.file}</p>}
            <FilePreview file={file} />
          </div>

          {message && <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800"><AlertCircle size={20} className="shrink-0" />{message}</div>}
          {Object.keys(errors).length > 0 && <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800">Corrija os campos indicados antes de enviar.</div>}

          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-siac-border pt-6">
            <Link to="/atividades" className="rounded-lg border border-gray-300 px-6 py-3 font-semibold hover:bg-gray-50">Cancelar</Link>
            <button type="submit" disabled={sending || loading || loadingItems || enrollments.length === 0 || !selectedEnrollment || !selectedItem}
              className="rounded-lg bg-utfpr-yellow px-6 py-3 font-semibold text-utfpr-black hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50">
              {sending ? 'Enviando...' : 'Enviar atividade'}
            </button>
          </div>
        </form>
      </section>
    </AppLayout>
  )
}
