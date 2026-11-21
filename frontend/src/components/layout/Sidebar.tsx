
import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  Award,
  Bell,
  BookOpen,
  CalendarDays,
  ChevronDown,
  ClipboardCheck,
  ClipboardList,
  FilePlus2,
  GraduationCap,
  LayoutDashboard,
  Menu,
  Shield,
  UserPlus,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'

export default function Sidebar() {
  const { user } = useAuth()
  const location = useLocation()
  const [menuAberto, setMenuAberto] = useState(false)

  const roles = user?.roles ?? []

  const isStudent = roles.includes('STUDENT')
  const isProfessor = roles.includes('PROFESSOR')
  const isCourseCoord = roles.includes('COURSE_COORD')
  const isSiacCoord = roles.includes('SIAC_COORD')

  const menuItems = [
    { label: 'Painel inicial', path: '/dashboard', icon: LayoutDashboard },
    { label: 'Notificações', path: '/notificacoes', icon: Bell },
    { label: 'Oportunidades', path: '/oportunidades', icon: CalendarDays },
    ...(isStudent
      ? [
          { label: 'Enviar atividade', path: '/atividades/nova', icon: FilePlus2 },
          { label: 'Minhas atividades', path: '/atividades', icon: ClipboardList },
          { label: 'Minha pontuação', path: '/pontuacao', icon: GraduationCap },
        ]
      : []),
    ...(isProfessor
      ? [
          { label: 'Fila de avaliação', path: '/avaliacoes/pendentes', icon: ClipboardCheck },
          { label: 'Homologações', path: '/homologacoes', icon: Award },
        ]
      : []),
    ...(isProfessor || isCourseCoord || isSiacCoord
      ? [{ label: 'Matrículas e trancamentos', path: '/matriculas', icon: UserPlus }]
      : []),
    ...(isCourseCoord || isSiacCoord
      ? [{ label: 'Gestão de curso e tabela', path: '/coordenacao/curso', icon: BookOpen }]
      : []),
    ...(isSiacCoord
      ? [{ label: 'Administração SIAC', path: '/admin/siac', icon: Shield }]
      : []),
  ]

  const paginaAtual =
    menuItems.find((item) => item.path === location.pathname)?.label ??
    'Navegação'

  return (
    <aside
      aria-label="Menu lateral"
      className="w-full min-w-0 shrink-0 border-b border-siac-border bg-white md:w-64 md:border-r md:border-b-0"
    >
      <div className="p-3 md:hidden">
        <button
          type="button"
          aria-expanded={menuAberto}
          aria-controls="menu-principal-siac"
          onClick={() => setMenuAberto((aberto) => !aberto)}
          className="flex w-full items-center justify-between gap-3 rounded-lg border border-siac-border bg-white px-4 py-3 text-sm font-semibold text-utfpr-black transition-colors hover:bg-yellow-50"
        >
          <span className="flex min-w-0 items-center gap-3">
            <Menu size={20} aria-hidden="true" className="shrink-0" />
            <span className="truncate">{paginaAtual}</span>
          </span>

          <ChevronDown
            size={18}
            aria-hidden="true"
            className={`shrink-0 transition-transform ${
              menuAberto ? 'rotate-180' : ''
            }`}
          />
        </button>
      </div>

      <nav
        id="menu-principal-siac"
        aria-label="Navegação principal"
        className={`flex-col gap-1 px-3 pb-3 md:flex md:p-4 ${
          menuAberto ? 'flex' : 'hidden'
        }`}
      >
        <p className="mb-2 hidden px-4 text-xs font-bold uppercase tracking-wider text-siac-muted md:block">
          Navegação
        </p>

        {menuItems.map(({ label, path, icon: Icon }) => (
          <NavLink
            key={path}
            to={path}
            end
            onClick={() => setMenuAberto(false)}
            className={({ isActive }) =>
              [
                'flex min-w-0 items-center gap-3 rounded-lg border-l-4 px-4 py-3 text-sm font-medium transition-colors md:py-2.5',
                isActive
                  ? 'border-utfpr-yellow bg-yellow-50 font-semibold text-utfpr-black'
                  : 'border-transparent text-gray-600 hover:bg-gray-100 hover:text-utfpr-black',
              ].join(' ')
            }
          >
            <Icon size={18} aria-hidden="true" className="shrink-0" />
            <span className="min-w-0 break-words">{label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
