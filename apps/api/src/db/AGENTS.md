# AGENTS.md — apps/api/src/db

## Schemas

- Um arquivo por feature em `schema/*.ts`.
- Colunas no banco em `snake_case`, props do schema em `camelCase` (ex: `updatedAt: timestamp("updated_at")`).
- `updatedAt` em toda tabela que é mutável, com `defaultNow().$onUpdate(() => new Date())`. O `$onUpdate` injeta `new Date()` automaticamente em todo `db.update()` — nunca setar manualmente no `.set()`.

## Migrations

- Versionadas em `apps/api/drizzle/`. Commit obrigatório junto com mudança de schema.
- Nunca `bun db:push`. Só `db:generate` + `db:migrate`. Schema history existe no git.
- Se `drizzle-kit generate` criar DROP+ADD por rename, editar o `.sql` à mão para virar `RENAME`.

## Query builder

- Sempre `db.select()`, `db.insert()`, `db.update()`. Nunca API relational (`.query.X.findMany()`).
