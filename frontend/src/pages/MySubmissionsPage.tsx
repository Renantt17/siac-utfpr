
import { useEffect, useState } from 'react'
import { ClipboardList, FilePlus2 } from 'lucide-react'
import { Link } from 'react-router-dom'

import AppLayout from '../components/layout/AppLayout'
import submissionService, {
  type Submission,
  openSubmissionFile,
} from '../services/submissionService'

export default function MySubmissionsPage() {
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [openingFile, setOpeningFile] = useState<string | null>(null)

  async function handleOpenFile(publicId: string) {
    setFileError(null)
    setOpeningFile(publicId)
    try {
      await openSubmissionFile(publicId)
    } catch {
      setFileError('Não foi possível abrir o comprovante.')
    } finally {
      setOpeningFile(null)
    }
  }

  useEffect(() => {
    let active = true

    async function loadSubmissions() {
      try {
        const data = await submissionService.list()

        if (active) {
          setSubmissions(data)
        }
      } catch {
        if (active) {
          setError('Não foi possível carregar suas atividades.')
        }
      } finally {
        if (active) {
          setIsLoading(false)
        }
      }
    }

    void loadSubmissions()

    return () => {
      active = false
    }
  }, [])

  return (
    <AppLayout>
      <section className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-utfpr-black">
              Minhas atividades
            </h1>
            <p className="mt-2 text-siac-muted">
              Consulte suas atividades complementares enviadas.
            </p>
          </div>

          <Link
            to="/atividades/nova"
            className="inline-flex items-center gap-2 rounded-lg bg-utfpr-yellow px-5 py-3 text-sm font-semibold text-utfpr-black transition-colors hover:brightness-95"
          >
            <FilePlus2 size={18} aria-hidden="true" />
            Nova atividade
          </Link>
        </div>

        {fileError && <p role="alert" className="text-sm text-red-700">{fileError}</p>}

        <div className="overflow-hidden rounded-xl border border-siac-border bg-white shadow-sm">
          <div className="flex items-center gap-3 border-b border-siac-border p-5">
            <ClipboardList size={22} aria-hidden="true" />
            <h2 className="text-lg font-semibold">
              Histórico de atividades
            </h2>
          </div>

          {isLoading ? (
            <p role="status" className="p-6 text-siac-muted">
              Carregando atividades...
            </p>
          ) : error ? (
            <p role="alert" className="p-6 text-red-700">
              {error}
            </p>
          ) : submissions.length === 0 ? (
            <div className="p-10 text-center">
              <ClipboardList
                size={40}
                className="mx-auto mb-4 text-gray-400"
                aria-hidden="true"
              />
              <p className="font-semibold text-utfpr-black">
                Nenhuma atividade encontrada
              </p>
              <p className="mt-2 text-sm text-siac-muted">
                Você ainda não possui atividades registradas.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-gray-700">
                  <tr>
                    <th scope="col" className="px-5 py-4">
                      Descrição
                    </th>
                    <th scope="col" className="px-5 py-4">
                      Semestre
                    </th>
                    <th scope="col" className="px-5 py-4">
                      Quantidade
                    </th>
                    <th scope="col" className="px-5 py-4">Data de início</th>
                    <th scope="col" className="px-5 py-4">Status</th>
                    <th scope="col" className="px-5 py-4">Pontuação</th>
                    <th scope="col" className="px-5 py-4">Comprovante</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-siac-border">
                  {submissions.map((submission) => (
                    <tr key={submission.public_id}>
                      <td className="px-5 py-4">
                        {submission.description}
                      </td>
                      <td className="px-5 py-4">
                        {submission.semester}
                      </td>
                      <td className="px-5 py-4">
                        {submission.declared_quantity}
                      </td>
                      <td className="px-5 py-4">{submission.activity_start_date}</td>
                      <td className="px-5 py-4">
                        <span className="font-medium">{({ PENDING: 'Pendente', APPROVED: 'Aprovada', REJECTED: 'Rejeitada' } as Record<string, string>)[submission.status ?? ''] ?? submission.status ?? '—'}</span>
                        {submission.feedback && <p className="mt-1 max-w-xs text-xs text-siac-muted">{submission.feedback}</p>}
                      </td>
                      <td className="px-5 py-4">{submission.approved_points ?? '—'}</td>
                      <td className="px-5 py-4">
                        <button type="button" onClick={() => void handleOpenFile(submission.public_id)} disabled={openingFile !== null} className="font-semibold text-blue-700 underline disabled:opacity-50">
                          {openingFile === submission.public_id ? 'Abrindo...' : 'Abrir arquivo'}
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
