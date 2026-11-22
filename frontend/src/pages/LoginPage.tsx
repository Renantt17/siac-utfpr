import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Eye, EyeOff, GraduationCap, LockKeyhole, ShieldCheck, UserRound } from 'lucide-react'

import { useAuth } from '../contexts/AuthContext'
import { loginSchema } from '../schemas'
import { Alert } from '../components/ui/badge'

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()

  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    const parsed = loginSchema.safeParse({ identifier, password })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message || 'Preencha suas credenciais.')
      return
    }

    setLoading(true)
    try {
      await login(parsed.data.identifier, parsed.data.password)
      navigate('/dashboard')
    } catch {
      setError('Credenciais inválidas. Verifique seu RA ou e-mail institucional e sua senha.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex min-h-screen flex-col bg-white lg:flex-row">
      <section className="relative flex min-h-[260px] flex-col justify-between overflow-hidden bg-utfpr-black p-7 text-white sm:p-10 lg:min-h-screen lg:w-1/2 lg:p-14">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-32 -right-32 h-80 w-80 rounded-full border-[55px] border-utfpr-yellow/10"
        />
        <div aria-hidden="true" className="pointer-events-none absolute right-0 top-0 h-2 w-2/3 bg-utfpr-yellow" />

        <div className="relative z-10">
          <img
            src="/logo-utfpr.png"
            alt="Universidade Tecnológica Federal do Paraná"
            className="h-16 w-auto max-w-full object-contain sm:h-20"
          />
        </div>

        <div className="relative z-10 my-8 max-w-xl lg:my-14">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-utfpr-yellow">
            <GraduationCap size={16} aria-hidden="true" />
            Plataforma acadêmica
          </div>

          <h1 className="text-5xl font-extrabold tracking-tight sm:text-6xl lg:text-7xl">
            SIAC<span className="text-utfpr-yellow">.</span>
          </h1>

          <p className="mt-5 text-xl font-semibold leading-snug sm:text-2xl">
            Sistema Integrado de
            <br />
            Atividades Complementares
          </p>

          <p className="mt-5 max-w-md text-sm leading-7 text-gray-300 sm:text-base">
            Envie certificados, acompanhe sua pontuação por grupo e realize a homologação das suas
            Atividades Complementares na UTFPR.
          </p>

          <div className="mt-8 h-1 w-20 rounded-full bg-utfpr-yellow" />
        </div>

        <p className="relative z-10 text-xs text-gray-400">
          Acesso institucional com credenciais pré-cadastradas (RA ou e-mail UTFPR)
        </p>
      </section>

      <section className="flex flex-1 items-center justify-center px-5 py-12 sm:px-10 lg:px-16">
        <div className="w-full max-w-md">
          <div className="mb-8">
            <span className="mb-4 inline-flex items-center gap-2 rounded-lg bg-yellow-50 px-3 py-2 text-sm font-semibold text-gray-800">
              <ShieldCheck size={17} aria-hidden="true" />
              Acesso institucional
            </span>

            <h2 className="text-3xl font-bold tracking-tight text-utfpr-black sm:text-4xl">
              Entrar no SIAC
            </h2>

            <p className="mt-3 text-sm leading-6 text-siac-muted">
              Estudantes podem utilizar seu RA ou e-mail. Docentes e coordenações utilizam sua
              identificação ou e-mail institucional.
            </p>
          </div>

          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            <div>
              <label htmlFor="login-identifier" className="mb-2 block text-sm font-semibold text-gray-800">
                RA ou E-mail institucional
              </label>
              <div className="relative">
                <UserRound
                  size={19}
                  aria-hidden="true"
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
                />
                <input
                  id="login-identifier"
                  type="text"
                  autoComplete="username"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="Ex.: a2500001 ou nome@utfpr.edu.br"
                  required
                  className="w-full rounded-xl border border-gray-300 bg-white py-3.5 pl-12 pr-4 text-sm text-gray-900 outline-none transition focus:border-yellow-500 focus:ring-2 focus:ring-yellow-200"
                />
              </div>
            </div>

            <div>
              <label htmlFor="login-password" className="mb-2 block text-sm font-semibold text-gray-800">
                Senha
              </label>
              <div className="relative">
                <LockKeyhole
                  size={19}
                  aria-hidden="true"
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
                />
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Digite sua senha"
                  required
                  className="w-full rounded-xl border border-gray-300 bg-white py-3.5 pl-12 pr-12 text-sm text-gray-900 outline-none transition focus:border-yellow-500 focus:ring-2 focus:ring-yellow-200"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  aria-pressed={showPassword}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-900"
                >
                  {showPassword ? <EyeOff size={19} aria-hidden="true" /> : <Eye size={19} aria-hidden="true" />}
                </button>
              </div>
            </div>

            {error && <Alert variant="danger">{error}</Alert>}

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-3 rounded-xl bg-utfpr-yellow px-5 py-4 text-base font-bold text-utfpr-black shadow-sm transition hover:brightness-95 focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
            >
              {loading ? 'Entrando...' : 'Entrar no sistema'}
              {!loading && <ArrowRight size={20} aria-hidden="true" />}
            </button>
          </form>

          <p className="mt-10 text-center text-xs text-gray-400">
            SIAC-UTFPR • Contas gerenciadas institucionalmente
          </p>
        </div>
      </section>
    </main>
  )
}
