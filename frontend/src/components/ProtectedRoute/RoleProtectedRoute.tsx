
import { useEffect, useState } from 'react'
import { Navigate, Outlet } from 'react-router-dom'

import userService, {
  type UserRole,
} from '../../services/userService'

interface RoleProtectedRouteProps {
  allowedRoles: UserRole[]
}

export default function RoleProtectedRoute({
  allowedRoles,
}: RoleProtectedRouteProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [isAuthorized, setIsAuthorized] = useState(false)

  useEffect(() => {
    let active = true

    async function checkPermission() {
      try {
        const user = await userService.getCurrentUser()

        const hasPermission = user.roles.some((role) =>
          allowedRoles.includes(role)
        )

        if (active) {
          setIsAuthorized(hasPermission)
        }
      } catch {
        if (active) {
          setIsAuthorized(false)
        }
      } finally {
        if (active) {
          setIsLoading(false)
        }
      }
    }

    void checkPermission()

    return () => {
      active = false
    }
  }, [allowedRoles])

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

  if (!isAuthorized) {
    return <Navigate to="/dashboard" replace />
  }

  return <Outlet />
}
