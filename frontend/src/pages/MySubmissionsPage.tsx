import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { ClipboardList, Eye, FilePlus2, Pencil, RefreshCw, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import axios from 'axios'

import AppLayout from '../components/layout/AppLayout'
import submissionService, {
  openSubmissionFile,
  type Submission,
  type SubmissionStatus,
} from '../services/submissionService'
import { Alert, Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../components/ui/dialog'
import { Input, Label, Textarea } from '../components/ui/input'
import { Select } from '../components/ui/select'

const STATUS_META: Record<
  SubmissionStatus,
  { label: string; variant: 'warning' | 'info' | 'success' | 'danger' | 'default' }
> = {
  PENDING: { label: 'Pendente', variant: 'warning' },
  CORRECTION_REQUESTED: { label: 'Correção Solicitada', variant: 'info' },
  APPROVED: { label: 'Aprovada', variant: 'success' },
  APPROVED_WITH_ADJUSTMENTS: { label: 'Aprovada com Ajustes', variant: 'success' },
  REJECTED: { label: 'Indeferida', variant: 'danger' },
  CANCELED: { label: 'Cancelada', variant: 'default' },
}

export default function MySubmissionsPage() {
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [statusFilter, setStatusFilter] = useState('')
  const [semesterFilter, setSemesterFilter] = useState('')
  const [groupFilter, setGroupFilter] = useState('')

  const [detailTarget, setDetailTarget] = useState<Submission | null>(null)
  const [editTarget, setEditTarget] = useState<{ sub: Submission; mode: 'edit' | 'resubmit' } | null>(null)
  const [editDesc, setEditDesc] = useState('')
  const [editStart, setEditStart] = useState('')
  const [editEnd, setEditEnd] = useState('')
  const [editQty, setEditQty] = useState('')
  const [editFile, setEditFile] = useState<File | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await submissionService.list({
        status: statusFilter || undefined,
        semester: semesterFilter.trim() || undefined,
      })
      const filtered = groupFilter
        ? data.filter((s) => String(s.group_number) === groupFilter)
        : data
      setSubmissions(filtered)
      setError('')
    } catch {
      setError('Não foi possível carregar suas atividades.')
    } finally {
      setLoading(false)
    }
  }, [statusFilter, semesterFilter, groupFilter])

  useEffect(() => {
    void load()
  }, [load])

  function openEditModal(sub: Submission, mode: 'edit' | 'resubmit') {
    setEditTarget({ sub, mode })
    setEditDesc(sub.description)
    setEditStart(sub.activity_start_date)
    setEditEnd(sub.activity_end_date)
    setEditQty(sub.declared_quantity)
    setEditFile(null)
    setError('')
    setSuccess('')
  }

  async function handleSaveEdit(e: FormEvent) {
    e.preventDefault()
    if (!editTarget) return
    setSavingEdit(true)
    setError('')
    try {
      const payload = {
        description: editDesc.trim(),
        activity_start_date: editStart,
        activity_end_date: editEnd,
        declared_quantity: editQty,
        row_version: editTarget.sub.row_version,
        file: editFile,
      }
      if (editTarget.mode === 'resubmit') {
        await submissionService.resubmit(editTarget.sub.public_id, payload)
        setSuccess('Atividade corrigida e reenviada para nova avaliação.')
      } else {
        await submissionService.updatePending(editTarget.sub.public_id, payload)
        setSuccess('Submissão pendente atualizada com sucesso.')
      }
      setEditTarget(null)
      await load()
    } catch (err) {
      if (axios.isAxiosError(err) && typeof err.response?.data?.detail === 'string') {
        setError(err.response.data.detail)
      } else {
        setError('Não foi possível atualizar a submissão.')
      }
    } finally {
      setSavingEdit(false)
    }
  }

  async function handleCancel(sub: Submission) {
    if (!window.confirm('Deseja cancelar esta solicitação de atividade?')) return
    try {
      await submissionService.cancel(sub.public_id)
      setSuccess('Submissão cancelada.')
      await load()
    } catch {
      setError('Não foi possível cancelar a submissão.')
    }
  }

  return (
    <AppLayout>
      <section className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-utfpr-black">Minhas atividades</h1>
            <p className="mt-2 text-siac-muted">
              Acompanhe avaliações, pareceres docentes, correções solicitadas e ajustes.
            </p>
          </div>
          <Button asChild>
            <Link to="/atividades/nova">
              <FilePlus2 size={18} aria-hidden="true" /> Nova atividade
            </Link>
          </Button>
        </div>

        <Card>
          <CardContent className="flex flex-wrap items-end gap-4">
            <div className="w-52">
              <Label htmlFor="f-status">Situação</Label>
              <Select id="f-status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="">Todas</option>
                <option value="PENDING">Pendente</option>
                <option value="CORRECTION_REQUESTED">Correção Solicitada</option>
                <option value="APPROVED">Aprovada</option>
                <option value="APPROVED_WITH_ADJUSTMENTS">Aprovada com Ajustes</option>
                <option value="REJECTED">Indeferida</option>
                <option value="CANCELED">Cancelada</option>
              </Select>
            </div>
            <div className="w-40">
              <Label htmlFor="f-group">Grupo</Label>
              <Select id="f-group" value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)}>
                <option value="">Todos</option>
                <option value="1">Grupo 1</option>
                <option value="2">Grupo 2</option>
                <option value="3">Grupo 3</option>
              </Select>
            </div>
            <div className="w-40">
              <Label htmlFor="f-sem">Semestre (ex.: 2026.1)</Label>
              <Input
                id="f-sem"
                placeholder="AAAA.1"
                value={semesterFilter}
                onChange={(e) => setSemesterFilter(e.target.value)}
              />
            </div>
            <Button type="button" variant="outline" onClick={() => void load()}>
              <RefreshCw size={16} aria-hidden="true" /> Filtrar
            </Button>
          </CardContent>
        </Card>

        {success && <Alert variant="success">{success}</Alert>}
        {error && <Alert variant="danger">{error}</Alert>}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardList size={20} aria-hidden="true" /> Histórico de solicitações
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <p role="status" className="p-6 text-siac-muted">
                Carregando atividades...
              </p>
            ) : submissions.length === 0 ? (
              <p className="p-8 text-center text-siac-muted">Nenhuma atividade encontrada.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 text-gray-700">
                    <tr>
                      <th scope="col" className="px-4 py-3">Atividade</th>
                      <th scope="col" className="px-4 py-3">Grupo / Item</th>
                      <th scope="col" className="px-4 py-3">Semestre</th>
                      <th scope="col" className="px-4 py-3">Situação e Parecer</th>
                      <th scope="col" className="px-4 py-3">Pontos</th>
                      <th scope="col" className="px-4 py-3">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-siac-border">
                    {submissions.map((sub) => {
                      const meta = STATUS_META[sub.status] ?? { label: sub.status, variant: 'default' }
                      return (
                        <tr key={sub.public_id}>
                          <td className="px-4 py-3">
                            <p className="font-medium">{sub.description}</p>
                            <p className="text-xs text-siac-muted">{sub.course}</p>
                          </td>
                          <td className="px-4 py-3">
                            G{sub.group_number} — {sub.activity_code}
                          </td>
                          <td className="px-4 py-3">{sub.semester}</td>
                          <td className="px-4 py-3">
                            <Badge variant={meta.variant}>{meta.label}</Badge>
                            {sub.evaluator_feedback && (
                              <p className="mt-1 max-w-xs text-xs text-gray-700">
                                {sub.evaluator_feedback}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {sub.approved_points !== null
                              ? `${sub.approved_points} pts`
                              : `Est.: ${sub.calculated_points} pts`}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1.5">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setDetailTarget(sub)}
                              >
                                <Eye size={14} aria-hidden="true" /> Detalhes
                              </Button>
                              {sub.status === 'PENDING' && (
                                <>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => openEditModal(sub, 'edit')}
                                  >
                                    <Pencil size={14} aria-hidden="true" /> Editar
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="destructive"
                                    size="sm"
                                    onClick={() => void handleCancel(sub)}
                                  >
                                    <Trash2 size={14} aria-hidden="true" /> Cancelar
                                  </Button>
                                </>
                              )}
                              {sub.status === 'CORRECTION_REQUESTED' && (
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={() => openEditModal(sub, 'resubmit')}
                                >
                                  Corrigir e reenviar
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={Boolean(detailTarget)} onOpenChange={(o) => !o && setDetailTarget(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Detalhes da atividade</DialogTitle>
              <DialogDescription>{detailTarget?.description}</DialogDescription>
            </DialogHeader>
            {detailTarget && (
              <div className="space-y-4 text-sm">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="font-semibold">Item aplicado</p>
                    <p>
                      G{detailTarget.group_number} / {detailTarget.activity_code} — {detailTarget.activity}
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold">Semestre / Quantidade</p>
                    <p>
                      {detailTarget.semester} —{' '}
                      {detailTarget.validated_quantity ?? detailTarget.declared_quantity}{' '}
                      {detailTarget.applied_unit_name}
                    </p>
                  </div>
                </div>

                {detailTarget.was_adjusted && (
                  <Alert variant="warning">
                    <strong>Aprovada com Ajustes Mínimos (antes vs. depois):</strong>
                    <ul className="mt-1 list-disc pl-5">
                      <li>
                        Item: {detailTarget.original_activity_code} → {detailTarget.activity_code}
                      </li>
                      <li>
                        Semestre: {detailTarget.original_semester} → {detailTarget.semester}
                      </li>
                      <li>
                        Quantidade: {detailTarget.original_declared_quantity} →{' '}
                        {detailTarget.validated_quantity}
                      </li>
                    </ul>
                  </Alert>
                )}

                {detailTarget.evaluator_feedback && (
                  <div className="rounded-lg bg-gray-50 p-3">
                    <p className="font-semibold">Parecer do docente ({detailTarget.evaluator_name ?? 'PRAC'}):</p>
                    <p className="mt-1">{detailTarget.evaluator_feedback}</p>
                  </div>
                )}

                <Button type="button" variant="outline" onClick={() => void openSubmissionFile(detailTarget.public_id)}>
                  Abrir comprovante
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={Boolean(editTarget)} onOpenChange={(o) => !o && setEditTarget(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editTarget?.mode === 'resubmit' ? 'Corrigir e reenviar atividade' : 'Editar submissão pendente'}
              </DialogTitle>
              <DialogDescription>
                {editTarget?.sub.evaluator_feedback
                  ? `Orientação do docente: ${editTarget.sub.evaluator_feedback}`
                  : 'Atualize os dados ou substitua o comprovante.'}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={(e) => void handleSaveEdit(e)} className="space-y-4">
              <div>
                <Label htmlFor="ed-desc">Descrição</Label>
                <Textarea id="ed-desc" required value={editDesc} onChange={(e) => setEditDesc(e.target.value)} />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <Label htmlFor="ed-start">Início</Label>
                  <Input id="ed-start" type="date" required value={editStart} onChange={(e) => setEditStart(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="ed-end">Término</Label>
                  <Input id="ed-end" type="date" required value={editEnd} onChange={(e) => setEditEnd(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="ed-qty">Quantidade</Label>
                  <Input
                    id="ed-qty"
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={editQty}
                    onChange={(e) => setEditQty(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="ed-file">Substituir comprovante (opcional)</Label>
                <Input
                  id="ed-file"
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg"
                  onChange={(e) => setEditFile(e.target.files?.[0] ?? null)}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setEditTarget(null)}>
                  Fechar
                </Button>
                <Button type="submit" disabled={savingEdit}>
                  {savingEdit ? 'Salvando...' : editTarget?.mode === 'resubmit' ? 'Reenviar para avaliação' : 'Salvar alterações'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </section>
    </AppLayout>
  )
}
