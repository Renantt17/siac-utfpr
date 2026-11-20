# DEFINIÇÃO ARQUITETURAL, TECNOLOGIAS E FERRAMENTAS — SIAC-UTFPR

---

## 1. Estilo Arquitetural

### Monolito Modular (Client-Server via API REST)
* **O que é:** Aplicação unificada em seu processo de execução e implantação no backend, porém internamente dividida em módulos independentes por domínio de negócio, comunicando-se com um frontend desacoplado via API REST.
* **Razão da escolha:**
  * **Baixa complexidade operacional:** Ideal para o escopo do projeto e tamanho da equipe (6 integrantes), evitando a sobrecarga de rede, latência distribuída e orquestração complexa de microsserviços.
  * **Integridade transacional (`ACID`):** Permite executar em uma única transação atômica a avaliação do docente, o cálculo de tetos semestrais, a apuração de metas por grupo e o registro imutável de auditoria.
  * **Manutenibilidade e isolamento de domínio:** Divide o backend em 6 módulos independentes (`accounts`, `courses`, `submissions`, `homologation`, `opportunities` e `audit`), facilitando a divisão de tarefas na equipe e a evolução futura sem acoplamento indevido.

---

## 2. Tecnologias de Backend

### Python 3.12 + Django 5
* **O que é:** Linguagem de programação de alto nível combinada ao framework web *batteries-included* mais consolidado do ecossistema Python.
* **Razão da escolha:**
  * **Produtividade e padronização:** Oferece nativamente ORM robusto, sistema de migrações transacionais, validação de dados e proteção contra vulnerabilidades web críticas (`CSRF`, `SQL Injection`, `XSS`).
  * **Segurança nativa:** Suporte pronto a hash criptográfico de senhas (`Argon2id` / `PBKDF2`), controle de permissões por perfil e escopo de curso (`RBAC`) e customização do modelo de usuário para login híbrido (RA para estudantes e e-mail institucional para servidores).
  * **Recebimento, Validação Binária e Compressão de Arquivos (`Pillow` + `filetype`):**
    * O recebimento de uploads `multipart/form-data` é gerenciado nativamente pelo `MultiPartParser` do Django/DRF, com trava de entrada em `10 MB`.
    * A validação do arquivo ocorre pela inspeção dos *magic bytes* reais do cabeçalho binário (`filetype` / `python-magic`), garantindo que o documento enviado seja genuinamente um `PDF`, `JPG` ou `PNG` e bloqueando arquivos adulterados.
    * Após calcular o hash `SHA-256` contra duplicidades, imagens fotográficas (`JPG`, `JPEG` e `PNG`) passam por redimensionamento e compressão otimizada via **`Pillow` (`PIL`)**, reduzindo fotos de câmera de vários megabytes para **`< 500 KB`** sem perda de legibilidade. Já os arquivos **`PDF` são mantidos intactos sem recompressão**, preservando eventuais assinaturas digitais criptográficas (ICP-Brasil / Gov.br / Portal UTFPR).
  * **Carga inicial automatizada:** Permite criar comandos nativos (`manage.py seed_siac`) para popular cursos, grupos de atividades, tabela de pontuação inicial e usuários de teste.

### Django REST Framework (DRF) + SimpleJWT
* **O que é:** Toolkit para construção de APIs RESTful no Django aliado à autenticação stateless baseada em tokens JWT (*JSON Web Tokens*).
* **Razão da escolha:**
  * **Desacoplamento e Validação de Schemas (`DRF Serializers`):** Padroniza a serialização JSON, paginação e validação rigorosa de tipos, regras de domínio e payloads no servidor.
  * **Autenticação e escopo stateless:** Controla de forma segura o acesso de Estudantes, Docentes Avaliadores (PRAC), Coordenação de Curso e Coordenador Geral do SIAC em cada rota da API por meio de `access_token` e `refresh_token`.

### Gunicorn (Servidor de Aplicação WSGI)
* **O que é:** Servidor HTTP WSGI (*Web Server Gateway Interface*) em Python para execução em ambiente de produção UNIX/Linux.
* **Razão da escolha:**
  * **Estabilidade e Concorrência em Produção:** Gerencia múltiplos processos *workers* simultâneos para o Django, suportando requisições concorrentes de envio e avaliação de certificados com baixo consumo de memória e alta confiabilidade.

### ReportLab
* **O que é:** Biblioteca open-source nativa em Python para geração programática e determinística de documentos PDF.
* **Razão da escolha:**
  * **Emissão do Relatório Final de Homologação:** Gera automaticamente o documento consolidado em PDF quando o estudante atinge simultaneamente as metas mínimas de cada grupo ativo e a pontuação total do curso, registrando o hash `SHA-256` do relatório gerado.
  * **Leveza e Portabilidade no Container:** Opera integralmente em Python puro sem exigir bibliotecas gráficas externas do sistema operacional, mantendo a imagem Docker do Backend enxuta, rápida no build do CI/CD e estável em qualquer distribuição Linux.

---

## 3. Banco de Dados

### PostgreSQL 16 (Container Dedicado com Isolamento em Schemas)
* **O que é:** Sistema Gerenciador de Banco de Dados Relacional (SGBDR) open-source de referência em integridade, concorrência e conformidade SQL.
* **Razão da escolha:**
  * **Isolamento em Schemas (`app` e `audit`):** Separa fisicamente no mesmo banco as 13 tabelas operacionais do sistema (schema `app`) da trilha histórica de auditoria (schema `audit`), com controle estrito de privilégios entre as roles `siac_owner` e `siac_app`.
  * **Auditoria Estruturada em `JSONB`:** Armazena de forma binária indexada os estados `old_data` (antes) e `new_data` (depois) em `audit.audit_logs`, permitindo rastrear cada ajuste mínimo realizado por avaliadores ou alterações de metas pelos coordenadores.
  * **Regras Ativas no SGBD (Funções, Triggers e Constraints):** Utiliza `PL/pgSQL` e a extensão `btree_gist` para impor diretamente no banco o teto semestral de pontos, o bloqueio otimista de concorrência (`version`), a proibição de submissões em períodos de trancamento e a imutabilidade da tabela de auditoria (*append-only*, bloqueando `UPDATE`, `DELETE` e `TRUNCATE`).

---

## 4. Tecnologias de Frontend e Servidor Web

### React 18 + Vite + TypeScript + Zod
* **O que é:** Biblioteca JavaScript para construção de interfaces reativas (*Single Page Application — SPA*), combinada ao empacotador de alta velocidade Vite, à tipagem estática do TypeScript e à validação de schemas com `Zod`.
* **Razão da escolha:**
  * **Desempenho e fluidez de uso:** Atualiza os componentes da tela (filas de avaliação, barras de progresso por grupo e filtros combinados) sem recarregar a página inteira, garantindo tempo de resposta inferior a 3 segundos.
  * **Segurança de tipos e Validação de Formulários (`TypeScript` + `Zod`):** Previne falhas em tempo de compilação e valida em tempo de execução no cliente todos os formulários de envio de atividades (campos obrigatórios, cargas horárias positivas, formato e limite prévio de `10 MB` do arquivo) antes de disparar requisições à API.
  * **Agilidade no desenvolvimento com Vite:** Oferece inicialização instantânea e *Hot Module Replacement (HMR)* no ambiente local e gera pacotes estáticos altamente otimizados para produção.

### Tailwind CSS + shadcn/ui (Radix UI)
* **O que é:** Framework CSS utilitário aliado à coleção de componentes acessíveis `shadcn/ui` (construída sobre os primitivos *headless* do `Radix UI`).
* **Razão da escolha:**
  * **Responsividade e Identidade Institucional:** Permite estilizar rapidamente layouts adaptáveis a desktops, tablets e smartphones, aplicando com precisão a paleta visual da UTFPR.
  * **Acessibilidade WCAG 2.2 Nativa:** Entrega diálogos modais, *dropdowns*, tabelas e formulários com suporte completo a navegação por teclado (`Tab`, `Enter`, `Esc`), foco visível e atributos `ARIA` para leitores de tela.
  * **Integração Direta e Leveza do Pacote:** Construído nativamente sobre o Tailwind CSS, incorpora ao projeto apenas o código-fonte dos componentes efetivamente utilizados, mantendo o pacote final enxuto e fácil de customizar.

### Nginx (Servidor Web e Proxy Reverso)
* **O que é:** Servidor HTTP de alta performance e proxy reverso que atua como ponto único de entrada externa (`HTTPS — Porta 443`) da aplicação.
* **Razão da escolha:**
  * **Entrega Estática do Frontend:** Serve os arquivos compilados da SPA React (`HTML`, `CSS`, `JS`) diretamente da memória/disco com compressão `Gzip/Brotli` e baixíssima latência.
  * **Proxy Reverso e Isolamento de Rede:** Encaminha apenas as chamadas `/api/*` para o container interno do `Gunicorn (Django)`, impedindo que o servidor de aplicação e o banco de dados fiquem expostos diretamente à internet.
  * **Download Protegido de Certificados (`X-Accel-Redirect`):** Permite entregar arquivos PDF/JPG/PNG de até 10 MB com alta performance somente após o Django validar o token JWT e a permissão de curso do usuário.

---

## 5. Infraestrutura, Nuvem, Containers e Armazenamento (Media Storage)

### Docker + Docker Compose
* **O que é:** Plataforma de containerização e orquestração declarativa de múltiplos containers isolados (`frontend`, `backend` e `db`) conectados pela rede virtual privada `siac_net`.
* **Razão da escolha:**
  * **Paridade entre Desenvolvimento e Produção:** Garante que todos os 6 integrantes executem exatamente as mesmas versões do Python 3.12, Node/Nginx e PostgreSQL 16 com um único comando (`docker compose up`), eliminando problemas de divergência de ambiente.
  * **Isolamento do Banco de Dados:** O `PostgreSQL 16` roda em um container exclusivo e separado do container do `Backend`, garantindo independência de ciclo de vida e segurança dos dados no volume `pgdata`.

### Oracle Cloud Infrastructure (OCI — Instância Compute Linux + Object Storage S3)
* **O que é:** Infraestrutura de nuvem utilizada para hospedar os ambientes de testes integrados (homologação) e produção em uma máquina virtual Linux dedicada (*OCI Compute Always Free*) com suporte a armazenamento de objetos compatível com o padrão S3 (*OCI Object Storage*).
* **Razão da escolha:**
  * **Disponibilidade Contínua (24/7):** Permite que o sistema permaneça ativo ininterruptamente em endereço público com `HTTPS`, sem sofrer hibernação por inatividade (*cold start*) e sem depender das máquinas locais dos integrantes.
  * **Persistência e Execução Nativa de Containers:** Viabiliza a execução direta da orquestração `Docker Compose` em servidor Linux dedicado com volumes de bloco persistentes, preservando integralmente o banco de dados e os arquivos enviados entre atualizações de código.

### Media Storage: OCI Object Storage (Padrão S3 via `django-storages` + `boto3`)
* **O que é:** Serviço de armazenamento de objetos em nuvem compatível com a API S3, utilizado como repositório único para guardar os certificados enviados pelos estudantes (`PDF/JPG/PNG` até 10 MB) e os Relatórios Finais de Homologação em PDF, mantendo no PostgreSQL apenas o caminho do arquivo e seu hash `SHA-256`.
* **Razão da escolha:**
  * **Padronização Única e Alta Durabilidade:** Centraliza o armazenamento de arquivos em um *bucket* S3 dedicado na Oracle Cloud (com 20 GB gratuitos no *Always Free*, suficientes para dezenas de milhares de certificados otimizados), eliminando a necessidade de manter configurações diferentes entre ambientes e garantindo que os arquivos estejam sempre preservados fora dos containers.
  * **Performance no Banco de Dados:** Evita sobrecarregar o PostgreSQL com arquivos binários (`BLOBs`), mantendo o banco relacional leve e rápido para consultas e backups.
  * **Segurança e Controle de Acesso:** Os comprovantes ficam armazenados em um *bucket* privado sem acesso público direto, utilizando URLs pré-assinadas temporárias (*Presigned URLs*) ou intermediação autenticada pelo Backend somente após validar o token JWT e o escopo de curso do usuário.

---

## 6. Ferramentas de Desenvolvimento, Qualidade e Gestão

* **Pytest + `pytest-django`:** Framework de testes automatizados utilizado para validar as regras críticas de negócio (cálculo de pontos, trava de teto semestral, grupos dinâmicos por curso, validação de arquivos de 10 MB e permissões de acesso).
* **Git + GitHub:** Sistema distribuído de controle de versão e plataforma de hospedagem de código utilizados para fluxo de trabalho colaborativo via *branches*, *Pull Requests* e revisão de código (*Code Review*).
* **GitHub Actions (CI/CD):** Ferramenta de Integração e Entrega Contínua que executa automaticamente a bateria de testes do `Pytest`, valida as migrações do banco e realiza o build/deploy dos containers Docker a cada atualização na branch principal.
* **Draw.io (`diagrams.net`):** Ferramenta gratuita de modelagem utilizada para construir e versionar os diagramas da arquitetura C4 (Contexto, Containers, Componentes), Implantação, Diagramas de Sequência (UML 2.5) e Diagrama Entidade-Relacionamento (DER).
* **Jira (Atlassian):** Ferramenta de gerenciamento ágil do projeto (plano gratuito para equipes de até 10 integrantes), utilizada para organizar o backlog de Histórias de Usuário, planejar sprints e acompanhar o andamento das tasks de cada integrante.

---

## 7. Quadro Resumo da Stack Tecnológica e Ferramentas (100% Gratuitas / Open Source)

| Categoria | Tecnologia / Ferramenta | Papel Principal no SIAC-UTFPR |
| :--- | :--- | :--- |
| **Estilo Arquitetural** | Monolito Modular + API REST | Separação em 6 módulos de domínio com transações `ACID` |
| **Linguagens** | Python 3.12 (Backend) / TypeScript (Frontend) / SQL & PL/pgSQL (BD) | Desenvolvimento seguro e fortemente tipado |
| **Framework Backend** | Django 5 + Django REST Framework (DRF) | Regras de negócio, ORM, Serializers e API REST |
| **Validação e Compressão** | `Pillow` + `filetype` (Back) / `Zod` (Front) | Checagem de *magic bytes*, compressão de fotos (`< 500 KB`) e schemas |
| **Autenticação** | SimpleJWT + Django Auth (RA ou E-mail) | Autenticação híbrida stateless e controle de escopo por curso |
| **Servidor WSGI (App)** | Gunicorn | Execução multi-worker do Django em ambiente de produção |
| **Geração de PDF** | ReportLab | Emissão leve e nativa do Relatório Final de Homologação |
| **Banco de Dados** | PostgreSQL 16 (Schemas `app` e `audit` + `btree_gist`) | Persistência relacional, triggers de negócio e auditoria `JSONB` |
| **Framework Frontend** | React 18 + Vite + TypeScript + Zod | Interface SPA reativa, tipagem estática e validação no cliente |
| **Estilização e UI** | Tailwind CSS + shadcn/ui (Radix UI) | Layout responsivo, identidade UTFPR e acessibilidade WCAG 2.2 |
| **Servidor Web / Proxy** | Nginx | Entrega estática do React, proxy reverso HTTPS e `X-Accel-Redirect` |
| **Containers** | Docker + Docker Compose (`siac_net`) | Padronização de ambiente e isolamento entre App e Banco |
| **Hospedagem em Nuvem** | Oracle Cloud Infrastructure (OCI — Compute VM) | Servidor Linux 24/7 para testes e produção sem *cold start* |
| **Media Storage** | OCI Object Storage (Padrão S3 via `django-storages`) | Armazenamento privado de comprovantes (`<= 10 MB`) e PDFs |
| **Modelagem** | Draw.io (`diagrams.net`) | Diagramação arquitetural (C4, Implantação, Sequência) e DER |
| **Testes e CI/CD** | Pytest (`pytest-django`) + Git / GitHub + GitHub Actions | Testes automatizados de regras de negócio e deploy contínuo |
| **Gestão do Projeto** | Jira | Organização de sprints, backlog e distribuição de tasks |
