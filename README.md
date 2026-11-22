# SIAC-UTFPR — Sistema Integrado de Atividades Complementares

## Sobre o projeto

O SIAC-UTFPR é uma plataforma web desenvolvida com o objetivo de facilitar e centralizar o gerenciamento das Atividades Complementares dos cursos da Universidade Tecnológica Federal do Paraná (UTFPR).

O projeto busca organizar o processo de registro, envio, avaliação e homologação das atividades realizadas pelos estudantes, oferecendo um ambiente integrado para estudantes, docentes responsáveis e coordenações.

## Objetivo

O sistema foi idealizado para tornar o processo de validação das atividades complementares mais organizado, acessível e transparente. A proposta é reduzir a dependência de procedimentos manuais, centralizar os comprovantes e registros acadêmicos e aplicar os critérios específicos de cada curso durante a avaliação.

Além disso, o projeto contempla o acompanhamento da pontuação dos estudantes, a divulgação de oportunidades e a geração de relatórios relacionados à homologação.

## Principais funcionalidades

- Cadastro e envio de atividades complementares com seus respectivos comprovantes.
- Avaliação das atividades pelos docentes responsáveis.
- Aplicação dos critérios e limites de pontuação definidos para cada curso.
- Acompanhamento das atividades submetidas e de seus respectivos status.
- Homologação das atividades e geração de relatórios consolidados.
- Divulgação de oportunidades acadêmicas, como cursos, palestras e eventos.
- Registro de ações e alterações para fins de auditoria.

## Equipe de desenvolvimento

- Ana Lucia Weber Cattani
- Bruno Fernandes Belém
- Diandelys Castilho Wolff
- Letícia Ceron Hass
- Lucas Bueno dos Santos
- Renan Gabriel Pilonetto

## Tecnologias utilizadas

| Área | Tecnologias |
|---|---|
| Frontend | React 18, TypeScript, Vite e Tailwind CSS |
| Componentes e validação | shadcn/ui e Zod |
| Backend | Python 3.12, Django 5.2 e Django REST Framework |
| Autenticação | SimpleJWT |
| Banco de dados | PostgreSQL 16 |
| Infraestrutura | Docker, Docker Compose e Nginx |
| Testes | Pytest e Vitest |

## Arquitetura

O SIAC-UTFPR utiliza uma arquitetura cliente-servidor, com frontend e backend separados e comunicação por meio de uma API REST.

O backend segue o modelo de monólito modular, organizado em seis módulos principais:

- **accounts:** gerenciamento de usuários, autenticação e permissões.
- **courses:** gerenciamento de cursos, matrículas, grupos de atividades e tabelas de pontuação.
- **submissions:** envio, armazenamento e avaliação das atividades complementares.
- **homologation:** consolidação das pontuações e processos de homologação.
- **opportunities:** cadastro e divulgação de oportunidades acadêmicas.
- **audit:** registro das principais ações e alterações realizadas no sistema.

O PostgreSQL utiliza os schemas `app` e `audit` para separar os dados operacionais dos registros de auditoria.

## Documentação

A documentação do projeto está disponível na pasta [`docs/`](./docs/).

- **Entregas acadêmicas:** documentos das semanas de desenvolvimento, contendo regras de negócio, requisitos e modelagem do sistema.
- **Arquitetura:** decisões arquiteturais, diagramas e tecnologias.
- **Banco de dados:** modelagem física e scripts SQL.
- **Logs e relatórios:** registros de validações, entregas e documentação técnica.
- **Testes:** relatório consolidado dos testes realizados.
- **Relatório final:** documento final do projeto.

## Como executar localmente

> Os procedimentos abaixo utilizam Docker e Docker Compose para executar os serviços do projeto.

### 1. Pré-requisitos

- Git
- Docker
- Docker Compose

### 2. Clonar o repositório

```bash
git clone https://github.com/Renantt17/siac-utfpr.git
cd siac-utfpr
```

### 3. Configurar as variáveis de ambiente

Copie o arquivo `.env.example` para `.env` e configure os valores locais de `SECRET_KEY`, `POSTGRES_PASSWORD` e `DB_PASSWORD`.

```bash
cp .env.example .env
```

Para gerar uma chave secreta:

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(48))"
```

**Observações:**
- Não versione o arquivo `.env` nem utilize credenciais de produção em ambiente local.
- Caso a porta `5432` já esteja em uso, ajuste `POSTGRES_PORT` no arquivo `.env`.

### 4. Iniciar os serviços

```bash
docker compose up --build -d
```

O comando inicia os serviços definidos no Docker Compose, incluindo PostgreSQL, backend e frontend servido pelo Nginx.

### 5. Carregar os dados iniciais

```bash
docker compose exec backend python manage.py seed_siac --password "SUA_SENHA_LOCAL" --allow-prod
```

A senha informada será utilizada pelas contas de demonstração criadas pelo comando.

### 6. Acessar a aplicação

- **Aplicação:** http://localhost:8080

### Contas de demonstração

| Perfil | Identificador | E-mail |
|---|---|---|
| Estudante | `a2500001` | `estudante@alunos.utfpr.edu.br` |
| Docente PRAC | `PRAC0001` | `prac.bes.dv@utfpr.edu.br` |
| Coordenação de Curso | `COORD001` | `coord.bes.dv@utfpr.edu.br` |
| Coordenador SIAC | `SIAC0001` | `siac.coord@utfpr.edu.br` |

Todas as contas utilizam a senha definida no comando `seed_siac`.

## Desenvolvimento e testes

### Modo de desenvolvimento com Hot Reload

Para executar o frontend com o Vite Dev Server na porta `5173`:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

### Verificação do backend

```bash
docker compose exec backend python manage.py check
docker compose exec backend pytest -v
```

### Testes e build do frontend

```bash
cd frontend
npm test
npm run lint
npm run build
```

### Comandos de manutenção

```bash
# Consultar os containers
docker compose ps

# Acompanhar os logs
docker compose logs -f backend nginx

# Parar os serviços
docker compose down
```

Para remover também os volumes e os dados locais, utilize `docker compose down -v`.

---

**SIAC-UTFPR** — Sistema Integrado de Atividades Complementares.