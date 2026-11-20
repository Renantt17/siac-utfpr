import { useCallback, useEffect, useState } from 'react'
import { Award, CheckCircle2, FileDown, RefreshCw } from 'lucide-react'
import axios from 'axios'

import AppLayout from '../components/layout/AppLayout'
import homologationService, { type HomologationCandidate } from '../services/homologationService'
import { Alert, Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'

export default function HomologationsPage() {
  const [candidates, setCandidates] = useState<HomologationCandidate[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setCandidates(await homologationService.listCandidates())
      setError('')
    } catch {
      setError('Não foi possível carregar os estudantes para homologação.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function handleFinalize(enrollmentId: number, studentName: string) {
    if (!window.confirm(`Confirmar a homologação final de ${studentName}?`)) return
    setBusyId(enrollmentId)
    setError('')
    setSuccess('')
    try {
      await homologationService.finalize(enrollmentId)
      setSuccess(`Homologação final de ${studentName} registrada com sucesso!`)
      await load()
    } catch (err) {
      if (axios.isAxiosError(err) && typeof err.response?.data?.detail === 'string') {
        setError(err.response.data.detail)
      } else {
        setError('Não foi possível finalizar a homologação.')
      }
    } finally {
      setBusyId(null)
    }
  }

  return (
    <AppLayout>
      <section className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-utfpr-black">Homologação de Atividades</h1>
            <p className="mt-2 text-siac-muted">
              Emita o Relatório Final em PDF quando o estudante atingir todos os mínimos do curso e grupos.
            </p>
          </div>
          <Button type="button" variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={16} aria-hidden="true" /> Atualizar
          </Button>
        </div>

        {success && <Alert variant="success">{success}</Alert>}
        {error && <Alert variant="danger">{error}</Alert>}

        {loading ? (
          <p role="status">Carregando matrículas...</p>
        ) : candidates.length === 0 ? (
          <Card>
            <CardContent>Nenhuma matrícula vinculada aos seus cursos.</CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {candidates.map((c) => (
              <Card key={c.enrollment_id}>
                <CardHeader className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <Award size={20} aria-hidden="true" />
                    <div>
                      <CardTitle>
                        {c.student_name} ({c.student_institutional_id})
                      </CardTitle>
                      <p className="text-xs text-siac-muted">
                        {c.course_name} ({c.course_code}) • Status: {c.enrollment_status}
                      </p>
                    </div>
                  </div>
                  {c.homologation ? (
                    <Badge variant="success">Homologado</Badge>
                  ) : c.eligible_for_homologation ? (
                    <Badge variant="warning">Apto para Homologação</Badge>
                  ) : (
                    <Badge variant="default">Em andamento</Badge>
                  )}
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex flex-wrap gap-4">
                    <span>
                      <strong>Total aprovado:</strong> {c.total_approved_points} /{' '}
                      {c.required_min_total_points} pts
                    </span>
                    <span>
                      <strong>Pendentes/Em correção:</strong>{' '}
                      {c.pending_submissions + c.correction_submissions}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {c.groups.map((g) => (
                      <Badge key={g.group_id} variant={g.minimum_reached ? 'success' : 'default'}>
                        G{g.group_number}: {g.approved_points}/{g.required_min_points} pts
                      </Badge>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-3 pt-2">
                    {c.can_finalize && !c.homologation && (
                      <Button
                        type="button"
                        disabled={busyId === c.enrollment_id}
                        onClick={() => void handleFinalize(c.enrollment_id, c.student_name)}
                      >
                        <CheckCircle2 size={16} aria-hidden="true" />
                        {busyId === c.enrollment_id ? 'Homologando...' : 'Homologar e gerar PDF'}
                      </Button>
                    )}
                    {c.homologation && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => void homologationService.downloadReport(c.homologation!.public_id)}
                      >
                        <FileDown size={16} aria-hidden="true" /> Baixar PDF Homologado
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </AppLayout>
  )
}
