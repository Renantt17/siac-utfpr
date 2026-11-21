# SIAC-UTFPR — Sistema Integrado de Atividades Complementares

Plataforma web para gestão do ciclo de Atividades Complementares na UTFPR, contemplando envio de comprovantes por estudantes, avaliação docente (PRAC) com cálculo de teto semestral, customização da Tabela de Pontuação por curso, homologação final com relatório em PDF, mural de oportunidades e trilha de auditoria.

### Stack Principal
- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, Zod e `shadcn/ui` (servido via Nginx em produção ou Vite Dev Server no modo dev).
- **Backend:** Python 3.12, Django 5.2, Django REST Framework, SimpleJWT, Gunicorn, Pillow, `filetype` e ReportLab.
- **Banco de Dados:** PostgreSQL 16 (schemas isolados `app` e `audit`, roles `siac_owner`/`siac_app`, triggers e auditoria *append-only*).

### Documentação (`docs/`)
- [`docs/arquitetura/`](./docs/arquitetura/) — Documentação arquitetural de referência ([`README.md`](./docs/arquitetura/README.md), [`Tecnologias.md`](./docs/arquitetura/Tecnologias.md), [`sequencias.md`](./docs/arquitetura/sequencias.md)). *(Reflete o planejamento original completo, incluindo itens fora do escopo MVP como OCI e propostas de oportunidades por estudantes.)*
- [`docs/db/`](./docs/db/) — Modelagem física e guia do PostgreSQL 16 ([`README.md`](./docs/db/README.md) e [`schema.sql`](./docs/db/schema.sql), espelhando o DDL executável em [`db/init/02_schema.sql`](./db/init/02_schema.sql)).
- [`docs/logs/`](./docs/logs/) — Histórico de validações e entregas ([`CORRECTION_DELIVERY_REPORT.md`](./docs/logs/CORRECTION_DELIVERY_REPORT.md), [`FRONTEND_LAYOUT_REPORT.md`](./docs/logs/FRONTEND_LAYOUT_REPORT.md), [`05_Validacao_Arquitetural_Atual.md`](./docs/logs/05_Validacao_Arquitetural_Atual.md), [`BACKEND_DELIVERY_REPORT.md`](./docs/logs/BACKEND_DELIVERY_REPORT.md) e [`FRONTEND_API.md`](./docs/logs/FRONTEND_API.md)).
- [`docs/testes/`](./docs/testes/) — Relatório consolidado de testes unitários, integração, segurança e frontend ([`RELATORIO_TESTES.md`](./docs/testes/RELATORIO_TESTES.md)).

---

## Como Executar Localmente

### 1. Configurar variáveis de ambiente
Copie o modelo [`.env.example`](./.env.example) para `.env` (arquivo ignorado pelo Git) e defina seus próprios valores locais para `SECRET_KEY` (mínimo de 50 caracteres), `POSTGRES_PASSWORD` e `DB_PASSWORD`:

```bash
cp .env.example .env
```

Para gerar uma `SECRET_KEY` aleatória localmente:
```bash
python3 -c "import secrets; print(secrets.token_urlsafe(48))"
```

> **Observações:**
> - Nunca versione o arquivo `.env` nem reutilize senhas de produção.
> - Caso a porta `5432` já esteja em uso na máquina host, ajuste `POSTGRES_PORT=5433` no `.env`.

### 2. Subir os containers (PostgreSQL 16 + Gunicorn + Nginx)
```bash
docker compose up --build -d
```

### 3. Carregar os dados iniciais (`seed_siac`)
Execute o comando de seed definindo uma senha local de sua escolha:
```bash
docker compose exec backend python manage.py seed_siac --password "<defina-uma-senha-local>" --allow-prod
```
*(Como o `.env.example` inicia com `DEBUG=False`, a flag `--allow-prod` é necessária para liberar o seed em testes locais.)*

### 4. Acessar a aplicação
- **Aplicação (Nginx):** `http://localhost:8080`

#### Contas de demonstração criadas pelo `seed_siac`
Todas utilizam a senha informada no parâmetro `--password` da etapa anterior:

| Perfil | Login por RA / Identificador | Login por E-mail |
| :--- | :--- | :--- |
| **Estudante** | `a2500001` | `estudante@alunos.utfpr.edu.br` |
| **Docente PRAC** | `PRAC0001` | `prac.bes.dv@utfpr.edu.br` |
| **Coordenação de Curso** | `COORD001` | `coord.bes.dv@utfpr.edu.br` |
| **Coordenador SIAC** | `SIAC0001` | `siac.coord@utfpr.edu.br` |

---

### Modo Desenvolvimento com Hot-Reload (Opcional)
Para rodar o Vite Dev Server na porta `5173` com *hot-reload* integrado ao backend:
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

# Parar os containers (use `down -v` apenas se quiser apagar os volumes locais e reiniciar do zero)
docker compose down
```
