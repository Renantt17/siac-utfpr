
import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'

function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setLoading(true)

    try {
      await login(email, password)
      navigate('/dashboard')
    } catch {
      setError('E-mail ou senha inválidos.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-100 p-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md space-y-5 rounded-xl bg-white p-8 shadow-lg"
      >
        <header className="text-center">
          <h1 className="text-3xl font-bold text-blue-900">SIAC</h1>
          <p className="mt-2 text-gray-600">
            Sistema Integrado de Atividades Complementares
          </p>
          <h2 className="mt-6 text-xl font-semibold text-gray-800">
            Acessar sistema
          </h2>
        </header>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            E-mail institucional
          </label>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-blue-700"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Senha
          </label>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-blue-700"
          />
        </div>

        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-blue-900 py-3 font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
        >
          {loading ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </main>
  )
}

export default LoginPage
