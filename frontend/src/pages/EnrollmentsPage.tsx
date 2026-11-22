import { useCallback, useEffect, useState, type FormEvent } from 'react'
import axios from 'axios'

import AppLayout from '../components/layout/AppLayout'
import { enrollmentSchema, suspensionSchema } from '../schemas'
import type { Enrollment } from '../services/activityCatalogService'
import courseService, {
  type Course,
  type EnrollmentSuspension,
  type StudentOption,
} from '../services/courseService'
import { Alert, Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Input, Label } from '../components/ui/input'
import { Select } from '../components/ui/select'

export default function EnrollmentsPage() {
  const [courses, setCourses] = useState<Course[]>([])
  const [students, setStudents] = useState<StudentOption[]>([])
  const [selectedCourseId, setSelectedCourseId] = useState('')
  const [enrollments, setEnrollments] = useState<Enrollment[]>([])
  const [suspensionsByEnr, setSuspensionsByEnr] = useState<Record<number, EnrollmentSuspension[]>>({})

  const [studentId, setStudentId] = useState('')
  const [enrollmentDate, setEnrollmentDate] = useState('')
  const [suspEnrollmentId, setSuspEnrollmentId] = useState('')
  const [suspStart, setSuspStart] = useState('')
  const [suspEnd, setSuspEnd] = useState('')
  const [suspReason, setSuspReason] = useState('')

  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const loadBase = useCallback(async () => {
    try {
      const [cList, sList] = await Promise.all([courseService.list(), courseService.listStudents()])
      setCourses(cList)
      setStudents(sList)
      if (cList.length > 0 && !selectedCourseId) {
        setSelectedCourseId(String(cList[0].id))
      }
    } catch {
      setError('Não foi possível carregar cursos e estudantes.')
    }
  }, [selectedCourseId])

  useEffect(() => {
    void loadBase()
  }, [loadBase])

  const loadEnrollments = useCallback(async () => {
    if (!selectedCourseId) return
    try {
      const list = await courseService.listCourseEnrollments(Number(selectedCourseId))
      setEnrollments(list)
      const pairs = await Promise.all(
        list.map(async (e) => [e.id, await courseService.listSuspensions(e.id)] as const)
      )
      setSuspensionsByEnr(Object.fromEntries(pairs))
    } catch {
      setEnrollments([])
    }
  }, [selectedCourseId])

  useEffect(() => {
    void loadEnrollments()
  }, [loadEnrollments])

  async function handleCreateEnrollment(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess('')
    const parsed = enrollmentSchema.safeParse({
      student_id: studentId,
      course_id: selectedCourseId,
      enrollment_date: enrollmentDate,
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message || 'Preencha os dados da matrícula.')
      return
    }
    try {
      await courseService.createEnrollment(parsed.data)
      setSuccess('Matrícula vinculada com sucesso.')
      setStudentId('')
      await loadEnrollments()
    } catch (err) {
      if (axios.isAxiosError(err) && typeof err.response?.data?.detail === 'string') {
        setError(err.response.data.detail)
      } else {
        setError('Não foi possível vincular a matrícula.')
      }
    }
  }

  async function handleCreateSuspension(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess('')
    const parsed = suspensionSchema.safeParse({
      enrollment_id: suspEnrollmentId,
      start_date: suspStart,
      end_date: suspEnd,
      reason: suspReason,
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message || 'Dados inválidos de trancamento.')
      return
    }
    try {
      await courseService.createSuspension(parsed.data.enrollment_id, {
        start_date: parsed.data.start_date,
        end_date: parsed.data.end_date,
        reason: parsed.data.reason,
      })
      setSuccess('Período de trancamento registrado.')
      setSuspStart('')
      setSuspEnd('')
      setSuspReason('')
      await loadEnrollments()
    } catch (err) {
      if (axios.isAxiosError(err) && typeof err.response?.data?.detail === 'string') {
        setError(err.response.data.detail)
      } else {
        setError('Não foi possível registrar o trancamento.')
      }
    }
  }

  return (
    <AppLayout>
      <section className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-utfpr-black">Matrículas e Trancamentos</h1>
          <p className="mt-2 text-siac-muted">
            Vincule estudantes aos cursos e registre períodos de trancamento sem sobreposição.
          </p>
        </div>

        {success && <Alert variant="success">{success}</Alert>}
        {error && <Alert variant="danger">{error}</Alert>}

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Nova matrícula no curso</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={(e) => void handleCreateEnrollment(e)} className="space-y-4">
                <div>
                  <Label htmlFor="enr-course">Curso</Label>
                  <Select
                    id="enr-course"
                    value={selectedCourseId}
                    onChange={(e) => setSelectedCourseId(e.target.value)}
                  >
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.code}) — {c.campus_acronym}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="enr-student">Estudante</Label>
                  <Select
                    id="enr-student"
                    value={studentId}
                    onChange={(e) => setStudentId(e.target.value)}
                  >
                    <option value="">Selecione o estudante</option>
                    {students.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.full_name} ({s.institutional_id}) — {s.campus_acronym}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="enr-date">Data de ingresso</Label>
                  <Input
                    id="enr-date"
                    type="date"
                    value={enrollmentDate}
                    onChange={(e) => setEnrollmentDate(e.target.value)}
                  />
                </div>
                <Button type="submit">Vincular matrícula</Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Registrar trancamento</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={(e) => void handleCreateSuspension(e)} className="space-y-4">
                <div>
                  <Label htmlFor="susp-enr">Matrícula ativa</Label>
                  <Select
                    id="susp-enr"
                    value={suspEnrollmentId}
                    onChange={(e) => setSuspEnrollmentId(e.target.value)}
                  >
                    <option value="">Selecione o estudante</option>
                    {enrollments
                      .filter((e) => e.status === 'ACTIVE')
                      .map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.student_name} ({e.student_institutional_id})
                        </option>
                      ))}
                  </Select>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="susp-start">Início do trancamento</Label>
                    <Input
                      id="susp-start"
                      type="date"
                      value={suspStart}
                      onChange={(e) => setSuspStart(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="susp-end">Fim do trancamento</Label>
                    <Input
                      id="susp-end"
                      type="date"
                      value={suspEnd}
                      onChange={(e) => setSuspEnd(e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="susp-reason">Motivo (opcional)</Label>
                  <Input
                    id="susp-reason"
                    value={suspReason}
                    onChange={(e) => setSuspReason(e.target.value)}
                    placeholder="Ex.: Trancamento semestral"
                  />
                </div>
                <Button type="submit" variant="dark">
                  Registrar trancamento
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Matrículas registradas no curso</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {enrollments.length === 0 ? (
              <p className="text-sm text-siac-muted">Nenhuma matrícula neste curso.</p>
            ) : (
              enrollments.map((enr) => (
                <div
                  key={enr.id}
                  className="rounded-lg border border-siac-border p-4 text-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold">
                      {enr.student_name} ({enr.student_institutional_id}) — Ingresso: {enr.enrollment_date}
                    </p>
                    <Badge variant={enr.status === 'COMPLETED' ? 'success' : 'info'}>
                      {enr.status}
                    </Badge>
                  </div>
                  {(suspensionsByEnr[enr.id]?.length ?? 0) > 0 && (
                    <ul className="mt-2 list-disc pl-5 text-xs text-siac-muted">
                      {suspensionsByEnr[enr.id].map((s) => (
                        <li key={s.id}>
                          Trancamento: {s.start_date} a {s.end_date} {s.reason ? `(${s.reason})` : ''}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </section>
    </AppLayout>
  )
}
