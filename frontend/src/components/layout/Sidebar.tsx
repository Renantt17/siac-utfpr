import { NavLink } from 'react-router-dom'
import {
  Award,
  Bell,
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  FilePlus2,
  GraduationCap,
  LayoutDashboard,
  Shield,
  UserPlus,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'

export default function Sidebar() {
  const { user } = useAuth()
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

  return (
    <aside
      aria-label="Menu lateral"
      className="w-full shrink-0 border-b border-siac-border bg-white md:w-64 md:border-r md:border-b-0"
    >
      <nav aria-label="Navegação principal" className="flex flex-col gap-1 p-4">
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
                'flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'border-l-4 border-utfpr-yellow bg-yellow-50 text-utfpr-black font-semibold'
                  : 'border-l-4 border-transparent text-gray-600 hover:bg-gray-100 hover:text-utfpr-black',
              ].join(' ')
            }
          >
            <Icon size={18} aria-hidden="true" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
