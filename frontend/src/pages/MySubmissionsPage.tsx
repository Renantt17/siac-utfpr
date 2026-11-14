
import { useEffect, useState } from 'react'
import { ClipboardList, FilePlus2 } from 'lucide-react'
import { Link } from 'react-router-dom'

import AppLayout from '../components/layout/AppLayout'
import submissionService, {
  type Submission,
} from '../services/submissionService'

export default function MySubmissionsPage() {
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
                    <th scope="col" className="px-5 py-4">
                      Data de início
                    </th>
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
                      <td className="px-5 py-4">
                        {submission.activity_start_date}
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
