
import { useEffect, useState } from 'react'
import AppLayout from '../components/layout/AppLayout'
import userService, {
  type AuthenticatedUser,
} from '../services/userService'

export default function DashboardPage() {
  const [user, setUser] = useState<AuthenticatedUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function loadUser() {
      try {
        const data = await userService.getCurrentUser()

        if (active) {
          setUser(data)
        }
      } catch {
        if (active) {
          setError('Não foi possível carregar os dados do usuário.')
        }
      } finally {
        if (active) {
          setIsLoading(false)
        }
      }
    }

    void loadUser()

    return () => {
      active = false
    }
  }, [])

  return (
    <AppLayout>
      <section className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-utfpr-black">
            Painel inicial
          </h1>

          <p className="mt-2 text-siac-muted">
            Sistema Integrado de Atividades Complementares
          </p>
        </div>

        <div className="rounded-xl border border-siac-border bg-white p-6 shadow-sm">
          <div className="mb-4 h-1 w-16 rounded-full bg-utfpr-yellow" />

          {isLoading ? (
            <p role="status">Carregando seus dados...</p>
          ) : error ? (
            <p role="alert" className="text-red-700">
              {error}
            </p>
          ) : (
            <>
              <h2 className="text-xl font-semibold text-utfpr-black">
                Olá, {user?.full_name || 'estudante'}!
              </h2>

              <p className="mt-2 text-siac-muted">
                Bem-vindo ao SIAC-UTFPR.
              </p>

              <p className="mt-4 text-sm text-gray-600">
                {user?.email}
              </p>
            </>
          )}
        </div>
      </section>
    </AppLayout>
  )
}
