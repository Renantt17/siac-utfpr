import { Link } from 'react-router-dom'
import { Award, Bell, CalendarDays, ClipboardCheck, FilePlus2, GraduationCap } from 'lucide-react'
import AppLayout from '../components/layout/AppLayout'
import { useAuth } from '../contexts/AuthContext'
import { Badge } from '../components/ui/badge'
import { Card, CardContent } from '../components/ui/card'

const ROLE_LABELS: Record<string, string> = {
  STUDENT: 'Estudante',
  PROFESSOR: 'Docente Responsável (PRAC)',
  COURSE_COORD: 'Coordenação de Curso',
  SIAC_COORD: 'Coordenador do SIAC-UTFPR',
}

export default function DashboardPage() {
  const { user } = useAuth()
  const roles = user?.roles ?? []

  return (
    <AppLayout>
      <section className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-utfpr-black">Painel inicial</h1>
          <p className="mt-2 text-siac-muted">Sistema Integrado de Atividades Complementares</p>
        </div>

        <Card>
          <CardContent className="space-y-4">
            <div className="h-1 w-16 rounded-full bg-utfpr-yellow" />
            <h2 className="text-xl font-semibold text-utfpr-black">
              Olá, {user?.full_name ?? 'usuário'}!
            </h2>
            <p className="text-sm text-siac-muted">
              Identificador: <strong>{user?.institutional_id}</strong> • {user?.campus_name} ({user?.campus})
            </p>
            <div className="flex flex-wrap gap-2">
              {roles.map((r) => (
                <Badge key={r} variant="warning">
                  {ROLE_LABELS[r] ?? r}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {roles.includes('STUDENT') && (
            <>
              <Link to="/atividades/nova" className="block">
                <Card className="h-full transition hover:border-utfpr-yellow">
                  <CardContent className="flex items-start gap-3">
                    <FilePlus2 className="mt-1 shrink-0 text-utfpr-black" size={22} aria-hidden="true" />
                    <div>
                      <h3 className="font-bold">Enviar atividade</h3>
                      <p className="mt-1 text-sm text-siac-muted">Submeta um novo certificado conforme a tabela do curso.</p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
              <Link to="/pontuacao" className="block">
                <Card className="h-full transition hover:border-utfpr-yellow">
                  <CardContent className="flex items-start gap-3">
                    <GraduationCap className="mt-1 shrink-0 text-utfpr-black" size={22} aria-hidden="true" />
                    <div>
                      <h3 className="font-bold">Minha pontuação</h3>
                      <p className="mt-1 text-sm text-siac-muted">Acompanhe metas por grupo (20 pts) e total (70 pts).</p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </>
          )}

          {roles.includes('PROFESSOR') && (
            <>
              <Link to="/avaliacoes/pendentes" className="block">
                <Card className="h-full transition hover:border-utfpr-yellow">
                  <CardContent className="flex items-start gap-3">
                    <ClipboardCheck className="mt-1 shrink-0 text-utfpr-black" size={22} aria-hidden="true" />
                    <div>
                      <h3 className="font-bold">Fila de avaliação</h3>
                      <p className="mt-1 text-sm text-siac-muted">Avalie comprovantes, solicite correções ou realize ajustes.</p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
              <Link to="/homologacoes" className="block">
                <Card className="h-full transition hover:border-utfpr-yellow">
                  <CardContent className="flex items-start gap-3">
                    <Award className="mt-1 shrink-0 text-utfpr-black" size={22} aria-hidden="true" />
                    <div>
                      <h3 className="font-bold">Homologações</h3>
                      <p className="mt-1 text-sm text-siac-muted">Verifique alunos aptos e emita o Relatório Final em PDF.</p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </>
          )}

          <Link to="/oportunidades" className="block">
            <Card className="h-full transition hover:border-utfpr-yellow">
              <CardContent className="flex items-start gap-3">
                <CalendarDays className="mt-1 shrink-0 text-utfpr-black" size={22} aria-hidden="true" />
                <div>
                  <h3 className="font-bold">Mural de oportunidades</h3>
                  <p className="mt-1 text-sm text-siac-muted">Veja cursos e eventos vigentes do seu campus e externos.</p>
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link to="/notificacoes" className="block">
            <Card className="h-full transition hover:border-utfpr-yellow">
              <CardContent className="flex items-start gap-3">
                <Bell className="mt-1 shrink-0 text-utfpr-black" size={22} aria-hidden="true" />
                <div>
                  <h3 className="font-bold">Notificações</h3>
                  <p className="mt-1 text-sm text-siac-muted">Acompanhe pareceres, ajustes e homologações.</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>
      </section>
    </AppLayout>
  )
}
