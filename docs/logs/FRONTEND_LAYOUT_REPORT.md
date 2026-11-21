# Relatório de Atualizações de Frontend (Responsividade e Layout) — SIAC-UTFPR

**Data:** 21/11/2026  
**Escopo:** Consolidação das melhorias de responsividade e identidade visual integradas via PR #14 (`develop`, commit `884018e`) e dos ajustes subsequentes de alinhamento do layout e navegação (`fix/frontend`).

---

## 1. Atualização Anterior — Responsividade e Identidade Visual (PR #14 / `884018e`)

Integrada a partir da branch `feature/frontend-responsivo-bruno` (commit `3a5c4ed`), sem alterações de backend, banco de dados, schemas ou serviços:

- **Identidade visual (`frontend/public/logo-utfpr-header.png` e `frontend/src/assets/logo_siac.png`):**
  - Atualizado o logotipo do SIAC e adicionada a versão específica do logotipo da UTFPR para o cabeçalho superior.
- **Cabeçalho (`frontend/src/components/layout/AppLayout.tsx`):**
  - Ajustados tamanhos de logotipo, tipografia e espaçamentos por breakpoint (`sm`, `md`, `lg`).
- **Menu lateral retrátil no mobile (`frontend/src/components/layout/Sidebar.tsx`):**
  - Adicionado botão dropdown visível em telas pequenas (`md:hidden`) exibindo o título da página atual, atributos de acessibilidade (`aria-expanded`, `aria-controls="menu-principal-siac"`) e fechamento automático ao selecionar um item de navegação.
- **Minhas Atividades (`frontend/src/pages/MySubmissionsPage.tsx`):**
  - Barra de filtros convertida para grid responsivo (`sm:grid-cols-2 xl:grid-cols-[...]`).
  - Tabela de histórico mantida para telas largas (`lg:block`) e substituída por cards empilhados no mobile (`lg:hidden`), preservando `evaluator_feedback`, `row_version` e ações (`Detalhes`, `Editar`, `Cancelar`, `Corrigir e reenviar`).
  - Modais (`DialogContent`) ajustados com largura responsiva (`w-[calc(100vw-2rem)] max-w-lg`) e rolagem interna (`max-h-[90dvh] overflow-y-auto`).

---

## 2. Ajustes Subsequentes — Alinhamento do Sidebar e Botão de Saída (`fix/frontend`)

Após validação visual local em telas de notebook e desktop, foram aplicados dois refinamentos de layout em `AppLayout.tsx` e `Sidebar.tsx`:

1. **Fixação do sidebar na borda esquerda em telas largas (`frontend/src/components/layout/AppLayout.tsx`):**
   - **Problema identificado:** o container externo de `<header>` e do wrapper `<Sidebar />` + `<main>` usava `mx-auto max-w-7xl`, deslocando o menu lateral em direção ao centro da tela em monitores largos.
   - **Correção:** removido `mx-auto max-w-7xl` do cabeçalho e do wrapper externo flex (`flex w-full min-w-0 flex-1 flex-col md:flex-row`), ancorando o sidebar à esquerda. O limite `mx-auto w-full max-w-7xl` foi movido para dentro do `<main>`, preservando a legibilidade dos conteúdos sem deslocar a navegação lateral.

2. **Movimentação de usuário e botão "Sair" em vermelho para o final do sidebar (`AppLayout.tsx` e `Sidebar.tsx`):**
   - Removidos o bloco de identificação do usuário e o botão de saída do cabeçalho superior, deixando o banner superior exclusivo para os logotipos `SIAC` e `UTFPR`.
   - Movidos o bloco do usuário (`full_name`, `institutional_id • campus`) e o botão **Sair** para o rodapé interno do `<nav id="menu-principal-siac">` no `Sidebar.tsx`:
     - **Desktop (`md:`):** posicionados na base do sidebar com `md:flex md:flex-col`, `md:flex-1` e `md:mt-auto`.
     - **Mobile:** exibidos automaticamente como último item dentro do menu retrátil.
     - **Estilo:** utilizado `<Button variant="destructive">` (fundo vermelho `bg-red-600`, ícone `LogOut` + rótulo `Sair`).

3. **Atualização do favicon e metadados (`frontend/index.html`, `frontend/public/favicon.png` e `favicon.ico`):**
   - Substituído o ícone padrão do Vite (`favicon.svg`) pelo logotipo oficial do SIAC em `favicon.png` (`192x192`, cantos transparentes) e `favicon.ico` (`16x16`, `32x32`, `48x48`).
   - Ajustados `lang="pt-BR"` e o `<title>` para `SIAC-UTFPR — Sistema Integrado de Atividades Complementares`.

---

## 3. Verificações Executadas

- `npm run lint` (`oxlint`: 0 erros), `npm test` (Vitest: 9/9 aprovados) e `npm run build` (`tsc -b && vite build`).
- Container `siac-nginx` em execução local respondendo `HTTP 200` em `/`, `/favicon.png` e `/favicon.ico`.
