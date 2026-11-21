
import type { ReactNode } from 'react'
import { LogOut } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import Sidebar from './Sidebar'
import logoSiac from '../../assets/logo_siac.png'
import { useAuth } from '../../contexts/AuthContext'
import { Button } from '../ui/button'

interface AppLayoutProps {
  children: ReactNode
}

export default function AppLayout({ children }: AppLayoutProps) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/')
  }

  return (
    <div className="flex min-h-screen w-full min-w-0 flex-col overflow-x-hidden bg-siac-background text-utfpr-black">
      <header className="w-full border-b-4 border-utfpr-yellow bg-utfpr-black px-3 py-4 text-white sm:px-5 lg:px-6">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-2 sm:gap-4">
          <div className="min-w-0 flex-1">
            <img
              src={logoSiac}
              alt="SIAC"
              className="h-10 w-auto max-w-full object-contain object-left sm:h-14 lg:h-16"
            />

            <p className="mt-1 text-[10px] leading-snug text-gray-300 sm:text-sm">
              Sistema Integrado de Atividades Complementares
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3 lg:gap-4">
            {user && (
              <div className="hidden max-w-44 text-right text-xs text-gray-300 md:block lg:max-w-56">
                <p className="truncate font-semibold text-white">
                  {user.full_name}
                </p>
                <p className="truncate">
                  {user.institutional_id} • {user.campus}
                </p>
              </div>
            )}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleLogout}
              aria-label="Sair do sistema"
              className="shrink-0 border-gray-600 bg-transparent text-white hover:bg-gray-800 hover:text-white"
            >
              <LogOut size={16} aria-hidden="true" />
              <span className="hidden sm:inline">Sair</span>
            </Button>

            <img
              src="/logo-utfpr-header.png"
              alt="UTFPR"
              className="h-auto w-24 shrink-0 object-contain sm:w-32 lg:w-40"
            />
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full min-w-0 max-w-7xl flex-1 flex-col md:flex-row">
        <Sidebar />

        <main
          id="conteudo-principal"
          className="w-full min-w-0 flex-1 overflow-x-hidden px-3 py-5 sm:px-6 sm:py-6"
        >
          {children}
        </main>
      </div>
    </div>
  )
}
