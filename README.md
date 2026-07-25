# kw-lawyer

Painel de acompanhamento processual para advogados. Agentes coletam publicações e andamentos na web, a API normaliza e armazena tudo, e o advogado cadastrado vê a movimentação dos seus processos em um só lugar.

Stack: Bun, Hono, oRPC, Arktype, Drizzle, Postgres, React 19, TanStack Router, TanStack Query, Jotai, shadcn e Tailwind v4.

## Comandos

- `bun install` — instala dependências.
- `bun db:up` — sobe Postgres local (porta 6795).
- `bun db:migrate` — aplica migrations.
- `bun dev` — roda API e web em modo desenvolvimento.
- `bun check` — typecheck de todos os workspaces.
- `bun lint` — lint do repo.
- `bun format` — formata o repo.
- `bun run test` — testes de integração (Postgres de teste na porta 5445).
- `bun run test:e2e` — testes E2E.
- `bun deadlines:scan [--force]` — relê as publicações e recalcula os prazos da agenda.
- `bun agent-api <list|show|call> <path>` — invoca procedures oRPC in-process, sem HTTP e sem auth.

## Acesso

O app tem duas portas em sequência. A primeira é o gate de usuário e senha, que só existe porque o
painel fica publicado na internet: `/` é a apresentação pública do projeto, `/entrar` pede a
credencial e nada além de `access.*` responde sem ela. A segunda é o login por OAB + UF, que escolhe
de quem são os processos daquela sessão.

Em `apps/api/.env`:

- `ACCESS_USER`: usuário do gate.
- `ACCESS_PASSWORD`: senha do gate, no mínimo 8 caracteres. Ela também assina o cookie de acesso:
  trocá-la derruba as sessões abertas.

Sem as duas o gate fica desligado e o app vai direto para o login por OAB, o que serve para
desenvolvimento e para os testes. Em `NODE_ENV=production` a API se recusa a subir sem elas.

## Google Agenda

O envio dos prazos para o Google Agenda fica desligado enquanto a API não tiver as três variáveis
abaixo. Sem elas o app sobe normalmente e a `/agenda` mostra o estado desconectado dizendo o que
falta.

No [Google Cloud Console](https://console.cloud.google.com/), no projeto que vai atender o app:

1. Ative a **Google Calendar API**.
2. Na tela de consentimento OAuth, publique como **External** e adicione a conta da advogada em
   usuários de teste enquanto o app não for verificado.
3. Declare os escopos `https://www.googleapis.com/auth/calendar.events` e
   `https://www.googleapis.com/auth/userinfo.email`.
4. Crie uma credencial **OAuth client ID** do tipo **Web application**, com redirect URI
   `http://localhost:1995/auth/google/callback` (em outro ambiente, `<APP_BASE_URL>/auth/google/callback`).

Depois, em `apps/api/.env`:

- `GOOGLE_CLIENT_ID`: client ID da credencial Web.
- `GOOGLE_CLIENT_SECRET`: client secret da mesma credencial.
- `TOKEN_ENCRYPTION_KEY`: chave dedicada de cifra dos tokens, no mínimo 32 caracteres. Trocá-la torna
  ilegíveis os tokens já gravados e obriga a reconectar a conta.
- `APP_BASE_URL`: origem do front, `http://localhost:1995` por padrão. É o que monta o redirect URI e
  o link de volta na descrição do evento.

## Desenvolvimento

```sh
bun install
bun db:up
bun db:migrate
bun dev
```

## Estrutura

- `apps/api` — API Hono + oRPC, banco com Drizzle e observability com `@juicerq/trail`.
- `apps/web` — React + Vite + TanStack Router + TanStack Query.
- `apps/tests` — testes de integração in-process com rollback por transação.
- `apps/e2e` — testes Playwright com browser, API e Postgres reais.
- `deploy/` — imagens, compose e arquivo de domínio do Caddy usados em produção.

Os nomes, OABs e processos que aparecem em seeds e fixtures são fictícios.

## Deploy

A publicação roda por trás do Caddy que já serve os outros sites da VPS. As imagens são construídas
na máquina local e enviadas por `docker save`, sem registry:

```sh
KW_LAWYER_ACCESS_USER=... KW_LAWYER_ACCESS_PASSWORD=... bun run deploy:vps
```

O script constrói `deploy/Dockerfile.api` e `deploy/Dockerfile.web`, carrega as duas imagens na VPS,
sobe `deploy/compose.yaml` (Postgres, migrations, API e o estático no nginx), instala
`deploy/kw-lawyer.caddy` como domínio e recarrega o Caddy. O `.env` de produção é gerado na primeira
execução e fica só na VPS.

## Estado atual

Funciona ponta a ponta contra dado real do CNJ. Gate de acesso, login por OAB + UF, sincronização DJEN + DataJud,
inbox de publicações, painel de processos com timeline, e a `/agenda`, que lê prazo das publicações,
conta pelo calendário forense do tribunal e separa o que é prazo da advogada do que é prazo de
perito, contador ou serventia. Da agenda sai o envio do recorte escolhido para o Google Agenda.

O que cada entrega deixou de pé, com números e limitações, está em `.koworker/tasks/`.
