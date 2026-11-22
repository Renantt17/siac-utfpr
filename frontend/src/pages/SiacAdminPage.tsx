import { useCallback, useEffect, useState, type FormEvent } from 'react'
import axios from 'axios'

import AppLayout from '../components/layout/AppLayout'
import { adminService, type AdminUser, type AuditLogEntry } from '../services/adminService'
import courseService, { type Course } from '../services/courseService'
import userService, { type Campus, type UserRole } from '../services/userService'
import { Alert, Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Input, Label } from '../components/ui/input'
import { Select } from '../components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'

const ALL_ROLES: UserRole[] = ['STUDENT', 'PROFESSOR', 'COURSE_COORD', 'SIAC_COORD']

export default function SiacAdminPage() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [campuses, setCampuses] = useState<Campus[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [logs, setLogs] = useState<AuditLogEntry[]>([])

  const [courseName, setCourseName] = useState('')
  const [courseCode, setCourseCode] = useState('')
  const [courseCampus, setCourseCampus] = useState('')
  const [courseCoord, setCourseCoord] = useState('')
  const [coursePrac, setCoursePrac] = useState('')
  const [courseMinPts, setCourseMinPts] = useState('70.00')

  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const loadAll = useCallback(async () => {
    try {
      const [u, camp, crs, lgs] = await Promise.all([
        adminService.listUsers(),
        userService.listCampuses(),
        courseService.list(),
        adminService.listAuditLogs(),
      ])
      setUsers(u)
      setCampuses(camp)
      setCourses(crs)
      setLogs(lgs)
      if (camp.length > 0 && !courseCampus) setCourseCampus(String(camp[0].id))
    } catch {
      setError('Não foi possível carregar dados administrativos.')
    }
  }, [courseCampus])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  async function handleCreateCourse(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess('')
    try {
      await courseService.create({
        campus: Number(courseCampus),
        name: courseName,
        code: courseCode,
        coordinator: Number(courseCoord),
        prac_professor: Number(coursePrac),
        min_total_points: courseMinPts,
        use_default_table: true,
      })
      setSuccess('Curso criado com a Tabela de Pontuação Padrão da UTFPR!')
      setCourseName('')
      setCourseCode('')
      await loadAll()
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.data) {
        setError(JSON.stringify(err.response.data))
      } else {
        setError('Não foi possível cadastrar o curso.')
      }
    }
  }

  async function toggleRole(user: AdminUser, role: UserRole) {
    setError('')
    setSuccess('')
    try {
      if (user.roles.includes(role)) {
        await adminService.revokeRole(user.public_id, role)
        setSuccess(`Papel ${role} removido de ${user.full_name}.`)
      } else {
        await adminService.grantRole(user.public_id, role)
        setSuccess(`Papel ${role} concedido para ${user.full_name}.`)
      }
      await loadAll()
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.data) {
        setError(JSON.stringify(err.response.data))
      } else {
        setError('Não foi possível atualizar papéis.')
      }
    }
  }

  const coordCandidates = users.filter((u) => u.roles.includes('COURSE_COORD'))
  const pracCandidates = users.filter((u) => u.roles.includes('PROFESSOR'))

  return (
    <AppLayout>
      <section className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-utfpr-black">Administração SIAC-UTFPR</h1>
          <p className="mt-2 text-siac-muted">
            Gestão global de cursos, permissões de usuários pré-cadastrados e trilha de auditoria.
          </p>
        </div>

        {success && <Alert variant="success">{success}</Alert>}
        {error && <Alert variant="danger">{error}</Alert>}

        <Tabs defaultValue="courses">
          <TabsList>
            <TabsTrigger value="courses">Cursos ({courses.length})</TabsTrigger>
            <TabsTrigger value="users">Usuários e Papéis ({users.length})</TabsTrigger>
            <TabsTrigger value="audit">Auditoria Imutável ({logs.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="courses" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Cadastrar curso (com Tabela Padrão IN COENS-DV nº 3/2021)</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={(e) => void handleCreateCourse(e)} className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="c-name">Nome do curso</Label>
                    <Input id="c-name" required value={courseName} onChange={(e) => setCourseName(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="c-code">Código (ex.: BCC-CM)</Label>
                    <Input id="c-code" required value={courseCode} onChange={(e) => setCourseCode(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="c-campus">Campus</Label>
                    <Select id="c-campus" value={courseCampus} onChange={(e) => setCourseCampus(e.target.value)}>
                      {campuses.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.acronym})
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="c-min">Meta mínima total</Label>
                    <Input
                      id="c-min"
                      type="number"
                      step="0.5"
                      value={courseMinPts}
                      onChange={(e) => setCourseMinPts(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="c-coord">Coordenação do Curso (COURSE_COORD)</Label>
                    <Select id="c-coord" required value={courseCoord} onChange={(e) => setCourseCoord(e.target.value)}>
                      <option value="">Selecione</option>
                      {coordCandidates.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.full_name} ({u.institutional_id})
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="c-prac">Docente PRAC (PROFESSOR)</Label>
                    <Select id="c-prac" required value={coursePrac} onChange={(e) => setCoursePrac(e.target.value)}>
                      <option value="">Selecione</option>
                      {pracCandidates.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.full_name} ({u.institutional_id})
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <Button type="submit">Criar curso com tabela padrão</Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            <div className="grid gap-3">
              {courses.map((c) => (
                <Card key={c.id}>
                  <CardContent className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <div>
                      <p className="font-bold">
                        {c.name} ({c.code}) — {c.campus_acronym}
                      </p>
                      <p className="text-xs text-siac-muted">
                        Coord.: {c.coordinator_name} • PRAC: {c.prac_professor_name}
                      </p>
                    </div>
                    <Badge variant="warning">Meta: {c.min_total_points} pts</Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="users" className="space-y-3">
            {users.map((u) => (
              <Card key={u.public_id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 text-sm">
                  <div>
                    <p className="font-bold">
                      {u.full_name} ({u.institutional_id})
                    </p>
                    <p className="text-xs text-siac-muted">
                      {u.email} • {u.campus_acronym} • Principal: {u.primary_role}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {ALL_ROLES.map((role) => {
                      const active = u.roles.includes(role)
                      const isPrimary = u.primary_role === role
                      return (
                        <Button
                          key={role}
                          type="button"
                          size="sm"
                          variant={active ? 'default' : 'outline'}
                          disabled={isPrimary}
                          onClick={() => void toggleRole(u, role)}
                          title={isPrimary ? 'Papel principal não pode ser removido' : 'Alternar papel'}
                        >
                          {role}
                        </Button>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="audit" className="space-y-2">
            {logs.map((log) => (
              <Card key={log.id}>
                <CardContent className="space-y-1 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold">
                      #{log.id} • {log.entity_type} ({log.entity_id}) — {log.action}
                    </span>
                    <span className="text-siac-muted">
                      {new Date(log.created_at).toLocaleString('pt-BR')} • IP: {log.ip_address ?? '—'}
                    </span>
                  </div>
                  <p className="text-gray-700">
                    Autor: {log.actor_name ?? 'Sistema'} ({log.actor_institutional_id ?? '—'}) | Status:{' '}
                    {log.previous_status ?? '—'} → {log.new_status ?? '—'}
                  </p>
                  {log.notes && <p className="text-gray-600">Obs.: {log.notes}</p>}
                </CardContent>
              </Card>
            ))}
          </TabsContent>
        </Tabs>
      </section>
    </AppLayout>
  )
}
