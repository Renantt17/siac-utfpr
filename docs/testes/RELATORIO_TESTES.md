# Relatório de Testes e Segurança — SIAC-UTFPR

**Data da execução:** 20/11/2026  
**Ambiente testado:** Stack Docker Compose (`PostgreSQL 16` com `db/init/02_schema.sql` e role `siac_app` + `Django 5.2 / Gunicorn` + `Nginx` + `React 18 / TypeScript / Vite`)  
**Automação CI:** [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml)

---

## 1. Resumo Executivo

| Camada / Suíte | Ferramenta | Resultado Final | Escopo |
| :--- | :--- | :--- | :--- |
| **Backend (Unitários + Integração)** | `pytest` + `pytest-django` | **14 / 14 aprovados** | 6 módulos (`accounts`, `courses`, `submissions`, `homologation`, `opportunities`, `audit`) + regras SQL/triggers reais no PostgreSQL 16 |
| **Segurança / Mini Pen-Testing** | `pytest` (`test_security.py`) + `curl` | **3 / 3 suítes aprovadas** + **2 / 2 checks Nginx** | Autenticação/JWT, IDOR entre alunos/cursos, escalação de privilégio, uploads maliciosos, SQLi, auditoria imutável e `/protected-media/` |
| **Frontend (Unitários + UI)** | `Vitest` + `Testing Library` | **9 / 9 aprovados** (3 arquivos) | Schemas `Zod`, `LoginPage` e `CourseManagementPage` |
| **Qualidade Estática e Build** | `oxlint` + `tsc -b` + `vite build` | **0 erros** (`14 warnings`) | Tipagem TypeScript, regras React/Hooks e empacotamento de produção |

> **Por que o resultado final apresenta 0 falhas?**  
> Os defeitos funcionais e arquiteturais da entrega anterior (`develop`, commit `e9b5f8e`) foram diagnosticados previamente em [`05_Validacao_Arquitetural_Atual.md`](../logs/05_Validacao_Arquitetural_Atual.md) e corrigidos antes desta bateria final. Durante o próprio ciclo de implementação e validação dos testes, também foram identificados e corrigidos desvios pontuais (descritos na Seção 5), permanecendo ainda **alertas não bloqueantes e limitações de cobertura** documentados na Seção 6.

---

## 2. Cobertura por Módulo (Backend — `pytest`)

Diferente de testes com SQLite em memória, o [`backend/conftest.py`](../../backend/conftest.py) cria um banco PostgreSQL 16 dedicado por sessão de teste aplicando diretamente [`db/init/02_schema.sql`](../../db/init/02_schema.sql) e [`db/init/03_public_grants.sql`](../../db/init/03_public_grants.sql) sob a role restrita `siac_app`.

| Módulo | Arquivo | Testes | Cenários Validados |
| :--- | :--- | :---: | :--- |
| **`accounts`** | `backend/apps/accounts/tests.py` | **3** | Login híbrido por RA (`institutional_id`) e e-mail para qualquer perfil (case-insensitive); bloqueio de `/register/` (`404`); rejeição de senha errada (`401`), usuário inativo (`401`) e identificador vazio (`400`); concessão/revogação restrita a `SIAC_COORD`; proteção ao `primary_role` e papel inválido (`400`). |
| **`courses`** | `backend/apps/courses/tests.py` | **2** | Criação de curso com Tabela Padrão (3 grupos); isolamento da tabela e metas entre cursos distintos; restrição de edição do `COURSE_COORD` ao próprio curso (`403` em curso alheio ou campos exclusivos do `SIAC_COORD`); `DELETE` físico em grupo sem uso vs. `DEACTIVATED` lógico quando há submissões; bloqueio de matrícula por estudante (`403`), matrícula duplicada (`409`), datas inválidas (`400`) e trancamentos sobrepostos via `btree_gist` (`409`); analytics. |
| **`submissions`** | `backend/apps/submissions/tests.py` | **3** | Unitários de `derive_semester_from_date` (`.1`/`.2`) e `process_and_validate_proof` (arquivo vazio, `> 10 MB`, PNG/JPEG via `Pillow` `< 500 KB`, magic bytes inválidos); bloqueio antes da `enrollment_date`, em trancamento, item agrupador ou de outro curso; unicidade por `SHA-256` (`409`) e liberação após cancelamento; lock otimista (`row_version` -> `409`); fluxo `CORRECTION_REQUESTED` -> reenvio -> `APPROVED_WITH_ADJUSTMENTS` com teto compartilhado por `parent_item_id`; bloqueio de reenvio após `REJECTED` e exigência de nova justificativa na revisão de parecer; geração de auditoria. |
| **`homologation`** | `backend/apps/homologation/tests.py` | **2** | Exigência de meta em todos os grupos ativos (bloqueio mesmo atingindo pontuação total sem fechar um grupo); bloqueio com submissão pendente aberta; congelamento da matrícula para `COMPLETED` via `app.fn_register_homologation`; bloqueio de dupla homologação (`409`) e de nova submissão após conclusão; confirmação restrita ao estudante titular (`403` para outro) e geração de PDF (`application/pdf`). |
| **`opportunities`** | `backend/apps/opportunities/tests.py` | **2** | Ordenação por prioridade do campus do usuário (`DV` > global `NULL` > outros); ocultação de eventos expirados para não-`SIAC_COORD`; filtros por `group_number` e `modality`; validação de datas (`end_date < start_date`); edição/encerramento pelo `SIAC_COORD` e bloqueio de escrita para `STUDENT`/`COURSE_COORD` (`403`). |
| **`audit`** | `backend/apps/audit/tests.py` | **2** | Acesso negado (`403`) para estudante e docente (`PROFESSOR`); visão global para `SIAC_COORD`; escopo filtrado do `COURSE_COORD` apenas para entidades do próprio curso; filtro por `entity_type`. |

**Execução observada:** `17 passed in 11.08s` (14 testes funcionais dos 6 módulos + 3 suítes de segurança abaixo).

---

## 3. Testes de Segurança / Mini Pen-Testing (`backend/test_security.py` + Nginx)

Validam controles de acesso, isolamento multi-curso e proteção contra abusos comuns de APIs REST:

1. **Autenticação e Integridade de Token (`test_unauthenticated_access_blocked_across_protected_endpoints`):**
   - Verificados 12 endpoints protegidos (`/api/v1/me/`, `/api/v1/users/`, `/api/v1/students/`, `/api/v1/courses/`, `/api/v1/enrollments/me/`, `/api/v1/submissions/`, `/api/v1/submissions/pending/`, `/api/v1/notifications/`, `/api/v1/homologation/summary/`, `/api/v1/homologation/candidates/`, `/api/v1/opportunities/`, `/api/v1/audit/logs/`) sem token → **`401 Unauthorized`** em todos.
   - Token JWT com assinatura adulterada → **`401 Unauthorized`**.
2. **IDOR e Isolamento entre Usuários e Cursos (`test_idor_isolation_between_students_and_courses`):**
   - Estudante B tentando consultar, editar, cancelar ou baixar comprovante do Estudante A, ou consultar tabela de curso sem matrícula → **`403 Forbidden`**.
   - Docente `PRAC` B e Coordenador B tentando avaliar, homologar, alterar tabela, consultar analytics ou registrar trancamento no Curso A → **`403 Forbidden`**.
   - Tentativa de *Path Traversal* em `/api/v1/submissions/../../etc/passwd/file/` → **`404 Not Found`**.
3. **Escalação de Privilégio, Uploads Maliciosos, SQLi e Auditoria Imutável (`test_privilege_escalation_malicious_uploads_and_sqli_defenses`):**
   - `STUDENT`, `PROFESSOR` e `COURSE_COORD` bloqueados (`403`) ao tentar conceder papéis, listar usuários, criar cursos ou cadastrar oportunidades.
   - Payloads HTML/XSS (`<script>alert(1)</script>`), SVG (`<svg onload=...>`) e script shell disfarçados com extensões/Content-Type `.pdf`, `.jpg` e `.png` bloqueados na inspeção de *magic bytes* (`400 Bad Request`).
   - Downloads seguros retornam cabeçalhos `X-Content-Type-Options: nosniff` e `Cache-Control: private, no-store`.
   - Tentativa de SQL Injection no login (`' OR '1'='1`) rejeitada com `401`.
   - Tentativas diretas de `UPDATE` (ORM) e `DELETE` (SQL) sobre `audit.audit_logs` pela role `siac_app` bloqueadas pelo PostgreSQL (`DatabaseError`).
4. **Nginx em Execução (`http://localhost:8080`):**
   - Acesso direto a `/protected-media/` retorna **`404`** (diretiva `internal;` garante entrega exclusiva via `X-Accel-Redirect` após autorização do backend).
   - Acesso anônimo a `/api/v1/me/` via proxy retorna **`401`**.

---

## 4. Cobertura no Frontend (`Vitest` + `Testing Library` + `oxlint`)

Configuração adicionada em [`frontend/vitest.config.ts`](../../frontend/vitest.config.ts) e [`frontend/src/test/setup.ts`](../../frontend/src/test/setup.ts):

| Suíte | Arquivo | Testes | Cenários Validados |
| :--- | :--- | :---: | :--- |
| **Schemas `Zod`** | `frontend/src/schemas/index.test.ts` | **4** | Validação de `loginSchema` (RA/e-mail e espaços), `submissionSchema` (extensões, datas invertidas e comprovante obrigatório), `evaluationSchema` (justificativa obrigatória em ajustes/correção/indeferimento e regex `AAAA.1`/`AAAA.2`), `enrollmentSchema`, `suspensionSchema` e `opportunitySchema`. |
| **Tela de Login** | `frontend/src/pages/LoginPage.test.tsx` | **3** | Bloqueio de envio vazio via `Zod`, alternância de visibilidade da senha, disparo de `login(identifier, password)` com redirecionamento para `/dashboard` e exibição de alerta em falha de autenticação. |
| **Coordenação de Curso** | `frontend/src/pages/CourseManagementPage.test.tsx` | **2** | Regressão garantindo que `COURSE_COORD` vê **Curso vinculado** como bloco somente leitura (sem `<select>`/`combobox`) e que **Meta Total do Curso** e **Novo Grupo de Pontuação** ficam em cards separados; seletor habilitado apenas quando `SIAC_COORD` possui múltiplos cursos. |

**Execução observada:** `Test Files 3 passed (3)`, `Tests 9 passed (9)` em `868ms`.

---

## 5. Defeitos / Desvios Identificados e Corrigidos Durante os Testes

Durante os testes visuais e a montagem das suítes automatizadas nesta etapa de correção, foram observados e corrigidos os seguintes pontos:

1. **UX da tela de Coordenação de Curso (`CourseManagementPage.tsx`):** em inspeção visual na interface local, o campo de curso aparecia como `<Select>` clicável e com texto truncado para `COURSE_COORD`, e os formulários de *Meta Total do Curso* e *Novo Grupo* dividiam o mesmo card. Foi corrigido para exibição somente leitura (`Curso vinculado`) quando não há troca de curso e divisão em dois `<Card>` distintos (coberto por teste de regressão em `CourseManagementPage.test.tsx`).
2. **Alinhamento de contratos na escrita dos testes:** confirmou-se durante a execução inicial das suítes que a rota de perfil autenticado é `/api/v1/me/` (e não `/api/v1/auth/me/`) e que o campo retornado pelo analytics do curso é `submissions_summary`, ajustando as asserções ao contrato real da API.

---

## 6. Achados Não Bloqueantes (Warnings) e Limitações Conhecidas

Para transparência técnica, permanecem registrados os seguintes pontos observados:

- **Warnings de lint no Frontend (`oxlint` — 0 erros, 14 warnings):**
  - `react(only-export-components)` em `src/contexts/AuthContext.tsx` (exportação de `useAuth` junto ao provider).
  - `react(set-state-in-effect)` em carregamentos iniciais de páginas (`NotificationsPage`, `HomologationsPage`, `MySubmissionsPage`, `CourseManagementPage`, `NewSubmissionPage` e `FilePreview`).
  - `react-hooks(exhaustive-deps)` em `src/pages/NewSubmissionPage.tsx`.
- **Tamanho de bundle JS (`vite build`):** chunk principal com `522.11 kB` (acima do alerta padrão de `500 kB` do Vite; recomendável aplicar *code-splitting* por rota com `React.lazy` em evolução futura).
- **Cobertura parcial de componentes React:** as suítes Vitest cobrem os schemas `Zod` globais, `LoginPage` e `CourseManagementPage`; as demais páginas (`NewSubmissionPage`, `MySubmissionsPage`, `PendingSubmissionsPage`, `HomologationsPage`, `EnrollmentsPage`, `SiacAdminPage`, `OpportunitiesPage`, `ScorePage`) foram validadas por tipagem (`tsc -b`), `oxlint` e inspeção manual no container Nginx, sem testes unitários dedicados no Vitest nem testes E2E em navegador real (`Playwright`/`Cypress`).
- **Escopo de Carga e Pentest Externo:** não foram executados testes de carga/estresse automatizados (`k6`/`Locust`) nem varredura DAST externa (`OWASP ZAP`), e as integrações externas fora do escopo MVP (`OCI Object Storage` e `Portal UTFPR` / `PENDING_SYNC`) não fazem parte do ambiente local.

---

## 7. Como Reproduzir os Testes

```bash
# 1. Backend (Unitários, Integração e Segurança sobre PostgreSQL 16)
docker compose exec backend pytest -v

# 2. Frontend (Vitest, Lint e Build TypeScript/Vite)
cd frontend
npm test
npm run lint
npm run build

# 3. Verificações HTTP no Nginx local
curl -s -o /dev/null -w "PROTECTED_MEDIA:%{http_code}\n" http://localhost:8080/protected-media/
curl -s -o /dev/null -w "UNAUTH_API:%{http_code}\n" http://localhost:8080/api/v1/me/
```
