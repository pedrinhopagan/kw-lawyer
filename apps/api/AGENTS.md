# AGENTS.md — apps/api

Apenas quando for implementar, ler o `AGENTS.md` da área:

- Router (delegators): [`src/router/AGENTS.md`](./src/router/AGENTS.md)
- Features (lógica/managers): [`src/features/AGENTS.md`](./src/features/AGENTS.md)
- Banco de dados: [`src/db/AGENTS.md`](./src/db/AGENTS.md)

## Observability

- `enrich/escalate/suppress` do `@juicerq/observability` preferido sobre `console.log`.
- Request context já está populado pelo middleware do Hono. Procedures só precisam `enrich({...})` campos custom.
- `escalate("warn" | "error")` para subir severidade quando a lógica detectar algo pior do que o HTTP status indica.
- `suppress()` para eventos que não devem ser persistidos (polling ruidoso).
