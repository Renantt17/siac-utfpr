
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import authService from '../services/authService'

interface AuthContextData {
  isAuthenticated: boolean
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextData | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function recuperarSessao() {
      if (!localStorage.getItem('refresh')) {
        authService.logout()
        setIsLoading(false)
        return
      }

      try {
        await authService.refresh()
        setIsAuthenticated(true)
      } catch {
        authService.logout()
        setIsAuthenticated(false)
      } finally {
        setIsLoading(false)
      }
    }

    recuperarSessao()
  }, [])

  async function login(email: string, password: string) {
    await authService.login({ email, password })
    setIsAuthenticated(true)
  }

  function logout() {
    authService.logout()
    setIsAuthenticated(false)
  }

  return (
    <AuthContext.Provider
      value={{ isAuthenticated, isLoading, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth deve ser utilizado dentro de AuthProvider.')
  }

  return context
}
