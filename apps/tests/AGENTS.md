# AGENTS.md — apps/tests

## Padrão

Testes rodam in-process contra API real + Postgres real. Isolamento via transaction rollback — cada teste abre tx, faz asserts, rollback no final. MVCC garante que testes concorrentes não se veem.

## Regras

- Testes que tocam DB envolvem `withRollback(async (tx) => { ... })` de `src/utils/db.ts`.
- Client oRPC in-process via `createTestClient(tx)` de `src/utils/orpc.ts`. Nunca HTTP.
- Dentro do `withRollback`, usar APENAS `tx.*` ou client derivado de `tx`. Chamar `db.*` (singleton) quebra isolamento — commita fora da transação.
- Assertions de narrowing (`assertDefined`, `assertIsInstanceOf`) em `src/utils/assertions.ts`. Reuso > novo.
- `test.concurrent` é o default — tx rollback garante safety.

## Setup

- Postgres auto-sobe via docker-compose no preload (`bunfig.toml`).
- A cada run: drop schema public+drizzle, migrate.

## Comandos

- `bun run test` — suite completa (concurrent).
- `bun run test:watch` — watch mode.
- `bun run test:only` — só `test.only`.
