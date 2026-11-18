# Relatório de entrega — Backend SIAC-UTFPR

## Resumo

Implementação consolidada sobre a estrutura Django existente. Os modelos e as tabelas atuais foram preservados; não foram adicionados campos ou tabelas, portanto não há novas migrations de modelo.

## Funcionalidades implementadas ou completadas nesta entrega

- Cadastro público de estudante, validação de e-mail/identificação institucional duplicados, validação de senha e criação atômica do papel `STUDENT`.
- Listagem pública de campi ativos.
- Listagem de estudantes do campus para professores/coordenadores, necessária ao fluxo de matrícula.
- Consulta de cursos ativos, matrículas próprias e catálogo de grupos/atividades.
- Criação de matrícula restrita ao professor responsável ou coordenador SIAC do campus; estudante não pode se matricular sozinho.
- Upload multipart de comprovante PDF/JPG/PNG com validação por assinatura do arquivo e limite de 10 MB.
- Histórico de submissões do próprio estudante.
- Download protegido de comprovantes, com `Content-Disposition: attachment`, `nosniff` e cache privado desabilitado.
- Fila de pendências e avaliação restrita ao responsável do curso ou coordenador do campus.
- Bloqueio de avaliação duplicada com transação e bloqueio de linha.
- Homologação serializada por bloqueio da matrícula, evitando finalizações simultâneas duplicadas.
- Limite de tamanho e validação de assinatura de arquivo; rejeição de arquivo vazio.
- Limitação básica de requisições anônimas/autenticadas e limite de tamanho de payload.
- Feedback de avaliação limitado a 2.000 caracteres e IP de auditoria sem confiar em `X-Forwarded-For` não validado.
- `SECRET_KEY` obrigatória (mínimo de 50 caracteres), sem chave de fallback; Compose falha se senhas do banco não forem configuradas.
- Cabeçalhos de segurança e opções de cookies/HTTPS/HSTS configuráveis por ambiente.
- Aplicação do teto acumulado de pontos por item e semestre.
- Notificação ao estudante e log de auditoria após avaliação.
- Resumo de pontuação com totais, progresso, contagens por status, grupos e limites por item.
- Homologação definitiva com verificação dos mínimos cadastrados, PDF e hash SHA-256.
- Consulta e cadastro de oportunidades por campus.
- Consulta e marcação de notificações como lidas.
- CORS para Vite local e portas externas configuráveis no Compose.
- Seed de desenvolvimento idempotente com estudante, professor, coordenador, curso, matrícula, catálogo e submissões nos três status.
- Criação idempotente dos schemas `app` e `audit` nas migrações iniciais, sem inserir uma migration anterior que causaria histórico inconsistente nos bancos já migrados.

## Endpoints

O contrato detalhado, com payloads e formatos de upload, está em `docs/FRONTEND_API.md`.

## Testes incluídos

Foram adicionados testes automatizados para:
- Cadastro e rejeição de e-mail duplicado.
- Consulta de cursos, matrícula e catálogo.
- Bloqueio de matrícula criada por estudante.
- Envio multipart, fila, avaliação, histórico e teto semestral acumulado.
- Rejeição de arquivo com assinatura inválida, bloqueio de estudante tentando avaliar submissão e limite de tamanho do feedback.

## Validações executadas nesta entrega

- Análise sintática de todos os 72 arquivos Python: sem erros.
- Leitura/parse do `docker-compose.yml`: YAML válido.
- Conferência estática das rotas e dos arquivos de configuração.

## Validações não executadas

O ambiente usado para preparar este pacote não possui Django, Django REST Framework, psycopg nem Docker instalados. Portanto, não foi possível executar `manage.py check`, migrations reais, testes Django ou subir os containers nesta sessão. Os testes estão incluídos no projeto e precisam ser executados no ambiente Docker do repositório antes do merge.

## Segurança e configuração de produção

- O arquivo `.env` é local e não deve ser compartilhado nem versionado. Gere uma nova `SECRET_KEY` e senhas fortes para cada ambiente; as credenciais do ZIP compartilhado devem ser substituídas.
- `SECURE_SSL_REDIRECT`, `SECURE_COOKIES` e HSTS devem ser configurados conforme o proxy/HTTPS real do ambiente de produção.
- O Dockerfile usa `runserver`, apropriado somente para desenvolvimento; produção deve usar Gunicorn/servidor WSGI e proxy HTTPS.
- Throttling DRF é uma proteção básica; produção com múltiplos workers deve usar cache compartilhado (por exemplo Redis) para limites consistentes.

## Limitações conhecidas

- O ZIP original não continha o código-fonte React; a pasta `frontend/` continha somente arquivos placeholder. A compatibilidade foi feita com base no texto de requisitos fornecido pelo frontend, não com base nos componentes reais.
- A criação/edição estrutural de cursos, grupos e itens não foi exposta como CRUD público; o escopo implementado disponibiliza consulta e matrícula. Os dados iniciais podem ser preparados pelo seed e administrados no backend.
- Integração com portal externo não foi implementada. A homologação registra `portal_sync_status=NOT_CONFIGURED`.
- As regras de homologação usam os mínimos definidos em `Course.min_total_points` e `ActivityGroup.min_points`; confirmar com a coordenação se todos os grupos ativos são obrigatórios antes de produção.
- A validação de comprovantes aceita PDF, JPG e PNG até 10 MB. Ajustar caso o regulamento exija outros formatos ou limites.

## Próximos passos no ambiente do projeto

1. Copiar o `.env.example` para `.env` e configurar credenciais locais novas.
2. Executar `docker compose up --build -d` para instalar `django-cors-headers`.
3. Executar `docker compose exec backend python manage.py migrate`.
4. Executar `docker compose exec backend python manage.py check`.
5. Executar `docker compose exec backend pytest` (ou `python manage.py test`).
6. Executar o seed de desenvolvimento se necessário.
7. Conferir os contratos com o responsável pelo frontend e integrar a branch frontend.
