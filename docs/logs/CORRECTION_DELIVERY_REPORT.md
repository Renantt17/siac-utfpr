# Relatório de Entrega e Adequação Arquitetural — SIAC-UTFPR

**Data:** 20/11/2026  
**Branch:** `fix/adequacao-arquitetural`  
**Referência:** `fix(siac-utfpr): adequação arquitetural e implementação de recursos faltantes/não utilizados`  
**Base anterior analisada:** branch `develop` (commit `e9b5f8e`), auditada em [05_Validacao_Arquitetural_Atual.md](./05_Validacao_Arquitetural_Atual.md).

---

## 1. Resumo da Correção

Esta entrega alinha a aplicação à arquitetura definida em [docs/arquitetura/](../arquitetura/) e ao modelo físico em [docs/db/](../db/), preservando fora do escopo MVP apenas hospedagem em nuvem (OCI Compute VM), armazenamento `OCI Object Storage (S3)` e integração externa com o Portal Institucional da UTFPR.

---

## 2. Principais Entregas por Camada

### 2.1. Banco de Dados (`db/init/`)
- Substituído o script simplificado de 9 linhas pela inicialização automática do PostgreSQL 16 via `docker-entrypoint-initdb.d/`:
  - `db/init/01_roles.sh`: criação das roles `siac_owner` (`NOLOGIN`) e `siac_app` (`LOGIN`).
  - `db/init/02_schema.sql`: schema oficial completo (schemas `app` e `audit`, 14 tabelas, `btree_gist`, FKs compostas com `GENERATED ALWAYS`, triggers de validação/concorrência/teto semestral, `app.fn_register_homologation` e `audit.audit_logs` imutável *append-only*).
  - `db/init/03_public_grants.sql`: privilégios no schema `public` para tabelas internas do Django e função `SECURITY DEFINER` `app.fn_delete_unused_activity_group`.

### 2.2. Backend (`backend/`)
- **Models ORM (`managed = False`)** mapeados 1:1 para [`docs/db/schema.sql`](../db/schema.sql), incluindo `GeneratedField` em `Submission.calculated_points`, `password` em `password_hash`, formato `AAAA.1`/`AAAA.2` e quantidades `NUMERIC(6,2)`.
- **Camada de serviços (`services.py`)** extraída em todos os 6 apps (`accounts`, `courses`, `submissions`, `homologation`, `opportunities`, `audit`), além de `context.py` (`set_config` de `app.current_user_id` e `app.client_ip`) e `db_errors.py`.
- **Autenticação e Papéis (MVP):** removido auto-cadastro público (`/register/`); implementado login híbrido por RA ou e-mail em `/api/v1/auth/login/`; restaurados os 4 papéis (`STUDENT`, `PROFESSOR`, `COURSE_COORD`, `SIAC_COORD`).
- **Regras de Submissão, Avaliação e Homologação:**
  - Validação binária (`filetype`) + compressão de imagens `< 500 KB` (`Pillow`, mantendo PDFs intactos) + unicidade ativa por `SHA-256` + validação de `enrollment_date` e `EnrollmentSuspension`.
  - Máquina de estados completa (`PENDING`, `CORRECTION_REQUESTED`, `APPROVED`, `APPROVED_WITH_ADJUSTMENTS`, `REJECTED`, `CANCELED`), edição/cancelamento/reenvio, teto semestral compartilhado por `parent_item_id` e revisão de parecer (conforme [`docs/arquitetura/sequencias.md`](../arquitetura/sequencias.md)).
  - Homologação via `app.fn_register_homologation`, congelamento da matrícula para `COMPLETED`, PDF consolidado (`ReportLab`), confirmação pelo estudante e download protegido via `X-Accel-Redirect`.
  - Comando `manage.py seed_siac` com a Tabela Padrão completa da IN COENS-DV/UTFPR nº 3/2021.

### 2.3. Frontend (`frontend/`)
- Adotados componentes acessíveis **`shadcn/ui`** (Radix UI Dialog, Tabs, Label, Slot) e validação **`Zod`** em `src/schemas/index.ts`.
- Corrigido `authInterceptor.ts` com fila de refresh automático em `401` e removido o fluxo público de `/cadastro`.
- Telas adicionadas/corrigidas: `LoginPage`, `NewSubmissionPage` (Grupo → Modalidade e prévia de teto), `MySubmissionsPage` (filtros, `evaluator_feedback`, comparativo antes/depois, edição/cancelamento/reenvio), `ScorePage` (extrato semestral, confirmação e download PDF), `PendingSubmissionsPage` + `EvaluationForm` (4 decisões), `HomologationsPage`, `EnrollmentsPage`, `CourseManagementPage` (curso vinculado somente leitura para `COURSE_COORD` e cards separados para meta do curso e novo grupo), `SiacAdminPage` e `OpportunitiesPage`.

### 2.4. Infraestrutura e CI
- `docker-compose.yml` com rede `siac_net`, volumes `pgdata` e `media_data`, `backend` rodando via `Gunicorn` e `nginx` servindo o build React + proxy `/api/` + `/protected-media/`.
- `docker-compose.dev.yml` opcional para hot-reload de desenvolvimento e `.github/workflows/ci.yml` executando `python manage.py check`, `pytest`, `npm run lint`, `npm test` e `npm run build`.

---

## 3. Cobertura de Testes e Verificações Executadas

> O detalhamento completo de cenários, segurança, warnings e limitações está documentado em [`docs/testes/RELATORIO_TESTES.md`](../testes/RELATORIO_TESTES.md).

- **`python manage.py check`:** `0 issues`.
- **Backend — `pytest -v` (sobre PostgreSQL 16 inicializado com `02_schema.sql` e role `siac_app`):** **`17/17` testes aprovados** (`11.08s`):
  - **Unitários e Integração por módulo (`14` testes):** `accounts` (`3`), `courses` (`2`, incluindo isolamento entre cursos e soft-deactivate), `submissions` (`3`, incluindo unitários de semestre/upload, Pillow, `SHA-256`, lock otimista, rejeição e revisão), `homologation` (`2`), `opportunities` (`2`) e `audit` (`2`, incluindo escopo por curso).
  - **Segurança / Mini Pen-Testing (`backend/test_security.py`, `3` suítes):** bloqueio `401` sem JWT e com JWT adulterado, IDOR entre estudantes/cursos, escalação de privilégio, uploads HTML/SVG/shell disfarçados (bloqueados por *magic bytes*), SQLi no login, cabeçalhos `nosniff`/`no-store` e imutabilidade *append-only* de `audit.audit_logs`.
- **Frontend — `Vitest` (`npm test`):** **`9/9` testes aprovados** em 3 suítes (`src/schemas/index.test.ts`, `src/pages/LoginPage.test.tsx` e `src/pages/CourseManagementPage.test.tsx`).
- **Lint e Build Frontend:** `npm run lint` (`oxlint`) com **`0 erros`** (`14 warnings` não bloqueantes registrados no relatório de testes) e `npm run build` (`tsc -b && vite build`) concluído sem erros.
- **Nginx ao vivo (`http://localhost:8080`):** SPA (`HTTP 200`), bloqueio direto em `/protected-media/` (`HTTP 404`), bloqueio sem token em `/api/v1/me/` (`HTTP 401`) e download protegido de comprovante PDF via `X-Accel-Redirect` (`HTTP 200`, `application/pdf`).

---

## 4. Nota sobre os Logs Históricos desta Pasta

Os arquivos `BACKEND_DELIVERY_REPORT.md` e `FRONTEND_API.md` nesta pasta pertencem ao **histórico da entrega anterior (`develop`, commit `e9b5f8e`)** e foram preservados apenas para rastreabilidade; o contrato atual utiliza `/api/v1/` e o fluxo descrito neste relatório e no [README.md](../../README.md) raiz.
