import { useCallback, useEffect, useState } from 'react'
import { ClipboardCheck, FileCheck2, RefreshCw } from 'lucide-react'

import AppLayout from '../components/layout/AppLayout'
import EvaluationForm from '../components/evaluation/EvaluationForm'
import evaluationService from '../services/evaluationService'
import type { Submission } from '../services/submissionService'
import { Alert, Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs'

export default function PendingSubmissionsPage() {
  const [statusTab, setStatusTab] = useState('PENDING')
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [selected, setSelected] = useState<Submission | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setSubmissions(await evaluationService.listByStatus(statusTab))
      setError('')
    } catch {
      setError('Não foi possível carregar as submissões.')
    } finally {
      setLoading(false)
    }
  }, [statusTab])

  useEffect(() => {
    void load()
  }, [load])

  function handleSuccess() {
    setSelected(null)
    setSuccess('Avaliação registrada com sucesso na auditoria!')
    void load()
  }

  return (
    <AppLayout>
      <section className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-utfpr-black">Fila de avaliação PRAC</h1>
            <p className="mt-2 text-siac-muted">
              Analise comprovantes, aprove com ou sem ajustes, solicite correções ou indefira.
            </p>
          </div>
          <Button type="button" variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={16} aria-hidden="true" /> Atualizar
          </Button>
        </div>

        <Tabs value={statusTab} onValueChange={setStatusTab}>
          <TabsList>
            <TabsTrigger value="PENDING">Pendentes</TabsTrigger>
            <TabsTrigger value="CORRECTION_REQUESTED">Em Correção</TabsTrigger>
            <TabsTrigger value="APPROVED">Aprovadas</TabsTrigger>
            <TabsTrigger value="APPROVED_WITH_ADJUSTMENTS">Com Ajustes</TabsTrigger>
            <TabsTrigger value="REJECTED">Indeferidas</TabsTrigger>
          </TabsList>
        </Tabs>

        {success && <Alert variant="success">{success}</Alert>}
        {error && <Alert variant="danger">{error}</Alert>}

        {selected && (
          <EvaluationForm
            key={selected.public_id}
            submission={selected}
            onSuccess={handleSuccess}
            onCancel={() => setSelected(null)}
          />
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardCheck size={20} aria-hidden="true" /> Submissões ({submissions.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <p role="status" className="p-6 text-siac-muted">
                Carregando fila...
              </p>
            ) : submissions.length === 0 ? (
              <p className="p-8 text-center text-siac-muted">Nenhuma submissão nesta fila.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 text-gray-700">
                    <tr>
                      <th scope="col" className="px-4 py-3">Estudante</th>
                      <th scope="col" className="px-4 py-3">Curso / Item</th>
                      <th scope="col" className="px-4 py-3">Semestre</th>
                      <th scope="col" className="px-4 py-3">Prévia / Aprovado</th>
                      <th scope="col" className="px-4 py-3">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-siac-border">
                    {submissions.map((sub) => (
                      <tr key={sub.public_id}>
                        <td className="px-4 py-3">
                          <p className="font-medium">{sub.student}</p>
                          <p className="text-xs text-siac-muted">RA: {sub.student_institutional_id}</p>
                        </td>
                        <td className="px-4 py-3">
                          <p>{sub.course}</p>
                          <p className="text-xs text-siac-muted">
                            G{sub.group_number} / {sub.activity_code} — {sub.description}
                          </p>
                        </td>
                        <td className="px-4 py-3">{sub.semester}</td>
                        <td className="px-4 py-3">
                          <Badge variant="default">
                            {sub.approved_points ?? sub.calculated_points} pts
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Button type="button" size="sm" onClick={() => setSelected(sub)}>
                            <FileCheck2 size={15} aria-hidden="true" />{' '}
                            {sub.status === 'PENDING' ? 'Avaliar' : 'Revisar parecer'}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </AppLayout>
  )
}
