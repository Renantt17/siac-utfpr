import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import authService from '../services/authService'
import userService, { type AuthenticatedUser } from '../services/userService'

interface AuthContextData {
  isAuthenticated: boolean
  isLoading: boolean
  user: AuthenticatedUser | null
  login: (identifier: string, password: string) => Promise<void>
  logout: () => void
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextData | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthenticatedUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const refreshUser = useCallback(async () => {
    const profile = await userService.getCurrentUser()
    setUser(profile)
  }, [])

  useEffect(() => {
    async function recoverSession() {
      if (!localStorage.getItem('refresh')) {
        authService.logout()
        setUser(null)
        setIsLoading(false)
        return
      }
      try {
        await authService.refresh()
        await refreshUser()
      } catch {
        authService.logout()
        setUser(null)
      } finally {
        setIsLoading(false)
      }
    }
    void recoverSession()
  }, [refreshUser])

  async function login(identifier: string, password: string) {
    const loggedUser = await authService.login(identifier, password)
    setUser(loggedUser)
  }

  function logout() {
    authService.logout()
    setUser(null)
  }

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated: Boolean(user),
        isLoading,
        user,
        login,
        logout,
        refreshUser,
      }}
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
