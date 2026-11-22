import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import type { UserRole } from '../../services/userService'

interface RoleProtectedRouteProps {
  allowedRoles: UserRole[]
}

export default function RoleProtectedRoute({ allowedRoles }: RoleProtectedRouteProps) {
  const { user, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div
        role="status"
        className="flex min-h-screen items-center justify-center bg-siac-background"
      >
        Verificando permissões...
      </div>
    )
  }

  const hasPermission = Boolean(user?.roles.some((role) => allowedRoles.includes(role)))
  if (!hasPermission) {
    return <Navigate to="/dashboard" replace />
  }

  return <Outlet />
}
