
import type { ReactNode } from 'react'
import Sidebar from './Sidebar'
import logoSiac from '../../assets/logo_siac.png'

interface AppLayoutProps {
  children: ReactNode
}

export default function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="flex min-h-screen w-full min-w-0 flex-col overflow-x-hidden bg-siac-background text-utfpr-black">
      <header className="w-full border-b-4 border-utfpr-yellow bg-utfpr-black px-4 py-4 text-white sm:px-6">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <img
              src={logoSiac}
              alt="SIAC"
              className="h-12 w-auto max-w-full object-contain object-left sm:h-16"
            />

            <p className="mt-1 text-[10px] leading-snug text-gray-300 sm:text-sm">
              Sistema Integrado de Atividades Complementares
            </p>
          </div>

          <img
            src="/logo-utfpr.png"
            alt="Universidade Tecnológica Federal do Paraná"
            className="h-auto w-20 shrink-0 object-contain sm:w-28"
          />
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
