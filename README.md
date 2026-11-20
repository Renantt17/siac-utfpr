# SIAC-UTFPR (Versão Corrigida — Alinhada à Arquitetura)

Sistema Integrado de Atividades Complementares da UTFPR.

Esta branch (`fix/adequacao-arquitetural`) contém a versão corrigida e adequada à arquitetura oficial.

> **Referência de validação:** o diagnóstico completo das divergências encontradas na entrega anterior e das correções aplicadas está em [`docs/logs/05_Validacao_Arquitetural_Atual.md`](./docs/logs/05_Validacao_Arquitetural_Atual.md).

## Documentação (`docs/`)

- [`docs/arquitetura/`](./docs/arquitetura/) — Documentação arquitetural de referência ([`README.md`](./docs/arquitetura/README.md), [`Tecnologias.md`](./docs/arquitetura/Tecnologias.md), [`sequencias.md`](./docs/arquitetura/sequencias.md)). *(Nota: esses documentos refletem o planejamento original completo, incluindo itens fora do escopo MVP como OCI e propostas de oportunidades por estudantes.)*
- [`docs/db/`](./docs/db/) — Modelagem física e guia do PostgreSQL 16 ([`README.md`](./docs/db/README.md) e [`schema.sql`](./docs/db/schema.sql), espelhando o DDL executável em [`db/init/02_schema.sql`](./db/init/02_schema.sql)).
- [`docs/logs/`](./docs/logs/) — Relatórios de entrega: relatório atual de adequação ([`CORRECTION_DELIVERY_REPORT.md`](./docs/logs/CORRECTION_DELIVERY_REPORT.md)), validação arquitetural ([`05_Validacao_Arquitetural_Atual.md`](./docs/logs/05_Validacao_Arquitetural_Atual.md)) e registros históricos da entrega anterior em `develop` ([`BACKEND_DELIVERY_REPORT.md`](./docs/logs/BACKEND_DELIVERY_REPORT.md) e [`FRONTEND_API.md`](./docs/logs/FRONTEND_API.md)).
- [`docs/testes/`](./docs/testes/) — Relatório consolidado de testes unitários, integração, segurança e frontend ([`RELATORIO_TESTES.md`](./docs/testes/RELATORIO_TESTES.md)).

---

## 1. Estado Anterior (`develop` — entrega original, commit `e9b5f8e`)

Na entrega original da equipe, a aplicação já preservava a macroestrutura cliente-servidor via API REST (`React 18 + Vite + TypeScript + Tailwind` ↔ `Django 5.2 + DRF + SimpleJWT` ↔ `PostgreSQL 16`) e a organização do backend nos 6 apps de domínio (`accounts`, `courses`, `submissions`, `homologation`, `opportunities`, `audit`).

Contudo, em função do prazo curto de desenvolvimento, diversos mecanismos arquiteturais, fluxos de negócio e garantias de integridade foram simplificados ou deixados pendentes.

---

## 2. O que Faltava ou Estava Errado

### Banco de Dados e Integridade
- **`db/schema.sql` reduzido:** possuía apenas 9 linhas criando os schemas `app` e `audit` para uma role única `siac`, ignorando integralmente o [`docs/db/schema.sql`](./docs/db/schema.sql) oficial.
- **Ausência de defesa em profundidade no PostgreSQL:** não havia roles separadas (`siac_owner` / `siac_app`), triggers de validação, extensão `btree_gist` (trancamentos sem sobreposição), `app.fn_register_homologation`, FKs compostas com `GENERATED ALWAYS`, bloqueio otimista (`row_version`) nem imutabilidade *append-only* em `audit.audit_logs`.
- **Regras e tipos inconsistentes no ORM:** ausência de bloqueio de certificado duplicado (`file_hash_sha256`), ausência de validação de `activity_start_date >= enrollment_date` e trancamentos, matrícula não passava para `COMPLETED` após homologação, quantidades aceitavam apenas inteiros (`PositiveIntegerField`), formato de semestre `AAAA-1` em vez de `AAAA.1`, `ActivityItem` e `Notification.submission` e `Opportunity.campus` não aceitavam nulos (impedindo agrupadores `ii`/`viii`, notificações de homologação e eventos multicampus), e `Homologation.homologated_by` / `Opportunity.created_by` apontavam para `UserRole` em vez de `User`.

### Autenticação, Papéis e Arquitetura do Backend
- **Perfis e acesso fora do escopo MVP:** o papel `COURSE_COORD` havia sido removido (restando 3 papéis com `SIAC_COORD` renomeado para `SIAC_COORDINATOR`), foi adicionado auto-cadastro público (`/api/register/` e `/cadastro`) divergente do modelo de pré-cadastro em [`docs/db/README.md`](./docs/db/README.md), e o login aceitava apenas e-mail (sem RA).
- **Ausência da camada `services.py`:** toda a lógica de negócio estava acoplada diretamente em `views.py` e `serializers.py`.
- **Auditoria incompleta e manual:** gravava apenas avaliação e homologação via ORM, sem `before_snapshot`, sem `notes` e sem cobertura das demais entidades.
- **Processamento de mídia incompleto:** `Pillow` ausente (sem redimensionamento/compressão `< 500 KB` das imagens).
- **Rotas sem versionamento:** endpoints expostos em `/api/` em vez de `/api/v1/`.

### Fluxos Funcionais, Frontend e Contratos
- **Máquina de estados reduzida:** suportava apenas `PENDING`, `APPROVED` e `REJECTED` (faltavam `CORRECTION_REQUESTED`, `APPROVED_WITH_ADJUSTMENTS` com reenquadramento de item/semestre, edição/cancelamento pelo estudante e reenvio de correções).
- **Cálculo e teto semestral incompletos:** `calculated_points` não era calculado na criação e o teto semestral na avaliação não agregava subcategorias irmãs pelo `parent_item_id`.
- **Bug de contrato no histórico:** `MySubmissionsPage.tsx` lia `submission.feedback` enquanto o backend retornava `evaluator_feedback`.
- **Telas e fluxos ausentes no Frontend:** sem UI para vincular matrículas (`POST /enrollments/`), registrar trancamentos, homologar (`POST /homologation/.../finalize/`), confirmar relatório pelo aluno (`student_confirmed_at`), customizar Tabela de Pontuação, consultar indicadores da coordenação, gerenciar cursos/papéis/auditoria (`SIAC_COORD`) ou editar/encerrar oportunidades.
- **Stack e sessão no Frontend:** `Zod` estava instalado mas não utilizado; `shadcn/ui` (Radix UI) estava ausente; `authInterceptor.ts` duplicava o interceptor de request e não renovava token automaticamente em `401`.
- **Seed incompleto:** `seed_dev` criava apenas 1 curso com 1 grupo e 1 item, sem a Tabela Padrão da IN COENS-DV/UTFPR nº 3/2021.

### Infraestrutura e CI/CD
- **Ambiente apenas de desenvolvimento:** `docker-compose.yml` não montava o script do PostgreSQL em `/docker-entrypoint-initdb.d/`, `backend` rodava `manage.py runserver` (em vez de `Gunicorn`), `frontend` rodava `vite dev server` (sem `Nginx`, proxy reverso nem `X-Accel-Redirect`), sem volume dedicado para `media/` e sem rede isolada `siac_net`.
- **Sem CI/CD:** diretório `.github/` inexistente.

---

## 3. O que foi Adicionado, Editado, Removido e Corrigido

**Commit de referência:** `fix(siac-utfpr): adequação arquitetural e implementação de recursos faltantes/não utilizados`

### Adicionado
- **Banco e inicialização automática Docker (`db/init/`):**
  - `db/init/01_roles.sh`: cria `siac_owner` (`NOLOGIN`) e `siac_app` (`LOGIN` via `DB_PASSWORD`).
  - `db/init/02_schema.sql`: schema oficial completo de [`docs/db/schema.sql`](./docs/db/schema.sql) (14 tabelas, schemas `app`/`audit`, `btree_gist`, triggers, constraints e `app.fn_register_homologation`).
  - `db/init/03_public_grants.sql`: permissões do schema `public` para tabelas internas do Django e função `SECURITY DEFINER` `app.fn_delete_unused_activity_group`.
- **Camada `services.py` e utilitários de domínio no Backend:**
  - `services.py` nos 6 apps (`accounts`, `courses`, `submissions`, `homologation`, `opportunities`, `audit`).
  - `apps/accounts/context.py` (`set_db_audit_context` via `set_config('app.current_user_id' / 'app.client_ip', ..., true)`) e `apps/accounts/db_errors.py` (mapeamento uniforme de erros PostgreSQL para `400`/`403`/`409`).
  - `apps/courses/default_scoring_table.py` com a Tabela Padrão completa da IN COENS-DV/UTFPR nº 3/2021 (Grupos 1, 2 e 3, incluindo agrupadores `ii` e `viii`) e comando `manage.py seed_siac`.
  - Novos endpoints `/api/v1/` para gestão de usuários/papéis, CRUD de cursos/grupos/itens, trancamentos (`EnrollmentSuspension`), analytics da coordenação, edição/cancelamento/reenvio de submissões, candidatos à homologação, confirmação do relatório pelo estudante, edição/encerramento de oportunidades e consulta de logs em `audit.audit_logs`.
  - `backend/conftest.py` e testes integrados em todos os 6 apps executando `pytest` sobre PostgreSQL 16 inicializado com `02_schema.sql`.
- **Frontend (`shadcn/ui` + `Zod` + novas páginas):**
  - Componentes `shadcn/ui` (Radix UI Dialog, Tabs, Label, Slot + Tailwind) em `frontend/src/components/ui/` e schemas `Zod` em `frontend/src/schemas/index.ts`.
  - Novas páginas: `HomologationsPage.tsx`, `EnrollmentsPage.tsx`, `CourseManagementPage.tsx` e `SiacAdminPage.tsx`.
- **Infraestrutura e CI:**
  - `nginx/default.conf`, `frontend/Dockerfile` (build multi-stage para Nginx), `backend/entrypoint.sh` (`migrate` + `collectstatic` + `Gunicorn`), `docker-compose.dev.yml` (override opcional com hot-reload) e `.github/workflows/ci.yml`.

### Editado / Corrigido
- **Models Django (`managed = False`)** alinhados 1:1 com [`docs/db/schema.sql`](./docs/db/schema.sql) (incluindo `GeneratedField` para `calculated_points`, `db_column='password_hash'` no `User`, quantidades `Decimal(6,2)`, semestre `AAAA.1`/`AAAA.2`, `Notification.submission` e `Opportunity.campus` opcionais).
- **Autenticação e Papéis:** restaurados os 4 papéis (`STUDENT`, `PROFESSOR`, `COURSE_COORD`, `SIAC_COORD`) e implementado login híbrido por RA ou e-mail institucional (`/api/v1/auth/login/`).
- **Fluxo de Submissões e Avaliação:** ativados `Pillow` (`< 500 KB` para imagens, preservando PDFs), bloqueio de duplicidade `SHA-256`, validação de matrícula/trancamento, teto semestral compartilhado por `parent_item_id`, máquina de estados completa (`PENDING`, `CORRECTION_REQUESTED`, `APPROVED`, `APPROVED_WITH_ADJUSTMENTS`, `REJECTED`, `CANCELED`), correção de `evaluator_feedback` e comparativo *Original vs. Ajustado* em `MySubmissionsPage.tsx`.
- **Homologação:** `FinalizeHomologationView` / `homologation/services.py` agora chamam `app.fn_register_homologation`, impedem homologar com pendências, congelam a matrícula para `COMPLETED`, geram PDF consolidado com `ReportLab`, permitem confirmação pelo estudante e entregam arquivos com `X-Accel-Redirect` (e permissões `0644`/`0755` compatíveis com Nginx).
- **Oportunidades:** filtro de vigentes (`end_date >= hoje`), filtros por grupo/modalidade, priorização por campus do usuário e suporte a eventos globais/externos.
- **Interceptor JWT:** `authInterceptor.ts` corrigido com fila de refresh automático em respostas `401` e remoção do interceptor duplicado.
- **`docker-compose.yml`:** reestruturado com rede isolada `siac_net`, volumes `pgdata` e `media_data`, `db` com `/docker-entrypoint-initdb.d/`, `backend` com `Gunicorn` e `nginx` na porta `HTTP_PORT` (`8080`).

### Removido
- Removido o auto-cadastro público (`RegisterView` em `/api/register/`, `RegisterPage.tsx` em `/cadastro` e `registerService.ts`), utilizando em seu lugar o pré-cadastro de usuários no banco (conforme [`docs/db/README.md`](./docs/db/README.md)).
- Removidos `django.contrib.admin`, as migrations antigas incompatíveis com [`docs/db/schema.sql`](./docs/db/schema.sql), o `db/schema.sql` simplificado de 9 linhas e o antigo `seed_dev.py` (substituído por `seed_siac.py`).

### Mantido fora do escopo MVP (conforme definido)
- Hospedagem em nuvem (OCI Compute VM) e `OCI Object Storage (S3)` — substituídos por execução local via Docker Compose com volume persistente `media_data` e `Nginx`.
- Integração automática com o Portal Institucional da UTFPR — a homologação local conclui o fluxo completo com PDF e registra `portal_sync_status='PENDING_SYNC'`.

---

## 4. Como Executar e Utilizar

### Inicialização via Docker Compose (Stack Padrão: PostgreSQL 16 + Gunicorn + Nginx)

1. Copie `.env.example` para `.env` (caso ainda não exista) e configure `SECRET_KEY`, `POSTGRES_PASSWORD` e `DB_PASSWORD`:
   ```bash
   cp .env.example .env
   ```
   > **Observação:** caso a porta `5432` já esteja em uso no host, ajuste `POSTGRES_PORT=5433` no `.env`.

2. Suba os containers (`db`, `backend`, `nginx`):
   ```bash
   docker compose up --build -d
   ```

3. Carregue os dados iniciais (campi, usuários pré-cadastrados nos 4 papéis, curso `BES-DV` com a Tabela Padrão da IN COENS-DV/UTFPR nº 3/2021, trancamento e submissões de exemplo):
   ```bash
   docker compose exec backend python manage.py seed_siac --password "Defina-Uma-Senha-Forte!" --allow-prod
   ```
   *(Como o `.env.example` inicia com `DEBUG=False`, a flag `--allow-prod` é necessária para liberar o seed em testes locais.)*

4. Acesse a aplicação no navegador em: **`http://localhost:8080`**

### Contas de demonstração (`seed_siac`)

| Perfil | Login por RA / Identificador | Login por E-mail |
| :--- | :--- | :--- |
| **Estudante** | `a2500001` | `estudante@alunos.utfpr.edu.br` |
| **Docente PRAC** | `PRAC0001` | `prac.bes.dv@utfpr.edu.br` |
| **Coordenação de Curso** | `COORD001` | `coord.bes.dv@utfpr.edu.br` |
| **Coordenador SIAC** | `SIAC0001` | `siac.coord@utfpr.edu.br` |

### Modo Desenvolvimento com Hot-Reload (Opcional)

Para rodar o Vite Dev Server na porta `5173` com *hot-reload* junto ao backend:
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

### Comandos de Manutenção e Testes Automatizados

```bash
# Status e logs
docker compose ps
docker compose logs -f backend nginx

# Verificação Django e suíte Pytest (sobre PostgreSQL 16 + db/init/02_schema.sql)
docker compose exec backend python manage.py check
docker compose exec backend pytest -v

# Testes unitários, lint e build do frontend (Vitest + oxlint + Vite)
cd frontend && npm test && npm run lint && npm run build

# Parar os containers (ou parar limpando volumes para reiniciar do zero com down -v)
docker compose down
```
