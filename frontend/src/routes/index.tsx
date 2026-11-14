
import { Routes, Route } from 'react-router-dom'

import LoginPage from '../pages/LoginPage'
import DashboardPage from '../pages/DashboardPage'
import NewSubmissionPage from '../pages/NewSubmissionPage'
import MySubmissionsPage from '../pages/MySubmissionsPage'
import ScorePage from '../pages/ScorePage'
import PendingSubmissionsPage from '../pages/PendingSubmissionsPage'

import ProtectedRoute from '../components/ProtectedRoute'
import RoleProtectedRoute from '../components/ProtectedRoute/RoleProtectedRoute'

const evaluationRoles = [
  'PROFESSOR',
  'SIAC_COORDINATOR',
] as const

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LoginPage />} />

      <Route element={<ProtectedRoute />}>
        <Route path="/dashboard" element={<DashboardPage />} />

        <Route
          path="/atividades/nova"
          element={<NewSubmissionPage />}
        />

        <Route
          path="/atividades"
          element={<MySubmissionsPage />}
        />

        <Route
          path="/pontuacao"
          element={<ScorePage />}
        />

        <Route
          element={
            <RoleProtectedRoute allowedRoles={[...evaluationRoles]} />
          }
        >
          <Route
            path="/avaliacoes/pendentes"
            element={<PendingSubmissionsPage />}
          />
        </Route>
      </Route>
    </Routes>
  )
}

export default AppRoutes
