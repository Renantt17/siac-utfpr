
import { useEffect, useState } from 'react'
import { Award, BookOpen, CheckCircle2 } from 'lucide-react'

import AppLayout from '../components/layout/AppLayout'
import homologationService, {
  type HomologationSummary,
} from '../services/homologationService'

function formatPoints(value: string): string {
  const number = Number(value)

  if (!Number.isFinite(number)) return '—'

  return new Intl.NumberFormat('pt-BR', {
    maximumFractionDigits: 2,
  }).format(number)
}

function calculateProgress(
  approved: string,
  required: string
): number {
  const approvedPoints = Number(approved)
  const requiredPoints = Number(required)

  if (
    !Number.isFinite(approvedPoints) ||
    !Number.isFinite(requiredPoints) ||
    requiredPoints <= 0
  ) {
    return 0
  }

  return Math.min(
    100,
    Math.max(0, (approvedPoints / requiredPoints) * 100)
  )
}

export default function ScorePage() {
  const [summaries, setSummaries] = useState<HomologationSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  async function handleDownload(publicId: string) {
    setDownloadError(null)
    setDownloadingId(publicId)
    try {
      await homologationService.downloadReport(publicId)
    } catch {
      setDownloadError('Não foi possível baixar o relatório de homologação.')
    } finally {
      setDownloadingId(null)
    }
  }

  useEffect(() => {
    let active = true

    async function loadScores() {
      try {
        const data = await homologationService.getSummary()

        if (active) setSummaries(data)
      } catch {
        if (active) {
          setError('Não foi possível carregar sua pontuação.')
        }
      } finally {
        if (active) setIsLoading(false)
      }
    }

    void loadScores()

    return () => {
      active = false
    }
  }, [])

  return (
    <AppLayout>
      <section className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-utfpr-black">
            Minha pontuação
          </h1>
          <p className="mt-2 text-siac-muted">
            Acompanhe seus pontos aprovados e os requisitos
            de atividades complementares.
          </p>
        </div>

        {downloadError && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
            {downloadError}
          </p>
        )}

        {isLoading ? (
          <p role="status" className="text-siac-muted">
            Carregando pontuação...
          </p>
        ) : error ? (
          <div
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 p-5 text-red-700"
          >
            {error}
          </div>
        ) : summaries.length === 0 ? (
          <div className="rounded-xl border border-siac-border bg-white p-8 text-center shadow-sm">
            <BookOpen
              size={40}
              className="mx-auto mb-4 text-gray-400"
              aria-hidden="true"
            />
            <h2 className="font-semibold text-utfpr-black">
              Nenhuma matrícula encontrada
            </h2>
            <p className="mt-2 text-sm text-siac-muted">
              Ainda não há informações de pontuação disponíveis
              para sua conta.
            </p>
          </div>
        ) : (
          summaries.map((summary) => (
            <div
              key={summary.enrollment_id}
              className="space-y-6"
            >
              <div className="rounded-xl border border-siac-border bg-white p-6 shadow-sm">
                <div className="mb-5 flex items-center gap-3">
                  <Award size={24} aria-hidden="true" />
                  <div>
                    <h2 className="text-xl font-bold">
                      {summary.course}
                    </h2>
                    <p className="text-sm text-siac-muted">
                      Resumo da pontuação
                    </p>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-lg bg-gray-50 p-5">
                    <p className="text-sm text-siac-muted">
                      Pontos aprovados
                    </p>
                    <p className="mt-2 text-3xl font-bold">
                      {formatPoints(summary.total_approved_points)}
                    </p>
                  </div>

                  <div className="rounded-lg bg-yellow-50 p-5">
                    <p className="text-sm text-gray-700">
                      Mínimo exigido
                    </p>
                    <p className="mt-2 text-3xl font-bold">
                      {formatPoints(summary.required_min_total_points)}
                    </p>
                  </div>
                </div>

                <div className="mt-6">
                  <div className="mb-2 flex justify-between gap-4 text-sm">
                    <span className="font-medium">
                      Progresso geral
                    </span>
                    <span className="text-siac-muted">
                      {Math.round(
                        calculateProgress(
                          summary.total_approved_points,
                          summary.required_min_total_points
                        )
                      )}%
                    </span>
                  </div>

                  <div
                    role="progressbar"
                    aria-label={`Progresso geral de ${summary.course}`}
                    aria-valuenow={Math.round(
                      calculateProgress(
                        summary.total_approved_points,
                        summary.required_min_total_points
                      )
                    )}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    className="h-3 overflow-hidden rounded-full bg-gray-200"
                  >
                    <div
                      className="h-full rounded-full bg-utfpr-yellow"
                      style={{
                        width: `${calculateProgress(
                          summary.total_approved_points,
                          summary.required_min_total_points
                        )}%`,
                      }}
                    />
                  </div>

                  <p className="mt-3 flex items-center gap-2 text-sm">
                    {summary.minimum_reached ? (
                      <>
                        <CheckCircle2
                          size={18}
                          className="text-green-700"
                          aria-hidden="true"
                        />
                        Mínimo geral atingido
                      </>
                    ) : (
                      'Mínimo geral ainda não atingido'
                    )}
                  </p>
                </div>
              </div>

              {summary.homologation && (
                <div className="rounded-xl border border-siac-border bg-white p-6 shadow-sm">
                  <h3 className="text-lg font-bold">Homologação concluída</h3>
                  <p className="mt-2 text-sm text-siac-muted">
                    Seu relatório de homologação está disponível para download.
                  </p>
                  <button
                    type="button"
                    disabled={downloadingId === summary.homologation.public_id}
                    onClick={() => void handleDownload(summary.homologation!.public_id)}
                    className="mt-4 rounded-lg bg-utfpr-yellow px-4 py-2 font-semibold text-utfpr-black disabled:opacity-50"
                  >
                    {downloadingId === summary.homologation.public_id
                      ? 'Baixando relatório...'
                      : 'Baixar relatório PDF'}
                  </button>
                </div>
              )}

              <div className="rounded-xl border border-siac-border bg-white p-6 shadow-sm">
                <h3 className="mb-5 text-lg font-bold">
                  Pontuação por grupo
                </h3>

                {summary.groups.length === 0 ? (
                  <p className="text-sm text-siac-muted">
                    Nenhum grupo de atividades disponível.
                  </p>
                ) : (
                  <div className="space-y-6">
                    {summary.groups.map((group) => {
                      const progress = calculateProgress(
                        group.approved_points,
                        group.required_min_points
                      )

                      return (
                        <div key={group.group_id}>
                          <div className="mb-2 flex flex-wrap justify-between gap-2">
                            <h4 className="font-medium">
                              Grupo {group.group_number} — {group.title}
                            </h4>
                            <span className="text-sm text-siac-muted">
                              {formatPoints(group.approved_points)}
                              {' / '}
                              {formatPoints(group.required_min_points)} pontos
                            </span>
                          </div>

                          <div
                            role="progressbar"
                            aria-label={`Progresso do grupo ${group.group_number}`}
                            aria-valuenow={Math.round(progress)}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            className="h-2.5 overflow-hidden rounded-full bg-gray-200"
                          >
                            <div
                              className="h-full rounded-full bg-utfpr-yellow"
                              style={{ width: `${progress}%` }}
                            />
                          </div>

                          <p className="mt-2 text-xs text-siac-muted">
                            {group.minimum_reached
                              ? 'Mínimo do grupo atingido'
                              : 'Mínimo do grupo ainda não atingido'}
                          </p>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </section>
    </AppLayout>
  )
}