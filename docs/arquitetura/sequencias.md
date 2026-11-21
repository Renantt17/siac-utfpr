# Diagramas de Sequência — Visão Dinâmica e Comportamental (SIAC-UTFPR)

---

## 1. Visão Geral e Convenções UML 2.5

### Raias (*Lifelines*) e Alinhamento com o C4 Nível 3
Cada diagrama de sequência decompõe explicitamente as chamadas entre o cliente, os **6 módulos de domínio** do Monólito Modular (Django 5 + DRF) e a infraestrutura de persistência:
* **Frontend SPA (`React / TS`):** Interface do usuário que consome a API REST enviando credenciais JWT e payloads JSON/`multipart/form-data`.
* **Módulo `accounts`:** Autenticação híbrida (RA ou E-mail), emissão/renovação de JWT e verificação de controle de acesso baseado em papel e escopo de curso (`RBAC`).
* **Módulo `courses`:** Gestão de cursos, grupos de atividades configuráveis (`app.activity_groups`), metas mínimas de pontos (`min_points` e `min_total_points`) e itens/modalidades (`app.activity_items`).
* **Módulo `submissions`:** Recebimento e validação de comprovantes, motor de cálculo de pontos com teto semestral, fluxo de avaliação docente e máquina de estados dos certificados.
* **Módulo `homologation`:** Apuração de elegibilidade (meta de cada grupo ativo + meta total do curso), geração do Relatório Final em PDF e integração com o sistema acadêmico externo.
* **Módulo `opportunities`:** Mural de oportunidades internas e propostas de eventos externos com moderação docente.
* **Módulo `audit`:** Gravação de registros imutáveis de auditoria (`audit.audit_logs`) contendo snapshots `old_values` e `new_values` em `JSONB`.
* **Persistência e Sistemas Externos:** `PostgreSQL 16 (Schemas app/audit)`, `Media Storage (Volume Docker)` e `Portal UTFPR (Sistema Externo)`.

### Notação Utilizada
* **Setas sólidas (`───▶`):** Chamadas síncronas (requisições HTTP REST, chamadas internas de serviço `services.py` ou transações SQL).
* **Setas tracejadas (`- - ▶`):** Mensagens de retorno (*Reply Messages*) com códigos de status HTTP, DTOs JSON ou resultados de consultas.
* **Fragmentos Combinados UML 2.5:**
  * `ALT`: Fluxos alternativos mutuamente exclusivos (ex.: caminhos de sucesso vs. erro de validação, ou diferentes decisões de avaliação).
  * `OPT`: Execução condicional opcional (ex.: envio de comprovante em proposta externa).
  * `PAR`: Consultas ou operações paralelas para composição de tela.
  * `LOOP`: Repetição de interações (ex.: aplicação combinada de filtros de histórico).

---

## 2. Guia de Leitura Passo a Passo (As 9 Abas)

### Aba 01 — Cadastro e classificação (`01 - Cadastro e classificação`)
Modela a submissão de um novo certificado de atividade complementar pelo **Estudante**:
1. **Carregamento da Tabela (`GET /api/v1/courses/{courseId}/scoring-table`):** O `Frontend SPA` consulta o módulo `courses`, que retorna apenas os grupos e modalidades ativos (`is_active = TRUE`) vinculados ao curso da matrícula ativa do aluno, exibindo fatores de conversão, limites semestrais e documentos exigidos.
2. **Submissão do Certificado (`POST /api/v1/submissions`):** O estudante envia os metadados (`item_id`, `title`, `semester`, `workload_amount`) e o arquivo anexo (`multipart/form-data`).
3. **Validação de Arquivo (`ALT`):**
   * **Arquivo inválido:** Se a extensão estiver fora de `{PDF, JPG, JPEG, PNG}`, o MIME type real (magic bytes) divergir ou o tamanho exceder `10 MB`, o módulo `submissions` rejeita imediatamente com `422 Unprocessable Entity` sem gravar no disco ou banco.
   * **Arquivo válido:**
     * a. O módulo `submissions` consulta os parâmetros do item em `courses` (`points_per_unit`, `max_points`, `unit_type`).
     * b. Consulta em `app.submissions` o total de pontos já acumulados pelo estudante para aquele `item_id` no mesmo `semester` (considerando status `PENDING`, `APPROVED` e `APPROVED_ADJUSTED`).
     * c. Calcula a pontuação preliminar: $\text{calculated\_points} = \min(\text{workload\_amount} \times \text{points\_per\_unit}, \text{saldo restante do teto semestral})$.
     * d. Persiste o arquivo no `Media Storage` junto com seu hash `SHA-256`, insere o registro em `app.submissions` com status `PENDING`, registra o evento `SUBMISSION_CREATED` em `audit.audit_logs` e retorna `201 Created` (com aviso de truncamento caso o teto semestral tenha limitado os pontos).

---

### Aba 02 — Avaliação e decisões (`02 - Avaliação e decisões`)
Modela a fila de trabalho e a tomada de decisão pelo **Professor Avaliador / Coordenador**:
1. **Listagem da Fila e Pré-visualização (`GET /api/v1/submissions?status=PENDING`):** O módulo `accounts` valida o vínculo do avaliador com o curso em `app.user_course_roles` e retorna as submissões pendentes acompanhadas da URL protegida do comprovante (`GET /api/v1/submissions/{id}/Attachment`).
2. **Processamento da Decisão (`POST /api/v1/submissions/{id}/evaluate`):** Um fragmento `ALT` divide as **4 decisões possíveis**:
   * **Caso 1 — Aprovar sem Alterações (`decision = APPROVED`):**
     * Confirma a pontuação calculada (`validated_points = calculated_points`), atualiza o status para `APPROVED`, insere a revisão em `app.submission_reviews` e grava o log `SUBMISSION_EVALUATED` em `audit.audit_logs`.
   * **Caso 2 — Aprovar com Ajustes Mínimos (`decision = APPROVED_ADJUSTED`):**
     * Permite ao docente reclassificar o grupo/item (`adjusted_group_id`, `adjusted_item_id`) ou ajustar a carga horária (`adjusted_workload`).
     * **Validação de Justificativa (`ALT` interno):** Se `feedback_justification` estiver vazio, retorna `400 Bad Request`. Se preenchido, revalida o fator e o teto semestral no módulo `courses`, atualiza a submissão para `APPROVED_ADJUSTED` preservando os campos originais submetidos pelo aluno, registra o histórico em `app.submission_reviews` e grava o snapshot `old_values` (dados originais) e `new_values` (dados ajustados) em `audit.audit_logs`.
   * **Caso 3 — Solicitar Correção (`decision = CORRECTION_REQUESTED`):**
     * Exige parecer orientador obrigatório (`feedback_justification`, caso contrário retorna `400 Bad Request`). Atualiza o status para `CORRECTION_REQUESTED` (`validated_points = 0`), habilitando o item para edição pelo estudante.
   * **Caso 4 — Indeferir Definitivamente (`decision = REJECTED`):**
     * Exige justificativa obrigatória (`feedback_justification`). Atualiza o status para `REJECTED` (`validated_points = 0`), bloqueando reenvios sobre aquele mesmo registro e gravando a decisão na trilha de auditoria.

---

### Aba 03 — Correção e reavaliação (`03 - Correção e reavaliação`)
Modela o ciclo de retorno do certificado ao **Estudante** após uma solicitação de correção:
1. **Consulta de Pendências (`GET /api/v1/submissions?status=CORRECTION_REQUESTED`):** O estudante visualiza os itens devolvidos e lê o parecer detalhado do avaliador (`GET /api/v1/submissions/{id}/reviews`).
2. **Reenvio de Correção (`PUT /api/v1/submissions/{id}/resubmit`):**
   * **Guarda de Estado (`ALT`):** Se o status atual da submissão no banco for diferente de `CORRECTION_REQUESTED`, o backend bloqueia a operação com `409 Conflict`.
   * **Reenvio Permitido:** O módulo `submissions` valida o novo arquivo (`PDF/JPG/PNG <= 10 MB`), recalcula os pontos preliminares consultando as regras e o teto semestral no módulo `courses`, substitui a referência do anexo no `Media Storage` (preservando o histórico da versão anterior em `audit.audit_logs` com ação `SUBMISSION_RESUBMITTED`) e retorna o status da submissão para `PENDING`, recolocando-a automaticamente na fila do docente.

---

### Aba 04 — Situação, histórico e progresso (`04 - Situação, histórico e progresso`)
Modela o painel de acompanhamento de metas e consulta ao histórico pelo **Estudante**:
1. **Painel de Progresso (`GET /api/v1/enrollments/{id}/progress` — Fragmento `PAR`):**
   * Em paralelo, o backend consulta a configuração dinâmica dos grupos ativos do curso (`app.activity_groups.min_points` e `app.courses.min_total_points`) no módulo `courses` e agrega os pontos em `app.submissions` separados em **Pontos Validados** (`APPROVED` e `APPROVED_ADJUSTED`) e **Pontos em Análise** (`PENDING`), calculando o saldo faltante por grupo e geral.
2. **Filtros Combinados (`GET /api/v1/submissions` — Fragmento `LOOP`):**
   * Permite filtrar cumulativamente por `status`, `group_id` e `semester`, retornando a listagem paginada ordenada cronologicamente.
3. **Detalhamento e Transparência (`GET /api/v1/submissions/{id}`):**
   * Exibe lado a lado os dados originalmente enviados pelo aluno, os eventuais ajustes realizados pelo avaliador, os pareceres em `app.submission_reviews` e o link para download do comprovante.

---

### Aba 05 — Lançamento no Portal UTFPR (`05 - Lançamento no Portal UTFPR`)
Modela o encerramento do ciclo de Atividades Complementares no módulo `homologation`:
1. **Verificação Automática de Elegibilidade (`check_eligibility`):**
   * Consulta as metas dinâmicas do curso (`min_total_points` em `app.courses` e `min_points` de cada grupo ativo em `app.activity_groups`) e soma os `validated_points` do aluno.
   * **Fragmento `ALT`:**
     * Se $\exists \text{ grupo ativo com } \text{validated\_points} < \text{min\_points}$ **ou** $\text{total\_validated} < \text{min\_total\_points}$, a matrícula permanece `ACTIVE` e o dashboard exibe as pendências.
     * Se **todas as metas de grupos ativos e a meta total** forem atingidas simultaneamente, a função transacional atualiza a matrícula para `ELIGIBLE` e cria/atualiza o registro em `app.homologations` com status `READY`.
2. **Geração de Relatório Final e Sincronização (`POST /api/v1/homologations/{enrollmentId}/dispatch`):**
   * O avaliador/coordenador solicita o encerramento e pode visualizar o consolidado em PDF (`GET /api/v1/homologations/{enrollmentId}/report.pdf`), que é gerado e salvo no `Media Storage`.
   * O módulo `homologation` dispara a requisição HTTPS (`POST /api/externo/lancamento-ac`) para o **Portal UTFPR**.
   * **Tratamento de Resiliência (`ALT`):**
     * **Sucesso (`200 OK`):** Atualiza `app.homologations` para `SYNCHRONIZED`, armazena o `external_protocol`, muda a matrícula (`app.student_enrollments`) para `HOMOLOGATED` e grava o log em `audit.audit_logs`.
     * **Falha de Comunicação (`503 / Timeout`):** Atualiza `app.homologations` para `SYNC_FAILED` registrando `sync_error_message` e log de auditoria, mantendo o relatório PDF íntegro e permitindo nova tentativa sem perda de dados.

---

### Aba 06 — Oportunidades de atividades (`06 - Oportunidades de atividades`)
Modela a divulgação e descoberta de eventos acadêmicos no módulo `opportunities`:
1. **Consulta ao Mural (`GET /api/v1/opportunities`):** Retorna as oportunidades com status `PUBLISHED` e período vigente, ordenando prioritariamente aquelas pertencentes ao `campus_id` do estudante (`ORDER BY (campus_id = student_campus) DESC, start_date ASC`).
2. **Cadastro Direto por Docente/Coordenação (`POST /api/v1/opportunities`):** Professores e coordenadores publicam oportunidades internas diretamente com status `PUBLISHED`, associando opcionalmente o grupo e item sugeridos da tabela do curso.
3. **Proposta de Oportunidade Externa por Estudante (`POST /api/v1/opportunities/proposals`):**
   * O estudante sugere um curso/evento externo informando título, instituição, datas, carga horária estimada e anexo opcional (`OPT`). O registro nasce com `is_external = TRUE` e `status = PENDING_APPROVAL`.
   * **Moderação Docente (`PATCH /api/v1/opportunities/{id}/review` — Fragmento `ALT`):** O professor ou coordenador aprova a proposta (promovendo-a para `PUBLISHED` no mural visível aos alunos) ou a rejeita (`REJECTED` com justificativa), registrando a decisão em `audit.audit_logs`.

---

### Aba 07 — Gestão da coordenação (`07 - Gestão da coordenação`)
Modela a administração institucional, a customização dinâmica de grupos/metas por curso e os indicadores gerenciais:
1. **Gestão Global pelo Coordenador Geral do SIAC:**
   * Criação e edição de cursos (`POST /api/v1/courses` com `min_total_points`) e designação/destituição de Coordenadores de Curso e Professores Avaliadores (`POST / PUT / DELETE /api/v1/courses/{id}/coordinators`), atualizando `app.user_course_roles` e registrando em `audit.audit_logs`.
2. **Gestão de Grupos, Metas de Pontos e Modalidades pelo Coordenador de Curso:**
   * O módulo `accounts` valida se o usuário possui perfil `COURSE_COORDINATOR` ativo para o `course_id` alvo (ou `SIAC_COORDINATOR`).
   * **Fragmento `ALT` com 3 operações sobre a tabela do curso:**
     * **Criar ou Editar Grupo e Metas de Pontos (`POST / PUT / PATCH`):** Permite criar novos grupos (ex.: Grupo 4) ou editar grupos existentes em `app.activity_groups` (`group_number`, `name`, `min_points`, `is_active`) e alterar a meta total do curso em `app.courses` (`min_total_points`).
     * **Remover ou Desativar Grupo (`DELETE /api/v1/courses/{id}/groups/{groupId}`):** Verifica em `app.submissions` se já existem certificados submetidos naquele grupo. Caso não existam (`count == 0`), executa a exclusão física (`DELETE`). Caso já existam submissões históricas (`count > 0`), executa a desativação lógica (`UPDATE is_active = FALSE`), preservando a integridade referencial dos certificados já avaliados.
     * **Criar, Editar ou Desativar Modalidade/Item (`POST / PUT / PATCH`):** Gerencia os itens de pontuação dentro de cada grupo em `app.activity_items` (`code`, `name`, `points_per_unit`, `max_points`, `unit_type`, `required_doc_description`, `is_active`).
   * Todas as alterações de regras de pontuação disparam gravação automática em `audit.audit_logs` com os valores anteriores e novos.
3. **Painel de Indicadores (`GET /api/v1/courses/{id}/analytics`):**
   * Agrega métricas de submissões por status, taxa de aprovação/ajuste/rejeição, tempo médio de avaliação e distribuição de alunos próximos à homologação, restritas ao escopo do curso do coordenador.

---

### Aba 08 — Segurança e integridade (`08 - Segurança e integridade`)
Modela os mecanismos transversais de proteção de dados, isolamento de escopo e imutabilidade:
1. **Controle de Acesso e Escopo (`RBAC` + Escopo de Curso):**
   * Toda requisição passa pelo `JWTAuthMiddleware` e pelo verificador de escopo do módulo `accounts`.
   * **Fragmento `ALT`:** Se um estudante tentar acessar rota de avaliação ou se um coordenador/avaliador tentar manipular submissões/grupos de outro curso ao qual não está vinculado em `app.user_course_roles`, a operação é abortada com `403 Forbidden` e tentativa registrada em log.
2. **Download Protegido de Comprovantes (`GET /api/v1/submissions/{id}/attachment`):**
   * Os arquivos em `Media Storage` nunca são expostos em URLs públicas diretas. O backend valida se o requisitante é o próprio estudante autor da submissão ou um avaliador/coordenador do curso correspondente antes de transmitir o binário (`X-Accel-Redirect` / *stream* autenticado).
3. **Proteção de Integridade e Imutabilidade da Auditoria:**
   * A tabela `audit.audit_logs` opera em modo *append-only*. Qualquer tentativa de `UPDATE` ou `DELETE` sobre registros de auditoria é bloqueada no nível do SGBD pela trigger `audit.trg_audit_logs_immutable`, garantindo rastreabilidade forense.

---

### Aba 09 — Autenticação e perfis (`09 - Autenticação e perfis`)
Modela o fluxo de entrada no sistema, roteamento por perfil e renovação de sessão:
1. **Login Híbrido (`POST /api/v1/auth/login`):**
   * O usuário informa seu identificador (**RA** para estudantes ou **E-mail institucional** para servidores) e senha.
   * O módulo `accounts` localiza o registro ativo em `app.users`, valida o hash `Argon2id / PBKDF2` da senha e carrega as matrículas (`app.student_enrollments`) e papéis por curso (`app.user_course_roles`).
   * **Fragmento `ALT`:**
     * **Credenciais inválidas ou usuário inativo:** Retorna `401 Unauthorized`.
     * **Credenciais válidas:** Atualiza `last_login_at`, registra `USER_LOGIN` em `audit.audit_logs` e retorna `200 OK` com `access_token` (curta duração), `refresh_token` e o objeto `user` contendo seus papéis e escopos de curso.
2. **Roteamento Contextual de Perfil no Frontend (`ALT`):**
   * Se `STUDENT`: redireciona para o Dashboard do Estudante (Submissões, Progresso e Mural).
   * Se `EVALUATOR`: redireciona para a Fila de Avaliação e Homologação dos cursos vinculados.
   * Se `COURSE_COORDINATOR`: habilita a Fila de Avaliação, Configuração de Grupos/Metas/Itens e Indicadores do seu curso.
   * Se `SIAC_COORDINATOR`: habilita a Gestão Global de Cursos, Coordenadores e Indicadores Multicurso.
3. **Renovação e Encerramento de Sessão (`POST /api/v1/auth/refresh` e `/logout`):**
   * O `Frontend SPA` renova silenciosamente o `access_token` via `refresh_token` quando recebe `401 Token Expired`, e invalida o token no encerramento de sessão (`logout`).

---

## 3. Resumo da Máquina de Estados de Certificados (`app.submissions`)

| Estado Atual | Evento / Ação | Próximo Estado | Quem Executa | Efeito nos Pontos Validados |
| :--- | :--- | :--- | :--- | :--- |
| *(Novo)* | `POST /api/v1/submissions` | `PENDING` | Estudante | `calculated_points` calculado (com teto semestral); `validated_points = 0` |
| `PENDING` | Avaliar: Aprovar sem ajustes | `APPROVED` | Avaliador / Coordenador | `validated_points = calculated_points` (dispara checagem de elegibilidade) |
| `PENDING` | Avaliar: Aprovar com ajustes | `APPROVED_ADJUSTED` | Avaliador / Coordenador | `validated_points` recalculado com grupo/item/carga ajustados + log de valores originais |
| `PENDING` | Avaliar: Solicitar correção | `CORRECTION_REQUESTED` | Avaliador / Coordenador | `validated_points = 0` (abre edição para o estudante) |
| `PENDING` | Avaliar: Indeferir | `REJECTED` | Avaliador / Coordenador | `validated_points = 0` (estado terminal; bloqueia reenvio) |
| `CORRECTION_REQUESTED` | `PUT /api/v1/submissions/{id}/resubmit` | `PENDING` | Estudante | Recalcula `calculated_points` e reinsere na fila de avaliação |
