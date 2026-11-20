import { useCallback, useEffect, useState, type FormEvent } from 'react'
import AppLayout from '../components/layout/AppLayout'
import { useAuth } from '../contexts/AuthContext'
import activityCatalogService, { type ActivityGroup } from '../services/activityCatalogService'
import courseService, { type Course, type CourseAnalytics } from '../services/courseService'
import { Alert, Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Input, Label } from '../components/ui/input'
import { Select } from '../components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'

export default function CourseManagementPage() {
  const { user } = useAuth()
  const isSiacCoord = Boolean(user?.roles.includes('SIAC_COORD'))
  const [courses, setCourses] = useState<Course[]>([])
  const [selectedCourseId, setSelectedCourseId] = useState('')
  const [analytics, setAnalytics] = useState<CourseAnalytics | null>(null)
  const [groups, setGroups] = useState<ActivityGroup[]>([])

  const [minTotal, setMinTotal] = useState('')
  const [newGroupNum, setNewGroupNum] = useState('4')
  const [newGroupTitle, setNewGroupTitle] = useState('')
  const [newGroupMin, setNewGroupMin] = useState('10.00')

  const [itemGroupId, setItemGroupId] = useState('')
  const [itemCode, setItemCode] = useState('')
  const [itemDesc, setItemDesc] = useState('')
  const [itemPts, setItemPts] = useState('5.00')
  const [itemUnit, setItemUnit] = useState('Evento')
  const [itemMaxSem, setItemMaxSem] = useState('10.00')
  const [itemProof, setItemProof] = useState('Declaração ou Certificado')

  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    void courseService
      .list()
      .then((list) => {
        setCourses(list)
        if (list.length > 0) {
          setSelectedCourseId(String(list[0].id))
          setMinTotal(list[0].min_total_points)
        }
      })
      .catch(() => setError('Não foi possível carregar os cursos.'))
  }, [])

  const loadCourseData = useCallback(async () => {
    if (!selectedCourseId) return
    const cid = Number(selectedCourseId)
    try {
      const [an, tbl] = await Promise.all([
        courseService.getAnalytics(cid),
        activityCatalogService.scoringTable(cid, true),
      ])
      setAnalytics(an)
      setGroups(tbl)
      if (tbl.length > 0 && !itemGroupId) setItemGroupId(String(tbl[0].id))
      const found = courses.find((c) => c.id === cid)
      if (found) setMinTotal(found.min_total_points)
    } catch {
      setError('Não foi possível carregar indicadores e tabela do curso.')
    }
  }, [selectedCourseId, courses, itemGroupId])

  useEffect(() => {
    void loadCourseData()
  }, [loadCourseData])

  async function handleUpdateCourseMin(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess('')
    try {
      await courseService.updateCourse(Number(selectedCourseId), { min_total_points: minTotal })
      setSuccess('Meta mínima total do curso atualizada.')
      await loadCourseData()
    } catch {
      setError('Não foi possível atualizar a meta do curso.')
    }
  }

  async function handleCreateGroup(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess('')
    try {
      await courseService.createGroup(Number(selectedCourseId), {
        group_number: Number(newGroupNum),
        title: newGroupTitle,
        min_points: newGroupMin,
      })
      setSuccess('Grupo adicionado à tabela do curso.')
      setNewGroupTitle('')
      await loadCourseData()
    } catch {
      setError('Não foi possível criar o grupo.')
    }
  }

  async function handleDeleteGroup(groupId: number) {
    if (!window.confirm('Remover grupo (ou desativar caso já possua submissões)?')) return
    try {
      const res = await courseService.deleteGroup(Number(selectedCourseId), groupId)
      setSuccess(
        res.outcome === 'DELETED'
          ? 'Grupo removido fisicamente.'
          : 'Grupo desativado logicamente (há submissões vinculadas).'
      )
      await loadCourseData()
    } catch {
      setError('Não foi possível remover o grupo.')
    }
  }

  async function handleCreateItem(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess('')
    try {
      await courseService.createItem(Number(selectedCourseId), Number(itemGroupId), {
        code: itemCode,
        description: itemDesc,
        points_per_unit: itemPts,
        unit_name: itemUnit,
        max_points_semester: itemMaxSem || null,
        required_proof_description: itemProof,
        is_selectable: true,
      })
      setSuccess('Modalidade adicionada à tabela.')
      setItemCode('')
      setItemDesc('')
      await loadCourseData()
    } catch {
      setError('Não foi possível adicionar a modalidade.')
    }
  }

  async function toggleItemActive(itemId: number, current: boolean) {
    try {
      await courseService.updateItem(Number(selectedCourseId), itemId, { is_active: !current })
      await loadCourseData()
    } catch {
      setError('Não foi possível alterar o status do item.')
    }
  }

  const selectedCourse = courses.find((c) => String(c.id) === selectedCourseId)
  const canSwitchCourse = isSiacCoord && courses.length > 1

  return (
    <AppLayout>
      <section className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-utfpr-black">Gestão de Curso e Tabela</h1>
            <p className="mt-2 text-siac-muted">
              Indicadores da coordenação e customização da Tabela de Pontuação por curso.
            </p>
          </div>
          <div className="min-w-72 max-w-md">
            <Label htmlFor="coord-course">
              {canSwitchCourse ? 'Curso selecionado' : 'Curso vinculado'}
            </Label>
            {canSwitchCourse ? (
              <Select
                id="coord-course"
                value={selectedCourseId}
                onChange={(e) => setSelectedCourseId(e.target.value)}
              >
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.code})
                  </option>
                ))}
              </Select>
            ) : (
              <div
                id="coord-course"
                aria-readonly="true"
                className="mt-1.5 select-none rounded-lg border border-siac-border bg-gray-100 px-3 py-2 text-sm font-medium text-gray-800"
              >
                {selectedCourse
                  ? `${selectedCourse.name} (${selectedCourse.code})`
                  : 'Carregando curso...'}
              </div>
            )}
          </div>
        </div>

        {success && <Alert variant="success">{success}</Alert>}
        {error && <Alert variant="danger">{error}</Alert>}

        <Tabs defaultValue="analytics">
          <TabsList>
            <TabsTrigger value="analytics">Indicadores e Estudantes</TabsTrigger>
            <TabsTrigger value="table">Tabela de Pontuação</TabsTrigger>
          </TabsList>

          <TabsContent value="analytics" className="space-y-4">
            {analytics && (
              <>
                <div className="grid gap-4 sm:grid-cols-4">
                  <Card>
                    <CardContent>
                      <p className="text-xs text-siac-muted">Pendentes</p>
                      <p className="text-2xl font-bold">{analytics.submissions_summary.PENDING ?? 0}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent>
                      <p className="text-xs text-siac-muted">Aprovadas (+ Ajustes)</p>
                      <p className="text-2xl font-bold">
                        {(analytics.submissions_summary.APPROVED ?? 0) +
                          (analytics.submissions_summary.APPROVED_WITH_ADJUSTMENTS ?? 0)}
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent>
                      <p className="text-xs text-siac-muted">Em Correção / Indeferidas</p>
                      <p className="text-2xl font-bold">
                        {(analytics.submissions_summary.CORRECTION_REQUESTED ?? 0) +
                          (analytics.submissions_summary.REJECTED ?? 0)}
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent>
                      <p className="text-xs text-siac-muted">Aptos / Homologados</p>
                      <p className="text-2xl font-bold">
                        {analytics.eligible_count} / {analytics.homologated_count}
                      </p>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle>Progresso dos estudantes ({analytics.students_count})</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {analytics.students.map((st) => (
                      <div key={st.enrollment_id} className="rounded-lg border border-siac-border p-3 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold">
                            {st.student_name} ({st.institutional_id})
                          </span>
                          <div className="flex flex-wrap gap-2">
                            <Badge variant="default">
                              {st.total_approved_points} / {st.required_min_total_points} pts
                            </Badge>
                            {st.homologated && <Badge variant="success">Homologado</Badge>}
                            {st.eligible && <Badge variant="warning">Apto</Badge>}
                          </div>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {st.groups.map((g) => (
                            <span key={g.group_id} className="text-xs text-siac-muted">
                              G{g.group_number}: {g.approved_points}/{g.required_min_points}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          <TabsContent value="table" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Meta Total do Curso</CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={(e) => void handleUpdateCourseMin(e)} className="space-y-4">
                    <div>
                      <Label htmlFor="min-total">Meta mínima total (pontos)</Label>
                      <Input
                        id="min-total"
                        type="number"
                        step="0.5"
                        value={minTotal}
                        onChange={(e) => setMinTotal(e.target.value)}
                      />
                    </div>
                    <Button type="submit">Salvar meta do curso</Button>
                  </form>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Novo Grupo de Pontuação</CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={(e) => void handleCreateGroup(e)} className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label htmlFor="ng-num">Número</Label>
                        <Input
                          id="ng-num"
                          type="number"
                          min="1"
                          value={newGroupNum}
                          onChange={(e) => setNewGroupNum(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label htmlFor="ng-min">Mínimo (pts)</Label>
                        <Input
                          id="ng-min"
                          type="number"
                          step="0.5"
                          value={newGroupMin}
                          onChange={(e) => setNewGroupMin(e.target.value)}
                        />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="ng-title">Título do grupo</Label>
                      <Input
                        id="ng-title"
                        required
                        value={newGroupTitle}
                        onChange={(e) => setNewGroupTitle(e.target.value)}
                      />
                    </div>
                    <Button type="submit" variant="dark">
                      Adicionar grupo
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Adicionar modalidade em um grupo</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={(e) => void handleCreateItem(e)} className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <Label htmlFor="ni-grp">Grupo</Label>
                    <Select id="ni-grp" value={itemGroupId} onChange={(e) => setItemGroupId(e.target.value)}>
                      {groups.map((g) => (
                        <option key={g.id} value={g.id}>
                          Grupo {g.group_number}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="ni-code">Código (ex.: xxvi)</Label>
                    <Input id="ni-code" required value={itemCode} onChange={(e) => setItemCode(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="ni-pts">Pontos/unidade</Label>
                    <Input
                      id="ni-pts"
                      type="number"
                      step="0.1"
                      required
                      value={itemPts}
                      onChange={(e) => setItemPts(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="ni-unit">Unidade</Label>
                    <Input id="ni-unit" required value={itemUnit} onChange={(e) => setItemUnit(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="ni-max">Máx./Sem. (vazio = sem limite)</Label>
                    <Input
                      id="ni-max"
                      type="number"
                      step="0.5"
                      value={itemMaxSem}
                      onChange={(e) => setItemMaxSem(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="ni-proof">Comprovação</Label>
                    <Input id="ni-proof" required value={itemProof} onChange={(e) => setItemProof(e.target.value)} />
                  </div>
                  <div className="sm:col-span-3">
                    <Label htmlFor="ni-desc">Descrição da atividade</Label>
                    <Input id="ni-desc" required value={itemDesc} onChange={(e) => setItemDesc(e.target.value)} />
                  </div>
                  <div>
                    <Button type="submit">Adicionar item</Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            {groups.map((g) => (
              <Card key={g.id}>
                <CardHeader className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <CardTitle>
                      Grupo {g.group_number} — {g.title}
                    </CardTitle>
                    <p className="text-xs text-siac-muted">
                      Mínimo: {g.min_points} pts • {g.is_active ? 'Ativo' : 'Inativo'}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => void handleDeleteGroup(g.id)}
                  >
                    Remover / Desativar
                  </Button>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {g.activities.map((it) => (
                    <div
                      key={it.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded border border-siac-border px-3 py-2"
                    >
                      <div>
                        <strong>{it.code}</strong> — {it.description}{' '}
                        {it.is_selectable ? (
                          <span className="text-xs text-siac-muted">
                            ({it.points_per_unit} pts/{it.unit_name}, Máx./Sem.:{' '}
                            {it.effective_max_points_semester ?? 'Sem limite'})
                          </span>
                        ) : (
                          <Badge variant="info">Agrupador (Máx./Sem. {it.max_points_semester})</Badge>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void toggleItemActive(it.id, it.is_active)}
                      >
                        {it.is_active ? 'Desativar' : 'Reativar'}
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </TabsContent>
        </Tabs>
      </section>
    </AppLayout>
  )
}
