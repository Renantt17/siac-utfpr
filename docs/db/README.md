# Modelo de Dados Relacional — DER Físico (SIAC-UTFPR)

---

## 1. Guia de Leitura do Diagrama (Passo a Passo)

No diagrama (`ERD.png`), as **14 tabelas** do banco de dados estão organizadas em **2 schemas isolados** (`app` e `audit`) e mapeadas diretamente para os **6 Módulos de Domínio** do Monolito Modular:

1. **Identidade, Campi e Controle de Acesso (Módulo: `accounts`)**
   * a. `app.campuses` → registra os campi da UTFPR (ex.: Ponta Grossa - `PG`, Curitiba - `CT`, Cornélio Procópio - `CP`).
   * b. `app.users` → armazena os usuários pré-cadastrados vinculados ao seu campus, com identificador institucional (`RA`/`SIAPE`/e-mail), `primary_role` e `public_id (UUID)` para proteção contra enumeração de IDs.
   * c. `app.user_roles` → associa múltiplos papéis (`STUDENT`, `PROFESSOR`, `COURSE_COORD`, `SIAC_COORD`) a um mesmo usuário e serve como alvo declarativo das chaves estrangeiras compostas de todas as demais tabelas.

2. **Cursos, Matrículas e Tabela de Pontuação (Módulo: `courses`)**
   * a. `app.courses` → vincula cada curso ao seu campus, ao seu Coordenador (`COURSE_COORD`), ao seu Docente Responsável pelas ACs (`PROFESSOR` / PRAC) e à meta mínima total.
   * b. `app.enrollments` → representa o vínculo de matrícula do estudante (`STUDENT`) em um curso, com data de ingresso (`enrollment_date`) e status (`ACTIVE`, `COMPLETED` ou `CANCELED`).
   * c. `app.enrollment_suspensions` → registra períodos de trancamento da matrícula (`start_date` a `end_date`), impedindo sobreposição de datas via restrição GiST (`ex_suspensions_no_overlap`) e bloqueando o envio de certificados realizados durante trancamentos.
   * d. `app.activity_groups` → define os grupos normativos do curso e a meta mínima de cada grupo.
   * e. `app.activity_items` → armazena os itens e subitens da Tabela de Pontuação, contendo pontuação unitária, unidade de medida, teto máximo semestral (`max_points_semester`) e auto-relacionamento (`parent_item_id`) para itens agrupadores como `ii` e `viii` dos Grupos.

3. **Submissão, Avaliação Docente e Notificações (Módulo: `submissions`)**
   * a. `app.submissions` → tabela central do fluxo operacional. Conecta a matrícula (`enrollment_id`) ao item selecionável da tabela (`activity_item_id`), armazena os metadados e hash SHA-256 do certificado (`PDF/JPG/PNG` até 10 MB), calcula o `semester` e `calculated_points`, congela o snapshot das regras vigentes (`applied_*`), preserva os valores originais enviados pelo aluno (`original_*`) e registra a decisão do docente PRAC (`evaluator_id`, `approved_points`, `evaluator_feedback`).
   * b. `app.notifications` → armazena os avisos enviados ao usuário (`recipient_id`) a cada mudança de situação de uma atividade (`submission_id`).

4. **Homologação Final e Sincronização com o Portal UTFPR (Módulo: `homologation`)**
   * a. `app.homologations` → relação `1:1` com `app.enrollments`. Gerada exclusivamente pela função transacional `app.fn_register_homologation` quando o aluno atinge todos os critérios, armazenando o PDF do Relatório Final, a confirmação do estudante e o status de sincronização com o Portal da UTFPR (`PENDING_SYNC`, `SYNCED`, `SYNC_FAILED`).
   * b. `app.homologation_group_scores` → registra a pontuação consolidada e o mínimo exigido em cada grupo ativo do curso no ato da homologação.

5. **Mural de Oportunidades e Eventos (Módulo: `opportunities`)**
   * a. `app.opportunities` → armazena cursos, palestras e eventos (internos ou externos) divulgados pelo Coordenador do SIAC (`created_by_id`), priorizados por `campus_id` e com sugestão de grupo/item (`suggested_group_number`, `suggested_item_code`) desacoplada de um curso específico.

6. **Trilha de Auditoria Unificada e Imutável (Módulo: `audit` — Schema `audit`)**
   * a. `audit.audit_logs` → recebe automaticamente, via triggers `SECURITY DEFINER`, os snapshots `JSONB` (`before_snapshot` e `after_snapshot`), status anterior/novo, autor (`actor_id`) e IP (`ip_address`) de todas as operações críticas em `SUBMISSION`, `HOMOLOGATION`, `USER_ROLE`, `SCORING_ITEM`, `ENROLLMENT` e `COURSE`.

---

## 2. Mapeamento das Tabelas por Módulo e Schema

| Schema | Tabela | Módulo C4 (Nível 3) | Chave Primária | Papel Principal no Domínio |
| :--- | :--- | :--- | :--- | :--- |
| **`app`** | `campuses` | `accounts` / `courses` | `id (BIGINT)` | Cadastro dos campi da UTFPR. |
| **`app`** | `users` | `accounts` | `id (BIGINT)` | Credenciais institucionais (`RA`/`SIAPE`), perfil principal e `public_id (UUID)`. |
| **`app`** | `user_roles` | `accounts` | `(user_id, role)` | Associação `N:N` de papéis por usuário e base das FKs compostas declarativas. |
| **`app`** | `courses` | `courses` | `id (BIGINT)` | Cursos de graduação, Coordenador, Docente PRAC e meta total. |
| **`app`** | `enrollments` | `courses` | `id (BIGINT)` | Vínculo do aluno no curso, data de ingresso e status da matrícula. |
| **`app`** | `enrollment_suspensions` | `courses` | `id (BIGINT)` | Períodos de trancamento de matrícula sem sobreposição temporal (`GiST`). |
| **`app`** | `activity_groups` | `courses` | `id (BIGINT)` | Grupos da tabela de pontuação do curso e meta mínima. |
| **`app`** | `activity_items` | `courses` | `id (BIGINT)` | Modalidades/itens de pontuação, fator unitário, teto `Máx./Sem.` e item-pai. |
| **`app`** | `submissions` | `submissions` | `id (BIGINT)` | Envio de certificados, snapshot de regras, valores originais e avaliação docente. |
| **`app`** | `notifications` | `submissions` | `id (BIGINT)` | Central de notificações ao estudante sobre pareceres e ajustes. |
| **`app`** | `homologations` | `homologation` | `id (BIGINT)` | Fechamento final das ACs, Relatório PDF e status de envio ao Portal UTFPR. |
| **`app`** | `homologation_group_scores` | `homologation` | `id (BIGINT)` | Extrato consolidado de pontos aprovados por grupo na homologação. |
| **`app`** | `opportunities` | `opportunities` | `id (BIGINT)` | Mural de eventos internos e externos gerenciado pelo Coordenador do SIAC. |
| **`audit`** | `audit_logs` | `audit` | `id (BIGINT)` | Trilha de auditoria `JSONB` estritamente imutável. |

---

## 3. Definições Arquiteturais do Modelo de Dados

### Defesa em Profundidade: Como funcionam as 3 Camadas de Validação (Front $\rightarrow$ Back $\rightarrow$ Banco)?

O SIAC-UTFPR adota o princípio de **Defesa em Profundidade** em três camadas complementares, garantindo que o Backend atue como uma segunda barreira de validação antes do banco de dados:

1. **1ª Camada — Frontend (React + TypeScript + Zod) — *Foco em Experiência do Usuário (UX)*:**
   * Realiza a validação instantânea no navegador antes do envio da requisição HTTP: campos obrigatórios, formatos e tamanhos de arquivo (`PDF/JPG/PNG` até 10 MB), datas válidas, carga horária positiva e simulação visual da pontuação estimada.
2. **2ª Camada — Backend (Django + DRF + SimpleJWT + Pillow/filetype) — *Foco em Segurança, Arquivos e Regras de Aplicação*:**
   * Atua como barreira obrigatória para qualquer requisição à API REST:
     * **Autenticação e Autorização (RBAC):** Valida o token JWT (`SimpleJWT`) e o escopo do perfil de acesso (garantindo, por exemplo, que apenas o estudante dono da matrícula envie seus certificados e apenas o PRAC designado ao curso os avalie).
     * **Inspeção e Processamento de Comprovantes:** Verifica a assinatura real (*magic bytes*) do arquivo via `filetype`, otimiza imagens com `Pillow` (mantendo PDFs íntegros), calcula o hash `SHA-256` e armazena o binário no `OCI Object Storage` (padrão S3 via `django-storages` + `boto3`).
     * **Validação Estruturada nos Serializers (DRF):** Valida tipos, formatos e regras de preenchimento, convertendo também eventuais exceções do banco (`DatabaseError` / `IntegrityError`) em respostas HTTP claras (`400 Bad Request`, `403 Forbidden`, `409 Conflict`).
     * **Injeção de Contexto de Auditoria na Transação:** A cada requisição autenticada dentro de `transaction.atomic()`, o middleware do Django injeta na sessão do PostgreSQL:
       ```sql
       SET LOCAL siac.current_user_id = '<id_do_usuario>';
       SET LOCAL siac.client_ip = '<ip_do_cliente>';
       ```
3. **3ª Camada — Banco de Dados (PostgreSQL 16 — `schema.sql`) — *Foco em Integridade Absoluta e Concorrência*:**
   * Funciona como guardião final da verdade dos dados sob transações `ACID`. Mesmo diante de requisições simultâneas no mesmo milissegundo (*race conditions*) ou tentativas de acesso direto fora da aplicação, o próprio PostgreSQL garante:
     * O truncamento automático de pontos no teto semestral (`max_points_semester`);
     * O bloqueio de certificados duplicados (`uq_submissions_active_file_hash`) ou realizados em período de trancamento;
     * O bloqueio otimista de concorrência (`row_version`) entre avaliadores simultâneos;
     * O congelamento de matrículas homologadas (`COMPLETED`) e a geração automática e imutável dos logs em `audit.audit_logs`.

### Por que o banco utiliza 2 Schemas (`app` e `audit`) e 2 Roles (`siac_owner` e `siac_app`)?
* **`siac_owner`** é proprietária de todos os objetos do banco e das funções `SECURITY DEFINER`.
* **`siac_app`** é a role usada pelo backend em execução: possui `SELECT, INSERT, UPDATE` controlado em `app`, **não pode fazer `INSERT` direto** em `homologations` (sendo obrigada a chamar a função validadora `app.fn_register_homologation`) e possui **estritamente `SELECT`** em `audit.audit_logs`. Toda gravação na auditoria ocorre automaticamente por triggers `SECURITY DEFINER`, além de triggers que bloqueiam `UPDATE`, `DELETE` e `TRUNCATE`.

### Como o banco impede que um usuário com papel errado seja vinculado a uma FK?
* Através de **Chaves Estrangeiras Compostas Declarativas** combinadas a colunas `GENERATED ALWAYS AS (...) STORED`:
  * Exemplo em `app.courses`: a coluna gerada `prac_role` vale fixamente `'PROFESSOR'`, e a constraint `fk_courses_prac` referencia `app.user_roles (user_id, role)`. Assim, o próprio PostgreSQL impede que um estudante ou usuário sem o papel `'PROFESSOR'` seja atribuído como PRAC, sem depender de triggers para validar o papel.

### Como é garantida a hierarquia de itens (ex.: itens `ii.a`–`ii.d` e `viii.a`–`viii.d` dos Grupos) sem risco de ciclos?
* Em `app.activity_items`, itens agrupadores possuem `is_selectable = FALSE` e `parent_item_id IS NULL`, enquanto itens selecionáveis possuem `is_selectable = TRUE`.
* A FK composta `fk_items_parent_same_group (parent_item_id, group_id, parent_required_selectable)` exige que o item-pai pertença obrigatoriamente ao **mesmo grupo** e tenha `is_selectable = FALSE`. Isso torna matematicamente impossível criar ciclos ou árvores com mais de 1 nível de profundidade, além de impedir submissões em cabeçalhos agrupadores (`fk_submissions_selectable_item`).

### Como são protegidos os cálculos de Teto Semestral (`Máx./Sem.`), Ajustes do Docente e Concorrência?
* **Snapshot Imutável e Valores Originais:** Ao submeter uma atividade, a trigger `app.fn_validate_submission_and_semester_cap` copia `points_per_unit`, `unit_name` e `max_points_semester` da tabela vigente para as colunas `applied_*` e trava os valores originais enviados pelo estudante (`original_activity_item_id`, `original_semester`, `original_declared_quantity`).
* **Serialização de Concorrência (`pg_advisory_xact_lock` + `FOR UPDATE`):** Tanto a validação de teto semestral quanto a verificação de trancamentos e homologação travam a linha da matrícula (`FOR UPDATE OF e`) e adquirem locks transacionais de 64 bits (`hashtextextended`), evitando condições de corrida ou *deadlocks* (`40P01`) em aprovações simultâneas.

---

## 4. Estrutura da Pasta `BD/`, Carga Inicial (`seed.sql`) e Testes Automatizados (`test_db.py`)

### Arquivos do Diretório `BD/`

| Arquivo | Descrição |
| :--- | :--- |
| `schema.sql` | DDL completo do PostgreSQL 16 (roles, schemas `app` e `audit`, 14 tabelas, constraints declarativas, funções `PL/pgSQL`, triggers de validação/auditoria e views analíticas). |
| `seed.sql` | Script SQL idempotente que popula todas as 14 tabelas com **73 registros operacionais** no schema `app` e gera automaticamente **51 registros de auditoria** no schema `audit` (**124 registros no total**). |
| `test_db.py` | Script Python de testes automatizados (sem dependências externas) que verifica a contagem de registros por tabela e executa **10 testes em transações isoladas (`ROLLBACK`)** validando todas as travas e regras do banco. |
| `ERD.png` | Diagrama Entidade-Relacionamento Físico exportado em alta resolução. |

### Como Executar a Carga e os Testes Localmente

```bash
# 1. Aplicar o schema completo (caso o banco ainda não esteja estruturado)
psql -d SIAC -v ON_ERROR_STOP=1 -f BD/schema.sql

# 2. Popular o banco com os dados de teste (idempotente)
psql -d SIAC -v ON_ERROR_STOP=1 -f BD/seed.sql

# 3. Executar a bateria de testes automatizados em Python
python3 BD/test_db.py
```

### Resultado da Bateria de Testes (`seed.sql` + `test_db.py`)

```text
==============================================================================
 SIAC-UTFPR | BATERIA DE TESTES DO BANCO DE DADOS (PostgreSQL 16)
==============================================================================

1. CONTAGEM DE REGISTROS POR TABELA:
----------------------------------------------
  app.campuses                     :    3 registros
  app.users                        :   10 registros
  app.user_roles                   :   11 registros
  app.courses                      :    2 registros
  app.activity_groups              :    6 registros
  app.activity_items               :   10 registros
  app.enrollments                  :    5 registros
  app.enrollment_suspensions       :    1 registros
  app.submissions                  :   12 registros
  app.homologations                :    1 registros
  app.homologation_group_scores    :    3 registros
  app.opportunities                :    4 registros
  app.notifications                :    5 registros
  audit.audit_logs                 :   51 registros
----------------------------------------------
  Total Operacional (schema app)   :   73 registros
  Total Auditoria (schema audit)   :   51 registros
  TOTAL GERAL NO BANCO             :  124 registros

2. EXECUÇÃO DOS TESTES AUTOMATIZADOS DE INTEGRIDADE E REGRAS:
------------------------------------------------------------------------------
  [PASSOU] T01 - Carga mínima de dados (> 30 registros operacionais inseridos)
  [PASSOU] T02 - Imutabilidade da Auditoria (bloqueia UPDATE e DELETE em audit.audit_logs)
  [PASSOU] T03 - Bloqueio de Duplicidade SHA-256 (impede reenvio do mesmo certificado ativo)
  [PASSOU] T04 - Bloqueio em Período de Trancamento (impede submissão durante trancamento)
  [PASSOU] T05 - Bloqueio Otimista de Concorrência (impede UPDATE sem incrementar row_version)
  [PASSOU] T06 - Exigência de Justificativa em Ajuste Mínimo (bloqueia se evaluator_feedback vazio)
  [PASSOU] T07 - Trava de Teto Semestral (trunca automaticamente pontos acima do Máx./Sem.)
  [PASSOU] T08 - Bloqueio de Homologação sem atingir metas mínimas por grupo
  [PASSOU] T09 - Congelamento de Matrícula Concluída (impede novas submissões após homologação)
  [PASSOU] T10 - Verificação de Snapshots JSONB de Antes/Depois em Ajuste Mínimo
------------------------------------------------------------------------------
 RESULTADO FINAL: 10/10 testes aprovados com sucesso!
==============================================================================
```
