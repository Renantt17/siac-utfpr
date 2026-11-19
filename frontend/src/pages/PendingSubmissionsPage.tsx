
import { useEffect, useState } from 'react'
import {
  ClipboardCheck,
  RefreshCw,
  FileCheck2,
} from 'lucide-react'

import AppLayout from '../components/layout/AppLayout'
import EvaluationForm from '../components/evaluation/EvaluationForm'
import evaluationService, {
  type PendingSubmission,
} from '../services/evaluationService'

function formatDate(value: string): string {
  if (!value) return '—'

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'UTC',
  }).format(date)
}

export default function PendingSubmissionsPage() {
  const [submissions, setSubmissions] = useState<PendingSubmission[]>([])
  const [selectedSubmission, setSelectedSubmission] =
    useState<PendingSubmission | null>(null)

  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let active = true

    async function loadPending() {
      try {
        const data = await evaluationService.listPending()

        if (active) {
          setSubmissions(data)
          setError(null)
        }
      } catch {
        if (active) {
          setError(
            'Não foi possível carregar as atividades pendentes.'
          )
        }
      } finally {
        if (active) setIsLoading(false)
      }
    }

    void loadPending()

    return () => {
      active = false
    }
  }, [reloadKey])

  function handleRefresh() {
    setIsLoading(true)
    setReloadKey((current) => current + 1)
  }

  function handleEvaluationSuccess() {
    setSelectedSubmission(null)
    handleRefresh()
  }

  return (
    <AppLayout>
      <section className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-utfpr-black">
              Atividades pendentes
            </h1>
            <p className="mt-2 text-siac-muted">
              Consulte e avalie as atividades complementares
              enviadas pelos estudantes.
            </p>
          </div>

          <button
            type="button"
            onClick={handleRefresh}
            disabled={isLoading}
            className="inline-flex items-center gap-2 rounded-lg border border-siac-border bg-white px-4 py-3 text-sm font-semibold hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw size={18} aria-hidden="true" />
            Atualizar
          </button>
        </div>

        {selectedSubmission && (
          <EvaluationForm
            key={selectedSubmission.public_id}
            submission={selectedSubmission}
            onSuccess={handleEvaluationSuccess}
            onCancel={() => setSelectedSubmission(null)}
          />
        )}

        <div className="overflow-hidden rounded-xl border border-siac-border bg-white shadow-sm">
          <div className="flex items-center gap-3 border-b border-siac-border p-5">
            <ClipboardCheck size={22} aria-hidden="true" />
            <h2 className="text-lg font-semibold">
              Solicitações aguardando análise
            </h2>
          </div>

          {isLoading ? (
            <p role="status" className="p-6 text-siac-muted">
              Carregando solicitações...
            </p>
          ) : error ? (
            <p role="alert" className="p-6 text-red-700">
              {error}
            </p>
          ) : submissions.length === 0 ? (
            <div className="p-10 text-center">
              <ClipboardCheck
                size={40}
                className="mx-auto mb-4 text-gray-400"
                aria-hidden="true"
              />
              <p className="font-semibold">
                Nenhuma atividade pendente
              </p>
              <p className="mt-2 text-sm text-siac-muted">
                Não há solicitações aguardando sua avaliação
                neste momento.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-gray-700">
                  <tr>
                    <th scope="col" className="px-5 py-4">
                      Estudante
                    </th>
                    <th scope="col" className="px-5 py-4">
                      Curso
                    </th>
                    <th scope="col" className="px-5 py-4">
                      Atividade
                    </th>
                    <th scope="col" className="px-5 py-4">
                      Semestre
                    </th>
                    <th scope="col" className="px-5 py-4">
                      Envio
                    </th>
                    <th scope="col" className="px-5 py-4">
                      Ação
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-siac-border">
                  {submissions.map((submission) => (
                    <tr key={submission.public_id}>
                      <td className="px-5 py-4 font-medium">
                        {submission.student}
                      </td>

                      <td className="px-5 py-4">
                        {submission.course}
                      </td>

                      <td className="px-5 py-4">
                        <span className="font-medium">
                          {submission.activity_code}
                        </span>
                        <p className="mt-1 text-siac-muted">
                          {submission.activity}
                        </p>
                      </td>

                      <td className="px-5 py-4">
                        {submission.semester}
                      </td>

                      <td className="px-5 py-4">
                        {formatDate(submission.created_at)}
                      </td>

                      <td className="px-5 py-4">
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedSubmission(submission)
                          }
                          className="inline-flex items-center gap-2 rounded-lg bg-utfpr-yellow px-4 py-2 font-semibold text-utfpr-black hover:brightness-95"
                        >
                          <FileCheck2 size={16} aria-hidden="true" />
                          Avaliar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </AppLayout>
  )
}
