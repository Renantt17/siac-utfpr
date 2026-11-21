# Validação Arquitetural do Estado Atual — SIAC-UTFPR

**Data da validação:** 20/11/2026  
**Escopo analisado:** Estado original da branch `develop` (commit `e9b5f8e`) comparado à documentação arquitetural do repositório em [`docs/arquitetura/`](../arquitetura/) ([`README.md`](../arquitetura/README.md), [`Tecnologias.md`](../arquitetura/Tecnologias.md), [`sequencias.md`](../arquitetura/sequencias.md)) e ao modelo físico de banco em [`docs/db/`](../db/) ([`README.md`](../db/README.md) e [`schema.sql`](../db/schema.sql)).  
**Tipo de análise:** Validação estática da arquitetura implementada na entrega anterior (sem execução de bateria de testes funcionais, integração ou segurança, prevista para a etapa posterior).

---

## 1. Resumo Executivo

A implementação da branch `develop` preservou a **macroestrutura cliente-servidor via API REST** e a **divisão modular do backend Django em 6 apps de domínio** (`accounts`, `courses`, `submissions`, `homologation`, `opportunities` e `audit`), além do frontend SPA em React + TypeScript + Vite + Tailwind CSS e banco PostgreSQL 16 em Docker Compose.

Contudo, em função do prazo reduzido de desenvolvimento, ocorreram **desvios arquiteturais relevantes** em relação ao que foi documentado em [`docs/arquitetura/`](../arquitetura/) e [`docs/db/`](../db/):

1. **Banco de Dados e Defesa em Profundidade:** Toda a camada ativa do PostgreSQL definida em [`docs/db/schema.sql`](../db/schema.sql) (roles `siac_owner`/`siac_app`, triggers de validação, trava de teto semestral, `btree_gist`, bloqueio otimista, função `fn_register_homologation` e auditoria imutável *append-only*) foi substituída por tabelas geradas diretamente pelo Django ORM sob uma role única (`siac`), mantendo apenas os dois schemas (`app` e `audit`).
2. **Simplificação de Papéis e Autenticação:** Os 4 perfis previstos foram reduzidos para 3 (`STUDENT`, `PROFESSOR`, `SIAC_COORDINATOR`), eliminando `COURSE_COORD`; foi incluído auto-cadastro público de estudantes (`/api/register/`), que não estava previsto no escopo inicial documentado em [`docs/arquitetura/sequencias.md`](../arquitetura/sequencias.md) (Aba 09) e [`docs/db/README.md`](../db/README.md), e o login passou a exigir exclusivamente `email` (sem suporte a login por RA).
3. **Ausência de Camada de Serviços (`services.py`):** As regras de negócio ficaram concentradas nas `views.py` e `serializers.py` em vez de isoladas em `services.py` por módulo.
4. **Infraestrutura de Produção e Armazenamento:** Não havia container `Nginx` (proxy reverso, HTTPS, `X-Accel-Redirect`), nem `Gunicorn` configurado no `CMD` do `Dockerfile` (usava `runserver`), nem integração com `OCI Object Storage (S3)` (usava disco local em `MEDIA_ROOT` sem volume dedicado no Compose), nem pipeline CI/CD (`.github/` ausente).
5. **Simplificação dos Fluxos de Negócio e Lacunas entre Backend e Frontend:** A máquina de estados das submissões foi reduzida de 6 estados para 3 (`PENDING`, `APPROVED`, `REJECTED`), sem solicitação de correção, edição/cancelamento pelo aluno ou status de aprovação com ajustes. Além disso, funcionalidades com endpoint pronto no backend (ex.: `POST /api/enrollments/`, `POST /api/homologation/{enrollment_id}/finalize/`) não possuíam interface no frontend, e a integração com o Portal da UTFPR estava marcada como `NOT_CONFIGURED`.

---

## 2. Validação da Estrutura Arquitetural e Implantação

### 2.1. Atores, Perfis e Fronteira ([`docs/arquitetura/README.md`](../arquitetura/README.md), [`sequencias.md`](../arquitetura/sequencias.md) e [`docs/db/README.md`](../db/README.md))

| Item Documentado | Estado Encontrado em `develop` (`e9b5f8e`) | Situação |
| :--- | :--- | :--- |
| **4 perfis:** `STUDENT`, `PROFESSOR` (PRAC), `COURSE_COORD`, `SIAC_COORD` | **3 perfis** em `backend/apps/accounts/models.py` (`User.Role`): `STUDENT`, `PROFESSOR`, `SIAC_COORDINATOR` | **Divergente** |
| Papel dedicado `COURSE_COORD` | Removido na migration `accounts/0002`; o vínculo `Course.coordinator` apontava para `User`, e `can_manage_course()` verificava `PROFESSOR` para `coordinator_id` ou `prac_professor_id` | **Divergente** |
| Usuários pré-cadastrados sem auto-cadastro público ([`docs/db/README.md`](../db/README.md)) | Implementado auto-cadastro público de estudante via `POST /api/register/` e tela `/cadastro` (`RegisterPage.tsx`) | **Divergente** |
| Login híbrido (RA para estudante / e-mail para servidor — [`sequencias.md`](../arquitetura/sequencias.md) Aba 09) | Autenticação padrão `TokenObtainPairView` com `USERNAME_FIELD = 'email'` apenas | **Divergente** |
| Integração com **Portal Institucional da UTFPR** | Não implementada; `FinalizeHomologationView` registrava `portal_sync_status = 'NOT_CONFIGURED'` (conforme [`BACKEND_DELIVERY_REPORT.md`](./BACKEND_DELIVERY_REPORT.md)) | **Não implementado** |

### 2.2. Containers e Orquestração ([`docs/arquitetura/README.md`](../arquitetura/README.md) e [`Tecnologias.md`](../arquitetura/Tecnologias.md))

| Container Documentado | Estado Encontrado em `docker-compose.yml` (`develop`) | Situação |
| :--- | :--- | :--- |
| **Frontend:** Build estático React servido por **Nginx** (proxy `/api/*`, `X-Accel-Redirect`) | Container `siac-frontend` (`node:22-alpine`) rodando **Vite Dev Server** (`npm run dev -- --host 0.0.0.0`) na porta `5173`; sem `Nginx` e sem `Dockerfile` de frontend | **Divergente (Dev only)** |
| **Backend:** `Django 5 + DRF + Gunicorn` | Container `backend` (`python:3.12-bookworm`) executando `python manage.py runserver 0.0.0.0:8000` (`backend/Dockerfile`); `gunicorn==27.0.1` constava em `requirements.txt`, mas não era utilizado | **Divergente (Dev only)** |
| **Database:** `PostgreSQL 16` na rede isolada `siac_net` | Container `db` (`postgres:16-bookworm`) com volume `postgres_data` na rede padrão do Compose (sem `siac_net` explícita) | **Parcial** |
| **Media Storage:** Armazenamento isolado / `OCI Object Storage` (S3) | Armazenamento em disco local (`MEDIA_ROOT = BASE_DIR / 'media'`) dentro do bind mount `./backend:/app`, sem volume dedicado para mídia e sem `django-storages`/`boto3` | **Divergente** |

### 2.3. Organização Interna do Monolito Modular ([`docs/arquitetura/README.md`](../arquitetura/README.md) e [`sequencias.md`](../arquitetura/sequencias.md))

| Aspecto Arquitetural | Estado Encontrado em `backend/apps/` (`develop`) | Impacto |
| :--- | :--- | :--- |
| Divisão nos 6 módulos (`accounts`, `courses`, `submissions`, `homologation`, `opportunities`, `audit`) | **Mantida.** Todos os 6 Django apps existiam em `backend/apps/` e estavam registrados em `INSTALLED_APPS`. | Conforme |
| Isolamento de regras de negócio em `services.py` por módulo ([`sequencias.md`](../arquitetura/sequencias.md)) | **Ausente.** Nenhum módulo possuía `services.py`. Regras transacionais, cálculos e validações residiam diretamente em `views.py` e `serializers.py`. | Alto acoplamento camada HTTP ↔ domínio |
| Módulo `audit` transversal recebendo logs das operações críticas | **Parcial.** `apps/audit/` possuía apenas `models.py` (`views.py` vazio). Os logs eram criados manualmente via `AuditLog.objects.create(...)` apenas em `EvaluateSubmissionView` e `FinalizeHomologationView`. | Cobertura incompleta de auditoria |
| Acoplamento entre módulos | `submissions` importava diretamente `Enrollment` (`courses`), `AuditLog` (`audit`) e `permissions` (`accounts`); `homologation` importava diretamente `Enrollment`, `Submission`, `AuditLog` e `permissions`. | Aceitável no monolito, porém sem fronteira de serviço |

### 2.4. Implantação e CI/CD ([`docs/arquitetura/Tecnologias.md`](../arquitetura/Tecnologias.md))

- **CI/CD (GitHub Actions):** O diretório `.github/` não existia na branch `develop`. Não havia esteira automatizada configurada para `pytest`, checagem de migrações ou build/deploy Docker.
- **Deploy e execução em produção:** Não havia artefatos de produção (`Nginx`, `Gunicorn` ativo, volume de mídia isolado ou bucket S3). O [`BACKEND_DELIVERY_REPORT.md`](./BACKEND_DELIVERY_REPORT.md) também registrava que a entrega inicial foi feita sem execução prévia de `pytest` ou `migrate` no ambiente de geração.

---

## 3. Validação da Stack Tecnológica ([`docs/arquitetura/Tecnologias.md`](../arquitetura/Tecnologias.md))

| Camada | Documentado | Encontrado em `develop` (`e9b5f8e`) | Situação |
| :--- | :--- | :--- | :--- |
| **Backend** | Python 3.12 + Django 5 + DRF + SimpleJWT | Python 3.12 (`Dockerfile`), Django `5.2.19`, DRF `3.18.3`, SimpleJWT `5.5.1`, `django-cors-headers 4.9.0` | **Conforme** |
| **Arquivos (Validação/Compressão)** | `filetype` + `Pillow` (compressão de imagens `< 500 KB`, PDFs intactos) | `filetype==1.2.0` implementado na validação por *magic bytes*. **`Pillow` ausente** do `requirements.txt` e do código (sem compressão/redimensionamento de imagens). | **Parcial** |
| **Geração de PDF** | `ReportLab` | `reportlab==5.1.0` usado em `FinalizeHomologationView._build_pdf()` e no comando `seed_dev`. | **Conforme** |
| **WSGI** | `Gunicorn` | Listado em `requirements.txt` (`27.0.1`), mas não utilizado no `Dockerfile` nem no `docker-compose.yml`. | **Não ativo** |
| **Banco** | PostgreSQL 16 + `btree_gist` | `postgres:16-bookworm` via `psycopg 3.3.9`. Extensão `btree_gist` não era instalada nem usada. | **Parcial** |
| **Storage S3** | `django-storages` + `boto3` (OCI Object Storage) | Ausentes do `requirements.txt` e `settings.py`. | **Não implementado** |
| **Frontend Core** | React 18 + Vite + TypeScript | React `18.3.1`, Vite `8.3.6`, TypeScript `~7.0.2`, `react-router-dom 7.18.5`, `axios 1.21.1`. | **Conforme** |
| **Validação Client-Side** | `Zod` | `zod` constava no `package.json` (`^4.6.7`), mas **não era importado em nenhum arquivo** de `frontend/src/`. Validações eram manuais (`utils/submissionValidation.ts`, etc.). | **Não utilizado** |
| **UI / Estilização** | Tailwind CSS + `shadcn/ui` (Radix UI) | Tailwind CSS `4.3.5` (`@tailwindcss/vite`) + `lucide-react`. **`shadcn/ui` / Radix UI ausentes**; UI usava apenas elementos HTML nativos estilizados com Tailwind. | **Parcial** |
| **Testes** | `Pytest` + `pytest-django` | `pytest==9.2.0`, `pytest-django==4.14.0`, `pytest.ini` configurados; testes de API escritos em `apps/*/tests.py` usando `APITestCase`. | **Conforme** |

---

## 4. Validação do Banco de Dados e Integridade ([`docs/db/schema.sql`](../db/schema.sql) e [`docs/db/README.md`](../db/README.md))

Esta era a área com a **maior divergência arquitetural** entre o especificado e o implementado na branch `develop`:

### 4.1. Infraestrutura de Schemas, Roles e DDL

- **`db/schema.sql` (`develop`) vs. [`docs/db/schema.sql`](../db/schema.sql):** O arquivo `db/schema.sql` em `develop` possuía apenas 9 linhas (`CREATE SCHEMA IF NOT EXISTS app/audit` + `GRANT USAGE, CREATE ... TO siac`). Todas as 14 tabelas passaram a ser criadas via **Django Migrations** (`0001_initial.py` em `accounts` e `audit` também executavam `CREATE SCHEMA IF NOT EXISTS app/audit`).
- **Roles de Banco:** As roles separadas `siac_owner` e `siac_app` (princípio do menor privilégio) não existiam; a aplicação conectava como a role única `siac` com `search_path=public` (`backend/config/settings.py`).
- **Ausência total de Triggers, Functions e Constraints Avançadas no PostgreSQL:**
  - Não existia a função `app.fn_register_homologation`.
  - Não existia `audit.fn_prevent_audit_mutation` nem os triggers *append-only* (`UPDATE`/`DELETE`/`TRUNCATE` bloqueados) em `audit.audit_logs`.
  - Não existia `pg_advisory_xact_lock` no banco (a serialização era feita via ORM com `select_for_update()` em `Enrollment` e `Submission` nas views de avaliação e homologação).
  - Não existiam colunas `GENERATED ALWAYS AS (...) STORED` nem chaves estrangeiras compostas para garantia declarativa de papel (`PROFESSOR`, `COURSE_COORD`, `STUDENT`) ou hierarquia de itens; na migration `courses/0002`, os campos `coordinator_role`, `prac_role` e `student_role` foram inclusive removidos dos models `Course` e `Enrollment`.

### 4.2. Divergências Específicas nos Models e Regras de Integridade

1. **Bloqueio de duplicidade de certificados (`file_hash_sha256`):**
   - *Documentado ([`docs/db/schema.sql`](../db/schema.sql)):* Índice único parcial `uq_submissions_active_file_hash` impedindo reenvio do mesmo arquivo ativo na matrícula.
   - *Encontrado em `develop`:* `SubmissionCreateSerializer.create()` calculava e salvava `file_hash_sha256`, mas **não havia constraint nem validação impedindo o reenvio do mesmo certificado**.
2. **Período de trancamento e validade temporal (`EnrollmentSuspension`):**
   - *Documentado ([`docs/db/schema.sql`](../db/schema.sql) e [`docs/db/README.md`](../db/README.md)):* Restrição GiST `ex_suspensions_no_overlap` e trigger impedindo atividades anteriores à `enrollment_date` ou sobrepostas a trancamentos.
   - *Encontrado em `develop`:* O model `EnrollmentSuspension` existia em `backend/apps/courses/models.py`, mas sem GiST, sem endpoints e **sem validação de `activity_start_date >= enrollment_date` nem de trancamento** ao criar submissões.
3. **Congelamento pós-homologação:**
   - *Documentado ([`docs/db/schema.sql`](../db/schema.sql)):* Ao homologar, a matrícula passa a `COMPLETED` e novas submissões são bloqueadas.
   - *Encontrado em `develop`:* `FinalizeHomologationView` não alterava `Enrollment.status` para `'COMPLETED'`, mantendo-a `'ACTIVE'`.
4. **Inconsistência nas FKs de `Homologation` e `Opportunity`:**
   - Em `backend/apps/homologation/models.py`, `homologated_by` apontava para `accounts.UserRole` (PK `id` da tabela associativa), e não para `User` com validação de papel como em [`docs/db/schema.sql`](../db/schema.sql). O mesmo ocorria em `Opportunity.created_by` (`backend/apps/opportunities/models.py`).
5. **Restrições de tipo e nulabilidade incompatíveis com [`docs/db/schema.sql`](../db/schema.sql):**
   - `Submission.declared_quantity` e `validated_quantity` usavam `PositiveIntegerField` (impedindo quantidades fracionárias, embora [`docs/db/schema.sql`](../db/schema.sql) preveja `NUMERIC(6,2)`).
   - `Submission.original_activity_item`, `original_semester` e `original_declared_quantity` ficavam `NULL` na criação (`SubmissionCreateSerializer.create()` não os preenchia).
   - `ActivityItem.points_per_unit`, `max_points_semester` e `required_proof_description` eram `NOT NULL` no ORM, impossibilitando cadastrar itens agrupadores com `is_selectable=False` e `points_per_unit=NULL` ou itens sem limite semestral (`max_points_semester=NULL`).
   - `Notification.submission` era `NOT NULL`, impedindo notificações independentes de uma submissão (como conclusão de homologação).
   - `Opportunity.campus` era `NOT NULL`, impedindo oportunidades globais/multicampus (`campus_id IS NULL`).
   - `Enrollment` possuía `UniqueConstraint(fields=['student', 'course'])` global em vez de índice único parcial `WHERE status = 'ACTIVE'`, impedindo histórico de reingresso no mesmo curso.

---

## 5. Validação dos Fluxos Comportamentais e Contratos de API ([`docs/arquitetura/sequencias.md`](../arquitetura/sequencias.md))

### 5.1. Convenções Gerais de API

- **Versionamento de rotas:** Documentado em [`docs/arquitetura/sequencias.md`](../arquitetura/sequencias.md) com prefixo `/api/v1/...`; implementado em `develop` como `/api/...` (`backend/config/urls.py`).
- **Formato de `semester`:** Documentado em [`docs/db/schema.sql`](../db/schema.sql) como `AAAA.1` / `AAAA.2`; implementado em `develop` como `AAAA-1` / `AAAA-2` (regex `\d{4}-[12]`).

### 5.2. Fluxo por Processo ([`docs/arquitetura/sequencias.md`](../arquitetura/sequencias.md) Abas 01 a 09)

| Fluxo Documentado | Estado no Backend (`develop`) | Estado no Frontend (`develop`) | Lacunas / Desvios |
| :--- | :--- | :--- | :--- |
| **01 — Cadastro e Classificação de Submissões** | `GET /api/activity-items/?course_id=`, `POST /api/submissions/` | `NewSubmissionPage.tsx` (com rascunho em `localStorage` e `FilePreview`) | Não calculava nem exibia pontuação estimada/aviso de teto semestral na criação (`calculated_points` ficava `0` até a avaliação); catálogo retornava apenas `is_selectable=True` sem agrupamento por item-pai. |
| **02 — Avaliação e Decisões** | `GET /api/submissions/pending/`, `POST /api/submissions/{public_id}/evaluate/` | `PendingSubmissionsPage.tsx` + `EvaluationForm.tsx` | Suportava apenas **`APPROVED`** e **`REJECTED`**. Faltavam **`CORRECTION_REQUESTED`** e **`APPROVED_WITH_ADJUSTMENTS`** (reenquadramento de item/semestre). Na avaliação `APPROVED`, o teto semestral somava apenas o mesmo `activity_item` (não considerava `parent_item_id` para tetos compartilhados). |
| **03 — Edição, Cancelamento e Correção/Reenvio** | Não implementado | Não implementado | Estudante não conseguia editar/cancelar submissão `PENDING` nem corrigir/reenviar submissão devolvida. |
| **04 — Situação, Histórico e Progresso** | `GET /api/submissions/`, `GET /api/homologation/summary/` | `MySubmissionsPage.tsx`, `ScorePage.tsx` | Faltava filtro combinado (status, grupo, semestre) e extrato agrupado por semestre/grupo. **Bug de contrato detectado:** `MySubmissionsPage.tsx` lia `submission.feedback`, mas `SubmissionHistorySerializer` enviava `evaluator_feedback`. |
| **05 — Homologação Final e Portal UTFPR** | `POST /api/homologation/{enrollment_id}/finalize/`, `GET /api/homologation/{public_id}/report/` | `ScorePage.tsx` (apenas exibição de resumo e download do PDF); `homologationService.finalize` existia no service mas **sem tela/botão** | Sem UI para o docente acionar `finalize`; sem confirmação pelo estudante (`student_confirmed_at`); backend não impedia homologar com submissões `PENDING` em aberto; `portal_sync_status` fixo em `NOT_CONFIGURED`. |
| **06 — Mural de Oportunidades** | `GET /api/opportunities/`, `POST /api/opportunities/` | `OpportunitiesPage.tsx` | Restrito apenas ao campus do usuário (sem ordenação multicampus); não filtrava oportunidades expiradas (`end_date < hoje`); não havia edição/encerramento nem fluxo de propostas externas por estudantes. |
| **07 — Gestão da Coordenação e Matrículas** | `GET /api/students/`, `GET /api/courses/`, `POST /api/enrollments/` | **Sem telas administrativas** | `POST /api/enrollments/` não era consumido pelo frontend; não existiam endpoints nem telas para CRUD de cursos, customização da Tabela de Pontuação (grupos/itens), gestão de papéis nem painel de indicadores/analytics. |
| **08 — Segurança e Auditoria** | JWT, throttling, magic bytes, download autenticado (`FileResponse`), `public_id` UUID | `ProtectedRoute`, `RoleProtectedRoute`, `openSubmissionFile` via Blob | `AuditLog` registrava apenas avaliação (`action='EVALUATE'`, `entity_type='Submission'`, sem `before_snapshot` nem `notes`) e homologação (`action='FINALIZE'`). Não havia `before/after` nas demais entidades nem contexto de auditoria para triggers. |
| **09 — Autenticação e Sessão** | `POST /api/token/`, `POST /api/token/refresh/`, `GET /api/me/`, `POST /api/register/` | `LoginPage.tsx`, `RegisterPage.tsx`, `AuthContext.tsx`, `authInterceptor.ts` | Login apenas por e-mail (sem RA). `authInterceptor.ts` apenas repetia o interceptor de `request` já existente em `api.ts` e **não implementava refresh automático em respostas `401`** (a renovação ocorria apenas no carregamento inicial da aplicação em `AuthContext.tsx`). |

---

## 6. Achados Adicionais de Integração e Operação Identificados na Análise

1. **Incompatibilidade de campo no histórico do estudante (`MySubmissionsPage.tsx` vs. `SubmissionHistorySerializer`):** o backend serializava `evaluator_feedback`, enquanto a página do estudante lia `submission.feedback`, impedindo a exibição dos pareceres na tabela.
2. **Carga inicial (`seed_dev`):** a branch `develop` possuía apenas `manage.py seed_dev` (restrito a `DEBUG=True`) com 1 curso (`DEMO-SIAC`), 1 grupo e 1 item de atividade, sem a Tabela de Pontuação Padrão completa prevista para os cursos.
3. **Ausência de interface de matrícula no frontend:** mesmo existindo `POST /api/enrollments/`, não havia tela no React para o professor/coordenador vincular alunos.
4. **Ausência de interface de homologação no frontend:** o disparo de `POST /api/homologation/{enrollment_id}/finalize/` não possuía tela ou ação docente na UI.
5. **Incompatibilidade entre o schema gerado pelo Django e [`docs/db/schema.sql`](../db/schema.sql):** as funções, triggers, constraints GiST, formato `AAAA.1`, status `APPROVED_WITH_ADJUSTMENTS` e `app.fn_register_homologation` documentados em [`docs/db/`](../db/) não existiam no banco criado pelas migrations de `develop`.

---

## 7. Recomendações de Alinhamento Arquitetural (Aplicadas na Branch `fix/adequacao-arquitetural`)

### 7.1. Correções Imediatas de Arquitetura, Banco e Fluxos
- Inicializar o PostgreSQL diretamente com [`docs/db/schema.sql`](../db/schema.sql) (roles `siac_owner`/`siac_app`, triggers, GiST, `fn_register_homologation`, auditoria *append-only*) e alinhar os models Django (`managed = False`), `semester` (`AAAA.1`/`AAAA.2`) e quantidades decimais (`NUMERIC(6,2)`).
- Remover o auto-cadastro público (`/api/register/` e `/cadastro`), restaurar os 4 papéis (`STUDENT`, `PROFESSOR`, `COURSE_COORD`, `SIAC_COORD`) e implementar login híbrido por RA ou e-mail institucional.
- Extrair a camada `services.py` nos 6 módulos do backend, ativar `Pillow` para compressão de imagens `< 500 KB` e completar a máquina de estados (`PENDING`, `CORRECTION_REQUESTED`, `APPROVED`, `APPROVED_WITH_ADJUSTMENTS`, `REJECTED`, `CANCELED`) com reenvio, edição/cancelamento e teto semestral compartilhado por `parent_item_id`.
- Corrigir `evaluator_feedback` e o interceptor `401` em `authInterceptor.ts`, adotar `Zod` + `shadcn/ui` e implementar as telas faltantes (matrículas/trancamentos, homologação, gestão de curso/tabela/indicadores e administração SIAC).

### 7.2. Infraestrutura Local de Execução e CI
- Configurar `backend/Dockerfile` com **Gunicorn** (em vez de `runserver`), build estático do frontend servido via **Nginx** (proxy `/api/v1/` e `X-Accel-Redirect`), volume persistente dedicado `media_data` e rede isolada `siac_net`.
- Estruturar pipeline de CI no GitHub Actions executando `python manage.py check`, `pytest` (sobre o PostgreSQL inicializado com `schema.sql`), `npm run lint` e `npm run build`.
- Manter fora do escopo MVP, conforme definição do projeto, apenas hospedagem OCI, `OCI Object Storage (S3)` e integração automática com o Portal Institucional da UTFPR.
