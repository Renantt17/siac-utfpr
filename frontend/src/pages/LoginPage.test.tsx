import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LoginPage from './LoginPage'

const mockLogin = vi.fn()
const mockNavigate = vi.fn()

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    login: mockLogin,
    user: null,
    loading: false,
    logout: vi.fn(),
  }),
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

describe('LoginPage', () => {
  beforeEach(() => {
    mockLogin.mockReset()
    mockNavigate.mockReset()
  })

  it('valida campos obrigatórios via Zod antes de enviar', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('button', { name: /entrar/i }))

    expect(await screen.findByText('Informe seu RA ou e-mail institucional.')).toBeInTheDocument()
    expect(mockLogin).not.toHaveBeenCalled()
  })

  it('permite alternar visibilidade da senha e autenticar com RA ou e-mail', async () => {
    const user = userEvent.setup()
    mockLogin.mockResolvedValue(undefined)

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    )

    const idInput = screen.getByLabelText(/ra ou e-mail institucional/i)
    const pwInput = screen.getByLabelText(/^senha$/i) as HTMLInputElement

    expect(pwInput.type).toBe('password')
    await user.click(screen.getByRole('button', { name: /mostrar senha/i }))
    expect(pwInput.type).toBe('text')

    await user.type(idInput, 'a2500001')
    await user.type(pwInput, 'Siac-Seed-Password-2026!')
    await user.click(screen.getByRole('button', { name: /entrar/i }))

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('a2500001', 'Siac-Seed-Password-2026!')
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard')
    })
  })

  it('exibe alerta de erro quando autenticação falha', async () => {
    const user = userEvent.setup()
    mockLogin.mockRejectedValue(new Error('Unauthorized'))

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    )

    await user.type(screen.getByLabelText(/ra ou e-mail institucional/i), 'coord@utfpr.edu.br')
    await user.type(screen.getByLabelText(/^senha$/i), 'errada')
    await user.click(screen.getByRole('button', { name: /entrar/i }))

    expect(
      await screen.findByText(/credenciais inválidas\. verifique seu ra ou e-mail institucional/i),
    ).toBeInTheDocument()
  })
})
