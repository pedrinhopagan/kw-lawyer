# AGENTS.md — apps/api/src/features

## Managers

- Cada feature é uma pasta com `manager.ts`. Pode ter nested por domínio (ex: `notifications/local/manager.ts`, `notifications/emails/manager.ts`).
- `manager.ts` exporta `class <PascalCase>Manager` (ex: `CaseManager`) com `constructor(private db: Db | Tx)`.
- Todos os métodos usam `this.db`. Nunca importar o `db` singleton de `src/db/client.ts` — tx dos testes (`withRollback`) não isola se manager usar singleton.
- Manager concentra lógica de negócio + acesso ao banco.
- Router instancia por request: `new FooManager(context.db).method(...)`. `context.db` é `Db` em prod e `Tx` em testes.
- Errors via `throw new ORPCError("CODE", { message: "..." })` do `@orpc/server`. Mensagem em pt-br.
- Eventos de subscription usam `createRealtimeChannel` de `src/realtime.ts`, com `id` automático por evento.
- Cada feature cria um `realtime.ts` pequeno com o canal tipado, ex: `export const syncRealtime = createRealtimeChannel<{ runId: string }>()`.
- Mutation que altera estado publica evento dentro do manager, depois da escrita no banco.
- Credencial de terceiro guardada no banco vai cifrada por chave dedicada em env própria, nunca por chave derivada de outro segredo: rotacionar aquele segredo não pode inutilizar o que já está gravado.
- Manager expõe `live(signal)` e `events(signal)`.

## Classificação derivada por processo

- Eixo derivado (decisões, provas, incidentes) não é cadastrado à mão: um classificador puro em
  `classify.ts` lê `movements` + `publications` e o manager grava o resultado.
- A varredura é por processo e usa `features/legal/case-scan.ts`: `staleCaseIds` escolhe o que
  reprocessar (motor mais novo ou processo movimentado depois do último scan), `caseSources` carrega
  as fontes em lote e `recordCaseScan` registra a versão do motor em `case_scans`.
- Linha derivada é chaveada por `movementId`. O upsert usa `setWhere: eq(table.origin, "automatico")`
  e a poda usa `notInArray(movementId, kept)`: correção e descarte da advogada (`origin = 'manual'`,
  `dismissedAt`) sobrevivem a qualquer reprocessamento.
- Fonte sem teor não vira linha. Movimento do DataJud só entra quando o código do TPU já diz o que
  aconteceu; o resto depende do texto da publicação.
- O mesmo ato publicado para cada destinatário entra uma vez: `features/legal/repeats.ts` monta a
  chave do ato ignorando republicação e cauda de destinatário. `live` emite estado atual + próximos eventos mapeados. `events` emite eventos incrementais com `id`.
