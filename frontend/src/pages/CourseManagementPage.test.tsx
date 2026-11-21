import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CourseManagementPage from './CourseManagementPage'

const mockUserRef = vi.hoisted(() => ({
  current: {
    id: 'u-1',
    numeric_id: 1,
    email: 'coord.bes.dv@utfpr.edu.br',
    full_name: 'Prof. Coordenador de Curso',
    institutional_id: 'COORD001',
    primary_role: 'COURSE_COORD',
    campus: 'DV',
    campus_id: 1,
    campus_name: 'Campus Dois Vizinhos',
    roles: ['COURSE_COORD'],
  },
}))

const mockCourseList = vi.hoisted(() => vi.fn())
const mockGetAnalytics = vi.hoisted(() => vi.fn())
const mockScoringTable = vi.hoisted(() => vi.fn())

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: mockUserRef.current,
    loading: false,
    login: vi.fn(),
    logout: vi.fn(),
  }),
}))

vi.mock('../services/courseService', () => ({
  default: {
    list: mockCourseList,
    getAnalytics: mockGetAnalytics,
    update: vi.fn(),
    createGroup: vi.fn(),
    updateGroup: vi.fn(),
    deleteGroup: vi.fn(),
    createItem: vi.fn(),
    updateItem: vi.fn(),
  },
}))

vi.mock('../services/activityCatalogService', () => ({
  default: {
    scoringTable: mockScoringTable,
  },
}))

describe('CourseManagementPage', () => {
  beforeEach(() => {
    mockUserRef.current = {
      id: 'u-1',
      numeric_id: 1,
      email: 'coord.bes.dv@utfpr.edu.br',
      full_name: 'Prof. Coordenador de Curso',
      institutional_id: 'COORD001',
      primary_role: 'COURSE_COORD',
      campus: 'DV',
      campus_id: 1,
      campus_name: 'Campus Dois Vizinhos',
      roles: ['COURSE_COORD'],
    }
    mockCourseList.mockResolvedValue([
      {
        id: 1,
        name: 'Bacharelado em Engenharia de Software',
        code: 'BES-DV',
        campus: 1,
        campus_name: 'Campus Dois Vizinhos',
        campus_acronym: 'DV',
        coordinator: 1,
        coordinator_name: 'Prof. Coordenador',
        prac_professor: 2,
        prac_professor_name: 'Prof. PRAC',
        min_total_points: '70.00',
        is_active: true,
      },
    ])
    mockGetAnalytics.mockResolvedValue({
      course_id: 1,
      course_name: 'Bacharelado em Engenharia de Software',
      course_code: 'BES-DV',
      min_total_points: '70.00',
      students_count: 1,
      eligible_count: 0,
      homologated_count: 0,
      submissions_summary: {
        PENDING: 1,
        CORRECTION_REQUESTED: 0,
        APPROVED: 2,
        APPROVED_WITH_ADJUSTMENTS: 0,
        REJECTED: 0,
      },
      students: [],
    })
    mockScoringTable.mockResolvedValue([])
  })

  it('exibe curso vinculado somente leitura para COURSE_COORD e separa os cards na aba de tabela', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <CourseManagementPage />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Bacharelado em Engenharia de Software (BES-DV)')).toBeInTheDocument()
    expect(screen.getByText('Curso vinculado')).toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: /tabela de pontuação/i }))

    expect(await screen.findByText('Meta Total do Curso')).toBeInTheDocument()
    expect(screen.getByText('Novo Grupo de Pontuação')).toBeInTheDocument()
  })

  it('permite seleção de curso apenas quando SIAC_COORD possui múltiplos cursos', async () => {
    mockUserRef.current = {
      ...mockUserRef.current,
      primary_role: 'SIAC_COORD',
      roles: ['SIAC_COORD'],
    }
    mockCourseList.mockResolvedValue([
      {
        id: 1,
        name: 'Bacharelado em Engenharia de Software',
        code: 'BES-DV',
        campus: 1,
        campus_name: 'Campus Dois Vizinhos',
        campus_acronym: 'DV',
        coordinator: 1,
        coordinator_name: 'Coord 1',
        prac_professor: 2,
        prac_professor_name: 'PRAC 1',
        min_total_points: '70.00',
        is_active: true,
      },
      {
        id: 2,
        name: 'Zootecnia',
        code: 'ZOO-DV',
        campus: 1,
        campus_name: 'Campus Dois Vizinhos',
        campus_acronym: 'DV',
        coordinator: 3,
        coordinator_name: 'Coord 2',
        prac_professor: 4,
        prac_professor_name: 'PRAC 2',
        min_total_points: '70.00',
        is_active: true,
      },
    ])

    render(
      <MemoryRouter>
        <CourseManagementPage />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Curso selecionado')).toBeInTheDocument()
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })
})
