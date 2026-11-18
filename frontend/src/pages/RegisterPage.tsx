
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import axios from 'axios'
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  GraduationCap,
  UserRound,
} from 'lucide-react'
import registerService, {
  type Campus,
} from '../services/registerService'

const inputClass =
  'mt-2 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-yellow-500 focus:ring-2 focus:ring-yellow-200'

export default function RegisterPage() {
  const navigate = useNavigate()

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [institutionalId, setInstitutionalId] = useState('')
  const [campus, setCampus] = useState('')
  const [campuses, setCampuses] = useState<Campus[]>([])
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [message, setMessage] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadingCampuses, setLoadingCampuses] = useState(true)

  useEffect(() => {
    async function loadCampuses() {
      try {
        const data = await registerService.getCampuses()
        setCampuses(data)
      } catch {
        setMessage('Não foi possível carregar os campi. Verifique a conexão com o servidor.')
      } finally {
        setLoadingCampuses(false)
      }
    }

    loadCampuses()
  }, [])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage('')
    setSuccess(false)

    if (fullName.trim().length < 3) {
      setMessage('Informe seu nome completo.')
      return
    }

    if (!email.includes('@')) {
      setMessage('Informe um e-mail válido.')
      return
    }

    if (!institutionalId.trim()) {
      setMessage('Informe sua identificação institucional.')
      return
    }

    if (!campus) {
      setMessage('Selecione seu campus.')
      return
    }

    if (password.length < 8) {
      setMessage('A senha deve conter pelo menos 8 caracteres.')
      return
    }

    if (password !== confirmPassword) {
      setMessage('As senhas informadas não coincidem.')
      return
    }

    setLoading(true)

    try {
      await registerService.register({
        full_name: fullName.trim(),
        email: email.trim(),
        institutional_id: institutionalId.trim(),
        campus: Number(campus),
        password,
        confirmPassword,
      })

      setSuccess(true)
      setMessage('Conta criada com sucesso! Redirecionando para o login...')

      setTimeout(() => {
        navigate('/')
      }, 1800)
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status
        const data = error.response?.data

        if (status === 400 && data && typeof data === 'object') {
          const details = Object.entries(data as Record<string, unknown>)
            .map(([field, value]) => {
              const content = Array.isArray(value)
                ? value.join(', ')
                : String(value)

              return `${field}: ${content}`
            })
            .join(' | ')

          setMessage(details || 'Verifique os dados informados.')
        } else if (status === 409) {
          setMessage('Já existe um cadastro com esses dados.')
        } else if (status === 403) {
          setMessage('Você não tem permissão para realizar este cadastro.')
        } else if (status === 404) {
          setMessage('O serviço de cadastro não foi encontrado.')
        } else {
          setMessage('Não foi possível criar a conta. Tente novamente.')
        }
      } else {
        setMessage('Ocorreu um erro inesperado ao criar a conta.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="border-b-4 border-utfpr-yellow bg-utfpr-black px-5 py-5 text-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">
              SIAC<span className="text-utfpr-yellow">.</span>
            </h1>
            <p className="text-xs text-gray-300">
              Sistema Integrado de Atividades Complementares
            </p>
          </div>

          <img
            src="/logo-utfpr.png"
            alt="Universidade Tecnológica Federal do Paraná"
            className="w-24 object-contain sm:w-32"
          />
        </div>
      </header>

      <section className="mx-auto max-w-2xl px-4 py-10 sm:py-14">
        <Link
          to="/"
          className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-black"
        >
          <ArrowLeft size={18} />
          Voltar para o login
        </Link>

        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-10">
          <div className="mb-8">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-yellow-50 px-4 py-2 text-xs font-bold uppercase tracking-wide text-gray-800">
              <GraduationCap size={17} />
              Cadastro acadêmico
            </div>

            <h2 className="text-3xl font-bold text-gray-950">
              Criar uma conta
            </h2>

            <p className="mt-3 text-sm leading-6 text-gray-600">
              Preencha seus dados para acessar o Sistema Integrado
              de Atividades Complementares.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="fullName" className="text-sm font-semibold">
                Nome completo
              </label>
              <input
                id="fullName"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                placeholder="Seu nome completo"
                autoComplete="name"
                required
                className={inputClass}
              />
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="email" className="text-sm font-semibold">
                  E-mail
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="seu.email@exemplo.com"
                  autoComplete="email"
                  required
                  className={inputClass}
                />
              </div>

              <div>
                <label
                  htmlFor="institutionalId"
                  className="text-sm font-semibold"
                >
                  Identificação institucional
                </label>
                <input
                  id="institutionalId"
                  value={institutionalId}
                  onChange={(event) => setInstitutionalId(event.target.value)}
                  placeholder="RA ou identificação"
                  maxLength={30}
                  required
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label htmlFor="campus" className="text-sm font-semibold">
                Campus
              </label>

              <select
                id="campus"
                value={campus}
                onChange={(event) => setCampus(event.target.value)}
                required
                disabled={loadingCampuses || campuses.length === 0}
                className={inputClass}
              >
                <option value="">
                  {loadingCampuses
                    ? 'Carregando campi...'
                    : 'Selecione o campus'}
                </option>

                {campuses.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="password" className="text-sm font-semibold">
                  Senha
                </label>

                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Mínimo de 8 caracteres"
                    autoComplete="new-password"
                    minLength={8}
                    required
                    className={`${inputClass} pr-12`}
                  />

                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    className="absolute right-4 top-1/2 mt-1 -translate-y-1/2 text-gray-500"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div>
                <label
                  htmlFor="confirmPassword"
                  className="text-sm font-semibold"
                >
                  Confirmar senha
                </label>
                <input
                  id="confirmPassword"
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Repita sua senha"
                  autoComplete="new-password"
                  required
                  className={inputClass}
                />
              </div>
            </div>

            {message && (
              <div
                role="status"
                className={`flex items-start gap-2 rounded-xl border p-4 text-sm ${
                  success
                    ? 'border-green-200 bg-green-50 text-green-800'
                    : 'border-red-200 bg-red-50 text-red-800'
                }`}
              >
                {success ? (
                  <CheckCircle2 size={20} className="shrink-0" />
                ) : (
                  <UserRound size={20} className="shrink-0" />
                )}
                {message}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || loadingCampuses || campuses.length === 0 || success}
              className="w-full rounded-xl bg-utfpr-yellow px-5 py-4 font-bold text-utfpr-black transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Criando conta...' : 'Criar conta'}
            </button>
          </form>

          <p className="mt-7 text-center text-sm text-gray-600">
            Já possui uma conta?{' '}
            <Link to="/" className="font-bold text-gray-950 underline">
              Entrar no SIAC
            </Link>
          </p>
        </div>
      </section>
    </main>
  )
}
