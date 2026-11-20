import { useCallback, useEffect, useState } from 'react'
import { Award, CheckCircle2, FileDown } from 'lucide-react'

import AppLayout from '../components/layout/AppLayout'
import homologationService, { type HomologationSummary } from '../services/homologationService'
import { Alert, Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'

function pct(approved: string, required: string): number {
  const a = Number(approved)
  const r = Number(required)
  if (!Number.isFinite(a) || !Number.isFinite(r) || r <= 0) return 0
  return Math.min(100, Math.max(0, (a / r) * 100))
}

export default function ScorePage() {
  const [summaries, setSummaries] = useState<HomologationSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setSummaries(await homologationService.getSummary())
      setError('')
    } catch {
      setError('Não foi possível carregar sua pontuação.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function handleConfirm(publicId: string) {
    setBusyId(publicId)
    setError('')
    try {
      await homologationService.confirm(publicId)
      setFeedback('Relatório Final confirmado com sucesso!')
      await load()
    } catch {
      setError('Não foi possível confirmar o relatório.')
    } finally {
      setBusyId(null)
    }
  }

  async function handleDownload(publicId: string) {
    setBusyId(publicId)
    try {
      await homologationService.downloadReport(publicId)
    } catch {
      setError('Não foi possível baixar o relatório PDF.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <AppLayout>
      <section className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-utfpr-black">Minha pontuação e extrato</h1>
          <p className="mt-2 text-siac-muted">
            Acompanhe suas metas por grupo (mín. 20 pts) e total geral (mín. 70 pts).
          </p>
        </div>

        {feedback && <Alert variant="success">{feedback}</Alert>}
        {error && <Alert variant="danger">{error}</Alert>}

        {loading ? (
          <p role="status">Carregando pontuação...</p>
        ) : summaries.length === 0 ? (
          <Card>
            <CardContent>Nenhuma matrícula encontrada para sua conta.</CardContent>
          </Card>
        ) : (
          summaries.map((summary) => (
            <div key={summary.enrollment_id} className="space-y-6">
              <Card>
                <CardHeader className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <Award size={22} aria-hidden="true" />
                    <div>
                      <CardTitle>
                        {summary.course} ({summary.course_code})
                      </CardTitle>
                      <p className="text-xs text-siac-muted">
                        Situação da matrícula: {summary.enrollment_status}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="success">{summary.approved_submissions} aprovadas</Badge>
                    <Badge variant="warning">{summary.pending_submissions} pendentes</Badge>
                    <Badge variant="info">{summary.correction_submissions} correções</Badge>
                    <Badge variant="danger">{summary.rejected_submissions} indeferidas</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-lg bg-gray-50 p-4">
                      <p className="text-sm text-siac-muted">Total aprovado</p>
                      <p className="mt-1 text-3xl font-bold">{summary.total_approved_points} pts</p>
                    </div>
                    <div className="rounded-lg bg-yellow-50 p-4">
                      <p className="text-sm text-gray-700">Meta mínima do curso</p>
                      <p className="mt-1 text-3xl font-bold">{summary.required_min_total_points} pts</p>
                    </div>
                  </div>

                  <div>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="font-medium">Progresso geral</span>
                      <span>
                        {Math.round(pct(summary.total_approved_points, summary.required_min_total_points))}%
                      </span>
                    </div>
                    <div
                      role="progressbar"
                      aria-label="Progresso geral"
                      aria-valuenow={Math.round(
                        pct(summary.total_approved_points, summary.required_min_total_points)
                      )}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      className="h-3 overflow-hidden rounded-full bg-gray-200"
                    >
                      <div
                        className="h-full rounded-full bg-utfpr-yellow"
                        style={{
                          width: `${pct(summary.total_approved_points, summary.required_min_total_points)}%`,
                        }}
                      />
                    </div>
                    <p className="mt-2 flex items-center gap-2 text-sm">
                      {summary.minimum_reached ? (
                        <>
                          <CheckCircle2 size={18} className="text-green-700" aria-hidden="true" />
                          <span>
                            Todos os critérios mínimos atingidos!
                            {summary.eligible_for_homologation && ' Aguardando homologação do docente PRAC.'}
                          </span>
                        </>
                      ) : (
                        'Continue enviando atividades para atingir os mínimos em todos os grupos e no total.'
                      )}
                    </p>
                  </div>
                </CardContent>
              </Card>

              {summary.homologation && (
                <Card>
                  <CardHeader>
                    <CardTitle>Homologação Final Registrada</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <p>
                      Homologado por <strong>{summary.homologation.homologated_by_name}</strong> com{' '}
                      <strong>{summary.homologation.total_approved_points} pts</strong>.
                    </p>
                    <p className="text-siac-muted">
                      Status de sincronização externa (MVP): {summary.homologation.portal_sync_status}
                    </p>
                    <div className="flex flex-wrap gap-3">
                      {!summary.homologation.student_confirmed_at ? (
                        <Button
                          type="button"
                          disabled={busyId === summary.homologation.public_id}
                          onClick={() => void handleConfirm(summary.homologation!.public_id)}
                        >
                          Confirmar Relatório Final
                        </Button>
                      ) : (
                        <Badge variant="success">
                          Confirmado em{' '}
                          {new Date(summary.homologation.student_confirmed_at).toLocaleString('pt-BR')}
                        </Badge>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        disabled={busyId === summary.homologation.public_id}
                        onClick={() => void handleDownload(summary.homologation!.public_id)}
                      >
                        <FileDown size={16} aria-hidden="true" /> Baixar Relatório PDF
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader>
                  <CardTitle>Metas por Grupo</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {summary.groups.map((g) => {
                    const p = pct(g.approved_points, g.required_min_points)
                    return (
                      <div key={g.group_id}>
                        <div className="mb-1 flex justify-between text-sm">
                          <span className="font-medium">
                            Grupo {g.group_number} — {g.title}
                          </span>
                          <span>
                            {g.approved_points} / {g.required_min_points} pts
                          </span>
                        </div>
                        <div
                          role="progressbar"
                          aria-label={`Progresso do grupo ${g.group_number}`}
                          aria-valuenow={Math.round(p)}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          className="h-2.5 overflow-hidden rounded-full bg-gray-200"
                        >
                          <div className="h-full rounded-full bg-utfpr-yellow" style={{ width: `${p}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </CardContent>
              </Card>

              {summary.semester_extract.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Extrato por Semestre</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {summary.semester_extract.map((bucket) => (
                      <div key={bucket.semester} className="space-y-2">
                        <h3 className="font-semibold text-utfpr-black">Semestre {bucket.semester}</h3>
                        <ul className="divide-y divide-siac-border rounded-lg border border-siac-border">
                          {bucket.items.map((item) => (
                            <li
                              key={item.public_id}
                              className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm"
                            >
                              <span>
                                <strong>G{item.group_number} / {item.code}</strong> — {item.description}
                              </span>
                              <span className="font-semibold">{item.approved_points} pts</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </div>
          ))
        )}
      </section>
    </AppLayout>
  )
}
