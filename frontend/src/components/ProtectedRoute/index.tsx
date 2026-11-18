
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'

function ProtectedRoute() {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p>Carregando sessão...</p>
      </div>
    )
  }

  return isAuthenticated ? <Outlet /> : <Navigate to="/" replace />
}

export default ProtectedRoute