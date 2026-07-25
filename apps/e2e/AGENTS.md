# AGENTS.md — apps/e2e

## Padrão

E2E testa fluxo completo: browser → Vite → proxy → API → Postgres. Isolamento entre testes via `TRUNCATE` na fixture auto-aplicada.

## Regras

- Importar `test` e `expect` de `../playwright/fixtures.ts`. NUNCA de `@playwright/test`.
- Fixture `cleanDb` é `{ auto: true }` — truncate roda automático. Não registrar `beforeEach(truncateAll)`.
- Fixture `api` (cliente oRPC tipado) pra setup rápido ou verificação. Padrão híbrido: setup via `api`, ação+verificação via UI.
- Fixture `scenario` semeia a advogada de referência já sincronizada com o cenário do stub. Pedir quando o teste precisa de publicações e processos prontos antes do login.
- O worker do Playwright roda em Node, não em Bun. Nada de código da API que use `Bun.*` dentro do processo de teste: o seed roda em subprocesso `bun` (`playwright/seed-scenario.ts`).
- Assertions Playwright são sempre awaitadas no locator: `await expect(locator).toHaveText(...)`. Nunca `expect(await locator.textContent()).toBe(...)` — perde retry automático.
- Selectors por `getByRole`, `getByText`, `getByLabel`. Evitar CSS selectors frágeis.
- Quando adicionar spec novo, criar em arquivo próprio — Playwright shard divide por arquivo.

## Setup

- `bun run test:e2e` sobe Postgres (compose de `apps/tests/`, porta `5445`), cria o DB `lawyer_e2e`, migra, sobe api em `:3001` e web em `:5174`. Tudo via `playwright/api-boot.ts`.
- Nenhum teste toca a rede do CNJ. `playwright/cnj-stub.ts` serve DJEN e DataJud em `:3002` e a config aponta `DJEN_BASE_URL` e `DATAJUD_BASE_URL` pra ele. O cenário (advogada, processos, publicações, andamentos) mora nesse arquivo e é a fonte única que os specs importam.
- CI paraleliza via shards (`.github/workflows/e2e.yml`).

## Comandos

- `bun run test:e2e` — suite completa.
- `bun run test:e2e:ui` — modo interativo (Playwright UI).
