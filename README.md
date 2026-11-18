# SIAC-UTFPR

Sistema Integrado de Atividades Complementares da UTFPR.

## Stack

- Python 3.12 / Django 5.2
- Django REST Framework e SimpleJWT
- PostgreSQL 16
- Docker Compose
- Frontend React/Vite (o ZIP recebido contém apenas o diretório placeholder `frontend/`; o código-fonte React não estava presente no arquivo enviado).

## Inicialização local

1. Copie `.env.example` para `.env`.
2. Defina `SECRET_KEY`, `POSTGRES_PASSWORD` e `DB_PASSWORD` com valores locais seguros e iguais para a senha do PostgreSQL.
3. Inicie o banco e o backend:

```bash
docker compose up --build -d
docker compose exec backend python manage.py migrate
docker compose exec backend python manage.py createsuperuser
```

As migrações iniciais criam os schemas PostgreSQL `app` e `audit` automaticamente, antes das tabelas. Não apague o volume `postgres_data` para resolver problemas de migração.

As portas externas podem ser alteradas no `.env` por `BACKEND_PORT` e `POSTGRES_PORT`. As portas internas dos containers permanecem 8000 e 5432.

## Dados de demonstração

Com `DEBUG=True`, gere dados de desenvolvimento:

```bash
docker compose exec backend python manage.py seed_dev --password "Defina-Uma-Senha-Forte!"
```

O comando cria, de forma idempotente, um campus, curso, matrícula, grupo, item de atividade, um estudante, um professor, um coordenador e exemplos de submissões pendente/aprovada/rejeitada.

Contas criadas:
- `estudante@siac.local`
- `professor@siac.local`
- `coordenador@siac.local`

Todas recebem a senha informada no argumento `--password`. Não execute esse seed em produção.

## Autenticação

Login:

```http
POST /api/token/
Content-Type: application/json

{"email":"estudante@siac.local","password":"SUA_SENHA"}
```

Use o `access` em `Authorization: Bearer <token>`. Renove com `POST /api/token/refresh/`.

## Endpoints

| Método | Endpoint | Acesso | Finalidade |
|---|---|---|---|
| POST | `/api/register/` | Público | Cadastro de estudante |
| GET | `/api/campuses/` | Público | Campi ativos |
| GET | `/api/students/` | Professor ou coordenador | Estudantes ativos do campus |
| POST | `/api/token/` | Público | Login JWT |
| POST | `/api/token/refresh/` | Público | Renovar JWT |
| GET | `/api/me/` | Autenticado | Perfil e papéis |
| GET | `/api/courses/` | Autenticado | Cursos ativos do campus / cursos atribuídos ao professor |
| GET | `/api/enrollments/me/` | Estudante | Matrículas ativas do usuário |
| POST | `/api/enrollments/` | Professor responsável ou coordenador do campus | Vincular estudante a curso |
| GET | `/api/activity-items/?course_id=1` | Estudante matriculado ou responsável pelo curso | Grupos e itens selecionáveis |
| POST | `/api/submissions/` | Estudante | Enviar atividade e comprovante |
| GET | `/api/submissions/` | Estudante | Histórico próprio |
| GET | `/api/submissions/pending/` | Professor responsável ou coordenador do campus | Fila de avaliação |
| POST | `/api/submissions/{public_id}/evaluate/` | Professor responsável ou coordenador do campus | Avaliar submissão |
| GET | `/api/submissions/{public_id}/file/` | Dono da submissão ou avaliador autorizado | Abrir comprovante |
| GET | `/api/homologation/summary/` | Estudante | Pontuação, progresso e contagens |
| POST | `/api/homologation/{enrollment_id}/finalize/` | Professor responsável ou coordenador do campus | Homologar e gerar PDF |
| GET | `/api/homologation/{public_id}/report/` | Estudante dono ou avaliador autorizado | Baixar relatório PDF |
| GET | `/api/notifications/` | Autenticado | Notificações do usuário |
| PATCH | `/api/notifications/{public_id}/read/` | Dono da notificação | Marcar como lida |
| GET | `/api/opportunities/` | Autenticado | Oportunidades ativas do campus |
| POST | `/api/opportunities/` | Professor ou coordenador | Cadastrar oportunidade |

## Contratos principais

### Cadastro

`POST /api/register/` — `application/json`:

```json
{
  "full_name": "Nome do Estudante",
  "email": "estudante@exemplo.com",
  "institutional_id": "1234567",
  "campus": 1,
  "password": "UmaSenhaForte!2026",
  "confirmPassword": "UmaSenhaForte!2026"
}
```

O campo `campus` recebe o ID retornado por `GET /api/campuses/`. O cadastro público sempre cria apenas o papel `STUDENT`.

### Matrículas

`GET /api/enrollments/me/` retorna somente matrículas ativas do usuário autenticado.

A criação administrativa usa `POST /api/enrollments/`:

```json
{
  "student_id": 3,
  "course_id": 1,
  "enrollment_date": "2026-11-16"
}
```

A operação só é permitida ao professor responsável pelo curso ou ao coordenador SIAC do mesmo campus. O estudante não pode criar ou escolher sua própria matrícula.

### Catálogo

`GET /api/activity-items/?course_id=1` retorna grupos ativos com a lista `activities`. Cada item informa `id`, `code`, `description`, `points_per_unit`, `unit_name`, `max_points_semester`, `required_proof_description` e `is_selectable`.

### Envio de atividade

`POST /api/submissions/` — `multipart/form-data`:

| Campo | Tipo |
|---|---|
| `enrollment` | ID da matrícula do próprio estudante |
| `activity_item` | ID do item selecionado no catálogo |
| `description` | Texto |
| `activity_start_date` | `YYYY-MM-DD` |
| `activity_end_date` | `YYYY-MM-DD` |
| `semester` | `AAAA-1` ou `AAAA-2` |
| `declared_quantity` | Inteiro maior que zero |
| `file` | PDF, JPG ou PNG; máximo 10 MB |

O status inicial é sempre `PENDING`; o cliente não pode definir status nem pontos. O backend valida o conteúdo real do arquivo, não apenas sua extensão ou `Content-Type`.

### Avaliação

`POST /api/submissions/{public_id}/evaluate/`:

```json
{
  "decision": "APPROVED",
  "validated_quantity": 1,
  "feedback": "Atividade validada."
}
```

`decision` aceita `APPROVED` ou `REJECTED`. Rejeições exigem justificativa. Uma submissão só pode ser avaliada uma vez. A aprovação gera notificação ao estudante e registro de auditoria.

### Resumo de pontuação

`GET /api/homologation/summary/` retorna, por matrícula ativa, total aprovado, mínimo do curso, progresso por grupo, limites de pontuação por item e contagens de submissões aprovadas, pendentes e rejeitadas.

A homologação definitiva exige atingir o mínimo total do curso e o mínimo de cada grupo ativo, conforme os valores cadastrados nos modelos. O relatório é gerado em PDF e seu hash SHA-256 fica armazenado.

## Permissões

- Cadastro público cria somente estudante.
- Professor avalia e gerencia matrículas somente nos cursos em que é coordenador ou professor responsável.
- Coordenador SIAC atua somente no campus associado à sua conta.
- Estudante acessa somente matrículas, submissões, notificações e comprovantes próprios.
- Arquivos de comprovantes não são publicados por URL estática; o acesso passa por endpoint autenticado e autorizado.

## Observações

- O backend usa `django-cors-headers` e permite por padrão `http://localhost:5173` e `http://127.0.0.1:5173`; configure `CORS_ALLOWED_ORIGINS` no `.env` para outros endereços.
- Os schemas `app` e `audit` são criados idempotentemente no início das migrações iniciais de `accounts` e `audit`, sem adicionar dependência anterior às migrações já aplicadas.
- A integração com portal externo não está implementada; a homologação registra `portal_sync_status=NOT_CONFIGURED`.
- O ZIP recebido não continha os arquivos-fonte do frontend, então os contratos foram preparados a partir dos requisitos fornecidos e das APIs existentes, não de inspeção dos componentes React.
