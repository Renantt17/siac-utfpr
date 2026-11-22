import { Navigate, Route, Routes } from 'react-router-dom'

import LoginPage from '../pages/LoginPage'
import DashboardPage from '../pages/DashboardPage'
import NewSubmissionPage from '../pages/NewSubmissionPage'
import MySubmissionsPage from '../pages/MySubmissionsPage'
import ScorePage from '../pages/ScorePage'
import PendingSubmissionsPage from '../pages/PendingSubmissionsPage'
import HomologationsPage from '../pages/HomologationsPage'
import EnrollmentsPage from '../pages/EnrollmentsPage'
import CourseManagementPage from '../pages/CourseManagementPage'
import SiacAdminPage from '../pages/SiacAdminPage'
import NotificationsPage from '../pages/NotificationsPage'
import OpportunitiesPage from '../pages/OpportunitiesPage'

import ProtectedRoute from '../components/ProtectedRoute'
import RoleProtectedRoute from '../components/ProtectedRoute/RoleProtectedRoute'

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LoginPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />

      <Route element={<ProtectedRoute />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/notificacoes" element={<NotificationsPage />} />
        <Route path="/oportunidades" element={<OpportunitiesPage />} />

        <Route element={<RoleProtectedRoute allowedRoles={['STUDENT']} />}>
          <Route path="/atividades/nova" element={<NewSubmissionPage />} />
          <Route path="/atividades" element={<MySubmissionsPage />} />
          <Route path="/pontuacao" element={<ScorePage />} />
        </Route>

        <Route element={<RoleProtectedRoute allowedRoles={['PROFESSOR']} />}>
          <Route path="/avaliacoes/pendentes" element={<PendingSubmissionsPage />} />
          <Route path="/homologacoes" element={<HomologationsPage />} />
        </Route>

        <Route element={<RoleProtectedRoute allowedRoles={['PROFESSOR', 'COURSE_COORD', 'SIAC_COORD']} />}>
          <Route path="/matriculas" element={<EnrollmentsPage />} />
        </Route>

        <Route element={<RoleProtectedRoute allowedRoles={['COURSE_COORD', 'SIAC_COORD']} />}>
          <Route path="/coordenacao/curso" element={<CourseManagementPage />} />
        </Route>

        <Route element={<RoleProtectedRoute allowedRoles={['SIAC_COORD']} />}>
          <Route path="/admin/siac" element={<SiacAdminPage />} />
        </Route>
      </Route>
    </Routes>
  )
}
