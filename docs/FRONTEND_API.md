# Contrato de integração — SIAC-UTFPR

Base URL local: `http://localhost:8000/api`

Todas as rotas abaixo exigem `Authorization: Bearer <access>` exceto cadastro, campi e emissão de token.

## 1. Autenticação e cadastro

### `GET /campuses/` — público

```json
[
  {"id": 1, "name": "Campus Dois Vizinhos", "acronym": "DV"}
]
```

### `POST /register/` — público

`Content-Type: application/json`

```json
{
  "full_name": "Nome Completo",
  "email": "aluno@exemplo.com",
  "institutional_id": "1234567",
  "campus": 1,
  "password": "Senha-Forte!2026",
  "confirmPassword": "Senha-Forte!2026"
}
```

`confirmPassword` é opcional para clientes que já validem a confirmação no próprio formulário; quando enviado, precisa coincidir com `password`. A API cria exclusivamente o papel `STUDENT`.

Resposta `201`:

```json
{
  "id": 12,
  "public_id": "uuid",
  "full_name": "Nome Completo",
  "email": "aluno@exemplo.com",
  "institutional_id": "1234567",
  "campus": 1
}
```

Erros de validação usam HTTP `400`, com mensagens associadas ao campo (`email`, `institutional_id`, `campus`, `password`, etc.).

### `POST /token/` — público

```json
{"email": "aluno@exemplo.com", "password": "Senha-Forte!2026"}
```

Retorna `access` e `refresh`.

### `POST /token/refresh/` — público

```json
{"refresh": "<refresh-token>"}
```

### `GET /me/`

Retorna `id` (UUID público), `email`, `full_name`, `campus` (sigla), `campus_id`, `campus_name` e `roles`.

### `GET /students/`

Somente professores e coordenadores. Lista estudantes ativos do mesmo campus, com ID numérico, UUID público, nome, e-mail e identificação institucional. O ID numérico é o valor usado em `student_id` ao criar matrícula.

## 2. Cursos, matrículas e catálogo

### `GET /courses/`

Retorna cursos ativos do campus do usuário. Para professores, limita aos cursos em que são coordenador ou professor responsável. Campos: `id`, `name`, `code`, `campus`, `campus_name`, `campus_acronym`, `min_total_points`, `is_active`.

### `GET /enrollments/me/`

Retorna apenas as matrículas ativas do estudante autenticado. Campos: `id`, `course`, `course_name`, `course_code`, `campus_acronym`, `enrollment_date`, `status`.

O estudante não cria a própria matrícula.

### `POST /enrollments/`

Somente professor responsável pelo curso ou coordenador SIAC do mesmo campus.

```json
{
  "student_id": 12,
  "course_id": 3,
  "enrollment_date": "2026-11-16"
}
```

O backend verifica perfil STUDENT, curso ativo, campus compatível e duplicidade. Respostas: `201` criado, `403` sem permissão, `409` matrícula já existente.

### `GET /activity-items/?course_id=3`

Exige matrícula ativa do estudante no curso ou permissão de responsável. Retorna grupos:

```json
[
  {
    "id": 1,
    "group_number": 1,
    "title": "Atividades Complementares",
    "min_points": "20.00",
    "activities": [
      {
        "id": 4,
        "code": "ATV001",
        "description": "Participação em eventos acadêmicos",
        "group_id": 1,
        "group_number": 1,
        "group_title": "Atividades Complementares",
        "course_id": 3,
        "points_per_unit": "5.00",
        "unit_name": "evento",
        "max_points_semester": "20.00",
        "required_proof_description": "Certificado de participação",
        "is_selectable": true,
        "parent_item": null,
        "parent_required_selectable": false
      }
    ]
  }
]
```

O catálogo inclui somente grupos ativos e itens ativos selecionáveis.

## 3. Submissões

### `POST /submissions/`

Enviar como `multipart/form-data`, não JSON:

| Campo | Obrigatório | Formato |
|---|---|---|
| `enrollment` | Sim | ID da matrícula do próprio usuário |
| `activity_item` | Sim | ID do item do catálogo |
| `description` | Sim | Texto |
| `activity_start_date` | Sim | `YYYY-MM-DD` |
| `activity_end_date` | Sim | `YYYY-MM-DD` |
| `semester` | Sim | `AAAA-1` ou `AAAA-2` |
| `declared_quantity` | Sim | Inteiro maior que zero |
| `file` | Sim | PDF, JPG ou PNG, até 10 MB |

O status inicial é sempre `PENDING`. O frontend não envia status, pontos, avaliador, MIME type ou caminho do arquivo.

Resposta `201` inclui `public_id`, IDs de matrícula e item, descrição, datas, semestre, quantidade, status, pontos atuais e `file_url`.

### `GET /submissions/`

Histórico do usuário autenticado, apenas suas próprias submissões. Inclui atividade, curso, datas, semestre, quantidades, status, pontuação calculada/aprovada, feedback, timestamps e `file_url`.

### `GET /submissions/pending/`

Fila do professor responsável/coordenador de curso ou coordenador SIAC do campus. Inclui dados do estudante, curso, atividade, status e `file_url`.

### `POST /submissions/{public_id}/evaluate/`

```json
{
  "decision": "APPROVED",
  "validated_quantity": 1,
  "feedback": "Atividade validada."
}
```

`decision`: `APPROVED` ou `REJECTED`. Rejeição exige `feedback`. `validated_quantity` deve estar entre zero e a quantidade declarada; uma aprovação exige quantidade maior que zero. Uma submissão avaliada não pode ser avaliada novamente (`409`).

A pontuação aprovada respeita o teto acumulado por item e semestre. A avaliação cria notificação para o estudante e registro de auditoria.

### `GET /submissions/{public_id}/file/`

Abre o comprovante. Requer autenticação e autorização: dono da submissão ou avaliador autorizado. Não usar URL pública de `MEDIA_URL`.

## 4. Pontuação e homologação

### `GET /homologation/summary/`

Retorna uma lista por matrícula ativa, com:
- `total_approved_points`
- `required_min_total_points`
- `minimum_reached`
- `approved_submissions`, `pending_submissions`, `rejected_submissions`
- `groups`: pontos aprovados, mínimo por grupo e limites por item
- `homologation`: homologação já emitida, quando existir.

### `POST /homologation/{enrollment_id}/finalize/`

Somente professor responsável ou coordenador SIAC do campus. Exige que o mínimo total do curso e os mínimos de todos os grupos ativos estejam alcançados. Gera PDF e registra SHA-256. O campo `portal_sync_status` fica `NOT_CONFIGURED`, pois integração com portal externo não faz parte desta implementação.

### `GET /homologation/{public_id}/report/`

Baixa o PDF para o estudante dono ou responsável autorizado.

## 5. Notificações

### `GET /notifications/`

Lista notificações do usuário autenticado.

### `PATCH /notifications/{public_id}/read/`

Marca como lida uma notificação pertencente ao usuário autenticado.

## 6. Oportunidades

### `GET /opportunities/`

Lista oportunidades ativas do campus do usuário.

### `POST /opportunities/`

Permitido a professor ou coordenador do SIAC, para o próprio campus. Campos:

```json
{
  "title": "Semana Acadêmica",
  "description": "Evento acadêmico do curso.",
  "campus": 1,
  "suggested_group_number": 1,
  "suggested_item_code": "ATV001",
  "start_date": "2026-11-20",
  "end_date": "2026-11-22",
  "estimated_hours": "8.00",
  "modality": "PRESENCIAL",
  "is_external": false,
  "organizer_name": "Coordenação do Curso",
  "certification_rules": "Certificado de participação."
}
```

## 7. Convenções do frontend

- Não defina `Content-Type: application/json` ao enviar `FormData`; deixe o navegador/cliente definir o boundary multipart.
- Inclua o JWT em todas as rotas protegidas.
- Trate `400` como erro de validação, `401` como sessão/token inválido, `403` como falta de permissão, `404` como recurso inexistente e `409` como conflito (ex.: matrícula ou avaliação duplicada).
- Se o backend for exposto em outra porta, ajuste `VITE_API_URL` no frontend e `BACKEND_PORT` no `.env`.
