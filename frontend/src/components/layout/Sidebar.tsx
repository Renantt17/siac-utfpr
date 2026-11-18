
import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  FilePlus2,
  ClipboardList,
  GraduationCap,
  ClipboardCheck,
  Bell,
  CalendarDays,
} from 'lucide-react'

import userService, {
  type UserRole,
} from '../../services/userService'

const studentMenu = [
  {
    label: 'Enviar atividade',
    path: '/atividades/nova',
    icon: FilePlus2,
  },
  {
    label: 'Minhas atividades',
    path: '/atividades',
    icon: ClipboardList,
  },
  {
    label: 'Pontuação',
    path: '/pontuacao',
    icon: GraduationCap,
  },
]

const evaluationMenu = [
  {
    label: 'Atividades pendentes',
    path: '/avaliacoes/pendentes',
    icon: ClipboardCheck,
  },
]

export default function Sidebar() {
  const [roles, setRoles] = useState<UserRole[]>([])

  useEffect(() => {
    let active = true

    async function loadUser() {
      try {
        const user = await userService.getCurrentUser()

        if (active) {
          setRoles(user.roles)
        }
      } catch {
        if (active) {
          setRoles([])
        }
      }
    }

    void loadUser()

    return () => {
      active = false
    }
  }, [])

  const isStudent = roles.includes('STUDENT')

  const canEvaluate =
    roles.includes('PROFESSOR') ||
    roles.includes('SIAC_COORDINATOR')

  const menuItems = [
    {
      label: 'Painel inicial',
      path: '/dashboard',
      icon: LayoutDashboard,
    },
    { label: 'Notificações', path: '/notificacoes', icon: Bell },
    { label: 'Oportunidades', path: '/oportunidades', icon: CalendarDays },
    ...(isStudent ? studentMenu : []),
    ...(canEvaluate ? evaluationMenu : []),
  ]

  return (
    <aside
      aria-label="Menu lateral"
      className="w-full shrink-0 border-b border-siac-border bg-white md:w-64 md:border-r md:border-b-0"
    >
      <nav
        aria-label="Navegação principal"
        className="flex flex-col gap-1 p-4"
      >
        <p className="mb-2 px-4 text-xs font-bold uppercase tracking-wider text-siac-muted">
          Navegação
        </p>

        {menuItems.map(({ label, path, icon: Icon }) => (
          <NavLink
            key={path}
            to={path}
            end
            className={({ isActive }) =>
              [
                'flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors',
                isActive
                  ? 'border-l-4 border-utfpr-yellow bg-yellow-50 text-utfpr-black'
                  : 'border-l-4 border-transparent text-gray-600 hover:bg-gray-100 hover:text-utfpr-black',
              ].join(' ')
            }
          >
            <Icon size={20} aria-hidden="true" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
